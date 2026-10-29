import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ACTIVITY_FILE = path.resolve(__dirname, '../../group_activity.json');

// Structure en mémoire : groupJid => { groupJid, groupName, totalMessages, lastUpdate, users: { [userJid]: { id, name, count, lastSeen } } }
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
 * Enregistre un message envoyé dans un groupe
 * @param {object} params
 * @param {string} params.groupJid
 * @param {string} [params.groupName]
 * @param {string} params.senderJid
 * @param {string} [params.pushName]
 */
export function recordGroupMessage({ groupJid, groupName, senderJid, pushName }) {
  if (!groupJid || !senderJid) return;

  if (!activityData[groupJid]) {
    activityData[groupJid] = {
      groupJid,
      groupName: groupName || groupJid,
      totalMessages: 0,
      lastUpdate: Date.now(),
      users: {}
    };
  }

  const group = activityData[groupJid];
  if (groupName && groupName !== groupJid) {
    group.groupName = groupName;
  }
  group.totalMessages = (group.totalMessages || 0) + 1;
  group.lastUpdate = Date.now();

  const userKey = senderJid.split('@')[0].split(':')[0];
  if (!group.users[userKey]) {
    group.users[userKey] = {
      id: senderJid,
      name: pushName || `+${userKey}`,
      count: 0,
      lastSeen: Date.now()
    };
  }

  const user = group.users[userKey];
  user.count = (user.count || 0) + 1;
  user.lastSeen = Date.now();
  if (pushName && (!user.name || user.name.startsWith('+'))) {
    user.name = pushName;
  }

  scheduleSave();
}

/**
 * Récupère le classement d'un groupe
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
      leaderboard: []
    };
  }

  const sortedUsers = Object.values(group.users)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return {
    groupJid,
    groupName: group.groupName || groupJid,
    totalMessages: group.totalMessages || 0,
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
    list.push({
      groupJid: jid,
      groupName: group.groupName || jid,
      totalMessages: group.totalMessages || 0,
      lastUpdate: group.lastUpdate,
      userCount: sorted.length,
      topUsers: sorted.slice(0, 10)
    });
  }
  // Trier par nombre total de messages décroissant
  return list.sort((a, b) => b.totalMessages - a.totalMessages);
}
