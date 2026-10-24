import { getConfig } from '../config.js';

const PRIORITY_MAP = {
  urgent: 5,
  high: 4,
  default: 3,
  low: 2,
  min: 1
};

/**
 * Envoie une notification push instantanée sur le smartphone via ntfy.sh (en JSON UTF-8)
 * @param {object} params
 * @param {string} params.title - Titre de la notification (avec emojis supportés)
 * @param {string} params.message - Corps du message
 * @param {'urgent' | 'high' | 'default' | 'low' | 'min' | number} [params.priority='default']
 * @param {string[] | string} [params.tags=[]] - Emojis/tags ntfy (ex: ['warning', 'wastebasket'])
 */
export async function sendNtfyNotification({ title, message, priority = 'default', tags = [] }) {
  const config = getConfig();
  if (!config.ntfy?.enabled || !config.ntfy?.topic) return;

  const topic = config.ntfy.topic.trim();
  if (!topic) return;

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
