import { getConfig } from '../config.js';
import { replyOrEditTemporary } from '../utils/stealth.js';

export function getWarnHelpGuide(p = '/') {
  return [
    '🛡️ *GUIDE MODÉRATEUR : MAÎTRISER LE /WARN*',
    '━━━━━━━━━━━━━━━━━━━━',
    'Le système de modération est conçu pour être *100% discret* : aucun message n\'est posté dans le groupe public ni en DM à la personne avertie. Toutes les alertes sont transmises dans *admintaverne*.\n',
    '📌 *1. METTRE UN AVERTISSEMENT (3 MÉTHODES) :*',
    `• *Méthode 1 (La plus rapide) :* Répondez au message du membre fautif avec :`,
    `  \`${p}warn [raison]\` (ou \`${p}av [raison]\`)`,
    `  _Exemple : \`${p}warn Spam de stickers\`_\n`,
    `• *Méthode 2 (Par mention) :*`,
    `  \`${p}warn @membre [raison]\``,
    `  _Exemple : \`${p}warn @Hugo Insultes répétées\`_\n`,
    `• *Méthode 3 (Par ID / Code) :*`,
    `  \`${p}warn <ID ou pseudo> [raison]\``,
    `  _Exemple : \`${p}warn 218193348006100 Pub non autorisée\`_\n`,
    '🔍 *2. OBTENIR L\'ID D\'UN MEMBRE EN PRIVÉ :*',
    `• Répondez à n'importe quel message d'un membre avec :`,
    `  \`${p}id\``,
    `  _➔ Le bot vous envoie immédiatement son identifiant par message privé sans rien afficher dans le groupe public._\n`,
    '📋 *3. CONSULTER LES AVERTISSEMENTS :*',
    `• \`${p}warn list\` : Liste dans admintaverne tous les membres ayant des avertissements actifs.`,
    `• \`${p}warn list @membre\` (ou avec son ID) : Affiche l'historique précis (dates, raisons, admins émetteurs).\n`,
    '🗑️ *4. EFFACER LES AVERTISSEMENTS :*',
    `• Répondez au message d'un membre avec \`${p}warn del\``,
    `• Ou tapez \`${p}warn del @membre\` (ou \`${p}warn del <ID>\`)`,
    `  _➔ Tous ses avertissements sont remis à zéro avec confirmation dans admintaverne._\n`,
    '🔄 *5. SYNCHRONISATION DES MEMBRES DU GROUPE :*',
    `• \`${p}warn scan\` : Analyse la liste des participants de la Taverne en direct pour synchroniser leurs identifiants.`,
    '━━━━━━━━━━━━━━━━━━━━',
    '💡 *Rappel :* Dès qu\'un warn est émis, vous êtes automatiquement mentionné (@Admin) dans le rapport envoyé sur *admintaverne*.'
  ].join('\n');
}

