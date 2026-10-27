import { getConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { addWarn, getWarns, getAllWarnedUsers, clearWarns } from '../services/warnStore.js';
import { sendNtfyNotification } from '../services/ntfy.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';
import { findSenderByPushName } from '../services/messageStore.js';
import { searchContactByPseudo } from '../services/contactStore.js';
import { resolveHistoricMembers, applyHistoricWarns } from '../services/warnResolver.js';
import { getWarnHelpGuide } from './help.js';

export default {
  name: 'warn',
  aliases: ['av', 'avertir'],
  description: 'Gère les avertissements des membres discrètement avec alertes dans admintaverne',
  adminOnly: true,
  async execute({ sock, msg, jid, args, isOwner, isAdmin }) {
    const config = getConfig();
    const adminTaverneJid = config.hub?.admintaverne || config.groupAliases?.admintaverne || '120363424594930135@g.us';

    // Déterminer l'administrateur émetteur et son JID
    const adminJid = msg.key.participant || msg.key.remoteJid;
    const adminNum = adminJid.split('@')[0].split(':')[0];
    const adminName = isOwner ? 'Le Propriétaire' : (msg.pushName ? `${msg.pushName} (+${adminNum})` : `+${adminNum}`);

    // Nettoyage furtif de la commande si émise par le propriétaire
    if (msg.key.fromMe) {
      try {
        await sock.sendMessage(jid, { delete: msg.key });
      } catch {}
    }

    // 0. /warn help (ou /warn aide / guide) : Guide complet envoyé discrètement en privé à l'administrateur
    if (args[0]?.toLowerCase() === 'help' || args[0]?.toLowerCase() === 'aide' || args[0]?.toLowerCase() === 'guide') {
      const p = config.prefix || '/';
      const guideText = getWarnHelpGuide(p);
      try {
        await sock.sendMessage(adminJid, { text: guideText });
      } catch {
        await sock.sendMessage(adminTaverneJid, {
          text: `📖 *Guide /warn demandé par @${adminNum} :*\n\n${guideText}`,
          mentions: [adminJid]
        });
      }
      return;
    }

    // 1. /warn scan (ou /warn import) : Résolution et synchronisation automatique de la liste des 60 membres
    if (args[0]?.toLowerCase() === 'scan' || args[0]?.toLowerCase() === 'import' || args[0]?.toLowerCase() === 'sync') {
      const { resolved, unresolved, totalTargets } = await resolveHistoricMembers(sock, jid);
      const appliedCount = applyHistoricWarns(resolved);

      const reportLines = [
        `📊 *RAPPORT DE RÉSOLUTION DES IDENTIFIANTS TAVERNE*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `🎯 Total cibles : *${totalTargets} membres*`,
        `✅ *Identifiés & enregistrés :* ${resolved.length} membres (${appliedCount} avertissements appliqués)`,
        `⏳ *Restants à identifier :* ${unresolved.length} membres\n`,
        `📋 *APERÇU DES MEMBRES IDENTIFIÉS :*`
      ];

      resolved.slice(0, 20).forEach((r, idx) => {
        reportLines.push(`${idx + 1}. *${r.pseudo}* ➔ \`${r.resolvedId}\` (*${r.count} av*)`);
      });

      if (resolved.length > 20) {
        reportLines.push(`_... et ${resolved.length - 20} autres membres enregistrés dans warns.json._`);
      }

      if (unresolved.length > 0) {
        reportLines.push('\n⏳ *Exemples de membres restants :*');
        unresolved.slice(0, 10).forEach((u) => {
          reportLines.push(`• ${u.pseudo} (${u.count} av)`);
        });
      }

      reportLines.push('━━━━━━━━━━━━━━━━━━━━');
      reportLines.push(`👮 Action exécutée par : @${adminNum}`);

      // Envoyer le rapport uniquement dans admintaverne
      await sock.sendMessage(adminTaverneJid, {
        text: reportLines.join('\n'),
        mentions: [adminJid]
      });
      return;
    }

    // 2. /warn list ou /warn list <cible>
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

      // Si une cible est spécifiée, afficher l'historique détaillé dans admintaverne
      if (targetNum && targetNum.length >= 6) {
        const userWarns = getWarns(targetNum);
        if (!userWarns.length) {
          await sock.sendMessage(adminTaverneJid, {
            text: `ℹ️ L'utilisateur +${targetNum} n'a aucun avertissement actif.\n(Demandé par @${adminNum})`,
            mentions: [adminJid]
          });
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
        lines.push('━━━━━━━━━━━━━━━━━━━━');
        lines.push(`👮 Consultation par : @${adminNum}`);

        await sock.sendMessage(adminTaverneJid, {
          text: lines.join('\n'),
          mentions: [adminJid]
        });
        return;
      }

      // Sinon, lister tous les membres avertis dans admintaverne
      const allWarned = getAllWarnedUsers();
      if (!allWarned.length) {
        await sock.sendMessage(adminTaverneJid, {
          text: `📭 Aucun membre n'a d'avertissement actif dans la base.\n(Demandé par @${adminNum})`,
          mentions: [adminJid]
        });
        return;
      }

      const listLines = [
        '📋 *MEMBRES ACTUELLEMENT AVERTIS*',
        `Total : *${allWarned.length} personnes*`,
        '━━━━━━━━━━━━━━━━━━━━'
      ];

      allWarned.forEach((item, index) => {
        const namePart = item.pushName ? ` (${item.pushName})` : '';
        listLines.push(`${index + 1}. +${item.number}${namePart} : *${item.count} avertissement(s)*`);
      });

      listLines.push('━━━━━━━━━━━━━━━━━━━━');
      listLines.push('💡 Voir les détails : `/warn list <@membre>`\n💡 Supprimer : `/warn del <@membre>`');
      listLines.push(`👮 Liste demandée par : @${adminNum}`);

      await sock.sendMessage(adminTaverneJid, {
        text: listLines.join('\n'),
        mentions: [adminJid]
      });
      return;
    }

    // 3. /warn del <cible> (ou /warn clear / reset)
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
        const digits = args[1].replace(/[^0-9]/g, '');
        if (digits.length >= 6) {
          targetNum = digits;
        } else {
          // Recherche par pseudo
          const found = findSenderByPushName(args[1], jid) || searchContactByPseudo(args[1]);
          if (found) targetNum = (found.sender || found.id).split('@')[0].split(':')[0];
        }
      }

      if (!targetNum || targetNum.length < 6) {
        await sock.sendMessage(adminTaverneJid, {
          text: `⚠️ Erreur /warn del : Cible introuvable.\n(Demandé par @${adminNum})`,
          mentions: [adminJid]
        });
        return;
      }

      const deletedCount = clearWarns(targetNum);
      const logText = [
        `🕊️ *AVERTISSEMENTS RÉINITIALISÉS*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `👤 *Membre concerné :* +${targetNum}`,
        `🗑️ *Avertissements effacés :* ${deletedCount}`,
        `👮 *Action exécutée par :* @${adminNum}`,
        `━━━━━━━━━━━━━━━━━━━━`
      ].join('\n');

      // Notification uniquement dans admintaverne et notifds (RIEN dans le groupe d'origine)
      await sock.sendMessage(adminTaverneJid, {
        text: logText,
        mentions: [adminJid]
      });

      if (config.hub?.systemNotifs && config.hub.systemNotifs !== adminTaverneJid) {
        try {
          await sock.sendMessage(config.hub.systemNotifs, {
            text: logText
          });
        } catch {}
      }
      return;
    }

    // 4. Donner un avertissement : /warn @membre [raison] ou en répondant à son message
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
      } else {
        // Recherche par pseudo / nom d'utilisateur (ex: /warn Hugo spam)
        const searchWord = args[0].replace(/^@/, '').trim();
        const found = findSenderByPushName(searchWord, jid) || searchContactByPseudo(searchWord);
        if (found) {
          const resolved = found.sender || found.id;
          targetNum = resolved.split('@')[0].split(':')[0];
          targetPushName = found.pushName || found.notify || found.name;
          reasonIndex = 1;
        }
      }
    }

    if (!targetNum) {
      // Si la cible n'est pas reconnue, alerter uniquement l'admin dans admintaverne (zéro trace dans le groupe public)
      await sock.sendMessage(adminTaverneJid, {
        text: `⚠️ *Échec de la commande /warn par @${adminNum} :*\nImpossible d'identifier la cible "${args[0] || 'inconnue'}".\n💡 Veuillez mentionner le membre (@membre), répondre à son message, ou taper son numéro/LID exact.`,
        mentions: [adminJid]
      });
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

    // Enregistrer le warn
    const updatedWarns = addWarn(targetNum, {
      groupJid: jid,
      groupName,
      reason,
      admin: adminName,
      pushName: targetPushName
    });

    const totalWarns = updatedWarns.length;

    // RÈGLE STRICTE DEMANDÉE PAR L'UTILISATEUR :
    // DANS LE GROUPE OÙ LA COMMANDE EST EXÉCUTÉE : ON NE FAIT STRICTEMENT RIEN (0 message, 0 spam, discrétion absolue)

    // Construire le récapitulatif détaillé pour admintaverne
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
      `👤 *Membre averti :* +${targetNum}${targetPushName ? ` (${targetPushName})` : ''}`,
      `🏢 *Groupe d'origine :* ${groupName}`,
      `👮 *Averti par :* @${adminNum}`,
      `📌 *Raison du warn :* "${reason}"`,
      `📊 *Total :* Il a actuellement *${totalWarns} avertissement(s)* qui sont les suivants :`,
      warnHistoryLines,
      `━━━━━━━━━━━━━━━━━━━━`
    ].join('\n');

    // 1. Envoyer dans admintaverne avec MENTION de l'admin émetteur (@adminNum)
    try {
      await sock.sendMessage(adminTaverneJid, {
        text: adminLogText,
        mentions: [adminJid]
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
