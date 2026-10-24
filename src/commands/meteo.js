import { replyOrEdit } from '../utils/stealth.js';

export default {
  name: 'meteo',
  aliases: ['weather'],
  description: 'Météo en direct d\'une ville (remplace la commande)',
  async execute({ sock, msg, jid, args }) {
    const city = args.join(' ').trim() || 'Paris';

    try {
      const url = `https://wttr.in/${encodeURIComponent(city)}?format=%l:+%c+%t+(Ressenti+%f),+Vent+%w`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'curl/7.88.1'
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const text = await res.text();
      const cleaned = text.trim();

      if (!cleaned || cleaned.includes('Unknown location')) {
        await replyOrEdit(sock, jid, msg, `Ville introuvable : ${city}`);
        return;
      }

      await replyOrEdit(sock, jid, msg, cleaned);
    } catch (err) {
      console.error('Erreur meteo:', err);
      await replyOrEdit(sock, jid, msg, `Météo indisponible pour ${city}`);
    }
  }
};
