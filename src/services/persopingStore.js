import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PERSOPING_FILE = path.resolve(__dirname, '../../persopings.json');

let persopings = [];

export function loadPersopings() {
  try {
    if (fs.existsSync(PERSOPING_FILE)) {
      const raw = fs.readFileSync(PERSOPING_FILE, 'utf-8');
      persopings = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[PersopingStore] Erreur chargement persopings.json:', err.message);
    persopings = [];
  }
}

export function savePersopings() {
  try {
    fs.writeFileSync(PERSOPING_FILE, JSON.stringify(persopings, null, 2), 'utf-8');
  } catch (err) {
    console.error('[PersopingStore] Erreur sauvegarde persopings.json:', err.message);
  }
}

// Initialisation
loadPersopings();

export function addPersopingEntry({ stanzaId, author, originalDate, origin, text, mediaType }) {
  const entry = {
    id: stanzaId || `perso_${Date.now()}`,
    author: author || 'Inconnu',
    originalDate: originalDate || new Date().toLocaleString('fr-FR'),
    origin: origin || 'Discussion privée',
    text: text || '',
    mediaType: mediaType || 'text',
    savedAt: Date.now()
  };

  persopings.unshift(entry);
  if (persopings.length > 200) {
    persopings = persopings.slice(0, 200);
  }
  savePersopings();
  return entry;
}

export function getAllPersopings() {
  return [...persopings];
}

export function deletePersoping(id) {
  const initialLen = persopings.length;
  persopings = persopings.filter(p => p.id !== id);
  if (persopings.length !== initialLen) {
    savePersopings();
    return true;
  }
  return false;
}
