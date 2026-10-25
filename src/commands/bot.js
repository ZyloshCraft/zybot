import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replyOrEditTemporary } from '../utils/stealth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_PATH = path.resolve(__dirname, '../../package.json');

const startTime = Date.now();

export function getBotVersion() {
  try {
    if (fs.existsSync(PACKAGE_PATH)) {
      const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf-8'));
      if (pkg.version) {
        return pkg.version.startsWith('v') ? pkg.version : `v${pkg.version}`;
      }
    }
  } catch (e) {}
  return 'v1.10';
}

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
    const version = getBotVersion();

    const text = [
      `🤖 *ZyBot* (${version})`,
      'Statut : Opérationnel',
      `Version : ${version}`,
      `Uptime : ${formatUptime(uptimeSec)}`,
      `RAM : ${heapUsedMb} MB`,
      `Latence : ${latency} ms`,
      `Plateforme : Node.js ${process.version}`
    ].join('\n');

    await replyOrEditTemporary(sock, jid, msg, text, 5000);
  }
};
