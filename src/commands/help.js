import { getConfig } from '../config.js';
import { replyOrEditTemporary } from '../utils/stealth.js';

export default {
  name: 'help',
  description: 'Liste compacte des commandes disponibles',
  async execute({ sock, msg, jid }) {
    const config = getConfig();
    const prefix = config.prefix || '/';

    const text = [
      '🤖 *ZyBot — Commandes disponibles :*',
      `• ${prefix}resume [nb] : Résumé IA ultra-rapide des derniers messages (mode éco)`,
      `• ${prefix}warn [@membre|list|del] : Avertit un membre (alertes admintaverne & notifs)`,
      `• ${prefix}ban [@membre] [raison] : Bannit un membre avec DM explicatif`,
      `• ${prefix}translate [lang] [texte] : Traduction instantanée`,
      `• ${prefix}s : Convertit une image ou vidéo en sticker WhatsApp`,
      `• ${prefix}dl <lien> : Télécharge une vidéo TikTok, Insta, Twitter, YouTube`,
      `• ${prefix}texte : Transcrit une note vocale citée en texte écrit`,
      `• ${prefix}export [nb] : Archive la discussion en fichier texte dans notifds`,
      `• ${prefix}persoping : Sauvegarde message cité avec date/heure`,
      `• ${prefix}vv : Capture vue unique en clair en privé`,
      `• ${prefix}edit <nouveau texte> : Modifie votre message cité`,
      `• ${prefix}clear <nb> [all|me] : Supprime vos messages instantanément`,
      `• ${prefix}temp <temps|off> : Auto-destruction de vos messages (ex: 5m, 1h)`,
      `• ${prefix}recap : Statistiques du jour (messages, suppressions, alertes)`,
      `• ${prefix}ntfy <canal|off> : Notifications push smartphone avec son/vibration`,
      `• ${prefix}update [on|off] : Vérifie et applique les mises à jour GitHub`,
      `• ${prefix}calc <calcul> : Calculatrice rapide (ex: 25*4+10)`,
      `• ${prefix}rappel <msg> | <temps> : Rappel privé (+15m, 14:00)`,
      `• ${prefix}id : Affiche l'ID unique du groupe ou chat`,
      `• ${prefix}groupe [alias <nom>] : Gère et nomme vos groupes`,
      `• ${prefix}meteo [ville] : Météo en direct`,
      `• ${prefix}poll <question> | <opt1> | <opt2> : Crée un sondage`,
      `• ${prefix}tagall [msg] : Mentionne tout le groupe`,
      `• ${prefix}alert [list|add|del|ignore] : Alertes mots-clés & blacklist troll`,
      `• ${prefix}dnd [on|off|2h|23h 06h] : Mode Ne Pas Déranger (silence la nuit)`,
      `• ${prefix}whois [@contact|numéro] : Dossier profil complet (Photo HD, bio, groupes)`,
      `• ${prefix}statut [numéro] : Archive les stories/statuts d'un contact`,
      `• ${prefix}program : Assistant guidé (ou direct: <msg> | <date> [| groupe])`,
      `• ${prefix}reboot : Redémarre le bot`,
      `• ${prefix}bot : Statut et performances`
    ].join('\n');

    await replyOrEditTemporary(sock, jid, msg, text, 8000);
  }
};
