import { jidNormalizedUser, normalizeMessageContent } from '@whiskeysockets/baileys';
import { replyOrEdit } from '../utils/stealth.js';
import { getConfig } from '../config.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';
import { findMessageById } from '../services/messageStore.js';
import { getContact } from '../services/contactStore.js';

export default {
  name: 'id',
  aliases: ['groupid', 'jid'],
  description: 'Affiche l\'identifiant (ID) du groupe ou envoie en privé l\'ID du membre ciblé aux administrateurs',
  adminOnly: true,
  async execute({ sock, msg, jid, args, isOwner, isAdmin }) {
    const normJid = jidNormalizedUser(jid);
    const isGroup = normJid.endsWith('@g.us');
    const config = getConfig();
    const aliases = config.groupAliases || {};

    const rawContent = msg.message;
    const normalized = normalizeMessageContent(rawContent) || rawContent;
    const contextInfo =
      normalized?.extendedTextMessage?.contextInfo ||
      normalized?.[Object.keys(normalized || {})[0]]?.contextInfo;

    // Déterminer l'administrateur qui a exécuté la commande
    const adminJid = msg.key.participant || msg.key.remoteJid;

    // Suppression furtive de la commande si exécutée par le propriétaire
    if (msg.key.fromMe) {
      try {
        await sock.sendMessage(jid, { delete: msg.key });
      } catch {}
    }

    // 1. CAS OÙ L'ADMIN OU LE PROPRIÉTAIRE CIBLE UN MEMBRE (en répondant à son message ou en le mentionnant)
    const quotedSender = contextInfo?.participant;
    const mentionedJid = contextInfo?.mentionedJid?.[0];
    const targetJid = quotedSender || mentionedJid;

    if (targetJid) {
      const targetCleanId = targetJid.split('@')[0].split(':')[0];
      let targetName = null;

      // Récupérer le pseudo via le message archivé
      if (contextInfo?.stanzaId) {
        const stored = findMessageById(contextInfo.stanzaId);
        if (stored?.pushName) targetName = stored.pushName;
      }

      // Si pas trouvé, chercher dans le contactStore
      if (!targetName) {
        const c = getContact(targetCleanId);
        if (c?.notify || c?.name) targetName = c.notify || c.name;
      }

      // Récupérer le nom du groupe
      let groupName = 'ce groupe';
      if (isGroup) {
        try {
          const meta = await getCachedGroupMetadata(sock, normJid);
          if (meta?.subject) groupName = `"${meta.subject}"`;
        } catch {}
      }

      const responseText = [
        `🔍 *IDENTIFIANT DU MEMBRE (ZYBOT)*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `👤 *Pseudo :* ${targetName ? `*${targetName}*` : '_(Non renseigné)_'}`,
        `🆔 *Identifiant WhatsApp (LID/JID) :*`,
        `\`${targetJid}\``,
        `📱 *Numéro / Code :* \`${targetCleanId}\``,
        `🏢 *Groupe d'origine :* ${groupName}`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `💡 *Pour lui mettre un avertissement discret :*`,
        `Tapez simplement : \`/warn ${targetCleanId} [raison]\``,
        `_(ou répondez directement à son message avec \`/warn [raison]\`)_`
      ].join('\n');

      // ENVOYER EN PRIVÉ (DM) À L'ADMIN QUI A DEMANDÉ L'ID
      try {
        await sock.sendMessage(adminJid, { text: responseText });
      } catch (dmErr) {
        // Repli si le DM échoue vers le LID
        const numOnly = adminJid.split('@')[0].split(':')[0];
        try {
          await sock.sendMessage(`${numOnly}@s.whatsapp.net`, { text: responseText });
        } catch {}
      }

      // Dans le groupe public : SILENCE TOTAL (zéro message pour ne pas alerter les membres)
      return;
    }

    // 2. CAS SANS CIBLE : AFFICHAGE DE L'ID DU GROUPE OU DE LA DISCUSSION
    if (isGroup) {
      let groupName = 'Groupe';
      let count = 0;
      try {
        const meta = await getCachedGroupMetadata(sock, normJid);
        groupName = meta?.subject || 'Groupe';
        count = meta?.participants?.length || 0;
      } catch (e) {}

      // Trouver si un alias existe pour ce groupe
      const aliasFound = Object.entries(aliases).find(([alias, id]) => id === normJid);
      const aliasText = aliasFound ? `• Alias : \`${aliasFound[0]}\`` : '• Alias : _(aucun, tapez `/groupe alias <nom>` pour en créer un)_';

      const text = [
        `👥 *IDENTIFIANT DU GROUPE*`,
        `• Nom : *${groupName}*`,
        `• ID : \`${normJid}\``,
        `• Membres : ${count}`,
        aliasText,
        '',
        '💡 *Astuce admin :* Répondez au message d\'un membre avec `/id` pour recevoir son identifiant personnel en message privé !'
      ].join('\n');

      if (isOwner) {
        await replyOrEdit(sock, jid, msg, text);
      } else {
        // Pour les autres admins, envoyer en privé pour ne pas spammer le groupe
        try {
          await sock.sendMessage(adminJid, { text });
        } catch {}
      }
      return;
    }

    // Discussion privée
    const text = [
      `👤 *IDENTIFIANT DE DISCUSSION*`,
      `• Contact : +${normJid.split('@')[0]}`,
      `• ID : \`${normJid}\``
    ].join('\n');

    await replyOrEdit(sock, jid, msg, text);
  }
};
