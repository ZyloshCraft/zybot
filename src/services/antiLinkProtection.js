import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../config.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';
import { isUserTrusted } from './permissionStore.js';
import { recordAuditLog } from './auditLogStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ANTI_RAID_FILE = path.resolve(__dirname, '../../anti_raid.json');

let antiRaidData = {
  recentJoins: {},   // groupJid => { participantJid: joinedTimestamp }
  linkWarnings: {}   // groupJid => { participantJid: count }
};

export function loadAntiRaidData() {
  try {
    if (fs.existsSync(ANTI_RAID_FILE)) {
      const raw = fs.readFileSync(ANTI_RAID_FILE, 'utf-8');
      antiRaidData = JSON.parse(raw);
      if (!antiRaidData.recentJoins) antiRaidData.recentJoins = {};
      if (!antiRaidData.linkWarnings) antiRaidData.linkWarnings = {};
    }
  } catch (err) {
    console.error('[AntiRaid] Erreur chargement anti_raid.json:', err.message);
    antiRaidData = { recentJoins: {}, linkWarnings: {} };
  }
}

export function saveAntiRaidData() {
  try {
    fs.writeFileSync(ANTI_RAID_FILE, JSON.stringify(antiRaidData, null, 2), 'utf-8');
  } catch (err) {
    console.error('[AntiRaid] Erreur sauvegarde anti_raid.json:', err.message);
  }
}

// Charger au démarrage
loadAntiRaidData();

/**
 * Enregistre l'arrivée d'un nouveau membre dans un groupe
 */
export function recordMemberJoin(groupJid, participantJid, timestamp = Date.now()) {
  if (!groupJid || !participantJid) return;
  if (!antiRaidData.recentJoins[groupJid]) {
    antiRaidData.recentJoins[groupJid] = {};
  }
  antiRaidData.recentJoins[groupJid][participantJid] = timestamp;

  // Réinitialiser les avertissements de lien
  if (antiRaidData.linkWarnings[groupJid]) {
    delete antiRaidData.linkWarnings[groupJid][participantJid];
  }

  saveAntiRaidData();
}

/**
 * Supprime les enregistrements d'un membre (ex: départ ou expulsion)
 */
export function clearMemberAntiRaid(groupJid, participantJid) {
  if (!participantJid && groupJid) {
    participantJid = groupJid;
    groupJid = null;
  }
  if (!participantJid) return;

  if (groupJid) {
    if (antiRaidData.recentJoins[groupJid]) {
      delete antiRaidData.recentJoins[groupJid][participantJid];
    }
    if (antiRaidData.linkWarnings[groupJid]) {
      delete antiRaidData.linkWarnings[groupJid][participantJid];
    }
  } else {
    for (const gj of Object.keys(antiRaidData.recentJoins)) {
      delete antiRaidData.recentJoins[gj][participantJid];
    }
    for (const gj of Object.keys(antiRaidData.linkWarnings)) {
      delete antiRaidData.linkWarnings[gj][participantJid];
    }
  }
  saveAntiRaidData();
}

/**
 * Vérifie si un membre a rejoint il y a moins de maxAgeMs (défaut 10 minutes)
 * @returns {{ joinedAt: number, remainingMs: number } | null}
 */
export function isRecentJoin(groupJid, participantJid, maxAgeMs = 10 * 60 * 1000) {
  if (!groupJid || !participantJid) return null;
  const groupJoins = antiRaidData.recentJoins[groupJid];
  if (!groupJoins) return null;

  // Chercher par JID exact ou par numéro de téléphone
  const cleanNum = participantJid.split('@')[0].split(':')[0];
  let joinedAt = groupJoins[participantJid];

  if (!joinedAt) {
    const key = Object.keys(groupJoins).find(k => k.split('@')[0].split(':')[0] === cleanNum);
    if (key) joinedAt = groupJoins[key];
  }

  if (!joinedAt) return null;

  const elapsed = Date.now() - joinedAt;
  if (elapsed < maxAgeMs) {
    return { joinedAt, remainingMs: maxAgeMs - elapsed };
  }

  // Période probatoire dépassée : nettoyer l'entrée
  delete groupJoins[participantJid];
  saveAntiRaidData();
  return null;
}

