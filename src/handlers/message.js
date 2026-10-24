import { normalizeMessageContent, WAMessageStubType } from '@whiskeysockets/baileys';
import { getConfig } from '../config.js';
import { getCommand } from '../commands/index.js';
import { handleKeywordAlert } from './keywordAlert.js';
import { trackMessage } from '../services/messageStore.js';
import { hasActiveWizard, handleWizardStep } from '../services/programWizard.js';
import { handleRevokedMessage } from '../services/antiDelete.js';

/**
 * Extrait le contenu textuel d'un message WhatsApp (en déballant les messages éphémères / vue unique)
 */
export function extractTextFromMessage(message) {
  if (!message) return '';
  const normalized = normalizeMessageContent(message) || message;
  return (
    normalized.conversation ||
    normalized.extendedTextMessage?.text ||
    normalized.imageMessage?.caption ||
    normalized.videoMessage?.caption ||
    normalized.documentMessage?.caption ||
    normalized.buttonsResponseMessage?.selectedDisplayText ||
    normalized.templateButtonReplyMessage?.selectedId ||
    ''
  );
}

/**
 * Vérifie si le message a été envoyé par le propriétaire du bot
 */
export function isOwnerMessage(sock, msg) {
  if (msg.key.fromMe) return true;

  const myNumber = sock.user?.id ? sock.user.id.split(':')[0] : null;
  if (!myNumber) return false;

  const senderJid = msg.key.participant || msg.key.remoteJid;
  return senderJid?.includes(myNumber);
}

/**
 * Gestionnaire principal des messages entrants
 */
export async function handleMessagesUpsert({ sock, upsert, restartClient }) {
  const { messages, type } = upsert;
  if (!messages || !messages.length) return;

  const config = getConfig();
  const prefix = config.prefix || '/';

  for (const msg of messages) {
    try {
      // 1. Détection des suppressions de message (Anti-Delete)
      const protocolMessage = msg.message?.protocolMessage;
      if (protocolMessage && (protocolMessage.type === 0 || protocolMessage.type === 14)) {
        const revokedKey = {
          remoteJid: protocolMessage.key?.remoteJid || msg.key.remoteJid,
          id: protocolMessage.key?.id,
          participant: protocolMessage.key?.participant || msg.key.participant,
          fromMe: protocolMessage.key?.fromMe
        };
        await handleRevokedMessage({
          sock,
          revokedKey,
          revokerKey: msg.key,
          timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now()
        });
        continue;
      }

      if (msg.messageStubType === WAMessageStubType.REVOKE || msg.messageStubType === 68) {
        await handleRevokedMessage({
          sock,
          revokedKey: msg.key,
          timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now()
        });
        continue;
      }

      // Ignorer les messages sans contenu ou autres stubs WhatsApp internes
      if (!msg.message || msg.messageStubType) continue;

      const jid = msg.key.remoteJid;
      if (!jid || jid.includes('@broadcast') || jid.endsWith('@newsletter')) continue;

      const text = extractTextFromMessage(msg.message).trim();
      const isOwner = isOwnerMessage(sock, msg);

      // Mémoriser tous les messages (pour Anti-Delete, /clear et /persoping date exacte)
      trackMessage(jid, msg.key, {
        timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now(),
        fromMe: msg.key.fromMe,
        text,
        sender: msg.key.participant || msg.key.remoteJid,
        pushName: msg.pushName,
        rawMessage: msg.message
      });

      // Gestion de l'assistant pas-à-pas (ex: /program en mode guidé)
      const userId = msg.key.participant || msg.key.remoteJid;
      if (isOwner && hasActiveWizard(userId)) {
        const handled = await handleWizardStep({ sock, msg, jid, text, userId });
        if (handled) continue;
      }

      // Si le message commence par le préfixe et provient du propriétaire
      if (text.startsWith(prefix) && isOwner) {
        const parts = text.slice(prefix.length).trim().split(/\s+/);
        const commandName = parts[0];
        const args = parts.slice(1);

        const command = getCommand(commandName);
        if (command) {
          console.log(`[Commande] Exécution de ${prefix}${commandName} par le propriétaire`);
          await command.execute({ sock, msg, jid, args, restartClient });
          continue;
        }
      }

      // Traitement des messages reçus d'autres personnes : Détection des alertes mots-clés
      if (!msg.key.fromMe) {
        await handleKeywordAlert({ sock, msg, jid, text });
      }
    } catch (err) {
      console.error('[Handler] Erreur lors du traitement d\'un message:', err);
    }
  }
}
