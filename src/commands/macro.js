import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { listMacros, getMacro, upsertMacro, deleteMacro, dispatchMacro } from '../services/macroStore.js';
import { replyOrEdit } from '../utils/stealth.js';

export default {
  name: 'r',
  aliases: ['macro', 'macros', 'faq'],
  description: 'Envoie ou gère des réponses rapides pré-enregistrées (/r <nom>)',
  async execute({ sock, msg, jid, args, isOwner = true }) {
    const sub = args[0]?.toLowerCase();

    // 1. Lister toutes les macros : /r ou /r list
    if (!sub || sub === 'list' || sub === 'liste') {
      const list = listMacros();
      if (!list.length) {
        await replyOrEdit(
          sock,
          jid,
          msg,
          '⚡ Aucune macro enregistrée.\nAjoutez-en depuis le panneau *SuperAdmin* ou avec `/r add <nom> | <texte>`.'
        );
        return;
      }

      const lines = ['⚡ *Réponses rapides disponibles :*'];
      for (const m of list) {
        const mediaTag = m.hasMedia ? ` [📎 ${m.media.type}]` : '';
        const preview = m.text ? m.text.split('\n')[0].slice(0, 45) : '(média)';
        lines.push(`• \`/r ${m.name}\`${mediaTag} — _${preview}_`);
      }
      await replyOrEdit(sock, jid, msg, lines.join('\n'));
      return;
    }

    // 2. Ajouter / Modifier une macro : /r add <nom> | <texte> (réservé au propriétaire)
    if (sub === 'add' || sub === 'set') {
      if (!isOwner) {
        await replyOrEdit(sock, jid, msg, '⛔ Seul le propriétaire peut ajouter ou modifier une macro.');
        return;
      }
      const rest = args.slice(1).join(' ').trim();
      const [rawName, ...textParts] = rest.split('|');
      const name = rawName?.trim();
      let text = textParts.join('|').trim();

      if (!name) {
        await replyOrEdit(sock, jid, msg, 'Usage : `/r add <nom> | <texte>` (ou en citant un message/média).');
        return;
      }

      const msgContent = msg.message;
      const contextInfo =
        msgContent?.extendedTextMessage?.contextInfo ||
        msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;
      const quotedMessage = contextInfo?.quotedMessage;

      let media = null;
      if (quotedMessage) {
        if (!text) {
          text =
            quotedMessage.conversation ||
            quotedMessage.extendedTextMessage?.text ||
            quotedMessage.imageMessage?.caption ||
            quotedMessage.videoMessage?.caption ||
            quotedMessage.documentMessage?.caption ||
            '';
        }
        try {
          if (quotedMessage.imageMessage) {
            const buffer = await downloadMediaMessage({ message: quotedMessage, key: msg.key }, 'buffer', {});
            media = { buffer, type: 'image', mimetype: quotedMessage.imageMessage.mimetype || 'image/jpeg', fileName: `${name}.jpg` };
          } else if (quotedMessage.videoMessage) {
            const buffer = await downloadMediaMessage({ message: quotedMessage, key: msg.key }, 'buffer', {});
            media = { buffer, type: 'video', mimetype: quotedMessage.videoMessage.mimetype || 'video/mp4', fileName: `${name}.mp4` };
          } else if (quotedMessage.documentMessage) {
            const buffer = await downloadMediaMessage({ message: quotedMessage, key: msg.key }, 'buffer', {});
            media = { buffer, type: 'document', mimetype: quotedMessage.documentMessage.mimetype || 'application/octet-stream', fileName: quotedMessage.documentMessage.fileName || `${name}.pdf` };
          }
        } catch (err) {
          console.warn('[Macro] Échec téléchargement média cité:', err.message);
        }
      }

      if (!text && !media) {
        await replyOrEdit(sock, jid, msg, '⚠️ Veuillez fournir un texte ou citer un média.');
        return;
      }

      const saved = upsertMacro({ name, text, media });
      await replyOrEdit(sock, jid, msg, `✅ Macro \`/r ${saved.name}\` enregistrée.`);
      return;
    }

    // 3. Supprimer une macro : /r del <nom> (réservé au propriétaire)
    if (sub === 'del' || sub === 'delete' || sub === 'rm') {
      if (!isOwner) {
        await replyOrEdit(sock, jid, msg, '⛔ Seul le propriétaire peut supprimer une macro.');
        return;
      }
      const target = args[1]?.trim();
      if (!target) {
        await replyOrEdit(sock, jid, msg, 'Usage : `/r del <nom>`');
        return;
      }
      const ok = deleteMacro(target);
      await replyOrEdit(
        sock,
        jid,
        msg,
        ok ? `✅ Macro \`${target}\` supprimée.` : `❌ Macro \`${target}\` introuvable.`
      );
      return;
    }

    // 4. Exécuter la macro demandée : /r <nom>
    const macro = getMacro(sub);
    if (!macro) {
      await replyOrEdit(sock, jid, msg, `❌ Macro \`${sub}\` introuvable. Tapez \`/r list\` pour voir les macros disponibles.`);
      return;
    }

    // Si la macro n'a pas de média et vient du propriétaire, on remplace directement le message /r
    if (!macro.media && msg.key?.fromMe) {
      await replyOrEdit(sock, jid, msg, macro.text);
      return;
    }

    const msgContent = msg.message;
    const contextInfo =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;
    const quotedOptions = contextInfo?.stanzaId
      ? {
          quoted: {
            key: {
              remoteJid: jid,
              id: contextInfo.stanzaId,
              participant: contextInfo.participant
            },
            message: contextInfo.quotedMessage
          }
        }
      : {};

    await dispatchMacro(sock, jid, macro, quotedOptions);
  }
};
