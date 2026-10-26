import { downloadMediaMessage, normalizeMessageContent } from '@whiskeysockets/baileys';
import { getConfig, updateConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { notifySystem } from '../services/notifier.js';
import { checkImageNsfw } from '../services/nsfwDetector.js';

export default {
  name: 'antinsfw',
  aliases: ['nsfw', 'filtrensfw'],
  description: 'Active, désactive ou teste le filtre automatique de détection NSFW (/nsfw check)',
  async execute({ sock, msg, jid, args }) {
    const config = getConfig();
    const currentEnabled = config.antiNsfw?.enabled !== false;
    const action = args[0]?.toLowerCase();

    // 1. Tester une image : /nsfw check ou /nsfw test (ou en répondant à une image)
    const rawContent = msg.message;
    const normalized = normalizeMessageContent(rawContent) || rawContent;
    const contextInfo =
      normalized?.extendedTextMessage?.contextInfo ||
      normalized?.[Object.keys(normalized || {})[0]]?.contextInfo;

    const hasQuotedImage = Boolean(
      contextInfo?.quotedMessage?.imageMessage ||
      normalizeMessageContent(contextInfo?.quotedMessage)?.imageMessage
    );
    const hasDirectImage = Boolean(normalized?.imageMessage);

    if (action === 'check' || action === 'test' || hasQuotedImage || (hasDirectImage && action)) {
      let targetMessage = null;
      let targetKey = null;
      let mimeType = 'image/jpeg';

      if (hasQuotedImage) {
        const qMsg = contextInfo.quotedMessage;
        const qNorm = normalizeMessageContent(qMsg) || qMsg;
        targetMessage = qMsg;
        targetKey = { id: contextInfo.stanzaId, remoteJid: jid, participant: contextInfo.participant };
        mimeType = qNorm.imageMessage?.mimetype || 'image/jpeg';
      } else if (hasDirectImage) {
        targetMessage = rawContent;
        targetKey = msg.key;
        mimeType = normalized.imageMessage?.mimetype || 'image/jpeg';
      }

      if (!targetMessage) {
        await replyOrEdit(
          sock,
          jid,
          msg,
          'Usage Test : Répondez à une image avec `/nsfw check` (ou envoyez une image avec la légende `/nsfw check`) pour tester la détection sans risque.'
        );
        return;
      }

      await replyOrEdit(sock, jid, msg, '🔍 Analyse de l\'image par l\'IA Freepik en cours...');

      try {
        const buffer = await downloadMediaMessage(
          { key: targetKey, message: targetMessage },
          'buffer',
          {}
        );

        if (!buffer || buffer.length === 0) {
          await replyOrEdit(sock, jid, msg, '❌ Impossible de télécharger l\'image pour le test.');
          return;
        }

        const { isNsfw, details, scores } = await checkImageNsfw(buffer, mimeType);

        const lines = [
          '🛡️ *RÉSULTAT DU TEST ANTI-NSFW*',
          '━━━━━━━━━━━━━━━━━━━━',
          `Verdict IA : *${isNsfw ? '🔴 CONTENU NSFW DÉTECTÉ' : '🟢 IMAGE CONFORME (SAFE)'}*`,
          `━━━━━━━━━━━━━━━━━━━━`,
          scores ? `📊 *Scores de probabilité :*\n${scores}` : '',
          '━━━━━━━━━━━━━━━━━━━━',
          `⚙️ *Action en condition réelle :*`,
          isNsfw
            ? '➔ *Suppression instantanée* dans le groupe pour tous.\n➔ *Transfert du dossier et de la photo* dans le salon `admintaverne`.\n➔ *Notification push smartphone* immédiate.'
            : '➔ *Aucune action requise*, l\'image est autorisée.'
        ].filter(Boolean);

        await replyOrEdit(sock, jid, msg, lines.join('\n'));
      } catch (err) {
        await replyOrEdit(sock, jid, msg, `❌ Erreur pendant le test : ${err.message}`);
      }
      return;
    }

    // 2. Afficher le statut si aucun argument
    if (!action || action === 'status') {
      const statusText = [
        `🛡️ *Filtre Anti-NSFW (IA Freepik/HuggingFace) :* ${currentEnabled ? '✅ Actif' : '❌ Inactif'}`,
        `🏢 *Périmètre :* Tous les groupes où vous êtes administrateur`,
        `🚨 *Salon d'alerte :* admintaverne (\`120363424594930135@g.us\`)`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `💡 *Commandes disponibles :*`,
        `• \`/nsfw check\` : Tester n'importe quelle image en réponse`,
        `• \`/nsfw on\` : Activer le filtre automatique`,
        `• \`/nsfw off\` : Désactiver le filtre automatique`
      ].join('\n');

      await replyOrEdit(sock, jid, msg, statusText);
      return;
    }

    if (action === 'on') {
      updateConfig((prev) => ({
        ...prev,
        antiNsfw: { ...prev.antiNsfw, enabled: true }
      }));
      await notifySystem(sock, '✅ Filtre Anti-NSFW : Activé');
      await replyOrEdit(sock, jid, msg, '✅ *Filtre Anti-NSFW activé.* Toute image inappropriée dans vos groupes administrés sera supprimée et transmise dans admintaverne.');
      return;
    }

    if (action === 'off') {
      updateConfig((prev) => ({
        ...prev,
        antiNsfw: { ...prev.antiNsfw, enabled: false }
      }));
      await notifySystem(sock, '🗑️ Filtre Anti-NSFW : Désactivé');
      await replyOrEdit(sock, jid, msg, '⏸️ *Filtre Anti-NSFW désactivé.* Les images ne seront plus scannées automatiquement.');
      return;
    }

    await replyOrEdit(sock, jid, msg, 'Usage : `/nsfw` (statut), `/nsfw check` (tester une image), `/nsfw on`, ou `/nsfw off`.');
  }
};
