import { jidNormalizedUser, normalizeMessageContent } from '@whiskeysockets/baileys';
import { replyOrEdit } from '../utils/stealth.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';

export default {
  name: 'pfp',
  aliases: ['pp', 'profilepic', 'avatar'],
  description: 'Télécharge et affiche la photo de profil en haute résolution d\'un contact ou d\'un groupe',
  async execute({ sock, msg, jid, args }) {
    const rawContent = msg.message;
    const normalized = normalizeMessageContent(rawContent) || rawContent;
    const contextInfo =
      normalized?.extendedTextMessage?.contextInfo ||
      normalized?.[Object.keys(normalized || {})[0]]?.contextInfo;

    let targetJid = null;
    let targetLabel = '';
    const isGroupChat = jid.endsWith('@g.us');

    // 1. Cible via citation
    if (contextInfo?.participant) {
      targetJid = contextInfo.participant;
    } else if (contextInfo?.mentionedJid?.[0]) {
      // 2. Cible via mention @membre
      targetJid = contextInfo.mentionedJid[0];
    } else if (args[0]) {
      // 3. Cible via argument explicite (ex: /pfp groupe, /pfp moi, /pfp 33612345678)
      const firstArg = args[0].toLowerCase();
      if (firstArg === 'groupe' || firstArg === 'group' || firstArg === 'g') {
        if (!isGroupChat) {
          await replyOrEdit(sock, jid, msg, '❌ Cette commande doit être exécutée dans un groupe pour voir la photo du groupe.');
          return;
        }
        targetJid = jid;
      } else if (firstArg === 'moi' || firstArg === 'me') {
        targetJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
      } else {
        const clean = firstArg.replace(/[^0-9]/g, '');
        if (clean.length >= 6) {
          targetJid = `${clean}@s.whatsapp.net`;
        }
      }
    } else {
      // 4. Par défaut sans argument
      if (isGroupChat) {
        // Dans un groupe : récupérer la photo du groupe par défaut
        targetJid = jid;
      } else {
        // En privé : récupérer la photo de l'interlocuteur
        targetJid = jid;
      }
    }

    if (!targetJid) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        'Usage :\n• Répondez au message de quelqu\'un avec `/pfp`\n• Mentionnez un membre : `/pfp @membre`\n• Photo du groupe actuel : `/pfp groupe`'
      );
      return;
    }

    targetJid = jidNormalizedUser(targetJid);
    const isTargetGroup = targetJid.endsWith('@g.us');

    if (isTargetGroup) {
      let groupName = 'le groupe';
      try {
        const meta = await getCachedGroupMetadata(sock, targetJid);
        if (meta?.subject) groupName = `"${meta.subject}"`;
      } catch {}
      targetLabel = `du groupe ${groupName}`;
    } else {
      const num = targetJid.split('@')[0].split(':')[0];
      targetLabel = `de @${num}`;
    }

    await replyOrEdit(sock, jid, msg, `⏳ Récupération de la photo de profil ${targetLabel}...`);

    try {
      // Obtenir l'URL directe haute résolution via Baileys
      const pfpUrl = await sock.profilePictureUrl(targetJid, 'image');

      if (!pfpUrl) {
        await replyOrEdit(sock, jid, msg, `❌ Aucune photo de profil disponible pour ${targetLabel} (masquée ou inexistante).`);
        return;
      }

      // Télécharger l'image en mémoire
      const res = await fetch(pfpUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      const mentions = isTargetGroup ? [] : [targetJid];
      const caption = isTargetGroup
        ? `👥 *Photo de profil ${targetLabel}*\n🔍 Résolution maximale`
        : `👤 *Photo de profil ${targetLabel}*\n🔍 Résolution maximale`;

      await sock.sendMessage(
        jid,
        {
          image: imageBuffer,
          caption,
          mentions
        },
        { quoted: msg }
      );

      // Si le message d'invocation a été envoyé par nous-même, nettoyer furtivement la commande
      if (msg.key.fromMe) {
        try {
          await sock.sendMessage(jid, { delete: msg.key });
        } catch {}
      }
    } catch (err) {
      console.warn('[PFP] Impossible de récupérer la photo:', err.message);
      await replyOrEdit(
        sock,
        jid,
        msg,
        `❌ Impossible de charger la photo de profil ${targetLabel}.\nElle est soit absente, soit protégée par les paramètres de confidentialité WhatsApp.`
      );
    }
  }
};
