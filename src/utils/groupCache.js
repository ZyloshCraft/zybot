// Cache mémoire des métadonnées de groupes (JID => { data, timestamp })
const groupMetadataCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Récupère les métadonnées d'un groupe avec cache local intelligent.
 * Évite le spam de stanzas <iq> sur les serveurs WhatsApp, qui est l'une
 * des signatures principales repérées par l'anti-bot WhatsApp.
 *
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {string} jid
 * @param {boolean} [force=false]
 * @returns {Promise<any>}
 */
export async function getCachedGroupMetadata(sock, jid, force = false) {
  if (!sock || !jid || !jid.endsWith('@g.us')) return null;

  const now = Date.now();
  if (!force && groupMetadataCache.has(jid)) {
    const entry = groupMetadataCache.get(jid);
    if (now - entry.timestamp < CACHE_TTL_MS) {
      return entry.data;
    }
  }

  try {
    const data = await sock.groupMetadata(jid);
    groupMetadataCache.set(jid, { data, timestamp: now });
    return data;
  } catch (err) {
    // Si l'appel échoue (ex: rate limit temporaire ou groupe inaccessible),
    // retourner le cache expiré s'il existe
    if (groupMetadataCache.has(jid)) {
      return groupMetadataCache.get(jid).data;
    }
    throw err;
  }
}

/**
 * Invalide manuellement le cache d'un groupe
 * @param {string} jid
 */
export function invalidateGroupMetadataCache(jid) {
  if (jid) groupMetadataCache.delete(jid);
}
