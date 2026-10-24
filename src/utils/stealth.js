import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { getConfig } from '../config.js';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getRandomDelay(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Envoie un message avec simulation de présence humaine ("en train d'écrire...")
 * et un délai aléatoire (jitter) pour éviter les détections d'automatisation.
 */
export async function sendStealthMessage(sock, jid, content, options = {}) {
  const config = getConfig();
  const stealthEnabled = config.stealth?.enabled ?? true;

  if (stealthEnabled) {
    const minDelay = config.stealth?.humanTypingMinMs || 1500;
    const maxDelay = config.stealth?.humanTypingMaxMs || 3000;
    const delay = getRandomDelay(minDelay, maxDelay);

    try {
      await sock.sendPresenceUpdate('composing', jid);
      await sleep(delay);
      await sock.sendPresenceUpdate('paused', jid);
    } catch (err) {}
  }

  return await sock.sendMessage(jid, content, options);
}

/**
 * Modifie directement le message de commande émis par l'utilisateur (fromMe)
 * au lieu d'envoyer un nouveau message, pour un rendu discret et sans fioritures.
 */
export async function replyOrEdit(sock, jid, msg, text) {
  if (msg?.key && msg.key.fromMe) {
    try {
      return await sock.sendMessage(jid, { text, edit: msg.key });
    } catch (err) {
      console.warn('[replyOrEdit] Modification impossible, repli sur envoi standard:', err.message);
    }
  }
  return await sendStealthMessage(sock, jid, { text }, { quoted: msg });
}

/**
 * Affiche une réponse en modifiant le message de commande, puis le supprime
 * automatiquement après un délai (par défaut 5 secondes) pour ne laisser aucune preuve.
 */
export async function replyOrEditTemporary(sock, jid, msg, text, ttlMs = 5000) {
  const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
  const isSelfChat = jid === selfJid;

  // Modifier le message avec le texte
  await replyOrEdit(sock, jid, msg, text);

  // Si c'est dans une discussion avec un tiers ou un groupe, on détruit le message après ttlMs
  if (!isSelfChat) {
    setTimeout(async () => {
      try {
        await sock.sendMessage(jid, { delete: msg.key });
      } catch (err) {
        console.warn('[AutoDelete] Échec de la suppression automatique:', err.message);
      }
    }, ttlMs);
  }
}

/**
 * Supprime un message immédiatement sans laisser de trace
 */
export async function deleteMessageImmediately(sock, jid, key) {
  try {
    await sock.sendMessage(jid, { delete: key });
  } catch (err) {
    console.warn('[deleteImmediately] Échec:', err.message);
  }
}
