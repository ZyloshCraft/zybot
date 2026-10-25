import { getConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { sendNtfyNotification } from '../services/ntfy.js';

export default {
  name: 'ban',
  aliases: ['kick', 'expulser'],
  description: 'Bannit/expulse un membre d\'un groupe avec DM explicatif et transmission dans admintaverne',
  adminOnly: true,
  async execute({ sock, msg, jid, args, isOwner, isAdmin }) {
    if (!jid.endsWith('@g.us')) {
      await replyOrEdit(sock, jid, msg, '❌ La commande `/ban` ne peut être exécutée que dans un groupe WhatsApp.');
      return;
    }

    const config = getConfig();

    // 1. Identifier la cible (mention, citation ou argument)
    const msgContent = msg.message;
    const contextInfo =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;

    let targetNum = null;
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
        'Usage : Répondez au message du membre avec `/ban [raison]`, ou mentionnez-le (`/ban @membre [raison]`).'
      );
      return;
    }

    const targetJid = `${targetNum}@s.whatsapp.net`;
    const reason = args.slice(reasonIndex).join(' ').trim() || 'Non spécifiée';

    // Récupérer le nom du groupe et vérifier les droits d'administration du bot
    let groupName = 'ce groupe';
    let isBotAdmin = false;

    try {
      const meta = await sock.groupMetadata(jid);
      groupName = meta.subject || 'ce groupe';

      const myNum = sock.user?.id ? sock.user.id.split(':')[0] : null;
      const botParticipant = meta.participants?.find((p) => p.id.includes(myNum));
      isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';
    } catch (err) {
      console.warn('[Ban] Erreur lecture métadonnées groupe:', err.message);
    }

    if (!isBotAdmin) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        `❌ Le bot doit être *administrateur* du groupe "${groupName}" pour pouvoir expulser un membre.`
      );
      return;
    }

    // Déterminer le nom de l'admin
    const adminJid = msg.key.participant || msg.key.remoteJid;
    const adminNum = adminJid.split('@')[0].split(':')[0];
    const adminName = isOwner ? 'Le Propriétaire' : (msg.pushName ? `${msg.pushName} (+${adminNum})` : `+${adminNum}`);

    // 2. Envoyer un message privé (DM) au banni pour lui expliquer la sanction
    try {
      const dmNotice = `⚠️ *INFORMATION DE MODÉRATION*\n\nVous avez été banni du groupe "*${groupName}*" pour la raison suivante :\n"${reason}"\n\n_Décision appliquée par ${adminName}._`;
      await sock.sendMessage(targetJid, { text: dmNotice });
    } catch (dmErr) {
      console.warn('[Ban] Impossible d\'envoyer le DM au membre:', dmErr.message);
    }

    // 3. Expulser le membre du groupe
    try {
      await sock.groupParticipantsUpdate(jid, [targetJid], 'remove');
    } catch (err) {
      await replyOrEdit(sock, jid, msg, `❌ Échec lors du bannissement de @${targetNum} : ${err.message}`);
      return;
    }

    // 4. Message de confirmation dans le groupe
    const publicNotice = `🚫 Le membre @${targetNum} a été banni du groupe par ${adminName}.\n📌 *Raison :* "${reason}"`;
    await sock.sendMessage(jid, {
      text: publicNotice,
      mentions: [targetJid]
    });

    // 5. Rapport dans admintaverne et notifds
    const adminTaverneJid = config.hub?.admintaverne || config.groupAliases?.admintaverne || '120363424594930135@g.us';
    const logBanText = [
      `🚨 *ALERTE MODÉRATION : BANNISSEMENT (BAN)*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `👤 *Membre banni :* @${targetNum}`,
      `🏢 *Groupe :* ${groupName}`,
      `👮 *Banni par :* ${adminName}`,
      `📌 *Raison du ban :* "${reason}"`,
      `📩 *Notification DM :* Transmise au membre`,
      `━━━━━━━━━━━━━━━━━━━━`
    ].join('\n');

    try {
      await sock.sendMessage(adminTaverneJid, {
        text: logBanText,
        mentions: [targetJid]
      });
    } catch (err) {
      console.error('[Ban] Erreur envoi dans admintaverne:', err.message);
    }

    if (config.hub?.systemNotifs && config.hub.systemNotifs !== adminTaverneJid) {
      try {
        await sock.sendMessage(config.hub.systemNotifs, {
          text: logBanText,
          mentions: [targetJid]
        });
      } catch (err) {}
    }

    // 6. Notification push sur smartphone
    sendNtfyNotification({
      title: `🚫 Bannissement : +${targetNum}`,
      message: `Banni de "${groupName}" par ${adminName}\nRaison : "${reason}"`,
      priority: 'urgent',
      tags: ['no_entry', 'warning']
    });
  }
};
