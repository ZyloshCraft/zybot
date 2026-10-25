import { getConfig, updateConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { notifySystem } from '../services/notifier.js';
import { isDndActive } from '../services/ntfy.js';

export default {
  name: 'dnd',
  description: 'Gère le mode Ne Pas Déranger (silence les alertes push ntfy la nuit ou sur commande)',
  async execute({ sock, msg, jid, args }) {
    const config = getConfig();
    const dnd = config.dnd || {
      enabled: true,
      start: '23:00',
      end: '06:00',
      until: null
    };

    const action = args[0]?.toLowerCase();

    // 1. Afficher l'état actuel si aucun argument
    if (!action || action === 'status') {
      const activeNow = isDndActive();
      const lines = [
        `🌙 *Mode Ne Pas Déranger (DND) :* ${dnd.enabled ? 'Activé' : 'Désactivé'}`,
        `🕒 *Statut actuel :* ${activeNow ? '🔕 Silencieux (DND actif)' : '🔔 Normal (Alertes sonores actives)'}`,
        `⏰ *Plage horaire nuit :* ${dnd.start || '23:00'} ➔ ${dnd.end || '06:00'}`
      ];

      if (dnd.until && dnd.until > Date.now()) {
        const remainingMin = Math.round((dnd.until - Date.now()) / 60000);
        lines.push(`⏳ *Silence temporaire actif jusqu'à :* ${new Date(dnd.until).toLocaleTimeString('fr-FR')} (~${remainingMin} min)`);
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━');
      lines.push('💡 *Commandes disponibles :*');
      lines.push('• `/dnd on` : Activer le mode DND');
      lines.push('• `/dnd off` : Désactiver le mode DND');
      lines.push('• `/dnd 2h` ou `/dnd 30m` : Silence temporaire pendant X temps');
      lines.push('• `/dnd 23h 06h` ou `/dnd 22:30 07:00` : Régler les horaires');

      await replyOrEdit(sock, jid, msg, lines.join('\n'));
      return;
    }

    // 2. Activer / Désactiver
    if (action === 'on') {
      updateConfig((prev) => ({
        ...prev,
        dnd: { ...prev.dnd, enabled: true, until: null }
      }));
      await notifySystem(sock, '🌙 Mode Ne Pas Déranger activé.');
      await replyOrEdit(sock, jid, msg, '✅ Mode Ne Pas Déranger *ACTIVÉ*. Les alertes sonores seront coupées selon votre planning (défaut: 23h-06h).');
      return;
    }

    if (action === 'off') {
      updateConfig((prev) => ({
        ...prev,
        dnd: { ...prev.dnd, enabled: false, until: null }
      }));
      await notifySystem(sock, '🔔 Mode Ne Pas Déranger désactivé.');
      await replyOrEdit(sock, jid, msg, '🔔 Mode Ne Pas Déranger *DÉSACTIVÉ*. Vous recevrez toutes les alertes push 24/7.');
      return;
    }

    // 3. Durée temporaire (ex: 2h, 30m, 45min, 1d)
    const durationMatch = action.match(/^(\d+)(h|m|min|d)?$/i);
    if (durationMatch && !args[1]) {
      const val = parseInt(durationMatch[1], 10);
      const unit = (durationMatch[2] || 'h').toLowerCase();
      let ms = 0;
      if (unit === 'm' || unit === 'min') ms = val * 60 * 1000;
      else if (unit === 'h') ms = val * 3600 * 1000;
      else if (unit === 'd') ms = val * 24 * 3600 * 1000;

      const until = Date.now() + ms;
      updateConfig((prev) => ({
        ...prev,
        dnd: { ...prev.dnd, enabled: true, until }
      }));

      const endDate = new Date(until).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      await notifySystem(sock, `🔕 DND temporaire activé pour ${val}${unit} (jusqu'à ${endDate}).`);
      await replyOrEdit(sock, jid, msg, `🔕 Mode Ne Pas Déranger activé pour *${val}${unit}* (jusqu'à *${endDate}*).`);
      return;
    }

    // 4. Définir des horaires (ex: /dnd 23h 06h ou /dnd 23:00 06:00)
    let startStr = action;
    let endStr = args[1]?.toLowerCase();

    // Normaliser format 23h / 23h00 -> 23:00
    const normalizeTime = (t) => {
      if (!t) return null;
      t = t.replace('h', ':');
      if (!t.includes(':')) t = `${t}:00`;
      const [h, m] = t.split(':');
      const padH = String(h).padStart(2, '0');
      const padM = String(m || '00').padEnd(2, '0').slice(0, 2);
      return `${padH}:${padM}`;
    };

    const cleanStart = normalizeTime(startStr);
    const cleanEnd = normalizeTime(endStr);

    if (cleanStart && cleanEnd) {
      updateConfig((prev) => ({
        ...prev,
        dnd: { ...prev.dnd, enabled: true, start: cleanStart, end: cleanEnd, until: null }
      }));

      await notifySystem(sock, `🌙 Plage horaire DND mise à jour : ${cleanStart} ➔ ${cleanEnd}`);
      await replyOrEdit(sock, jid, msg, `✅ Horaires Ne Pas Déranger programmés : de *${cleanStart}* à *${cleanEnd}* chaque nuit.`);
      return;
    }

    await replyOrEdit(sock, jid, msg, 'Usage : `/dnd` (statut), `/dnd on`, `/dnd off`, `/dnd 2h`, ou `/dnd 23h 06h`.');
  }
};
