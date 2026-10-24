import { spawn } from 'node:child_process';
import { replyOrEdit } from '../utils/stealth.js';

export default {
  name: 'reboot',
  aliases: ['restart'],
  description: 'Redémarre le bot pour recharger immédiatement toutes les modifications',
  async execute({ sock, msg, jid }) {
    await replyOrEdit(sock, jid, msg, 'Redémarrage en cours...');

    setTimeout(async () => {
      try {
        await sock.sendMessage(jid, { delete: msg.key });
      } catch (e) {}

      console.log('🔄 Relance du processus pour application des modifications (/reboot)...');
      const child = spawn(process.argv[0], process.argv.slice(1), {
        cwd: process.cwd(),
        detached: true,
        stdio: 'inherit'
      });
      child.unref();
      process.exit(0);
    }, 1500);
  }
};
