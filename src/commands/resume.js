import { getConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { getChatMessages } from '../services/messageStore.js';
import { recordAuditLog } from '../services/auditLogStore.js';

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
        '❌ Clé Gemini introuvable. Veuillez configurer votre clé API Gemini dans le panneau SuperAdmin ou dans `.env` (`GEMINI_API_KEY=...`).'
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

      const models = ['gemini-2.5-flash', 'gemini-1.5-flash'];
      let summaryText = null;
      let lastErr = null;

      for (const model of models) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens: 380,
                temperature: 0.3
              }
            })
          });

          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text) {
              summaryText = text;
              break;
            }
          } else {
            const errData = await res.json().catch(() => ({}));
            lastErr = new Error(`HTTP ${res.status}: ${errData.error?.message || res.statusText}`);
          }
        } catch (e) {
          lastErr = e;
        }
      }

      if (!summaryText) {
        throw lastErr || new Error('Réponse vide de l\'IA.');
      }

      const resultLines = [
        `🧠 *RÉSUMÉ IA DE LA CONVERSATION*`,
        `📊 *${compactDialog.length} messages analysés* (mode économe)`,
        `━━━━━━━━━━━━━━━━━━━━`,
        summaryText,
        `━━━━━━━━━━━━━━━━━━━━`
      ];

      await replyOrEdit(sock, jid, msg, resultLines.join('\n'));

      recordAuditLog({
        type: 'command',
        action: 'AI_RESUME',
        user: msg.key.participant || msg.key.remoteJid,
        pushName: msg.pushName || '',
        chatJid: jid,
        details: `${compactDialog.length} messages résumés`,
        status: 'success'
      });
    } catch (err) {
      console.error('[Resume] Erreur résumé Gemini:', err);
      recordAuditLog({
        type: 'command',
        action: 'AI_RESUME_ERROR',
        user: msg.key.participant || msg.key.remoteJid,
        pushName: msg.pushName || '',
        chatJid: jid,
        details: err.message,
        status: 'error'
      });
      await replyOrEdit(sock, jid, msg, `⚠️ Erreur lors de la génération du résumé : ${err.message}`);
    }
  }
};
