import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jidNormalizedUser } from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.resolve(__dirname, '../config.json');

const DEFAULT_CONFIG = {
  prefix: '/',
  vacances: {
    enabled: false,
    message: 'Bonjour, je suis actuellement indisponible. Je vous répondrai dès que possible !',
    cooldownMinutes: 120
  },
  vacancesLog: {},
  alerts: {
    enabled: true,
    words: []
  },
  groupAliases: {
    testbot: '120363412992633770@g.us',
    importantmsg: '120363432686901629@g.us',
    persopingunevue: '120363430665427462@g.us',
    notifds: '120363413901804206@g.us'
  },
  hub: {
    alerts: '120363432686901629@g.us',
    persoping: '120363430665427462@g.us',
    viewOnce: '120363430665427462@g.us',
    systemNotifs: '120363413901804206@g.us',
    test: '120363412992633770@g.us'
  },
  stealth: {
    enabled: true,
    humanTypingMinMs: 1500,
    humanTypingMaxMs: 3500
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
  return inMemoryConfig;
}

export function getConfig() {
  if (!inMemoryConfig) {
    return loadConfig();
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
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erreur lors de la sauvegarde de config.json:', err);
  }
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
