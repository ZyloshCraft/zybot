import { deleteMessageImmediately, sleep, getRandomDelay } from '../utils/stealth.js';

export default {
  name: 'vocal',
  aliases: ['tts', 'audio'],
  description: 'Convertit du texte en message vocal WhatsApp réaliste (PTT)',
  async execute({ sock, msg, jid, args }) {
    // 1. Supprimer immédiatement la commande pour ne laisser aucune trace
    await deleteMessageImmediately(sock, jid, msg.key);

    let lang = 'fr';
    let text = args.join(' ').trim();

    // Si le premier mot est un code de langue (ex: 'en', 'es', 'de')
    if (args.length > 1 && /^[a-zA-Z]{2,3}$/.test(args[0])) {
      lang = args[0].toLowerCase();
      text = args.slice(1).join(' ').trim();
    }

    if (!text) return;

    try {
      // 2. Simuler l'état "en train d'enregistrer un audio" (recording)
      await sock.sendPresenceUpdate('recording', jid);
      await sleep(getRandomDelay(1200, 2500));

      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(
        lang
      )}&q=${encodeURIComponent(text)}`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
        }
      });

      if (!res.ok) {
        throw new Error(`Échec audio (HTTP ${res.status})`);
      }

      const arrayBuf = await res.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuf);

      await sock.sendPresenceUpdate('paused', jid);

      // 3. Envoyer comme un vrai message vocal WhatsApp (avec onde verte PTT)
      await sock.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: 'audio/mp4',
        ptt: true
      });
    } catch (err) {
      console.error('Erreur vocal:', err);
    }
  }
};
