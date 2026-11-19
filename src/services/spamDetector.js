import { getConfig } from '../config.js';
import { recordAuditLog } from './auditLogStore.js';

// Historique glissant en mémoire pour chaque utilisateur par groupe :
// Map<"groupJid:userKey", Array<{ timestamp: number, text: string, length: number }>>
const userActivityWindow = new Map();

// Map<"groupJid:userKey", { lastAlertTime: number, spamCount: number }>
const spamAlertCooldowns = new Map();

const ALERT_COOLDOWN_MS = 60 * 1000; // 60 secondes entre deux alertes dans admintaverne pour le même membre
const WINDOW_EXPIRY_MS = 30 * 1000; // 30 secondes d'historique glissant

/**
 * Analyse un message dans un groupe pour détecter s'il s'agit de spam ou de farming d'activité
 * @param {object} params
 * @param {string} params.groupJid
 * @param {string} [params.groupName]
 * @param {string} params.senderJid
 * @param {string} [params.pushName]
 * @param {string} params.text
 * @param {number} [params.timestamp]
 * @returns {{ isSpam: boolean, reason?: string, details?: string }}
 */
export function checkGroupMessageSpam({ groupJid, groupName, senderJid, pushName, text = '', timestamp }) {
  if (!groupJid || !senderJid) return { isSpam: false };

  const config = getConfig();
  const adminTaverneJid = config.hub?.adminTaverne || config.hub?.admintaverne || config.groupAliases?.admintaverne || '120363424594930135@g.us';

  // Ne pas filtrer dans le groupe admin lui-même
  if (groupJid === adminTaverneJid) {
    return { isSpam: false };
  }

  const now = timestamp || Date.now();
  const userKey = senderJid.split('@')[0].split(':')[0];
  const windowKey = `${groupJid}:${userKey}`;

  // Récupérer et nettoyer l'historique glissant
  let history = userActivityWindow.get(windowKey) || [];
  history = history.filter((m) => now - m.timestamp < WINDOW_EXPIRY_MS);

  const cleanText = (text || '').trim();
  const lowerText = cleanText.toLowerCase();

  // 1. Règle Caractères Répétés dans un seul message (ex: aaaaaaaaaaaaaa... 50+ fois)
  if (/(.)\1{49,}/.test(cleanText)) {
    return {
      isSpam: true,
      reason: 'Message contenant un caractère répété plus de 50 fois consécutives (flood de caractères)',
      details: 'single_char_flood'
    };
  }

  // 2. Règle Mots Répétés à l'excès dans un seul message (ex: "salut salut salut..." 12+ fois)
  if (/\b(\w{2,})\b(?:\s+\1\b){11,}/i.test(cleanText)) {
    return {
      isSpam: true,
      reason: 'Répétition excessive du même mot dans un seul message (12 fois ou plus)',
      details: 'single_word_flood'
    };
  }

  // 3. Règle Rafale / Flood rapide (cadence anormale)
  // - 5 messages ou plus en moins de 4 secondes
  // - ou 8 messages ou plus en moins de 10 secondes
  const recent4s = history.filter((m) => now - m.timestamp <= 4000);
  if (recent4s.length >= 4) { // 4 déjà enregistrés + le courant = 5 msgs
    return {
      isSpam: true,
      reason: `Cadence anormale : ${recent4s.length + 1} messages envoyés en moins de 4 secondes (flood rapide)`,
      details: 'burst_4s'
    };
  }

  const recent10s = history.filter((m) => now - m.timestamp <= 10000);
  if (recent10s.length >= 7) { // 7 déjà enregistrés + le courant = 8 msgs
    return {
      isSpam: true,
      reason: `Cadence excessive : ${recent10s.length + 1} messages envoyés en moins de 10 secondes`,
      details: 'burst_10s'
    };
  }

  // 4. Règle Répétition consécutive du même message (3 fois d'affilée)
  if (cleanText.length > 0 && history.length >= 2) {
    const last1 = history[history.length - 1];
    const last2 = history[history.length - 2];
    if (last1 && last2 && last1.lower === lowerText && last2.lower === lowerText) {
      return {
        isSpam: true,
        reason: 'Répétition du même message 3 fois consécutives (spam de doublons)',
        details: 'consecutive_duplicates'
      };
    }
  }

  // 5. Règle Farming par messages très courts en série (ex: 4 messages consécutifs <= 2 caractères en moins de 15s)
  if (cleanText.length > 0 && cleanText.length <= 2 && history.length >= 3) {
    const recentShorts = history
      .slice(-3)
      .filter((m) => m.length <= 2 && now - m.timestamp <= 15000);

    if (recentShorts.length === 3) {
      return {
        isSpam: true,
        reason: 'Envoi répété de messages très courts ou caractères isolés (farming de statistiques)',
        details: 'short_char_farming'
      };
    }
  }

  // Si tout est en ordre, enregistrer ce message dans la fenêtre glissante
  history.push({
    timestamp: now,
    text: cleanText,
    lower: lowerText,
    length: cleanText.length
  });
  userActivityWindow.set(windowKey, history);

  return { isSpam: false };
}

