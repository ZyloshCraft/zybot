import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { getContact } from './contactStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GIVEAWAYS_FILE = path.resolve(__dirname, '../../giveaways.json');

let giveaways = [];
let activeTimers = new Map(); // giveawayId => { endTimer, hourlyInterval }
let currentSocket = null;

export function loadGiveaways() {
  try {
    if (fs.existsSync(GIVEAWAYS_FILE)) {
      const raw = fs.readFileSync(GIVEAWAYS_FILE, 'utf-8');
      giveaways = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[Giveaway] Erreur chargement giveaways.json:', err.message);
    giveaways = [];
  }
}

export function saveGiveaways() {
  try {
    fs.writeFileSync(GIVEAWAYS_FILE, JSON.stringify(giveaways, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Giveaway] Erreur sauvegarde giveaways.json:', err.message);
  }
}

// Charger au démarrage
loadGiveaways();

/**
 * Analyse une chaîne de durée pour le giveaway (ex: 30m, 2h, 24h, 3j, 1d)
 * @param {string} input 
 * @returns {{ durationMs: number, label: string } | null}
 */
export function parseGiveawayDuration(input) {
  if (!input) return null;
  const cleaned = input.toLowerCase().trim();

  const match = cleaned.match(/^(\d+)\s*(s|sec|m|min|h|heure|heures|d|j|jour|jours)?$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  if (isNaN(value) || value <= 0) return null;

  const unit = match[2] || 'h'; // Par défaut : heures

  let durationMs = 0;
  let label = '';

  if (unit.startsWith('s')) {
    durationMs = value * 1000;
    label = `${value} seconde${value > 1 ? 's' : ''}`;
  } else if (unit.startsWith('m')) {
    durationMs = value * 60 * 1000;
    label = `${value} minute${value > 1 ? 's' : ''}`;
  } else if (unit.startsWith('h')) {
    durationMs = value * 60 * 60 * 1000;
    label = `${value} heure${value > 1 ? 's' : ''}`;
  } else if (unit.startsWith('d') || unit.startsWith('j')) {
    durationMs = value * 24 * 60 * 60 * 1000;
    label = `${value} jour${value > 1 ? 's' : ''}`;
  }

  // Minimum 10 secondes, maximum 30 jours
  if (durationMs < 10000) durationMs = 10000;

  return { durationMs, label };
}

/**
 * Formate un nombre de millisecondes restantes en texte lisible en français
 * @param {number} ms 
 * @returns {string}
 */
export function formatRemainingTime(ms) {
  if (ms <= 0) return 'Tirage en cours...';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} jour${days > 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} heure${hours > 1 ? 's' : ''}`);
  if (minutes > 0 && days === 0) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
  if (seconds > 0 && days === 0 && hours === 0) parts.push(`${seconds} seconde${seconds > 1 ? 's' : ''}`);

  return parts.length > 0 ? parts.join(' et ') : 'moins d\'une minute';
}

/**
 * Crée un nouveau giveaway
 */
export function createGiveaway({ groupJid, messageId, messageKey, prize, durationMs, creatorJid }) {
  const id = `gw_${Date.now()}`;
  const now = Date.now();
  const endsAt = now + durationMs;

  const giveaway = {
    id,
    groupJid,
    messageId,
    messageKey,
    prize,
    durationMs,
    createdAt: now,
    endsAt,
    creatorJid,
    participants: [],
    status: 'active'
  };

  giveaways.push(giveaway);
  saveGiveaways();

  if (currentSocket) {
    scheduleGiveaway(currentSocket, giveaway);
  }

  return giveaway;
}

/**
 * Planifie les timers de fin et d'actualisation horaire pour un giveaway
 */
function scheduleGiveaway(sock, giveaway) {
  if (giveaway.status !== 'active') return;

  // Nettoyer d'anciens timers s'ils existent
  if (activeTimers.has(giveaway.id)) {
    const t = activeTimers.get(giveaway.id);
    if (t.endTimer) clearTimeout(t.endTimer);
    if (t.hourlyInterval) clearInterval(t.hourlyInterval);
    activeTimers.delete(giveaway.id);
  }

  const remaining = giveaway.endsAt - Date.now();

  if (remaining <= 0) {
    finishGiveaway(sock, giveaway.id);
    return;
  }

  // Timer de fin
  const endTimer = setTimeout(() => {
    finishGiveaway(sock, giveaway.id);
  }, remaining);

  // Intervalle d'actualisation horaire des messages privés (DM)
  const intervalMs = giveaway.durationMs <= 3600000 ? 60000 : 3600000;
  const hourlyInterval = setInterval(() => {
    updateGiveawayDMs(sock, giveaway.id);
  }, intervalMs);

  activeTimers.set(giveaway.id, { endTimer, hourlyInterval });
}

/**
 * Tente d'éditer le message d'annonce principal dans le groupe (uniquement pendant les 14 premières minutes permises par WhatsApp)
 */
export async function updateGiveawayAnnouncement(sock, gw) {
  if (!sock || !gw || !gw.groupJid || !gw.messageKey) return false;

  const ageMs = Date.now() - (gw.createdAt || 0);
  const canEdit = ageMs < 14 * 60 * 1000;

  // Au-delà de 14 minutes, WhatsApp rejette l'édition sur mobile/web.
  // Pour éviter tout spam dans le groupe, on n'envoie AUCUN nouveau message automatique.
  if (!canEdit) {
    return false;
  }

  const remaining = gw.endsAt - Date.now();
  const timeStr = formatRemainingTime(remaining);
  const endFormatted = new Date(gw.endsAt).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const mainText = [
    '🎉 *GIVEAWAY*',
    '━━━━━━━━━━━━━━━━━━━━',
    `🎁 *Lot :* ${gw.prize}`,
    `⏱️ *Temps restant :* ${timeStr} _(Fin : ${endFormatted})_`,
    `👥 *Participants :* ${gw.participants.length}`,
    '',
    '👉 Réagissez avec un emoji pour participer !'
  ].join('\n');

  try {
    await sock.sendMessage(gw.groupJid, {
      text: mainText,
      edit: gw.messageKey
    });
    console.log(`[Giveaway] Annonce éditée dans ${gw.groupJid} (${gw.participants.length} participants)`);
    return true;
  } catch (err) {
    console.warn(`[Giveaway] Échec édition directe (${err.message})`);
    return false;
  }
}

/**
 * Met à jour le message privé (DM) de chaque participant avec le temps restant
 */
export async function updateGiveawayDMs(sock, giveawayId) {
  const gw = giveaways.find(g => g.id === giveawayId && g.status === 'active');
  if (!gw || !sock) return;

  const remaining = gw.endsAt - Date.now();
  if (remaining <= 0) return;

  const timeStr = formatRemainingTime(remaining);

  for (const p of gw.participants) {
    if (p.dmChatJid && p.dmMessageKey) {
      const updatedText = [
        '✅ *Participation enregistrée !*',
        `🎁 Lot : *${gw.prize}*`,
        `⏱️ *Temps restant :* ${timeStr}`,
        '',
        '🍀 _Ce message s\'actualise chaque heure._'
      ].join('\n');

      try {
        await sock.sendMessage(p.dmChatJid, {
          text: updatedText,
          edit: p.dmMessageKey
        });
      } catch (err) {
        // En cas d'échec d'édition, ne pas bloquer
      }
    }
  }

  // Mettre également à jour le message principal du giveaway dans le groupe
  await updateGiveawayAnnouncement(sock, gw);
}

/**
 * Gère une réaction emoji reçue sur un message
 */
export async function handleGiveawayReaction({ sock, messageId, reactorJid, emoji, pushName }) {
  if (!messageId || !reactorJid) return false;

  const gw = giveaways.find(g => g.messageId === messageId && g.status === 'active');
  if (!gw) return false;

  const isLid = reactorJid.endsWith('@lid');
  const cleanNum = reactorJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  if (!cleanNum) return false;

  // Déterminer le JID direct pour le message privé (DM)
  const dmChatJid = isLid ? reactorJid : `${cleanNum}@s.whatsapp.net`;

  // 1. Réaction retirée (emoji vide ou null)
  if (!emoji || emoji.trim() === '') {
    const idx = gw.participants.findIndex(p => p.jid === reactorJid || p.number === cleanNum);
    if (idx >= 0) {
      gw.participants.splice(idx, 1);
      saveGiveaways();
      console.log(`[Giveaway] ${cleanNum} a retiré sa réaction, participation annulée.`);
      if (sock) {
        await updateGiveawayAnnouncement(sock, gw);
      }
    }
    return true;
  }

  // 2. Vérifier si déjà participant
  const alreadyParticipating = gw.participants.some(p => p.jid === reactorJid || p.number === cleanNum);
  if (alreadyParticipating) {
    return true; // Déjà inscrit, rien à faire
  }

  // Récupérer le pseudo
  const contact = getContact(cleanNum);
  const resolvedName = pushName || contact?.notify || contact?.name || (isLid ? `Membre` : `+${cleanNum}`);

  const remaining = gw.endsAt - Date.now();
  const timeStr = formatRemainingTime(remaining);

  const dmText = [
    '✅ *Participation enregistrée !*',
    `🎁 Lot : *${gw.prize}*`,
    `⏱️ *Temps restant :* ${timeStr}`,
    '',
    '🍀 _Ce message s\'actualise chaque heure._'
  ].join('\n');

  let sentDm = null;
  if (sock) {
    try {
      sentDm = await sock.sendMessage(dmChatJid, { text: dmText });
    } catch (err) {
      console.warn(`[Giveaway] Impossible d'envoyer le message privé à ${dmChatJid}:`, err.message);
    }
  }

  const participant = {
    jid: reactorJid,
    number: cleanNum,
    name: resolvedName,
    joinedAt: Date.now(),
    dmChatJid,
    dmMessageKey: sentDm?.key || null
  };

  gw.participants.push(participant);
  saveGiveaways();

  console.log(`[Giveaway] Nouveau participant : ${resolvedName} (${cleanNum}) pour "${gw.prize}". Total : ${gw.participants.length}`);

  // Mettre à jour immédiatement le message principal du giveaway dans le groupe
  if (sock) {
    await updateGiveawayAnnouncement(sock, gw);
  }

  return true;
}

