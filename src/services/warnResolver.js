import { getCachedGroupMetadata } from '../utils/groupCache.js';
import { findSenderByPushName } from './messageStore.js';
import { searchContactByPseudo, getContact } from './contactStore.js';
import { addWarn, getWarns } from './warnStore.js';

export const HISTORIC_TARGETS = [
  { pseudo: 'grandjeanlouis3', search: ['grandjeanlouis3', 'grandjean'], count: 1 },
  { pseudo: '@~🎸Hugo🎾', search: ['hugo', '🎸hugo🎾'], count: 1, knownId: '218193348006100@lid' },
  { pseudo: 'Léandre', search: ['léandre', 'leandre'], count: 1 },
  { pseudo: 'Axel', search: ['axel'], count: 2 },
  { pseudo: 'le Vrai Qlqun', search: ['vrai qlqun', 'qlqun', 'le vrai'], count: 1 },
  { pseudo: 'T0ny', search: ['t0ny', 'tony'], count: 1 },
  { pseudo: 'Mme chaise Ikea', search: ['chaise', 'ikea', 'cԋaιsҽ_ιkҽa'], count: 1, knownId: '45067494527041@lid' },
  { pseudo: 'martin', search: ['martin', 'martin chopard'], count: 1, knownId: '89288343560361@lid' },
  { pseudo: 'Laslo Tarery', search: ['laslo', 'tarery', 'laslo tarery'], count: 2, knownId: '133023878103251@lid' },
  { pseudo: 'Kalyzz', search: ['kalyzz'], count: 1 },
  { pseudo: 'luxyju', search: ['luxyju'], count: 2 },
  { pseudo: 'Valentin ( PDP chat)', search: ['valentin'], count: 1, knownId: '18081946574907@lid' },
  { pseudo: 'Hobbit', search: ['hobbit'], count: 2 },
  { pseudo: 'Jules', search: ['jules'], count: 1, knownId: '280539177156612@lid' },
  { pseudo: 'Henry', search: ['henry'], count: 1 },
  { pseudo: 'Elise', search: ['elise'], count: 1 },
  { pseudo: 'c pa lazare', search: ['lazare', 'c pa lazare'], count: 1 },
  { pseudo: 'antibiotiques', search: ['antibiotiques', 'antibiotique'], count: 1 },
  { pseudo: 'esteban', search: ['esteban'], count: 1 },
  { pseudo: 'Camille', search: ['camille'], count: 1, knownId: '169973951537221@lid' },
  { pseudo: 'Nathan', search: ['nathan', 'i’_nathan', 'nathmen12'], count: 1, knownId: '80020206841937@lid' },
  { pseudo: 'Alex (pdp ia avec son pseudo)', search: ['alex'], count: 1 },
  { pseudo: 'Léopold', search: ['léopold', 'leopold'], count: 1 },
  { pseudo: 'Jorel', search: ['jorel'], count: 1 },
  { pseudo: 'TS|Nezor', search: ['nezor', 'ts|nezor'], count: 1 },
  { pseudo: 'divienko', search: ['divienko'], count: 1 },
  { pseudo: 'Arthur ⚔️', search: ['arthur', 'arthur ob'], count: 1, knownId: '4213530726559@lid' },
  { pseudo: 'val', search: ['val', 'valérian'], count: 1, knownId: '86342365098148@lid' },
  { pseudo: 'Orselan423', search: ['orselan423', 'orselan'], count: 2 },
  { pseudo: 'Shadow', search: ['shadow'], count: 1 },
  { pseudo: 'Singe', search: ['singe'], count: 1 },
  { pseudo: 'Zamzeta', search: ['zamzeta'], count: 1 },
  { pseudo: 'Jigsaw', search: ['jigsaw'], count: 2, knownId: '272443381952587@lid' },
  { pseudo: '@MaTt', search: ['matt', 'm.4tt_1', 'm.4tt'], count: 1, knownId: '231928737304692@lid' },
  { pseudo: 'Emmanuel', search: ['emmanuel'], count: 1 },
  { pseudo: 'antoine (sans majuscule)', search: ['antoine'], count: 2, knownId: '118824867217591@lid' },
  { pseudo: 'Red 🥰🎂🎂🎂🎂', search: ['red'], count: 1 },
  { pseudo: 'Le_SS', search: ['le_ss', 'less'], count: 1 },
  { pseudo: 'Arthur m. 🐱', search: ['arthur.m', 'arthur.m 🐱'], count: 2, knownId: '42091015106608@lid' },
  { pseudo: 'Cédric', search: ['cédric', 'cedric'], count: 1 },
  { pseudo: 'thomas', search: ['thomas'], count: 1 },
  { pseudo: 'Thibault Fournier', search: ['thibault', 'fournier', 'thibault fournier'], count: 1, knownId: '37830692761710@lid' },
  { pseudo: 'Paulo', search: ['paulo', 'paul', 'goat paul'], count: 1, knownId: '198071476605072@lid' },
  { pseudo: '4164616D', search: ['4164616d', 'adam'], count: 3, isBan: true },
  { pseudo: 'Gaspoire', search: ['gaspoire'], count: 1 },
  { pseudo: 'Viktor', search: ['viktor', 'victor'], count: 1 },
  { pseudo: 'Valentin🌸☁️', search: ['valentin🌸☁️', 'simunix'], count: 2, knownId: '270248284557551@lid' },
  { pseudo: 'Max', search: ['max'], count: 1, knownId: '148572012019731@lid' },
  { pseudo: 'Justin', search: ['justin'], count: 2 },
  { pseudo: 'Gabriel Caillet', search: ['gabriel', 'caillet', 'gabriel caillet'], count: 1, knownId: '218842156511281@lid' },
  { pseudo: 'Eden', search: ['eden'], count: 1 },
  { pseudo: 'Alban', search: ['alban'], count: 1 },
  { pseudo: 'Ilouze', search: ['ilouze'], count: 1 },
  { pseudo: 'Elliot', search: ['elliot', 'eliot'], count: 1, knownId: '143791226888339@lid' },
  { pseudo: '@~Aedan', search: ['aedan'], count: 1, knownId: '177416593006705@lid' },
  { pseudo: 'Celyan', search: ['celyan'], count: 1 },
  { pseudo: '@~Tery', search: ['tery'], count: 1 },
  { pseudo: 'Ulysse', search: ['ulysse'], count: 1 },
  { pseudo: 'Ewann brousier', search: ['ewann', 'brousier', 'ewann brousier'], count: 1 },
  { pseudo: '@~Nolan', search: ['nolan'], count: 1, reason: 'Pub non autorisée', knownId: '2946733502528@lid' }
];

