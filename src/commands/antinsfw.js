import { getConfig, updateConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { notifySystem } from '../services/notifier.js';

export default {
  name: 'antinsfw',
  aliases: ['nsfw', 'filtrensfw'],
  description: 'Active ou désactive le filtre automatique de détection et suppression d\'images NSFW',
  async execute({ sock, msg, jid, args }) {
    const config = getConfig();
    const currentEnabled = config.antiNsfw?.enabled !== false;
    const action = args[0]?.toLowerCase();

    if (!action || action === 'status') {
      const statusText = [
        `🛡️ *Filtre Anti-NSFW (IA Freepik/HuggingFace) :* ${currentEnabled ? '✅ Actif' : '❌ Inactif'}`,
        `🏢 *Périmètre :* Tous les groupes où vous êtes administrateur`,
        `🚨 *Salon d'alerte :* admintaverne (\`120363424594930135@g.us\`)`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `💡 Commandes :`,
        `• \`/antinsfw on\` : Activer le filtre`,
        `• \`/antinsfw off\` : Désactiver le filtre`
      ].join('\n');

      await replyOrEdit(sock, jid, msg, statusText);
      return;
    }

    if (action === 'on') {
      updateConfig((prev) => ({
        ...prev,
        antiNsfw: { ...prev.antiNsfw, enabled: true }
      }));
      await notifySystem(sock, '✅ Filtre Anti-NSFW : Activé');
      await replyOrEdit(sock, jid, msg, '✅ *Filtre Anti-NSFW activé.* Toute image inappropriée dans vos groupes administrés sera supprimée et transmise dans admintaverne.');
      return;
    }

    if (action === 'off') {
      updateConfig((prev) => ({
        ...prev,
        antiNsfw: { ...prev.antiNsfw, enabled: false }
      }));
      await notifySystem(sock, '🗑️ Filtre Anti-NSFW : Désactivé');
      await replyOrEdit(sock, jid, msg, '⏸️ *Filtre Anti-NSFW désactivé.* Les images ne seront plus scannées automatiquement.');
      return;
    }

    await replyOrEdit(sock, jid, msg, 'Usage : `/antinsfw` (statut), `/antinsfw on`, ou `/antinsfw off`.');
  }
};
