import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Télécharge une vidéo TikTok sans filigrane via TikWM
 * @param {string} url
 * @returns {Promise<{ videoUrl: string, title: string, author: string }>}
 */
async function downloadTikTok(url) {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  if (!res.ok) {
    throw new Error(`TikWM HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.code !== 0 || !json.data?.play) {
    throw new Error(json.msg || 'Impossible d\'extraire la vidéo TikTok');
  }

  return {
    title: json.data.title || 'Vidéo TikTok',
    videoUrl: json.data.play,
    author: json.data.author?.nickname || 'Auteur inconnu'
  };
}

/**
 * Récupère le binaire yt-dlp prioritaire (/usr/local/bin en premier si présent)
 */
function getYtDlpBinary() {
  if (fs.existsSync('/usr/local/bin/yt-dlp')) return '/usr/local/bin/yt-dlp';
  return 'yt-dlp';
}

/**
 * Télécharge une vidéo via yt-dlp si le binaire est disponible
 * @param {string} url
 * @param {Function} [onProgress]
 * @returns {Promise<{ buffer: Buffer, title: string }>}
 */
async function downloadWithYtDlp(url, onProgress = null) {
  const tempDir = os.tmpdir();
  const filePrefix = `ytdl_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  const outputPath = path.join(tempDir, `${filePrefix}.%(ext)s`);
  const bin = getYtDlpBinary();

  return new Promise((resolve, reject) => {
    // Limiter la taille à 50Mo pour WhatsApp, forcer MP4 et contourner SABR YouTube
    const args = [
      url,
      '--extractor-args', 'youtube:player_client=ios,android,web',
      '--no-simulate',
      '-f', 'best[filesize<50M]/bestvideo[filesize<40M]+bestaudio/best',
      '-o', outputPath,
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--max-filesize', '50M',
      '--print', '%(title)s',
      '--progress'
    ];

    const proc = spawn(bin, args);

    let stdout = '';
    let stderr = '';

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.stdout.on('data', (d) => {
      const str = d.toString();
      stdout += str;

      if (onProgress) {
        // [download]  45.2% of ~  25.40MiB at    3.20MiB/s
        const match = str.match(/\[download\]\s+([0-9.]+)%\s+of\s+~?\s*([0-9.]+[A-Za-z]+)(?:\s+at\s+([0-9.]+[A-Za-z/]+))?/i);
        if (match) {
          onProgress({
            percent: parseFloat(match[1]),
            total: match[2],
            speed: match[3] || ''
          });
        }
      }
    });

    proc.on('close', (code) => {
      let foundPath = null;
      try {
        const files = fs.readdirSync(tempDir);
        // Chercher un .mp4 en priorité, sinon n'importe quel fichier complet généré
        const mp4Match = files.find((f) => f.startsWith(filePrefix) && f.endsWith('.mp4'));
        if (mp4Match) {
          foundPath = path.join(tempDir, mp4Match);
        } else {
          const anyMatch = files.find((f) => f.startsWith(filePrefix) && !f.endsWith('.part') && !f.endsWith('.ytdl'));
          if (anyMatch) foundPath = path.join(tempDir, anyMatch);
        }
      } catch {}

      if (code === 0 && foundPath && fs.existsSync(foundPath)) {
        try {
          const buffer = fs.readFileSync(foundPath);
          const lines = stdout.trim().split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('['));
          const title = lines[0] || 'Vidéo téléchargée';
          resolve({ buffer, title });
        } catch (err) {
          reject(err);
        } finally {
          try {
            if (foundPath && fs.existsSync(foundPath)) fs.unlinkSync(foundPath);
          } catch {}
        }
      } else {
        console.error('[YtDlp Video Error] Code:', code, 'Stderr:', stderr);
        try {
          if (foundPath && fs.existsSync(foundPath)) fs.unlinkSync(foundPath);
        } catch {}

        if (stderr.includes('ffmpeg') || stderr.includes('ffprobe')) {
          reject(new Error("FFmpeg est manquant sur votre Pi. Installez-le avec :\n`sudo apt update && sudo apt install -y ffmpeg`"));
        } else if (code !== 0 && stderr.includes('The page needs to be reloaded')) {
          reject(new Error("La version de yt-dlp utilisée est obsolète face aux changements YouTube. Mettez-la à jour avec :\n`sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp`"));
        } else if (code === 0 && !foundPath) {
          reject(new Error("Le fichier vidéo n'a pas été trouvé sur le disque après téléchargement."));
        } else {
          reject(new Error(stderr || `yt-dlp a quitté avec le code ${code}`));
        }
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Tente d'extraire la vidéo en parsant les balises OpenGraph (og:video)
 * @param {string} url
 */
async function extractOpenGraphVideo(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const ogVideoMatch = html.match(/<meta\s+property=["']og:video["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:video["']/i);
  const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);

  if (ogVideoMatch && ogVideoMatch[1]) {
    return {
      videoUrl: ogVideoMatch[1].replace(/&amp;/g, '&'),
      title: ogTitleMatch?.[1] || 'Vidéo'
    };
  }

  throw new Error('Aucune vidéo OpenGraph trouvée');
}

/**
 * Téléchargeur universel de média (TikTok, Instagram, Twitter, YouTube Shorts, etc.)
 * @param {string} rawUrl
 * @param {Function} [onProgress]
 * @returns {Promise<{ buffer: Buffer, title: string, author?: string }>}
 */
export async function downloadSocialMedia(rawUrl, onProgress = null) {
  const url = rawUrl.trim();

  // 1. TikTok
  if (url.includes('tiktok.com')) {
    try {
      const { videoUrl, title, author } = await downloadTikTok(url);
      const videoRes = await fetch(videoUrl);
      if (!videoRes.ok) throw new Error(`Échec téléchargement direct MP4 : HTTP ${videoRes.status}`);
      const arrayBuffer = await videoRes.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuffer),
        title,
        author
      };
    } catch (err) {
      console.warn('[Downloader] TikWM a échoué, essai fallback:', err.message);
    }
  }

  // 2. yt-dlp si disponible
  let ytdlpError = null;
  try {
    return await downloadWithYtDlp(url, onProgress);
  } catch (err) {
    ytdlpError = err;
    console.warn('[Downloader] yt-dlp a échoué, essai fallback OpenGraph:', err.message);
  }

  // 3. Fallback OpenGraph
  try {
    const { videoUrl, title } = await extractOpenGraphVideo(url);
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`HTTP ${videoRes.status}`);
    const arrayBuffer = await videoRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      title
    };
  } catch (err) {
    if (ytdlpError) throw ytdlpError;
    throw new Error('Impossible d\'extraire ce média automatiquement. Vérifiez que le lien est public.');
  }
}

/**
 * Télécharge une piste audio (recherche YouTube ou URL directe) via yt-dlp
 * @param {string} queryOrUrl - Titre de musique ou URL
 * @returns {Promise<{ buffer: Buffer, title: string, artist: string, duration: string }>}
 */
export async function downloadAudioTrack(queryOrUrl) {
  const isUrl = /^https?:\/\//i.test(queryOrUrl.trim());
  const target = isUrl ? queryOrUrl.trim() : `ytsearch1:${queryOrUrl.trim()}`;
  const tempDir = os.tmpdir();
  const filePrefix = `music_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  const outputPath = path.join(tempDir, `${filePrefix}.%(ext)s`);
  const bin = getYtDlpBinary();

  return new Promise((resolve, reject) => {
    const args = [
      target,
      '--extractor-args', 'youtube:player_client=ios,android,web',
      '--no-simulate',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', outputPath,
      '--no-playlist',
      '--max-filesize', '40M',
      '--print', '%(title)s',
      '--print', '%(uploader)s',
      '--print', '%(duration_string)s'
    ];

    const proc = spawn(bin, args);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      const expectedMp3 = path.join(tempDir, `${filePrefix}.mp3`);
      let foundPath = fs.existsSync(expectedMp3) ? expectedMp3 : null;

      if (!foundPath) {
        try {
          const files = fs.readdirSync(tempDir);
          const match = files.find((f) => f.startsWith(filePrefix));
          if (match) foundPath = path.join(tempDir, match);
        } catch {}
      }

      if (code === 0 && foundPath && fs.existsSync(foundPath)) {
        try {
          const lines = stdout.trim().split('\n').map((l) => l.trim()).filter(Boolean);
          const title = lines[0] || queryOrUrl;
          const artist = lines[1] || 'Artiste inconnu';
          const duration = lines[2] || '';

          const buffer = fs.readFileSync(foundPath);
          resolve({ buffer, title, artist, duration });
        } catch (err) {
          reject(err);
        } finally {
          try {
            if (foundPath && fs.existsSync(foundPath)) fs.unlinkSync(foundPath);
          } catch {}
        }
      } else {
        console.error('[YtDlp Audio Error] Code:', code, 'Stderr:', stderr);
        try {
          if (foundPath && fs.existsSync(foundPath)) fs.unlinkSync(foundPath);
        } catch {}

        if (stderr.includes('ffmpeg') || stderr.includes('ffprobe')) {
          reject(new Error("FFmpeg est manquant sur votre Pi (indispensable pour convertir l'audio en MP3). Installez-le avec :\n`sudo apt update && sudo apt install -y ffmpeg`"));
        } else if (code !== 0 && stderr.includes('The page needs to be reloaded')) {
          reject(new Error("La version de yt-dlp utilisée est obsolète face aux changements YouTube. Mettez-la à jour avec :\n`sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp`"));
        } else if (code === 0 && !foundPath) {
          reject(new Error("Le fichier audio MP3 n'a pas pu être extrait. Vérifiez que ffmpeg est bien installé (`sudo apt install ffmpeg`)."));
        } else {
          reject(new Error(stderr || `yt-dlp a quitté avec le code ${code}. Vérifiez que yt-dlp et ffmpeg sont bien installés sur votre machine (\`sudo apt install yt-dlp ffmpeg\`).`));
        }
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Impossible d'exécuter yt-dlp (${bin}) : ${err.message}. Installez yt-dlp avec \`sudo apt install yt-dlp\` ou \`pip install yt-dlp\`.`));
    });
  });
}
