import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { getConfig } from '../config.js';
import { recordKeywordAlert } from '../services/statsTracker.js';

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

  const lowerRawText = text.toLowerCase();
  const normalizedText = normalizeTextForSearch(text);

  // Recherche souple : insensible à la casse, aux accents, au formatage ou aux mots collés (ex: "bonjourca va")
  const matchedWord = config.alerts.words.find((w) => {
    if (!w) return false;
    const lowerW = w.toLowerCase().trim();
    const normW = normalizeTextForSearch(w);
    return lowerRawText.includes(lowerW) || normalizedText.includes(normW);
  });

  if (!matchedWord) {
    return;
  }

  const senderJid = msg.key.participant || msg.key.remoteJid || 'Inconnu';
  const senderNumber = senderJid.split('@')[0].split(':')[0];

  let originName = `Discussion privée (+${senderNumber})`;
  if (jid.endsWith('@g.us')) {
    try {
      const meta = await sock.groupMetadata(jid);
      originName = meta?.subject ? `Groupe "${meta.subject}"` : 'Groupe';
    } catch (e) {
      originName = 'Groupe';
    }
  }

  const alertNotification = [
    `🚨 *Alerte mot-clé : "${matchedWord}"*`,
    `• De : +${senderNumber}`,
    `• Lieu : ${originName}`,
    `• Message : "${text}"`
  ].join('\n');

  console.log(`[KeywordAlert] Mot-clé "${matchedWord}" détecté dans ${originName} par +${senderNumber}`);
  recordKeywordAlert();

  try {
    await sock.sendMessage(targetAlertJid, { text: alertNotification });
  } catch (err) {
    console.error('[KeywordAlert] Erreur envoi alerte:', err);
  }
}
