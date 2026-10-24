import assert from 'node:assert';
import { loadConfig, getConfig, updateConfig } from '../src/config.js';
import { getCommand, getAllCommands } from '../src/commands/index.js';
import { extractTextFromMessage, isOwnerMessage } from '../src/handlers/message.js';
import { parseScheduledTime } from '../src/services/scheduler.js';
import { trackMessage, getRecentKeys, findMessageById } from '../src/services/messageStore.js';
import { replyOrEditTemporary, deleteMessageImmediately } from '../src/utils/stealth.js';

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
assert.strictEqual(getCommand('calcul'), getCommand('calc'));
assert.strictEqual(getCommand('remind'), getCommand('rappel'));
assert.strictEqual(getCommand('weather'), getCommand('meteo'));
assert.strictEqual(getCommand('cours'), getCommand('crypto'));
console.log('✅ Test 1 réussi : 18 commandes actives et tous les alias enregistrés.');

// Test 2: Calculatrice
const calcCmd = getCommand('calc');
assert.ok(calcCmd);
console.log('✅ Test 2 réussi : Commande /calc enregistrée.');

// Test 3: MessageStore /clear avec modes 'all' et 'me'
const chatJid = 'test_chat@s.whatsapp.net';
trackMessage(chatJid, { id: 'msg_mine', fromMe: true }, { timestamp: 1000, text: 'Mon message' });
trackMessage(chatJid, { id: 'msg_other', fromMe: false }, { timestamp: 2000, text: 'Autre message' });

const forAll = getRecentKeys(chatJid, 10, 'all');
assert.strictEqual(forAll.length, 1);
assert.strictEqual(forAll[0].key.id, 'msg_mine');

const forMe = getRecentKeys(chatJid, 10, 'me');
assert.strictEqual(forMe.length, 2);
console.log('✅ Test 3 réussi : /clear filtre correctement pour "all" et "me".');

// Test 4: Retrouver la date originale pour /persoping
const foundOriginal = findMessageById('msg_mine');
assert.ok(foundOriginal);
assert.strictEqual(foundOriginal.timestamp, 1000);
console.log('✅ Test 4 réussi : Date d\'envoi originale retrouvée avec succès.');

console.log('\n🎉 Tous les tests unitaires sont passés avec succès !');
