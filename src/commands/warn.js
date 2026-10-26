import { getConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { addWarn, getWarns, getAllWarnedUsers, clearWarns } from '../services/warnStore.js';
import { sendNtfyNotification } from '../services/ntfy.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';

export default {
  name: 'warn',
  aliases: ['av', 'avertir'],
  description: 'Gère les avertissements des membres avec alertes et transmission dans admintaverne',
  adminOnly: true,
  async execute({ sock, msg, jid, args, isOwner, isAdmin }) {
    const config = getConfig();

    // 1. /warn list ou /warn list <cible>
    if (args[0]?.toLowerCase() === 'list') {
      const subTarget = args[1];

      // Extraction d'une éventuelle mention dans contextInfo
      const msgContent = msg.message;
      const contextInfo =
        msgContent?.extendedTextMessage?.contextInfo ||
        msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;
      const mentionedJid = contextInfo?.mentionedJid?.[0];
      const quotedSender = contextInfo?.participant;

      let targetNum = null;
      if (mentionedJid) {
        targetNum = mentionedJid.split('@')[0].split(':')[0];
      } else if (quotedSender) {
        targetNum = quotedSender.split('@')[0].split(':')[0];
      } else if (subTarget) {
        targetNum = subTarget.replace(/[^0-9]/g, '');
      }

      // Si une cible est spécifiée, afficher l'historique détaillé de cette personne
      if (targetNum && targetNum.length >= 6) {
        const userWarns = getWarns(targetNum);
        if (!userWarns.length) {
          await replyOrEdit(sock, jid, msg, `✅ L'utilisateur +${targetNum} n'a aucun avertissement actif.`);
          return;
        }

        const lines = [
          `⚠️ *HISTORIQUE DES WARNS DE +${targetNum}*`,
          `━━━━━━━━━━━━━━━━━━━━`,
          `Total : *${userWarns.length} avertissement(s)*\n`
        ];

        userWarns.forEach((w, i) => {
          const dateStr = new Date(w.timestamp).toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
          lines.push(`*${i + 1}. [${dateStr}]* dans "${w.groupName}" par ${w.admin} :`);
          lines.push(`   💬 Raison : "${w.reason}"`);
        });

        await replyOrEdit(sock, jid, msg, lines.join('\n'));
        return;
      }

      // Sinon, lister tous les membres avertis
      const allWarned = getAllWarnedUsers();
      if (!allWarned.length) {
        await replyOrEdit(sock, jid, msg, '📭 Aucun membre n\'a d\'avertissement actif.');
        return;
      }

      const listLines = [
        '📋 *MEMBRES ACTUELLEMENT AVERTIS*',
        '━━━━━━━━━━━━━━━━━━━━'
      ];

      allWarned.forEach((item, index) => {
        const namePart = item.pushName ? ` (${item.pushName})` : '';
        listLines.push(`${index + 1}. +${item.number}${namePart} : *${item.count} avertissement(s)*`);
      });

      listLines.push('━━━━━━━━━━━━━━━━━━━━');
      listLines.push('💡 Voir les détails : `/warn list <@membre>`\n💡 Supprimer les avertissements : `/warn del <@membre>`');

      await replyOrEdit(sock, jid, msg, listLines.join('\n'));
      return;
    }

    // 2. /warn del <cible> (ou /warn clear / reset)
    if (args[0]?.toLowerCase() === 'del' || args[0]?.toLowerCase() === 'clear' || args[0]?.toLowerCase() === 'reset') {
      const msgContent = msg.message;
      const contextInfo =
        msgContent?.extendedTextMessage?.contextInfo ||
        msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;

      let targetNum = null;
      if (contextInfo?.mentionedJid?.[0]) {
        targetNum = contextInfo.mentionedJid[0].split('@')[0].split(':')[0];
      } else if (contextInfo?.participant) {
        targetNum = contextInfo.participant.split('@')[0].split(':')[0];
      } else if (args[1]) {
        targetNum = args[1].replace(/[^0-9]/g, '');
      }

      if (!targetNum || targetNum.length < 6) {
        await replyOrEdit(sock, jid, msg, 'Usage : Répondez au message de la personne avec `/warn del` ou tapez `/warn del @membre`.');
        return;
      }

      const deletedCount = clearWarns(targetNum);
      const confirmText = `🗑️ *${deletedCount} avertissement(s)* ont été effacés pour @${targetNum}.`;

      await sock.sendMessage(jid, {
        text: confirmText,
        mentions: [`${targetNum}@s.whatsapp.net`]
      });

      // Notification dans admintaverne et notifds
      const adminTaverneJid = config.hub?.admintaverne || config.groupAliases?.admintaverne;
      const logText = `🕊️ *AVERTISSEMENTS RÉINITIALISÉS*\nL'administrateur a effacé tous les warns (${deletedCount}) de @${targetNum}.`;

      if (adminTaverneJid) {
        await sock.sendMessage(adminTaverneJid, {
          text: logText
        });
      }
      if (config.hub?.systemNotifs && config.hub.systemNotifs !== adminTaverneJid) {
        await sock.sendMessage(config.hub.systemNotifs, {
          text: logText
        });
      }
      return;
    }

    // 3. Donner un avertissement : /warn @membre [raison] ou en répondant à son message
    const msgContent = msg.message;
    const contextInfo =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;

    let targetNum = null;
    let targetPushName = null;
    let reasonIndex = 0;

    if (contextInfo?.participant) {
      targetNum = contextInfo.participant.split('@')[0].split(':')[0];
      reasonIndex = 0;
    } else if (contextInfo?.mentionedJid?.[0]) {
      targetNum = contextInfo.mentionedJid[0].split('@')[0].split(':')[0];
      reasonIndex = 1;
    } else if (args[0]) {
      const clean = args[0].replace(/[^0-9]/g, '');
      if (clean.length >= 6) {
        targetNum = clean;
        reasonIndex = 1;
      }
    }

    if (!targetNum) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        'Usage :\n• Répondez à un membre avec `/warn [raison]`\n• Ou mentionnez-le : `/warn @membre [raison]`\n• Lister : `/warn list`\n• Réinitialiser : `/warn del @membre`'
      );
      return;
    }

    // Récupérer la raison
    const reason = args.slice(reasonIndex).join(' ').trim() || 'Non spécifiée';

    // Récupérer le nom du groupe (avec cache furtif)
    let groupName = 'Discussion';
    if (jid.endsWith('@g.us')) {
      try {
        const meta = await getCachedGroupMetadata(sock, jid);
        groupName = meta?.subject || jid;
      } catch {
        groupName = jid;
      }
    }

    // Déterminer le nom de l'admin émetteur
    const adminJid = msg.key.participant || msg.key.remoteJid;
    const adminNum = adminJid.split('@')[0].split(':')[0];
    const adminName = isOwner ? 'Le Propriétaire' : (msg.pushName ? `${msg.pushName} (+${adminNum})` : `+${adminNum}`);

    // Enregistrer le warn
    const updatedWarns = addWarn(targetNum, {
      groupJid: jid,
      groupName,
      reason,
      admin: adminName,
      pushName: targetPushName
    });

    const totalWarns = updatedWarns.length;

    // Message public dans le groupe
    const groupNotice = `⚠️ Le membre @${targetNum} a été averti par ${adminName} pour la raison suivante : "${reason}".\nIl a actuellement *${totalWarns} avertissement(s)*.`;

    await sock.sendMessage(jid, {
      text: groupNotice,
      mentions: [`${targetNum}@s.whatsapp.net`]
    });

    // Construire le récapitulatif détaillé pour admintaverne et notifds
    const warnHistoryLines = updatedWarns.map((w, idx) => {
      const dateStr = new Date(w.timestamp).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${idx + 1}. [${dateStr}] (${w.groupName}) : "${w.reason}" (par ${w.admin})`;
    }).join('\n');

    const adminLogText = [
      `🛡️ *ALERTE MODÉRATION : AVERTISSEMENT (WARN)*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `👤 *Membre averti :* @${targetNum}`,
      `🏢 *Groupe :* ${groupName}`,
      `👮 *Averti par :* ${adminName}`,
      `📌 *Raison du warn :* "${reason}"`,
      `📊 *Total :* Il a actuellement *${totalWarns} avertissement(s)* qui sont les suivants :`,
      warnHistoryLines,
      `━━━━━━━━━━━━━━━━━━━━`
    ].join('\n');

    // 1. Envoyer dans le groupe admintaverne (sans fausse mention externe)
    const adminTaverneJid = config.hub?.admintaverne || config.groupAliases?.admintaverne || '120363424594930135@g.us';
    try {
      await sock.sendMessage(adminTaverneJid, {
        text: adminLogText
      });
    } catch (err) {
      console.error('[Warn] Erreur envoi dans admintaverne:', err.message);
    }

    // 2. Envoyer dans notifds (si différent)
    if (config.hub?.systemNotifs && config.hub.systemNotifs !== adminTaverneJid) {
      try {
        await sock.sendMessage(config.hub.systemNotifs, {
          text: adminLogText
        });
      } catch (err) {}
    }

    // 3. Notification push instantanée sur smartphone
    sendNtfyNotification({
      title: `⚠️ Warn : +${targetNum} (${totalWarns} warn(s))`,
      message: `Dans "${groupName}" par ${adminName}\nRaison : "${reason}"`,
      priority: 'high',
      tags: ['warning']
    });
  }
};
