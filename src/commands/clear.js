import { getRecentKeys, removeTrackedKey } from '../services/messageStore.js';
import { sleep, getRandomDelay, replyOrEdit } from '../utils/stealth.js';

export default {
  name: 'clear',
  description: 'Supprime vos messages (pour tous avec "all", ou pour vous avec "me")',
  async execute({ sock, msg, jid, args }) {
    let count = 0;
    let mode = 'all'; // Défaut : 'all' (supprimer pour tout le monde)

    // Déterminer count et mode
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

    if (count <= 0) {
      await replyOrEdit(sock, jid, msg, 'Usage : /clear <nombre> [all|me]');
      return;
    }

    if (count > 50) {
      await replyOrEdit(sock, jid, msg, 'Limite : maximum 50 messages par /clear.');
      return;
    }

    // Récupérer les clés récentes (+1 pour inclure la commande /clear elle-même si présente)
    const tracked = getRecentKeys(jid, count + 1, mode);

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
            jid
          );
        } else {
          // Supprimer pour tout le monde (delete revoke)
          await sock.sendMessage(jid, { delete: item.key });
        }
        removeTrackedKey(jid, item.key.id);
      } catch (err) {
        console.warn(`[Clear] Impossible de supprimer le message ${item.key.id}:`, err.message);
      }

      // Intervalle aléatoire anti-flag entre 800ms et 1600ms
      if (i < toDelete.length - 1) {
        await sleep(getRandomDelay(800, 1600));
      }
    }
  }
};
