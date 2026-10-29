import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getConfig, updateConfig } from '../config.js';
import { getConnectionState, getActiveSocket, clearAuthAndReconnect } from '../client.js';
import { getAllWarnedUsers, getWarns, addWarn, clearWarns, deleteSingleWarn } from '../services/warnStore.js';
import { getAllContacts } from '../services/contactStore.js';
import { HISTORIC_TARGETS, resolveHistoricMembers, applyHistoricWarns } from '../services/warnResolver.js';

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
  // 1. Header Authorization Bearer
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (isTokenValid(token)) return true;
  }
  // 2. Cookie zybot_token
  const cookies = parseCookies(req);
  if (cookies.zybot_token && isTokenValid(cookies.zybot_token)) {
    return true;
  }
  return false;
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

      // 1. POST /api/auth/login
      if (pathname === '/api/auth/login' && method === 'POST') {
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
        const expectedPassword = currentConfig.web?.password || 'zybot';

        if (inputPassword === expectedPassword) {
          // Réinitialiser le compteur de tentatives
          loginRateLimit.delete(ip);

          const token = crypto.randomBytes(32).toString('hex');
          const expiresAt = Date.now() + SESSION_DURATION_MS;
          activeSessions.set(token, { createdAt: Date.now(), expiresAt, ip });

          // Cookie HttpOnly sécurisé
          const cookieHeader = `zybot_token=${token}; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}; SameSite=Lax`;

          return sendJson(res, 200, { success: true, token }, { 'Set-Cookie': cookieHeader });
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
        const authed = isAuthenticated(req);
        return sendJson(res, 200, { authenticated: authed });
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

      // ══════════════════════════════════════════════
      // VÉRIFICATION D'AUTHENTIFICATION SUR TOUTES LES AUTRES ROUTES API
      // ══════════════════════════════════════════════
      if (pathname.startsWith('/api/')) {
        if (!isAuthenticated(req)) {
          return sendJson(res, 401, { error: 'Accès non autorisé. Veuillez vous connecter.' });
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

      // POST /api/warns/delete : Supprimer un ou tous les avertissements d'un membre
      if (pathname === '/api/warns/delete' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { target, warnId } = body;

        if (!target) {
          return sendJson(res, 400, { error: 'Cible requise.' });
        }

        const cleanNumber = target.replace(/[^0-9]/g, '');
        if (warnId) {
          const removed = deleteSingleWarn(cleanNumber, warnId);
          return sendJson(res, 200, { success: true, removedSingle: removed });
        } else {
          const deletedCount = clearWarns(cleanNumber);
          return sendJson(res, 200, { success: true, deletedCount });
        }
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

      let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

      // Si le fichier demandé n'existe pas ou s'il s'agit d'une route SPA
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(PUBLIC_DIR, 'index.html');
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
