import assert from 'node:assert';
import { loadConfig, getConfig, updateConfig } from '../src/config.js';
import { getCommand, getAllCommands } from '../src/commands/index.js';
import { extractTextFromMessage, isOwnerMessage } from '../src/handlers/message.js';
import { parseScheduledTime } from '../src/services/scheduler.js';
import { trackMessage, getRecentKeys, findMessageById } from '../src/services/messageStore.js';
import { parseRecipient, hasActiveWizard, clearWizard } from '../src/services/programWizard.js';

console.log('🧪 Début des tests unitaires...');

// Test 1: Vérification des 18 commandes
const expected = [
  'bot', 'help', 'persoping', 'vacances', 'program',
  'alert', 'translate', 'clear', 'tagall', 'poll',
  'vv', 'reboot', 'vocal', 'edit', 'calc', 'rappel',
  'meteo', 'crypto'
];
for (const name of expected) {
  const cmd = getCommand(name);
  assert.ok(cmd, `La commande ${name} doit exister dans le registre`);
}
console.log('✅ Test 1 réussi : 18 commandes actives enregistrées.');

// Test 2: Parseur de destinataire (/program)
const selfJid = '33600000000@s.whatsapp.net';
const groupJid = '123456@g.us';
assert.strictEqual(parseRecipient('0612345678', selfJid, groupJid), '33612345678@s.whatsapp.net');
assert.strictEqual(parseRecipient('+33 7 99 88 77 66', selfJid, groupJid), '33799887766@s.whatsapp.net');
assert.strictEqual(parseRecipient('moi', selfJid, groupJid), selfJid);
assert.strictEqual(parseRecipient('ici', selfJid, groupJid), groupJid);
console.log('✅ Test 2 réussi : Parseur de destinataire /program (06..., +33..., moi, ici).');

// Test 3: Wizard de programmation
assert.strictEqual(hasActiveWizard('user_test'), false);
clearWizard('user_test');
console.log('✅ Test 3 réussi : Gestionnaire d\'état Wizard.');

// Test 4: MessageStore /clear avec modes 'all' et 'me'
const chatJid = 'test_chat@s.whatsapp.net';
trackMessage(chatJid, { id: 'msg_mine', fromMe: true }, { timestamp: 1000, text: 'Mon message' });
trackMessage(chatJid, { id: 'msg_other', fromMe: false }, { timestamp: 2000, text: 'Autre message' });

const forAll = getRecentKeys(chatJid, 10, 'all');
assert.strictEqual(forAll.length, 1);
assert.strictEqual(forAll[0].key.id, 'msg_mine');

const forMe = getRecentKeys(chatJid, 10, 'me');
assert.strictEqual(forMe.length, 2);
console.log('✅ Test 4 réussi : /clear filtre correctement pour "all" et "me".');

console.log('\n🎉 Tous les tests unitaires sont passés avec succès !');
