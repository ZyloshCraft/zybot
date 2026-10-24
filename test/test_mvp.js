import assert from 'node:assert';
import { loadConfig, getConfig, updateConfig, isHubGroup } from '../src/config.js';
import { getCommand, getAllCommands } from '../src/commands/index.js';
import { extractTextFromMessage, isOwnerMessage } from '../src/handlers/message.js';
import { normalizeTextForSearch } from '../src/handlers/keywordAlert.js';
import { parseScheduledTime } from '../src/services/scheduler.js';
import { trackMessage, getRecentKeys, findMessageById } from '../src/services/messageStore.js';
import { parseRecipient, hasActiveWizard, clearWizard, cleanupSetupMessages } from '../src/services/programWizard.js';

console.log('🧪 Début des tests unitaires...');

// Test 1: Vérification des 17 commandes actives (sans vacances, crypto, vocal)
const expected = [
  'bot', 'help', 'persoping', 'program',
  'alert', 'translate', 'clear', 'tagall', 'poll',
  'vv', 'reboot', 'edit', 'calc', 'rappel',
  'meteo', 'id', 'groupe'
];
for (const name of expected) {
  const cmd = getCommand(name);
  assert.ok(cmd, `La commande ${name} doit exister dans le registre`);
}
assert.strictEqual(getCommand('vacances'), undefined, 'vacances doit être supprimé');
assert.strictEqual(getCommand('crypto'), undefined, 'crypto doit être supprimé');
assert.strictEqual(getCommand('vocal'), undefined, 'vocal doit être supprimé');
console.log('✅ Test 1 réussi : 17 commandes actives enregistrées, commandes retirées confirmées.');

// Test 2: Groupes du Hub Communautaire (y compris antidelete)
assert.strictEqual(isHubGroup('120363412992633770@g.us'), true, 'testbot doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363432686901629@g.us'), true, 'importantmsg doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363430665427462@g.us'), true, 'persopingunevue doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363413901804206@g.us'), true, 'notifds doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363430044075107@g.us'), true, 'antidelete doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('999999999999999999@g.us'), false, 'Un groupe externe ne doit pas être un Hub Group');
console.log('✅ Test 2 réussi : Détection des groupes du Hub Communauté (dont antidelete) validée.');

// Test 3: Parseur de destinataire avec alias du Hub
const selfJid = '33600000000@s.whatsapp.net';
const groupJid = '123456@g.us';
assert.strictEqual(parseRecipient('testbot', selfJid, groupJid), '120363412992633770@g.us');
assert.strictEqual(parseRecipient('importantmsg', selfJid, groupJid), '120363432686901629@g.us');
assert.strictEqual(parseRecipient('persopingunevue', selfJid, groupJid), '120363430665427462@g.us');
assert.strictEqual(parseRecipient('notifds', selfJid, groupJid), '120363413901804206@g.us');
assert.strictEqual(parseRecipient('antidelete', selfJid, groupJid), '120363430044075107@g.us');
console.log('✅ Test 3 réussi : Résolution des alias du Hub communautaire.');

// Test 4: Normalisation et détection intelligente des mots-clés
const kw = 'bonjour';
const testCases = [
  'Bonjour',
  'bonJour',
  'BONJOUR',
  '*Bonjour*',
  '_bonjour_',
  'bonjourca va',
  'salutbonjour',
  'Bònjour les amis'
];
for (const phrase of testCases) {
  const normPhrase = normalizeTextForSearch(phrase);
  const normKw = normalizeTextForSearch(kw);
  const matched = phrase.toLowerCase().includes(kw) || normPhrase.includes(normKw);
  assert.strictEqual(matched, true, `La phrase "${phrase}" doit matcher le mot-clé "${kw}"`);
}
console.log('✅ Test 4 réussi : Tolérance casse, accents, gras/italique et concaténation pour mots-clés validée.');

// Test 5: Mémorisation complète des messages pour Anti-Delete
const testMsgId = 'MSG_TEST_' + Date.now();
trackMessage('123456789@s.whatsapp.net', { id: testMsgId, remoteJid: '123456789@s.whatsapp.net', fromMe: false }, {
  text: 'Message secret avant suppression',
  sender: '123456789@s.whatsapp.net',
  pushName: 'Alice',
  rawMessage: { conversation: 'Message secret avant suppression' }
});
const stored = findMessageById(testMsgId);
assert.ok(stored, 'Le message doit être retrouvé par son ID');
assert.strictEqual(stored.text, 'Message secret avant suppression');
assert.strictEqual(stored.pushName, 'Alice');
assert.ok(stored.rawMessage, 'Le message brut doit être disponible pour retranscription média');
console.log('✅ Test 5 réussi : Mémorisation et récupération anti-suppression validée.');

console.log('\n🎉 Tous les tests unitaires sont passés avec succès !');
