import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { parseScheduledTime, addScheduledMessage } from './scheduler.js';
import { replyOrEdit, sendStealthMessage } from '../utils/stealth.js';

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
  activeWizards.set(userId, {
    step: 1,
    chatOrigin: jid,
    targetDate: null,
    formattedDate: '',
    messageText: '',
    targetJid: null
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

  await replyOrEdit(sock, jid, msg, promptText);
}

export async function handleWizardStep({ sock, msg, jid, text, userId }) {
  const wizard = activeWizards.get(userId);
  if (!wizard) return false;

  const trimmed = text.trim();

  // Commande d'annulation
  if (trimmed.toLowerCase() === '/stop' || trimmed.toLowerCase() === 'stop' || trimmed.toLowerCase() === 'annuler') {
    clearWizard(userId);
    await replyOrEdit(sock, jid, msg, '❌ Programmation assistée annulée.');
    return true;
  }

  const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
  const isGroup = wizard.chatOrigin.endsWith('@g.us');

  // --- ÉTAPE 1 : Réception de la date/heure ---
  if (wizard.step === 1) {
    const targetDate = parseScheduledTime(trimmed);
    if (!targetDate || isNaN(targetDate.getTime())) {
      await sendStealthMessage(
        sock,
        jid,
        {
          text: '⚠️ Date ou heure non reconnue. Utilisez par exemple `+15m`, `21:30` ou `25/12/2026 14:00`.\n_(Tapez `/stop` pour annuler)_'
        },
        { quoted: msg }
      );
      return true;
    }

    if (targetDate.getTime() <= Date.now()) {
      await sendStealthMessage(
        sock,
        jid,
        {
          text: '⚠️ Cette heure est déjà passée ! Veuillez choisir une date dans le futur.\n_(Tapez `/stop` pour annuler)_'
        },
        { quoted: msg }
      );
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

    await sendStealthMessage(
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
    return true;
  }

  // --- ÉTAPE 2 : Réception du message ---
  if (wizard.step === 2) {
    if (!trimmed) {
      await sendStealthMessage(sock, jid, { text: '⚠️ Veuillez saisir un texte pour le message.' }, { quoted: msg });
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
    await sendStealthMessage(
      sock,
      jid,
      {
        text: [
          '👤 *Programmation assistée (Étape 3/3)*',
          'À qui souhaitez-vous envoyer ce message ?',
          '',
          '• Entrez le *numéro* (ex: `0612345678` ou `+33612345678`)',
          '• Tapez `ici` pour cette discussion',
          '• Tapez `moi` pour votre chat personnel'
        ].join('\n')
      },
      { quoted: msg }
    );
    return true;
  }

  // --- ÉTAPE 3 : Réception du destinataire (en privé) ---
  if (wizard.step === 3) {
    const target = parseRecipient(trimmed, selfJid, wizard.chatOrigin);
    if (!target) {
      await sendStealthMessage(
        sock,
        jid,
        {
          text: '⚠️ Numéro ou destinataire invalide. Entrez un numéro (ex: `0612345678`), `ici` ou `moi`.'
        },
        { quoted: msg }
      );
      return true;
    }

    wizard.targetJid = target;
    await finalizeScheduling({ sock, msg, jid, wizard, userId, selfJid });
    return true;
  }

  return false;
}

/**
 * Enregistre le message programmé et envoie la confirmation complète dans le chat privé
 */
export async function finalizeScheduling({ sock, msg, jid, wizard, userId, selfJid }) {
  clearWizard(userId);

  const item = addScheduledMessage({
    jid: wizard.targetJid,
    message: wizard.messageText,
    targetTimestamp: wizard.targetDate.getTime(),
    formattedDate: wizard.formattedDate
  });

  // Déterminer le nom d'affichage de la destination
  let destDisplay = '';
  if (wizard.targetJid.endsWith('@g.us')) {
    try {
      const meta = await sock.groupMetadata(wizard.targetJid);
      destDisplay = meta?.subject ? `Groupe "${meta.subject}"` : 'Ce groupe';
    } catch (e) {
      destDisplay = 'Groupe';
    }
  } else if (wizard.targetJid === selfJid) {
    destDisplay = 'Votre chat personnel (Moi)';
  } else {
    const num = wizard.targetJid.split('@')[0];
    destDisplay = `+${num}`;
  }

  // 1. Confirmation dans la discussion courante
  await replyOrEdit(
    sock,
    jid,
    msg,
    `✅ Message programmé pour le ${wizard.formattedDate} vers *${destDisplay}*`
  );

  // 2. Notification détaillée dans le chat privé personnel de l'utilisateur (s'il existe)
  if (selfJid) {
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
      await sock.sendMessage(selfJid, { text: recap });
    } catch (err) {
      console.error('[finalizeScheduling] Erreur envoi récap privé:', err);
    }
  }
}
