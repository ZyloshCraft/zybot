import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getConfig } from '../config.js';

/**
 * Convertit un buffer audio WhatsApp (OGG Opus) en WAV 16kHz mono
 * @param {Buffer} audioBuffer
 * @returns {Promise<string>} Chemin du fichier WAV généré
 */
export async function convertOggToWav(audioBuffer) {
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `voice_${Date.now()}_in.ogg`);
  const outputPath = path.join(tempDir, `voice_${Date.now()}_out.wav`);

  fs.writeFileSync(inputPath, audioBuffer);

  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      '-y', outputPath
    ];

    const proc = spawn('ffmpeg', args);

    proc.on('close', (code) => {
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      } catch {}

      if (code === 0 && fs.existsSync(outputPath)) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg audio conversion failed with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      } catch {}
      reject(err);
    });
  });
}

/**
 * Récupère les clés API configurées (depuis config.json ou les fichiers .env possibles)
 */
export function getSpeechKeys() {
  const possiblePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(os.homedir(), '.env'),
    path.resolve(os.homedir(), 'zybot/.env')
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        for (const line of raw.split('\n')) {
          const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
          if (m) {
            const k = m[1];
            const v = (m[2] || '').trim().replace(/^['"]|['"]$/g, '');
            if (v && !process.env[k]) {
              process.env[k] = v;
            }
          }
        }
      }
    } catch {}
  }

  const config = getConfig();
  return {
    groqKey: config.speech?.groqApiKey || process.env.GROQ_API_KEY,
    geminiKey: config.speech?.geminiApiKey || process.env.GEMINI_API_KEY
  };
}

/**
 * Transcrit un fichier audio WAV en texte
 * @param {string} wavPath - Chemin vers le fichier WAV
 * @returns {Promise<string>}
 */
export async function transcribeAudioFile(wavPath) {
  const { groqKey, geminiKey } = getSpeechKeys();

  // 1. Transcription ultra-rapide via Groq Whisper (gratuit, ~0.3 seconde)
  if (groqKey) {
    const audioData = fs.readFileSync(wavPath);
    const formData = new FormData();
    const blob = new Blob([audioData], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'fr');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`
      },
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      if (data.text) return data.text.trim();
    }
  }

  // 2. Transcription via Gemini API si clé configurée
  if (geminiKey) {
    const audioBase64 = fs.readFileSync(wavPath).toString('base64');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${geminiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: 'Transcris fidèlement cet enregistrement audio en français. Ne rajoute aucun commentaire ni préambule, uniquement le texte exact prononcé.'
              },
              {
                inlineData: {
                  mimeType: 'audio/wav',
                  data: audioBase64
                }
              }
            ]
          }
        ]
      })
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text.trim();
    }
  }

  // 3. Fallback sans clé : API publique Speech
  // Si aucune clé n'est renseignée, on renvoie une aide claire
  throw new Error(
    'Pour activer la transcription vocale instantanée, ajoutez votre clé gratuite Groq (Whisper) ou Gemini dans config.json ("speech": { "groqApiKey": "..." }).'
  );
}

/**
 * Résume un message ou un texte vocal en 1 à 2 phrases directes et naturelles
 * @param {string} text - Contenu à résumer
 * @returns {Promise<string>}
 */
export async function summarizeBriefly(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Aucun texte à résumer.');
  }

  const cleanText = text.trim();
  if (cleanText.length < 25) {
    return cleanText;
  }

  const { groqKey, geminiKey } = getSpeechKeys();
  const prompt = `Voici un message (ou la transcription d'une note vocale) reçu sur WhatsApp :\n"""\n${cleanText}\n"""\n\nRésume en 1 à 2 phrases directes et naturelles en français ce que la personne veut, demande ou dit d'important. Reste très concis, sans fioritures ni formule de politesse.`;

  // 1. Tenter Groq (ultra-rapide, ~0.2s)
  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 180,
          temperature: 0.3
        })
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) return content;
      }
    } catch {}
  }

  // 2. Tenter Gemini
  if (geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 180,
            temperature: 0.3
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (content) return content;
      }
    } catch {}
  }

  throw new Error('Pour utiliser /bref, ajoutez une clé gratuite Groq ou Gemini dans config.json ("speech": { "groqApiKey": "..." ou "geminiApiKey": "..." }).');
}
