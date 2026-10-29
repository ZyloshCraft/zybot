import { parseGiveawayDuration, formatRemainingTime, createGiveaway } from '../services/giveawayStore.js';
import { replyOrEdit } from '../utils/stealth.js';

export default {
  name: 'gw',
  aliases: ['giveaway'],
  description: 'Lance un tirage au sort (giveaway) avec inscription par réaction emoji et compte à rebours',
  async execute({ sock, msg, jid, args }) {
    const rawArgs = args.join(' ').trim();

    if (!rawArgs || !rawArgs.includes(';')) {
      const helpText = [
        '🎉 *MODULE GIVEAWAY — ZYBOT*',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Créez un tirage au sort automatique avec inscription par réaction emoji !',
        '',
        '👉 *Syntaxe :*',
        '   `/gw <Lot à gagner> ; <Durée>`',
        '',
        '📌 *Exemples :*',
        '   • `/gw Discord Nitro 1 mois ; 24h`',
        '   • `/gw Rôle VIP Exclusif ; 2j`',
        '   • `/gw Compte Spotify Premium ; 30m`',
        '   • `/gw 5000 Crédits Serveur ; 12h`',
        '',
        '⏱️ *Unités de temps acceptées :*',
        '   • `m` (minutes), `h` (heures), `j` ou `d` (jours)',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '💡 _Les membres s\'inscrivent en réagissant avec un emoji au message. Ils reçoivent un DM dont le compte à rebours s\'actualise chaque heure !_',
        '⚡ _ZyBot Community_'
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
      '🎉 *GIVEAWAY — NOUVEAU TIRAGE AU SORT !*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `🎁 *Lot à gagner :* ${prize}`,
      `⏱️ *Temps restant :* ${timeStr} _(Fin : ${endFormatted})_`,
      '',
      '👉 *Comment participer ?*',
      'Réagissez avec un emoji (ex: 🎉, ❤️, 🚀) directement à ce message pour vous inscrire !',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '👥 *Participants inscrits :* 0',
      '⚡ _ZyBot Community Giveaway_'
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
