import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendStealthMessage } from '../utils/stealth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEDULE_FILE = path.resolve(__dirname, '../../scheduled_messages.json');
const MEDIA_DIR = path.resolve(__dirname, '../../scheduled_media');

let scheduledCache = null;
let intervalId = null;

export function ensureMediaDir() {
  try {
    if (!fs.existsSync(MEDIA_DIR)) {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('[Scheduler] Impossible de créer le répertoire média:', err);
  }
  return MEDIA_DIR;
}

export function saveMediaBuffer({ id, buffer, fileName, mimetype, type = 'image', ptt = false }) {
  ensureMediaDir();
  const ext = path.extname(fileName || '') || (type === 'image' ? '.jpg' : type === 'video' ? '.mp4' : type === 'audio' ? '.mp3' : '.bin');
  const safeBase = (fileName || 'media').replace(/[^a-zA-Z0-9._-]/g, '_');
  const diskFileName = `${id}_${Date.now()}_${safeBase}`;
  const diskPath = path.join(MEDIA_DIR, diskFileName);

  fs.writeFileSync(diskPath, buffer);

  return {
    type,
    fileName: fileName || safeBase,
    diskFileName,
    mimetype: mimetype || 'application/octet-stream',
    size: buffer.length,
    path: diskPath,
    ptt: Boolean(ptt)
  };
}

export function saveMediaBase64({ id, fileName, mimetype, base64, type = 'image', ptt = false }) {
  if (!base64) return null;
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  return saveMediaBuffer({ id, buffer, fileName, mimetype, type, ptt });
}

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
  const trimmed = (str || '').trim();

  // 1. Format relatif (+10m, +2h, +30s, +1d, +1j)
  const relMatch = trimmed.match(/^\+(\d+)\s*(s|m|h|j|d)$/i);
  if (relMatch) {
    const val = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const mult = { s: 1000, m: 60000, h: 3600000, j: 86400000, d: 86400000 }[unit];
    return new Date(now.getTime() + val * mult);
  }

  // 2. Format ISO ou date HTML input (2026-11-24T14:30)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    const parsedIso = new Date(trimmed);
    if (!isNaN(parsedIso.getTime())) {
      return parsedIso;
    }
  }

  // 3. Format complet JJ/MM/AAAA HH:MM ou JJ/MM HH:MM
  const fullMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s+(\d{1,2}):(\d{2})$/);
  if (fullMatch) {
    const day = parseInt(fullMatch[1], 10);
    const month = parseInt(fullMatch[2], 10) - 1;
    const year = fullMatch[3] ? parseInt(fullMatch[3], 10) : now.getFullYear();
    const hour = parseInt(fullMatch[4], 10);
    const min = parseInt(fullMatch[5], 10);
    return new Date(year, month, day, hour, min, 0);
  }

  // 4. Format heure seule HH:MM (aujourd'hui ou demain si dépassée)
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

export function addScheduledMessage({
  jid,
  message = '',
  targetTimestamp,
  formattedDate = '',
  targetName = '',
  media = null
}) {
  const list = loadScheduled();
  const id = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let finalMedia = null;
  if (media) {
    // Si media contient déjà un path sur le disque
    if (media.path && fs.existsSync(media.path)) {
      finalMedia = media;
    } else if (media.base64) {
      finalMedia = saveMediaBase64({
        id,
        fileName: media.fileName,
        mimetype: media.mimetype,
        base64: media.base64,
        type: media.type,
        ptt: media.ptt
      });
    } else if (media.buffer) {
      finalMedia = saveMediaBuffer({
        id,
        buffer: media.buffer,
        fileName: media.fileName,
        mimetype: media.mimetype,
        type: media.type,
        ptt: media.ptt
      });
    }
  }

  const d = new Date(targetTimestamp);
  const prettyDate = formattedDate || d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const newItem = {
    id,
    jid,
    targetName: targetName || (jid.endsWith('@g.us') ? 'Groupe' : `+${jid.split('@')[0]}`),
    message: message || '',
    targetTimestamp,
    formattedDate: prettyDate,
    media: finalMedia,
    createdAt: Date.now()
  };

  list.push(newItem);
  saveScheduled(list);
  return newItem;
}

export function getScheduledMessage(id) {
  const list = loadScheduled();
  return list.find((item) => item.id === id || item.id.endsWith(id)) || null;
}

export function removeScheduledMessage(id) {
  const list = loadScheduled();
  const index = list.findIndex((item) => item.id === id || item.id.endsWith(id));
  if (index === -1) return false;

  const [removed] = list.splice(index, 1);
  if (removed?.media?.path) {
    try {
      if (fs.existsSync(removed.media.path)) {
        fs.unlinkSync(removed.media.path);
      }
    } catch (e) {
      console.warn(`[Scheduler] Nettoyage fichier média annulé (${removed.media.path}):`, e.message);
    }
  }

  saveScheduled(list);
  return true;
}