/**
 * Incrémente et renvoie le nombre d'avertissements de lien pour un membre
 */
export function recordLinkAttempt(groupJid, participantJid) {
  if (!groupJid || !participantJid) return 1;
  if (!antiRaidData.linkWarnings[groupJid]) {
    antiRaidData.linkWarnings[groupJid] = {};
  }
  const cleanNum = participantJid.split('@')[0].split(':')[0];
  let currentKey = participantJid;
  const existingKey = Object.keys(antiRaidData.linkWarnings[groupJid]).find(
    k => k.split('@')[0].split(':')[0] === cleanNum
  );
  if (existingKey) currentKey = existingKey;

  const currentCount = antiRaidData.linkWarnings[groupJid][currentKey] || 0;
  const newCount = currentCount + 1;
  antiRaidData.linkWarnings[groupJid][currentKey] = newCount;
  saveAntiRaidData();
  return newCount;
}

/**
 * Récupère le nombre d'avertissements de lien pour un membre
 */
export function getLinkWarnings(groupJid, participantJid) {
  if (!groupJid || !participantJid) return 0;
  const cleanNum = participantJid.split('@')[0].split(':')[0];
  const groupWarnings = antiRaidData.linkWarnings[groupJid];
  if (!groupWarnings) return 0;
  const key = Object.keys(groupWarnings).find(k => k.split('@')[0].split(':')[0] === cleanNum);
  return key ? groupWarnings[key] : 0;
}

/**
 * Détecte si un texte contient un lien web, une invitation WhatsApp/Discord/Telegram ou un nom de domaine
 */
export function containsLink(text) {
  if (!text || typeof text !== 'string') return false;
  const linkRegex = /(https?:\/\/[^\s]+)|(chat\.whatsapp\.com\/[^\s]+)|(wa\.me\/[^\s]+)|(discord\.(gg|com\/invite)\/[^\s]+)|(t\.me\/[^\s]+)|(\b[a-zA-Z0-9-]+\.(?:com|net|org|fr|io|gg|me|app|xyz|link|be|de|info|online|site|to|co|dev|tech)\b(\/[^\s]*)?)/i;
  return linkRegex.test(text);
}

/**
 * Formate un nombre de millisecondes en texte humain et naturel
 */
export function formatRemainingTimeHuman(ms) {
  if (ms <= 0) return '0 seconde';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    if (seconds > 0) {
      return `${minutes} min et ${seconds} sec`;
    }
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  return `${seconds} seconde${seconds > 1 ? 's' : ''}`;
}

/**
 * Traite les messages envoyés dans les groupes pour intercepter les liens des nouveaux membres
 * @returns {Promise<boolean>} true si un lien non autorisé a été intercepté et traité
 */