/**
 * Normalise une chaîne pour faciliter les correspondances insensibles à la casse et symboles
 */
function clean(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[@~*_]/g, '').trim();
}

/**
 * Résout les identifiants des membres ciblés en scannant les métadonnées de groupe et l'historique
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {string} groupJid
 * @returns {Promise<{ resolved: Array<object>, unresolved: Array<object>, totalTargets: number }>}
 */
export async function resolveHistoricMembers(sock, groupJid) {
  let participants = [];
  try {
    if (sock && groupJid && groupJid.endsWith('@g.us')) {
      const meta = await getCachedGroupMetadata(sock, groupJid);
      participants = meta?.participants || [];
    }
  } catch (err) {
    console.warn('[WarnResolver] Erreur métadonnées groupe:', err.message);
  }

  const resolved = [];
  const unresolved = [];

  for (const item of HISTORIC_TARGETS) {
    let matchedId = item.knownId || null;
    let matchedName = null;

    // 1. Si ID déjà connu
    if (matchedId) {
      matchedName = item.pseudo;
    } else {
      // 2. Chercher dans les participants du groupe via contacts
      for (const p of participants) {
        const contact = getContact(p.id);
        const contactName = clean(contact?.notify || contact?.name || '');
        if (!contactName) continue;

        for (const s of item.search) {
          if (contactName === s || contactName.includes(s) || s.includes(contactName)) {
            matchedId = p.id;
            matchedName = contact?.notify || contact?.name || item.pseudo;
            break;
          }
        }
        if (matchedId) break;
      }

      // 3. Chercher dans messageStore
      if (!matchedId) {
        for (const s of item.search) {
          const match = findSenderByPushName(s, groupJid);
          if (match) {
            matchedId = match.sender;
            matchedName = match.pushName;
            break;
          }
        }
      }

      // 4. Chercher dans contactStore global
      if (!matchedId) {
        for (const s of item.search) {
          const c = searchContactByPseudo(s);
          if (c) {
            matchedId = c.id;
            matchedName = c.notify || c.name;
            break;
          }
        }
      }
    }

    if (matchedId) {
      resolved.push({
        ...item,
        resolvedId: matchedId,
        resolvedNumber: matchedId.split('@')[0].split(':')[0],
        displayName: matchedName || item.pseudo
      });
    } else {
      unresolved.push(item);
    }
  }

  return {
    resolved,
    unresolved,
    totalTargets: HISTORIC_TARGETS.length
  };
}

/**
 * Applique l'ensemble des warns historiques résolus dans le warnStore
 * @param {Array<object>} resolvedList
 * @param {string} [groupName='Taverne']
 * @returns {number} Nombre total de warns enregistrés
 */
export function applyHistoricWarns(resolvedList, groupName = 'Taverne') {
  let count = 0;
  for (const item of resolvedList) {
    if (!item.resolvedNumber) continue;
    const existing = getWarns(item.resolvedNumber);
    // Si l'utilisateur a déjà des avertissements, ne pas réinsérer en double
    if (existing.length >= item.count) continue;

    const toAdd = item.count - existing.length;
    for (let i = 0; i < toAdd; i++) {
      addWarn(item.resolvedNumber, {
        groupJid: '120363424594930135@g.us',
        groupName,
        reason: item.reason || (item.isBan ? 'BAN COMMUNAUTAIRE' : 'Avertissement antérieur Taverne'),
        admin: 'Administration Taverne',
        pushName: item.displayName
      });
      count++;
    }
  }
  return count;
}
