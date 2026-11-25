import fs from 'node:fs';
import { getConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { getStatusesForUser, getAllRecentStatuses, cacheStatusMedia } from '../services/statusStore.js';

export default {
  name: 'statut',
  aliases: ['status', 'story', 'stories'],
  description: 'Archive et télécharge les statuts/stories WhatsApp récents d\'un contact',
  async execute({ sock, msg, jid, args }) {
    const config = getConfig();

    const msgContent = msg.message;
    const contextInfo =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;

    // 1. Si aucun argument et pas de citation, lister les personnes ayant posté des statuts récents
    if (!args[0] && !contextInfo?.participant && !(contextInfo?.mentionedJid?.length)) {
      const recentList = getAllRecentStatuses();
      if (recentList.length === 0) {
        await replyOrEdit(
          sock,
          jid,
          msg,
          '📭 *Aucun statut archivé pour le moment.*\nLe bot enregistre automatiquement en arrière-plan tous les nouveaux statuts postés par vos contacts.\n\nUsage : `/statut <numéro_ou_pseudo>`'
        );
        return;
      }

      const lines = [
        '📸 *STATUTS WHATSAPP ARCHIVÉS*',
        '━━━━━━━━━━━━━━━━━━━━',
        'Contacts ayant posté des statuts récemment :'
      ];

      recentList.slice(0, 15).forEach((item, index) => {
        const minAgo = Math.round((Date.now() - item.lastTimestamp) / 60000);
        const timeStr = minAgo < 60 ? `il y a ${minAgo} min` : `il y a ${Math.round(minAgo / 60)}h`;
        const nameStr = item.pushName ? ` (${item.pushName})` : '';
        lines.push(`${index + 1}. +${item.number}${nameStr} : *${item.count} statut(s)* (${timeStr})`);
      });

      lines.push('━━━━━━━━━━━━━━━━━━━━');
      lines.push(`💡 Pour extraire les médias : \`/statut ${recentList[0].number}\` (ou \`/statut <pseudo>\`).`);

      await replyOrEdit(sock, jid, msg, lines.join('\n'));
      return;
    }

    // 2. Extraire la cible (numéro, pseudo, LID, mention ou citation)
    let target = args.join(' ').trim();
    if (contextInfo?.participant) {
      target = contextInfo.participant;
    } else if (contextInfo?.mentionedJid && contextInfo.mentionedJid.length > 0) {
      target = contextInfo.mentionedJid[0];
    }

    if (!target) {
      await replyOrEdit(sock, jid, msg, 'Usage : `/statut <numéro|pseudo|mention>` ou répondez au message de quelqu\'un avec `/statut`.');
      return;
    }

    const userStatuses = getStatusesForUser(target);
    const cleanDigits = target.replace(/[^0-9]/g, '');
    const displayTarget = userStatuses[0]?.pushName
      ? `${userStatuses[0].pushName} (+${userStatuses[0].senderNumber})`
      : (target.includes('@lid') ? target : (cleanDigits.length >= 5 ? `+${cleanDigits}` : target));

    if (!userStatuses || userStatuses.length === 0) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        `⚠️ Aucun statut trouvé pour ${displayTarget}.\nLe bot doit être en ligne au moment où le contact publie son statut pour pouvoir l'archiver.`
      );
      return;
    }

    const targetHub = config.hub?.systemNotifs || jid;
    await replyOrEdit(sock, jid, msg, `⏳ Export de ${userStatuses.length} statut(s) de ${displayTarget} en cours...`);

    let successCount = 0;

    for (let i = 0; i < userStatuses.length; i++) {
      const st = userStatuses[i];
      const numDisplay = st.senderNumber || cleanDigits || 'inconnu';
      const dateStr = new Date(st.timestamp).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      const headerText = `📸 *Statut WhatsApp archivé [${i + 1}/${userStatuses.length}]*\n👤 De : +${numDisplay}${st.pushName ? ` (${st.pushName})` : ''}\n🕒 Publié le : ${dateStr}${st.caption ? `\n💬 Légende : ${st.caption}` : ''}`;

      try {
        if (st.type === 'image' || st.type === 'video' || st.type === 'audio') {
          let mediaPath = st.mediaPath && fs.existsSync(st.mediaPath) ? st.mediaPath : null;
          if (!mediaPath) {
            mediaPath = await cacheStatusMedia(st);
          }

          if (!mediaPath || !fs.existsSync(mediaPath)) {
            throw new Error('Média expiré ou introuvable');
          }

          const buffer = fs.readFileSync(mediaPath);
          if (st.type === 'image') {
            await sock.sendMessage(targetHub, { image: buffer, caption: headerText });
          } else if (st.type === 'video') {
            await sock.sendMessage(targetHub, { video: buffer, caption: headerText });
          } else if (st.type === 'audio') {
            await sock.sendMessage(targetHub, { audio: buffer, mimetype: st.mimetype || 'audio/mp4' });
          }
        } else {
          await sock.sendMessage(targetHub, {
            text: `${headerText}\n\n📝 *Texte :*\n${st.caption}`
          });
        }
        successCount++;
      } catch (err) {
        console.error(`[Statut] Erreur export statut ${st.id}:`, err.message);
        await sock.sendMessage(targetHub, {
          text: `${headerText}\n\n⚠️ _Impossible de télécharger le média (statut expiré ou chiffré)_`
        });
      }
    }

    if (targetHub !== jid) {
      await replyOrEdit(sock, jid, msg, `✅ ${successCount}/${userStatuses.length} statut(s) de ${displayTarget} exporté(s) vers votre hub.`);
    }
  }
};
