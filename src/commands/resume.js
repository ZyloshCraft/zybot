import { getConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { getChatMessages } from '../services/messageStore.js';

export default {
  name: 'resume',
  aliases: ['summary', 'recapitulatif'],
  description: 'Génère un résumé IA ultra-concis et économe en tokens des derniers échanges du chat',
  async execute({ sock, msg, jid, args }) {
    const config = getConfig();
    const geminiKey = config.speech?.geminiApiKey || process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        '❌ Clé Gemini introuvable. Veuillez vérifier votre clé API dans `~/.env`.'
      );
      return;
    }

    // Nombre de messages analysés : 50 par défaut, jusqu'à 200 max
    let count = 50;
    if (args[0]) {
      const parsed = parseInt(args[0], 10);
      if (!isNaN(parsed) && parsed > 5) {
        count = Math.min(parsed, 200);
      }
    }

    const messages = getChatMessages(jid, count);
    if (!messages || messages.length < 3) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        '📭 Pas assez de messages mémorisés dans cette discussion pour générer un résumé.'
      );
      return;
    }

    // Filtrer et compacter les messages pour réduire drastiquement la consommation de tokens
    const compactDialog = [];
    for (const m of messages) {
      const text = (m.text || '').trim();
      // Ignorer les commandes commençant par / et les messages trop courts
      if (!text || text.startsWith('/') || text.length < 2) continue;

      const author = m.fromMe ? 'Moi' : (m.pushName || `+${(m.sender || '').split('@')[0]}`);
      // Tronquer les messages très longs à 120 caractères
      const shortText = text.length > 120 ? `${text.substring(0, 120)}...` : text;
      compactDialog.push(`${author}: ${shortText}`);
    }

    if (compactDialog.length < 2) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        '📭 Aucun échange textuel significatif trouvé dans les derniers messages.'
      );
      return;
    }

    await replyOrEdit(sock, jid, msg, `🧠 Synthèse IA de ${compactDialog.length} messages en cours (mode éco)...`);

    try {
      const prompt = `Voici les derniers messages d'une discussion WhatsApp :
${compactDialog.join('\n')}

Résume en français cette discussion en 3 à 5 puces courtes et directes. Mets en valeur uniquement les informations clés, les rendez-vous, les décisions ou le sujet principal. Sois très concis.`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${geminiKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            maxOutputTokens: 380,
            temperature: 0.3
          }
        })
      });

      if (!res.ok) {
        throw new Error(`API Gemini HTTP ${res.status}`);
      }

      const data = await res.json();
      const summaryText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!summaryText) {
        throw new Error('Réponse vide de l\'IA.');
      }

      const resultLines = [
        `🧠 *RÉSUMÉ IA DE LA CONVERSATION*`,
        `📊 *${compactDialog.length} messages analysés* (mode économe)`,
        `━━━━━━━━━━━━━━━━━━━━`,
        summaryText,
        `━━━━━━━━━━━━━━━━━━━━`
      ];

      await replyOrEdit(sock, jid, msg, resultLines.join('\n'));
    } catch (err) {
      console.error('[Resume] Erreur résumé Gemini:', err);
      await replyOrEdit(sock, jid, msg, `⚠️ Erreur lors de la génération du résumé : ${err.message}`);
    }
  }
};
