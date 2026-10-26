import { downloadMediaMessage, normalizeMessageContent } from '@whiskeysockets/baileys';
import { replyOrEdit } from '../utils/stealth.js';
import { convertStickerToMedia } from '../services/stickerConverter.js';

export default {
  name: 'toimg',
  aliases: ['img', 'toimage'],
  description: 'Convertit un sticker cité en photo standard ou en vidéo (si animé)',
  async execute({ sock, msg, jid }) {
    const rawContent = msg.message;
    const normalized = normalizeMessageContent(rawContent) || rawContent;
    const contextInfo =
      normalized?.extendedTextMessage?.contextInfo ||
      normalized?.[Object.keys(normalized || {})[0]]?.contextInfo;

    const quotedMessage = contextInfo?.quotedMessage;
    const normalizedQuoted = normalizeMessageContent(quotedMessage) || quotedMessage;
    const stickerMessage = normalizedQuoted?.stickerMessage;

    if (!stickerMessage) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        'Usage : Répondez à un sticker avec `/toimg` pour le convertir en photo ou en vidéo animée.'
      );
      return;
    }

    await replyOrEdit(sock, jid, msg, '⏳ Conversion du sticker en cours...');

    try {
      const quotedKey = {
        remoteJid: jid,
        id: contextInfo.stanzaId,
        participant: contextInfo.participant
      };

      const stickerBuffer = await downloadMediaMessage(
        { key: quotedKey, message: quotedMessage },
        'buffer',
        {}
      );

      if (!stickerBuffer || stickerBuffer.length === 0) {
        await replyOrEdit(sock, jid, msg, '❌ Impossible de télécharger le contenu du sticker.');
        return;
      }

      const isAnimated = Boolean(stickerMessage.isAnimated);
      const { buffer, isVideo } = await convertStickerToMedia(stickerBuffer, isAnimated);

      if (isVideo) {
        await sock.sendMessage(
          jid,
          {
            video: buffer,
            gifPlayback: true,
            caption: '🎬 *Animation extraite du sticker*'
          },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(
          jid,
          {
            image: buffer,
            caption: '🖼️ *Image extraite du sticker*'
          },
          { quoted: msg }
        );
      }

      // Nettoyer furtivement la commande de l'utilisateur
      if (msg.key.fromMe) {
        try {
          await sock.sendMessage(jid, { delete: msg.key });
        } catch {}
      }
    } catch (err) {
      console.error('[ToImg] Erreur conversion sticker:', err);
      await replyOrEdit(
        sock,
        jid,
        msg,
        `❌ Échec de la conversion du sticker : ${err.message}`
      );
    }
  }
};
