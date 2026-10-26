import { normalizeMessageContent } from '@whiskeysockets/baileys';
import { extractTextFromMessage } from '../handlers/message.js';

// Map: senderNumber => Array<{ id, key, timestamp, type, text, rawMessage }>
const statusMap = new Map();
const MAX_STATUSES_PER_USER = 25;
const MAX_TOTAL_USERS = 200;
const STATUS_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 heures

/**
 * Enregistre un nouveau statut WhatsApp posté
 * @param {object} msg - Objet message Baileys brut
 */
export function trackStatus(msg) {
  if (!msg || !msg.message) return;

  const senderJid = msg.key.participant || msg.participant;
  if (!senderJid) return;

  const senderNumber = senderJid.split('@')[0].split(':')[0];
  const normalized = normalizeMessageContent(msg.message) || msg.message;

  let type = 'text';
  let caption = '';

  if (normalized.imageMessage) {
    type = 'image';
    caption = normalized.imageMessage.caption || '';
  } else if (normalized.videoMessage) {
    type = 'video';
    caption = normalized.videoMessage.caption || '';
  } else if (normalized.audioMessage) {
    type = 'audio';
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
    rawMessage: msg.message
  };

  if (!statusMap.has(senderNumber)) {
    // Si la map générale est trop grosse, supprimer les plus vieux
    if (statusMap.size >= MAX_TOTAL_USERS) {
      const oldestKey = statusMap.keys().next().value;
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
  const valid = userList.filter((s) => now - s.timestamp < STATUS_EXPIRY_MS);

  if (valid.length > MAX_STATUSES_PER_USER) {
    valid.shift(); // garder les plus récents
  }

  statusMap.set(senderNumber, valid);
}

/**
 * Récupère les statuts archivés pour un numéro ou un identifiant (JID / LID) donné
 * @param {string} numberOrJid - ex: '33612345678', '18081946574907@lid', '18081946574907'
 * @returns {Array}
 */
export function getStatusesForUser(numberOrJid) {
  if (!numberOrJid) return [];
  const rawClean = String(numberOrJid).trim().toLowerCase();
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
      return (
        sender === rawClean ||
        (digitsOnly && sender.includes(digitsOnly)) ||
        (item.key?.participant && item.key.participant.toLowerCase().includes(rawClean))
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
