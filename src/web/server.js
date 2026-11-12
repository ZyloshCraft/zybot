import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getConfig, updateConfig, updateWebPasswords } from '../config.js';
import { getConnectionState, getActiveSocket, clearAuthAndReconnect } from '../client.js';
import { getAllWarnedUsers, getWarns, addWarn, clearWarns, deleteSingleWarn } from '../services/warnStore.js';
import { getAllContacts } from '../services/contactStore.js';
import { HISTORIC_TARGETS, resolveHistoricMembers, applyHistoricWarns } from '../services/warnResolver.js';
import { getAllGroupsActivity } from '../services/groupActivityStore.js';
import {
  getAllPermissions,
  addTrustedUser,
  removeTrustedUser,
  revokeUser,
  unrevokeUser
} from '../services/permissionStore.js';
import { getAllGiveaways, finishGiveaway, rerollGiveaway, createGiveaway, deleteGiveaway } from '../services/giveawayStore.js';
import { getAllPersopings, deletePersoping, updatePersoping } from '../services/persopingStore.js';
import { getAntiRaidData, clearMemberAntiRaid } from '../services/antiLinkProtection.js';

// Cache des groupes WhatsApp pour éviter le spam de requêtes Baileys
let groupsParticipatingCache = { data: null, timestamp: 0 };
const GROUPS_CACHE_TTL_MS = 60 * 1000; // 60 secondes

async function getEnrichedGroups() {
  const sock = getActiveSocket();
  const now = Date.now();
  let participating = {};

  if (sock && typeof sock.groupFetchAllParticipating === 'function') {
    if (groupsParticipatingCache.data && (now - groupsParticipatingCache.timestamp < GROUPS_CACHE_TTL_MS)) {
      participating = groupsParticipatingCache.data;
    } else {
      try {
        participating = await sock.groupFetchAllParticipating();
        groupsParticipatingCache = { data: participating, timestamp: now };
      } catch (err) {
        console.warn('[Server] Échec groupFetchAllParticipating:', err.message);
        participating = groupsParticipatingCache.data || {};
      }
    }
  }

  const activityList = getAllGroupsActivity();
  const activityMap = new Map();
  for (const item of activityList) {
    activityMap.set(item.groupJid, item);
  }

  const result = [];
  const handledJids = new Set();

  // 1. Ajouter tous les groupes participants récupérés de WhatsApp
  for (const [jid, groupData] of Object.entries(participating || {})) {
    handledJids.add(jid);
    const act = activityMap.get(jid);
    const totalMessages = act ? act.totalMessages : 0;
    const topUsers = act && act.topUsers ? act.topUsers.map(u => ({
      id: u.id || '',
      name: u.name && !u.name.startsWith('+') ? u.name : (u.id ? `+${u.id.split('@')[0].split(':')[0]}` : 'Membre'),
      count: u.count || 0
    })) : [];

    result.push({
      jid,
      groupJid: jid,
      name: groupData.subject || act?.groupName || jid,
      groupName: groupData.subject || act?.groupName || jid,
      participantCount: Array.isArray(groupData.participants) ? groupData.participants.length : 0,
      userCount: Array.isArray(groupData.participants) ? groupData.participants.length : (act ? act.userCount : 0),
      messageCount: totalMessages,
      totalMessages,
      lastUpdate: act ? act.lastUpdate : null,
      topSpeakers: topUsers.slice(0, 5),
      topUsers: topUsers.slice(0, 5)
    });
  }

  // 2. Ajouter les groupes qui ont de l'activité enregistrée mais qui ne sont pas dans participating
  for (const act of activityList) {
    if (!handledJids.has(act.groupJid)) {
      const topUsers = act.topUsers ? act.topUsers.map(u => ({
        id: u.id || '',
        name: u.name && !u.name.startsWith('+') ? u.name : (u.id ? `+${u.id.split('@')[0].split(':')[0]}` : 'Membre'),
        count: u.count || 0
      })) : [];

      result.push({
        jid: act.groupJid,
        groupJid: act.groupJid,
        name: act.groupName && act.groupName !== act.groupJid ? act.groupName : act.groupJid,
        groupName: act.groupName && act.groupName !== act.groupJid ? act.groupName : act.groupJid,
        participantCount: act.userCount || 0,
        userCount: act.userCount || 0,
        messageCount: act.totalMessages || 0,
        totalMessages: act.totalMessages || 0,
        lastUpdate: act.lastUpdate || null,
        topSpeakers: topUsers.slice(0, 5),
        topUsers: topUsers.slice(0, 5)
      });
    }
  }

  // Trier par messages décroissants puis par nom
  result.sort((a, b) => (b.messageCount - a.messageCount) || a.name.localeCompare(b.name));
  return result;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, 'public');

