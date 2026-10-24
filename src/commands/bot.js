import os from 'node:os';
import { replyOrEditTemporary } from '../utils/stealth.js';

const startTime = Date.now();

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (d > 0) parts.push(`${d}j`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export default {
  name: 'bot',
  description: 'Infos techniques directes (auto-supprimé après 5s hors du chat perso)',
  async execute({ sock, msg, jid }) {
    const startPing = Date.now();
    const mem = process.memoryUsage();
    const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
    const latency = Date.now() - startPing;
    const heapUsedMb = (mem.heapUsed / 1024 / 1024).toFixed(1);

    const text = [
      'Statut : Opérationnel',
      `Uptime : ${formatUptime(uptimeSec)}`,
      `RAM : ${heapUsedMb} MB`,
      `Latence : ${latency} ms`,
      `Plateforme : Node.js ${process.version}`
    ].join('\n');

    await replyOrEditTemporary(sock, jid, msg, text, 5000);
  }
};
