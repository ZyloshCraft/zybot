import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_FILE = path.resolve(__dirname, '../../message_history.json');

const MAX_HISTORY_PER_CHAT = 300;

// Maps in-memory
const chatHistories = new Map(); // jid -> Array<{ key, timestamp, fromMe, text }>
const messagesById = new Map();  // id -> { key, timestamp, fromMe, jid, text }

export function loadMessageHistory() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      for (const [jid, list] of Object.entries(data)) {
        chatHistories.set(jid, list);
        for (const item of list) {
          if (item?.key?.id) {
            messagesById.set(item.key.id, item);
          }
        }
      }
    }
  } catch (err) {
    console.error('Erreur chargement message_history.json:', err);
  }
}

export function saveMessageHistory() {
  try {
    const obj = {};
    for (const [jid, list] of chatHistories.entries()) {
      // Sauvegarder les 100 derniers par chat pour garder le fichier léger
      obj[jid] = list.slice(-100);
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erreur sauvegarde message_history.json:', err);
  }
}

// Charger l'historique au démarrage
loadMessageHistory();

/**
 * Enregistre un message dans l'historique
 */
export function trackMessage(jid, key, metadata = {}) {
  if (!jid || !key?.id) return;

  const item = {
    key: {
      remoteJid: key.remoteJid || jid,
      fromMe: Boolean(key.fromMe),
      id: key.id,
      participant: key.participant || undefined
    },
    fromMe: Boolean(key.fromMe),
    timestamp: metadata.timestamp || Date.now(),
    text: metadata.text || ''
  };

  messagesById.set(key.id, item);

  if (!chatHistories.has(jid)) {
    chatHistories.set(jid, []);
  }

  const list = chatHistories.get(jid);
  // Éviter les doublons
  if (!list.some((m) => m.key.id === key.id)) {
    list.push(item);
    if (list.length > MAX_HISTORY_PER_CHAT) {
      list.shift();
    }
  }
}

// Compatibilité
export function trackSentMessage(jid, key, timestamp) {
  trackMessage(jid, key, { timestamp: timestamp || Date.now(), fromMe: true });
}

/**
 * Récupère les messages récents à supprimer
 * @param {string} jid 
 * @param {number} count 
 * @param {'all' | 'me'} mode 
 */
export function getRecentKeys(jid, count = 1, mode = 'all') {
  if (!jid || !chatHistories.has(jid)) return [];
  const list = chatHistories.get(jid);

  let filtered = list;
  if (mode === 'all') {
    // Seuls vos propres messages peuvent être supprimés pour tout le monde
    filtered = list.filter((item) => item.fromMe);
  }

  return filtered.slice(-count);
}

export function getRecentSentKeys(jid, count = 1) {
  return getRecentKeys(jid, count, 'all');
}

export function removeTrackedKey(jid, messageId) {
  if (messageId) {
    messagesById.delete(messageId);
  }
  if (!jid || !chatHistories.has(jid)) return;
  const list = chatHistories.get(jid);
  const filtered = list.filter((item) => item.key.id !== messageId);
  chatHistories.set(jid, filtered);
}

/**
 * Retrouve un message par son ID (stanzaId) pour connaître sa date originale exacte
 */
export function findMessageById(messageId) {
  if (!messageId) return null;
  return messagesById.get(messageId) || null;
}
