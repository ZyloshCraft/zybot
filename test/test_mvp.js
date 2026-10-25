import assert from 'node:assert';
import { loadConfig, getConfig, updateConfig, isHubGroup } from '../src/config.js';
import { getCommand, getAllCommands } from '../src/commands/index.js';
import { extractTextFromMessage, isOwnerMessage } from '../src/handlers/message.js';
import { normalizeTextForSearch, isKeywordMatched } from '../src/handlers/keywordAlert.js';
import { parseScheduledTime } from '../src/services/scheduler.js';
import { trackMessage, getRecentKeys, findMessageById } from '../src/services/messageStore.js';
import { parseRecipient, hasActiveWizard, clearWizard, cleanupSetupMessages } from '../src/services/programWizard.js';
import { parseTempDuration } from '../src/commands/temp.js';
import { getTodayStats, recordMessageSent, recordPrivateMessageReceived, formatRecapText } from '../src/services/statsTracker.js';
import { getBotVersion } from '../src/commands/bot.js';

console.log('🧪 Début des tests unitaires...');

// Test 1: Vérification des 21 commandes actives et de la version v1.10
const expected = [
  'bot', 'help', 'persoping', 'program',
  'alert', 'translate', 'clear', 'tagall', 'poll',
  'vv', 'reboot', 'edit', 'calc', 'rappel',
  'meteo', 'id', 'groupe', 'temp', 'recap', 'ntfy', 'update'
];
for (const name of expected) {
  const cmd = getCommand(name);
  assert.ok(cmd, `La commande ${name} doit exister dans le registre`);
}
assert.strictEqual(getCommand('vacances'), undefined, 'vacances doit être supprimé');
assert.strictEqual(getCommand('crypto'), undefined, 'crypto doit être supprimé');
assert.strictEqual(getCommand('vocal'), undefined, 'vocal doit être supprimé');

const currentVersion = getBotVersion();
assert.ok(currentVersion.includes('1.10'), `La version doit être v1.10 (obtenu: ${currentVersion})`);
console.log(`✅ Test 1 réussi : 21 commandes actives enregistrées, version ${currentVersion} validée.`);

// Test 2: Groupes du Hub Communautaire (y compris antidelete)
assert.strictEqual(isHubGroup('120363412992633770@g.us'), true, 'testbot doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363432686901629@g.us'), true, 'importantmsg doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363430665427462@g.us'), true, 'persopingunevue doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363413901804206@g.us'), true, 'notifds doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363430044075107@g.us'), true, 'antidelete doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('999999999999999999@g.us'), false, 'Un groupe externe ne doit pas être un Hub Group');
console.log('✅ Test 2 réussi : Détection des groupes du Hub Communauté validée.');

// Test 3: Mode Strict contre le spam de faux positifs (ex: "valise", "vallée" pour "val")
// Doit matcher en strict :
assert.strictEqual(isKeywordMatched('val', 'val', true), true, 'val doit matcher val');
assert.strictEqual(isKeywordMatched('Val', 'val', true), true, 'Val majuscule doit matcher val');
assert.strictEqual(isKeywordMatched('*Val*', 'val', true), true, '*Val* en gras doit matcher val');
assert.strictEqual(isKeywordMatched('salut val !', 'val', true), true, 'salut val ! doit matcher val');
assert.strictEqual(isKeywordMatched('val, tu viens ?', 'val', true), true, 'val avec ponctuation doit matcher val');
assert.strictEqual(isKeywordMatched('hey @val', 'val', true), true, 'hey @val doit matcher val');

// Doit être BLOQUÉ en strict (faux positifs de spam) :
assert.strictEqual(isKeywordMatched('Vallée', 'val', true), false, 'Vallée NE doit PAS matcher val');
assert.strictEqual(isKeywordMatched('Valle', 'val', true), false, 'Valle NE doit PAS matcher val');
assert.strictEqual(isKeywordMatched('valise', 'val', true), false, 'valise NE doit PAS matcher val');
assert.strictEqual(isKeywordMatched('valllllll', 'val', true), false, 'valllllll NE doit PAS matcher val');
assert.strictEqual(isKeywordMatched('D ailleurs je dois préparer ma valise', 'val', true), false, 'phrase avec valise NE doit PAS matcher val');
assert.strictEqual(isKeywordMatched('cheval', 'val', true), false, 'cheval NE doit PAS matcher val');
assert.strictEqual(isKeywordMatched('carnaval', 'val', true), false, 'carnaval NE doit PAS matcher val');

// Valentin doit matcher valentin mais pas val :
assert.strictEqual(isKeywordMatched('Salut valentin', 'valentin', true), true, 'Salut valentin doit matcher valentin');
assert.strictEqual(isKeywordMatched('Salut valentin', 'val', true), false, 'Salut valentin NE doit PAS matcher val en strict');
console.log('✅ Test 3 réussi : Mode strict anti-spam validé (bloque vallée, valise, etc. et accepte val isolé).');

// Test 4: Parseur de durée pour le mode /temp
const t30s = parseTempDuration('30s');
assert.strictEqual(t30s?.durationMs, 30000);
assert.strictEqual(t30s?.label, '30s');

const t5m = parseTempDuration('5m');
assert.strictEqual(t5m?.durationMs, 300000);
assert.strictEqual(t5m?.label, '5m');

const t1h = parseTempDuration('1h');
assert.strictEqual(t1h?.durationMs, 3600000);
assert.strictEqual(t1h?.label, '1h');

assert.strictEqual(parseTempDuration('invalide'), null);
console.log('✅ Test 4 réussi : Parseur de durée /temp validé.');

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

stored.text = 'Texte après édition secrète';
assert.strictEqual(findMessageById(testMsgId)?.text, 'Texte après édition secrète');
console.log('✅ Test 5 réussi : Mémorisation et capture des modifications Anti-Edit validée.');

console.log('\n🎉 Tous les tests unitaires sont passés avec succès !');
