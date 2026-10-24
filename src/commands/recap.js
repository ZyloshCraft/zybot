import { getTodayStats, formatRecapText } from '../services/statsTracker.js';
import { replyOrEdit } from '../utils/stealth.js';

export default {
  name: 'recap',
  aliases: ['stats', 'statistiques', 'rapport'],
  description: 'Affiche les statistiques d\'activité et d\'interception de la journée',
  async execute({ sock, msg, jid }) {
    const stats = getTodayStats();
    const text = formatRecapText(stats);
    await replyOrEdit(sock, jid, msg, text);
  }
};
