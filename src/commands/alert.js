import { getConfig, updateConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { notifySystem } from '../services/notifier.js';

export default {
  name: 'alert',
  aliases: ['alerte'],
  description: 'Gère les alertes de mots-clés dans les groupes et chats',
  async execute({ sock, msg, jid, args }) {
    const config = getConfig();
    const alerts = config.alerts || { enabled: true, strict: true, words: [] };
    const sub = args[0]?.toLowerCase();

    // 1. Lister les mots-clés (/alert list ou sans argument)
    if (!sub || sub === 'list') {
      const words = alerts.words || [];
      const isStrict = alerts.strict !== false;
      const lines = [
        `🚨 *Alertes mots-clés :* ${alerts.enabled ? 'Actif' : 'Inactif'}`,
        `🎯 *Mode strict :* ${isStrict ? 'Actif (mot entier uniquement)' : 'Inactif (sous-chaîne large)'}`,
        '━━━━━━━━━━━━━━━━━━━━'
      ];

      if (words.length === 0) {
        lines.push('(aucun mot-clé configuré)');
      } else {
        words.forEach((w, i) => lines.push(`${i + 1}. ${w}`));
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━');
      lines.push('💡 Astuce : `/alert strict on` pour bloquer les faux positifs (ex: "valise" pour "val").');

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

    // 4. Ajouter
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

    // 5. Supprimer
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

    // 6. Clear
    if (sub === 'clear') {
      updateConfig((prev) => ({
        ...prev,
        alerts: { ...prev.alerts, words: [] }
      }));
      await notifySystem(sock, '🗑️ Mots-clés : tous les mots-clés ont été supprimés');
      await replyOrEdit(sock, jid, msg, 'Tous les mots-clés ont été effacés');
      return;
    }

    await replyOrEdit(sock, jid, msg, 'Usage : /alert [list|add|del|strict|on|off]');
  }
};
