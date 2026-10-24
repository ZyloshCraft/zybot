import { downloadMediaMessage, jidNormalizedUser } from '@whiskeysockets/baileys';
import { deleteMessageImmediately, markChatUnread } from '../utils/stealth.js';
import { getConfig } from '../config.js';
import { recordViewOnceIntercepted } from '../services/statsTracker.js';

export default {
  name: 'vv',
  aliases: ['antivv', 'viewonce'],
  description: 'Sauvegarde discrètement une vue unique en privé ou dans le groupe dédié',
  async execute({ sock, msg, jid }) {
    // 1. Supprimer immédiatement la commande /vv de la discussion pour ne laisser AUCUNE trace
    await deleteMessageImmediately(sock, jid, msg.key);

    const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
    const myNumber = selfJid ? selfJid.split('@')[0].split(':')[0] : null;
    const config = getConfig();
    const targetJid = config.hub?.viewOnce || selfJid;
    if (!targetJid) return;

    const msgContent = msg.message;
    const contextInfo =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;

    const quoted = contextInfo?.quotedMessage;
    if (!quoted) {
      await sock.sendMessage(targetJid, {
        text: '⚠️ Erreur /vv : Vous devez répondre à un média à vue unique.'
      });
      return;
    }

    // Déballer le message vue unique
    const viewOnceWrapped = quoted.viewOnceMessage?.message || quoted.viewOnceMessageV2?.message || quoted;
    const isImage = Boolean(viewOnceWrapped.imageMessage);
    const isVideo = Boolean(viewOnceWrapped.videoMessage);

    if (!isImage && !isVideo) {
      await sock.sendMessage(targetJid, {
        text: '⚠️ Le message ciblé avec /vv n\'était pas une photo ou vidéo à vue unique.'
      });
      return;
    }

    try {
      const messageToDownload = {
        key: {
          remoteJid: jid,
          id: contextInfo.stanzaId
        },
        message: viewOnceWrapped
      };

      const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {});
      const senderNumber = (contextInfo.participant || contextInfo.remoteJid || 'Inconnu').split('@')[0];

      const mentionList = selfJid ? [selfJid] : [];
      const mentionTag = myNumber ? `\n🔔 @${myNumber}` : '';

      let sentMsg = null;
      if (isImage) {
        sentMsg = await sock.sendMessage(targetJid, {
          image: buffer,
          caption: `🔓 *Photo vue unique capturée*\n• De : +${senderNumber}${mentionTag}`,
          mentions: mentionList
        });
      } else {
        sentMsg = await sock.sendMessage(targetJid, {
          video: buffer,
          caption: `🔓 *Vidéo vue unique capturée*\n• De : +${senderNumber}${mentionTag}`,
          mentions: mentionList
        });
      }

      await markChatUnread(sock, targetJid, sentMsg?.key);
      recordViewOnceIntercepted();
    } catch (err) {
      console.error('Erreur vv:', err);
      await sock.sendMessage(targetJid, {
        text: `❌ Erreur lors de la capture de la vue unique : ${err.message}`
      });
    }
  }
};
