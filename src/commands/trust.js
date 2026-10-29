import { addTrustedUser, removeTrustedUser, revokeUser, unrevokeUser, getAllPermissions } from '../services/permissionStore.js';
import { replyOrEdit } from '../utils/stealth.js';
import { normalizeMessageContent } from '@whiskeysockets/baileys';
import { extractTextFromMessage } from '../handlers/message.js';
import { getContact } from '../services/contactStore.js';

export default {
  name: 'trust',
  aliases: ['trusted', 'untrust', 'perms', 'permissions'],
  description: 'Gère les permissions des membres autorisés à utiliser /warn et /texte',
  async execute({ sock, msg, jid, args, isOwner }) {
    // Seul le propriétaire peut modifier les permissions du bot
    if (!isOwner) {
      return;
    }

    const sub = (args[0] || '').toLowerCase();

    // 1. Lister les permissions : /trust list ou /trusted
    if (!sub || sub === 'list' || sub === 'liste') {
      const { trusted, revoked } = getAllPermissions();

      const lines = [
        '🔐 *GESTION DES PERMISSIONS ZYBOT*',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '⭐ *Membres de confiance (Trusted) :*',
        trusted.length === 0 ? '_(Aucun membre ajouté manuellement)_' : ''
      ];

      trusted.forEach((u, i) => {
        lines.push(`*${i + 1}.* ${u.name || 'Inconnu'} • \`+${u.number}\``);
      });

      lines.push('');
      lines.push('🚫 *Membres expressément révoqués :*');
      if (revoked.length === 0) {
        lines.push('_(Aucun membre révoqué)_');
      } else {
        revoked.forEach((u, i) => {
          lines.push(`*${i + 1}.* ${u.name || 'Inconnu'} • \`+${u.number}\``);
        });
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('💡 *Commandes :*');
      lines.push('• `/trust @membre` ou `/trust <num>` : autoriser');
      lines.push('• `/untrust @membre` ou `/untrust <num>` : révoquer');
      lines.push('• `/trust remove <num>` : supprimer des listes');

      await replyOrEdit(sock, jid, msg, lines.filter(Boolean).join('\n'));
      return;
    }

    // Détecter la cible : argument, mention, ou message cité
    let target = null;
    let action = 'trust'; // trust, untrust, remove

    if (sub === 'remove' || sub === 'del' || sub === 'delete') {
      action = 'remove';
      target = args[1];
    } else if (sub === 'revoke' || sub === 'ban' || msg.message?.conversation?.startsWith('/untrust')) {
      action = 'untrust';
      target = args[1] || args[0];
    } else {
      target = args[0];
    }

    const rawContent = msg.message;
    const normalized = normalizeMessageContent(rawContent) || rawContent;
    const contextInfo =
      normalized?.extendedTextMessage?.contextInfo ||
      normalized?.[Object.keys(normalized || {})[0]]?.contextInfo;

    // Cible via mention
    if (contextInfo?.mentionedJid && contextInfo.mentionedJid.length > 0) {
      target = contextInfo.mentionedJid[0];
    }

    // Cible via message cité
    if (!target && contextInfo?.participant) {
      target = contextInfo.participant;
    }

    if (!target) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        '⚠️ Précisez une cible : `/trust @membre`, `/trust <numéro>` ou répondez au message de la personne.'
      );
      return;
    }

    const cleanNum = String(target).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (!cleanNum || cleanNum.length < 6) {
      await replyOrEdit(sock, jid, msg, '❌ Numéro de téléphone ou identifiant WhatsApp invalide.');
      return;
    }

    const contact = getContact(cleanNum);
    const displayName = contact?.notify || contact?.name || `+${cleanNum}`;

    if (action === 'remove') {
      removeTrustedUser(cleanNum);
      unrevokeUser(cleanNum);
      await replyOrEdit(
        sock,
        jid,
        msg,
        `✅ Le membre *${displayName}* (\`+${cleanNum}\`) a été retiré des listes de permissions.`
      );
      return;
    }

    if (action === 'untrust') {
      revokeUser({ target: cleanNum, name: displayName });
      await replyOrEdit(
        sock,
        jid,
        msg,
        `🚫 *Accès révoqué* : Le membre *${displayName}* (\`+${cleanNum}\`) ne peut plus utiliser \`/warn\` ni \`/texte\`.`
      );
      return;
    }

    // Action par défaut : Trust
    addTrustedUser({ target: cleanNum, name: displayName });
    await replyOrEdit(
      sock,
      jid,
      msg,
      `⭐ *Accès accordé* : Le membre *${displayName}* (\`+${cleanNum}\`) peut désormais utiliser \`/warn\` et \`/texte\` sur ZyBot.`
    );
  }
};
