import { getConfig, updateConfig } from '../config.js';
import { sendStealthMessage } from '../utils/stealth.js';

export async function handleAutoReply({ sock, msg, jid }) {
  const config = getConfig();

  // 1. Vérifier si le mode vacances est actif
  if (!config.vacances?.enabled) {
    return;
  }

  // 2. Ne jamais répondre à ses propres messages
  if (msg.key.fromMe) {
    return;
  }

  // 3. Filtrer les canaux, groupes, statuts et newsletters
  if (
    !jid ||
    jid.endsWith('@g.us') ||
    jid.includes('@broadcast') ||
    jid.endsWith('@newsletter')
  ) {
    return;
  }

  // 4. Vérifier le cooldown anti-spam pour ce contact (par défaut 2h)
  const now = Date.now();
  const cooldownMs = (config.vacances.cooldownMinutes || 120) * 60 * 1000;
  const lastReplyTime = config.vacancesLog?.[jid] || 0;

  if (now - lastReplyTime < cooldownMs) {
    // Déjà répondu récemment à ce contact, on ignore silencieusement
    return;
  }

  // 5. Mettre à jour l'historique d'envoi pour ce contact
  updateConfig((prev) => ({
    ...prev,
    vacancesLog: {
      ...prev.vacancesLog,
      [jid]: now
    }
  }));

  console.log(`[AutoReply] Réponse automatique de vacances envoyée à ${jid}`);

  // 6. Envoi avec présence humaine et jitter aléatoire
  try {
    await sendStealthMessage(
      sock,
      jid,
      { text: config.vacances.message },
      { quoted: msg }
    );
  } catch (err) {
    console.error(`[AutoReply] Erreur lors de l'envoi de la réponse à ${jid}:`, err);
  }
}
