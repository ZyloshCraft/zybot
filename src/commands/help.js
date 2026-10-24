import { getConfig } from '../config.js';
import { replyOrEditTemporary } from '../utils/stealth.js';

export default {
  name: 'help',
  description: 'Liste compacte des commandes disponibles',
  async execute({ sock, msg, jid }) {
    const config = getConfig();
    const prefix = config.prefix || '/';

    const text = [
      'Commandes disponibles :',
      `• ${prefix}translate [lang] [texte] : Traduit (ou en réponse)`,
      `• ${prefix}persoping : Sauvegarde le message cité en privé (auto-delete 5s)`,
      `• ${prefix}vv : Capture vue unique en privé (zéro trace)`,
      `• ${prefix}vocal <texte> [lang] : Envoie une vraie note vocale`,
      `• ${prefix}edit <nouveau texte> : Modifie le message cité`,
      `• ${prefix}clear <nb> [all|me] : Supprime vos messages`,
      `• ${prefix}poll <question> | <choix1> | <choix2> : Sondage`,
      `• ${prefix}tagall [msg] : Mentionne tout le groupe`,
      `• ${prefix}alert [list|add|del|on|off] : Alertes mots-clés`,
      `• ${prefix}program <msg> | <date> : Envoi programmé`,
      `• ${prefix}vacances [on|off|msg] : Répondeur d'absence`,
      `• ${prefix}reboot : Redémarre le bot avec les modifications`,
      `• ${prefix}bot : Statut et performances`
    ].join('\n');

    await replyOrEditTemporary(sock, jid, msg, text, 8000);
  }
};
