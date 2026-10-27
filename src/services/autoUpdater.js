import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../config.js';
import { notifySystem } from './notifier.js';
import { sendNtfyNotification } from './ntfy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.resolve(__dirname, '../../config.json');

const execAsync = promisify(exec);

let updateInterval = null;
let isUpdating = false;

/**
 * Vérifie si une mise à jour est disponible sur le dépôt GitHub
 * et l'applique automatiquement.
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {boolean} [manual=false]
 * @returns {Promise<{ updated: boolean, message: string }>}
 */
export async function checkAndApplyUpdate(sock, manual = false) {
  if (isUpdating) {
    return { updated: false, message: 'Mise à jour déjà en cours...' };
  }

  try {
    isUpdating = true;

    // 1. Récupérer les dernières infos depuis GitHub
    await execAsync('git fetch origin main');

    // 2. Comparer les commits
    const { stdout: localHead } = await execAsync('git rev-parse HEAD');
    const { stdout: remoteHead } = await execAsync('git rev-parse origin/main');

    const localCommit = localHead.trim();
    const remoteCommit = remoteHead.trim();

    if (localCommit === remoteCommit) {
      if (manual) console.log('[AutoUpdate] ZyBot est déjà à jour (commit ' + localCommit.slice(0, 7) + ').');
      isUpdating = false;
      return { updated: false, message: 'ZyBot est déjà à jour.' };
    }

    // Récupérer le message du commit
    const { stdout: commitInfo } = await execAsync('git log -1 --pretty=format:"%s (%h)" origin/main');
    const commitMsg = commitInfo.trim();

    console.log(`\n🚀 [AutoUpdate] Nouveau commit détecté sur GitHub : "${commitMsg}"`);
    console.log('📦 Téléchargement et application de la mise à jour...');

    // 3. Sauvegarder les configurations locales (mot de passe web, alertes personnalisées)
    let savedLocalConfig = null;
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        savedLocalConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      }
    } catch {}

    // 4. Effectuer le git pull sans conflit
    let pullOutput = '';
    try {
      await execAsync('git checkout -- .');
      const res = await execAsync('git pull origin main');
      pullOutput = res.stdout;
    } catch (pullErr) {
      console.warn('[AutoUpdate] Conflit de mise à jour détecté, alignement forcé sur origin/main :', pullErr.message);
      await execAsync('git reset --hard origin/main');
      pullOutput = 'package.json'; // Forcer vérification des dépendances par sécurité
    }

    // 5. Réappliquer et fusionner les préférences locales personnalisées
    if (savedLocalConfig) {
      try {
        const repoConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        const merged = { ...repoConfig, ...savedLocalConfig };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
      } catch {}
    }

    // 5. Vérifier si des dépendances package.json ont changé
    if (pullOutput.includes('package.json') || pullOutput.includes('package-lock.json')) {
      console.log('📦 Mise à jour des dépendances npm...');
      await execAsync('npm install --omit=dev');
    }

    // 5. Envoyer les notifications
    const updateText = `🚀 *ZyBot mis à jour automatiquement !*\n• Version : ${commitMsg}`;
    await notifySystem(sock, updateText);
    await sendNtfyNotification({
      title: '🚀 ZyBot Mis à Jour !',
      message: `Nouveau commit appliqué : ${commitMsg}`,
      priority: 'high',
      tags: ['rocket', 'recycle']
    });

    console.log('🔄 Redémarrage du bot pour appliquer les nouveautés...');

    // 6. Redémarrage propre
    if (sock) {
      try {
        sock.end();
      } catch (e) {}
    }

    // Si on tourne sous PM2 (process.env.pm_id est défini par PM2)
    if (process.env.pm_id !== undefined || process.env.PM2_HOME !== undefined) {
      console.log('[AutoUpdate] Redémarrage automatique géré par PM2...');
      process.exit(0);
    } else {
      // Relance autonome par spawn
      setTimeout(() => {
        const child = spawn(process.argv[0], process.argv.slice(1), {
          cwd: process.cwd(),
          detached: true,
          stdio: 'inherit'
        });
        child.unref();
        process.exit(0);
      }, 500);
    }

    return { updated: true, message: `Mis à jour avec succès : ${commitMsg}` };
  } catch (err) {
    console.error('[AutoUpdate] Erreur lors de la mise à jour:', err.message);
    isUpdating = false;
    return { updated: false, message: `Erreur mise à jour : ${err.message}` };
  }
}

/**
 * Démarre le vérificateur automatique de mises à jour
 * @param {() => import('@whiskeysockets/baileys').WASocket} getSocket
 */
export function startAutoUpdater(getSocket) {
  if (updateInterval) return;

  const config = getConfig();
  const enabled = config.autoUpdate?.enabled ?? true;
  if (!enabled) return;

  const intervalMinutes = config.autoUpdate?.intervalMinutes || 1;
  const intervalMs = Math.max(intervalMinutes * 60 * 1000, 30000); // Minimum 30s

  console.log(`🔄 Service Auto-Update actif (vérification toutes les ${intervalMinutes} min).`);

  updateInterval = setInterval(async () => {
    const sock = getSocket ? getSocket() : null;
    await checkAndApplyUpdate(sock, false);
  }, intervalMs);
}
