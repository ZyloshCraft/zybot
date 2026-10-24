import { getConfig, updateConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { notifySystem } from '../services/notifier.js';

export default {
  name: 'alert',
  aliases: ['alerte'],
  description: 'Gère les alertes de mots-clés dans les groupes et chats',
  async execute({ sock, msg, jid, args }) {
    const config = getConfig();
    const alerts = config.alerts || { enabled: true, words: [] };
    const sub = args[0]?.toLowerCase();

    // 1. Lister les mots-clés (/alert list ou sans argument)
    if (!sub || sub === 'list') {
      const words = alerts.words || [];
      const lines = [
        `Alertes mots-clés : ${alerts.enabled ? 'Actif' : 'Inactif'}`
      ];

      if (words.length === 0) {
        lines.push('(aucun mot-clé configuré)');
      } else {
        words.forEach((w, i) => lines.push(`${i + 1}. ${w}`));
      }

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

    // 3. Ajouter
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

    // 4. Supprimer
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

    // 5. Clear
    if (sub === 'clear') {
      updateConfig((prev) => ({
        ...prev,
        alerts: { ...prev.alerts, words: [] }
      }));
      await notifySystem(sock, '🗑️ Mots-clés : tous les mots-clés ont été supprimés');
      await replyOrEdit(sock, jid, msg, 'Tous les mots-clés ont été effacés');
      return;
    }

    await replyOrEdit(sock, jid, msg, 'Usage : /alert [list|add|del|on|off]');
  }
};
