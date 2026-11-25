import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMessageContent, downloadMediaMessage } from '@whiskeysockets/baileys';
import { extractTextFromMessage } from '../handlers/message.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const STATUSES_FILE = path.resolve(ROOT_DIR, 'statuses.json');
const STATUSES_MEDIA_DIR = path.resolve(ROOT_DIR, 'statuses_media');

// Map: senderNumber => Array<{ id, key, sender, senderNumber, pushName, timestamp, type, caption, mimetype, fileName, mediaPath, rawMessage }>
const statusMap = new Map();
const MAX_STATUSES_PER_USER = 25;
const MAX_TOTAL_USERS = 200;
const STATUS_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 heures
let saveTimer = null;

function ensureStatusesMediaDir() {
  if (!fs.existsSync(STATUSES_MEDIA_DIR)) {
    fs.mkdirSync(STATUSES_MEDIA_DIR, { recursive: true });
  }
  return STATUSES_MEDIA_DIR;
}

function loadStatusesFromDisk() {
  try {
    if (!fs.existsSync(STATUSES_FILE)) return;
    const raw = fs.readFileSync(STATUSES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const now = Date.now();
    for (const [num, list] of Object.entries(parsed || {})) {
      if (!Array.isArray(list)) continue;
      const valid = list.filter((s) => now - s.timestamp < STATUS_EXPIRY_MS);
      if (valid.length > 0) {
        statusMap.set(num, valid);
      } else {
        // Nettoyer les médias expirés
        for (const old of list) {
          if (old.mediaPath && fs.existsSync(old.mediaPath)) {
            try { fs.unlinkSync(old.mediaPath); } catch {}
          }
        }
      }
    }
  } catch (err) {
    console.warn('[StatusStore] Erreur chargement statuses.json:', err.message);
  }
}

function scheduleSaveStatuses() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const obj = {};
      for (const [num, list] of statusMap.entries()) {
        // Ne pas sérialiser rawMessage volumineux si déjà sauvegardé ou inutile
        obj[num] = list.map(({ rawMessage, ...rest }) => rest);
      }
      fs.writeFileSync(STATUSES_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[StatusStore] Erreur sauvegarde statuses.json:', err.message);
    }
  }, 1500);
}

// Charger au démarrage
loadStatusesFromDisk();

/**
 * Télécharge et met en cache le média d'un statut sur disque
 */
