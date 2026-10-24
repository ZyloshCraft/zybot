import { getConfig, updateConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { checkAndApplyUpdate } from '../services/autoUpdater.js';

export default {
  name: 'update',
  aliases: ['maj', 'upgrade'],
  description: 'Vérifie et applique les mises à jour depuis GitHub (/update ou /update [on|off])',
  async execute({ sock, msg, jid, args }) {
    const sub = args[0]?.toLowerCase().trim();

    if (sub === 'on') {
      updateConfig((prev) => ({
        ...prev,
        autoUpdate: { ...(prev.autoUpdate || {}), enabled: true }
      }));
      await replyOrEdit(sock, jid, msg, '🔄 Mises à jour automatiques activées (vérification toutes les minutes).');
      return;
    }

    if (sub === 'off') {
      updateConfig((prev) => ({
        ...prev,
        autoUpdate: { ...(prev.autoUpdate || {}), enabled: false }
      }));
      await replyOrEdit(sock, jid, msg, '⏸️ Mises à jour automatiques désactivées.');
      return;
    }

    await replyOrEdit(sock, jid, msg, '🔍 Vérification des mises à jour sur GitHub...');
    const result = await checkAndApplyUpdate(sock, true);

    if (!result.updated) {
      await replyOrEdit(sock, jid, msg, `✅ ${result.message}`);
    }
  }
};
