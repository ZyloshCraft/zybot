import { deleteMessageImmediately } from '../utils/stealth.js';

export default {
  name: 'edit',
  aliases: ['modifier'],
  description: 'Modifie discrètement le message cité (doit être un de vos messages)',
  async execute({ sock, msg, jid, args }) {
    await deleteMessageImmediately(sock, jid, msg.key);

    const newText = args.join(' ').trim();
    if (!newText) return;

    const msgContent = msg.message;
    const contextInfo =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;

    const quoted = contextInfo?.quotedMessage;
    if (!quoted || !contextInfo.stanzaId) return;

    try {
      // Clé du message à modifier
      const targetKey = {
        remoteJid: jid,
        fromMe: true,
        id: contextInfo.stanzaId
      };

      await sock.sendMessage(jid, { text: newText, edit: targetKey });
    } catch (err) {
      console.error('Erreur edit:', err);
    }
  }
};
