import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { parseScheduledTime, addScheduledMessage } from './scheduler.js';
import { replyOrEdit, sendStealthMessage, sleep } from '../utils/stealth.js';
import { getConfig } from '../config.js';

// Stockage de l'état du wizard par utilisateur
const activeWizards = new Map();

export function hasActiveWizard(userId) {
  return activeWizards.has(userId);
}

export function clearWizard(userId) {
  activeWizards.delete(userId);
}

export function parseRecipient(input, selfJid, currentJid) {
  if (!input) return currentJid;
  const trimmed = input.trim().toLowerCase();
  if (trimmed === 'moi' || trimmed === 'me' || trimmed === 'self') return selfJid;
  if (trimmed === 'ici' || trimmed === 'here') return currentJid;

  // 1. Si c'est directement un identifiant de groupe WhatsApp (@g.us)
  if (trimmed.endsWith('@g.us')) return trimmed;

  // 2. Si c'est un alias de groupe enregistré (ex: 'famille', 'travail', 'notifds', 'testbot')
  const config = getConfig();
  const aliases = config.groupAliases || {};
  if (aliases[trimmed]) {
    return aliases[trimmed];
  }

  let cleaned = input.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '33' + cleaned.slice(1); // Standard français
  }
  if (cleaned.length >= 8) {
    return cleaned + '@s.whatsapp.net';
  }
  return null;
}

export async function startProgramWizard({ sock, msg, jid, userId }) {
  const setupKeys = [];
  if (msg?.key) setupKeys.push(msg.key);

  activeWizards.set(userId, {
    step: 1,
    chatOrigin: jid,
    targetDate: null,
    formattedDate: '',
    messageText: '',
    targetJid: null,
    setupKeys
  });

  const promptText = [
    '📅 *Programmation assistée (Étape 1/3)*',
    'À quelle date et heure voulez-vous envoyer le message ?',
    '',
    '• *Formats acceptés :*',
    '  - Délai : `+15m`, `+2h`, `+1j` *(dans 15 min, 2h...)*',
    '  - Heure : `21:30` *(aujourd\'hui ou demain)*',
    '  - Date complète : `25/12/2026 14:00`',
    '',
    '💡 _(Tapez `/stop` à tout moment pour annuler)_'
  ].join('\n');

  const sent = await replyOrEdit(sock, jid, msg, promptText);
  if (sent?.key && !setupKeys.some((k) => k.id === sent.key.id)) {
    setupKeys.push(sent.key);
  }
}

export async function handleWizardStep({ sock, msg, jid, text, userId }) {
  const wizard = activeWizards.get(userId);
  if (!wizard) return false;

  const trimmed = text.trim();

  // Ajouter le message de réponse de l'utilisateur à la liste des messages à nettoyer
  if (msg?.key) {
    wizard.setupKeys.push(msg.key);
  }

  // Commande d'annulation (/stop)
  if (trimmed.toLowerCase() === '/stop' || trimmed.toLowerCase() === 'stop' || trimmed.toLowerCase() === 'annuler') {
    clearWizard(userId);
    await cleanupSetupMessages(sock, jid, wizard.setupKeys);
    await sendStealthMessage(sock, jid, { text: '❌ Programmation assistée annulée.' });
    return true;
  }

  const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
  const isGroup = wizard.chatOrigin.endsWith('@g.us');

  // --- ÉTAPE 1 : Réception de la date/heure ---
  if (wizard.step === 1) {
    const targetDate = parseScheduledTime(trimmed);
    if (!targetDate || isNaN(targetDate.getTime())) {
      const errSent = await sendStealthMessage(
        sock,
        jid,
        {
          text: '⚠️ Date ou heure non reconnue. Utilisez par exemple `+15m`, `21:30` ou `25/12/2026 14:00`.\n_(Tapez `/stop` pour annuler)_'
        },
        { quoted: msg }
      );
      if (errSent?.key) wizard.setupKeys.push(errSent.key);
      return true;
    }

    if (targetDate.getTime() <= Date.now()) {
      const errSent = await sendStealthMessage(
        sock,
        jid,
        {
          text: '⚠️ Cette heure est déjà passée ! Veuillez choisir une date dans le futur.\n_(Tapez `/stop` pour annuler)_'
        },
        { quoted: msg }
      );
      if (errSent?.key) wizard.setupKeys.push(errSent.key);
      return true;
    }

    const formattedTarget = targetDate.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    wizard.targetDate = targetDate;
    wizard.formattedDate = formattedTarget;
    wizard.step = 2;

    const p2 = await sendStealthMessage(
      sock,
      jid,
      {
        text: [
          '📝 *Programmation assistée (Étape 2/3)*',
          `Date retenue : *${formattedTarget}*`,
          '',
          'Quel est le message à programmer ?',
          '_(Vous pouvez envoyer un message long, avec du texte mis en forme)_'
        ].join('\n')
      },
      { quoted: msg }
    );
    if (p2?.key) wizard.setupKeys.push(p2.key);
    return true;
  }

  // --- ÉTAPE 2 : Réception du message ---
  if (wizard.step === 2) {
    if (!trimmed) {
      const errSent = await sendStealthMessage(sock, jid, { text: '⚠️ Veuillez saisir un texte pour le message.' }, { quoted: msg });
      if (errSent?.key) wizard.setupKeys.push(errSent.key);
      return true;
    }

    wizard.messageText = trimmed;

    // Si on a démarré dans un groupe : la destination est automatiquement ce groupe !
    if (isGroup) {
      wizard.targetJid = wizard.chatOrigin;
      await finalizeScheduling({ sock, msg, jid, wizard, userId, selfJid });
      return true;
    }

    // Si on a démarré en privé : on demande à qui envoyer
    wizard.step = 3;
    const p3 = await sendStealthMessage(
      sock,
      jid,
      {
        text: [
          '👤 *Programmation assistée (Étape 3/3)*',
          'À qui souhaitez-vous envoyer ce message ?',
          '',
          '• Entrez le *numéro* (ex: `0612345678` ou `+33612345678`)',
          '• Ou le *nom d\'un groupe* (ex: `testbot`, `notifds`, `travail`)',
          '• Tapez `ici` pour cette discussion, ou `moi` pour votre chat personnel'
        ].join('\n')
      },
      { quoted: msg }
    );
    if (p3?.key) wizard.setupKeys.push(p3.key);
    return true;
  }

  // --- ÉTAPE 3 : Réception du destinataire (en privé) ---
  if (wizard.step === 3) {
    const target = parseRecipient(trimmed, selfJid, wizard.chatOrigin);
    if (!target) {
      const errSent = await sendStealthMessage(
        sock,
        jid,
        {
          text: '⚠️ Destinataire non reconnu. Entrez un numéro, un alias de groupe (`testbot`, `notifds`...), `ici` ou `moi`.'
        },
        { quoted: msg }
      );
      if (errSent?.key) wizard.setupKeys.push(errSent.key);
      return true;
    }

    wizard.targetJid = target;
    await finalizeScheduling({ sock, msg, jid, wizard, userId, selfJid });
    return true;
  }

  return false;
}

