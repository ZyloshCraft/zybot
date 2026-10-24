import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { getConfig } from '../config.js';
import { markChatUnread } from '../utils/stealth.js';

/**
 * Envoie une notification dans le groupe Hub de notifications système (notifds)
 * et marque la discussion comme non lue pour remonter en haut avec la pastille.
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {string} text
 */
export async function notifySystem(sock, text) {
  if (!sock || !text) return;
  const config = getConfig();
  const target = config.hub?.systemNotifs;
  if (!target) return;

  const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
  const myNumber = selfJid ? selfJid.split('@')[0].split(':')[0] : null;

  const fullText = myNumber ? `${text}\n🔔 @${myNumber}` : text;

  try {
    const sent = await sock.sendMessage(target, {
      text: fullText,
      mentions: selfJid ? [selfJid] : []
    });
    await markChatUnread(sock, target, sent?.key);
  } catch (err) {
    console.error('[Notifier] Erreur envoi notification système:', err);
  }
}