export default {
  name: 'help',
  aliases: ['aide', 'menu'],
  description: 'Liste organisée de toutes les commandes disponibles ou guide spécifique',
  adminOnly: true,
  async execute({ sock, msg, jid, args, isOwner, isAdmin }) {
    const config = getConfig();
    const p = config.prefix || '/';
    const sub = args[0]?.toLowerCase();

    // 1. Guide spécifique pour le /warn (/help warn ou /help av)
    if (sub === 'warn' || sub === 'av' || sub === 'avertir' || sub === 'moderation') {
      const guideText = getWarnHelpGuide(p);
      const adminJid = msg.key.participant || msg.key.remoteJid;

      if (!isOwner && jid.endsWith('@g.us')) {
        // Envoi en privé à l'admin pour ne pas polluer le groupe
        try {
          await sock.sendMessage(adminJid, { text: guideText });
        } catch {
          await replyOrEditTemporary(sock, jid, msg, guideText, 20000);
        }
        return;
      }

      await replyOrEditTemporary(sock, jid, msg, guideText, 30000);
      return;
    }

    // 2. Si c'est un administrateur tiers qui tape /help dans un groupe, envoyer le menu admin
    if (!isOwner && isAdmin) {
      const adminMenu = [
        '🛡️ *ZyBot — Commandes Administrateur*',
        '━━━━━━━━━━━━━━━━━━━━',
        `• ${p}warn [raison] : Avertit discrètement un membre (alias: ${p}av)`,
        `• ${p}warn list [@membre] : Consulte les avertissements`,
        `• ${p}warn del [@membre] : Réinitialise les avertissements`,
        `• ${p}id : Répondez à un message pour recevoir l'identifiant du membre en privé`,
        `• ${p}help warn : Guide complet d'utilisation du /warn`,
        '━━━━━━━━━━━━━━━━━━━━',
        '💡 _Ces commandes s\'exécutent sans aucun bruit dans les groupes publics._'
      ].join('\n');

      const adminJid = msg.key.participant || msg.key.remoteJid;
      try {
        await sock.sendMessage(adminJid, { text: adminMenu });
      } catch {
        await replyOrEditTemporary(sock, jid, msg, adminMenu, 15000);
      }
      return;
    }

    // 3. Menu complet du propriétaire (32 commandes)
    const text = [
      '🤖 *ZyBot — Menu des Commandes*',
      '━━━━━━━━━━━━━━━━━━━━',
      '✨ *OUTILS & MÉDIAS DU QUOTIDIEN :*',
      `• ${p}s : Convertit une image ou vidéo en sticker WhatsApp`,
      `• ${p}toimg : Convertit un sticker cité en photo standard ou vidéo animée`,
      `• ${p}music <titre> : Télécharge une musique en MP3 haute qualité (alias: ${p}mp3)`,
      `• ${p}dl <lien> : Télécharge une vidéo TikTok, Insta, Twitter, YouTube (avec progressbar)`,
      `• ${p}pfp [@membre|groupe] : Récupère la photo de profil en pleine résolution (alias: ${p}pp)`,
      `• ${p}texte : Transcrit une note vocale en texte (alias: ${p}transcrire)`,
      `• ${p}resume [nb] : Résumé IA ultra-rapide des échanges (défaut 50, max 200)`,
      `• ${p}top [nb] : Classement des membres les plus actifs par messages envoyés`,
      `• ${p}gw <lot> ; <durée> : Tirage au sort avec inscription par réaction (alias: ${p}giveaway)`,
      `• ${p}export [nb] : Archive la discussion en fichier texte (.txt) dans notifds`,
      `• ${p}persoping : Sauvegarde message cité avec date/heure exacte (alias: ${p}save)`,
      `• ${p}vv : Capture discrètement une vue unique en clair`,
      `• ${p}statut [cible|id@lid] : Archive les stories d'un contact ou identifiant LID`,
      `• ${p}whois [@contact|numéro] : Fiche profil complète (Photo HD, bio, groupes)`,
      `• ${p}temp <temps|off> : Auto-destruction de vos messages (ex: 5m, 1h)`,
      `• ${p}clear <nb> [all|me] : Supprime vos messages instantanément`,
      `• ${p}edit <texte> : Modifie votre message récent directement`,
      `• ${p}translate [lang] [texte] : Traduction instantanée`,
      `• ${p}calc <calcul> : Calculatrice rapide (ex: 25*4+10)`,
      `• ${p}meteo [ville] : Météo en direct`,
      '',
      '⚙️ *ADMINISTRATION & GESTION DU BOT :*',
      `• ${p}warn [@membre|list|del] : Gestion des avertissements (alias: ${p}av)`,
      `• ${p}help warn : Guide complet de modération pour les admins`,
      `• ${p}id : Affiche l'ID unique de la discussion ou envoie l'ID d'un membre en DM`,
      `• ${p}trust [add|del|list] : Gère les autorisations accordées aux membres (/warn, /texte)`,
      `• ${p}antinsfw [check|on|off] : Filtre et scan IA Anti-NSFW dans vos groupes`,
      `• ${p}alias [list|add|del] : Affiche et gère vos alias de groupes`,
      `• ${p}groupe : Liste vos groupes WhatsApp et leurs IDs`,
      `• ${p}program : Assistant interactif de message programmé`,
      `• ${p}alert [list|add|del|ignore] : Alertes mots-clés & blacklist trolls`,
      `• ${p}dnd [on|off|2h|23h 06h] : Mode Ne Pas Déranger (silence la nuit)`,
      `• ${p}recap : Statistiques d'activité du jour`,
      `• ${p}ntfy <canal|off> : Notifications push sonores/vibrantes smartphone`,
      `• ${p}update [force|on|off] : Mises à jour automatiques depuis GitHub`,
      `• ${p}reboot : Redémarre le bot`,
      `• ${p}bot : Statut, uptime, performances et version`,
      '━━━━━━━━━━━━━━━━━━━━'
    ].join('\n');

    await replyOrEditTemporary(sock, jid, msg, text, 10000);
  }
};
