import { downloadMediaMessage, normalizeMessageContent } from '@whiskeysockets/baileys';
import { replyOrEdit } from '../utils/stealth.js';
import { convertToStickerWebp } from '../services/stickerConverter.js';

export default {
  name: 'sticker',
  aliases: ['s', 'autocollant'],
  description: 'Convertit instantanément une photo ou courte vidéo en sticker WhatsApp officiel',
  async execute({ sock, msg, jid, args }) {
    const rawContent = msg.message;
    const normalized = normalizeMessageContent(rawContent) || rawContent;
    const contextInfo =
      normalized?.extendedTextMessage?.contextInfo ||
      normalized?.[Object.keys(normalized || {})[0]]?.contextInfo;

    // 1. Détecter le message média (soit cité, soit le message lui-même)
    let targetMessage = null;
    let targetKey = null;
    let mimeType = 'image/jpeg';

    const quotedMessage = contextInfo?.quotedMessage;
    if (quotedMessage) {
      const qNorm = normalizeMessageContent(quotedMessage) || quotedMessage;
      if (qNorm.imageMessage) {
        targetMessage = quotedMessage;
        targetKey = { id: contextInfo.stanzaId, remoteJid: jid, participant: contextInfo.participant };
        mimeType = qNorm.imageMessage.mimetype || 'image/jpeg';
      } else if (qNorm.videoMessage) {
        targetMessage = quotedMessage;
        targetKey = { id: contextInfo.stanzaId, remoteJid: jid, participant: contextInfo.participant };
        mimeType = qNorm.videoMessage.mimetype || 'video/mp4';
      }
    } else if (normalized.imageMessage) {
      targetMessage = rawContent;
      targetKey = msg.key;
      mimeType = normalized.imageMessage.mimetype || 'image/jpeg';
    } else if (normalized.videoMessage) {
      targetMessage = rawContent;
      targetKey = msg.key;
      mimeType = normalized.videoMessage.mimetype || 'video/mp4';
    }

    if (!targetMessage) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        'Usage : Répondez à une image ou une courte vidéo avec `/s` (ou envoyez une image avec la légende `/s`).'
      );
      return;
    }

    try {
      // 2. Télécharger le média
      const mediaBuffer = await downloadMediaMessage(
        { key: targetKey, message: targetMessage },
        'buffer',
        {}
      );

      if (!mediaBuffer || mediaBuffer.length === 0) {
        await replyOrEdit(sock, jid, msg, '❌ Échec du téléchargement du média.');
        return;
      }

      // 3. Convertir en WebP 512x512
      const stickerBuffer = await convertToStickerWebp(mediaBuffer, mimeType);

      // 4. Envoyer le sticker
      await sock.sendMessage(
        jid,
        {
          sticker: stickerBuffer
        },
        { quoted: msg }
      );

      // Si le message d'invocation était un texte émis par nous-même (ex: /s), on peut le supprimer furtivement
      if (msg.key.fromMe && normalized.conversation?.startsWith('/')) {
        try {
          await sock.sendMessage(jid, { delete: msg.key });
        } catch {}
      }
    } catch (err) {
      console.error('[Sticker] Erreur création sticker:', err);
      await replyOrEdit(sock, jid, msg, `❌ Impossible de créer le sticker : ${err.message}`);
    }
  }
};
