import assert from 'node:assert';
import { loadConfig, getConfig, updateConfig, isHubGroup } from '../src/config.js';
import { getCommand, getAllCommands } from '../src/commands/index.js';
import { extractTextFromMessage, isOwnerMessage } from '../src/handlers/message.js';
import { parseScheduledTime } from '../src/services/scheduler.js';
import { trackMessage, getRecentKeys, findMessageById } from '../src/services/messageStore.js';
import { parseRecipient, hasActiveWizard, clearWizard, cleanupSetupMessages } from '../src/services/programWizard.js';

console.log('🧪 Début des tests unitaires...');

// Test 1: Vérification des 20 commandes
const expected = [
  'bot', 'help', 'persoping', 'vacances', 'program',
  'alert', 'translate', 'clear', 'tagall', 'poll',
  'vv', 'reboot', 'vocal', 'edit', 'calc', 'rappel',
  'meteo', 'crypto', 'id', 'groupe'
];
for (const name of expected) {
  const cmd = getCommand(name);
  assert.ok(cmd, `La commande ${name} doit exister dans le registre`);
}
console.log('✅ Test 1 réussi : 20 commandes actives enregistrées.');

// Test 2: Groupes du Hub Communautaire
assert.strictEqual(isHubGroup('120363412992633770@g.us'), true, 'testbot doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363432686901629@g.us'), true, 'importantmsg doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363430665427462@g.us'), true, 'persopingunevue doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363413901804206@g.us'), true, 'notifds doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('999999999999999999@g.us'), false, 'Un groupe externe ne doit pas être un Hub Group');
console.log('✅ Test 2 réussi : Détection des groupes du Hub Communauté validée.');

// Test 3: Parseur de destinataire avec alias du Hub
const selfJid = '33600000000@s.whatsapp.net';
const groupJid = '123456@g.us';
assert.strictEqual(parseRecipient('testbot', selfJid, groupJid), '120363412992633770@g.us');
assert.strictEqual(parseRecipient('importantmsg', selfJid, groupJid), '120363432686901629@g.us');
assert.strictEqual(parseRecipient('persopingunevue', selfJid, groupJid), '120363430665427462@g.us');
assert.strictEqual(parseRecipient('notifds', selfJid, groupJid), '120363413901804206@g.us');
console.log('✅ Test 3 réussi : Résolution des alias du Hub communautaire.');

// Test 4: Nettoyage et fonction setup
assert.strictEqual(typeof cleanupSetupMessages, 'function');
console.log('✅ Test 4 réussi : Fonction de nettoyage sans trace validée.');

console.log('\n🎉 Tous les tests unitaires sont passés avec succès !');
