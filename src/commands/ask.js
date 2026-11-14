import { getConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { recordAuditLog } from '../services/auditLogStore.js';
import { generateWithGemini } from '../services/geminiService.js';
import { extractTextFromMessage } from '../handlers/message.js';

export default {
  name: 'ask',
  aliases: ['ai', 'ia', 'gemini', 'question'],
  description: 'Interroge l\'intelligence artificielle Gemini directement dans le chat (ou sur un message cité)',
  async execute({ sock, msg, jid, args, isOwner }) {
    const config = getConfig();
    const geminiKey = config.speech?.geminiApiKey || process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        '❌ Clé Gemini introuvable. Configurez votre clé API Gemini dans le panneau SuperAdmin (onglet Réglages) ou dans `.env` (`GEMINI_API_KEY=...`).'
      );
      return;
    }

    // Récupérer le texte de la question
    let query = args.join(' ').trim();

    // Vérifier si un message a été cité (quoted message)
    const contextInfo =
      msg.message?.extendedTextMessage?.contextInfo ||
      msg.message?.imageMessage?.contextInfo ||
      msg.message?.videoMessage?.contextInfo;

    let quotedText = '';
    if (contextInfo?.quotedMessage) {
      quotedText = extractTextFromMessage(contextInfo.quotedMessage).trim();
    }

    if (!query && !quotedText) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        '💡 *Utilisation de /ask :*\n• `/ask <votre question>` : Pose n\'importe quelle question à l\'IA.\n• Répondre à un message avec `/ask <question>` : Pose une question sur le message cité.'
      );
      return;
    }

    await replyOrEdit(sock, jid, msg, '🤖 _Gemini réfléchit..._');

    const senderJid = msg.key.participant || msg.key.remoteJid;
    const pushName = msg.pushName || 'Utilisateur';

    try {
      // Construire le prompt avec le contexte si un message était cité
      let finalPrompt = query;
      if (quotedText) {
        finalPrompt = `Message de référence cité par l'utilisateur :\n"""\n${quotedText}\n"""\n\nQuestion ou demande de l'utilisateur : ${query || 'Explique ou résume ce message succinctement.'}`;
      }

      const systemInstruction =
        "Tu es ZyBot, un assistant WhatsApp rapide, précis, convivial et concis. Réponds en français avec un formatage WhatsApp soigné (*gras*, _italique_, puces). Sois direct et évite le bavardage inutile.";

      const { text: answerText, model } = await generateWithGemini({
        prompt: finalPrompt,
        systemInstruction,
        maxTokens: 800,
        temperature: 0.6,
        geminiKey
      });

      const responseMessage = [
        '✨ *RÉPONSE GEMINI IA*',
        `🤖 _Modèle : ${model}_`,
        '━━━━━━━━━━━━━━━━━━━━',
        answerText,
        '━━━━━━━━━━━━━━━━━━━━'
      ].join('\n');

      await replyOrEdit(sock, jid, msg, responseMessage);

      recordAuditLog({
        type: 'command',
        action: 'AI_ASK',
        user: senderJid,
        pushName,
        chatJid: jid,
        details: query ? query.slice(0, 60) : 'Analyse de message cité',
        status: 'success'
      });
    } catch (err) {
      console.error('[Ask] Erreur requête Gemini:', err);
      recordAuditLog({
        type: 'command',
        action: 'AI_ASK_ERROR',
        user: senderJid,
        pushName,
        chatJid: jid,
        details: err.message,
        status: 'error'
      });
      await replyOrEdit(sock, jid, msg, `⚠️ Erreur Gemini : ${err.message}`);
    }
  }
};
