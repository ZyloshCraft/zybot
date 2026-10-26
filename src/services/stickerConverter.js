import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Convertit un buffer image ou vidéo courte en buffer Sticker WebP (512x512)
 * @param {Buffer} inputBuffer - Données brutes du média
 * @param {string} mimeType - ex: 'image/jpeg', 'video/mp4'
 * @returns {Promise<Buffer>}
 */
export async function convertToStickerWebp(inputBuffer, mimeType = 'image/jpeg') {
  const isVideo = mimeType.startsWith('video') || mimeType.includes('gif');
  const tempDir = os.tmpdir();
  const inputExt = isVideo ? '.mp4' : '.png';
  const inputFile = path.join(tempDir, `sticker_in_${Date.now()}_${Math.random().toString(36).substring(2)}${inputExt}`);
  const outputFile = path.join(tempDir, `sticker_out_${Date.now()}_${Math.random().toString(36).substring(2)}.webp`);

  fs.writeFileSync(inputFile, inputBuffer);

  return new Promise((resolve, reject) => {
    let args = [];

    if (isVideo) {
      // Pour les vidéos ou GIFs animés (durée max 6s, 15 fps, boucle infinie)
      args = [
        '-i', inputFile,
        '-vcodec', 'libwebp',
        '-filter:v', "scale='if(gt(a,1),512,-1)':'if(gt(a,1),-1,512)',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=15",
        '-loop', '0',
        '-ss', '00:00:00',
        '-t', '00:00:06',
        '-preset', 'default',
        '-an',
        '-vsync', '0',
        '-s', '512:512',
        '-y', outputFile
      ];
    } else {
      // Pour les images fixes
      args = [
        '-i', inputFile,
        '-vcodec', 'libwebp',
        '-filter:v', "scale='if(gt(a,1),512,-1)':'if(gt(a,1),-1,512)',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
        '-y', outputFile
      ];
    }

    const proc = spawn('ffmpeg', args);

    proc.on('close', (code) => {
      try {
        if (code === 0 && fs.existsSync(outputFile)) {
          const webpData = fs.readFileSync(outputFile);
          resolve(webpData);
        } else {
          reject(new Error(`FFmpeg a échoué avec le code ${code}`));
        }
      } catch (err) {
        reject(err);
      } finally {
        try {
          if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
          if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
        } catch {}
      }
    });

    proc.on('error', (err) => {
      try {
        if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
      } catch {}
      reject(err);
    });
  });
}

/**
 * Convertit un sticker WebP en image standard (PNG) ou en vidéo MP4 si animé
 * @param {Buffer} inputBuffer - Données du sticker WebP
 * @param {boolean} [isAnimated=false] - Si le sticker est animé
 * @returns {Promise<{ buffer: Buffer, isVideo: boolean, mimeType: string }>}
 */
export async function convertStickerToMedia(inputBuffer, isAnimated = false) {
  const tempDir = os.tmpdir();
  const inputFile = path.join(tempDir, `stk_in_${Date.now()}_${Math.random().toString(36).substring(2)}.webp`);
  const outputFile = path.join(tempDir, `stk_out_${Date.now()}_${Math.random().toString(36).substring(2)}.${isAnimated ? 'mp4' : 'png'}`);

  fs.writeFileSync(inputFile, inputBuffer);

  return new Promise((resolve, reject) => {
    let args = [];

    if (isAnimated) {
      // Pour les stickers animés -> MP4 compatible WhatsApp
      args = [
        '-i', inputFile,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2',
        '-y', outputFile
      ];
    } else {
      // Pour les stickers fixes -> PNG
      args = [
        '-i', inputFile,
        '-y', outputFile
      ];
    }

    const proc = spawn('ffmpeg', args);

    proc.on('close', (code) => {
      try {
        if (code === 0 && fs.existsSync(outputFile)) {
          const mediaData = fs.readFileSync(outputFile);
          resolve({
            buffer: mediaData,
            isVideo: isAnimated,
            mimeType: isAnimated ? 'video/mp4' : 'image/png'
          });
        } else {
          // Si l'encodage vidéo échoue (ex: faux sticker animé), repli sur PNG fixe
          if (isAnimated) {
            return convertStickerToMedia(inputBuffer, false).then(resolve).catch(reject);
          }
          reject(new Error(`FFmpeg a échoué avec le code ${code}`));
        }
      } catch (err) {
        reject(err);
      } finally {
        try {
          if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
          if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
        } catch {}
      }
    });

    proc.on('error', (err) => {
      try {
        if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
      } catch {}
      reject(err);
    });
  });
}
