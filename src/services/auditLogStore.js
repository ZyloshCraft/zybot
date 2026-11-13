import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIT_FILE = path.resolve(__dirname, '../../audit_logs.json');

const MAX_LOGS = 500;
let auditLogs = [];
let saveTimeout = null;

export function loadAuditLogs() {
  try {
    if (fs.existsSync(AUDIT_FILE)) {
      const raw = fs.readFileSync(AUDIT_FILE, 'utf-8');
      auditLogs = JSON.parse(raw);
      if (!Array.isArray(auditLogs)) auditLogs = [];
    }
  } catch (err) {
    console.error('[AuditLog] Erreur chargement audit_logs.json:', err.message);
    auditLogs = [];
  }
}

export function saveAuditLogsSync() {
  try {
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(auditLogs.slice(-MAX_LOGS), null, 2), 'utf-8');
  } catch (err) {
    console.error('[AuditLog] Erreur sauvegarde audit_logs.json:', err.message);
  }
}

function scheduleSave() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    saveAuditLogsSync();
  }, 2000);
}

// Initialiser au chargement
loadAuditLogs();

/**
 * Enregistre un événement dans le journal d'audit
 * @param {object} log
 * @param {'command'|'moderation'|'security'|'lock'|'system'} log.type
 * @param {string} log.action
 * @param {string} [log.user]
 * @param {string} [log.pushName]
 * @param {string} [log.chatJid]
 * @param {string} [log.chatName]
 * @param {string} [log.details]
 * @param {'success'|'warning'|'error'} [log.status='success']
 */
export function recordAuditLog(log) {
  if (!log) return;

  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: log.timestamp || Date.now(),
    type: log.type || 'system',
    action: log.action || 'ACTION',
    user: log.user || 'Système',
    pushName: log.pushName || '',
    chatJid: log.chatJid || '',
    chatName: log.chatName || '',
    details: log.details || '',
    status: log.status || 'success'
  };

  auditLogs.push(entry);
  if (auditLogs.length > MAX_LOGS) {
    auditLogs.shift();
  }

  scheduleSave();
}

/**
 * Récupère les logs avec filtres optionnels
 */
export function getAuditLogs({ limit = 100, type = null, search = null } = {}) {
  let list = [...auditLogs];

  if (type && type !== 'all') {
    list = list.filter((l) => l.type === type);
  }

  if (search && search.trim()) {
    const q = search.toLowerCase().trim();
    list = list.filter(
      (l) =>
        (l.action && l.action.toLowerCase().includes(q)) ||
        (l.user && l.user.toLowerCase().includes(q)) ||
        (l.pushName && l.pushName.toLowerCase().includes(q)) ||
        (l.chatName && l.chatName.toLowerCase().includes(q)) ||
        (l.details && l.details.toLowerCase().includes(q))
    );
  }

  // Trier du plus récent au plus ancien
  return list.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

export function clearAuditLogs() {
  auditLogs = [];
  saveAuditLogsSync();
}
