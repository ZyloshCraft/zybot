import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { replyOrEdit } from '../utils/stealth.js';
import { getConfig, updateConfig } from '../config.js';
import { notifySystem } from '../services/notifier.js';

export default {
  name: 'groupe',
  aliases: ['group', 'groupes', 'groups'],
  description: 'Gère les groupes et leurs identifiants / alias personnalisés',
  async execute({ sock, msg, jid, args }) {
    const config = getConfig();
    const aliases = config.groupAliases || {};
    const sub = args[0]?.toLowerCase();

    // 1. DÉFINIR UN ALIAS : /groupe alias <nom> [id_groupe]
    if (sub === 'alias' || sub === 'set' || sub === 'add') {
      const aliasName = args[1]?.toLowerCase().trim();
      let targetJid = args[2]?.trim();

      if (!aliasName) {
        await replyOrEdit(
          sock,
          jid,
          msg,
          'Usage : `/groupe alias <nom>` (dans le groupe) ou `/groupe alias <nom> <id_du_groupe>`'
        );
        return;
      }

      if (!targetJid) {
        if (!jid.endsWith('@g.us')) {
          await replyOrEdit(
            sock,
            jid,
            msg,
            'Pour créer un alias depuis une discussion privée, précisez l\'ID : `/groupe alias <nom> <id@g.us>`'
          );
          return;
        }
        targetJid = jidNormalizedUser(jid);
      } else {
        targetJid = jidNormalizedUser(targetJid);
      }

      updateConfig((prev) => ({
        ...prev,
        groupAliases: {
          ...(prev.groupAliases || {}),
          [aliasName]: targetJid
        }
      }));

      // Notifier le groupe de notifications système (notifds)
      await notifySystem(sock, `✅ Alias : ${aliasName} ${targetJid}`);

      await replyOrEdit(
        sock,
        jid,
        msg,
        `✅ Alias *"${aliasName}"* associé au groupe \`${targetJid}\` !\nVous pouvez maintenant utiliser \`${aliasName}\` dans \`/program\` ou toute autre commande.`
      );
      return;
    }

    // 2. SUPPRIMER UN ALIAS : /groupe del <nom>
    if (sub === 'del' || sub === 'remove' || sub === 'rm') {
      const aliasName = args[1]?.toLowerCase().trim();
      if (!aliasName || !aliases[aliasName]) {
        await replyOrEdit(sock, jid, msg, `Alias introuvable : "${aliasName}"`);
        return;
      }

      const updated = { ...aliases };
      delete updated[aliasName];

      updateConfig((prev) => ({
        ...prev,
        groupAliases: updated
      }));

      // Notifier le groupe de notifications système (notifds)
      await notifySystem(sock, `🗑️ Alias : ${aliasName} supprimé`);

      await replyOrEdit(sock, jid, msg, `🗑️ Alias *"${aliasName}"* supprimé.`);
      return;
    }

    // 3. LISTER LES GROUPES ET LES ALIAS : /groupe ou /groupes
    try {
      const participating = await sock.groupFetchAllParticipating();
      const groupList = Object.values(participating || {});

      if (!groupList.length) {
        await replyOrEdit(sock, jid, msg, 'Vous ne faites partie d\'aucun groupe.');
        return;
      }

      const lines = [
        `👥 *VOS GROUPES (${groupList.length})*`,
        '━━━━━━━━━━━━━━━━━━━━'
      ];

      groupList.slice(0, 25).forEach((g, idx) => {
        const aliasFound = Object.entries(aliases).find(([alias, id]) => id === g.id);
        const aliasTag = aliasFound ? ` [Alias: *${aliasFound[0]}*]` : '';
        lines.push(`${idx + 1}. *${g.subject}*${aliasTag}`);
        lines.push(`   ID : \`${g.id}\``);
      });

      if (groupList.length > 25) {
        lines.push(`_...et ${groupList.length - 25} autres groupes_`);
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━');
      lines.push('💡 Tapez `/groupe alias <nom>` dans un groupe pour lui donner un nom court.');

      await replyOrEdit(sock, jid, msg, lines.join('\n'));
    } catch (err) {
      console.error('Erreur groupe:', err);
      await replyOrEdit(sock, jid, msg, `Erreur récupération groupes : ${err.message}`);
    }
  }
};
