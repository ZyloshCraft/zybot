import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { getStatusesForUser, getAllRecentStatuses } from '../services/statusStore.js';

export default {
  name: 'statut',
  description: 'Archive et télécharge les statuts/stories WhatsApp récents d\'un contact dans votre hub',
  async execute({ sock, msg, jid, args }) {
    const config = getConfig();

    // 1. Si aucun argument, lister les personnes ayant posté des statuts récents
    if (!args[0]) {
      // Vérifier si un message est cité pour en extraire l'auteur
      const msgContent = msg.message;
      const contextInfo =
        msgContent?.extendedTextMessage?.contextInfo ||
        msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;
      const quotedSender = contextInfo?.participant || contextInfo?.remoteJid;

      if (!quotedSender) {
        const recentList = getAllRecentStatuses();
        if (recentList.length === 0) {
          await replyOrEdit(
            sock,
            jid,
            msg,
            '📭 *Aucun statut archivé pour le moment.*\nLe bot enregistre automatiquement en arrière-plan tous les nouveaux statuts postés par vos contacts depuis son démarrage.\n\nUsage : `/statut <numéro_ou_mention>`'
          );
          return;
        }

        const lines = [
          '📸 *STATUTS WHATSAPP ARCHIVÉS*',
          '━━━━━━━━━━━━━━━━━━━━',
          'Voici les contacts ayant posté des statuts récemment :'
        ];

        recentList.slice(0, 15).forEach((item, index) => {
          const minAgo = Math.round((Date.now() - item.lastTimestamp) / 60000);
          const timeStr = minAgo < 60 ? `il y a ${minAgo} min` : `il y a ${Math.round(minAgo / 60)}h`;
          const nameStr = item.pushName ? ` (${item.pushName})` : '';
          lines.push(`${index + 1}. +${item.number}${nameStr} : *${item.count} statut(s)* (${timeStr})`);
        });

        lines.push('━━━━━━━━━━━━━━━━━━━━');
        lines.push('💡 Pour extraire les photos/vidéos : `/statut <numéro>` (ex: `/statut ${recentList[0].number}`).');

        await replyOrEdit(sock, jid, msg, lines.join('\n'));
        return;
      }
    }

    // 2. Extraire la cible (numéro, LID, mention ou citation)
    let target = args[0];
    const msgContent = msg.message;
    const contextInfo =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;

    if (contextInfo?.participant) {
      target = contextInfo.participant;
    } else if (contextInfo?.mentionedJid && contextInfo.mentionedJid.length > 0) {
      target = contextInfo.mentionedJid[0];
    }

    if (!target) {
      await replyOrEdit(sock, jid, msg, 'Usage : `/statut <numéro|id@lid|mention>` ou répondez au message de quelqu\'un avec `/statut`.');
      return;
    }

    const cleanInput = target.trim();
    const digitsOnly = cleanInput.replace(/[^0-9]/g, '');
    if (!digitsOnly || digitsOnly.length < 5) {
      await replyOrEdit(sock, jid, msg, 'Usage : `/statut <numéro|id@lid|mention>` (ex: `/statut 33612345678` ou `/statut 18081946574907@lid`).');
      return;
    }

    const userStatuses = getStatusesForUser(cleanInput);
    const displayTarget = cleanInput.includes('@lid') ? cleanInput : `+${digitsOnly}`;

    if (!userStatuses || userStatuses.length === 0) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        `⚠️ Aucun statut trouvé pour ${displayTarget}.\nLe bot doit être en ligne au moment où le contact publie son statut pour pouvoir l'intercepter et l'archiver.`
      );
      return;
    }

    const targetHub = config.hub?.systemNotifs || jid;
    await replyOrEdit(sock, jid, msg, `⏳ Envoi de ${userStatuses.length} statut(s) de ${displayTarget} vers votre hub système...`);

    let successCount = 0;

    for (let i = 0; i < userStatuses.length; i++) {
      const st = userStatuses[i];
      const dateStr = new Date(st.timestamp).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      const headerText = `📸 *Statut WhatsApp archivé [${i + 1}/${userStatuses.length}]*\n👤 De : +${cleanNumber}${st.pushName ? ` (${st.pushName})` : ''}\n🕒 Publié le : ${dateStr}${st.caption ? `\n💬 Légende : ${st.caption}` : ''}`;

      try {
        if (st.type === 'image' || st.type === 'video' || st.type === 'audio') {
          const buffer = await downloadMediaMessage(
            { key: st.key, message: st.rawMessage },
            'buffer',
            {}
          );

          if (st.type === 'image') {
            await sock.sendMessage(targetHub, { image: buffer, caption: headerText });
          } else if (st.type === 'video') {
            await sock.sendMessage(targetHub, { video: buffer, caption: headerText });
          } else if (st.type === 'audio') {
            await sock.sendMessage(targetHub, { audio: buffer, mimetype: 'audio/mp4' });
          }
        } else {
          // Statut texte
          await sock.sendMessage(targetHub, {
            text: `${headerText}\n\n📝 *Texte :*\n${st.caption}`
          });
        }
        successCount++;
      } catch (err) {
        console.error(`[Statut] Erreur téléchargement statut ${st.id}:`, err);
        await sock.sendMessage(targetHub, {
          text: `${headerText}\n\n⚠️ _Impossible de télécharger le média (statut expiré ou chiffré)_`
        });
      }
    }

    if (targetHub !== jid) {
      await replyOrEdit(sock, jid, msg, `✅ ${successCount}/${userStatuses.length} statut(s) de +${cleanNumber} transféré(s) dans votre hub.`);
    }
  }
};
