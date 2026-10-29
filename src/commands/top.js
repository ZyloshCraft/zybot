import { getGroupLeaderboard, getAllGroupsActivity } from '../services/groupActivityStore.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';
import { replyOrEdit } from '../utils/stealth.js';

export default {
  name: 'top',
  aliases: ['classement', 'leaderboard', 'activite'],
  description: 'Affiche le classement des membres les plus actifs par nombre de messages envoyés',
  async execute({ sock, msg, jid, args }) {
    const isGroup = jid.endsWith('@g.us');

    let targetJid = jid;
    let limit = 10;

    // Parser les arguments (limite ou recherche de groupe)
    if (args.length > 0) {
      const parsedNum = parseInt(args[0], 10);
      if (!isNaN(parsedNum) && parsedNum > 0) {
        limit = Math.min(parsedNum, 30);
      } else if (!isGroup) {
        // En privé : recherche de groupe par mot-clé
        const query = args.join(' ').toLowerCase();
        const all = getAllGroupsActivity();
        const found = all.find(g => (g.groupName || '').toLowerCase().includes(query) || g.groupJid.includes(query));
        if (found) {
          targetJid = found.groupJid;
        } else {
          await replyOrEdit(
            sock,
            jid,
            msg,
            `⚠️ Aucun groupe trouvé correspondant à "${args.join(' ')}".\nTapez \`/top\` directement dans un groupe ou utilisez \`/top <nom>\`.`
          );
          return;
        }
      }
    }

    if (!isGroup && targetJid === jid) {
      // Si on est en privé et qu'aucun groupe n'est spécifié, lister les groupes actifs
      const all = getAllGroupsActivity();
      if (!all || all.length === 0) {
        await replyOrEdit(
          sock,
          jid,
          msg,
          '📊 Aucune activité de groupe enregistrée pour le moment. Les statistiques s\'incrémentent au fil des messages.'
        );
        return;
      }

      const lines = [
        '🏆 *Groupes suivis par ZyBot (Activité)*',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
      ];

      for (let i = 0; i < Math.min(all.length, 10); i++) {
        const g = all[i];
        lines.push(`*${i + 1}.* ${g.groupName} : *${g.totalMessages}* msgs (${g.userCount} membres actifs)`);
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('💡 Pour voir les détails : `/top <nom du groupe>`');
      await replyOrEdit(sock, jid, msg, lines.join('\n'));
      return;
    }

    // Récupérer le nom à jour du groupe si possible
    let groupName = 'ce groupe';
    try {
      const meta = await getCachedGroupMetadata(sock, targetJid);
      if (meta?.subject) groupName = meta.subject;
    } catch {}

    const { totalMessages, leaderboard } = getGroupLeaderboard(targetJid, limit);

    if (!leaderboard || leaderboard.length === 0 || totalMessages === 0) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        `📊 Aucune activité enregistrée pour *${groupName}* pour le moment.`
      );
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = [
      `🏆 *Classement d'activité — ${groupName}*`,
      `📊 Messages totaux enregistrés : *${totalMessages.toLocaleString('fr-FR')}*`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    ];

    leaderboard.forEach((user, index) => {
      const badge = medals[index] || `${index + 1}.`;
      const percent = totalMessages > 0 ? ((user.count / totalMessages) * 100).toFixed(1) : 0;
      const cleanName = user.name || `+${(user.id || '').split('@')[0]}`;
      lines.push(`${badge} *${cleanName}* : *${user.count}* msg _(${percent}%)_`);
    });

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('⚡ _ZyBot Activity Tracker_');

    await replyOrEdit(sock, jid, msg, lines.join('\n'));
  }
};
