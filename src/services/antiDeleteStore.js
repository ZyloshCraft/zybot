import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_FILE = path.resolve(__dirname, '../../antidelete_history.json');

const MAX_ENTRIES = 300;
let interceptedList = [];
let saveTimeout = null;

export function loadAntiDeleteHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
      interceptedList = JSON.parse(raw);
      if (!Array.isArray(interceptedList)) interceptedList = [];
    }
  } catch (err) {
    console.error('[AntiDeleteStore] Erreur chargement antidelete_history.json:', err.message);
    interceptedList = [];
  }
}

export function saveAntiDeleteHistorySync() {
  try {
    fs.writeFileSync(
      HISTORY_FILE,
      JSON.stringify(interceptedList.slice(-MAX_ENTRIES), null, 2),
      'utf-8'
    );
  } catch (err) {
    console.error('[AntiDeleteStore] Erreur sauvegarde antidelete_history.json:', err.message);
  }
}

function scheduleSave() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    saveAntiDeleteHistorySync();
  }, 2000);
}

// Initialiser au chargement
loadAntiDeleteHistory();

/**
 * Enregistre un message supprimé ou modifié
 * @param {object} item
 * @param {'deleted'|'edited'} item.type
 * @param {string} item.id - ID WhatsApp du message
 * @param {string} item.sender - Numéro / JID de l'expéditeur
 * @param {string} [item.senderPushName]
 * @param {string} item.chatJid
 * @param {string} [item.chatName]
 * @param {string} [item.text]
 * @param {string} [item.oldText]
 * @param {string} [item.newText]
 * @param {'image'|'video'|'audio'|'sticker'|'document'|'text'} [item.mediaType]
 * @param {number} [item.sentAt]
 * @param {number} [item.interceptedAt]
 */
export function recordInterceptedMessage(item) {
  if (!item || !item.id) return;

  // Éviter les doublons stricts pour le même ID et même type
  const existingIdx = interceptedList.findIndex(
    (x) => x.id === item.id && x.type === item.type
  );
  if (existingIdx !== -1) {
    interceptedList[existingIdx] = {
      ...interceptedList[existingIdx],
      ...item,
      interceptedAt: item.interceptedAt || Date.now()
    };
    scheduleSave();
    return;
  }

  const entry = {
    id: item.id,
    type: item.type || 'deleted',
    sender: item.sender || 'Inconnu',
    senderPushName: item.senderPushName || '',
    chatJid: item.chatJid || '',
    chatName: item.chatName || item.chatJid || 'Discussion',
    text: item.text || '',
    oldText: item.oldText || '',
    newText: item.newText || '',
    mediaType: item.mediaType || 'text',
    sentAt: item.sentAt || null,
    interceptedAt: item.interceptedAt || Date.now()
  };

  interceptedList.push(entry);
  if (interceptedList.length > MAX_ENTRIES) {
    interceptedList.shift();
  }

  scheduleSave();
}

/**
 * Récupère les messages interceptés récents
 */
export function getInterceptedMessages({ limit = 100, type = null, search = null } = {}) {
  let list = [...interceptedList];

  if (type && type !== 'all') {
    list = list.filter((x) => x.type === type);
  }

  if (search && search.trim()) {
    const q = search.toLowerCase().trim();
    list = list.filter(
      (x) =>
        (x.sender && x.sender.toLowerCase().includes(q)) ||
        (x.senderPushName && x.senderPushName.toLowerCase().includes(q)) ||
        (x.chatName && x.chatName.toLowerCase().includes(q)) ||
        (x.text && x.text.toLowerCase().includes(q)) ||
        (x.oldText && x.oldText.toLowerCase().includes(q)) ||
        (x.newText && x.newText.toLowerCase().includes(q))
    );
  }

  // Trier du plus récent au plus ancien
  return list.sort((a, b) => b.interceptedAt - a.interceptedAt).slice(0, limit);
}

export function clearInterceptedMessages() {
  interceptedList = [];
  saveAntiDeleteHistorySync();
}
