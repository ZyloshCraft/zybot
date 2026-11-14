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
  return ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'];
}

/**
 * Sélectionne les meilleurs modèles à tenter dans l'ordre de priorité
 */
export async function getCandidateModels(apiKey) {
  const dynamic = await getSupportedGeminiModels(apiKey);

  // Ordre de préférence souhaité
  const preferences = [
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro-latest',
    'gemini-1.5-pro'
  ];

  const candidates = [];

  // 1. Ajouter les modèles dynamiques selon nos préférences
  for (const pref of preferences) {
    const match = dynamic.find((m) => m === pref || m.includes(pref));
    if (match && !candidates.includes(match)) {
      candidates.push(match);
    }
  }

  // 2. Ajouter les autres modèles supportés non encore ajoutés
  for (const m of dynamic) {
    if (!candidates.includes(m)) {
      candidates.push(m);
    }
  }

  // 3. Fallback dur si aucun modèle détecté
  if (candidates.length === 0) {
    candidates.push('gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash');
  }

  return candidates;
}

/**
 * Génère du texte avec Gemini en gérant automatiquement le fallback de modèles et de versions d'API
 */
export async function generateWithGemini({
  prompt,
  systemInstruction = null,
  maxTokens = 450,
  temperature = 0.3,
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
        
        const contents = [];
        if (systemInstruction) {
          contents.push({
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\n${prompt}` }]
          });
        } else {
          contents.push({
            parts: [{ text: prompt }]
          });
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature
            }
          })
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            return {
              text,
              model,
              apiVersion: ver
            };
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          lastError = new Error(`HTTP ${res.status} [${model} / ${ver}]: ${errData.error?.message || res.statusText}`);
          
          // Si l'erreur est un 404 de modèle, tenter le suivant immédiatement
          if (res.status === 404) {
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
        
        const fullParts = [];
        if (systemInstruction) {
          fullParts.push({ text: systemInstruction });
        }
        fullParts.push(...parts);

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: fullParts }],
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature
            }
          })
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
          if (res.status === 404) continue;
        }
      } catch (err) {
        lastError = err;
      }
    }
  }

  throw lastError || new Error('Échec de la requête multimodale Gemini.');
}
