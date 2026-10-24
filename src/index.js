import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createWhatsAppClient, getActiveSocket } from './client.js';
import { startScheduler } from './services/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PID_FILE = path.resolve(__dirname, '../bot.pid');

/**
 * Empêche l'exécution simultanée de plusieurs instances de ZyBot
 * pour éliminer définitivement l'erreur "Stream Errored (conflict) (code: 440)".
 */
function ensureSingleInstance() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
      if (!isNaN(oldPid) && oldPid !== process.pid) {
        try {
          process.kill(oldPid, 0); // Vérifie si le processus existe
          console.log(`⚠️ Une instance précédente de ZyBot (PID ${oldPid}) était active.`);
          console.log(`🧹 Fermeture de l'ancienne instance pour éviter tout conflit de session (code 440)...`);
          process.kill(oldPid, 'SIGTERM');
        } catch (e) {
          // L'ancien processus n'est plus en cours d'exécution
        }
      }
    }
    fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8');
  } catch (err) {
    console.warn('[PID] Avertissement gestion instance unique:', err.message);
  }
}

function cleanupPid() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const current = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
      if (current === process.pid) {
        fs.unlinkSync(PID_FILE);
      }
    }
  } catch (e) {}
}

ensureSingleInstance();

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🤖 ZyBot - WhatsApp Selfbot (Furtif & Zero-Trace)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// 1. Charger la configuration
loadConfig();

// 2. Démarrer le service de programmation
startScheduler(getActiveSocket);

// 3. Lancer le client WhatsApp
createWhatsAppClient().catch((err) => {
  console.error('❌ Erreur fatale au lancement du client WhatsApp:', err);
  cleanupPid();
  process.exit(1);
});

// Gestion des arrêts propres
process.on('exit', cleanupPid);

process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt du selfbot demandé (SIGINT). Au revoir !');
  cleanupPid();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Arrêt du selfbot demandé (SIGTERM). Au revoir !');
  cleanupPid();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Promesse non gérée (unhandledRejection):', reason);
});
