import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { jidNormalizedUser } from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.resolve(__dirname, '../config.json');

// Charger automatiquement les variables de .env depuis plusieurs emplacements possibles
const possibleEnvPaths = [
  path.resolve(__dirname, '../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(os.homedir(), '.env'),
  path.resolve(os.homedir(), 'zybot/.env')
];

for (const envPath of possibleEnvPaths) {
  try {
    if (fs.existsSync(envPath)) {
      const envRaw = fs.readFileSync(envPath, 'utf-8');
      for (const line of envRaw.split('\n')) {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let val = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
          if (!process.env[key] && val) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {}
}

const DEFAULT_CONFIG = {
  prefix: '/',
  alerts: {
    enabled: true,
    strict: true,
    words: [],
    blacklist: []
  },
  groupAliases: {
    testbot: '120363412992633770@g.us',
    importantmsg: '120363432686901629@g.us',
    persopingunevue: '120363430665427462@g.us',
    notifds: '120363413901804206@g.us',
    antidelete: '120363430044075107@g.us',
    admintaverne: '120363424594930135@g.us'
  },
  hub: {
    alerts: '120363432686901629@g.us',
    persoping: '120363430665427462@g.us',
    viewOnce: '120363430665427462@g.us',
    systemNotifs: '120363413901804206@g.us',
    antiDelete: '120363430044075107@g.us',
    test: '120363412992633770@g.us',
    admintaverne: '120363424594930135@g.us'
  },
  stealth: {
    enabled: true,
    humanTypingMinMs: 1500,
    humanTypingMaxMs: 3500
  },
  tempChats: {},
  ntfy: {
    enabled: false,
    topic: ''
  },
  autoUpdate: {
    enabled: true,
    intervalMinutes: 1
  },
  dnd: {
    enabled: true,
    start: '23:00',
    end: '06:00',
    until: null
  },
  antiRaid: {
    enabled: true,
    probationMinutes: 10,
    maxWarnings: 5
  },
  notifications: {
    groupEvents: true,
    pseudoChanges: true,
    antiDelete: true,
    antiEdit: true,
    keywordAlerts: true,
    dailyRecap: true,
    antiLink: true
  },
  speech: {
    groqApiKey: '',
    geminiApiKey: ''
  },
  web: {
    enabled: true,
    port: 3050,
    password: process.env.WEB_ADMIN_PASSWORD || 'Nexoria2026',
    superadminPassword: process.env.WEB_SUPERADMIN_PASSWORD || 'Jevaisencore-2020'
  }
};

let inMemoryConfig = null;

export function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      inMemoryConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } else {
      inMemoryConfig = { ...DEFAULT_CONFIG };
      saveConfig(inMemoryConfig);
    }
  } catch (error) {
    console.error('Erreur lors du chargement de config.json, utilisation des valeurs par défaut:', error);
    inMemoryConfig = { ...DEFAULT_CONFIG };
  }

  // Injecter les mots de passe depuis les variables d'environnement (.env)
  if (!inMemoryConfig.web) inMemoryConfig.web = {};
  inMemoryConfig.web.password = process.env.WEB_ADMIN_PASSWORD || inMemoryConfig.web.password || 'Nexoria2026';
  inMemoryConfig.web.superadminPassword = process.env.WEB_SUPERADMIN_PASSWORD || inMemoryConfig.web.superadminPassword || 'Jevaisencore-2020';

  return inMemoryConfig;
}

export function getConfig() {
  if (!inMemoryConfig) {
    return loadConfig();
  }
  // Toujours s'assurer que les mots de passe reflètent l'environnement .env le plus récent
  if (!inMemoryConfig.web) inMemoryConfig.web = {};
  if (process.env.WEB_ADMIN_PASSWORD) {
    inMemoryConfig.web.password = process.env.WEB_ADMIN_PASSWORD;
  }
  if (process.env.WEB_SUPERADMIN_PASSWORD) {
    inMemoryConfig.web.superadminPassword = process.env.WEB_SUPERADMIN_PASSWORD;
  }
  return inMemoryConfig;
}

export function updateConfig(updater) {
  const current = getConfig();
  const updated = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  inMemoryConfig = updated;
  saveConfig(updated);
  return inMemoryConfig;
}

export function saveConfig(config) {
  try {
    // Ne jamais écrire les mots de passe en clair dans config.json pour éviter tout commit accidentel
    const sanitizedConfig = { ...config };
    if (sanitizedConfig.web) {
      sanitizedConfig.web = {
        ...sanitizedConfig.web,
        password: '',
        superadminPassword: ''
      };
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(sanitizedConfig, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erreur lors de la sauvegarde de config.json:', err);
  }
}

export function getEnvPath() {
  return path.resolve(__dirname, '../.env');
}

export function updateWebPasswords({ adminPassword, superadminPassword }) {
  const envPath = getEnvPath();
  let envLines = [];
  try {
    if (fs.existsSync(envPath)) {
      envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
    }
  } catch {}

  const setKey = (key, val) => {
    let found = false;
    envLines = envLines.map((line) => {
      if (line.trim().startsWith(`${key}=`)) {
        found = true;
        return `${key}=${val}`;
      }
      return line;
    });
    if (!found) {
      envLines.push(`${key}=${val}`);
    }
    process.env[key] = val;
  };

  if (adminPassword && adminPassword.trim()) {
    const cleanAdmin = adminPassword.trim();
    setKey('WEB_ADMIN_PASSWORD', cleanAdmin);
    if (inMemoryConfig?.web) inMemoryConfig.web.password = cleanAdmin;
  }

  if (superadminPassword && superadminPassword.trim()) {
    const cleanSuper = superadminPassword.trim();
    setKey('WEB_SUPERADMIN_PASSWORD', cleanSuper);
    if (inMemoryConfig?.web) inMemoryConfig.web.superadminPassword = cleanSuper;
  }

  try {
    fs.writeFileSync(envPath, envLines.filter(Boolean).join('\n') + '\n', 'utf-8');
  } catch (err) {
    console.error('Erreur lors de l écriture de .env:', err);
  }

  return {
    adminPassword: process.env.WEB_ADMIN_PASSWORD || 'Nexoria2026',
    superadminPassword: process.env.WEB_SUPERADMIN_PASSWORD || 'Jevaisencore-2020'
  };
}

/**
 * Vérifie si une discussion correspond à un des groupes du Hub Communauté de gestion
 * Dans ces groupes, les messages ne doivent JAMAIS être auto-supprimés !
 */
export function isHubGroup(rawJid) {
  if (!rawJid) return false;
  const normJid = jidNormalizedUser(rawJid);
  const cfg = getConfig();

  // Vérifier dans les groupes du hub
  if (cfg.hub) {
    for (const val of Object.values(cfg.hub)) {
      if (val && jidNormalizedUser(val) === normJid) return true;
    }
  }

  // Vérifier dans les alias de groupe
  if (cfg.groupAliases) {
    for (const val of Object.values(cfg.groupAliases)) {
      if (val && jidNormalizedUser(val) === normJid) return true;
    }
  }

  return false;
}
