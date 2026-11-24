import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendStealthMessage } from '../utils/stealth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MACROS_FILE = path.resolve(__dirname, '../../macros.json');
const MACROS_MEDIA_DIR = path.resolve(__dirname, '../../macros_media');

let macrosCache = null;

function ensureMacrosMediaDir() {
  if (!fs.existsSync(MACROS_MEDIA_DIR)) {
    fs.mkdirSync(MACROS_MEDIA_DIR, { recursive: true });
  }
  return MACROS_MEDIA_DIR;
}

export function normalizeMacroName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

export function loadMacros() {
  try {
    if (fs.existsSync(MACROS_FILE)) {
      const raw = fs.readFileSync(MACROS_FILE, 'utf-8');
      macrosCache = JSON.parse(raw);
    } else {
      macrosCache = [];
      saveMacros(macrosCache);
    }
  } catch (err) {
    console.error('[Macros] Erreur chargement macros.json:', err.message);
    macrosCache = [];
  }
  return Array.isArray(macrosCache) ? macrosCache : [];
}

export function saveMacros(list) {
  try {
    macrosCache = list;
    fs.writeFileSync(MACROS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Macros] Erreur sauvegarde macros.json:', err.message);
  }
}

export function listMacros() {
  const list = loadMacros();
  return list
    .map((m) => ({
      ...m,
      hasMedia: Boolean(m.media && m.media.path && fs.existsSync(m.media.path))
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getMacro(name) {
  const clean = normalizeMacroName(name);
  if (!clean) return null;
  const list = loadMacros();
  return list.find((m) => m.name === clean) || null;
}

export function upsertMacro({ name, text = '', media = null, keepExistingMedia = false }) {
  const clean = normalizeMacroName(name);
  if (!clean) throw new Error('Nom de macro invalide (lettres, chiffres, - et _ uniquement).');

  const list = loadMacros();
  const existingIdx = list.findIndex((m) => m.name === clean);
  const existing = existingIdx !== -1 ? list[existingIdx] : null;

  let finalMedia = null;
  if (media && (media.base64 || media.buffer)) {
    ensureMacrosMediaDir();
    // Supprimer l'ancien média s'il existait
    if (existing?.media?.path && fs.existsSync(existing.media.path)) {
      try {
        fs.unlinkSync(existing.media.path);
      } catch {}
    }

    const buffer = media.buffer
      ? media.buffer
      : Buffer.from(String(media.base64).replace(/^data:[^;]+;base64,/, ''), 'base64');
    const safeBase = (media.fileName || `${clean}.bin`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const diskPath = path.join(MACROS_MEDIA_DIR, `${clean}_${Date.now()}_${safeBase}`);
    fs.writeFileSync(diskPath, buffer);

    finalMedia = {
      type: media.type || 'image',
      fileName: media.fileName || safeBase,
      mimetype: media.mimetype || 'application/octet-stream',
      size: buffer.length,
      path: diskPath
    };
  } else if (keepExistingMedia && existing?.media) {
    finalMedia = existing.media;
  } else if (existing?.media?.path && fs.existsSync(existing.media.path)) {
    // Média retiré
    try {
      fs.unlinkSync(existing.media.path);
    } catch {}
  }

  const now = Date.now();
  const entry = {
    name: clean,
    text: String(text || '').trim(),
    media: finalMedia,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existingIdx !== -1) {
    list[existingIdx] = entry;
  } else {
    list.push(entry);
  }

  saveMacros(list);
  return entry;
}

export function deleteMacro(name) {
  const clean = normalizeMacroName(name);
  if (!clean) return false;

  const list = loadMacros();
  const idx = list.findIndex((m) => m.name === clean);
  if (idx === -1) return false;

  const [removed] = list.splice(idx, 1);
  if (removed?.media?.path && fs.existsSync(removed.media.path)) {
    try {
      fs.unlinkSync(removed.media.path);
    } catch {}
  }

  saveMacros(list);
  return true;
}

export async function dispatchMacro(sock, jid, macro, options = {}) {
  if (!sock || !macro) throw new Error('Socket ou macro invalide');
  const hasMedia = macro.media && macro.media.path && fs.existsSync(macro.media.path);

  if (hasMedia) {
    const buffer = fs.readFileSync(macro.media.path);
    const mType = (macro.media.type || 'image').toLowerCase();
    let payload;
    if (mType === 'image') {
      payload = { image: buffer, caption: macro.text || '', mimetype: macro.media.mimetype || 'image/jpeg' };
    } else if (mType === 'video') {
      payload = { video: buffer, caption: macro.text || '', mimetype: macro.media.mimetype || 'video/mp4' };
    } else if (mType === 'audio') {
      payload = { audio: buffer, mimetype: macro.media.mimetype || 'audio/mp4', ptt: false };
    } else if (mType === 'document') {
      payload = {
        document: buffer,
        mimetype: macro.media.mimetype || 'application/octet-stream',
        fileName: macro.media.fileName || 'document',
        caption: macro.text || ''
      };
    } else {
      payload = { text: macro.text || '' };
    }
    return await sendStealthMessage(sock, jid, payload, options);
  }

  return await sendStealthMessage(sock, jid, { text: macro.text || '' }, options);
}
