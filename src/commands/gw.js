import {
  parseGiveawayDuration,
  formatRemainingTime,
  createGiveaway,
  finishGiveaway,
  rerollGiveaway,
  getActiveGiveawayForGroup,
  getLatestGiveawayForGroup,
  getGiveawayByMessageId
} from '../services/giveawayStore.js';
import { replyOrEdit } from '../utils/stealth.js';

export default {
  name: 'gw',
  aliases: ['giveaway'],
  description: 'Lance un tirage au sort (giveaway) avec inscription par réaction emoji, /gw end et /gw reroll',
  async execute({ sock, msg, jid, args }) {
    const subCommand = args[0]?.toLowerCase();

    const msgContent = msg.message;
    const contextInfo =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;
    const quotedStanzaId = contextInfo?.stanzaId;

    // 1. COMMANDE /gw end (ou stop, terminer)
    if (subCommand === 'end' || subCommand === 'stop' || subCommand === 'terminer') {
      let targetGw = quotedStanzaId ? getGiveawayByMessageId(quotedStanzaId) : null;
      if (!targetGw) {
        targetGw = getActiveGiveawayForGroup(jid);
      }

      if (!targetGw || targetGw.status !== 'active') {
        return await replyOrEdit(sock, jid, msg, '❌ *Aucun giveaway actif trouvé dans cette discussion.*');
      }

      await finishGiveaway(sock, targetGw.id);

      if (msg.key.fromMe) {
        try {
          await sock.sendMessage(jid, { delete: msg.key });
        } catch (e) {}
      }
      return;
    }

    // 2. COMMANDE /gw reroll (ou relancer, roll)
    if (subCommand === 'reroll' || subCommand === 'relancer' || subCommand === 'roll') {
      let targetGw = quotedStanzaId ? getGiveawayByMessageId(quotedStanzaId) : null;
      if (!targetGw) {
        targetGw = getLatestGiveawayForGroup(jid);
      }

      if (!targetGw) {
        return await replyOrEdit(sock, jid, msg, '❌ *Aucun giveaway trouvé dans cette discussion.*');
      }

      const res = await rerollGiveaway(sock, targetGw.id);
      if (!res.success) {
        if (res.reason === 'no_participants') {
          return await replyOrEdit(sock, jid, msg, '❌ *Impossible de relancer : aucun participant inscrit.*');
        }
        return await replyOrEdit(sock, jid, msg, '❌ *Erreur lors du tirage au sort (reroll).*');
      }

      if (msg.key.fromMe) {
        try {
          await sock.sendMessage(jid, { delete: msg.key });
        } catch (e) {}
      }
      return;
    }

    // 3. CRÉATION D'UN GIVEAWAY : /gw <Lot> ; <Durée>
    const rawArgs = args.join(' ').trim();

    if (!rawArgs || !rawArgs.includes(';')) {
      const helpText = [
        '🎉 *MODULE GIVEAWAY*',
        '━━━━━━━━━━━━━━━━━━━━',
        '👉 *Commandes disponibles :*',
        '• `/gw <Lot> ; <Durée>` : Lancer un giveaway',
        '• `/gw end` : Terminer immédiatement et tirer le sort',
        '• `/gw reroll` : Tirer un nouveau gagnant au sort',
        '',
        '📌 *Exemples de création :*',
        '• `/gw Discord Nitro 1 mois ; 24h`',
        '• `/gw Rôle VIP Exclusif ; 2j`',
        '• `/gw Compte Spotify Premium ; 30m`',
        '',
        '⏱️ *Unités :* `m` (minutes), `h` (heures), `j` / `d` (jours)',
        '💡 _Répondez à un giveaway avec `/gw end` ou `/gw reroll` pour cibler un message spécifique._'
      ].join('\n');

      return await replyOrEdit(sock, jid, msg, helpText);
    }

    // Découper sur le premier point-virgule
    const parts = rawArgs.split(';');
    const prize = parts[0].trim();
    const durationInput = parts.slice(1).join(';').trim();

    if (!prize) {
      return await replyOrEdit(sock, jid, msg, '❌ *Veuillez spécifier un lot à gagner !* Exemple : `/gw Discord Nitro ; 24h`');
    }

    const parsed = parseGiveawayDuration(durationInput);
    if (!parsed) {
      return await replyOrEdit(
        sock,
        jid,
        msg,
        '❌ *Durée invalide !* Utilisez par exemple `30m`, `2h`, `24h` ou `3j`.'
      );
    }

    const endsAt = Date.now() + parsed.durationMs;
    const endFormatted = new Date(endsAt).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    const timeStr = formatRemainingTime(parsed.durationMs);

    const announcement = [
      '🎉 *GIVEAWAY*',
      '━━━━━━━━━━━━━━━━━━━━',
      `🎁 *Lot :* ${prize}`,
      `⏱️ *Temps restant :* ${timeStr} _(Fin : ${endFormatted})_`,
      '👥 *Participants :* 0',
      '',
      '👉 Réagissez avec un emoji pour participer !'
    ].join('\n');

    // Envoyer le message d'annonce officiel dans le groupe
    const sentMsg = await sock.sendMessage(jid, { text: announcement });

    // Enregistrer le giveaway dans le store et démarrer les timers
    createGiveaway({
      groupJid: jid,
      messageId: sentMsg.key.id,
      messageKey: sentMsg.key,
      prize,
      durationMs: parsed.durationMs,
      creatorJid: msg.key.participant || jid
    });

    // Supprimer discrètement la commande de l'expéditeur si furtif
    if (msg.key.fromMe) {
      try {
        await sock.sendMessage(jid, { delete: msg.key });
      } catch (e) {}
    }
  }
};
