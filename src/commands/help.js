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
      `• ${prefix}translate [lang] [texte] : Traduction instantanée`,
      `• ${prefix}persoping : Sauvegarde message cité avec date/heure`,
      `• ${prefix}vv : Capture vue unique en clair en privé`,
      `• ${prefix}vocal <texte> [lang] : Envoie une vraie note vocale`,
      `• ${prefix}edit <nouveau texte> : Modifie votre message cité`,
      `• ${prefix}clear <nb> [all|me] : Supprime vos messages`,
      `• ${prefix}calc <calcul> : Calculatrice rapide (ex: 25*4+10)`,
      `• ${prefix}rappel <msg> | <temps> : Rappel privé (+15m, 14:00)`,
      `• ${prefix}meteo [ville] : Météo en direct`,
      `• ${prefix}crypto [btc|eth...] : Cours crypto en direct`,
      `• ${prefix}poll <question> | <opt1> | <opt2> : Crée un sondage`,
      `• ${prefix}tagall [msg] : Mentionne tout le groupe`,
      `• ${prefix}alert [list|add|del|on|off] : Alertes mots-clés`,
      `• ${prefix}program : Assistant interactif guidé (ou direct: <msg> | <date> [| numéro])`,
      `• ${prefix}vacances [on|off|msg] : Répondeur d'absence`,
      `• ${prefix}reboot : Redémarre le bot`,
      `• ${prefix}bot : Statut et performances`
    ].join('\n');

    await replyOrEditTemporary(sock, jid, msg, text, 8000);
  }
};