export async function handleGroupAntiLink({ sock, msg, jid, text, senderJid }) {
  if (!jid || !jid.endsWith('@g.us')) return false;
  if (!text || msg.key?.fromMe) return false;

  const config = getConfig();
  if (config.antiRaid?.enabled === false) return false;

  const maxAgeMs = (config.antiRaid?.probationMinutes || 10) * 60 * 1000;
  const maxWarnings = config.antiRaid?.maxWarnings || 5;

  // 1. Détection de lien
  if (!containsLink(text)) return false;

  // 2. Vérifier si l'expéditeur a rejoint il y a moins de 10 minutes
  const joinInfo = isRecentJoin(jid, senderJid, maxAgeMs);
  if (!joinInfo) return false;

  // 3. Vérifier les autorisations / exemptions (/trust)
  const cleanNumber = senderJid.split('@')[0].split(':')[0];
  if (isUserTrusted(cleanNumber)) {
    return false; // Membre de confiance exempté
  }

  // 4. Vérifier les rôles dans le groupe
  let meta = null;
  try {
    meta = await getCachedGroupMetadata(sock, jid);
  } catch (err) {
    console.warn('[AntiLink] Impossible de récupérer les métadonnées du groupe:', err.message);
    return false;
  }

  // Si l'expéditeur est admin du groupe, ne pas bloquer
  const senderPart = meta?.participants?.find(
    p => p.id === senderJid || p.id.split('@')[0].split(':')[0] === cleanNumber
  );
  if (senderPart?.admin === 'admin' || senderPart?.admin === 'superadmin') {
    return false;
  }

  // Vérifier si le bot est admin du groupe
  const myNumber = sock.user?.id ? sock.user.id.split(':')[0] : null;
  const botPart = meta?.participants?.find(p => myNumber && p.id.includes(myNumber));
  const isBotAdmin = botPart?.admin === 'admin' || botPart?.admin === 'superadmin';

  if (!isBotAdmin) {
    console.warn(`[AntiLink] Lien détecté de +${cleanNumber} dans "${meta?.subject}" mais le bot n'est pas admin.`);
    return false;
  }

  // 5. Supprimer immédiatement le message contenant le lien
  try {
    await sock.sendMessage(jid, { delete: msg.key });
  } catch (err) {
    console.warn('[AntiLink] Échec suppression message lien:', err.message);
  }

  // 6. Enregistrer la tentative et calculer le compteur
  const warnCount = recordLinkAttempt(jid, senderJid);
  const targetJid = senderPart?.id || senderJid;
  const groupName = meta?.subject || jid;

  recordAuditLog({
    type: 'moderation',
    action: warnCount >= maxWarnings ? 'ANTILINK_BAN' : 'ANTILINK_WARN',
    user: `+${cleanNumber}`,
    pushName: msg.pushName || '',
    chatJid: jid,
    chatName: groupName,
    details: warnCount >= maxWarnings ? `Expulsion automatique suite à ${warnCount} tentatives de lien` : `Lien supprimé (tentative ${warnCount}/${maxWarnings})`,
    status: warnCount >= maxWarnings ? 'error' : 'warning'
  });

  if (warnCount >= maxWarnings) {
    // 7. Expulsion du membre (ban)
    try {
      await sock.groupParticipantsUpdate(jid, [targetJid], 'remove');
    } catch (err) {
      console.error(`[AntiLink] Échec expulsion de +${cleanNumber}:`, err.message);
    }

    // Message concis et naturel
    const banText = `@${cleanNumber} a été expulsé après 5 liens non autorisés.`;
    try {
      await sock.sendMessage(jid, {
        text: banText,
        mentions: [targetJid]
      });
    } catch {}

    // Nettoyer les données du membre
    clearMemberAntiRaid(jid, targetJid);

    // Alerte discrète au hub admin
    const adminTaverne = config.hub?.adminTaverne || config.hub?.admintaverne || config.groupAliases?.admintaverne;
    if (adminTaverne && config.notifications?.antiRaid !== false) {
      try {
        await sock.sendMessage(adminTaverne, {
          text: `🛡️ [Anti-Raid] @${cleanNumber} expulsé de "${groupName}" (5 liens envoyés en période probatoire).`
        });
      } catch {}
    }

    return true;
  }

  // 8. Avertissement (1 à 4)
  const remaining = maxWarnings - warnCount;
  const timeStr = formatRemainingTimeHuman(joinInfo.remainingMs);

  const warningText = `@${cleanNumber} Merci de patienter encore ${timeStr} avant de pouvoir envoyer des liens. (${remaining} lien${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''} avant ban)`;

  try {
    await sock.sendMessage(jid, {
      text: warningText,
      mentions: [targetJid]
    });
  } catch {}

  return true;
}

export function getAntiRaidData() {
  return { ...antiRaidData };
}
