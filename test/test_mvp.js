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

// Test 2: Normalisation des JIDs et suppression multiple (/clear 3, /clear 89)
const rawDeviceJid = '33612345678:42@s.whatsapp.net';
const cleanJid = '33612345678@s.whatsapp.net';

// Ajouter 100 messages pour tester un grand /clear (ex: 89)
for (let i = 1; i <= 100; i++) {
  trackMessage(rawDeviceJid, { id: `msg_bulk_${i}`, fromMe: true }, { timestamp: 1000 + i, text: `Test ${i}` });
}

// Vérifier que getRecentKeys avec le cleanJid retrouve bien les messages insérés avec rawDeviceJid !
const retrieved3 = getRecentKeys(cleanJid, 3, 'all');
assert.strictEqual(retrieved3.length, 3, 'Doit retourner exactement 3 messages');
assert.strictEqual(retrieved3[2].key.id, 'msg_bulk_100');

const retrieved89 = getRecentKeys(cleanJid, 89, 'all');
assert.strictEqual(retrieved89.length, 89, 'Doit retourner exactement 89 messages');
console.log('✅ Test 2 réussi : Normalisation JID et récupération multiple /clear (3 et 89 messages).');

// Test 3: Parseur de destinataire (/program)
const selfJid = '33600000000@s.whatsapp.net';
const groupJid = '123456@g.us';
assert.strictEqual(parseRecipient('0612345678', selfJid, groupJid), '33612345678@s.whatsapp.net');
assert.strictEqual(parseRecipient('+33 7 99 88 77 66', selfJid, groupJid), '33799887766@s.whatsapp.net');
assert.strictEqual(parseRecipient('moi', selfJid, groupJid), selfJid);
assert.strictEqual(parseRecipient('ici', selfJid, groupJid), groupJid);
console.log('✅ Test 3 réussi : Parseur de destinataire /program (06..., +33..., moi, ici).');

// Test 4: Retrouver la date originale pour /persoping
const foundOriginal = findMessageById('msg_bulk_50');
assert.ok(foundOriginal);
assert.strictEqual(foundOriginal.text, 'Test 50');
console.log('✅ Test 4 réussi : Date d\'envoi originale retrouvée avec succès.');

console.log('\n🎉 Tous les tests unitaires sont passés avec succès !');
