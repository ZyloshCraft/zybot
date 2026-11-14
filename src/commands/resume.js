import { getConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { getChatMessages } from '../services/messageStore.js';
import { recordAuditLog } from '../services/auditLogStore.js';
import { generateWithGemini } from '../services/geminiService.js';

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
      const systemInstruction = [
        "Tu es un synthétiseur WhatsApp ultra-concis et direct.",
        "Règles strictes :",
        "1. Rédige UNIQUEMENT entre 3 et 5 puces courtes en français (utilisant le tiret •).",
        "2. Sois percutant, va à l'essentiel : les faits marquants, les décisions, les débats ou rendez-vous.",
        "3. Ne mets AUCUN titre, AUCUN préambule (ex: 'Voici un résumé'), AUCUNE conclusion.",
        "4. N'inclus AUCUNE métadonnée en anglais (pas de 'Source:', 'Goal:', 'Participants:', 'Constraint:', etc.).",
        "5. Reste neutre, synthétique et réponds exclusivement en français."
      ].join('\n');

      const prompt = `Voici les messages récents d'une discussion WhatsApp :\n"""\n${compactDialog.join('\n')}\n"""\n\nRédige le résumé direct en français (3 à 5 puces courtes) :`;

      const { text: rawSummary, model } = await generateWithGemini({
        prompt,
        systemInstruction,
        maxTokens: 350,
        temperature: 0.2,
        geminiKey
      });

      // Nettoyage et formatage soigné des puces en français
      const cleanLines = rawSummary
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => {
          if (!l) return false;
          const lower = l.toLowerCase();
          if (
            lower.startsWith('source:') ||
            lower.startsWith('participants:') ||
            lower.startsWith('goal:') ||
            lower.startsWith('format:') ||
            lower.startsWith('constraint:') ||
            lower.startsWith('content focus:') ||
            lower.startsWith('segment ')
          ) {
            return false;
          }
          if (lower.startsWith('voici ') || lower.startsWith('voici un résumé') || lower.startsWith('résumé :')) {
            return false;
          }
          return true;
        })
        .map((l) => {
          if (/^[-*•]\s*/.test(l)) {
            return l.replace(/^[-*•]\s*/, '• ');
          }
          if (/^\d+\.\s*/.test(l)) {
            return l.replace(/^\d+\.\s*/, '• ');
          }
          return `• ${l}`;
        });

      const summaryText = cleanLines.slice(0, 5).join('\n') || rawSummary;

      const resultLines = [
        `🧠 *RÉSUMÉ IA DE LA CONVERSATION*`,
        `📊 *${compactDialog.length} messages analysés* (_${model}_)`,
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
