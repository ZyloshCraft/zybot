import {
  addScheduledMessage,
  removeScheduledMessage,
  listScheduledMessages,
  parseScheduledTime
} from '../services/scheduler.js';
import { replyOrEdit } from '../utils/stealth.js';

export default {
  name: 'program',
  aliases: ['programmer'],
  description: 'Programme l\'envoi automatique d\'un message',
  async execute({ sock, msg, jid, args }) {
    const rawInput = args.join(' ').trim();
    const sub = args[0]?.toLowerCase();

    // 1. Lister les messages programmés
    if (!rawInput || sub === 'list') {
      const list = listScheduledMessages();
      if (!list.length) {
        await replyOrEdit(sock, jid, msg, 'Aucun message programmé');
        return;
      }

      const lines = ['Messages programmés :'];
      list.forEach((item, idx) => {
        lines.push(`${idx + 1}. [${item.formattedDate}] "${item.message}" (${item.id})`);
      });

      await replyOrEdit(sock, jid, msg, lines.join('\n'));
      return;
    }

    // 2. Annuler/Supprimer
    if (sub === 'del' || sub === 'delete' || sub === 'cancel' || sub === 'rm') {
      const targetId = args[1]?.trim();
      if (!targetId) {
        await replyOrEdit(sock, jid, msg, 'Usage : /program del <ID>');
        return;
      }

      const success = removeScheduledMessage(targetId);
      if (success) {
        await replyOrEdit(sock, jid, msg, `Message annulé : ${targetId}`);
      } else {
        await replyOrEdit(sock, jid, msg, `Introuvable : ${targetId}`);
      }
      return;
    }

    // 3. Programmer
    let messageText = '';
    let timeStr = '';

    if (rawInput.includes('|')) {
      const parts = rawInput.split('|');
      messageText = parts[0].trim();
      timeStr = parts.slice(1).join('|').trim();
    } else {
      const relMatch = rawInput.match(/\+(\d+)\s*(s|m|h|j|d)$/i);
      const dateMatch = rawInput.match(/(\d{1,2}\/\d{1,2}(?:\/\d{4})?\s+\d{1,2}:\d{2})$/);
      const timeMatch = rawInput.match(/(\d{1,2}:\d{2})$/);

      if (relMatch) {
        timeStr = relMatch[0];
        messageText = rawInput.slice(0, relMatch.index).trim();
      } else if (dateMatch) {
        timeStr = dateMatch[0];
        messageText = rawInput.slice(0, dateMatch.index).trim();
      } else if (timeMatch) {
        timeStr = timeMatch[0];
        messageText = rawInput.slice(0, timeMatch.index).trim();
      }
    }

    if (!messageText || !timeStr) {
      await replyOrEdit(sock, jid, msg, 'Usage : /program <texte> | <date ou +15m>');
      return;
    }

    const targetDate = parseScheduledTime(timeStr);
    if (!targetDate || isNaN(targetDate.getTime())) {
      await replyOrEdit(sock, jid, msg, `Date/heure invalide : "${timeStr}"`);
      return;
    }

    if (targetDate.getTime() <= Date.now()) {
      await replyOrEdit(sock, jid, msg, 'Erreur : la date est déjà passée');
      return;
    }

    const formattedTarget = targetDate.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const item = addScheduledMessage({
      jid,
      message: messageText,
      targetTimestamp: targetDate.getTime(),
      formattedDate: formattedTarget
    });

    await replyOrEdit(
      sock,
      jid,
      msg,
      `Programmé pour le ${formattedTarget} : "${messageText}" (${item.id})`
    );
  }
};
