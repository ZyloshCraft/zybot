import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../config.js';
import { listScheduledMessages } from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATS_FILE = path.resolve(__dirname, '../../stats.json');

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DEFAULT_DAY_STATS = {
  messagesSent: 0,
  privateMessagesReceived: 0,
  deletedIntercepted: 0,
  editedIntercepted: 0,
  keywordAlerts: 0,
  viewOnceIntercepted: 0
};

let statsData = {};
let saveTimeout = null;
let recapScheduledToday = false;

export function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const raw = fs.readFileSync(STATS_FILE, 'utf-8');
      statsData = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[StatsTracker] Erreur lecture stats.json:', err.message);
    statsData = {};
  }
}

export function saveStats() {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(statsData, null, 2), 'utf-8');
  } catch (err) {
    console.error('[StatsTracker] Erreur sauvegarde stats.json:', err.message);
  }
}

function scheduleSaveStats() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveStats, 1000);
}

// Charger les stats au démarrage
loadStats();

export function getTodayStats() {
  const key = getTodayKey();
  if (!statsData[key]) {
    statsData[key] = { ...DEFAULT_DAY_STATS };
  }
  return statsData[key];
}

function incrementTodayField(field) {
  const today = getTodayStats();
  today[field] = (today[field] || 0) + 1;
  scheduleSaveStats();
}

export function recordMessageSent() {
  incrementTodayField('messagesSent');
}

export function recordPrivateMessageReceived() {
  incrementTodayField('privateMessagesReceived');
}

export function recordDeletedIntercepted() {
  incrementTodayField('deletedIntercepted');
}

export function recordEditedIntercepted() {
  incrementTodayField('editedIntercepted');
}

export function recordKeywordAlert() {
  incrementTodayField('keywordAlerts');
}

export function recordViewOnceIntercepted() {
  incrementTodayField('viewOnceIntercepted');
}

/**
 * Formate le texte du récapitulatif
 */
export function formatRecapText(stats, dateStr = null) {
  const d = dateStr || new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const pendingTasks = listScheduledMessages();

  return [
    `📊 *RÉCAPITULATIF DU JOUR*`,
    `📅 ${d}`,
    '━━━━━━━━━━━━━━━━━━━━',
    `📤 *Messages envoyés :* ${stats.messagesSent || 0}`,
    `📥 *Messages privés reçus :* ${stats.privateMessagesReceived || 0}`,
    `🗑️ *Messages supprimés interceptés :* ${stats.deletedIntercepted || 0}`,
    `✏️ *Messages modifiés interceptés :* ${stats.editedIntercepted || 0}`,
    `🚨 *Alertes mots-clés :* ${stats.keywordAlerts || 0}`,
    `👁️ *Vues uniques capturées :* ${stats.viewOnceIntercepted || 0}`,
    '━━━━━━━━━━━━━━━━━━━━',
    `⏰ *Messages programmés en attente :* ${pendingTasks.length}`
  ].join('\n');
}

/**
 * Planifie l'envoi automatique du récapitulatif quotidien à 23h00 dans notifds
 */
export function initDailyRecapScheduler(sock) {
  setInterval(async () => {
    try {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // Envoi à 23h00
      if (hours === 23 && minutes === 0 && !recapScheduledToday) {
        recapScheduledToday = true;
        const config = getConfig();
        const target = config.hub?.systemNotifs;
        if (target && sock) {
          const stats = getTodayStats();
          const text = formatRecapText(stats);
          await sock.sendMessage(target, { text });
          console.log('[StatsTracker] Récapitulatif journalier envoyé dans notifds à 23h00.');
        }
      }

      // Réinitialiser le verrou après minuit
      if (hours === 0 && minutes === 1) {
        recapScheduledToday = false;
      }
    } catch (err) {
      console.error('[StatsTracker] Erreur envoi automatique récapitulatif:', err.message);
    }
  }, 45000); // Vérification toutes les 45 secondes
}
