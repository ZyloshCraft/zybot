import { replyOrEdit } from '../utils/stealth.js';
import { generateWithGemini } from '../services/geminiService.js';
import { getConfig } from '../config.js';

/**
 * Traduit un texte avec triple système de fallback :
 * 1. Google Translate (GTX)
 * 2. MyMemory API (en cas de 429 / blocage IP)
 * 3. Gemini IA (si clé configurée)
 */
async function performTranslation(text, targetLang = 'fr') {
  let detectedLang = 'auto';

  // 1. Essai avec Google GTX
  try {
    const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      targetLang
    )}&dt=t&q=${encodeURIComponent(text)}`;

    const res = await fetch(gtxUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const translatedText = data[0].map((chunk) => chunk[0]).join('');
      detectedLang = data[2] || 'auto';
      if (translatedText) {
        return {
          translatedText,
          detectedLang,
          targetLang
        };
      }
    }
  } catch (err) {
    console.warn('[Translate] Fallback GTX suite à erreur:', err.message);
  }

  // 2. Fallback avec MyMemory API (idéal si Google renvoie HTTP 429)
  try {
    const myMemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${encodeURIComponent(targetLang)}`;
    const res = await fetch(myMemoryUrl);
    if (res.ok) {
      const data = await res.json();
      const translatedText = data.responseData?.translatedText;
      if (translatedText && !translatedText.includes('MYMEMORY WARNING')) {
        return {
          translatedText,
          detectedLang: 'auto',
          targetLang
        };
      }
    }
  } catch (err) {
    console.warn('[Translate] Fallback MyMemory suite à erreur:', err.message);
  }

  // 3. Fallback avec Gemini IA si disponible
  const config = getConfig();
  const geminiKey = config.speech?.geminiApiKey || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const { text: translatedText } = await generateWithGemini({
        prompt: `Traduis le texte suivant en langue "${targetLang}". Ne renvoie strictement AUCUN commentaire, préambule ou explication, uniquement la traduction exacte :\n\n${text}`,
        maxTokens: 500,
        temperature: 0.1,
        geminiKey
      });
      if (translatedText) {
        return {
          translatedText,
          detectedLang: 'auto',
          targetLang
        };
      }
    } catch (err) {
      console.warn('[Translate] Fallback Gemini suite à erreur:', err.message);
    }
  }

  throw new Error('Service de traduction temporairement surchargé (HTTP 429). Réessayez dans un instant.');
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
        await replyOrEdit(sock, jid, msg, '💡 Usage : `/translate [lang] <texte>` ou répondre à un message avec `/translate [lang]`.');
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
      await replyOrEdit(sock, jid, msg, '⚠️ Aucun texte à traduire spécifié.');
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
      console.error('[Translate] Erreur finale traduction:', err.message);
      await replyOrEdit(sock, jid, msg, `⚠️ Erreur traduction : ${err.message}`);
    }
  }
};
