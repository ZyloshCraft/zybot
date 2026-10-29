import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../config.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';
import { getContact } from './contactStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PERMISSIONS_FILE = path.resolve(__dirname, '../../permissions.json');

// Structure : { trusted: [{ id, number, name, addedAt }], revoked: [{ id, number, name, revokedAt }] }
let permissionsData = {
  trusted: [],
  revoked: []
};

export function loadPermissions() {
  try {
    if (fs.existsSync(PERMISSIONS_FILE)) {
      const raw = fs.readFileSync(PERMISSIONS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      permissionsData = {
        trusted: Array.isArray(parsed.trusted) ? parsed.trusted : [],
        revoked: Array.isArray(parsed.revoked) ? parsed.revoked : []
      };
    }
  } catch (err) {
    console.error('[Permissions] Erreur chargement permissions.json:', err.message);
  }
}

export function savePermissions() {
  try {
    fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(permissionsData, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Permissions] Erreur sauvegarde permissions.json:', err.message);
  }
}

// Initialisation
loadPermissions();

function cleanTargetNumber(target) {
  if (!target) return '';
  return String(target).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

/**
 * Ajoute un utilisateur à la liste des personnes de confiance (Trusted)
 * @param {object} params
 * @param {string} params.target - Numéro ou LID
 * @param {string} [params.name] - Nom / Pseudo
 */
export function addTrustedUser({ target, name }) {
  const number = cleanTargetNumber(target);
  if (!number) return false;

  // Retirer des révoqués si présent
  permissionsData.revoked = permissionsData.revoked.filter(u => cleanTargetNumber(u.number) !== number);

  // Vérifier si déjà présent
  const existingIndex = permissionsData.trusted.findIndex(u => cleanTargetNumber(u.number) === number);
  const contact = getContact(number);
  const resolvedName = name || contact?.notify || contact?.name || `+${number}`;

  if (existingIndex >= 0) {
    permissionsData.trusted[existingIndex].name = resolvedName;
  } else {
    permissionsData.trusted.push({
      id: `${number}@s.whatsapp.net`,
      number,
      name: resolvedName,
      addedAt: Date.now()
    });
  }

  savePermissions();
  return true;
}

/**
 * Retire un utilisateur de la liste Trusted
 * @param {string} target
 */
export function removeTrustedUser(target) {
  const number = cleanTargetNumber(target);
  if (!number) return false;

  const initialLen = permissionsData.trusted.length;
  permissionsData.trusted = permissionsData.trusted.filter(u => cleanTargetNumber(u.number) !== number);
  const changed = permissionsData.trusted.length !== initialLen;

  if (changed) savePermissions();
  return changed;
}

/**
 * Révoque expressément un utilisateur (lui interdit /warn et /texte même s'il est admin de la taverne)
 * @param {object} params
 * @param {string} params.target
 * @param {string} [params.name]
 */
export function revokeUser({ target, name }) {
  const number = cleanTargetNumber(target);
  if (!number) return false;

  // Retirer des trusted
  permissionsData.trusted = permissionsData.trusted.filter(u => cleanTargetNumber(u.number) !== number);

  // Ajouter aux révoqués
  const existing = permissionsData.revoked.find(u => cleanTargetNumber(u.number) === number);
  const contact = getContact(number);
  const resolvedName = name || contact?.notify || contact?.name || `+${number}`;

  if (!existing) {
    permissionsData.revoked.push({
      id: `${number}@s.whatsapp.net`,
      number,
      name: resolvedName,
      revokedAt: Date.now()
    });
  }

  savePermissions();
  return true;
}

/**
 * Annule la révocation d'un utilisateur
 * @param {string} target
 */
export function unrevokeUser(target) {
  const number = cleanTargetNumber(target);
  if (!number) return false;

  const initialLen = permissionsData.revoked.length;
  permissionsData.revoked = permissionsData.revoked.filter(u => cleanTargetNumber(u.number) !== number);
  const changed = permissionsData.revoked.length !== initialLen;

  if (changed) savePermissions();
  return changed;
}

export function isUserTrusted(target) {
  const number = cleanTargetNumber(target);
  if (!number) return false;
  return permissionsData.trusted.some(u => cleanTargetNumber(u.number) === number);
}

export function isUserRevoked(target) {
  const number = cleanTargetNumber(target);
  if (!number) return false;
  return permissionsData.revoked.some(u => cleanTargetNumber(u.number) === number);
}

export function getAllPermissions() {
  return {
    trusted: [...permissionsData.trusted],
    revoked: [...permissionsData.revoked]
  };
}

/**
 * Vérifie si un expéditeur a le droit d'exécuter une commande soumise à permission (/warn, /texte, etc.)
 * @param {object} params
 * @param {object} params.sock - Socket Baileys
 * @param {string} params.senderJid - JID de l'expéditeur
 * @param {string} params.commandName - Nom de la commande
 * @param {string} params.groupJid - JID du groupe où la commande est tapée
 * @param {boolean} params.isOwner - Si l'expéditeur est le propriétaire du bot
 * @returns {Promise<boolean>}
 */
export async function canUserExecuteCommand({ sock, senderJid, commandName, groupJid, isOwner }) {
  if (isOwner) return true;

  const cmd = (commandName || '').toLowerCase();
  const delegatedCommands = ['warn', 'av', 'texte', 'vocal', 'transcrire', 'transcribe', 'id'];

  // Si ce n'est pas une commande modérateur/déléguée, seul l'owner peut l'exécuter
  if (!delegatedCommands.includes(cmd)) {
    return false;
  }

  const cleanNum = cleanTargetNumber(senderJid);
  if (!cleanNum) return false;

  // 1. Si expressément révoqué par le propriétaire -> INTERDIT
  if (isUserRevoked(cleanNum)) {
    return false;
  }

  // 2. Si explicitement ajouté en tant que Trusted (/trust) -> AUTORISÉ
  if (isUserTrusted(cleanNum)) {
    return true;
  }

  // 3. Par défaut : les administrateurs de la taverne
  const config = getConfig();
  const adminTaverneJid = config.hub?.adminTaverne || config.groupAliases?.admintaverne || '120363424594930135@g.us';

  // Vérifier si le membre est dans le groupe admintaverne
  try {
    const metaTaverne = await getCachedGroupMetadata(sock, adminTaverneJid);
    if (metaTaverne?.participants) {
      const inAdminTaverne = metaTaverne.participants.some(p => cleanTargetNumber(p.id) === cleanNum);
      if (inAdminTaverne) return true;
    }
  } catch {}

  // Vérifier si le membre est admin dans le groupe où il tape la commande
  if (groupJid && groupJid.endsWith('@g.us')) {
    try {
      const metaCurrent = await getCachedGroupMetadata(sock, groupJid);
      const participant = metaCurrent?.participants?.find(p => cleanTargetNumber(p.id) === cleanNum);
      if (participant && (participant.admin === 'admin' || participant.admin === 'superadmin')) {
        return true;
      }
    } catch {}
  }

  return false;
}