/**
 * Envoie une notification explicative détaillée au groupe admin taverne
 * @param {object} params
 * @param {object} params.sock
 * @param {string} params.groupJid
 * @param {string} [params.groupName]
 * @param {string} params.senderJid
 * @param {string} [params.pushName]
 * @param {string} params.text
 * @param {string} params.reason
 */
export async function handleSpamAlert({ sock, groupJid, groupName, senderJid, pushName, text, reason }) {
  const config = getConfig();
  const adminTaverneJid = config.hub?.adminTaverne || config.hub?.admintaverne || config.groupAliases?.admintaverne || '120363424594930135@g.us';

  if (!sock || !adminTaverneJid) return;

  const userKey = senderJid.split('@')[0].split(':')[0];
  const cooldownKey = `${groupJid}:${userKey}`;
  const now = Date.now();
  const record = spamAlertCooldowns.get(cooldownKey) || { lastAlertTime: 0, spamCount: 0 };

  record.spamCount = (record.spamCount || 0) + 1;
  spamAlertCooldowns.set(cooldownKey, record);

  // Cooldown de 60s pour éviter de flooder le salon admin si l'utilisateur envoie 30 messages de spam à la seconde
  if (now - record.lastAlertTime < ALERT_COOLDOWN_MS) {
    return;
  }

  record.lastAlertTime = now;

  const cleanNum = userKey.startsWith('33') && userKey.length === 11
    ? `+33 ${userKey.slice(2, 3)} ${userKey.slice(3).match(/.{1,2}/g)?.join(' ')}`
    : `+${userKey}`;

  const memberDisplay = pushName ? `${pushName} (${cleanNum})` : cleanNum;

  const preview = text
    ? (text.length > 70 ? text.slice(0, 70) + '...' : text)
    : '[Média / Sticker / Message vide]';

  const alertMessage = [
    `🛡️ *[Anti-Spam Taverne] Message suspect ignoré*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `👤 *Membre :* ${memberDisplay}`,
    `🏢 *Groupe :* ${groupName || groupJid}`,
    `⚠️ *Raison détectée :* ${reason}`,
    `💬 *Extrait du message :* "${preview}"`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `ℹ️ _Ce message n'a pas été comptabilisé dans le /top ni sur le classement d'activité._`
  ].join('\n');

  try {
    await sock.sendMessage(adminTaverneJid, {
      text: alertMessage,
      mentions: [senderJid]
    });
  } catch (err) {
    console.error('[SpamDetector] Erreur envoi alerte admintaverne:', err.message);
  }

  // Trace dans le journal d'audit
  recordAuditLog({
    action: 'SPAM_ACTIVITY_IGNORED',
    target: userKey,
    admin: 'Anti-Spam Taverne',
    details: `${reason} dans "${groupName || groupJid}". Non comptabilisé au /top.`
  });
}

/**
 * Réinitialise les fenêtres d'activité (utile pour les tests unitaires)
 */
export function resetSpamDetector() {
  userActivityWindow.clear();
  spamAlertCooldowns.clear();
}
