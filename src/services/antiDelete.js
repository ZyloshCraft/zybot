import { downloadMediaMessage, jidNormalizedUser } from '@whiskeysockets/baileys';
import { getConfig } from '../config.js';
import { findMessageById } from './messageStore.js';

// Cache des IDs de messages supprimés déjà traités pour éviter les doublons
const handledRevokedIds = new Set();
// Cache des noms de groupes pour éviter des requêtes réseau répétitives
const groupNameCache = new Map();

/**
 * Traite un événement de message supprimé (Revoke) et l'envoie au groupe dédié
 * @param {object} params
 * @param {import('@whiskeysockets/baileys').WASocket} params.sock
 * @param {object} params.revokedKey - Clé du message supprimé
 * @param {object} [params.revokerKey] - Clé de la personne qui a supprimé
 * @param {number} [params.timestamp]
 */
export async function handleRevokedMessage({ sock, revokedKey, revokerKey, timestamp }) {
  if (!sock || !revokedKey?.id) return;

  const messageId = revokedKey.id;
  if (handledRevokedIds.has(messageId)) return;
  handledRevokedIds.add(messageId);

  // Nettoyer le cache s'il dépasse 2000 entrées
  if (handledRevokedIds.size > 2000) {
    const firstItems = Array.from(handledRevokedIds).slice(0, 500);
    for (const id of firstItems) handledRevokedIds.delete(id);
  }

  // Ne pas capturer si le message supprimé a été envoyé par nous-même (ex: /clear ou auto-delete furtif)
  if (revokedKey.fromMe) return;

  const config = getConfig();
  const targetJid = config.hub?.antiDelete || config.groupAliases?.antidelete;
  if (!targetJid) return;

  const rawChatJid = revokedKey.remoteJid;
  if (!rawChatJid) return;
  const chatJid = jidNormalizedUser(rawChatJid);

  // Ne pas capturer si la suppression a eu lieu dans le groupe anti-delete lui-même
  if (chatJid === jidNormalizedUser(targetJid)) return;

  const stored = findMessageById(messageId);

  // Déterminer le numéro et nom de l'expéditeur
  const rawSender = revokedKey.participant || stored?.sender || rawChatJid;
  const senderNumber = rawSender.split('@')[0].split(':')[0];
  const senderPushName = stored?.pushName ? ` (${stored.pushName})` : '';

  // Déterminer le nom de la discussion
  let chatOrigin = `Discussion privée (+${senderNumber})`;
  if (chatJid.endsWith('@g.us')) {
    if (groupNameCache.has(chatJid)) {
      chatOrigin = `Groupe "${groupNameCache.get(chatJid)}"`;
    } else {
      try {
        const meta = await sock.groupMetadata(chatJid);
        const subject = meta?.subject || chatJid;
        groupNameCache.set(chatJid, subject);
        chatOrigin = `Groupe "${subject}"`;
      } catch (e) {
        chatOrigin = `Groupe (${chatJid})`;
      }
    }
  }

  const sentDate = stored?.timestamp
    ? new Date(stored.timestamp).toLocaleString('fr-FR')
    : 'Date inconnue';
  const deleteTime = new Date().toLocaleTimeString('fr-FR');

  console.log(`[AntiDelete] Message supprimé détecté de +${senderNumber} dans ${chatOrigin} (id: ${messageId})`);

  // Cas 1 : Le message contient un média et est en mémoire
  if (stored?.rawMessage) {
    const raw = stored.rawMessage;
    const isImage = Boolean(raw.imageMessage);
    const isVideo = Boolean(raw.videoMessage);
    const isAudio = Boolean(raw.audioMessage);
    const isSticker = Boolean(raw.stickerMessage);
    const isDoc = Boolean(raw.documentMessage);

    if (isImage || isVideo || isAudio || isSticker || isDoc) {
      try {
        const buffer = await downloadMediaMessage(
          { key: stored.key, message: stored.rawMessage },
          'buffer',
          {}
        );

        const caption = [
          `🗑️ *MÉDIA SUPPRIMÉ INTERCEPTÉ*`,
          `━━━━━━━━━━━━━━━━━━━━`,
          `• *De :* +${senderNumber}${senderPushName}`,
          `• *Discussion :* ${chatOrigin}`,
          `• *Envoyé le :* ${sentDate}`,
          `• *Supprimé à :* ${deleteTime}`,
          stored.text ? `• *Légende :* ${stored.text}` : ''
        ].filter(Boolean).join('\n');

        if (isImage) {
          await sock.sendMessage(targetJid, { image: buffer, caption });
          return;
        }
        if (isVideo) {
          await sock.sendMessage(targetJid, { video: buffer, caption });
          return;
        }
        if (isAudio) {
          await sock.sendMessage(targetJid, {
            audio: buffer,
            mimetype: raw.audioMessage?.mimetype || 'audio/mp4',
            ptt: Boolean(raw.audioMessage?.ptt)
          });
          await sock.sendMessage(targetJid, { text: caption });
          return;
        }
        if (isSticker) {
          await sock.sendMessage(targetJid, { sticker: buffer });
          await sock.sendMessage(targetJid, { text: caption });
          return;
        }
        if (isDoc) {
          await sock.sendMessage(targetJid, {
            document: buffer,
            mimetype: raw.documentMessage?.mimetype || 'application/octet-stream',
            fileName: raw.documentMessage?.fileName || 'document',
            caption
          });
          return;
        }
      } catch (mediaErr) {
        console.warn(`[AntiDelete] Échec du téléchargement du média supprimé (${mediaErr.message}), envoi en texte.`);
      }
    }
  }

  // Cas 2 : Message textuel retrouvé en mémoire
  if (stored) {
    const textNotification = [
      '🗑️ *MESSAGE SUPPRIMÉ INTERCEPTÉ*',
      '━━━━━━━━━━━━━━━━━━━━',
      `• *De :* +${senderNumber}${senderPushName}`,
      `• *Discussion :* ${chatOrigin}`,
      `• *Envoyé le :* ${sentDate}`,
      `• *Supprimé à :* ${deleteTime}`,
      '━━━━━━━━━━━━━━━━━━━━',
      '📝 *Contenu :*',
      stored.text || '_(Message média ou contenu vide)_'
    ].join('\n');

    try {
      await sock.sendMessage(targetJid, { text: textNotification });
    } catch (err) {
      console.error('[AntiDelete] Erreur envoi notif texte:', err);
    }
    return;
  }

  // Cas 3 : Message non retrouvé en mémoire (antérieur au lancement du bot)
  const fallbackNotification = [
    '🗑️ *MESSAGE SUPPRIMÉ INTERCEPTÉ*',
    '━━━━━━━━━━━━━━━━━━━━',
    `• *De :* +${senderNumber}`,
    `• *Discussion :* ${chatOrigin}`,
    `• *Supprimé à :* ${deleteTime}`,
    '━━━━━━━━━━━━━━━━━━━━',
    '⚠️ _(Contenu non disponible : message antérieur au démarrage du bot ou purgé de la mémoire)_'
  ].join('\n');

  try {
    await sock.sendMessage(targetJid, { text: fallbackNotification });
  } catch (err) {
    console.error('[AntiDelete] Erreur envoi notif fallback:', err);
  }
}
