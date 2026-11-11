import fs from 'node:fs';
import { downloadMediaMessage, normalizeMessageContent } from '@whiskeysockets/baileys';
import { replyOrEdit } from '../utils/stealth.js';
import { convertOggToWav, transcribeAudioFile, summarizeBriefly } from '../services/transcriber.js';
import { extractTextFromMessage } from '../handlers/message.js';

export default {
  name: 'bref',
  aliases: ['tldr', 'tl;dr'],
  description: 'Résume en 1 à 2 phrases directes un pavé textuel ou un long message vocal',
  async execute({ sock, msg, jid, args }) {
    const rawContent = msg.message;
    const normalized = normalizeMessageContent(rawContent) || rawContent;
    const contextInfo =
      normalized?.extendedTextMessage?.contextInfo ||
      normalized?.[Object.keys(normalized || {})[0]]?.contextInfo;

    const quotedMessage = contextInfo?.quotedMessage;
    const qNorm = quotedMessage ? (normalizeMessageContent(quotedMessage) || quotedMessage) : null;

    let textToSummarize = '';
    let authorJid = contextInfo?.participant || jid;
    let isVoice = false;

    // 1. Détection note vocale ou audio
    if (qNorm?.audioMessage) {
      isVoice = true;
      let wavFile = null;
      try {
        const audioBuffer = await downloadMediaMessage(
          {
            key: { id: contextInfo.stanzaId, remoteJid: jid, participant: contextInfo.participant },
            message: quotedMessage
          },
          'buffer',
          {}
        );

        if (!audioBuffer || audioBuffer.length === 0) {
          await replyOrEdit(sock, jid, msg, '❌ Impossible de télécharger la note vocale.');
          return;
        }

        wavFile = await convertOggToWav(audioBuffer);
        textToSummarize = await transcribeAudioFile(wavFile);
      } catch (err) {
        await replyOrEdit(sock, jid, msg, `⚠️ Erreur lecture audio : ${err.message}`);
        return;
      } finally {
        if (wavFile && fs.existsSync(wavFile)) {
          try { fs.unlinkSync(wavFile); } catch {}
        }
      }
    } else if (quotedMessage) {
      // 2. Détection message texte / légende cité
      textToSummarize = extractTextFromMessage(quotedMessage).trim();
    } else if (args && args.length > 0) {
      // 3. Texte passé directement en argument
      textToSummarize = args.filter(a => a.toLowerCase() !== 'ici' && a.toLowerCase() !== 'public').join(' ').trim();
    }

    if (!textToSummarize) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        'Usage : Répondez à un pavé ou à un vocal avec `/bref` (ou `/tldr`).'
      );
      return;
    }

    // Si le texte est déjà très court (moins de 30 caractères)
    if (textToSummarize.length < 30 && !isVoice) {
      await replyOrEdit(sock, jid, msg, `⚡ *En bref :* "${textToSummarize}" (déjà très court)`);
      return;
    }

    try {
      const summary = await summarizeBriefly(textToSummarize);

      const isGroup = jid.endsWith('@g.us');
      const sendHere = args.some(a => ['ici', 'public'].includes(a.toLowerCase()));
      const myNumber = sock.user?.id ? sock.user.id.split(':')[0] : null;
      const cleanAuthor = authorJid.split('@')[0].split(':')[0];

      if (isGroup && !sendHere) {
        // En groupe : suppression furtive de la commande /bref
        if (msg.key.fromMe) {
          try {
            await sock.sendMessage(jid, { delete: msg.key });
          } catch {}
        }
        // Envoi discret dans la discussion privée du propriétaire
        const privateJid = myNumber ? `${myNumber}@s.whatsapp.net` : jid;
        const formatted = `⚡ *En bref (+${cleanAuthor}) :* ${summary}`;
        await sock.sendMessage(privateJid, { text: formatted });
      } else {
        // En discussion privée ou si l'utilisateur a spécifié /bref ici
        await replyOrEdit(sock, jid, msg, `⚡ *En bref :* ${summary}`);
      }
    } catch (err) {
      console.error('[Bref] Erreur résumé:', err.message);
      await replyOrEdit(sock, jid, msg, `⚠️ ${err.message}`);
    }
  }
};
