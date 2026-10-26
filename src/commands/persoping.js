import { generateForwardMessageContent, generateWAMessageFromContent, jidNormalizedUser } from '@whiskeysockets/baileys';
import { replyOrEditTemporary, replyOrEdit, markChatUnread } from '../utils/stealth.js';
import { findMessageById } from '../services/messageStore.js';
import { getConfig } from '../config.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';

export default {
  name: 'persoping',
  aliases: ['save'],
  description: 'Copie le message cité en privé (suppression automatique de la trace après 5s)',
  async execute({ sock, msg, jid }) {
    const msgContent = msg.message;
    const contextInfo =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;

    const quotedMessage = contextInfo?.quotedMessage;

    if (!quotedMessage) {
      await replyOrEditTemporary(sock, jid, msg, 'Usage : Répondez à un message avec /persoping', 5000);
      return;
    }

    const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
    const config = getConfig();
    const targetPersoJid = config.hub?.persoping || selfJid;

    if (!targetPersoJid) {
      await replyOrEditTemporary(sock, jid, msg, 'Erreur : destination introuvable', 5000);
      return;
    }

    const quotedSender = contextInfo.participant || contextInfo.remoteJid || 'Inconnu';
    const authorNumber = quotedSender.split('@')[0];
    const stanzaId = contextInfo.stanzaId;

    // Retrouver la date et heure d'envoi originale du message cité
    const originalEntry = findMessageById(stanzaId);
    let originalDateStr = '';

    if (originalEntry?.timestamp) {
      originalDateStr = new Date(originalEntry.timestamp).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } else {
      originalDateStr = 'Date antérieure à l\'historique récent';
    }

    // Origine (groupe ou privé)
    let originName = 'Discussion privée';
    if (jid.endsWith('@g.us')) {
      try {
        const meta = await getCachedGroupMetadata(sock, jid);
        originName = meta?.subject ? `Groupe "${meta.subject}"` : 'Groupe';
      } catch (e) {
        originName = 'Groupe';
      }
    }

    // Métadonnées complètes envoyées uniquement en privé
    const metaHeader = [
      '📌 *Message sauvegardé*',
      `• Auteur : +${authorNumber}`,
      `• Date d'envoi originale : ${originalDateStr}`,
      `• Origine : ${originName}`,
      `• ID : \`${stanzaId || 'N/A'}\``
    ].join('\n');

    try {
      // 1. Envoyer les infos détaillées dans le groupe dédié (ou chat privé)
      const myNumber = selfJid ? selfJid.split('@')[0].split(':')[0] : null;
      const sentMeta = await sock.sendMessage(targetPersoJid, {
        text: myNumber ? `${metaHeader}\n🔔 @${myNumber}` : metaHeader,
        mentions: selfJid ? [selfJid] : []
      });

      // 2. Transférer le message cité original
      const forwardContent = generateForwardMessageContent(
        {
          key: {
            fromMe: false,
            remoteJid: jid,
            id: stanzaId || ''
          },
          message: quotedMessage
        },
        true
      );

      const forwardWaMsg = generateWAMessageFromContent(targetPersoJid, forwardContent, {});
      await sock.relayMessage(targetPersoJid, forwardWaMsg.message, { messageId: forwardWaMsg.key.id });

      // Marquer le groupe comme non lu (pastille verte)
      await markChatUnread(sock, targetPersoJid, sentMeta?.key);

      // 3. Modifier la commande en "Sauvegardé en privé", puis la supprimer après 5 secondes pour tout le monde (sauf hub/privé)
      await replyOrEditTemporary(sock, jid, msg, 'Sauvegardé', 5000);
    } catch (err) {
      console.error('Erreur persoping:', err);

      // Fallback textuel
      try {
        const textFallback =
          quotedMessage.conversation ||
          quotedMessage.extendedTextMessage?.text ||
          quotedMessage.imageMessage?.caption ||
          quotedMessage.videoMessage?.caption;

        if (textFallback) {
          await sock.sendMessage(targetPersoJid, {
            text: `Contenu du message :\n> ${textFallback}`
          });
          await replyOrEditTemporary(sock, jid, msg, 'Sauvegardé', 5000);
          return;
        }
      } catch (fbErr) {}

      await replyOrEditTemporary(sock, jid, msg, `Erreur persoping : ${err.message}`, 5000);
    }
  }
};
