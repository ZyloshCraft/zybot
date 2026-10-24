import { getConfig } from '../config.js';

/**
 * Envoie une notification push instantanée sur le smartphone via ntfy.sh
 * @param {object} params
 * @param {string} params.title - Titre de la notification
 * @param {string} params.message - Corps du message
 * @param {'urgent' | 'high' | 'default' | 'low' | 'min'} [params.priority='default']
 * @param {string[] | string} [params.tags=[]] - Emojis/tags ntfy (ex: ['warning', 'wastebasket'])
 */
export async function sendNtfyNotification({ title, message, priority = 'default', tags = [] }) {
  const config = getConfig();
  if (!config.ntfy?.enabled || !config.ntfy?.topic) return;

  const topic = config.ntfy.topic.trim();
  if (!topic) return;

  try {
    const url = `https://ntfy.sh/${topic}`;
    const headers = {
      'Title': title || 'ZyBot Notification',
      'Priority': priority
    };

    if (tags) {
      headers['Tags'] = Array.isArray(tags) ? tags.join(',') : tags;
    }

    await fetch(url, {
      method: 'POST',
      headers,
      body: message || ''
    });
  } catch (err) {
    console.warn('[ntfy] Échec envoi notification push:', err.message);
  }
}