/**
 * Supprime tous les messages ayant servi au setup (pour tous puis pour moi, évitant le libellé "Ce message a été supprimé")
 */
export async function cleanupSetupMessages(sock, jid, setupKeys = []) {
  if (!setupKeys || !setupKeys.length) return;

  for (const k of setupKeys) {
    try {
      // 1. Supprimer pour tout le monde
      await sock.sendMessage(jid, { delete: k });
      await sleep(250);

      // 2. Supprimer pour soi-même pour effacer la trace "Ce message a été supprimé"
      const ts = Math.floor(Date.now() / 1000);
      await sock.chatModify(
        {
          deleteForMe: {
            timestamp: ts,
            key: k,
            deleteMedia: false
          }
        },
        jid
      );
    } catch (e) {
      // Ignorer si déjà supprimé
    }
  }
}

/**
 * Enregistre le message programmé, nettoie le setup et envoie le récapitulatif dans le hub
 */
export async function finalizeScheduling({ sock, msg, jid, wizard, userId, selfJid }) {
  clearWizard(userId);

  const config = getConfig();

  const item = addScheduledMessage({
    jid: wizard.targetJid,
    message: wizard.messageText,
    targetTimestamp: wizard.targetDate.getTime(),
    formattedDate: wizard.formattedDate
  });

  // Nettoyer tous les messages d'échange du setup
  await cleanupSetupMessages(sock, jid, wizard.setupKeys);

  // Déterminer le nom d'affichage de la destination
  let destDisplay = '';
  if (wizard.targetJid.endsWith('@g.us')) {
    const aliasFound = Object.entries(config.groupAliases || {}).find(([a, id]) => id === wizard.targetJid);
    if (aliasFound) {
      destDisplay = `Groupe "${aliasFound[0]}"`;
    } else {
      try {
        const meta = await sock.groupMetadata(wizard.targetJid);
        destDisplay = meta?.subject ? `Groupe "${meta.subject}"` : 'Groupe';
      } catch (e) {
        destDisplay = 'Groupe';
      }
    }
  } else if (wizard.targetJid === selfJid) {
    destDisplay = 'Votre chat personnel (Moi)';
  } else {
    const num = wizard.targetJid.split('@')[0];
    destDisplay = `+${num}`;
  }

  // 1. Message de confirmation propre dans la discussion où a eu lieu la programmation
  await sendStealthMessage(
    sock,
    jid,
    { text: `✅ Message programmé pour le ${wizard.formattedDate} vers *${destDisplay}*` }
  );

  // 2. Récapitulatif détaillé envoyé dans le groupe de notification système (notifds) ou en DM
  const targetNotifJid = config.hub?.systemNotifs || selfJid;
  if (targetNotifJid) {
    const recap = [
      '⏰ *NOUVEAU MESSAGE PROGRAMMÉ*',
      '━━━━━━━━━━━━━━━━━━━━',
      `📅 *Date d'envoi :* ${wizard.formattedDate}`,
      `📍 *Destinataire :* ${destDisplay}`,
      `🆔 *ID :* \`${item.id}\``,
      '',
      `💬 *Message :*`,
      `> "${wizard.messageText}"`,
      '━━━━━━━━━━━━━━━━━━━━'
    ].join('\n');

    try {
      await sock.sendMessage(targetNotifJid, { text: recap });
    } catch (err) {
      console.error('[finalizeScheduling] Erreur envoi récap hub notif:', err);
    }
  }
}