/**
 * Clôture le giveaway et tire un gagnant aléatoire
 */
export async function finishGiveaway(sock, giveawayId) {
  const gw = giveaways.find(g => g.id === giveawayId && g.status === 'active');
  if (!gw) return;

  gw.status = 'completed';
  gw.completedAt = Date.now();

  // Nettoyer timers
  if (activeTimers.has(gw.id)) {
    const t = activeTimers.get(gw.id);
    if (t.endTimer) clearTimeout(t.endTimer);
    if (t.hourlyInterval) clearInterval(t.hourlyInterval);
    activeTimers.delete(gw.id);
  }

  saveGiveaways();

  if (!sock) return;

  // Tirage au sort
  if (!gw.participants || gw.participants.length === 0) {
    const noWinnerMsg = [
      '⌛ *GIVEAWAY TERMINÉ*',
      '━━━━━━━━━━━━━━━━━━━━',
      `🎁 *Lot :* ${gw.prize}`,
      '❌ Aucun participant n\'a réagi au message.'
    ].join('\n');

    try {
      await sock.sendMessage(gw.groupJid, { text: noWinnerMsg });
    } catch (err) {
      console.error('[Giveaway] Erreur annonce aucun gagnant:', err.message);
    }
    return;
  }

  // Choisir un participant au hasard
  const randomIndex = Math.floor(Math.random() * gw.participants.length);
  const winner = gw.participants[randomIndex];
  gw.winner = winner;
  saveGiveaways();

  const winnerJid = winner.jid.includes('@') ? winner.jid : `${winner.number}@s.whatsapp.net`;

  // Annonce dans le groupe avec mention du gagnant
  const announcement = [
    '🎉 *GIVEAWAY TERMINÉ*',
    '━━━━━━━━━━━━━━━━━━━━',
    `🎁 *Lot :* ${gw.prize}`,
    `🏆 *Gagnant :* @${winner.number} (*${winner.name || winner.number}*)`,
    `👥 *Participants :* ${gw.participants.length}`,
    '',
    '🥳 Félicitations au gagnant !'
  ].join('\n');

  try {
    await sock.sendMessage(gw.groupJid, {
      text: announcement,
      mentions: [winnerJid]
    });
  } catch (err) {
    console.error('[Giveaway] Erreur annonce gagnant dans le groupe:', err.message);
  }

  // Message privé de félicitations au gagnant
  const winnerDm = [
    '🥳 *FÉLICITATIONS ! TU AS REMPORTÉ LE GIVEAWAY !*',
    '━━━━━━━━━━━━━━━━━━━━',
    `🎁 *Lot gagné :* ${gw.prize}`,
    `👥 Tu as été tiré au sort parmi *${gw.participants.length} participants* !`,
    '',
    '💬 Réponds à ce message ou contacte les administrateurs pour recevoir ton lot !'
  ].join('\n');

  try {
    await sock.sendMessage(winner.dmChatJid, { text: winnerDm });
  } catch (err) {
    console.error('[Giveaway] Erreur envoi DM gagnant:', err.message);
  }

  // Mettre à jour les messages privés des autres participants pour les informer
  for (const p of gw.participants) {
    if (p.number === winner.number) continue;
    if (p.dmChatJid && p.dmMessageKey) {
      const finishDmText = [
        '⌛ *Giveaway terminé !*',
        `🎁 Le giveaway pour *${gw.prize}* a pris fin.`,
        `🏆 Le gagnant tiré au sort est : *${winner.name || winner.number}*`,
        '',
        '🙏 Merci pour votre participation !'
      ].join('\n');

      try {
        await sock.sendMessage(p.dmChatJid, {
          text: finishDmText,
          edit: p.dmMessageKey
        });
      } catch (err) {}
    }
  }

  return { success: true, winner, giveaway: gw };
}

