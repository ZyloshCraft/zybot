import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { getConfig } from '../config.js';
import { recordKeywordAlert } from '../services/statsTracker.js';
import { markChatUnread } from '../utils/stealth.js';
import { sendNtfyNotification } from '../services/ntfy.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';

/**
 * Nettoie et normalise une chaîne pour une comparaison insensible à la casse,
 * aux accents et aux formatages Markdown WhatsApp (*gras*, _italique_, ~barré~).
 * @param {string} str 
 * @returns {string}
 */
export function normalizeTextForSearch(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprime les diacritiques/accents (é -> e, à -> a)
    .replace(/[*_~`]/g, '')         // Supprime les caractères de mise en forme WhatsApp
    .trim();
}

/**
 * Vérifie si un mot-clé est présent dans le texte.
 * En mode strict (par défaut), vérifie les limites de mot (mot isolé/entier) pour éviter
 * les faux positifs comme "valise" ou "vallée" pour le mot-clé "val".
 * @param {string} text - Message brut
 * @param {string} keyword - Mot-clé recherché
 * @param {boolean} [strict=true] - Si true, empêche les mots rattachés (ex: vallée pour val)
 * @returns {boolean}
 */
export function isKeywordMatched(text, keyword, strict = true) {
  if (!text || !keyword) return false;

  const normText = normalizeTextForSearch(text);
  const normKw = normalizeTextForSearch(keyword);
  if (!normKw) return false;

  if (strict) {
    // Mode strict : délimité par début/fin de chaîne ou caractères non-alphanumériques (ponctuation, espaces, symboles)
    const escaped = normKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu');
    return regex.test(normText);
  }

  // Mode souple : simple inclusion de sous-chaîne
  const lowerRawText = text.toLowerCase();
  const lowerW = keyword.toLowerCase().trim();
  return lowerRawText.includes(lowerW) || normText.includes(normKw);
}

/**
 * Détecte les mots-clés surveillés dans tous les messages (groupes et privés)
 * et alerte le propriétaire discrètement dans le groupe dédié (importantmsg).
 */
export async function handleKeywordAlert({ sock, msg, jid, text }) {
  const config = getConfig();
  if (!config.alerts?.enabled || !config.alerts?.words?.length) {
    return;
  }

  if (!text) return;

  const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
  const targetAlertJid = config.hub?.alerts || selfJid;
  if (!targetAlertJid) return;

  // Ne pas alerter si le message vient du groupe d'alerte lui-même ou du chat personnel
  if (jidNormalizedUser(jid) === jidNormalizedUser(targetAlertJid) || (selfJid && jidNormalizedUser(jid) === selfJid)) {
    return;
  }

  const senderJid = msg.key.participant || msg.key.remoteJid || 'Inconnu';
  const senderNumber = senderJid.split('@')[0].split(':')[0];

  // 1. Vérification de la Blacklist anti-troll (ignore les personnes bloquées)
  const blacklist = (config.alerts?.blacklist || []).map((n) => String(n).replace(/[^0-9]/g, ''));
  if (blacklist.some((blocked) => blocked && senderNumber.includes(blocked))) {
    return;
  }

  // 2. Mode strict activé par défaut (évite les faux positifs comme "valise" ou "vallée" pour "val")
  const isStrict = config.alerts.strict !== false;
  const matchedWord = config.alerts.words.find((w) => isKeywordMatched(text, w, isStrict));

  if (!matchedWord) {
    return;
  }

  const myNumber = selfJid ? selfJid.split('@')[0].split(':')[0] : null;

  let originName = `Discussion privée (+${senderNumber})`;
  if (jid.endsWith('@g.us')) {
    try {
      const meta = await getCachedGroupMetadata(sock, jid);
      originName = meta?.subject ? `Groupe "${meta.subject}"` : 'Groupe';
    } catch (e) {
      originName = 'Groupe';
    }
  }

  const alertNotification = [
    `🚨 *Alerte mot-clé : "${matchedWord}"*`,
    `• De : +${senderNumber}`,
    `• Lieu : ${originName}`,
    `• Message : "${text}"`,
    myNumber ? `🔔 @${myNumber}` : ''
  ].filter(Boolean).join('\n');

  console.log(`[KeywordAlert] Mot-clé "${matchedWord}" détecté dans ${originName} par +${senderNumber}`);
  recordKeywordAlert();

  // Envoyer une notification push sonore/vibrante sur le smartphone (si DND inactif)
  sendNtfyNotification({
    title: `🚨 Alerte mot-clé : "${matchedWord}"`,
    message: `De : +${senderNumber} dans ${originName}\n"${text}"`,
    priority: 'urgent',
    tags: ['rotating_light', 'loudspeaker']
  }).catch(() => {});

  try {
    const sent = await sock.sendMessage(targetAlertJid, {
      text: alertNotification,
      mentions: selfJid ? [selfJid] : []
    });
    // Marquer la discussion comme Non lue (pastille verte)
    await markChatUnread(sock, targetAlertJid, sent?.key);
  } catch (err) {
    console.error('[KeywordAlert] Erreur envoi alerte:', err);
  }
}
