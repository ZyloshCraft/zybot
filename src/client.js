import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  WAMessageStubType
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import { handleMessagesUpsert, extractTextFromMessage } from './handlers/message.js';
import { trackMessage, saveMessageHistory } from './services/messageStore.js';
import { handleRevokedMessage, handleEditedMessage } from './services/antiDelete.js';
import { initDailyRecapScheduler } from './services/statsTracker.js';
import { updateContacts } from './services/contactStore.js';
import { handleGroupParticipantsUpdate } from './services/groupEvents.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_DIR = path.resolve(__dirname, '../auth_info');

let currentSocket = null;
let isRestarting = false;
let latestQr = null;

const connectionInfo = {
  status: 'disconnected',
  connectedAt: null,
  phone: null,
  pushName: null,
  version: null
};

export function getActiveSocket() {
  return currentSocket;
}

export function getConnectionState() {
  if (currentSocket?.user) {
    connectionInfo.phone = currentSocket.user.id ? currentSocket.user.id.split('@')[0].split(':')[0] : null;
    connectionInfo.pushName = currentSocket.user.name || null;
  }
  return { ...connectionInfo, qr: latestQr };
}

export async function clearAuthAndReconnect() {
  console.log('🧹 Réinitialisation de la session WhatsApp (suppression de auth_info)...');
  try {
    if (currentSocket) {
      currentSocket.end();
    }
  } catch {}
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn('Avertissement suppression auth_info:', err.message);
  }
  latestQr = null;
  connectionInfo.status = 'connecting';
  setTimeout(() => {
    createWhatsAppClient();
  }, 1500);
}

export async function createWhatsAppClient() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  // Logger pino silencieux pour ne pas polluer la console avec les trames WebSocket
  const logger = pino({ level: 'silent' });

  console.log('\n🚀 Initialisation de la connexion WhatsApp...');
  console.log(`🛡️  Empreinte furtive : Google Chrome (macOS) v${version.join('.')}`);

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false, // On gère manuellement l'affichage du QR avec qrcode-terminal
    auth: state,
    // Empreinte navigateur officielle pour éviter la détection de Baileys
    browser: Browsers.macOS('Chrome'),
    // Synchroniser l'historique récent pour permettre le /clear des messages passés
    syncFullHistory: true,
    markOnlineOnConnect: false // Ne pas forcer l'état en ligne à la connexion
  });

  currentSocket = sock;
  isRestarting = false;
  connectionInfo.status = 'connecting';
  connectionInfo.version = version.join('.');

  function restartClient() {
    if (isRestarting) return;
    isRestarting = true;
    console.log('🔄 Redémarrage du client WhatsApp...');
    try {
      sock.end();
    } catch (e) {}
    setTimeout(() => {
      createWhatsAppClient();
    }, 2000);
  }

  // Événement d'authentification
  sock.ev.on('creds.update', saveCreds);

  // Synchronisation des contacts WhatsApp et pseudos
  sock.ev.on('contacts.upsert', (contacts) => {
    updateContacts(contacts);
  });
  sock.ev.on('contacts.update', (updates) => {
    updateContacts(updates);
  });

  // Synchronisation de l'historique des messages précédents (WhatsApp Phone Sync)
  sock.ev.on('messaging-history.set', ({ messages, contacts }) => {
    if (contacts && contacts.length) {
      updateContacts(contacts);
    }
    if (messages && messages.length) {
      for (const m of messages) {
        if (m.key) {
          trackMessage(m.key.remoteJid, m.key, {
            timestamp: m.messageTimestamp ? Number(m.messageTimestamp) * 1000 : Date.now(),
            fromMe: m.key.fromMe,
            sender: m.key.participant || m.key.remoteJid,
            pushName: m.pushName,
            rawMessage: m.message
          });
        }
      }
      saveMessageHistory();
      console.log(`📦 Historique synchronisé : ${messages.length} messages mémorisés pour /clear.`);
    }
  });

  // Gestion du cycle de vie de connexion
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = qr;
      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║        📲 SCANNEZ CE QR CODE AVEC VOTRE WHATSAPP          ║');
      console.log('║  (WhatsApp > Appareils connectés > Connecter un appareil)  ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'close') {
      connectionInfo.status = 'disconnected';
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || statusCode || 'Inconnu';
      const isConnectionReplaced = statusCode === DisconnectReason.connectionReplaced;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const shouldReconnect = !isLoggedOut && !isConnectionReplaced;

      console.log(`⚠️ Connexion interrompue. Raison: ${reason} (code: ${statusCode})`);

      if (isConnectionReplaced) {
        console.log('⚠️ Conflit de session (code 440: connectionReplaced) : Une autre instance de ZyBot ou une session a pris la connexion.');
        console.log('🛑 Arrêt immédiat de cette instance pour éviter une boucle infinie de conflit.');
        process.exit(0);
      }

      if (isLoggedOut) {
        console.log('❌ Session déconnectée (Logged Out, code 401).');
        console.log('🧹 Nettoyage automatique du dossier auth_info pour générer un nouveau QR Code...');
        clearAuthAndReconnect();
        return;
      }

      if (shouldReconnect) {
        console.log('⏳ Tentative de reconnexion automatique dans 3 secondes...');
        setTimeout(() => {
          if (!isRestarting) createWhatsAppClient();
        }, 3000);
      }
    } else if (connection === 'open') {
      latestQr = null;
      connectionInfo.status = 'connected';
      connectionInfo.connectedAt = Date.now();
      const userNumber = sock.user?.id ? sock.user.id.split(':')[0] : 'Inconnu';
      console.log('\n=============================================================');
      console.log(`✅ CONNECTÉ AVEC SUCCÈS À WHATSAPP !`);
      console.log(`📱 Compte : +${userNumber}`);
      console.log(`🛡️  Protection anti-détection : Active`);
      console.log(`💬 Envoyez /help dans votre chat privé pour tester le bot.`);
      console.log('=============================================================\n');

      // Initialiser le planificateur du récapitulatif quotidien à 23h00
      initDailyRecapScheduler(sock);
    }
  });

  // Gestion des messages supprimés (Anti-Delete) et modifiés (Anti-Edit)
  sock.ev.on('messages.update', async (updates) => {
    if (!updates || !updates.length) return;
    for (const update of updates) {
      // 1. Détection des suppressions
      if (
        update.update?.messageStubType === WAMessageStubType.REVOKE ||
        update.update?.message === null
      ) {
        await handleRevokedMessage({
          sock,
          revokedKey: update.key,
          timestamp: Date.now()
        });
      }

      // 2. Détection des modifications
      const editedWrapper = update.update?.message?.editedMessage;
      if (editedWrapper) {
        const newRaw = editedWrapper.message || editedWrapper;
        const newText = extractTextFromMessage(newRaw).trim();
        await handleEditedMessage({
          sock,
          targetKey: update.key,
          newText,
          newRawMessage: newRaw,
          timestamp: Date.now()
        });
      }
    }
  });

  // Événements de groupe : Départs et arrivées de membres
  sock.ev.on('group-participants.update', async (event) => {
    try {
      await handleGroupParticipantsUpdate(sock, event);
    } catch (err) {
      console.error('[GroupParticipants] Erreur:', err.message);
    }
  });

  // Gestion des messages entrants
  sock.ev.on('messages.upsert', async (upsert) => {
    await handleMessagesUpsert({ sock, upsert, restartClient });
  });

  return sock;
}
