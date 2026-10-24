import { getConfig, isHubGroup } from '../config.js';

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
 * Affiche une réponse en modifiant le message de commande.
 * RÈGLE DE FURTIVITÉ & GESTION HUB :
 * - En discussion privée (DM ou chat perso), les messages NE sont JAMAIS supprimés.
 * - Dans les groupes du Hub de gestion (testbot, notifds, persopingunevue, importantmsg), les messages NE sont JAMAIS supprimés.
 * - Dans les groupes publics normaux avec des tiers, le message est automatiquement supprimé après ttlMs (défaut 5s).
 */
export async function replyOrEditTemporary(sock, jid, msg, text, ttlMs = 5000) {
  const isGroup = Boolean(jid && jid.endsWith('@g.us'));
  const isHub = isHubGroup(jid);

  // Pas de suppression en privé NI dans les groupes du hub communautaire
  if (!isGroup || isHub) {
    return await replyOrEdit(sock, jid, msg, text);
  }

  // Suppression temporaire UNIQUEMENT dans les groupes tiers
  await replyOrEdit(sock, jid, msg, text);
  setTimeout(async () => {
    try {
      await sock.sendMessage(jid, { delete: msg.key });
    } catch (err) {
      console.warn('[AutoDelete] Échec suppression groupe:', err.message);
    }
  }, ttlMs);
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
