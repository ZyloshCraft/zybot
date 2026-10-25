import { getConfig, updateConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { notifySystem } from '../services/notifier.js';

export default {
  name: 'alert',
  aliases: ['alerte'],
  description: 'Gère les alertes de mots-clés dans les groupes et chats',
  async execute({ sock, msg, jid, args }) {
    const config = getConfig();
    const alerts = config.alerts || { enabled: true, strict: true, words: [], blacklist: [] };
    const sub = args[0]?.toLowerCase();

    // Vérifier si un message est cité pour en extraire le numéro
    const msgContent = msg.message;
    const contextInfo =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;
    const quotedSender = contextInfo?.participant || contextInfo?.remoteJid;

    // 1. Lister les mots-clés (/alert list ou sans argument)
    if (!sub || sub === 'list') {
      const words = alerts.words || [];
      const blacklist = alerts.blacklist || [];
      const isStrict = alerts.strict !== false;
      const lines = [
        `🚨 *Alertes mots-clés :* ${alerts.enabled ? 'Actif' : 'Inactif'}`,
        `🎯 *Mode strict :* ${isStrict ? 'Actif (mot entier uniquement)' : 'Inactif (sous-chaîne large)'}`,
        `🚫 *Blacklist anti-troll :* ${blacklist.length} personne(s) ignorée(s)`,
        '━━━━━━━━━━━━━━━━━━━━'
      ];

      if (words.length === 0) {
        lines.push('(aucun mot-clé configuré)');
      } else {
        words.forEach((w, i) => lines.push(`${i + 1}. ${w}`));
      }

      if (blacklist.length > 0) {
        lines.push('━━━━━━━━━━━━━━━━━━━━');
        lines.push('🚫 *Numéros ignorés :*');
        blacklist.forEach((b, i) => lines.push(`• +${b}`));
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━');
      lines.push('💡 Astuce : `/alert ignore <numéro>` pour bloquer un troll qui spamme.');

      await replyOrEdit(sock, jid, msg, lines.join('\n'));
      return;
    }

    // 2. Activer / Désactiver
    if (sub === 'on') {
      updateConfig((prev) => ({
        ...prev,
        alerts: { ...prev.alerts, enabled: true }
      }));
      await notifySystem(sock, '✅ Alertes mots-clés : activées');
      await replyOrEdit(sock, jid, msg, 'Alertes activées');
      return;
    }

    if (sub === 'off') {
      updateConfig((prev) => ({
        ...prev,
        alerts: { ...prev.alerts, enabled: false }
      }));
      await notifySystem(sock, '🗑️ Alertes mots-clés : désactivées');
      await replyOrEdit(sock, jid, msg, 'Alertes désactivées');
      return;
    }

    // 3. Gestion du mode strict : /alert strict [on|off]
    if (sub === 'strict') {
      const opt = args[1]?.toLowerCase();
      if (opt === 'off' || opt === 'false' || opt === 'souple') {
        updateConfig((prev) => ({
          ...prev,
          alerts: { ...prev.alerts, strict: false }
        }));
        await notifySystem(sock, '⚠️ Mode strict mots-clés : désactivé (sous-chaînes autorisées)');
        await replyOrEdit(sock, jid, msg, '⚠️ Mode strict désactivé : les mots-clés matcheront aussi à l\'intérieur d\'autres mots.');
        return;
      }

      if (opt === 'on' || opt === 'true' || opt === 'actif') {
        updateConfig((prev) => ({
          ...prev,
          alerts: { ...prev.alerts, strict: true }
        }));
        await notifySystem(sock, '✅ Mode strict mots-clés : activé (mots entiers uniquement)');
        await replyOrEdit(sock, jid, msg, '✅ Mode strict activé : les mots rattachés (ex: "valise" ou "vallée" pour "val") ne déclencheront plus d\'alerte !');
        return;
      }

      const isStrict = alerts.strict !== false;
      await replyOrEdit(sock, jid, msg, `Mode strict actuel : *${isStrict ? 'Actif' : 'Inactif'}*\nUsage : \`/alert strict on\` ou \`/alert strict off\``);
      return;
    }

    // 4. Blacklist anti-troll : /alert ignore <numéro> ou /alert blacklist <add|del|list>
    if (sub === 'ignore' || sub === 'blacklist' || sub === 'block') {
      const action = args[1]?.toLowerCase();
      let targetNumber = args[2] || (action && action !== 'add' && action !== 'del' && action !== 'list' ? args[1] : null);

      // Si un message est cité, utiliser l'expéditeur du message cité
      if (!targetNumber && quotedSender) {
        targetNumber = quotedSender.split('@')[0].split(':')[0];
      }

      const currentBlacklist = (alerts.blacklist || []).map((n) => String(n).replace(/[^0-9]/g, ''));

      // Lister
      if (action === 'list' || (!targetNumber && sub === 'blacklist')) {
        if (!currentBlacklist.length) {
          await replyOrEdit(sock, jid, msg, '🚫 Aucun numéro dans la blacklist anti-troll.');
        } else {
          const listLines = ['🚫 *Blacklist Alertes (Personnes ignorées) :*'];
          currentBlacklist.forEach((b, i) => listLines.push(`${i + 1}. +${b}`));
          await replyOrEdit(sock, jid, msg, listLines.join('\n'));
        }
        return;
      }

      // Nettoyer le numéro
      const cleanNum = targetNumber ? targetNumber.replace(/[^0-9]/g, '') : null;
      if (!cleanNum || cleanNum.length < 5) {
        await replyOrEdit(sock, jid, msg, 'Usage : Répondez au message d\'un troll avec `/alert ignore`, ou tapez `/alert ignore <numéro>` (ex: `/alert ignore 33612345678`).');
        return;
      }

      const isDel = action === 'del' || action === 'remove' || action === 'rm' || sub === 'unignore';

      if (isDel) {
        const filtered = currentBlacklist.filter((b) => b !== cleanNum);
        updateConfig((prev) => ({
          ...prev,
          alerts: { ...prev.alerts, blacklist: filtered }
        }));
        await notifySystem(sock, `🗑️ Numéro retiré de la blacklist alertes : +${cleanNum}`);
        await replyOrEdit(sock, jid, msg, `✅ Le numéro +${cleanNum} a été retiré de la blacklist.`);
        return;
      }

      if (currentBlacklist.includes(cleanNum)) {
        await replyOrEdit(sock, jid, msg, `Le numéro +${cleanNum} est déjà dans la blacklist.`);
        return;
      }

      updateConfig((prev) => ({
        ...prev,
        alerts: { ...prev.alerts, blacklist: [...currentBlacklist, cleanNum] }
      }));
      await notifySystem(sock, `✅ Numéro ajouté à la blacklist alertes : +${cleanNum}`);
      await replyOrEdit(sock, jid, msg, `🚫 Le numéro +${cleanNum} a été ajouté à la blacklist anti-troll ! Ses messages ne déclencheront plus jamais d'alerte.`);
      return;
    }

    if (sub === 'unignore') {
      let targetNumber = args[1];
      if (!targetNumber && quotedSender) {
        targetNumber = quotedSender.split('@')[0].split(':')[0];
      }
      const cleanNum = targetNumber ? targetNumber.replace(/[^0-9]/g, '') : null;
      if (!cleanNum) {
        await replyOrEdit(sock, jid, msg, 'Usage : `/alert unignore <numéro>` ou en réponse à un message.');
        return;
      }
      const currentBlacklist = (alerts.blacklist || []).map((n) => String(n).replace(/[^0-9]/g, ''));
      const filtered = currentBlacklist.filter((b) => b !== cleanNum);
      updateConfig((prev) => ({
        ...prev,
        alerts: { ...prev.alerts, blacklist: filtered }
      }));
      await notifySystem(sock, `🗑️ Numéro retiré de la blacklist alertes : +${cleanNum}`);
      await replyOrEdit(sock, jid, msg, `✅ Le numéro +${cleanNum} a été retiré de la blacklist.`);
      return;
    }

    // 5. Ajouter un mot
    if (sub === 'add') {
      const word = args.slice(1).join(' ').trim().toLowerCase();
      if (!word) {
        await replyOrEdit(sock, jid, msg, 'Usage : /alert add <mot>');
        return;
      }

      const existing = (alerts.words || []).map((w) => w.toLowerCase());
      if (existing.includes(word)) {
        await replyOrEdit(sock, jid, msg, `Déjà présent : ${word}`);
        return;
      }

      updateConfig((prev) => ({
        ...prev,
        alerts: { ...prev.alerts, words: [...existing, word] }
      }));
      await notifySystem(sock, `✅ Mot-clé : ${word}`);
      await replyOrEdit(sock, jid, msg, `Mot-clé ajouté : ${word}`);
      return;
    }

    // 6. Supprimer un mot
    if (sub === 'del' || sub === 'remove' || sub === 'rm') {
      const word = args.slice(1).join(' ').trim().toLowerCase();
      if (!word) {
        await replyOrEdit(sock, jid, msg, 'Usage : /alert del <mot>');
        return;
      }

      const existing = (alerts.words || []).map((w) => w.toLowerCase());
      const filtered = existing.filter((w) => w !== word);

      if (filtered.length === existing.length) {
        await replyOrEdit(sock, jid, msg, `Introuvable : ${word}`);
        return;
      }

      updateConfig((prev) => ({
        ...prev,
        alerts: { ...prev.alerts, words: filtered }
      }));
      await notifySystem(sock, `🗑️ Mot-clé : ${word} supprimé`);
      await replyOrEdit(sock, jid, msg, `Mot-clé retiré : ${word}`);
      return;
    }

    // 7. Clear
    if (sub === 'clear') {
      updateConfig((prev) => ({
        ...prev,
        alerts: { ...prev.alerts, words: [] }
      }));
      await notifySystem(sock, '🗑️ Mots-clés : tous les mots-clés ont été supprimés');
      await replyOrEdit(sock, jid, msg, 'Tous les mots-clés ont été effacés');
      return;
    }

    await replyOrEdit(sock, jid, msg, 'Usage : /alert [list|add|del|strict|ignore|unignore|on|off]');
  }
};
