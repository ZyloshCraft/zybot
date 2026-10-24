import { getConfig } from '../config.js';

/**
 * Envoie une notification dans le groupe Hub de notifications système (notifds)
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {string} text
 */
export async function notifySystem(sock, text) {
  if (!sock || !text) return;
  const config = getConfig();
  const target = config.hub?.systemNotifs;
  if (!target) return;

  try {
    await sock.sendMessage(target, { text });
  } catch (err) {
    console.error('[Notifier] Erreur envoi notification système:', err);
  }
}
