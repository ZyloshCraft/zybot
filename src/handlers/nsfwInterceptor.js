import { downloadMediaMessage, normalizeMessageContent } from '@whiskeysockets/baileys';
import { getConfig } from '../config.js';
import { checkImageNsfw } from '../services/nsfwDetector.js';
import { sendNtfyNotification } from '../services/ntfy.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';

/**
 * Vérifie si le bot est administrateur dans le groupe
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {string} jid
 * @returns {Promise<{ isBotAdmin: boolean, groupName: string }>}
 */
async function checkBotAdminStatus(sock, jid) {
  try {
    const meta = await getCachedGroupMetadata(sock, jid);
    const myNumber = sock.user?.id ? sock.user.id.split(':')[0] : null;
    const botPart = meta?.participants?.find((p) => p.id.includes(myNumber));
    const isBotAdmin = botPart?.admin === 'admin' || botPart?.admin === 'superadmin';
    const groupName = meta?.subject || jid;

    return { isBotAdmin, groupName };
  } catch (err) {
    return { isBotAdmin: false, groupName: jid };
  }
}

/**
 * Intercepte et analyse les images envoyées dans les groupes administrés
 * @param {object} params
 * @param {import('@whiskeysockets/baileys').WASocket} params.sock
 * @param {object} params.msg
 * @param {string} params.jid
 */
export async function handleGroupNsfwScan({ sock, msg, jid }) {
  if (!jid.endsWith('@g.us')) return; // Uniquement dans les groupes
  if (msg.key.fromMe) return;         // Ne pas scanner nos propres images

  const config = getConfig();
  if (config.antiNsfw?.enabled === false) return;

  const rawMessage = msg.message;
  const normalized = normalizeMessageContent(rawMessage) || rawMessage;
  if (!normalized?.imageMessage) return; // Uniquement si le message contient une image

  // 1. Vérifier si nous sommes administrateur de ce groupe
  const { isBotAdmin, groupName } = await checkBotAdminStatus(sock, jid);
  if (!isBotAdmin) return; // Si nous ne sommes pas admin, nous ne pouvons pas supprimer

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const senderNumber = senderJid ? senderJid.split('@')[0].split(':')[0] : 'Inconnu';
  const pushName = msg.pushName ? ` (${msg.pushName})` : '';

  try {
    // 2. Télécharger l'image en mémoire
    const mimeType = normalized.imageMessage.mimetype || 'image/jpeg';
    const imageBuffer = await downloadMediaMessage(
      { key: msg.key, message: rawMessage },
      'buffer',
      {}
    );

    if (!imageBuffer || imageBuffer.length === 0) return;

    // 3. Scanner l'image avec le modèle Freepik/HuggingFace
    const { isNsfw, details, scores } = await checkImageNsfw(imageBuffer, mimeType);

    if (!isNsfw) return; // Image saine, on laisse passer

    console.log(`🚨 [Anti-NSFW] Image inappropriée détectée dans "${groupName}" par +${senderNumber} !`);

    // 4. SUPPRESSION IMMÉDIATE DU MESSAGE DANS LE GROUPE POUR TOUS
    try {
      await sock.sendMessage(jid, { delete: msg.key });
    } catch (delErr) {
      console.error('[Anti-NSFW] Échec suppression message dans le groupe:', delErr.message);
    }

    // 5. Avertissement public discret dans le groupe
    try {
      const publicWarning = `⚠️ Le contenu envoyé par @${senderNumber} a été automatiquement supprimé par le filtre de sécurité Anti-NSFW.`;
      await sock.sendMessage(jid, {
        text: publicWarning,
        mentions: [senderJid]
      });
    } catch {}

    // 6. Envoi de l'image originale non censurée et du rapport dans admintaverne
    const adminTaverneJid = config.hub?.admintaverne || config.groupAliases?.admintaverne || '120363424594930135@g.us';
    const dateStr = new Date().toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const reportCaption = [
      `🚨 *ALERTE MODÉRATION : CONTENU NSFW SUPPRIMÉ*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `👤 *Auteur :* @${senderNumber}${pushName}`,
      `🏢 *Groupe :* ${groupName}`,
      `📅 *Date :* ${dateStr}`,
      `🆔 *Message ID :* \`${msg.key.id}\``,
      `🔍 *Classification :* 🔴 NSFW Détecté`,
      scores ? `\n📊 *Détails des scores :*\n${scores}` : '',
      `━━━━━━━━━━━━━━━━━━━━`,
      `⚡ *Action appliquée :* Image supprimée pour tous dans le groupe.`
    ].filter(Boolean).join('\n');

    try {
      await sock.sendMessage(adminTaverneJid, {
        image: imageBuffer,
        caption: reportCaption,
        mentions: [senderJid]
      });
    } catch (adminErr) {
      console.error('[Anti-NSFW] Erreur transfert vers admintaverne:', adminErr.message);
    }

    // 7. Notification dans notifds (si différent)
    if (config.hub?.systemNotifs && config.hub.systemNotifs !== adminTaverneJid) {
      try {
        await sock.sendMessage(config.hub.systemNotifs, {
          text: `🚨 *Contenu NSFW intercepté dans "${groupName}"*\nAuteur : @${senderNumber}${pushName}\nImage archivée dans le salon admintaverne.`,
          mentions: [senderJid]
        });
      } catch {}
    }

    // 8. Notification push instantanée sur le smartphone
    sendNtfyNotification({
      title: `🚨 Image NSFW Supprimée (+${senderNumber})`,
      message: `Dans "${groupName}" par +${senderNumber}\nConsultez le salon admintaverne.`,
      priority: 'urgent',
      tags: ['warning', 'underage']
    });
  } catch (scanErr) {
    console.error('[Anti-NSFW] Erreur lors du traitement de l\'image:', scanErr.message);
  }
}
