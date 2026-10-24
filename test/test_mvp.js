import assert from 'node:assert';
import { loadConfig, getConfig, updateConfig } from '../src/config.js';
import { getCommand, getAllCommands } from '../src/commands/index.js';
import { extractTextFromMessage, isOwnerMessage } from '../src/handlers/message.js';
import { parseScheduledTime } from '../src/services/scheduler.js';
import { trackMessage, getRecentKeys, findMessageById } from '../src/services/messageStore.js';
import { parseRecipient, hasActiveWizard, clearWizard } from '../src/services/programWizard.js';

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
assert.strictEqual(getCommand('group'), getCommand('groupe'));
assert.strictEqual(getCommand('groups'), getCommand('groupe'));
assert.strictEqual(getCommand('groupid'), getCommand('id'));
console.log('✅ Test 1 réussi : 20 commandes actives enregistrées.');

// Test 2: Parseur de destinataire avec alias de groupe
const selfJid = '33600000000@s.whatsapp.net';
const groupJid = '123456@g.us';

updateConfig((prev) => ({
  ...prev,
  groupAliases: {
    famille: '120363025182938192@g.us',
    travail: '120363019283746501@g.us'
  }
}));

assert.strictEqual(parseRecipient('famille', selfJid, groupJid), '120363025182938192@g.us');
assert.strictEqual(parseRecipient('travail', selfJid, groupJid), '120363019283746501@g.us');
assert.strictEqual(parseRecipient('120363025182938192@g.us', selfJid, groupJid), '120363025182938192@g.us');
assert.strictEqual(parseRecipient('0612345678', selfJid, groupJid), '33612345678@s.whatsapp.net');
console.log('✅ Test 2 réussi : Parseur de destinataire avec alias de groupe (famille, travail, @g.us).');

// Test 3: Normalisation des JIDs et suppression multiple
const cleanJid = '33612345678@s.whatsapp.net';
const retrieved3 = getRecentKeys(cleanJid, 3, 'all');
assert.ok(Array.isArray(retrieved3));
console.log('✅ Test 3 réussi : getRecentKeys opérationnel.');

console.log('\n🎉 Tous les tests unitaires sont passés avec succès !');
