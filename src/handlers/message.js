import { normalizeMessageContent, WAMessageStubType, jidNormalizedUser } from '@whiskeysockets/baileys';
import { getConfig } from '../config.js';
import { getCommand } from '../commands/index.js';
import { handleKeywordAlert } from './keywordAlert.js';
import { trackMessage } from '../services/messageStore.js';
import { hasActiveWizard, handleWizardStep } from '../services/programWizard.js';
import { handleRevokedMessage, handleEditedMessage } from '../services/antiDelete.js';
import { recordMessageSent, recordPrivateMessageReceived } from '../services/statsTracker.js';
import { trackStatus } from '../services/statusStore.js';
import { handleGroupNsfwScan } from './nsfwInterceptor.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';
import { recordGroupMessage } from '../services/groupActivityStore.js';
import { checkAndTrackPseudo } from '../services/contactStore.js';
import { handlePseudoChange } from '../services/groupEvents.js';
import { canUserExecuteCommand } from '../services/permissionStore.js';

/**
 * Extrait le contenu textuel d'un message WhatsApp (en déballant les messages éphémères / vue unique / modifiés)
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
    normalized.editedMessage?.message?.conversation ||
    normalized.editedMessage?.message?.extendedTextMessage?.text ||
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
      const protocolMessage = msg.message?.protocolMessage;

      // 1. Détection des suppressions (Anti-Delete, type 0 = REVOKE)
      if (protocolMessage && protocolMessage.type === 0) {
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

      // 2. Détection des modifications (Anti-Edit, type 14 = MESSAGE_EDIT)
      if (protocolMessage && protocolMessage.type === 14) {
        const targetKey = {
          remoteJid: protocolMessage.key?.remoteJid || msg.key.remoteJid,
          id: protocolMessage.key?.id,
          participant: protocolMessage.key?.participant || msg.key.participant,
          fromMe: protocolMessage.key?.fromMe
        };
        const newRawMessage = protocolMessage.editedMessage;
        const newText = extractTextFromMessage(newRawMessage).trim();
        await handleEditedMessage({
          sock,
          targetKey,
          newText,
          newRawMessage,
          timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now()
        });
        continue;
      }

      // Détection des suppressions par stub WhatsApp interne
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
      if (!jid) continue;

      // Capture furtive des statuts/stories WhatsApp pour l'archivage (/statut)
      if (jid === 'status@broadcast') {
        trackStatus(msg);
        continue;
      }

      if (jid.includes('@broadcast') || jid.endsWith('@newsletter')) continue;

      const normJid = jidNormalizedUser(jid);
      const text = extractTextFromMessage(msg.message).trim();
      const isOwner = isOwnerMessage(sock, msg);

      // Statistiques quotidiennes
      if (isOwner) {
        recordMessageSent();
      } else if (!jid.endsWith('@g.us')) {
        recordPrivateMessageReceived();
      }

      const senderJid = msg.key.participant || msg.key.remoteJid;

      // Mémoriser tous les messages (pour Anti-Delete, Anti-Edit, /clear et /persoping date exacte)
      trackMessage(jid, msg.key, {
        timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now(),
        fromMe: msg.key.fromMe,
        text,
        sender: senderJid,
        pushName: msg.pushName,
        rawMessage: msg.message
      });

      // Traquer l'activité des membres dans les groupes
      if (jid.endsWith('@g.us')) {
        recordGroupMessage({
          groupJid: jid,
          senderJid,
          pushName: msg.pushName
        });
      }

      // Détection des changements de pseudo en temps réel
      if (msg.pushName && senderJid && !msg.key.fromMe) {
        const change = checkAndTrackPseudo(senderJid, msg.pushName);
        if (change) {
          handlePseudoChange(sock, {
            senderJid,
            oldName: change.oldName,
            newName: change.newName
          }).catch((err) => console.error('[PseudoChange] Erreur non bloquante:', err.message));
        }
      }

      // Gestion de l'auto-destruction programmée (/temp) pour vos messages dans cette discussion
      if (isOwner && config.tempChats && config.tempChats[normJid]) {
        const tempDuration = config.tempChats[normJid].durationMs;
        if (tempDuration > 0) {
          setTimeout(async () => {
            try {
              await sock.sendMessage(jid, { delete: msg.key });
            } catch (err) {}
          }, tempDuration);
        }
      }

      // Gestion de l'assistant pas-à-pas (ex: /program en mode guidé)
      const userId = msg.key.participant || msg.key.remoteJid;
      if (isOwner && hasActiveWizard(userId)) {
        const handled = await handleWizardStep({ sock, msg, jid, text, userId });
        if (handled) continue;
      }

      // Exécution des commandes (préfixe)
      if (text.startsWith(prefix)) {
        const parts = text.slice(prefix.length).trim().split(/\s+/);
        const commandName = parts[0];
        const args = parts.slice(1);

        const command = getCommand(commandName);
        if (command) {
          // 1. Le propriétaire a un accès total à toutes les commandes
          if (isOwner) {
            console.log(`[Commande] Exécution de ${prefix}${commandName} par le propriétaire`);
            await command.execute({ sock, msg, jid, args, restartClient, isOwner: true, isAdmin: true });
            continue;
          }

          // 2. Vérification des permissions pour les membres délégués / modérateurs (Trusted ou Admins Taverne)
          const senderJid = msg.key.participant || msg.key.remoteJid;
          const isPermitted = await canUserExecuteCommand({
            sock,
            senderJid,
            commandName,
            groupJid: jid,
            isOwner: false
          });

          if (isPermitted) {
            console.log(`[Commande] Exécution de ${prefix}${commandName} par un membre autorisé (+${senderJid.split('@')[0]})`);
            await command.execute({ sock, msg, jid, args, restartClient, isOwner: false, isAdmin: true });
            continue;
          }
        }
      }

      // Traitement des messages reçus d'autres personnes : Détection des alertes mots-clés et filtre Anti-NSFW
      if (!msg.key.fromMe) {
        await handleKeywordAlert({ sock, msg, jid, text });
        // Scan automatique Anti-NSFW dans les groupes administrés (en arrière-plan non-bloquant)
        handleGroupNsfwScan({ sock, msg, jid }).catch((err) => {
          console.error('[Anti-NSFW] Erreur non bloquante:', err.message);
        });
      }
    } catch (err) {
      console.error('[Handler] Erreur lors du traitement d\'un message:', err);
    }
  }
}
