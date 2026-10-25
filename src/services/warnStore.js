import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WARNS_FILE = path.resolve(__dirname, '../../warns.json');

// Structure en mémoire : userNumber => Array<{ id, groupJid, groupName, timestamp, reason, admin, pushName }>
let inMemoryWarns = new Map();

export function loadWarns() {
  try {
    if (fs.existsSync(WARNS_FILE)) {
      const raw = fs.readFileSync(WARNS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      inMemoryWarns = new Map(Object.entries(data));
    }
  } catch (err) {
    console.error('Erreur chargement warns.json:', err);
    inMemoryWarns = new Map();
  }
}

export function saveWarns() {
  try {
    const obj = {};
    for (const [number, list] of inMemoryWarns.entries()) {
      if (list && list.length > 0) {
        obj[number] = list;
      }
    }
    fs.writeFileSync(WARNS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erreur sauvegarde warns.json:', err);
  }
}

// Initialisation au démarrage
loadWarns();

/**
 * Ajoute un avertissement à un utilisateur
 * @param {string} userNumber - Numéro pur (ex: '33612345678')
 * @param {object} param1
 * @param {string} param1.groupJid
 * @param {string} param1.groupName
 * @param {string} param1.reason
 * @param {string} param1.admin
 * @param {string} [param1.pushName]
 * @returns {Array} Liste complète mise à jour des warns de l'utilisateur
 */
export function addWarn(userNumber, { groupJid, groupName, reason, admin, pushName = '' }) {
  const cleanNumber = String(userNumber).replace(/[^0-9]/g, '');
  if (!cleanNumber) return [];

  if (!inMemoryWarns.has(cleanNumber)) {
    inMemoryWarns.set(cleanNumber, []);
  }

  const list = inMemoryWarns.get(cleanNumber);
  const warnEntry = {
    id: `W_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    groupJid,
    groupName: groupName || 'Groupe',
    timestamp: Date.now(),
    reason: reason || 'Non spécifiée',
    admin: admin || 'Admin',
    pushName: pushName || null
  };

  list.push(warnEntry);
  saveWarns();
  return list;
}

/**
 * Récupère tous les avertissements d'un utilisateur
 * @param {string} userNumber
 * @returns {Array}
 */
export function getWarns(userNumber) {
  const cleanNumber = String(userNumber).replace(/[^0-9]/g, '');
  return inMemoryWarns.get(cleanNumber) || [];
}

/**
 * Récupère la liste de tous les utilisateurs ayant au moins un avertissement actif
 * @returns {Array<{ number: string, count: number, pushName: string, lastWarn: object }>}
 */
export function getAllWarnedUsers() {
  const result = [];
  for (const [number, list] of inMemoryWarns.entries()) {
    if (list && list.length > 0) {
      const last = list[list.length - 1];
      result.push({
        number,
        count: list.length,
        pushName: last.pushName || null,
        lastWarn: last
      });
    }
  }
  return result.sort((a, b) => b.count - a.count);
}

/**
 * Supprime tous les avertissements d'un utilisateur
 * @param {string} userNumber
 * @returns {number} Nombre d'avertissements supprimés
 */
export function clearWarns(userNumber) {
  const cleanNumber = String(userNumber).replace(/[^0-9]/g, '');
  if (!inMemoryWarns.has(cleanNumber)) return 0;

  const count = inMemoryWarns.get(cleanNumber).length;
  inMemoryWarns.delete(cleanNumber);
  saveWarns();
  return count;
}