export async function cacheStatusMedia(entry) {
  if (!entry || !entry.rawMessage) return null;
  if (entry.mediaPath && fs.existsSync(entry.mediaPath)) return entry.mediaPath;
  if (!['image', 'video', 'audio'].includes(entry.type)) return null;

  try {
    ensureStatusesMediaDir();
    const buffer = await downloadMediaMessage(
      { key: entry.key, message: entry.rawMessage },
      'buffer',
      {}
    );
    if (!buffer || !buffer.length) return null;

    const ext =
      entry.type === 'image'
        ? (entry.mimetype?.includes('png') ? '.png' : entry.mimetype?.includes('webp') ? '.webp' : '.jpg')
        : entry.type === 'video'
          ? '.mp4'
          : '.ogg';
    const safeId = String(entry.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `status_${entry.senderNumber}_${safeId}${ext}`;
    const diskPath = path.join(STATUSES_MEDIA_DIR, fileName);

    fs.writeFileSync(diskPath, buffer);
    entry.mediaPath = diskPath;
    entry.fileName = fileName;
    scheduleSaveStatuses();
    return diskPath;
  } catch (err) {
    // Silencieux si expiré ou non téléchargeable en test
    return null;
  }
}

/**
 * Enregistre un nouveau statut WhatsApp posté et pré-télécharge son média si possible
 * @param {object} msg - Objet message Baileys brut
 * @param {object} [sock] - Socket Baileys optionnel pour pré-télécharger le média
 */
export function trackStatus(msg, sock = null) {
  if (!msg || !msg.message) return;

  const senderJid = msg.key.participant || msg.participant;
  if (!senderJid) return;

  const senderNumber = senderJid.split('@')[0].split(':')[0];
  const normalized = normalizeMessageContent(msg.message) || msg.message;

  let type = 'text';
  let caption = '';
  let mimetype = null;

  if (normalized.imageMessage) {
    type = 'image';
    caption = normalized.imageMessage.caption || '';
    mimetype = normalized.imageMessage.mimetype || 'image/jpeg';
  } else if (normalized.videoMessage) {
    type = 'video';
    caption = normalized.videoMessage.caption || '';
    mimetype = normalized.videoMessage.mimetype || 'video/mp4';
  } else if (normalized.audioMessage) {
    type = 'audio';
    mimetype = normalized.audioMessage.mimetype || 'audio/mp4';
  } else {
    caption = extractTextFromMessage(msg.message) || '';
  }

  const timestamp = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();

  const entry = {
    id: msg.key.id,
    key: msg.key,
    sender: senderJid,
    senderNumber,
    pushName: msg.pushName || null,
    timestamp,
    type,
    caption,
    mimetype,
    fileName: null,
    mediaPath: null,
    rawMessage: msg.message
  };

  if (!statusMap.has(senderNumber)) {
    if (statusMap.size >= MAX_TOTAL_USERS) {
      const oldestKey = statusMap.keys().next().value;
      const oldList = statusMap.get(oldestKey) || [];
      for (const old of oldList) {
        if (old.mediaPath && fs.existsSync(old.mediaPath)) {
          try { fs.unlinkSync(old.mediaPath); } catch {}
        }
      }
      statusMap.delete(oldestKey);
    }
    statusMap.set(senderNumber, []);
  }

  const userList = statusMap.get(senderNumber);

  // Éviter les doublons par ID
  if (userList.some((s) => s.id === entry.id)) return;

  userList.push(entry);

  // Nettoyer les statuts plus vieux que 24h
  const now = Date.now();
  const valid = [];
  for (const s of userList) {
    if (now - s.timestamp < STATUS_EXPIRY_MS) {
      valid.push(s);
    } else if (s.mediaPath && fs.existsSync(s.mediaPath)) {
      try { fs.unlinkSync(s.mediaPath); } catch {}
    }
  }

  while (valid.length > MAX_STATUSES_PER_USER) {
    const shifted = valid.shift();
    if (shifted?.mediaPath && fs.existsSync(shifted.mediaPath)) {
      try { fs.unlinkSync(shifted.mediaPath); } catch {}
    }
  }

  statusMap.set(senderNumber, valid);
  scheduleSaveStatuses();

  // Pré-télécharger le média en arrière-plan pour éviter l'expiration CDN WhatsApp
  if (sock && ['image', 'video', 'audio'].includes(type)) {
    cacheStatusMedia(entry).catch(() => {});
  }
}

/**
 * Récupère les statuts archivés pour un numéro, un pseudo ou un identifiant (JID / LID) donné
 * @param {string} numberOrQuery
 * @returns {Array}
 */
export function getStatusesForUser(numberOrQuery) {
  if (!numberOrQuery) return [];
  const rawClean = String(numberOrQuery).trim().toLowerCase();
  const digitsOnly = rawClean.replace(/[^0-9]/g, '');

  // 1. Recherche directe par clé numérique dans statusMap
  if (digitsOnly && statusMap.has(digitsOnly)) {
    return statusMap.get(digitsOnly);
  }

  // 2. Recherche par JID / LID complet ou partiel
  for (const [key, list] of statusMap.entries()) {
    if (digitsOnly && (key === digitsOnly || key.includes(digitsOnly) || digitsOnly.includes(key))) {
      return list;
    }
    const match = list.some((item) => {
      const sender = (item.sender || '').toLowerCase();
      const pn = (item.pushName || '').toLowerCase();
      return (
        sender === rawClean ||
        (digitsOnly && sender.includes(digitsOnly)) ||
        (item.key?.participant && item.key.participant.toLowerCase().includes(rawClean)) ||
        (rawClean.length >= 2 && pn && pn.includes(rawClean))
      );
    });
    if (match) return list;
  }

  return [];
}

/**
 * Récupère la liste de tous les contacts ayant posté des statuts récents
 * @returns {Array<{ number: string, count: number, lastTimestamp: number, pushName: string }>}
 */
export function getAllRecentStatuses() {
  const result = [];
  const now = Date.now();

  for (const [number, list] of statusMap.entries()) {
    const valid = list.filter((s) => now - s.timestamp < STATUS_EXPIRY_MS);
    if (valid.length > 0) {
      const last = valid[valid.length - 1];
      result.push({
        number,
        count: valid.length,
        lastTimestamp: last.timestamp,
        pushName: last.pushName
      });
    }
  }

  return result.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
}

/**
 * Liste détaillée de tous les statuts archivés (<24h) pour la WebGUI SuperAdmin
 */
export function listAllStatusesDetailed() {
  const items = [];
  const now = Date.now();

  for (const list of statusMap.values()) {
    for (const st of list) {
      if (now - st.timestamp >= STATUS_EXPIRY_MS) continue;
      const hasCachedMedia = Boolean(st.mediaPath && fs.existsSync(st.mediaPath));
      const isMediaType = ['image', 'video', 'audio'].includes(st.type);
      items.push({
        id: st.id,
        sender: st.sender,
        senderNumber: st.senderNumber,
        pushName: st.pushName || `+${st.senderNumber}`,
        timestamp: st.timestamp,
        type: st.type,
        caption: st.caption || '',
        mimetype: st.mimetype || null,
        fileName: st.fileName || null,
        hasMedia: hasCachedMedia || (isMediaType && Boolean(st.rawMessage)),
        isCached: hasCachedMedia
      });
    }
  }

  return items.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Retrouve un statut spécifique par son ID
 */
export function getStatusById(id) {
  if (!id) return null;
  for (const list of statusMap.values()) {
    const found = list.find((s) => s.id === id);
    if (found) return found;
  }
  return null;
}
