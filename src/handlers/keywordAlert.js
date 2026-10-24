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

  const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
  const targetAlertJid = config.hub?.alerts || selfJid;
  if (!targetAlertJid) return;

  // Ne pas alerter si le message vient du groupe d'alerte lui-même ou du chat personnel
  if (jid === targetAlertJid || jid === selfJid) {
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
    await sock.sendMessage(targetAlertJid, { text: alertNotification });
  } catch (err) {
    console.error('[KeywordAlert] Erreur envoi alerte:', err);
  }
}
