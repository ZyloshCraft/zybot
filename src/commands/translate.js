import { replyOrEdit } from '../utils/stealth.js';
import { generateWithGemini } from '../services/geminiService.js';
import { getConfig } from '../config.js';

/**
 * Heuristique rapide pour identifier la langue source probable
 * Utilisé principalement pour alimenter les API qui n'acceptent pas 'auto' (ex: MyMemory)
 */
export function detectLikelySourceLang(text, targetLang = 'fr') {
  if (!text || typeof text !== 'string') return targetLang === 'en' ? 'fr' : 'en';

  // 1. Détection par blocs de caractères Unicode distincts
  if (/[\u0600-\u06FF]/.test(text)) return 'ar'; // Arabe
  if (/[\u0400-\u04FF]/.test(text)) return 'ru'; // Russe / Cyrillique
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja'; // Japonais (Hiragana / Katakana)
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh'; // Chinois (Han)
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) return 'ko'; // Coréen (Hangul)
  if (/[\u0370-\u03FF]/.test(text)) return 'el'; // Grec
  if (/[\u0590-\u05FF]/.test(text)) return 'he'; // Hébreu
  if (/[\u0900-\u097F]/.test(text)) return 'hi'; // Hindi / Devanagari
  if (/[\u0E00-\u0E7F]/.test(text)) return 'th'; // Thaï

  // 2. Détection par vocabulaire et diacritiques caractéristiques
  const lower = text.toLowerCase();

  // Espagnol
  if (
    /\b(el|la|los|las|un|una|que|por|para|como|está|estoy|hola|gracias|buenos|días|pero|más|muy)\b/i.test(lower) ||
    /[¿¡ñ]/.test(lower)
  ) {
    return 'es';
  }

  // Allemand
  if (
    /\b(der|die|das|und|nicht|ein|eine|einen|einem|einer|mit|auf|für|ist|sind|hallo|danke|bitte|guten|tag|wie|geht|ich|du|er|sie|es|wir|ihr|mein|meine)\b/i.test(
      lower
    ) ||
    /[äöüß]/.test(lower)
  ) {
    return 'de';
  }

  // Italien
  if (/\b(il|lo|la|i|gli|le|un|uno|una|che|non|per|sono|ciao|grazie|perché|anche)\b/i.test(lower)) {
    return 'it';
  }

  // Portugais
  if (
    /\b(o|a|os|as|um|uma|que|não|para|com|está|olá|obrigado|por|mais)\b/i.test(lower) ||
    /[ãõ]/.test(lower)
  ) {
    return 'pt';
  }

  // Français
  if (
    /\b(le|la|les|un|une|des|est|sont|dans|pour|avec|bonjour|merci|mais|donc|qui)\b/i.test(lower) ||
    /[éèêëàâùûôîïçœæ]/.test(lower)
  ) {
    return 'fr';
  }

  // Anglais
  if (
    /\b(the|is|are|and|in|on|at|to|for|with|this|that|you|your|have|from|hello|thanks|what|where|when|why|how)\b/i.test(
      lower
    )
  ) {
    return 'en';
  }

  // Par défaut : si on cible le français, la source la plus probable est l'anglais, sinon le français
  return targetLang.toLowerCase() === 'fr' ? 'en' : 'fr';
}

/**
 * Traduit un texte avec un système résilient multi-niveaux :
 * 1. Google Translate Chrome API (clients5 - très haute disponibilité, pas de 429 classique)
 * 2. Google Translate GTX API (translate.googleapis.com)
 * 3. MyMemory API (avec détection de langue source et filtrage strict des erreurs)
 * 4. Gemini IA (si clé disponible)
 */
