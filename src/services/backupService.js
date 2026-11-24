import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const BACKUPS_DIR = path.resolve(ROOT_DIR, 'backups');

const DATA_FILES = [
  'config.json',
  'warns.json',
  'group_activity.json',
  'permissions.json',
  'persopings.json',
  'giveaways.json',
  'contacts.json',
  'anti_raid.json',
  'antidelete_history.json',
  'audit_logs.json',
  'scheduled_messages.json',
  'macros.json',
  'stats.json'
];

let backupIntervalId = null;

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

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(8, 8); // compression: deflate
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra len

    localParts.push(localHeader, nameBuf, compressed);

    // Central directory header (46 bytes + name)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(8, 10); // compression: deflate
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra len
    centralHeader.writeUInt16LE(0, 32); // comment len
    centralHeader.writeUInt16LE(0, 34); // disk start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
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

export function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
  return BACKUPS_DIR;
}

/**
 * Génère une archive ZIP complète des données critiques du bot
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
  return {
    buffer: buildZipBuffer(entries),
    filesCount: entries.length
  };
}

/**
 * Sauvegarde un backup sur disque avec rotation sur 7 jours
 */
export function saveBackupSnapshot(maxKeep = 7) {
  ensureBackupsDir();
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const fileName = `zybot-backup-${y}-${m}-${d}.zip`;
  const targetPath = path.join(BACKUPS_DIR, fileName);

  const { buffer, filesCount } = createBackupBuffer();
  fs.writeFileSync(targetPath, buffer);

  // Rotation des anciens backups
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter((f) => f.startsWith('zybot-backup-') && f.endsWith('.zip'))
    .sort()
    .reverse();

  for (let i = maxKeep; i < files.length; i++) {
    try {
      fs.unlinkSync(path.join(BACKUPS_DIR, files[i]));
    } catch {}
  }

  return { fileName, path: targetPath, size: buffer.length, filesCount };
}

export function listBackups() {
  ensureBackupsDir();
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter((f) => f.startsWith('zybot-backup-') && f.endsWith('.zip'))
    .sort()
    .reverse();

  return files.map((fileName) => {
    const fullPath = path.join(BACKUPS_DIR, fileName);
    const stat = fs.statSync(fullPath);
    return {
      fileName,
      size: stat.size,
      createdAt: stat.mtimeMs
    };
  });
}

export function getBackupFilePath(fileName) {
  if (!fileName || fileName.includes('..') || fileName.includes('/') || !fileName.endsWith('.zip')) {
    return null;
  }
  const fullPath = path.join(BACKUPS_DIR, fileName);
  return fs.existsSync(fullPath) ? fullPath : null;
}

/**
 * Démarre la sauvegarde automatique quotidienne
 */
export function startAutoBackup() {
  if (backupIntervalId) return;

  const checkAndRun = () => {
    try {
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      const todayName = `zybot-backup-${y}-${m}-${d}.zip`;
      ensureBackupsDir();
      if (!fs.existsSync(path.join(BACKUPS_DIR, todayName))) {
        const res = saveBackupSnapshot(7);
        console.log(`💾 [Backup] Sauvegarde quotidienne créée : ${res.fileName} (${res.filesCount} fichiers, ${(res.size / 1024).toFixed(1)} Ko)`);
      }
    } catch (err) {
      console.error('[Backup] Erreur sauvegarde automatique:', err.message);
    }
  };

  checkAndRun();
  backupIntervalId = setInterval(checkAndRun, 6 * 60 * 60 * 1000);
}
