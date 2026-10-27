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

    if (!/^https?:\/\//i.test(url)) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        `⚠️ Le paramètre "${url}" n'est pas un lien valide.\n💡 Pour rechercher et télécharger une musique par son titre, utilisez : \`/music ${args.join(' ')}\`\n💡 Pour une vidéo, collez un lien direct : \`/dl https://...\``
      );
      return;
    }

    await replyOrEdit(sock, jid, msg, '⏳ Téléchargement et traitement du média en cours...');

    let lastUpdate = 0;
    let lastPercent = 0;

    const onProgress = async (prog) => {
      const now = Date.now();
      // Anti-flag : maximum une mise à jour toutes les 3,5 secondes et au moins 15% de progression
      // (seulement 3 à 4 modifications de message au total sur les gros téléchargements)
      if (now - lastUpdate >= 3500 && (prog.percent - lastPercent >= 15 || prog.percent >= 99)) {
        lastUpdate = now;
        lastPercent = prog.percent;

        const filled = Math.min(10, Math.max(0, Math.round((prog.percent / 100) * 10)));
        const empty = 10 - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);

        let statusText = `⏳ *Téléchargement vidéo en cours...*\n[${bar}] *${Math.round(prog.percent)}%*`;
        if (prog.speed) statusText += ` • ${prog.speed}`;
        if (prog.total) statusText += ` (${prog.total})`;

        try {
          await replyOrEdit(sock, jid, msg, statusText);
        } catch {}
      }
    };

    try {
      const { buffer, title, author } = await downloadSocialMedia(url, onProgress);

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
