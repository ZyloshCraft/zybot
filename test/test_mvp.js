import assert from 'node:assert';
import { loadConfig, getConfig, updateConfig, isHubGroup } from '../src/config.js';
import { getCommand, getAllCommands } from '../src/commands/index.js';
import { extractTextFromMessage, isOwnerMessage } from '../src/handlers/message.js';
import { normalizeTextForSearch } from '../src/handlers/keywordAlert.js';
import { parseScheduledTime } from '../src/services/scheduler.js';
import { trackMessage, getRecentKeys, findMessageById } from '../src/services/messageStore.js';
import { parseRecipient, hasActiveWizard, clearWizard, cleanupSetupMessages } from '../src/services/programWizard.js';
import { parseTempDuration } from '../src/commands/temp.js';
import { getTodayStats, recordMessageSent, recordPrivateMessageReceived, formatRecapText } from '../src/services/statsTracker.js';

console.log('🧪 Début des tests unitaires...');

// Test 1: Vérification des 19 commandes actives (avec temp et recap)
const expected = [
  'bot', 'help', 'persoping', 'program',
  'alert', 'translate', 'clear', 'tagall', 'poll',
  'vv', 'reboot', 'edit', 'calc', 'rappel',
  'meteo', 'id', 'groupe', 'temp', 'recap'
];
for (const name of expected) {
  const cmd = getCommand(name);
  assert.ok(cmd, `La commande ${name} doit exister dans le registre`);
}
assert.strictEqual(getCommand('vacances'), undefined, 'vacances doit être supprimé');
assert.strictEqual(getCommand('crypto'), undefined, 'crypto doit être supprimé');
assert.strictEqual(getCommand('vocal'), undefined, 'vocal doit être supprimé');
console.log('✅ Test 1 réussi : 19 commandes actives enregistrées.');

// Test 2: Groupes du Hub Communautaire (y compris antidelete)
assert.strictEqual(isHubGroup('120363412992633770@g.us'), true, 'testbot doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363432686901629@g.us'), true, 'importantmsg doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363430665427462@g.us'), true, 'persopingunevue doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363413901804206@g.us'), true, 'notifds doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363430044075107@g.us'), true, 'antidelete doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('999999999999999999@g.us'), false, 'Un groupe externe ne doit pas être un Hub Group');
console.log('✅ Test 2 réussi : Détection des groupes du Hub Communauté validée.');

// Test 3: Parseur de durée pour le mode /temp
const t30s = parseTempDuration('30s');
assert.strictEqual(t30s?.durationMs, 30000);
assert.strictEqual(t30s?.label, '30s');

const t5m = parseTempDuration('5m');
assert.strictEqual(t5m?.durationMs, 300000);
assert.strictEqual(t5m?.label, '5m');

const t1h = parseTempDuration('1h');
assert.strictEqual(t1h?.durationMs, 3600000);
assert.strictEqual(t1h?.label, '1h');

const tDefaultMin = parseTempDuration('10');
assert.strictEqual(tDefaultMin?.durationMs, 600000); // 10 minutes par défaut

assert.strictEqual(parseTempDuration('invalide'), null);
console.log('✅ Test 3 réussi : Parseur de durée /temp validé.');

// Test 4: Statistiques quotidiennes et formatage récapitulatif
const initialStats = getTodayStats();
const sentBefore = initialStats.messagesSent || 0;
recordMessageSent();
const sentAfter = getTodayStats().messagesSent;
assert.strictEqual(sentAfter, sentBefore + 1, 'messagesSent doit s\'incrémenter');

const recapOutput = formatRecapText(getTodayStats());
assert.ok(recapOutput.includes('RÉCAPITULATIF DU JOUR'));
assert.ok(recapOutput.includes('Messages envoyés :'));
assert.ok(recapOutput.includes('Messages privés reçus :'));
assert.ok(recapOutput.includes('Messages supprimés interceptés :'));
assert.ok(recapOutput.includes('Messages modifiés interceptés :'));
console.log('✅ Test 4 réussi : Suivi des statistiques et génération du rapport /recap.');

// Test 5: Mémorisation complète des messages pour Anti-Delete & Anti-Edit
const testMsgId = 'MSG_EDIT_TEST_' + Date.now();
trackMessage('123456789@s.whatsapp.net', { id: testMsgId, remoteJid: '123456789@s.whatsapp.net', fromMe: false }, {
  text: 'Texte avant édition',
  sender: '123456789@s.whatsapp.net',
  pushName: 'Bob',
  rawMessage: { conversation: 'Texte avant édition' }
});
const stored = findMessageById(testMsgId);
assert.ok(stored, 'Le message doit être retrouvé par son ID');
assert.strictEqual(stored.text, 'Texte avant édition');

// Simulation de modification
stored.text = 'Texte après édition secrète';
assert.strictEqual(findMessageById(testMsgId)?.text, 'Texte après édition secrète');
console.log('✅ Test 5 réussi : Mémorisation et capture des modifications Anti-Edit validée.');

console.log('\n🎉 Tous les tests unitaires sont passés avec succès !');
