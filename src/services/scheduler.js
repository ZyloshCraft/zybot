import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendStealthMessage } from '../utils/stealth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEDULE_FILE = path.resolve(__dirname, '../../scheduled_messages.json');

let scheduledCache = null;
let intervalId = null;

export function loadScheduled() {
  try {
    if (fs.existsSync(SCHEDULE_FILE)) {
      const raw = fs.readFileSync(SCHEDULE_FILE, 'utf-8');
      scheduledCache = JSON.parse(raw);
    } else {
      scheduledCache = [];
      saveScheduled(scheduledCache);
    }
  } catch (err) {
    console.error('Erreur lors du chargement des messages programmés:', err);
    scheduledCache = [];
  }
  return scheduledCache;
}

export function saveScheduled(items) {
  try {
    scheduledCache = items;
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erreur lors de la sauvegarde des messages programmés:', err);
  }
}

export function parseScheduledTime(str) {
  const now = new Date();
  const trimmed = str.trim();

  // 1. Format relatif (+10m, +2h, +30s, +1d, +1j)
  const relMatch = trimmed.match(/^\+(\d+)\s*(s|m|h|j|d)$/i);
  if (relMatch) {
    const val = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const mult = { s: 1000, m: 60000, h: 3600000, j: 86400000, d: 86400000 }[unit];
    return new Date(now.getTime() + val * mult);
  }

  // 2. Format complet JJ/MM/AAAA HH:MM ou JJ/MM HH:MM
  const fullMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s+(\d{1,2}):(\d{2})$/);
  if (fullMatch) {
    const day = parseInt(fullMatch[1], 10);
    const month = parseInt(fullMatch[2], 10) - 1;
    const year = fullMatch[3] ? parseInt(fullMatch[3], 10) : now.getFullYear();
    const hour = parseInt(fullMatch[4], 10);
    const min = parseInt(fullMatch[5], 10);
    return new Date(year, month, day, hour, min, 0);
  }

  // 3. Format heure seule HH:MM (aujourd'hui ou demain si dépassée)
  const timeOnly = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (timeOnly) {
    const hour = parseInt(timeOnly[1], 10);
    const min = parseInt(timeOnly[2], 10);
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target;
  }

  return null;
}

export function addScheduledMessage({ jid, message, targetTimestamp, formattedDate }) {
  const list = loadScheduled();
  const newItem = {
    id: `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    jid,
    message,
    targetTimestamp,
    formattedDate,
    createdAt: Date.now()
  };
  list.push(newItem);
  saveScheduled(list);
  return newItem;
}

export function removeScheduledMessage(id) {
  const list = loadScheduled();
  const index = list.findIndex((item) => item.id === id || item.id.endsWith(id));
  if (index === -1) return false;
  list.splice(index, 1);
  saveScheduled(list);
  return true;
}

export function listScheduledMessages() {
  return loadScheduled();
}

/**
 * Lance le vérificateur de messages programmés
 */
export function startScheduler(getSocket) {
  if (intervalId) return;

  loadScheduled();
  console.log('⏰ Service de programmation de messages démarré.');

  intervalId = setInterval(async () => {
    const sock = getSocket();
    if (!sock) return;

    const list = loadScheduled();
    const now = Date.now();
    const dueItems = list.filter((item) => item.targetTimestamp <= now);

    if (!dueItems.length) return;

    for (const item of dueItems) {
      try {
        console.log(`[Scheduler] Envoi du message programmé (${item.id}) vers ${item.jid}`);
        await sendStealthMessage(sock, item.jid, { text: item.message });
      } catch (err) {
        console.error(`[Scheduler] Erreur lors de l'envoi du message programmé ${item.id}:`, err);
      }
    }

    // Retirer les éléments envoyés
    const remaining = list.filter((item) => item.targetTimestamp > now);
    saveScheduled(remaining);
  }, 5000);
}
