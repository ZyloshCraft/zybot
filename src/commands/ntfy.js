import { getConfig, updateConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { sendNtfyNotification } from '../services/ntfy.js';
import { notifySystem } from '../services/notifier.js';

export default {
  name: 'ntfy',
  aliases: ['push', 'notif'],
  description: 'Active les notifications push sur votre smartphone avec l\'application ntfy',
  async execute({ sock, msg, jid, args }) {
    const config = getConfig();
    const current = config.ntfy || {};
    const sub = args[0]?.trim();

    // 1. Désactiver (/ntfy off)
    if (sub?.toLowerCase() === 'off' || sub?.toLowerCase() === 'stop') {
      updateConfig((prev) => ({
        ...prev,
        ntfy: { ...prev.ntfy, enabled: false }
      }));
      await notifySystem(sock, '🗑️ Notifications push smartphone : désactivées');
      await replyOrEdit(sock, jid, msg, '🔕 Notifications push smartphone désactivées.');
      return;
    }

    // 2. Statut actuel sans argument (/ntfy)
    if (!sub || sub.toLowerCase() === 'status') {
      if (current.enabled && current.topic) {
        await replyOrEdit(
          sock,
          jid,
          msg,
          `🔔 Notifications push smartphone *ACTIVES* !\n• Canal : \`${current.topic}\`\n• Application : ntfy\n💡 Pour changer de canal : \`/ntfy <nouveau_nom>\`\n💡 Pour désactiver : \`/ntfy off\``
        );
      } else {
        await replyOrEdit(
          sock,
          jid,
          msg,
          '🔕 Notifications push smartphone *INACTIVES*.\n\n📲 *Pour activer :*\n1. Dans l\'application ntfy, touchez `+` et choisissez un nom de canal (ex: `zybot-monnom`).\n2. Tapez ici : `/ntfy zybot-monnom`'
        );
      }
      return;
    }

    // 3. Définir le topic (/ntfy <nom_du_topic>)
    const topic = sub.replace(/^https?:\/\/ntfy\.sh\//i, '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!topic || topic.length < 3) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        '⚠️ Le nom du canal ntfy doit contenir au moins 3 caractères (lettres, chiffres, tirets). Exemple : `/ntfy zybot-valentin`'
      );
      return;
    }

    updateConfig((prev) => ({
      ...prev,
      ntfy: {
        enabled: true,
        topic
      }
    }));

    // Envoyer une notification de test immédiate sur le téléphone
    await sendNtfyNotification({
      title: '✅ Connexion ZyBot Réussie !',
      message: 'Votre smartphone est maintenant connecté à ZyBot. Vous recevrez ici les alertes mots-clés et messages supprimés avec sonnerie et vibration !',
      priority: 'high',
      tags: ['tada', 'white_check_mark', 'bell']
    });

    await notifySystem(sock, `✅ Notifications push : activées sur le canal "${topic}"`);

    await replyOrEdit(
      sock,
      jid,
      msg,
      `🔔 Notifications push smartphone *ACTIVÉES* sur le canal \`${topic}\` !\nUn message de test avec sonnerie vient d'être envoyé sur votre application ntfy.`
    );
  }
};
