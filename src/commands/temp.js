import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { getConfig, updateConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { notifySystem } from '../services/notifier.js';

/**
 * Analyse une chaîne de durée (ex: 30s, 5m, 10, 1h, 24h) et renvoie { durationMs, label }
 * @param {string} input 
 * @returns {{ durationMs: number, label: string } | null}
 */
export function parseTempDuration(input) {
  if (!input) return null;
  const cleaned = input.toLowerCase().trim();

  const match = cleaned.match(/^(\d+)\s*(s|sec|m|min|h|heure|heures|d|j|jour|jours)?$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  if (isNaN(value) || value <= 0) return null;

  const unit = match[2] || 'm'; // Par défaut : minutes

  let durationMs = 0;
  let label = '';

  if (unit.startsWith('s')) {
    durationMs = value * 1000;
    label = `${value}s`;
  } else if (unit.startsWith('m')) {
    durationMs = value * 60 * 1000;
    label = `${value}m`;
  } else if (unit.startsWith('h')) {
    durationMs = value * 60 * 60 * 1000;
    label = `${value}h`;
  } else if (unit.startsWith('d') || unit.startsWith('j')) {
    durationMs = value * 24 * 60 * 60 * 1000;
    label = `${value}j`;
  }

  // Limites : minimum 5 secondes, maximum 7 jours
  if (durationMs < 5000) durationMs = 5000;
  if (durationMs > 7 * 24 * 60 * 60 * 1000) durationMs = 7 * 24 * 60 * 60 * 1000;

  return { durationMs, label };
}

export default {
  name: 'temp',
  aliases: ['ephemere', 'autoexpire'],
  description: 'Active l\'auto-destruction de vos messages dans la discussion (/temp <temps> ou /temp off)',
  async execute({ sock, msg, jid, args }) {
    const normJid = jidNormalizedUser(jid);
    const config = getConfig();
    const tempChats = config.tempChats || {};
    const sub = args[0]?.toLowerCase().trim();

    // 1. Désactiver le mode temporaire (/temp off)
    if (sub === 'off' || sub === 'stop' || sub === 'disable') {
      if (!tempChats[normJid]) {
        await replyOrEdit(sock, jid, msg, '⏱️ Le mode temporaire n\'était pas actif dans cette discussion.');
        return;
      }

      const updated = { ...tempChats };
      delete updated[normJid];

      updateConfig((prev) => ({
        ...prev,
        tempChats: updated
      }));

      await notifySystem(sock, `🗑️ Mode temporaire : désactivé (${normJid})`);
      await replyOrEdit(sock, jid, msg, '⏱️ Mode temporaire désactivé pour cette discussion.');
      return;
    }

    // 2. Statut actuel sans argument (/temp)
    if (!sub || sub === 'status') {
      const current = tempChats[normJid];
      if (current) {
        await replyOrEdit(
          sock,
          jid,
          msg,
          `⏱️ Mode temporaire *ACTIF* dans cette discussion.\n• Durée : *${current.label}*\n• Vos messages s'auto-détruisent après ce délai.\n💡 Pour désactiver : \`/temp off\``
        );
      } else {
        await replyOrEdit(
          sock,
          jid,
          msg,
          '⏱️ Mode temporaire *INACTIF* dans cette discussion.\n💡 Pour activer : `/temp 30s`, `/temp 5m`, `/temp 1h`'
        );
      }
      return;
    }

    // 3. Activer une durée (/temp <temps>)
    const parsed = parseTempDuration(sub);
    if (!parsed) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        '⚠️ Format invalide. Exemples : `/temp 30s`, `/temp 5m`, `/temp 1h`, ou `/temp off` pour couper.'
      );
      return;
    }

    updateConfig((prev) => ({
      ...prev,
      tempChats: {
        ...(prev.tempChats || {}),
        [normJid]: {
          durationMs: parsed.durationMs,
          label: parsed.label,
          activatedAt: Date.now()
        }
      }
    }));

    await notifySystem(sock, `✅ Mode temporaire : activé (${parsed.label}) pour ${normJid}`);
    await replyOrEdit(
      sock,
      jid,
      msg,
      `⏱️ Mode temporaire activé !\nVos messages dans cette discussion s'auto-détruiront après *${parsed.label}*.`
    );
  }
};
