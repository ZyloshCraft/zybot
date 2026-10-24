import { jidNormalizedUser } from '@whiskeysockets/baileys';
import {
  addScheduledMessage,
  removeScheduledMessage,
  listScheduledMessages,
  parseScheduledTime
} from '../services/scheduler.js';
import { startProgramWizard, parseRecipient } from '../services/programWizard.js';
import { replyOrEdit } from '../utils/stealth.js';

export default {
  name: 'program',
  aliases: ['programmer'],
  description: 'Programme l\'envoi d\'un message (en direct ou via l\'assistant pas-à-pas)',
  async execute({ sock, msg, jid, args }) {
    const rawInput = args.join(' ').trim();
    const sub = args[0]?.toLowerCase();
    const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
    const userId = msg.key.participant || msg.key.remoteJid;

    // 1. MODE GUIDE ASSISTÉ : si aucun argument ou /program guide
    if (!rawInput || sub === 'guide') {
      await startProgramWizard({ sock, msg, jid, userId });
      return;
    }

    // 2. LISTER LES MESSAGES PROGRAMMÉS (/program list)
    if (sub === 'list') {
      const list = listScheduledMessages();
      if (!list.length) {
        await replyOrEdit(sock, jid, msg, 'Aucun message programmé en attente.');
        return;
      }

      const lines = ['⏰ *Messages programmés :*'];
      list.forEach((item, idx) => {
        const dest = item.jid.endsWith('@g.us') ? 'Groupe' : `+${item.jid.split('@')[0]}`;
        lines.push(`${idx + 1}. [${item.formattedDate}] ➔ ${dest} : "${item.message}" (\`${item.id}\`)`);
      });

      await replyOrEdit(sock, jid, msg, lines.join('\n'));
      return;
    }

    // 3. ANNULER / SUPPRIMER UN MESSAGE PROGRAMMÉ (/program del <id>)
    if (sub === 'del' || sub === 'delete' || sub === 'cancel' || sub === 'rm') {
      const targetId = args[1]?.trim();
      if (!targetId) {
        await replyOrEdit(sock, jid, msg, 'Usage : `/program del <ID>`');
        return;
      }

      const success = removeScheduledMessage(targetId);
      if (success) {
        await replyOrEdit(sock, jid, msg, `✅ Message programmé \`${targetId}\` annulé.`);
      } else {
        await replyOrEdit(sock, jid, msg, `❌ Aucun message trouvé avec l'ID \`${targetId}\`.`);
      }
      return;
    }

    // 4. MODE DIRECT EN LIGNE DE COMMANDE
    // Formats supportés :
    // /program <message> | <date> [| <destinataire>]
    // ou /program <message> <date> [destinataire]
    let messageText = '';
    let timeStr = '';
    let recipientStr = '';

    if (rawInput.includes('|')) {
      const parts = rawInput.split('|').map((s) => s.trim());
      messageText = parts[0];
      timeStr = parts[1] || '';
      recipientStr = parts[2] || '';
    } else {
      // Découpage automatique sans séparateur "|"
      const relMatch = rawInput.match(/\+(\d+)\s*(s|m|h|j|d)/i);
      const dateMatch = rawInput.match(/(\d{1,2}\/\d{1,2}(?:\/\d{4})?\s+\d{1,2}:\d{2})/);
      const timeMatch = rawInput.match(/(\d{1,2}:\d{2})/);

      const match = relMatch || dateMatch || timeMatch;
      if (match) {
        timeStr = match[0];
        messageText = rawInput.slice(0, match.index).trim();
        recipientStr = rawInput.slice(match.index + match[0].length).trim();
      }
    }

    if (!messageText || !timeStr) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        'Usage : `/program <message> | <date/heure> [| destinataire]` ou tapez juste `/program` pour le mode guidé.'
      );
      return;
    }

    const targetDate = parseScheduledTime(timeStr);
    if (!targetDate || isNaN(targetDate.getTime())) {
      await replyOrEdit(sock, jid, msg, `❌ Date/heure non reconnue : "${timeStr}"`);
      return;
    }

    if (targetDate.getTime() <= Date.now()) {
      await replyOrEdit(sock, jid, msg, '❌ Cette date est déjà passée. Choisissez une heure future.');
      return;
    }

    // Déterminer la cible :
    // - Si dans un groupe et aucun destinataire forcé : le groupe courant
    // - Si en privé : destinataire spécifié, ou la discussion courante
    let targetJid = jid;
    if (recipientStr) {
      const parsed = parseRecipient(recipientStr, selfJid, jid);
      if (parsed) {
        targetJid = parsed;
      }
    }

    const formattedTarget = targetDate.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const item = addScheduledMessage({
      jid: targetJid,
      message: messageText,
      targetTimestamp: targetDate.getTime(),
      formattedDate: formattedTarget
    });

    let destDisplay = '';
    if (targetJid.endsWith('@g.us')) {
      try {
        const meta = await sock.groupMetadata(targetJid);
        destDisplay = meta?.subject ? `Groupe "${meta.subject}"` : 'Ce groupe';
      } catch (e) {
        destDisplay = 'Groupe';
      }
    } else if (targetJid === selfJid) {
      destDisplay = 'Votre chat personnel (Moi)';
    } else {
      destDisplay = `+${targetJid.split('@')[0]}`;
    }

    // 1. Réponse dans la discussion courante
    await replyOrEdit(
      sock,
      jid,
      msg,
      `✅ Message programmé pour le ${formattedTarget} vers *${destDisplay}*`
    );

    // 2. Notification détaillée envoyée dans le chat privé (Moi)
    if (selfJid) {
      const recap = [
        '⏰ *NOUVEAU MESSAGE PROGRAMMÉ*',
        '━━━━━━━━━━━━━━━━━━━━',
        `📅 *Date d'envoi :* ${formattedTarget}`,
        `📍 *Destinataire :* ${destDisplay}`,
        `🆔 *ID :* \`${item.id}\``,
        '',
        `💬 *Message :*`,
        `> "${messageText}"`,
        '━━━━━━━━━━━━━━━━━━━━'
      ].join('\n');

      try {
        await sock.sendMessage(selfJid, { text: recap });
      } catch (err) {
        console.error('[program] Erreur notification privée:', err);
      }
    }
  }
};
