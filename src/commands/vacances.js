import { getConfig, updateConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';

export default {
  name: 'vacances',
  description: 'Gère le répondeur d\'absence',
  async execute({ sock, msg, jid, args }) {
    const config = getConfig();
    const subCommand = args[0]?.toLowerCase();

    if (!subCommand || subCommand === 'statut' || subCommand === 'status') {
      const v = config.vacances;
      const text = [
        `Vacances : ${v.enabled ? 'Actif' : 'Inactif'} (cooldown ${v.cooldownMinutes}m)`,
        `Message : "${v.message}"`
      ].join('\n');

      await replyOrEdit(sock, jid, msg, text);
      return;
    }

    if (subCommand === 'on') {
      const customMessage = args.slice(1).join(' ').trim();
      updateConfig((prev) => ({
        ...prev,
        vacances: {
          ...prev.vacances,
          enabled: true,
          ...(customMessage ? { message: customMessage } : {})
        }
      }));

      await replyOrEdit(sock, jid, msg, 'Vacances activées');
      return;
    }

    if (subCommand === 'off') {
      updateConfig((prev) => ({
        ...prev,
        vacances: {
          ...prev.vacances,
          enabled: false
        }
      }));

      await replyOrEdit(sock, jid, msg, 'Vacances désactivées');
      return;
    }

    if (subCommand === 'message' || subCommand === 'msg') {
      const newMsg = args.slice(1).join(' ').trim();
      if (!newMsg) {
        await replyOrEdit(sock, jid, msg, 'Usage : /vacances message <texte>');
        return;
      }

      updateConfig((prev) => ({
        ...prev,
        vacances: {
          ...prev.vacances,
          message: newMsg
        }
      }));

      await replyOrEdit(sock, jid, msg, `Message mis à jour : "${newMsg}"`);
      return;
    }

    if (subCommand === 'cooldown') {
      const minutes = parseInt(args[1], 10);
      if (isNaN(minutes) || minutes < 5) {
        await replyOrEdit(sock, jid, msg, 'Cooldown minimum : 5 min');
        return;
      }

      updateConfig((prev) => ({
        ...prev,
        vacances: {
          ...prev.vacances,
          cooldownMinutes: minutes
        }
      }));

      await replyOrEdit(sock, jid, msg, `Cooldown mis à jour : ${minutes} min`);
      return;
    }

    await replyOrEdit(sock, jid, msg, 'Usage : /vacances [on|off|statut|message|cooldown]');
  }
};
