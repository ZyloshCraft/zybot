import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { replyOrEdit } from '../utils/stealth.js';
import { getConfig } from '../config.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';

export default {
  name: 'id',
  aliases: ['groupid', 'jid'],
  description: 'Affiche l\'identifiant (ID) unique du groupe ou de la discussion',
  async execute({ sock, msg, jid }) {
    const normJid = jidNormalizedUser(jid);
    const isGroup = normJid.endsWith('@g.us');
    const config = getConfig();
    const aliases = config.groupAliases || {};

    if (isGroup) {
      let groupName = 'Groupe';
      let count = 0;
      try {
        const meta = await getCachedGroupMetadata(sock, normJid);
        groupName = meta?.subject || 'Groupe';
        count = meta?.participants?.length || 0;
      } catch (e) {}

      // Trouver si un alias existe pour ce groupe
      const aliasFound = Object.entries(aliases).find(([alias, id]) => id === normJid);
      const aliasText = aliasFound ? `• Alias : \`${aliasFound[0]}\`` : '• Alias : _(aucun, tapez `/groupe alias <nom>` pour en créer un)_';

      const text = [
        `👥 *IDENTIFIANT DU GROUPE*`,
        `• Nom : *${groupName}*`,
        `• ID : \`${normJid}\``,
        `• Membres : ${count}`,
        aliasText
      ].join('\n');

      await replyOrEdit(sock, jid, msg, text);
      return;
    }

    // Discussion privée
    const text = [
      `👤 *IDENTIFIANT DE DISCUSSION*`,
      `• Contact : +${normJid.split('@')[0]}`,
      `• ID : \`${normJid}\``
    ].join('\n');

    await replyOrEdit(sock, jid, msg, text);
  }
};
