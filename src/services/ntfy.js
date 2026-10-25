import { getConfig } from '../config.js';

const PRIORITY_MAP = {
  urgent: 5,
  high: 4,
  default: 3,
  low: 2,
  min: 1
};

/**
 * Vérifie si le mode "Ne Pas Déranger" (DND) est actuellement actif.
 * Horaires par défaut : 23h00 à 06h00.
 * @param {Date} [checkDate=new Date()]
 * @returns {boolean}
 */
export function isDndActive(checkDate = new Date()) {
  const config = getConfig();
  const dnd = config.dnd;
  if (!dnd || dnd.enabled === false) return false;

  const now = checkDate;

  // 1. DND temporaire jusqu'à une heure précise (/dnd 2h)
  if (dnd.until && typeof dnd.until === 'number') {
    if (now.getTime() < dnd.until) return true;
  }

  // 2. Plage horaire récurrente (défaut : 23:00 à 06:00)
  const startStr = dnd.start || '23:00';
  const endStr = dnd.end || '06:00';

  const [startHour, startMin] = startStr.split(':').map((n) => parseInt(n, 10));
  const [endHour, endMin] = endStr.split(':').map((n) => parseInt(n, 10));

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = (startHour || 0) * 60 + (startMin || 0);
  const endMinutes = (endHour || 0) * 60 + (endMin || 0);

  // Cas où la plage traverse minuit (ex: 23:00 à 06:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  } else {
    // Cas dans la même journée (ex: 14:00 à 18:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
}

/**
 * Envoie une notification push instantanée sur le smartphone via ntfy.sh (en JSON UTF-8)
 * Respecte le mode Ne Pas Déranger (DND) : silencieux entre 23h00 et 06h00.
 * @param {object} params
 * @param {string} params.title - Titre de la notification (avec emojis supportés)
 * @param {string} params.message - Corps du message
 * @param {'urgent' | 'high' | 'default' | 'low' | 'min' | number} [params.priority='default']
 * @param {string[] | string} [params.tags=[]] - Emojis/tags ntfy (ex: ['warning', 'wastebasket'])
 * @param {boolean} [params.bypassDnd=false] - Forcer l'envoi même si DND est actif
 */
export async function sendNtfyNotification({ title, message, priority = 'default', tags = [], bypassDnd = false }) {
  const config = getConfig();
  if (!config.ntfy?.enabled || !config.ntfy?.topic) return;

  const topic = config.ntfy.topic.trim();
  if (!topic) return;

  // Si le mode DND est actif et qu'on ne force pas l'alerte
  if (!bypassDnd && isDndActive()) {
    console.log('[ntfy] Notification silencieuse (Mode Ne Pas Déranger / DND actif).');
    return;
  }

  const prioNumber = typeof priority === 'number' ? priority : (PRIORITY_MAP[priority] || 3);
  const tagList = Array.isArray(tags) ? tags : (tags ? [tags] : []);

  try {
    const res = await fetch('https://ntfy.sh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        topic,
        title: title || 'ZyBot Notification',
        message: message || '',
        priority: prioNumber,
        tags: tagList
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[ntfy] Erreur serveur HTTP ${res.status}: ${errText}`);
    }
  } catch (err) {
    console.warn('[ntfy] Échec envoi notification push:', err.message);
  }
}
