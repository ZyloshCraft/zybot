import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
