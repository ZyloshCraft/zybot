import { replyOrEdit } from '../utils/stealth.js';

async function performTranslation(text, targetLang = 'fr') {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
    targetLang
  )}&dt=t&q=${encodeURIComponent(text)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  const translatedText = data[0].map((chunk) => chunk[0]).join('');
  const detectedLang = data[2] || 'auto';

  return {
    translatedText,
    detectedLang,
    targetLang
  };
}

export default {
  name: 'translate',
  aliases: ['traduir', 'traduire'],
  description: 'Traduction instantanée (remplace directement la commande)',
  async execute({ sock, msg, jid, args }) {
    // 1. Vérifier si un message est cité
    const msgContent = msg.message;
    const contextInfo =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;

    const quotedMessage = contextInfo?.quotedMessage;
    let quotedText = '';
    if (quotedMessage) {
      quotedText =
        quotedMessage.conversation ||
        quotedMessage.extendedTextMessage?.text ||
        quotedMessage.imageMessage?.caption ||
        quotedMessage.videoMessage?.caption ||
        '';
    }

    let textToTranslate = '';
    let targetLang = 'fr';

    if (quotedText) {
      textToTranslate = quotedText;
      if (args[0] && /^[a-zA-Z]{2,3}$/.test(args[0])) {
        targetLang = args[0].toLowerCase();
      }
    } else {
      if (!args.length) {
        await replyOrEdit(sock, jid, msg, 'Usage : /translate [lang] <texte>');
        return;
      }

      if (args.length > 1 && /^[a-zA-Z]{2,3}$/.test(args[0])) {
        targetLang = args[0].toLowerCase();
        textToTranslate = args.slice(1).join(' ').trim();
      } else {
        textToTranslate = args.join(' ').trim();
        targetLang = 'fr';
      }
    }

    if (!textToTranslate) {
      await replyOrEdit(sock, jid, msg, 'Texte introuvable');
      return;
    }

    try {
      const result = await performTranslation(textToTranslate, targetLang);

      // Si la langue détectée est déjà la cible et qu'on visait le français par défaut, basculer en anglais
      if (result.detectedLang.toLowerCase() === result.targetLang.toLowerCase()) {
        const fallbackTarget = result.targetLang === 'fr' ? 'en' : 'fr';
        const retryResult = await performTranslation(textToTranslate, fallbackTarget);
        result.translatedText = retryResult.translatedText;
      }

      // Remplacement direct du message par le texte traduit épuré
      await replyOrEdit(sock, jid, msg, result.translatedText);
    } catch (err) {
      console.error('Erreur traduction:', err);
      await replyOrEdit(sock, jid, msg, `Erreur traduction : ${err.message}`);
    }
  }
};