export function listScheduledMessages() {
  const list = loadScheduled();
  const now = Date.now();
  return list.map((item) => {
    const remainingMs = Math.max(0, item.targetTimestamp - now);
    return {
      ...item,
      remainingMs,
      hasMedia: Boolean(item.media && item.media.path && fs.existsSync(item.media.path))
    };
  });
}

/**
 * Envoie un message programmé (avec média réel ou texte)
 */
export async function dispatchScheduledMessage(sock, item) {
  if (!sock) throw new Error('Socket WhatsApp indisponible');

  let payload = null;
  const hasMedia = item.media && item.media.path && fs.existsSync(item.media.path);

  if (hasMedia) {
    const buffer = fs.readFileSync(item.media.path);
    const mType = (item.media.type || 'image').toLowerCase();

    if (mType === 'image') {
      payload = {
        image: buffer,
        caption: item.message || '',
        mimetype: item.media.mimetype || 'image/jpeg'
      };
    } else if (mType === 'video') {
      payload = {
        video: buffer,
        caption: item.message || '',
        mimetype: item.media.mimetype || 'video/mp4'
      };
    } else if (mType === 'audio') {
      payload = {
        audio: buffer,
        mimetype: item.media.mimetype || 'audio/mp4',
        ptt: Boolean(item.media.ptt)
      };
    } else if (mType === 'document') {
      payload = {
        document: buffer,
        mimetype: item.media.mimetype || 'application/octet-stream',
        fileName: item.media.fileName || 'document',
        caption: item.message || ''
      };
    } else if (mType === 'sticker') {
      payload = {
        sticker: buffer
      };
    } else {
      payload = { text: item.message || '' };
    }
  } else {
    payload = { text: item.message || '' };
  }

  console.log(`[Scheduler] 🚀 Envoi en cours (${item.id}) vers ${item.jid} [Média: ${hasMedia ? item.media.type : 'aucun'}]`);
  const sent = await sendStealthMessage(sock, item.jid, payload);

  // Si c'est un audio ou sticker et qu'un message texte séparé est fourni, l'envoyer à la suite
  if (hasMedia && (item.media.type === 'audio' || item.media.type === 'sticker') && item.message && item.message.trim()) {
    try {
      await sendStealthMessage(sock, item.jid, { text: item.message.trim() });
    } catch (e) {
      console.warn('[Scheduler] Échec envoi texte secondaire:', e.message);
    }
  }

  // Nettoyage immédiat du fichier média temporaire après envoi réussi
  if (hasMedia && item.media?.path) {
    try {
      if (fs.existsSync(item.media.path)) {
        fs.unlinkSync(item.media.path);
      }
    } catch (cleanErr) {
      console.warn(`[Scheduler] Impossible de supprimer le média ${item.media.path}:`, cleanErr.message);
    }
  }

  return sent;
}

/**
 * Force l'envoi immédiat d'un message programmé depuis le SuperAdmin
 */
export async function forceSendScheduledMessage(id, getSocket) {
  const sock = typeof getSocket === 'function' ? getSocket() : getSocket;
  if (!sock) throw new Error('Client WhatsApp non connecté');

  const item = getScheduledMessage(id);
  if (!item) throw new Error(`Message programmé introuvable avec l'ID ${id}`);

  await dispatchScheduledMessage(sock, item);

  // Retirer de la liste programmée
  const list = loadScheduled();
  const nextList = list.filter((m) => m.id !== item.id);
  saveScheduled(nextList);

  return item;
}

/**
 * Lance le vérificateur automatique de messages programmés
 */
export function startScheduler(getSocket) {
  if (intervalId) return;

  loadScheduled();
  ensureMediaDir();
  console.log('⏰ Service de programmation de messages démarré (avec support média enrichi).');

  intervalId = setInterval(async () => {
    const sock = getSocket();
    if (!sock) return;

    const list = loadScheduled();
    const now = Date.now();
    const dueItems = list.filter((item) => item.targetTimestamp <= now);

    if (!dueItems.length) return;

    for (const item of dueItems) {
      try {
        await dispatchScheduledMessage(sock, item);
      } catch (err) {
        console.error(`[Scheduler] Erreur lors de l'envoi du message programmé ${item.id}:`, err);
      }
    }

    // Retirer les éléments envoyés
    const remaining = list.filter((item) => item.targetTimestamp > now);
    saveScheduled(remaining);
  }, 5000);
}
