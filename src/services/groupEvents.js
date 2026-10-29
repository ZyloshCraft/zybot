import { getConfig } from '../config.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';
import { getContact } from './contactStore.js';

/**
 * Gère les départs et arrivées de membres dans les groupes
 * @param {object} sock - Socket Baileys
 * @param {object} event - Événement group-participants.update
 */
export async function handleGroupParticipantsUpdate(sock, event) {
  if (!event || !event.id) return;
  const { id: groupJid, participants, action } = event;
  if (!participants || !participants.length) return;

  // Seuls les départs (remove) et arrivées (add) nous intéressent
  if (action !== 'remove' && action !== 'add') return;

  const config = getConfig();
  const targets = new Set();
  if (config.hub?.adminTaverne) targets.add(config.hub.adminTaverne);
  if (config.hub?.systemNotifs) targets.add(config.hub.systemNotifs);

  if (targets.size === 0) return;

  let groupName = groupJid;
  try {
    const meta = await getCachedGroupMetadata(sock, groupJid);
    if (meta?.subject) groupName = meta.subject;
  } catch {}

  const dateStr = new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  for (const participant of participants) {
    const cleanNum = participant.split('@')[0].split(':')[0];
    const contact = getContact(cleanNum) || getContact(participant);
    const pseudo = contact?.notify || contact?.name;
    const nameDisplay = pseudo ? `*${pseudo}* (+${cleanNum})` : `*+${cleanNum}*`;

    let messageText = '';
    if (action === 'remove') {
      messageText = `🚪 *Départ d'un membre*\n👥 *Groupe :* ${groupName}\n👤 *Membre :* ${nameDisplay}\n📅 *Date :* ${dateStr}`;
    } else if (action === 'add') {
      messageText = `📥 *Arrivée d'un nouveau membre*\n👥 *Groupe :* ${groupName}\n👤 *Membre :* ${nameDisplay}\n📅 *Date :* ${dateStr}`;
    }

    for (const target of targets) {
      try {
        await sock.sendMessage(target, { text: messageText });
      } catch (err) {
        console.error(`[GroupEvents] Erreur envoi notif départ/arrivée à ${target}:`, err.message);
      }
    }
  }
}

/**
 * Notifie d'un changement de pseudo détecté
 * @param {object} sock - Socket Baileys
 * @param {object} params
 * @param {string} params.senderJid
 * @param {string} params.oldName
 * @param {string} params.newName
 */
export async function handlePseudoChange(sock, { senderJid, oldName, newName }) {
  if (!senderJid || !oldName || !newName || oldName === newName) return;

  const config = getConfig();
  const targets = new Set();
  if (config.hub?.adminTaverne) targets.add(config.hub.adminTaverne);
  if (config.hub?.systemNotifs) targets.add(config.hub.systemNotifs);

  if (targets.size === 0) return;

  const cleanNum = senderJid.split('@')[0].split(':')[0];
  const dateStr = new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const messageText = `🔄 *Changement de pseudo détecté*\n👤 *Numéro :* +${cleanNum}\n📝 *Ancien pseudo :* ~${oldName}\n✨ *Nouveau pseudo :* ~${newName}\n📅 *Date :* ${dateStr}`;

  for (const target of targets) {
    try {
      await sock.sendMessage(target, { text: messageText });
    } catch (err) {
      console.error(`[GroupEvents] Erreur envoi notif pseudo à ${target}:`, err.message);
    }
  }
}
