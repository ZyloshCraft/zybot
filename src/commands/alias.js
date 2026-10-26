import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { replyOrEdit } from '../utils/stealth.js';
import { getConfig, updateConfig } from '../config.js';
import { notifySystem } from '../services/notifier.js';

export default {
  name: 'alias',
  aliases: ['aliases'],
  description: 'Gère et liste tous vos alias de groupes WhatsApp (/alias list, /alias add, /alias del)',
  async execute({ sock, msg, jid, args }) {
    const config = getConfig();
    const aliases = config.groupAliases || {};
    const sub = args[0]?.toLowerCase().trim();

    // 1. LISTER LES ALIAS : /alias ou /alias list
    if (!sub || sub === 'list') {
      const aliasEntries = Object.entries(aliases);
      if (!aliasEntries.length) {
        await replyOrEdit(sock, jid, msg, '📭 Aucun alias de groupe enregistré. Tapez `/alias add <nom>` dans un groupe.');
        return;
      }

      const lines = [
        `🏷️ *ALIAS DE GROUPES ENREGISTRÉS (${aliasEntries.length})*`,
        '━━━━━━━━━━━━━━━━━━━━'
      ];

      aliasEntries.forEach(([name, targetJid], index) => {
        lines.push(`${index + 1}. *${name}* ➔ \`${targetJid}\``);
      });

      lines.push('━━━━━━━━━━━━━━━━━━━━');
      lines.push('💡 *Ajouter :* `/alias add <nom>` (dans un groupe ou avec son ID)');
      lines.push('💡 *Supprimer :* `/alias del <nom>`');

      await replyOrEdit(sock, jid, msg, lines.join('\n'));
      return;
    }

    // 2. AJOUTER UN ALIAS : /alias add <nom> [id] ou /alias set <nom> [id]
    if (sub === 'add' || sub === 'set') {
      const aliasName = args[1]?.toLowerCase().trim();
      let targetJid = args[2]?.trim();

      if (!aliasName) {
        await replyOrEdit(
          sock,
          jid,
          msg,
          'Usage : `/alias add <nom>` (dans le groupe cible) ou `/alias add <nom> <id_groupe@g.us>`'
        );
        return;
      }

      if (!targetJid) {
        if (!jid.endsWith('@g.us')) {
          await replyOrEdit(
            sock,
            jid,
            msg,
            'Pour créer un alias depuis une discussion privée, précisez l\'ID : `/alias add <nom> <id@g.us>`'
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

      await notifySystem(sock, `✅ Alias : ${aliasName} ${targetJid}`);
      await replyOrEdit(
        sock,
        jid,
        msg,
        `✅ Alias *"${aliasName}"* associé au groupe \`${targetJid}\` !\nVous pouvez l'utiliser directement dans toutes vos commandes.`
      );
      return;
    }

    // 3. SUPPRIMER UN ALIAS : /alias del <nom>
    if (sub === 'del' || sub === 'remove' || sub === 'rm') {
      const aliasName = args[1]?.toLowerCase().trim();
      if (!aliasName || !aliases[aliasName]) {
        await replyOrEdit(sock, jid, msg, `❌ Alias introuvable : "${aliasName || ''}"`);
        return;
      }

      const updated = { ...aliases };
      delete updated[aliasName];

      updateConfig((prev) => ({
        ...prev,
        groupAliases: updated
      }));

      await notifySystem(sock, `🗑️ Alias : ${aliasName} supprimé`);
      await replyOrEdit(sock, jid, msg, `🗑️ Alias *"${aliasName}"* supprimé.`);
      return;
    }

    await replyOrEdit(sock, jid, msg, 'Usage : `/alias list` (lister), `/alias add <nom> [id]` (ajouter), `/alias del <nom>` (supprimer).');
  }
};