export async function performTranslation(text, targetLang = 'fr') {
  const cleanTarget = (targetLang || 'fr').toLowerCase().trim();

  // 1. Essai avec Google Translate Chrome Extension endpoint (clients5)
  try {
    const clients5Url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(
      cleanTarget
    )}&q=${encodeURIComponent(text)}`;

    const res = await fetch(clients5Url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        let translatedText = '';
        let detectedLang = 'auto';

        if (Array.isArray(data[0])) {
          translatedText = data.map((item) => (Array.isArray(item) ? item[0] : item)).join('');
          detectedLang = data[0][1] || 'auto';
        } else if (typeof data[0] === 'string') {
          translatedText = data.join('');
        }

        if (translatedText && translatedText.trim()) {
          return {
            translatedText: translatedText.trim(),
            detectedLang,
            targetLang: cleanTarget
          };
        }
      }
    }
  } catch (err) {
    console.warn('[Translate] Fallback Clients5 suite à erreur:', err.message);
  }

  // 2. Essai avec Google GTX endpoint classique
  try {
    const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      cleanTarget
    )}&dt=t&q=${encodeURIComponent(text)}`;

    const res = await fetch(gtxUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translatedText = data[0].map((chunk) => chunk[0]).join('');
        const detectedLang = data[2] || 'auto';
        if (translatedText && translatedText.trim()) {
          return {
            translatedText: translatedText.trim(),
            detectedLang,
            targetLang: cleanTarget
          };
        }
      }
    }
  } catch (err) {
    console.warn('[Translate] Fallback GTX suite à erreur:', err.message);
  }

  // 3. Fallback avec MyMemory API (en injectant une langue source valide détectée)
  try {
    let sourceLang = detectLikelySourceLang(text, cleanTarget);
    if (sourceLang.toLowerCase() === cleanTarget.toLowerCase()) {
      sourceLang = cleanTarget === 'fr' ? 'en' : 'fr';
    }

    const myMemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      text
    )}&langpair=${encodeURIComponent(sourceLang)}|${encodeURIComponent(cleanTarget)}`;

    const res = await fetch(myMemoryUrl, {
      signal: AbortSignal.timeout(6000)
    });

    if (res.ok) {
      const data = await res.json();
      const status = Number(data.responseStatus);
      const translatedText = data.responseData?.translatedText;

      // Vérifier que MyMemory n'a pas retourné une erreur maquillée en texte
      const isErrorResponse =
        status !== 200 ||
        !translatedText ||
        /INVALID|MYMEMORY WARNING|PLEASE SELECT TWO DISTINCT LANGUAGES|QUOTA EXCEEDED/i.test(
          translatedText
        );

      if (!isErrorResponse) {
        return {
          translatedText: translatedText.trim(),
          detectedLang: sourceLang,
          targetLang: cleanTarget
        };
      }
    }
  } catch (err) {
    console.warn('[Translate] Fallback MyMemory suite à erreur:', err.message);
  }

  // 4. Fallback avec Gemini IA si disponible
  const config = getConfig();
  const geminiKey = config.speech?.geminiApiKey || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const { text: translatedText } = await generateWithGemini({
        prompt: `Traduis le texte suivant en langue "${cleanTarget}". Ne renvoie strictement AUCUN commentaire, préambule ou explication, uniquement la traduction exacte :\n\n${text}`,
        maxTokens: 500,
        temperature: 0.1,
        geminiKey
      });
      if (translatedText && translatedText.trim()) {
        return {
          translatedText: translatedText.trim(),
          detectedLang: 'auto',
          targetLang: cleanTarget
        };
      }
    } catch (err) {
      console.warn('[Translate] Fallback Gemini suite à erreur:', err.message);
    }
  }

  throw new Error('Service de traduction temporairement indisponible. Veuillez réessayer dans quelques instants.');
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
    let userExplicitLang = false;

    if (quotedText) {
      textToTranslate = quotedText;
      if (args[0] && /^[a-zA-Z]{2,3}$/.test(args[0])) {
        targetLang = args[0].toLowerCase();
        userExplicitLang = true;
      }
    } else {
      if (!args.length) {
        await replyOrEdit(
          sock,
          jid,
          msg,
          '💡 Usage : `/translate [lang] <texte>` ou répondre à un message avec `/translate [lang]`.'
        );
        return;
      }

      if (args.length > 1 && /^[a-zA-Z]{2,3}$/.test(args[0])) {
        targetLang = args[0].toLowerCase();
        userExplicitLang = true;
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

      // Si l'utilisateur n'a pas spécifié explicitement la langue et que la source est déjà la cible (ex: texte fr alors qu'on visait fr par défaut), basculer en anglais
      if (!userExplicitLang && result.detectedLang.toLowerCase() === result.targetLang.toLowerCase()) {
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
