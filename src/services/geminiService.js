import { getConfig } from '../config.js';

let cachedModels = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 heure

/**
 * Récupère la liste dynamique des modèles Gemini compatibles avec la clé fournie
 */
export async function getSupportedGeminiModels(apiKey) {
  const now = Date.now();
  if (cachedModels && cachedModels.length > 0 && (now - lastCacheTime < CACHE_TTL_MS)) {
    return cachedModels;
  }

  if (!apiKey) return [];

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.models)) {
        const supported = data.models
          .filter((m) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
          .map((m) => m.name.replace(/^models\//, ''));

        if (supported.length > 0) {
          cachedModels = supported;
          lastCacheTime = now;
          return supported;
        }
      }
    }
  } catch (err) {
    console.warn('[GeminiService] Impossible de lister dynamiquement les modèles:', err.message);
  }

  // Modèles par défaut en cas d'impossibilité de lister
  return ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-4-hydrogen', 'gemini-flash-latest'];
}

/**
 * Filtre et sélectionne les meilleurs modèles dans l'ordre de priorité (respectant le choix SuperAdmin)
 */
export async function getCandidateModels(apiKey) {
  const dynamic = await getSupportedGeminiModels(apiKey);
  const config = getConfig();
  const configuredModel = (config.speech?.aiModel || 'auto').trim();

  // Exclure les modèles TTS, Image, Lyria, Robotics, etc.
  const isEligible = (m) => {
    const lower = m.toLowerCase();
    if (configuredModel && configuredModel !== 'auto' && lower === configuredModel.toLowerCase()) {
      return true;
    }
    if (lower.startsWith('gemma-4-31b') || lower.includes('gemma-4-31b')) return true;
    if (lower.startsWith('gemma') || lower.includes('gemma')) return false;
    if (
      lower.includes('tts') ||
      lower.includes('image') ||
      lower.includes('video') ||
      lower.includes('clip') ||
      lower.includes('lyria') ||
      lower.includes('transcribe') ||
      lower.includes('robotics') ||
      lower.includes('deep-research') ||
      lower.includes('computer-use')
    ) {
      return false;
    }
    return lower.startsWith('gemini-');
  };

  const filteredDynamic = dynamic.filter(isEligible);

  // Ordre de priorité par défaut
  const preferences = [
    'gemma-4-31b-it',
    'gemma-4-31b',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-4-hydrogen',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-4-argon',
    'gemini-pro-latest'
  ];

  let candidates = [];

  // Si l'utilisateur a choisi un modèle spécifique dans le SuperAdmin, le placer en tête absolue
  if (configuredModel && configuredModel !== 'auto') {
    candidates.push(configuredModel);
  }

  // 1. Ajouter d'abord les modèles préférés
  for (const pref of preferences) {
    const match = filteredDynamic.find((m) => m === pref);
    if (match && !candidates.includes(match)) {
      candidates.push(match);
    }
  }

  // 2. Ajouter les autres modèles éligibles
  for (const m of filteredDynamic) {
    if (!candidates.includes(m)) {
      candidates.push(m);
    }
  }

  // 3. Fallback dur si aucun modèle détecté
  if (candidates.length === 0) {
    if (configuredModel && configuredModel !== 'auto') {
      candidates.push(configuredModel);
    }
    candidates.push('gemma-4-31b-it', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-4-hydrogen');
  }

  return candidates;
}

/**
 * Génère du texte avec Gemini en gérant nativement le systemInstruction et le fallback multi-modèles
 */
export async function generateWithGemini({
  prompt,
  systemInstruction = null,
  maxTokens = 450,
  temperature = 0.2,
  geminiKey = null
}) {
  const config = getConfig();
  const key = geminiKey || config.speech?.geminiApiKey || process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error('Clé API Gemini introuvable. Veuillez renseigner votre clé dans config.json ou dans le panneau SuperAdmin.');
  }

  const candidateModels = await getCandidateModels(key);
  let lastError = null;

  const versions = ['v1beta', 'v1'];

  for (const model of candidateModels) {
    for (const ver of versions) {
      try {
        const url = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${key}`;
        
        const requestBody = {
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature
          }
        };

        // Si une instruction système est spécifiée, la passer au format natif Gemini
        if (systemInstruction) {
          requestBody.systemInstruction = {
            parts: [{ text: systemInstruction }]
          };
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (res.ok) {
          const data = await res.json();
          let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            // Nettoyage des métadonnées de réflexion interne si le modèle est de la famille Gemma
            if (model.toLowerCase().includes('gemma')) {
              const cleaned = text
                .split('\n')
                .filter((l) => !/^\s*[*•-]?\s*(Input|Meaning|Constraint|Language requested|The requested)\b/i.test(l))
                .join('\n')
                .trim();
              if (cleaned) {
                text = cleaned;
              }
            }

            return {
              text,
              model,
              apiVersion: ver
            };
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error?.message || res.statusText;
          lastError = new Error(`HTTP ${res.status} [${model} / ${ver}]: ${errMsg}`);
          
          // Si le modèle est indisponible ou surchargé (404, 429, 503), essayer immédiatement le modèle suivant
          if (res.status === 404 || res.status === 503 || res.status === 429) {
            continue;
          }
        }
      } catch (err) {
        lastError = err;
      }
    }
  }

  throw lastError || new Error('Échec de la génération Gemini sur tous les modèles disponibles.');
}

/**
 * Génère une réponse multimodale (ex: transcription audio, analyse d'image)
 */
export async function generateMultimodalWithGemini({
  parts,
  systemInstruction = null,
  maxTokens = 250,
  temperature = 0.2,
  geminiKey = null
}) {
  const config = getConfig();
  const key = geminiKey || config.speech?.geminiApiKey || process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error('Clé API Gemini introuvable.');
  }

  const candidateModels = await getCandidateModels(key);
  let lastError = null;

  for (const model of candidateModels) {
    for (const ver of ['v1beta', 'v1']) {
      try {
        const url = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${key}`;
        
        const requestBody = {
          contents: [{ parts }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature
          }
        };

        if (systemInstruction) {
          requestBody.systemInstruction = {
            parts: [{ text: systemInstruction }]
          };
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            return { text, model, apiVersion: ver };
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          lastError = new Error(`HTTP ${res.status} [${model}]: ${errData.error?.message || res.statusText}`);
          if (res.status === 404 || res.status === 503 || res.status === 429) continue;
        }
      } catch (err) {
        lastError = err;
      }
    }
  }

  throw lastError || new Error('Échec de la requête multimodale Gemini.');
}