/**
 * Tire un nouveau gagnant (reroll) pour un giveaway
 */
export async function rerollGiveaway(sock, giveawayId) {
  const gw = giveaways.find(g => g.id === giveawayId);
  if (!gw) return { success: false, reason: 'not_found' };

  if (!gw.participants || gw.participants.length === 0) {
    return { success: false, reason: 'no_participants', giveaway: gw };
  }

  // Si le giveaway était encore actif, on l'arrête proprement
  if (gw.status === 'active') {
    gw.status = 'completed';
    gw.completedAt = Date.now();
    if (activeTimers.has(gw.id)) {
      const t = activeTimers.get(gw.id);
      if (t.endTimer) clearTimeout(t.endTimer);
      if (t.hourlyInterval) clearInterval(t.hourlyInterval);
      activeTimers.delete(gw.id);
    }
  }

  // Si plus d'un participant, on sélectionne parmi les autres participants
  let candidatePool = gw.participants;
  if (gw.participants.length > 1 && gw.winner) {
    const others = gw.participants.filter(p => p.number !== gw.winner.number);
    if (others.length > 0) {
      candidatePool = others;
    }
  }

  const randomIndex = Math.floor(Math.random() * candidatePool.length);
  const newWinner = candidatePool[randomIndex];
  gw.winner = newWinner;
  gw.rerolledAt = Date.now();
  saveGiveaways();

  if (sock && gw.groupJid) {
    const winnerJid = newWinner.jid.includes('@') ? newWinner.jid : `${newWinner.number}@s.whatsapp.net`;
    const announcement = [
      '🎉 *GIVEAWAY — REROLL*',
      '━━━━━━━━━━━━━━━━━━━━',
      `🎁 *Lot :* ${gw.prize}`,
      `🏆 *Nouveau Gagnant :* @${newWinner.number} (*${newWinner.name || newWinner.number}*)`,
      `👥 *Participants :* ${gw.participants.length}`,
      '',
      '🥳 Félicitations au nouveau gagnant !'
    ].join('\n');

    try {
      await sock.sendMessage(gw.groupJid, {
        text: announcement,
        mentions: [winnerJid]
      });
    } catch (err) {
      console.error('[Giveaway] Erreur annonce reroll:', err.message);
    }

    // Message privé de félicitations au nouveau gagnant
    const winnerDm = [
      '🥳 *FÉLICITATIONS ! TU AS REMPORTÉ LE REROLL !*',
      '━━━━━━━━━━━━━━━━━━━━',
      `🎁 *Lot gagné :* ${gw.prize}`,
      `👥 Tu as été tiré au sort lors du reroll parmi *${gw.participants.length} participants* !`,
      '',
      '💬 Réponds à ce message ou contacte les administrateurs pour recevoir ton lot !'
    ].join('\n');

    try {
      if (newWinner.dmChatJid) {
        await sock.sendMessage(newWinner.dmChatJid, { text: winnerDm });
      }
    } catch (err) {
      console.error('[Giveaway] Erreur envoi DM nouveau gagnant reroll:', err.message);
    }
  }

  return { success: true, winner: newWinner, giveaway: gw };
}

export function getActiveGiveawayForGroup(groupJid) {
  return giveaways.slice().reverse().find(g => g.groupJid === groupJid && g.status === 'active');
}

export function getLatestGiveawayForGroup(groupJid) {
  return giveaways.slice().reverse().find(g => g.groupJid === groupJid);
}

export function getGiveawayByMessageId(messageId) {
  return giveaways.find(g => g.messageId === messageId);
}

/**
 * Initialise l'ensemble des giveaways actifs au démarrage du bot
 */
export function initGiveawayEngine(sock) {
  currentSocket = sock;
  console.log(`🎉 [Giveaway] Initialisation du moteur (giveaways en mémoire : ${giveaways.length})...`);

  for (const gw of giveaways) {
    if (gw.status === 'active') {
      scheduleGiveaway(sock, gw);
    }
  }
}

export function getAllGiveaways() {
  return [...giveaways];
}
