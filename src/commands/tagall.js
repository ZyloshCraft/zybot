import { replyOrEdit } from '../utils/stealth.js';

export default {
  name: 'tagall',
  aliases: ['everyone'],
  description: 'Mentionne tous les membres du groupe',
  async execute({ sock, msg, jid, args }) {
    if (!jid.endsWith('@g.us')) {
      await replyOrEdit(sock, jid, msg, 'Cette commande s\'utilise uniquement dans un groupe.');
      return;
    }

    try {
      const group = await sock.groupMetadata(jid);
      const participants = group.participants || [];

      if (!participants.length) {
        await replyOrEdit(sock, jid, msg, 'Aucun participant trouvé.');
        return;
      }

      const customText = args.join(' ').trim() || 'Attention tout le monde !';
      const mentions = participants.map((p) => p.id);

      // Mention invisible ou liste propre
      await sock.sendMessage(jid, {
        text: `📢 ${customText}`,
        mentions
      });

      // Supprimer le message de commande pour rester propre
      try {
        await sock.sendMessage(jid, { delete: msg.key });
      } catch (e) {}
    } catch (err) {
      console.error('Erreur tagall:', err);
      await replyOrEdit(sock, jid, msg, `Erreur tagall : ${err.message}`);
    }
  }
};
