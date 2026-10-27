import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jidNormalizedUser } from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_FILE = path.resolve(__dirname, '../../message_history.json');

const MAX_HISTORY_PER_CHAT = 500;

// Maps in-memory
const chatHistories = new Map(); // normalizedJid -> Array<{ key, timestamp, fromMe, text, sender, pushName }>
const messagesById = new Map();  // id -> { key, timestamp, fromMe, jid, text, sender, pushName, rawMessage }

let saveTimeout = null;

export function loadMessageHistory() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      for (const [rawJid, list] of Object.entries(data)) {
        const normJid = jidNormalizedUser(rawJid);
        chatHistories.set(normJid, list);
        for (const item of list) {
          if (item?.key?.id) {
            messagesById.set(item.key.id, item);
          }
        }
      }
      console.log(`📦 Historique chargé depuis le disque (${chatHistories.size} conversations).`);
    }
  } catch (err) {
    console.error('Erreur chargement message_history.json:', err);
  }
}

export function saveMessageHistory() {
  try {
    const obj = {};
    for (const [jid, list] of chatHistories.entries()) {
      // Sauvegarder jusqu'à 300 messages par discussion (sans les objets bruts lourds)
      obj[jid] = list.slice(-300).map((item) => ({
        key: item.key,
        fromMe: item.fromMe,
        timestamp: item.timestamp,
        text: item.text || '',
        sender: item.sender,
        pushName: item.pushName
      }));
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erreur sauvegarde message_history.json:', err);
  }
}

/**
 * Sauvegarde périodique avec debounce pour ne pas bloquer les I/O disque
 */
export function scheduleSaveMessageHistory() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveMessageHistory();
  }, 1000);
}

// Charger l'historique au démarrage
loadMessageHistory();

/**
 * Enregistre un message dans l'historique (avec normalisation automatique du JID)
 */
export function trackMessage(rawJid, key, metadata = {}) {
  if (!rawJid || !key?.id) return;

  const normJid = jidNormalizedUser(rawJid);

  const item = {
    key: {
      remoteJid: key.remoteJid ? jidNormalizedUser(key.remoteJid) : normJid,
      fromMe: Boolean(key.fromMe),
      id: key.id,
      participant: key.participant ? jidNormalizedUser(key.participant) : undefined
    },
    fromMe: Boolean(key.fromMe),
    timestamp: metadata.timestamp || Date.now(),
    text: metadata.text || '',
    sender: metadata.sender ? jidNormalizedUser(metadata.sender) : (key.participant ? jidNormalizedUser(key.participant) : normJid),
    pushName: metadata.pushName || '',
    rawMessage: metadata.rawMessage || null
  };

  messagesById.set(key.id, item);

  if (!chatHistories.has(normJid)) {
    chatHistories.set(normJid, []);
  }

  const list = chatHistories.get(normJid);
  // Éviter les doublons par identifiant
  const existingIndex = list.findIndex((m) => m.key.id === key.id);
  if (existingIndex === -1) {
    list.push(item);
    if (list.length > MAX_HISTORY_PER_CHAT) {
      list.shift();
    }
  } else {
    // Mettre à jour les métadonnées si nécessaire
    list[existingIndex] = item;
  }

  // Sauvegarder automatiquement sur disque
  scheduleSaveMessageHistory();
}

export function trackSentMessage(rawJid, key, timestamp) {
  trackMessage(rawJid, key, { timestamp: timestamp || Date.now(), fromMe: true });
}

/**
 * Récupère les messages récents à supprimer
 * @param {string} rawJid 
 * @param {number} count 
 * @param {'all' | 'me'} mode 
 * @param {string} [quotedId] 
 */
export function getRecentKeys(rawJid, count = 1, mode = 'all', quotedId = null) {
  if (!rawJid) return [];
  const normJid = jidNormalizedUser(rawJid);

  // Chercher dans l'historique du JID normalisé ou brut
  let list = chatHistories.get(normJid) || chatHistories.get(rawJid) || [];
  if (!list.length) return [];

  // Filtrer selon le mode
  let filtered = list;
  if (mode === 'all') {
    // En mode 'all' : uniquement les messages émis par vous-même
    filtered = list.filter((item) => item.fromMe);
  }

  // Si l'utilisateur a cité un message pour délimiter le début de la suppression
  if (quotedId) {
    const quotedIndex = filtered.findIndex((item) => item.key.id === quotedId);
    if (quotedIndex !== -1) {
      return filtered.slice(quotedIndex);
    }
  }

  return filtered.slice(-count);
}

export function getRecentSentKeys(rawJid, count = 1) {
  return getRecentKeys(rawJid, count, 'all');
}

export function removeTrackedKey(rawJid, messageId) {
  if (messageId) {
    messagesById.delete(messageId);
  }
  if (!rawJid) return;
  const normJid = jidNormalizedUser(rawJid);

  const list = chatHistories.get(normJid);
  if (list) {
    const filtered = list.filter((item) => item.key.id !== messageId);
    chatHistories.set(normJid, filtered);
    scheduleSaveMessageHistory();
  }
}

/**
 * Récupère les messages récents d'une discussion pour l'export (/export)
 * @param {string} rawJid
 * @param {number} limit
 * @returns {Array}
 */
export function getChatMessages(rawJid, limit = 50) {
  if (!rawJid) return [];
  const normJid = jidNormalizedUser(rawJid);
  const list = chatHistories.get(normJid) || chatHistories.get(rawJid) || [];
  return list.slice(-limit);
}

/**
 * Retrouve un message par son ID (stanzaId)
 */
export function findMessageById(messageId) {
  if (!messageId) return null;
  return messagesById.get(messageId) || null;
}

/**
 * Recherche un participant par son pseudo ou prénom (pushName)
 * @param {string} query - Nom recherché
 * @param {string} [specificChatJid] - Optionnel : restreindre à un groupe donné
 * @returns {{ sender: string, pushName: string } | null}
 */
export function findSenderByPushName(query, specificChatJid = null) {
  if (!query) return null;
  const cleanQ = query.toLowerCase().replace(/[@~*]/g, '').trim();
  if (!cleanQ) return null;

  // 1. Chercher dans le chat spécifique si fourni
  if (specificChatJid) {
    const norm = jidNormalizedUser(specificChatJid);
    const list = chatHistories.get(norm) || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i];
      if (item.pushName && item.sender) {
        const normPn = item.pushName.toLowerCase().replace(/[@~*]/g, '').trim();
        if (normPn === cleanQ || normPn.includes(cleanQ) || cleanQ.includes(normPn)) {
          return { sender: item.sender, pushName: item.pushName };
        }
      }
    }
  }

  // 2. Chercher dans toutes les discussions
  for (const [chatJid, list] of chatHistories.entries()) {
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i];
      if (item.pushName && item.sender) {
        const normPn = item.pushName.toLowerCase().replace(/[@~*]/g, '').trim();
        if (normPn === cleanQ || normPn.includes(cleanQ) || cleanQ.includes(normPn)) {
          return { sender: item.sender, pushName: item.pushName };
        }
      }
    }
  }

  return null;
}
