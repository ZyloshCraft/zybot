import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { addScheduledMessage, parseScheduledTime } from '../services/scheduler.js';
import { replyOrEdit } from '../utils/stealth.js';
import { getConfig } from '../config.js';

export default {
  name: 'rappel',
  aliases: ['remind', 'reminder'],
  description: 'Définit un rappel envoyé dans votre chat privé ou groupe de notifications',
  async execute({ sock, msg, jid, args }) {
    const rawInput = args.join(' ').trim();
    if (!rawInput) {
      await replyOrEdit(sock, jid, msg, 'Usage : /rappel <message> | <temps> (ex: /rappel Réunion | +15m)');
      return;
    }

    const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
    const config = getConfig();
    const destinationJid = config.hub?.systemNotifs || selfJid;
    if (!destinationJid) {
      await replyOrEdit(sock, jid, msg, 'Erreur : chat de notification introuvable');
      return;
    }

    let messageText = '';
    let timeStr = '';

    if (rawInput.includes('|')) {
      const parts = rawInput.split('|');
      messageText = parts[0].trim();
      timeStr = parts.slice(1).join('|').trim();
    } else {
      const relMatch = rawInput.match(/\+(\d+)\s*(s|m|h|j|d)$/i);
      const timeMatch = rawInput.match(/(\d{1,2}:\d{2})$/);
      if (relMatch) {
        timeStr = relMatch[0];
        messageText = rawInput.slice(0, relMatch.index).trim();
      } else if (timeMatch) {
        timeStr = timeMatch[0];
        messageText = rawInput.slice(0, timeMatch.index).trim();
      }
    }

    if (!messageText || !timeStr) {
      await replyOrEdit(sock, jid, msg, 'Usage : /rappel <message> | <temps> (ex: /rappel Penser aux courses | +30m)');
      return;
    }

    const targetDate = parseScheduledTime(timeStr);
    if (!targetDate || isNaN(targetDate.getTime())) {
      await replyOrEdit(sock, jid, msg, `Temps non reconnu : "${timeStr}"`);
      return;
    }

    if (targetDate.getTime() <= Date.now()) {
      await replyOrEdit(sock, jid, msg, 'Erreur : l\'heure est déjà passée');
      return;
    }

    const formattedTarget = targetDate.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    addScheduledMessage({
      jid: destinationJid, // Envoyé dans votre groupe notifds ou chat privé
      message: `⏰ *RAPPEL :* ${messageText}`,
      targetTimestamp: targetDate.getTime(),
      formattedDate: formattedTarget
    });

    await replyOrEdit(sock, jid, msg, `Rappel programmé à ${formattedTarget} : "${messageText}"`);
  }
};