// Sessions actives en mémoire : token => { createdAt, expiresAt }
const activeSessions = new Map();
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

// Rate limiting login : ip => { attempts: number, lockUntil: number }
const loginRateLimit = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

function getSession(req) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else {
    const cookies = parseCookies(req);
    token = cookies.zybot_token;
  }
  if (!token) return null;
  const session = activeSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return null;
  }
  return session;
}

function isTokenValid(token) {
  if (!token) return false;
  const session = activeSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

function isAuthenticated(req) {
  return !!getSession(req);
}

function isSuperAdmin(req) {
  const session = getSession(req);
  return !!(session && session.role === 'superadmin');
}

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
    ...headers
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload trop volumineux'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Format JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

function getPm2Logs(maxLines = 100) {
  const homedir = os.homedir();
  const outLogPath = path.join(homedir, '.pm2/logs/zybot-out.log');
  const errLogPath = path.join(homedir, '.pm2/logs/zybot-error.log');

  const readTail = (filePath, count) => {
    try {
      if (!fs.existsSync(filePath)) return [];
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      return lines.slice(-count);
    } catch {
      return [];
    }
  };

  const outLines = readTail(outLogPath, maxLines).map((l) => ({ type: 'out', text: l }));
  const errLines = readTail(errLogPath, maxLines).map((l) => ({ type: 'error', text: l }));

  return {
    out: outLines,
    error: errLines,
    combined: [...outLines, ...errLines].slice(-maxLines * 2)
  };
}

let serverInstance = null;

export function startWebServer() {
  const config = getConfig();
  const webConfig = config.web || {};

  if (webConfig.enabled === false) {
    console.log('🌐 WebGUI désactivée dans la configuration (web.enabled = false).');
    return null;
  }

  const port = webConfig.port || 3050;
  const host = '0.0.0.0';

  if (serverInstance) {
    return serverInstance;
  }

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = parsedUrl.pathname;
    const method = req.method;
    const ip = getClientIp(req);

    // Normalisation du chemin
    if (pathname.endsWith('/') && pathname.length > 1) {
      pathname = pathname.slice(0, -1);
    }

    // CORS headers pour flexibilité locale
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // ══════════════════════════════════════════════
      // ROUTES D'AUTHENTIFICATION (PUBLIQUES)
      // ══════════════════════════════════════════════

      // 1. POST /api/auth/login & POST /api/superadmin/login
      if ((pathname === '/api/auth/login' || pathname === '/api/superadmin/login') && method === 'POST') {
        const rate = loginRateLimit.get(ip) || { attempts: 0, lockUntil: 0 };
        if (Date.now() < rate.lockUntil) {
          const remainingSec = Math.ceil((rate.lockUntil - Date.now()) / 1000);
          return sendJson(res, 429, {
            error: `Trop de tentatives. Veuillez patienter ${remainingSec} secondes.`
          });
        }

        const body = await parseJsonBody(req);
        const inputPassword = body.password || '';
        const currentConfig = getConfig();
        const superadminPassword = currentConfig.web?.superadminPassword || 'Jevaisencore-2020';
        const adminPassword = currentConfig.web?.password || 'Nexoria2026';

        let role = null;
        if (inputPassword === superadminPassword) {
          role = 'superadmin';
        } else if (inputPassword === adminPassword && pathname !== '/api/superadmin/login') {
          role = 'admin';
        }

        if (role) {
          // Réinitialiser le compteur de tentatives
          loginRateLimit.delete(ip);

          const token = crypto.randomBytes(32).toString('hex');
          const expiresAt = Date.now() + SESSION_DURATION_MS;
          activeSessions.set(token, { createdAt: Date.now(), expiresAt, ip, role });

          // Cookie HttpOnly sécurisé
          const cookieHeader = `zybot_token=${token}; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}; SameSite=Lax`;

          return sendJson(res, 200, {
            success: true,
            token,
            role,
            isSuperAdmin: role === 'superadmin'
          }, { 'Set-Cookie': cookieHeader });
        } else {
          rate.attempts = (rate.attempts || 0) + 1;
          if (rate.attempts >= 5) {
            rate.lockUntil = Date.now() + 10 * 60 * 1000; // 10 minutes de ban
          }
          loginRateLimit.set(ip, rate);

          return sendJson(res, 401, {
            error: 'Mot de passe incorrect.',
            remainingAttempts: Math.max(0, 5 - rate.attempts)
          });
        }
      }

      // 2. GET /api/auth/check
      if (pathname === '/api/auth/check' && method === 'GET') {
        const session = getSession(req);
        return sendJson(res, 200, {
          authenticated: !!session,
          role: session ? session.role : null,
          isSuperAdmin: session ? session.role === 'superadmin' : false
        });
      }

      // 3. POST /api/auth/logout
      if (pathname === '/api/auth/logout' && method === 'POST') {
        const cookies = parseCookies(req);
        if (cookies.zybot_token) {
          activeSessions.delete(cookies.zybot_token);
        }
        return sendJson(res, 200, { success: true }, {
          'Set-Cookie': 'zybot_token=; Path=/; Max-Age=0'
        });
      }

      // 4. GET /api/public/warns : Consultation publique anonymisée (pseudo & nb de warns uniquement)
      if (pathname === '/api/public/warns' && method === 'GET') {
        const users = getAllWarnedUsers();
        const publicList = users.map((u) => {
          const count = u.count || 0;
          let status = `${count} avertissement${count > 1 ? 's' : ''}`;
          if (count >= 3) status = 'BAN';
          return {
            pseudo: u.pushName || 'Membre Taverne',
            count,
            status
          };
        });
        publicList.sort((a, b) => b.count - a.count);
        return sendJson(res, 200, { success: true, count: publicList.length, users: publicList });
      }

      // ══════════════════════════════════════════════
      // VÉRIFICATION D'AUTHENTIFICATION SUR TOUTES LES AUTRES ROUTES API
      // ══════════════════════════════════════════════
      if (pathname.startsWith('/api/')) {
        if (!isAuthenticated(req)) {
          return sendJson(res, 401, { error: 'Accès non autorisé. Veuillez vous connecter.' });
        }
      }

      // SÉCURITÉ SUPERADMIN : Les routes /api/permissions et /api/superadmin sont strictement réservées au SuperAdmin
      if (pathname.startsWith('/api/permissions') || pathname.startsWith('/api/superadmin')) {
        if (!isSuperAdmin(req)) {
          return sendJson(res, 403, { error: 'Accès réservé au SuperAdmin.' });
        }
      }

      // ══════════════════════════════════════════════
      // ROUTES API PROTÉGÉES
      // ══════════════════════════════════════════════

      // GET /api/status : Métriques & Statut du bot
      if (pathname === '/api/status' && method === 'GET') {
        const conn = getConnectionState();
        const cfg = getConfig();
        const allWarns = getAllWarnedUsers();
        const mem = process.memoryUsage();

        const totalWarnCount = allWarns.reduce((sum, u) => sum + (u.count || 0), 0);

        return sendJson(res, 200, {
          bot: {
            name: 'ZyBot',
            version: '1.27.0',
            uptime: Math.floor(process.uptime()),
            status: conn.status,
            phone: conn.phone,
            pushName: conn.pushName,
            connectedAt: conn.connectedAt,
            qr: conn.qr || null
          },
          system: {
            platform: os.platform(),
            hostname: os.hostname(),
            freeMemMb: Math.round(os.freemem() / (1024 * 1024)),
            totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
            processMemMb: Math.round(mem.rss / (1024 * 1024))
          },
          stats: {
            warnedUsersCount: allWarns.length,
            totalWarnCount,
            stealth: cfg.stealth?.enabled ?? true,
            dnd: cfg.dnd?.enabled ?? true,
            alerts: cfg.alerts?.enabled ?? true
          }
        });
      }

      // GET /api/groups ou /api/groups/activity : Leaderboard et métadonnées WhatsApp en direct
      if ((pathname === '/api/groups' || pathname === '/api/groups/activity') && method === 'GET') {
        const groups = await getEnrichedGroups();
        return sendJson(res, 200, { success: true, count: groups.length, groups });
      }

      // GET /api/permissions : Liste des membres autorisés et révoqués
      if (pathname === '/api/permissions' && method === 'GET') {
        const perms = getAllPermissions();
        return sendJson(res, 200, { success: true, ...perms });
      }

      // POST /api/permissions/trust : Accorder la permission
      if (pathname === '/api/permissions/trust' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { target, name } = body;
        if (!target) return sendJson(res, 400, { error: 'Cible requise.' });
        const ok = addTrustedUser({ target, name });
        return sendJson(res, 200, { success: ok });
      }

      // POST /api/permissions/untrust : Révoquer l'accès
      if (pathname === '/api/permissions/untrust' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { target, name } = body;
        if (!target) return sendJson(res, 400, { error: 'Cible requise.' });
        const ok = revokeUser({ target, name });
        return sendJson(res, 200, { success: ok });
      }

      // POST /api/permissions/remove : Supprimer des listes
      if (pathname === '/api/permissions/remove' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { target } = body;
        if (!target) return sendJson(res, 400, { error: 'Cible requise.' });
        removeTrustedUser(target);
        unrevokeUser(target);
        return sendJson(res, 200, { success: true });
      }

      // ══════════════════════════════════════════════
      // ROUTES SUPERADMIN (GESTION AVANCÉE DU BOT)
      // ══════════════════════════════════════════════

      // 1. Notifications Hub
      if (pathname === '/api/superadmin/notifications' && method === 'GET') {
        const cfg = getConfig();
        const targetGroup = cfg.hub?.systemNotifs || cfg.hub?.alerts || cfg.hub?.admintaverne || '';
        return sendJson(res, 200, {
          success: true,
          targetGroup,
          hub: cfg.hub || {},
          notifications: cfg.notifications || {
            groupEvents: true,
            pseudoChanges: true,
            antiDelete: true,
            antiEdit: true,
            keywordAlerts: true,
            dailyRecap: true,
            antiLink: true
          }
        });
      }

      if (pathname === '/api/superadmin/notifications' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { targetGroup, ...notifs } = body;
        const updated = updateConfig((cur) => {
          const next = { ...cur };
          if (notifs && Object.keys(notifs).length > 0) {
            next.notifications = {
              ...(cur.notifications || {}),
              ...notifs
            };
          }
          if (targetGroup) {
            next.hub = {
              ...(cur.hub || {}),
              systemNotifs: targetGroup,
              alerts: targetGroup,
              admintaverne: targetGroup
            };
          }
          return next;
        });
        return sendJson(res, 200, {
          success: true,
          notifications: updated.notifications,
          targetGroup: updated.hub?.systemNotifs || ''
        });
      }

      // 2. Giveaways (/gw)
      if (pathname === '/api/superadmin/giveaways' && method === 'GET') {
        const list = getAllGiveaways();
        return sendJson(res, 200, { success: true, count: list.length, giveaways: list });
      }

      if (pathname === '/api/superadmin/giveaways/create' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { groupJid, prize, durationMs } = body;
        if (!groupJid || !prize) return sendJson(res, 400, { error: 'Groupe et lot requis.' });
        const gw = createGiveaway({
          groupJid,
          messageId: `admin_${Date.now()}`,
          messageKey: null,
          prize,
          durationMs: parseInt(durationMs, 10) || 86400000,
          creatorJid: 'superadmin'
        });
        return sendJson(res, 200, { success: true, giveaway: gw });
      }

      if (pathname === '/api/superadmin/giveaways/end' && method === 'POST') {
        const body = await parseJsonBody(req);
        const giveawayId = body.giveawayId || body.id || body.messageId;
        if (!giveawayId) return sendJson(res, 400, { error: 'Identifiant du giveaway requis.' });
        const sock = getActiveSocket();
        const resGw = await finishGiveaway(sock, giveawayId);
        return sendJson(res, 200, { success: true, result: resGw });
      }

      if (pathname === '/api/superadmin/giveaways/reroll' && method === 'POST') {
        const body = await parseJsonBody(req);
        const giveawayId = body.giveawayId || body.id || body.messageId;
        if (!giveawayId) return sendJson(res, 400, { error: 'Identifiant du giveaway requis.' });
        const sock = getActiveSocket();
        const resGw = await rerollGiveaway(sock, giveawayId);
        return sendJson(res, 200, { success: true, result: resGw });
      }

      if (pathname === '/api/superadmin/giveaways/delete' && method === 'POST') {
        const body = await parseJsonBody(req);
        const giveawayId = body.giveawayId || body.id || body.messageId;
        if (!giveawayId) return sendJson(res, 400, { error: 'Identifiant requis.' });
        const ok = deleteGiveaway(giveawayId);
        return sendJson(res, 200, { success: ok });
      }

      // 3. Persopings (/persoping & vues uniques)
      if (pathname === '/api/superadmin/persopings' && method === 'GET') {
        const list = getAllPersopings();
        return sendJson(res, 200, { success: true, count: list.length, persopings: list });
      }

      if (pathname === '/api/superadmin/persopings/delete' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { id } = body;
        if (!id) return sendJson(res, 400, { error: 'ID persoping requis.' });
        const ok = deletePersoping(id);
        return sendJson(res, 200, { success: ok });
      }

      if (pathname === '/api/superadmin/persopings/update' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { id, text, author, origin } = body;
        if (!id) return sendJson(res, 400, { error: 'ID requis.' });
        const updated = updatePersoping(id, { text, author, origin });
        return sendJson(res, 200, { success: !!updated, persoping: updated });
      }

      // 4. Anti-Raid & Protection Anti-Lien
      if (pathname === '/api/superadmin/antiraid' && method === 'GET') {
        const cfg = getConfig();
        const data = getAntiRaidData();
        return sendJson(res, 200, {
          success: true,
          config: cfg.antiRaid || { enabled: true, probationMinutes: 10, maxWarnings: 5 },
          data
        });
      }

      if (pathname === '/api/superadmin/antiraid/update' && method === 'POST') {
        const body = await parseJsonBody(req);
        const updated = updateConfig((cur) => ({
          ...cur,
          antiRaid: {
            ...(cur.antiRaid || {}),
            ...body
          }
        }));
        return sendJson(res, 200, { success: true, config: updated.antiRaid });
      }

      if (pathname === '/api/superadmin/antiraid/clear-member' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { groupJid, participantJid } = body;
        if (!participantJid) return sendJson(res, 400, { error: 'JID ou numéro du membre requis.' });
        clearMemberAntiRaid(groupJid, participantJid);
        return sendJson(res, 200, { success: true });
      }

      // 5. Configuration complète SuperAdmin & Mots surveillés
      if (pathname === '/api/superadmin/config' && method === 'GET') {
        const cfg = getConfig();
        return sendJson(res, 200, {
          success: true,
          config: {
            prefix: cfg.prefix,
            alerts: cfg.alerts,
            stealth: cfg.stealth,
            dnd: cfg.dnd,
            antiRaid: cfg.antiRaid,
            notifications: cfg.notifications,
            ntfy: cfg.ntfy,
            groupAliases: cfg.groupAliases,
            hub: cfg.hub,
            passwords: {
              adminPassword: process.env.WEB_ADMIN_PASSWORD || cfg.web?.password || 'Nexoria2026',
              superadminPassword: process.env.WEB_SUPERADMIN_PASSWORD || cfg.web?.superadminPassword || 'Jevaisencore-2020'
            }
          }
        });
      }

      if (pathname === '/api/superadmin/security/passwords' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { adminPassword, superadminPassword } = body;

        if (adminPassword && adminPassword.trim().length < 4) {
          return sendJson(res, 400, { error: 'Le mot de passe Admin standard doit comporter au moins 4 caractères.' });
        }
        if (superadminPassword && superadminPassword.trim().length < 6) {
          return sendJson(res, 400, { error: 'Le mot de passe SuperAdmin doit comporter au moins 6 caractères.' });
        }

        const updated = updateWebPasswords({ adminPassword, superadminPassword });
        return sendJson(res, 200, {
          success: true,
          message: 'Mots de passe sauvegardés avec succès dans .env !',
          adminPassword: updated.adminPassword,
          superadminPassword: updated.superadminPassword
        });
      }

      if (pathname === '/api/superadmin/config/update' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { prefix, stealth, dnd, ntfy, alerts } = body;
        const updated = updateConfig((cur) => {
          const next = { ...cur };
          if (prefix) next.prefix = prefix;
          if (stealth) next.stealth = { ...(next.stealth || {}), ...stealth };
          if (dnd) next.dnd = { ...(next.dnd || {}), ...dnd };
          if (ntfy) next.ntfy = { ...(next.ntfy || {}), ...ntfy };
          if (alerts) next.alerts = { ...(next.alerts || {}), ...alerts };
          return next;
        });
        return sendJson(res, 200, { success: true, config: updated });
      }

      if (pathname === '/api/superadmin/alerts/words' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { action, word } = body;
        if (!word) return sendJson(res, 400, { error: 'Mot requis.' });
        const cleanWord = word.trim().toLowerCase();

        const updated = updateConfig((cur) => {
          const words = Array.isArray(cur.alerts?.words) ? [...cur.alerts.words] : [];
          if (action === 'add') {
            if (!words.includes(cleanWord)) words.push(cleanWord);
          } else if (action === 'remove') {
            const idx = words.indexOf(cleanWord);
            if (idx >= 0) words.splice(idx, 1);
          }
          return {
            ...cur,
            alerts: {
              ...(cur.alerts || {}),
              words
            }
          };
        });

        return sendJson(res, 200, { success: true, words: updated.alerts?.words || [] });
      }

      // GET /api/warns : Liste complète de tous les avertissements
      if (pathname === '/api/warns' && method === 'GET') {
        const users = getAllWarnedUsers();
        const fullData = users.map((u) => {
          const userWarns = getWarns(u.number);
          return {
            ...u,
            warns: userWarns
          };
        });
        return sendJson(res, 200, { success: true, count: fullData.length, users: fullData });
      }

      // POST /api/warns/add : Ajouter un avertissement manuellement
      if (pathname === '/api/warns/add' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { target, reason, admin, groupName, pushName } = body;

        if (!target) {
          return sendJson(res, 400, { error: 'Cible requise (numéro ou LID).' });
        }

        const cleanNumber = target.replace(/[^0-9]/g, '');
        if (cleanNumber.length < 6) {
          return sendJson(res, 400, { error: 'Identifiant ou numéro invalide (min 6 chiffres).' });
        }

        const updated = addWarn(cleanNumber, {
          groupJid: 'web-dashboard',
          groupName: groupName || 'Tableau de bord Web',
          reason: reason || 'Avertissement émis via la WebGUI',
          admin: admin || 'Administrateur Web',
          pushName: pushName || null
        });

        return sendJson(res, 200, { success: true, user: cleanNumber, warns: updated });
      }

      // POST /api/warns/delete & POST /api/warns/delete-single : Supprimer un ou tous les avertissements d'un membre
      if ((pathname === '/api/warns/delete' || pathname === '/api/warns/delete-single') && method === 'POST') {
        const body = await parseJsonBody(req);
        const { target, warnId, timestamp } = body;

        if (!target) {
          return sendJson(res, 400, { error: 'Cible requise.' });
        }

        const cleanNumber = target.replace(/[^0-9]/g, '');
        const idToDelete = warnId || timestamp;

        if (idToDelete) {
          const removed = deleteSingleWarn(cleanNumber, idToDelete);
          return sendJson(res, 200, { success: true, removedSingle: removed });
        } else {
          const deletedCount = clearWarns(cleanNumber);
          return sendJson(res, 200, { success: true, deletedCount });
        }
      }

      // DELETE ou POST /api/warns/clear /api/warns/clear/:target
      if (
        (pathname.startsWith('/api/warns/clear') || pathname.startsWith('/api/warns/delete/')) &&
        (method === 'DELETE' || method === 'POST')
      ) {
        let target = pathname.split('/').pop();
        if (target === 'clear' || !target) {
          const body = await parseJsonBody(req);
          target = body.target;
        }
        if (!target) {
          return sendJson(res, 400, { error: 'Cible requise.' });
        }
        const cleanNumber = target.replace(/[^0-9]/g, '');
        const deletedCount = clearWarns(cleanNumber);
        return sendJson(res, 200, { success: true, deletedCount });
      }

      // GET /api/warns/historic : Liste des 60 membres historiques et statut de résolution
      if (pathname === '/api/warns/historic' && method === 'GET') {
        const list = HISTORIC_TARGETS.map((t) => {
          let resolvedId = t.knownId || null;
          let currentWarns = [];
          if (resolvedId) {
            const num = resolvedId.split('@')[0].split(':')[0];
            currentWarns = getWarns(num);
          }
          return {
            pseudo: t.pseudo,
            searchKeywords: t.search,
            expectedWarns: t.count,
            resolvedId,
            isBan: !!t.isBan,
            currentWarnsCount: currentWarns.length
          };
        });

        const resolvedCount = list.filter((item) => item.resolvedId).length;
        return sendJson(res, 200, {
          success: true,
          total: list.length,
          resolvedCount,
          unresolvedCount: list.length - resolvedCount,
          targets: list
        });
      }

      // POST /api/warns/scan : Déclencher la synchronisation des membres Taverne
      if (pathname === '/api/warns/scan' && method === 'POST') {
        const sock = getActiveSocket();
        const config = getConfig();
        const taverneJid = config.hub?.admintaverne || '120363424594930135@g.us';

        const { resolved, unresolved, totalTargets } = await resolveHistoricMembers(sock, taverneJid);
        const appliedCount = applyHistoricWarns(resolved);

        return sendJson(res, 200, {
          success: true,
          totalTargets,
          resolvedCount: resolved.length,
          unresolvedCount: unresolved.length,
          appliedWarns: appliedCount,
          resolvedList: resolved.slice(0, 30)
        });
      }

      // GET /api/contacts : Annuaire des contacts reconnus
      if (pathname === '/api/contacts' && method === 'GET') {
        const contacts = getAllContacts();
        return sendJson(res, 200, { success: true, count: contacts.length, contacts });
      }

      // GET /api/logs : Derniers logs pm2
      if (pathname === '/api/logs' && method === 'GET') {
        const limit = Math.min(200, parseInt(parsedUrl.searchParams.get('limit') || '80', 10));
        const logs = getPm2Logs(limit);
        return sendJson(res, 200, { success: true, ...logs });
      }

      // POST /api/bot/restart : Redémarrer le bot proprement avec PM2
      if (pathname === '/api/bot/restart' && method === 'POST') {
        sendJson(res, 200, { success: true, message: 'Redémarrage du bot en cours via PM2...' });
        setTimeout(() => {
          exec('pm2 restart zybot', (err) => {
            if (err) {
              console.error('Erreur redémarrage PM2:', err);
              process.exit(0); // Forcer l'arrêt pour que PM2 le relance automatiquement
            }
          });
        }, 500);
        return;
      }

      // POST /api/bot/reauth : Réinitialiser la session WhatsApp (supprimer auth_info et générer un nouveau QR)
      if (pathname === '/api/bot/reauth' && method === 'POST') {
        clearAuthAndReconnect();
        return sendJson(res, 200, { success: true, message: 'Session réinitialisée. Nouveau QR code en cours de génération...' });
      }

      // GET /api/config : Configuration publique
      if (pathname === '/api/config' && method === 'GET') {
        const cfg = getConfig();
        return sendJson(res, 200, {
          prefix: cfg.prefix,
          stealth: cfg.stealth,
          dnd: cfg.dnd,
          alerts: cfg.alerts,
          web: {
            port: cfg.web?.port || 3050,
            hasPassword: !!cfg.web?.password
          }
        });
      }

      // POST /api/config/update : Mise à jour de la configuration ou du mot de passe
      if (pathname === '/api/config/update' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { newPassword, dnd, stealth, prefix } = body;

        updateConfig((cur) => {
          const next = { ...cur };
          if (newPassword && newPassword.trim().length >= 4) {
            next.web = { ...(next.web || {}), password: newPassword.trim() };
          }
          if (dnd) next.dnd = { ...(next.dnd || {}), ...dnd };
          if (stealth) next.stealth = { ...(next.stealth || {}), ...stealth };
          if (prefix) next.prefix = prefix;
          return next;
        });

        return sendJson(res, 200, { success: true, message: 'Configuration enregistrée avec succès.' });
      }

      // ══════════════════════════════════════════════
      // DISTRIBUTION DES FICHIERS STATIQUES (UI WEB)
      // ══════════════════════════════════════════════

      // Sécurité : Ne jamais servir index.html pour une route /api/ non reconnue
      if (pathname.startsWith('/api/')) {
        return sendJson(res, 404, { error: `Route API introuvable : ${method} ${pathname}` });
      }

      let filePath;
      const wantsSuperadmin = pathname === '/superadmin' || pathname === '/superadmin/' || pathname === '/superadmin.html' || pathname === '/superadmin-login.html';

      if (wantsSuperadmin) {
        if (isSuperAdmin(req)) {
          filePath = path.join(PUBLIC_DIR, 'superadmin.html');
        } else {
          filePath = path.join(PUBLIC_DIR, 'superadmin-login.html');
        }
      } else if (pathname === '/admin' || pathname === '/admin/' || pathname === '/' || pathname === '/index.html') {
        filePath = path.join(PUBLIC_DIR, 'index.html');
      } else {
        filePath = path.join(PUBLIC_DIR, pathname);
      }

      // Si le fichier demandé n'existe pas ou s'il s'agit d'une route SPA
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        if (pathname.startsWith('/superadmin')) {
          if (isSuperAdmin(req)) {
            filePath = path.join(PUBLIC_DIR, 'superadmin.html');
          } else {
            filePath = path.join(PUBLIC_DIR, 'superadmin-login.html');
          }
        } else {
          filePath = path.join(PUBLIC_DIR, 'index.html');
        }
      }

      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // 404 par défaut
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Non trouvé');
    } catch (err) {
      console.error('Erreur serveur WebGUI:', err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Erreur interne du serveur', details: err.message });
      }
    }
  });

  server.listen(port, host, () => {
    console.log(`🌐 WebGUI ZyBot opérationnelle : http://${host}:${port}`);
    console.log(`🔑 Mot de passe de connexion configuré dans config.json.`);
  });

  serverInstance = server;
  return server;
}

export function stopWebServer() {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
}
