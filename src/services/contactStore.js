import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTACTS_FILE = path.resolve(__dirname, '../../contacts.json');

const contactMap = new Map(); // id (numéro ou lid) => { id, name, notify }

export function loadContacts() {
  try {
    if (fs.existsSync(CONTACTS_FILE)) {
      const raw = fs.readFileSync(CONTACTS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      for (const [id, c] of Object.entries(data)) {
        contactMap.set(id, c);
      }
    }
  } catch (err) {
    console.error('Erreur chargement contacts.json:', err);
  }
}

export function saveContacts() {
  try {
    const obj = {};
    for (const [id, c] of contactMap.entries()) {
      obj[id] = c;
    }
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erreur sauvegarde contacts.json:', err);
  }
}

// Charger au démarrage
loadContacts();

/**
 * Enregistre ou met à jour des contacts reçus de WhatsApp
 * @param {Array<object>} contactsList
 */
export function updateContacts(contactsList) {
  if (!contactsList || !Array.isArray(contactsList)) return;
  let changed = false;

  for (const c of contactsList) {
    if (!c?.id) continue;
    const cleanId = c.id.split('@')[0].split(':')[0];
    const existing = contactMap.get(cleanId) || { id: c.id };

    if (c.name) existing.name = c.name;
    if (c.notify) existing.notify = c.notify;
    if (c.verifiedName) existing.verifiedName = c.verifiedName;

    contactMap.set(cleanId, existing);
    // Indexer aussi par JID complet
    contactMap.set(c.id, existing);
    changed = true;
  }

  if (changed) {
    saveContacts();
  }
}

/**
 * Recherche un contact par son pseudo (notify) ou son nom
 * @param {string} query
 * @returns {{ id: string, name?: string, notify?: string } | null}
 */
export function searchContactByPseudo(query) {
  if (!query) return null;
  const cleanQ = query.toLowerCase().replace(/[@~*]/g, '').trim();
  if (!cleanQ) return null;

  for (const [id, c] of contactMap.entries()) {
    const notify = (c.notify || '').toLowerCase().replace(/[@~*]/g, '').trim();
    const name = (c.name || '').toLowerCase().replace(/[@~*]/g, '').trim();

    if (notify === cleanQ || notify.includes(cleanQ) || cleanQ.includes(notify)) {
      return c;
    }
    if (name && (name === cleanQ || name.includes(cleanQ) || cleanQ.includes(name))) {
      return c;
    }
  }

  return null;
}

export function getContact(idOrNumber) {
  if (!idOrNumber) return null;
  const clean = String(idOrNumber).replace(/[^0-9]/g, '');
  return contactMap.get(clean) || contactMap.get(idOrNumber) || null;
}

export function getAllContacts() {
  return Array.from(contactMap.values());
}

/**
 * Vérifie si le pseudo (pushName) a changé pour un contact donné
 * @param {string} idOrNumber
 * @param {string} newPushName
 * @returns {{ oldName: string, newName: string } | null}
 */
export function checkAndTrackPseudo(idOrNumber, newPushName) {
  if (!idOrNumber || !newPushName) return null;
  const cleanId = String(idOrNumber).split('@')[0].split(':')[0];
  const existing = contactMap.get(cleanId);
  const trimmed = newPushName.trim();

  if (existing) {
    const currentNotify = (existing.notify || '').trim();
    if (currentNotify && currentNotify !== trimmed) {
      const oldName = currentNotify;
      existing.notify = trimmed;
      saveContacts();
      return { oldName, newName: trimmed };
    }
    if (!currentNotify) {
      existing.notify = trimmed;
      saveContacts();
    }
  } else {
    contactMap.set(cleanId, { id: idOrNumber, notify: trimmed });
    contactMap.set(idOrNumber, { id: idOrNumber, notify: trimmed });
    saveContacts();
  }
  return null;
}
