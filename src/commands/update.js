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

    if (sub === 'force') {
      await replyOrEdit(sock, jid, msg, '⚡ Forçage de la mise à jour GitHub (alignement strict sur origin/main)...');
      try {
        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);
        await execAsync('git fetch origin main');
        await execAsync('git reset --hard origin/main');
        await execAsync('npm install --omit=dev');
        await replyOrEdit(sock, jid, msg, '✅ Alignement forcé sur GitHub terminé avec succès ! Redémarrage...');
        if (sock) sock.end();
        process.exit(0);
      } catch (err) {
        await replyOrEdit(sock, jid, msg, `❌ Échec du forçage : ${err.message}`);
      }
      return;
    }

    await replyOrEdit(sock, jid, msg, '🔍 Vérification des mises à jour sur GitHub...');
    const result = await checkAndApplyUpdate(sock, true);

    if (!result.updated) {
      await replyOrEdit(sock, jid, msg, `✅ ${result.message}`);
    }
  }
};
