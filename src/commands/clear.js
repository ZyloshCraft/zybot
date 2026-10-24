import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { getRecentKeys, removeTrackedKey } from '../services/messageStore.js';
import { sleep, getRandomDelay, replyOrEdit } from '../utils/stealth.js';

export default {
  name: 'clear',
  description: 'Supprime vos messages (pour tous avec "all", ou pour vous avec "me")',
  async execute({ sock, msg, jid, args }) {
    let count = 0;
    let mode = 'all'; // Défaut : 'all' (supprimer pour tout le monde)

    // Vérifier si l'utilisateur a cité un message pour délimiter la suppression
    const msgContent = msg.message;
    const contextInfo =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;
    const quotedId = contextInfo?.stanzaId || null;

    // Parser les arguments
    for (const arg of args) {
      const lower = arg.toLowerCase();
      if (lower === 'all' || lower === 'tous' || lower === 'everyone') {
        mode = 'all';
      } else if (lower === 'me' || lower === 'moi') {
        mode = 'me';
      } else {
        const parsed = parseInt(arg, 10);
        if (!isNaN(parsed) && parsed > 0) {
          count = parsed;
        }
      }
    }

    // Si aucun nombre n'est donné mais qu'un message est cité, supprimer depuis ce message
    if (count <= 0 && quotedId) {
      count = 100;
    } else if (count <= 0) {
      count = 1; // Par défaut : supprimer le dernier message
    }

    // Plafond de sécurité élargi (jusqu'à 200 messages)
    if (count > 200) {
      count = 200;
    }

    const normJid = jidNormalizedUser(jid);

    // Récupérer les clés (+1 pour inclure la commande /clear elle-même si présente)
    const tracked = getRecentKeys(normJid, count + 1, mode, quotedId);

    if (!tracked.length) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        `Aucun message trouvé à supprimer en mode "${mode}".`
      );
      return;
    }

    // Inverser pour supprimer du plus récent au plus ancien
    const toDelete = [...tracked].reverse();
    let deletedCount = 0;

    for (let i = 0; i < toDelete.length; i++) {
      const item = toDelete[i];
      try {
        if (mode === 'me') {
          // Supprimer pour moi
          const ts = item.timestamp ? Math.floor(item.timestamp / 1000) : Math.floor(Date.now() / 1000);
          await sock.chatModify(
            {
              deleteForMe: {
                timestamp: ts,
                key: item.key,
                deleteMedia: false
              }
            },
            normJid
          );
        } else {
          // Supprimer pour tout le monde (delete revoke)
          await sock.sendMessage(normJid, { delete: item.key });
        }

        removeTrackedKey(normJid, item.key.id);
        deletedCount++;
      } catch (err) {
        console.warn(`[Clear] Impossible de supprimer le message ${item.key?.id}:`, err.message);
      }

      // Intervalle fluide anti-flag (400ms à 900ms)
      if (i < toDelete.length - 1) {
        await sleep(getRandomDelay(400, 900));
      }
    }

    console.log(`[Clear] ${deletedCount} messages supprimés avec succès en mode "${mode}" dans ${normJid}`);
  }
};
