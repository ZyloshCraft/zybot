import { normalizeMessageContent } from '@whiskeysockets/baileys';
import { replyOrEdit } from '../utils/stealth.js';
import { downloadSocialMedia } from '../services/mediaDownloader.js';
import { extractTextFromMessage } from '../handlers/message.js';

export default {
  name: 'dl',
  aliases: ['telecharger', 'down'],
  description: 'Télécharge une vidéo depuis TikTok, Instagram, Twitter/X ou YouTube et l\'envoie directement',
  async execute({ sock, msg, jid, args }) {
    // 1. Chercher l'URL (dans les arguments ou dans le message cité)
    let url = args[0];

    const rawContent = msg.message;
    const normalized = normalizeMessageContent(rawContent) || rawContent;
    const contextInfo =
      normalized?.extendedTextMessage?.contextInfo ||
      normalized?.[Object.keys(normalized || {})[0]]?.contextInfo;

    if (!url && contextInfo?.quotedMessage) {
      const quotedText = extractTextFromMessage(contextInfo.quotedMessage);
      const urlMatch = quotedText.match(/https?:\/\/[^\s]+/i);
      if (urlMatch) {
        url = urlMatch[0];
      }
    }

    if (!url) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        'Usage : `/dl <lien>` (TikTok, Twitter/X, Instagram, YouTube) ou répondez à un message contenant un lien avec `/dl`.'
      );
      return;
    }

    await replyOrEdit(sock, jid, msg, '⏳ Téléchargement et traitement du média en cours...');

    try {
      const { buffer, title, author } = await downloadSocialMedia(url);

      if (!buffer || buffer.length === 0) {
        await replyOrEdit(sock, jid, msg, '❌ Le fichier vidéo téléchargé est vide ou indisponible.');
        return;
      }

      const captionLines = [
        `🎬 *${title || 'Vidéo téléchargée'}*`
      ];
      if (author) captionLines.push(`👤 Créateur : *${author}*`);
      captionLines.push('━━━━━━━━━━━━━━━━━━━━');
      captionLines.push('⚡ _Téléchargé via ZyBot_');

      await sock.sendMessage(
        jid,
        {
          video: buffer,
          caption: captionLines.join('\n')
        },
        { quoted: msg }
      );

      // Si le message d'invocation a été envoyé par nous-même, on peut supprimer furtivement la commande
      if (msg.key.fromMe) {
        try {
          await sock.sendMessage(jid, { delete: msg.key });
        } catch {}
      }
    } catch (err) {
      console.error('[DL] Erreur téléchargement média:', err);
      await replyOrEdit(
        sock,
        jid,
        msg,
        `❌ Échec du téléchargement : ${err.message}\n💡 Astuce : Sur votre Raspberry Pi, tapez \`sudo apt install yt-dlp\` pour débloquer toutes les plateformes !`
      );
    }
  }
};
