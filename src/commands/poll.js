import { replyOrEdit } from '../utils/stealth.js';

export default {
  name: 'poll',
  aliases: ['sondage'],
  description: 'Crée un sondage natif WhatsApp',
  async execute({ sock, msg, jid, args }) {
    const raw = args.join(' ').trim();
    if (!raw.includes('|')) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        'Usage : /poll <Question> | <Choix 1> | <Choix 2> [| Choix 3...]'
      );
      return;
    }

    const parts = raw.split('|').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 3) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        'Erreur : un sondage nécessite au moins une question et deux choix.'
      );
      return;
    }

    const [question, ...options] = parts;

    if (options.length > 12) {
      await replyOrEdit(sock, jid, msg, 'Erreur : maximum 12 choix possibles.');
      return;
    }

    try {
      await sock.sendMessage(jid, {
        poll: {
          name: question,
          values: options,
          selectableCount: 1
        }
      });

      // Supprimer le message de commande déclencheur
      try {
        await sock.sendMessage(jid, { delete: msg.key });
      } catch (e) {}
    } catch (err) {
      console.error('Erreur poll:', err);
      await replyOrEdit(sock, jid, msg, `Erreur sondage : ${err.message}`);
    }
  }
};
