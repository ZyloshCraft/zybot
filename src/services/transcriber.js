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
 * Transcrit un fichier audio WAV en texte
 * @param {string} wavPath - Chemin vers le fichier WAV
 * @returns {Promise<string>}
 */
export async function transcribeAudioFile(wavPath) {
  const config = getConfig();
  const groqKey = config.speech?.groqApiKey || process.env.GROQ_API_KEY;
  const geminiKey = config.speech?.geminiApiKey || process.env.GEMINI_API_KEY;

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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;

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
