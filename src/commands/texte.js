import { downloadMediaMessage, normalizeMessageContent } from '@whiskeysockets/baileys';
import fs from 'node:fs';
import { replyOrEdit } from '../utils/stealth.js';
import { convertOggToWav, transcribeAudioFile } from '../services/transcriber.js';
import { getConfig } from '../config.js';

export default {
  name: 'texte',
  aliases: ['transcrire', 'transcribe', 'transcription', 'vocal'],
  description: 'Transcrit une note vocale WhatsApp en texte écrit sans l\'écouter',
  async execute({ sock, msg, jid, args }) {
    const rawContent = msg.message;
    const normalized = normalizeMessageContent(rawContent) || rawContent;
    const contextInfo =
      normalized?.extendedTextMessage?.contextInfo ||
      normalized?.[Object.keys(normalized || {})[0]]?.contextInfo;

    let targetMessage = null;
    let targetKey = null;

    const quotedMessage = contextInfo?.quotedMessage;
    if (quotedMessage) {
      const qNorm = normalizeMessageContent(quotedMessage) || quotedMessage;
      if (qNorm.audioMessage) {
        targetMessage = quotedMessage;
        targetKey = { id: contextInfo.stanzaId, remoteJid: jid, participant: contextInfo.participant };
      }
    } else if (normalized.audioMessage) {
      targetMessage = rawContent;
      targetKey = msg.key;
    }

    if (!targetMessage) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        'Usage : Répondez à une note vocale avec `/texte` (ou `/transcribe`) pour la convertir en texte.'
      );
      return;
    }

    await replyOrEdit(sock, jid, msg, '🎧 Écoute et transcription du vocal en cours...');

    let wavFile = null;

    try {
      // 1. Télécharger l'audio
      const audioBuffer = await downloadMediaMessage(
        { key: targetKey, message: targetMessage },
        'buffer',
        {}
      );

      if (!audioBuffer || audioBuffer.length === 0) {
        await replyOrEdit(sock, jid, msg, '❌ Impossible de télécharger la note vocale.');
        return;
      }

      // 2. Conversion audio
      wavFile = await convertOggToWav(audioBuffer);

      // 3. Transcription
      const transcribedText = await transcribeAudioFile(wavFile);

      const senderNum = (contextInfo?.participant || jid).split('@')[0];
      const resultText = [
        `📝 *Transcription vocale (+${senderNum}) :*`,
        '━━━━━━━━━━━━━━━━━━━━',
        `"${transcribedText}"`,
        '━━━━━━━━━━━━━━━━━━━━'
      ].join('\n');

      await replyOrEdit(sock, jid, msg, resultText);
    } catch (err) {
      console.error('[Texte] Erreur transcription vocale:', err);
      await replyOrEdit(
        sock,
        jid,
        msg,
        `⚠️ ${err.message}`
      );
    } finally {
      if (wavFile && fs.existsSync(wavFile)) {
        try {
          fs.unlinkSync(wavFile);
        } catch {}
      }
    }
  }
};
