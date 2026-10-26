import { getConfig } from '../config.js';
import { replyOrEditTemporary } from '../utils/stealth.js';

export default {
  name: 'help',
  description: 'Liste organisée de toutes les commandes disponibles',
  async execute({ sock, msg, jid }) {
    const config = getConfig();
    const p = config.prefix || '/';

    const text = [
      '🤖 *ZyBot — Menu des Commandes*',
      '━━━━━━━━━━━━━━━━━━━━',
      '✨ *OUTILS & MÉDIAS DU QUOTIDIEN :*',
      `• ${p}s : Convertit une image ou vidéo en sticker WhatsApp`,
      `• ${p}dl <lien> : Télécharge une vidéo TikTok, Insta, Twitter, YouTube`,
      `• ${p}texte : Transcrit une note vocale en texte (alias: ${p}transcrire)`,
      `• ${p}resume [nb] : Résumé IA ultra-rapide des échanges (défaut 50, max 200)`,
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
      `• ${p}antinsfw [check|on|off] : Filtre et scan IA Anti-NSFW dans vos groupes`,
      `• ${p}alias [list|add|del] : Affiche et gère vos alias de groupes`,
      `• ${p}groupe : Liste vos groupes WhatsApp et leurs IDs`,
      `• ${p}id : Affiche l'ID unique de la discussion courante`,
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
