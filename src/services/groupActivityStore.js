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

function getLocalDayKey(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getRecentDayKeys(daysCount) {
  const keys = new Set();
  const now = new Date();
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    keys.add(getLocalDayKey(d.getTime()));
  }
  return keys;
}

function pruneOldDays(dailyMap, maxDays = 35) {
  if (!dailyMap || typeof dailyMap !== 'object') return;
  const keys = Object.keys(dailyMap);
  if (keys.length <= maxDays) return;
  const keep = getRecentDayKeys(maxDays);
  for (const k of keys) {
    if (!keep.has(k)) delete dailyMap[k];
  }
}

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
  const dayKey = getLocalDayKey(now);

  if (!activityData[groupJid]) {
    activityData[groupJid] = {
      groupJid,
      groupName: groupName || groupJid,
      totalMessages: 0,
      lastUpdate: now,
      hourlyActivity: Array(24).fill(0),
      daily: {},
      users: {}
    };
  }

  const group = activityData[groupJid];
  if (groupName && groupName !== groupJid) {
    group.groupName = groupName;
  }
  group.totalMessages = (group.totalMessages || 0) + 1;
  group.lastUpdate = now;

  if (!group.daily || typeof group.daily !== 'object') group.daily = {};
  group.daily[dayKey] = (group.daily[dayKey] || 0) + 1;
  pruneOldDays(group.daily);

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
      daily: {},
      lastSeen: now
    };
  }

  const user = group.users[userKey];
  user.count = (user.count || 0) + 1;
  user.lastSeen = now;
  if (!user.daily || typeof user.daily !== 'object') user.daily = {};
  user.daily[dayKey] = (user.daily[dayKey] || 0) + 1;
  pruneOldDays(user.daily);

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
 * @param {'all'|'month'|'week'} [period='all']
 */
export function getGroupLeaderboard(groupJid, limit = 15, period = 'all') {
  const normalizedPeriod = period === 'week' || period === 'month' ? period : 'all';
  const group = activityData[groupJid];
  if (!group || !group.users) {
    return {
      groupJid,
      groupName: group?.groupName || groupJid,
      period: normalizedPeriod,
      totalMessages: 0,
      hourlyActivity: Array(24).fill(0),
      peakInfo: { peakHour: null, peakCount: 0, formatted: 'Calme' },
      leaderboard: []
    };
  }

  const hourly = group.hourlyActivity && group.hourlyActivity.length === 24
    ? group.hourlyActivity
    : Array(24).fill(0);

  if (normalizedPeriod === 'all') {
    const sortedUsers = Object.values(group.users)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return {
      groupJid,
      groupName: group.groupName || groupJid,
      period: 'all',
      totalMessages: group.totalMessages || 0,
      hourlyActivity: hourly,
      peakInfo: computePeakHour(hourly),
      leaderboard: sortedUsers
    };
  }

  const daysCount = normalizedPeriod === 'week' ? 7 : 30;
  const dayKeys = getRecentDayKeys(daysCount);

  let periodTotal = 0;
  if (group.daily && typeof group.daily === 'object') {
    for (const k of dayKeys) {
      periodTotal += group.daily[k] || 0;
    }
  }

  const mappedUsers = [];
  let sumUsers = 0;
  for (const u of Object.values(group.users)) {
    let pCount = 0;
    if (u.daily && typeof u.daily === 'object') {
      for (const k of dayKeys) {
        pCount += u.daily[k] || 0;
      }
    }
    if (pCount > 0) {
      sumUsers += pCount;
      mappedUsers.push({
        id: u.id,
        name: u.name,
        count: pCount,
        lastSeen: u.lastSeen
      });
    }
  }

  const sortedUsers = mappedUsers
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return {
    groupJid,
    groupName: group.groupName || groupJid,
    period: normalizedPeriod,
    totalMessages: Math.max(periodTotal, sumUsers),
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
