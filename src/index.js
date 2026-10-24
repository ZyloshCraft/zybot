import { loadConfig } from './config.js';
import { createWhatsAppClient, getActiveSocket } from './client.js';
import { startScheduler } from './services/scheduler.js';

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
  process.exit(1);
});

// Gestion des arrêts propres
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt du selfbot demandé (SIGINT). Au revoir !');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Arrêt du selfbot demandé (SIGTERM). Au revoir !');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Promesse non gérée (unhandledRejection):', reason);
});
