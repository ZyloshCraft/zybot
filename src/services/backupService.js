import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { loadGroupActivity } from './groupActivityStore.js';
import { loadScheduled } from './scheduler.js';
import { loadMacros } from './macroStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

export const DATA_FILES = [
  'config.json',
  'warns.json',
  'group_activity.json',
  'message_history.json',
  'permissions.json',
  'persopings.json',
  'giveaways.json',
  'anti_raid.json',
  'antidelete_history.json',
  'audit_logs.json',
  'scheduled_messages.json',
  'macros.json',
  'stats.json'
];

const MEDIA_DIRS = ['scheduled_media', 'macros_media'];

// Table CRC32 standard pour ZIP (compatible Node 18/20/24)
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Construit un buffer ZIP valide en mémoire sans dépendance externe
 * @param {{ name: string, data: Buffer }[]} entries
 * @returns {Buffer}
 */
export function buildZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  const now = new Date();
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((now.getSeconds() >> 1) & 0x1f);
  const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0x0f) << 5) | (now.getDate() & 0x1f);

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf-8');
    const raw = entry.data;
    const compressed = zlib.deflateRawSync(raw);
    const crc = crc32(raw);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirSize = centralParts.reduce((acc, b) => acc + b.length, 0);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirSize, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, endRecord]);
}

/**
 * Parse un buffer ZIP standard en mémoire sans dépendance externe
 * @param {Buffer} buf
 * @returns {{ name: string, data: Buffer }[]}
 */
export function parseZipBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) {
    throw new Error('Fichier ZIP invalide ou vide.');
  }

  // Trouver l'End of Central Directory (0x06054b50) depuis la fin
  let eocdOffset = -1;
  const minOffset = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Signature ZIP introuvable (archive corrompue).');
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let ptr = cdOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error('En-tête central ZIP invalide.');
    }

    const method = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);

    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf-8');
    ptr += 46 + nameLen + extraLen + commentLen;

    // Ignorer les entrées de dossiers
    if (name.endsWith('/')) continue;

    if (localHeaderOffset + 30 > buf.length || buf.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`En-tête local ZIP invalide pour ${name}.`);
    }

    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressedData = buf.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) {
      data = Buffer.from(compressedData);
    } else if (method === 8) {
      data = zlib.inflateRawSync(compressedData);
    } else {
      throw new Error(`Méthode de compression ZIP non supportée (${method}) pour ${name}.`);
    }

    entries.push({ name, data });
  }

  return entries;
}

/**
 * Génère une archive ZIP complète de toutes les données du bot (config, tops, messages, warns, médias...)
 */
export function createBackupBuffer() {
  const entries = [];

  for (const file of DATA_FILES) {
    const fullPath = path.join(ROOT_DIR, file);
    if (fs.existsSync(fullPath)) {
      try {
        entries.push({
          name: file,
          data: fs.readFileSync(fullPath)
        });
      } catch (err) {
        console.warn(`[Backup] Impossible de lire ${file}:`, err.message);
      }
    }
  }

  for (const dirName of MEDIA_DIRS) {
    const dirPath = path.join(ROOT_DIR, dirName);
    if (fs.existsSync(dirPath)) {
      try {
        for (const f of fs.readdirSync(dirPath)) {
          const fullFile = path.join(dirPath, f);
          if (fs.statSync(fullFile).isFile()) {
            entries.push({
              name: `${dirName}/${f}`,
              data: fs.readFileSync(fullFile)
            });
          }
        }
      } catch (err) {
        console.warn(`[Backup] Erreur lecture dossier ${dirName}:`, err.message);
      }
    }
  }

  return {
    buffer: buildZipBuffer(entries),
    filesCount: entries.length,
    includedFiles: entries.map((e) => e.name)
  };
}

function isAllowedRestoreEntry(entryName) {
  if (!entryName || entryName.includes('..') || entryName.startsWith('/') || entryName.startsWith('\\')) {
    return false;
  }
  const normalized = entryName.replace(/\\/g, '/');
  if (DATA_FILES.includes(normalized)) return true;
  for (const dirName of MEDIA_DIRS) {
    if (normalized.startsWith(`${dirName}/`) && !normalized.slice(dirName.length + 1).includes('/')) {
      return true;
    }
  }
  return false;
}

function rewriteMediaPathsForCurrentHost(fileName, parsedJson) {
  if (fileName === 'scheduled_messages.json' && Array.isArray(parsedJson)) {
    return parsedJson.map((item) => {
      if (item?.media?.path) {
        const base = path.basename(item.media.path);
        item.media.path = path.join(ROOT_DIR, 'scheduled_media', base);
      }
      return item;
    });
  }
  if (fileName === 'macros.json' && Array.isArray(parsedJson)) {
    return parsedJson.map((item) => {
      if (item?.media?.path) {
        const base = path.basename(item.media.path);
        item.media.path = path.join(ROOT_DIR, 'macros_media', base);
      }
      return item;
    });
  }
  return parsedJson;
}

/**
 * Restaure toutes les données du bot depuis un buffer ZIP exporté
 * @param {Buffer} zipBuffer
 */
export function restoreBackupFromZip(zipBuffer) {
  const entries = parseZipBuffer(zipBuffer);
  if (!entries.length) {
    throw new Error('L\'archive ZIP ne contient aucun fichier.');
  }

  const restoredFiles = [];
  const skippedFiles = [];

  for (const entry of entries) {
    const normalizedName = entry.name.replace(/\\/g, '/');
    if (!isAllowedRestoreEntry(normalizedName)) {
      skippedFiles.push(normalizedName);
      continue;
    }

    const targetPath = path.join(ROOT_DIR, normalizedName);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    if (normalizedName.endsWith('.json')) {
      let parsed;
      try {
        parsed = JSON.parse(entry.data.toString('utf-8'));
      } catch {
        throw new Error(`Fichier JSON invalide dans l'archive : ${normalizedName}`);
      }
      const adjusted = rewriteMediaPathsForCurrentHost(normalizedName, parsed);
      fs.writeFileSync(targetPath, JSON.stringify(adjusted, null, 2), 'utf-8');
    } else {
      fs.writeFileSync(targetPath, entry.data);
    }

    restoredFiles.push(normalizedName);
  }

  if (!restoredFiles.length) {
    throw new Error('Aucun fichier ZyBot valide trouvé dans cette archive.');
  }

  // Recharger les caches principaux en mémoire
  try { loadConfig(); } catch {}
  try { loadGroupActivity(); } catch {}
  try { loadScheduled(); } catch {}
  try { loadMacros(); } catch {}

  return { restoredFiles, skippedFiles };
}
