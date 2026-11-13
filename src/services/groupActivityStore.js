import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ACTIVITY_FILE = path.resolve(__dirname, '../../group_activity.json');

// Structure en mémoire : groupJid => { groupJid, groupName, totalMessages, lastUpdate, hourlyActivity: number[24], users: { [userJid]: { id, name, count, lastSeen } } }
let activityData = {};
let saveTimeout = null;

export function loadGroupActivity() {
  try {
    if (fs.existsSync(ACTIVITY_FILE)) {
      const raw = fs.readFileSync(ACTIVITY_FILE, 'utf-8');
      activityData = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[GroupActivity] Erreur chargement group_activity.json:', err.message);
    activityData = {};
  }
}

export function saveGroupActivitySync() {
  try {
    fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(activityData, null, 2), 'utf-8');
  } catch (err) {
    console.error('[GroupActivity] Erreur sauvegarde group_activity.json:', err.message);
  }
}

function scheduleSave() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    saveGroupActivitySync();
  }, 2500);
}

// Initialiser au chargement
loadGroupActivity();

/**
 * Enregistre un message envoyé dans un groupe et met à jour l'activité horaire
 * @param {object} params
 * @param {string} params.groupJid
 * @param {string} [params.groupName]
 * @param {string} params.senderJid
 * @param {string} [params.pushName]
 * @param {number} [params.timestamp]
 */
export function recordGroupMessage({ groupJid, groupName, senderJid, pushName, timestamp }) {
  if (!groupJid || !senderJid) return;

  const now = timestamp || Date.now();

  if (!activityData[groupJid]) {
    activityData[groupJid] = {
      groupJid,
      groupName: groupName || groupJid,
      totalMessages: 0,
      lastUpdate: now,
      hourlyActivity: Array(24).fill(0),
      users: {}
    };
  }

  const group = activityData[groupJid];
  if (groupName && groupName !== groupJid) {
    group.groupName = groupName;
  }
  group.totalMessages = (group.totalMessages || 0) + 1;
  group.lastUpdate = now;

  // Initialiser hourlyActivity si inexistant
  if (!group.hourlyActivity || !Array.isArray(group.hourlyActivity) || group.hourlyActivity.length !== 24) {
    group.hourlyActivity = Array(24).fill(0);
  }

  // Incrémenter la tranche horaire correspondante (0-23)
  const hour = new Date(now).getHours();
  group.hourlyActivity[hour] = (group.hourlyActivity[hour] || 0) + 1;

  const userKey = senderJid.split('@')[0].split(':')[0];
  if (!group.users[userKey]) {
    group.users[userKey] = {
      id: senderJid,
      name: pushName || `+${userKey}`,
      count: 0,
      lastSeen: now
    };
  }

  const user = group.users[userKey];
  user.count = (user.count || 0) + 1;
  user.lastSeen = now;
  if (pushName && (!user.name || user.name.startsWith('+'))) {
    user.name = pushName;
  }

  scheduleSave();
}

/**
 * Calcule l'heure de pointe et les statistiques temporelles d'un groupe
 * @param {number[]} hourlyActivity 
 */
export function computePeakHour(hourlyActivity) {
  if (!hourlyActivity || !hourlyActivity.length) {
    return { peakHour: null, peakCount: 0, formatted: 'Aucune donnée' };
  }

  let maxCount = -1;
  let peakHour = 0;
  for (let h = 0; h < 24; h++) {
    const val = hourlyActivity[h] || 0;
    if (val > maxCount) {
      maxCount = val;
      peakHour = h;
    }
  }

  if (maxCount <= 0) {
    return { peakHour: null, peakCount: 0, formatted: 'Calme' };
  }

  const nextHour = (peakHour + 1) % 24;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    peakHour,
    peakCount: maxCount,
    formatted: `${pad(peakHour)}h00 - ${pad(nextHour)}h00 (${maxCount} msgs)`
  };
}

/**
 * Récupère le classement et les statistiques temporelles d'un groupe
 * @param {string} groupJid
 * @param {number} [limit=15]
 */
export function getGroupLeaderboard(groupJid, limit = 15) {
  const group = activityData[groupJid];
  if (!group || !group.users) {
    return {
      groupJid,
      groupName: group?.groupName || groupJid,
      totalMessages: 0,
      hourlyActivity: Array(24).fill(0),
      peakInfo: { peakHour: null, peakCount: 0, formatted: 'Calme' },
      leaderboard: []
    };
  }

  const hourly = group.hourlyActivity && group.hourlyActivity.length === 24
    ? group.hourlyActivity
    : Array(24).fill(0);

  const sortedUsers = Object.values(group.users)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return {
    groupJid,
    groupName: group.groupName || groupJid,
    totalMessages: group.totalMessages || 0,
    hourlyActivity: hourly,
    peakInfo: computePeakHour(hourly),
    leaderboard: sortedUsers
  };
}

/**
 * Récupère l'ensemble des données d'activité pour le WebGUI
 */
export function getAllGroupsActivity() {
  const list = [];
  for (const [jid, group] of Object.entries(activityData)) {
    const sorted = Object.values(group.users || {}).sort((a, b) => b.count - a.count);
    const hourly = group.hourlyActivity && group.hourlyActivity.length === 24
      ? group.hourlyActivity
      : Array(24).fill(0);

    list.push({
      groupJid: jid,
      groupName: group.groupName || jid,
      totalMessages: group.totalMessages || 0,
      lastUpdate: group.lastUpdate,
      userCount: sorted.length,
      topUsers: sorted.slice(0, 10),
      hourlyActivity: hourly,
      peakInfo: computePeakHour(hourly)
    });
  }
  // Trier par nombre total de messages décroissant
  return list.sort((a, b) => b.totalMessages - a.totalMessages);
}
