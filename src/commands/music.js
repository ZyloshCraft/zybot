import { normalizeMessageContent } from '@whiskeysockets/baileys';
import { replyOrEdit } from '../utils/stealth.js';
import { downloadAudioTrack } from '../services/mediaDownloader.js';
import { extractTextFromMessage } from '../handlers/message.js';

export default {
  name: 'music',
  aliases: ['mp3', 'song', 'musique'],
  description: 'Recherche et télécharge une musique en MP3 haute qualité via yt-dlp',
  async execute({ sock, msg, jid, args }) {
    let query = args.join(' ').trim();

    // Si aucun argument, chercher dans le message cité
    const rawContent = msg.message;
    const normalized = normalizeMessageContent(rawContent) || rawContent;
    const contextInfo =
      normalized?.extendedTextMessage?.contextInfo ||
      normalized?.[Object.keys(normalized || {})[0]]?.contextInfo;

    if (!query && contextInfo?.quotedMessage) {
      query = extractTextFromMessage(contextInfo.quotedMessage).trim();
    }

    if (!query) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        'Usage : `/music <titre ou artiste>` ou `/music <lien YouTube>`\nExemple : `/music Damso Macarena`'
      );
      return;
    }

    await replyOrEdit(sock, jid, msg, `🎵 Recherche et téléchargement de *"${query}"* en cours...`);

    try {
      const { buffer, title, artist, duration } = await downloadAudioTrack(query);

      if (!buffer || buffer.length === 0) {
        await replyOrEdit(sock, jid, msg, '❌ Le fichier audio téléchargé est vide ou indisponible.');
        return;
      }

      const captionLines = [
        `🎵 *${title}*`,
        `👤 Artiste : *${artist}*`
      ];
      if (duration) captionLines.push(`⏱️ Durée : *${duration}*`);
      captionLines.push('━━━━━━━━━━━━━━━━━━━━');
      captionLines.push('⚡ _Téléchargé via ZyBot_');

      // Envoyer le fichier audio en tant que message audio lisible
      await sock.sendMessage(
        jid,
        {
          audio: buffer,
          mimetype: 'audio/mp4',
          fileName: `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp3`,
          caption: captionLines.join('\n')
        },
        { quoted: msg }
      );

      // Si le message d'invocation a été envoyé par nous-même, supprimer furtivement la commande
      if (msg.key.fromMe) {
        try {
          await sock.sendMessage(jid, { delete: msg.key });
        } catch {}
      }
    } catch (err) {
      console.error('[Music] Erreur téléchargement audio:', err);
      await replyOrEdit(
        sock,
        jid,
        msg,
        `❌ Échec du téléchargement : ${err.message}`
      );
    }
  }
};
