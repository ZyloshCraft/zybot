import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { replyOrEdit } from '../utils/stealth.js';
import { notifySystem } from '../services/notifier.js';
import { recordAuditLog } from '../services/auditLogStore.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';

export default {
  name: 'lock',
  aliases: ['fermer', 'unlock', 'ouvrir'],
  description: 'Bascule ou modifie la permission d\'envoi de messages dans un groupe (Admins seuls ou Tout le monde)',
  async execute({ sock, msg, jid, args, isOwner }) {
    if (!jid || !jid.endsWith('@g.us')) {
      await replyOrEdit(sock, jid, msg, '❌ Cette commande doit être exécutée dans un groupe WhatsApp.');
      return;
    }

    const normJid = jidNormalizedUser(jid);
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const senderNumber = senderJid ? senderJid.split('@')[0].split(':')[0] : 'Inconnu';
    const pushName = msg.pushName || `+${senderNumber}`;

    try {
      // 1. Récupérer les métadonnées fraîches du groupe
      const metadata = await sock.groupMetadata(normJid);
      const groupName = metadata.subject || normJid;

      // 2. Vérifier si le bot est administrateur
      const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
      const selfNumber = selfJid ? selfJid.split('@')[0].split(':')[0] : null;

      const botParticipant = metadata.participants?.find((p) => {
        const pNum = jidNormalizedUser(p.id).split('@')[0].split(':')[0];
        return pNum === selfNumber;
      });

      const isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';
      if (!isBotAdmin) {
        await replyOrEdit(
          sock,
          jid,
          msg,
          '❌ Le bot doit être *administrateur* du groupe pour modifier ce paramètre.'
        );
        return;
      }

      // 3. Déterminer la nouvelle valeur
      // metadata.announce === true signifie "Seuls les admins peuvent envoyer des messages"
      const currentAnnounce = Boolean(metadata.announce);
      const sub = args[0]?.toLowerCase();

      let targetAnnounce = !currentAnnounce; // Toggle par défaut

      if (sub === 'on' || sub === 'close' || sub === 'fermer') {
        targetAnnounce = true;
      } else if (sub === 'off' || sub === 'open' || sub === 'ouvrir') {
        targetAnnounce = false;
      }

      // Si l'état souhaité est déjà actif
      if (targetAnnounce === currentAnnounce && sub) {
        const stateStr = currentAnnounce
          ? '🔒 Le groupe est déjà verrouillé (seuls les admins peuvent écrire).'
          : '🔓 Le groupe est déjà ouvert à tous les membres.';
        await replyOrEdit(sock, jid, msg, stateStr);
        return;
      }

      // 4. Appliquer la modification via Baileys
      // 'announcement' = seuls les admins / 'not_announcement' = tout le monde
      const setting = targetAnnounce ? 'announcement' : 'not_announcement';
      await sock.groupSettingUpdate(normJid, setting);

      const statusEmoji = targetAnnounce ? '🔒' : '🔓';
      const statusTitle = targetAnnounce
        ? '*GROUPE VERROUILLÉ*'
        : '*GROUPE DÉVERROUILLÉ*';
      const statusDesc = targetAnnounce
        ? 'Seuls les administrateurs peuvent désormais envoyer des messages.'
        : 'Tous les membres peuvent à nouveau envoyer des messages.';

      const responseText = [
        `${statusEmoji} ${statusTitle}`,
        '━━━━━━━━━━━━━━━━━━━━',
        `• *Groupe :* ${groupName}`,
        `• *Action :* ${statusDesc}`,
        `• *Par :* ${pushName}`,
        '━━━━━━━━━━━━━━━━━━━━'
      ].join('\n');

      await replyOrEdit(sock, jid, msg, responseText);

      // Audit log & notification
      recordAuditLog({
        type: 'lock',
        action: targetAnnounce ? 'GROUP_LOCK' : 'GROUP_UNLOCK',
        user: senderJid,
        pushName,
        chatJid: normJid,
        chatName: groupName,
        details: targetAnnounce ? 'Groupe verrouillé (admins seuls)' : 'Groupe ouvert à tous',
        status: 'success'
      });

      await notifySystem(
        sock,
        `🛡️ [GroupLock] ${groupName} : ${targetAnnounce ? 'Verrouillé 🔒' : 'Déverrouillé 🔓'} par +${senderNumber}`
      );
    } catch (err) {
      console.error('[GroupLock] Erreur modification paramètre:', err);
      recordAuditLog({
        type: 'lock',
        action: 'GROUP_LOCK_ERROR',
        user: senderJid,
        pushName,
        chatJid: normJid,
        details: err.message,
        status: 'error'
      });
      await replyOrEdit(sock, jid, msg, `⚠️ Erreur lors de la modification du groupe : ${err.message}`);
    }
  }
};
