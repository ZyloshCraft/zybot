import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { getConfig } from '../config.js';

/**
 * Détecte les mots-clés surveillés dans tous les messages (groupes et privés)
 * et alerte le propriétaire discrètement dans sa discussion personnelle.
 */
export async function handleKeywordAlert({ sock, msg, jid, text }) {
  const config = getConfig();
  if (!config.alerts?.enabled || !config.alerts?.words?.length) {
    return;
  }

  if (!text) return;

  const myUserJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
  if (!myUserJid) return;

  // Ne pas alerter sur les messages envoyés dans son propre chat "Note to self"
  if (jid === myUserJid) {
    return;
  }

  const lowerText = text.toLowerCase();
  const matchedWord = config.alerts.words.find((w) =>
    lowerText.includes(w.toLowerCase().trim())
  );

  if (!matchedWord) {
    return;
  }

  const senderJid = msg.key.participant || msg.key.remoteJid || 'Inconnu';
  const senderNumber = senderJid.split('@')[0];

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

  try {
    await sock.sendMessage(myUserJid, { text: alertNotification });
  } catch (err) {
    console.error('[KeywordAlert] Erreur envoi alerte:', err);
  }
}
