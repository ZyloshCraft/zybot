import assert from 'node:assert';
import { loadConfig, getConfig, updateConfig, isHubGroup } from '../src/config.js';
import { getCommand, getAllCommands } from '../src/commands/index.js';
import { extractTextFromMessage, isOwnerMessage } from '../src/handlers/message.js';
import { normalizeTextForSearch, isKeywordMatched } from '../src/handlers/keywordAlert.js';
import { parseScheduledTime } from '../src/services/scheduler.js';
import { trackMessage, getRecentKeys, findMessageById, getChatMessages } from '../src/services/messageStore.js';
import { parseRecipient, hasActiveWizard, clearWizard, cleanupSetupMessages } from '../src/services/programWizard.js';
import { parseTempDuration } from '../src/commands/temp.js';
import { getTodayStats, recordMessageSent, recordPrivateMessageReceived, formatRecapText } from '../src/services/statsTracker.js';
import { getBotVersion } from '../src/commands/bot.js';
import { isDndActive } from '../src/services/ntfy.js';
import { trackStatus, getStatusesForUser } from '../src/services/statusStore.js';
import { addWarn, getWarns, clearWarns } from '../src/services/warnStore.js';
import { getCachedGroupMetadata, invalidateGroupMetadataCache } from '../src/utils/groupCache.js';

console.log('🧪 Début des tests unitaires...');

// Test 1: Vérification des 35 commandes actives et de la version v1.28
const expected = [
  'bot', 'help', 'persoping', 'program',
  'alert', 'translate', 'clear', 'vv', 'reboot', 'edit', 'calc',
  'meteo', 'id', 'groupe', 'alias', 'temp', 'recap', 'ntfy', 'update',
  'dnd', 'whois', 'statut', 'export', 'sticker', 'dl', 'texte',
  'resume', 'warn', 'antinsfw', 'music', 'toimg', 'pfp', 'top', 'trust', 'gw'
];
for (const name of expected) {
  const cmd = getCommand(name);
  assert.ok(cmd, `La commande ${name} doit exister dans le registre`);
}
// Vérification des alias
assert.ok(getCommand('s'), 'L\'alias "s" pour sticker doit exister');
assert.ok(getCommand('vocal'), 'L\'alias "vocal" pour texte doit exister');
assert.ok(getCommand('transcrire'), 'L\'alias "transcrire" pour texte doit exister');
assert.ok(getCommand('transcribe'), 'L\'alias "transcribe" pour texte doit exister');
assert.ok(getCommand('save'), 'L\'alias "save" pour persoping doit exister');
assert.ok(getCommand('telecharger'), 'L\'alias "telecharger" pour dl doit exister');
assert.ok(getCommand('av'), 'L\'alias "av" pour warn doit exister');
assert.ok(getCommand('aliases'), 'L\'alias "aliases" pour alias doit exister');
assert.ok(getCommand('summary'), 'L\'alias "summary" pour resume doit exister');
assert.ok(getCommand('nsfw'), 'L\'alias "nsfw" pour antinsfw doit exister');
assert.ok(getCommand('mp3'), 'L\'alias "mp3" pour music doit exister');
assert.ok(getCommand('song'), 'L\'alias "song" pour music doit exister');
assert.ok(getCommand('musique'), 'L\'alias "musique" pour music doit exister');
assert.ok(getCommand('img'), 'L\'alias "img" pour toimg doit exister');
assert.ok(getCommand('toimage'), 'L\'alias "toimage" pour toimg doit exister');
assert.ok(getCommand('pp'), 'L\'alias "pp" pour pfp doit exister');
assert.ok(getCommand('avatar'), 'L\'alias "avatar" pour pfp doit exister');
assert.ok(getCommand('classement'), 'L\'alias "classement" pour top doit exister');
assert.ok(getCommand('leaderboard'), 'L\'alias "leaderboard" pour top doit exister');
assert.ok(getCommand('activite'), 'L\'alias "activite" pour top doit exister');
assert.ok(getCommand('trusted'), 'L\'alias "trusted" pour trust doit exister');
assert.ok(getCommand('untrust'), 'L\'alias "untrust" pour trust doit exister');
assert.ok(getCommand('perms'), 'L\'alias "perms" pour trust doit exister');
assert.ok(getCommand('giveaway'), 'L\'alias "giveaway" pour gw doit exister');

// Vérification stricte des commandes supprimées
assert.strictEqual(getCommand('rappel'), undefined, 'rappel doit être supprimé');
assert.strictEqual(getCommand('poll'), undefined, 'poll doit être supprimé');
assert.strictEqual(getCommand('tagall'), undefined, 'tagall doit être supprimé');
assert.strictEqual(getCommand('ban'), undefined, 'ban doit être supprimé');
assert.strictEqual(getCommand('vacances'), undefined, 'vacances doit être supprimé');
assert.strictEqual(getCommand('crypto'), undefined, 'crypto doit être supprimé');

const currentVersion = getBotVersion();
assert.ok(currentVersion.includes('1.28'), `La version doit être v1.28 (obtenu: ${currentVersion})`);
console.log(`✅ Test 1 réussi : 35 commandes actives enregistrées, version ${currentVersion} validée.`);

// Test 2: Groupes du Hub Communautaire (y compris antidelete et admintaverne)
assert.strictEqual(isHubGroup('120363412992633770@g.us'), true, 'testbot doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363432686901629@g.us'), true, 'importantmsg doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363430665427462@g.us'), true, 'persopingunevue doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363413901804206@g.us'), true, 'notifds doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363430044075107@g.us'), true, 'antidelete doit être reconnu comme Hub Group');
assert.strictEqual(isHubGroup('120363424594930135@g.us'), true, 'admintaverne doit être reconnu comme Hub Group');
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

// Test 6: Mode Ne Pas Déranger (DND) de nuit (23:00 - 06:00 par défaut)
const nightDate1 = new Date('2026-10-25T23:30:00');
const nightDate2 = new Date('2026-10-25T02:15:00');
const nightDate3 = new Date('2026-10-25T05:59:00');
const dayDate1 = new Date('2026-10-25T06:01:00');
const dayDate2 = new Date('2026-10-25T14:30:00');
const dayDate3 = new Date('2026-10-25T22:59:00');

assert.strictEqual(isDndActive(nightDate1), true, '23:30 doit être silencieux (DND)');
assert.strictEqual(isDndActive(nightDate2), true, '02:15 doit être silencieux (DND)');
assert.strictEqual(isDndActive(nightDate3), true, '05:59 doit être silencieux (DND)');
assert.strictEqual(isDndActive(dayDate1), false, '06:01 doit être actif');
assert.strictEqual(isDndActive(dayDate2), false, '14:30 doit être actif');
assert.strictEqual(isDndActive(dayDate3), false, '22:59 doit être actif');
console.log('✅ Test 6 réussi : Algorithme DND (23h-06h traversant minuit) validé.');

// Test 7: Archivage des Statuts / Stories WhatsApp
const testSender = '33699887766@s.whatsapp.net';
trackStatus({
  key: { remoteJid: 'status@broadcast', participant: testSender, id: 'ST_001' },
  messageTimestamp: Math.floor(Date.now() / 1000),
  pushName: 'Alice',
  message: { imageMessage: { caption: 'Super journée à la plage !' } }
});
const aliceStatuses = getStatusesForUser('33699887766');
assert.strictEqual(aliceStatuses.length, 1, 'Alice doit avoir 1 statut archivé');
assert.strictEqual(aliceStatuses[0].type, 'image');
assert.strictEqual(aliceStatuses[0].caption, 'Super journée à la plage !');

// Test de recherche de statut via un identifiant LID (ex: 18081946574907@lid)
const lidSender = '18081946574907@lid';
trackStatus({
  key: { remoteJid: 'status@broadcast', participant: lidSender, id: 'ST_LID_01' },
  messageTimestamp: Math.floor(Date.now() / 1000),
  pushName: 'Valentin',
  message: { conversation: 'Statut texte LID' }
});
const lidStatuses1 = getStatusesForUser('18081946574907@lid');
assert.strictEqual(lidStatuses1.length, 1, 'Recherche par LID complet doit trouver le statut');
const lidStatuses2 = getStatusesForUser('18081946574907');
assert.strictEqual(lidStatuses2.length, 1, 'Recherche par numéro LID seul doit trouver le statut');
console.log('✅ Test 7 réussi : Système d\'archivage de statuts (numéros classiques et LIDs) validé.');

// Test 8: Extraction des messages pour la commande /export
const exportChatJid = '999888777@s.whatsapp.net';
trackMessage(exportChatJid, { id: 'EXP_01', remoteJid: exportChatJid, fromMe: false }, { text: 'Premier message test', sender: exportChatJid });
trackMessage(exportChatJid, { id: 'EXP_02', remoteJid: exportChatJid, fromMe: true }, { text: 'Deuxième message test' });
const exported = getChatMessages(exportChatJid, 10);
assert.ok(exported.length >= 2, 'getChatMessages doit retourner les messages de la conversation');
assert.strictEqual(exported[exported.length - 1].text, 'Deuxième message test');
console.log('✅ Test 8 réussi : Extraction d\'historique /export validée.');

// Test 9: Système d'avertissements (warnStore)
const testTarget = '33611223344';
addWarn(testTarget, { groupJid: '120363424594930135@g.us', groupName: 'Taverne', reason: 'Spam vocal', admin: 'Valentin' });
addWarn(testTarget, { groupJid: '120363424594930135@g.us', groupName: 'Taverne', reason: 'Insultes', admin: 'Valentin' });
const userWarns = getWarns(testTarget);
assert.strictEqual(userWarns.length, 2, 'L\'utilisateur doit avoir 2 warns');
assert.strictEqual(userWarns[0].reason, 'Spam vocal');
assert.strictEqual(userWarns[1].reason, 'Insultes');

const cleared = clearWarns(testTarget);
assert.strictEqual(cleared, 2, '2 warns doivent avoir été effacés');
assert.strictEqual(getWarns(testTarget).length, 0, 'L\'utilisateur ne doit plus avoir de warns');
console.log('✅ Test 9 réussi : Gestion du stockage des warns (ajout, liste, suppression) validée.');

// Test 10: Cache furtif des métadonnées de groupe (anti-spam IQ Stanzas)
let fakeNetworkCalls = 0;
const mockSock = {
  groupMetadata: async (jid) => {
    fakeNetworkCalls++;
    return { id: jid, subject: 'Groupe Secret', participants: [] };
  }
};
invalidateGroupMetadataCache('test_group@g.us');
const meta1 = await getCachedGroupMetadata(mockSock, 'test_group@g.us');
assert.strictEqual(meta1.subject, 'Groupe Secret');
assert.strictEqual(fakeNetworkCalls, 1, 'Premier appel doit interroger le réseau');

const meta2 = await getCachedGroupMetadata(mockSock, 'test_group@g.us');
assert.strictEqual(meta2.subject, 'Groupe Secret');
assert.strictEqual(fakeNetworkCalls, 1, 'Deuxième appel consécutif doit provenir du cache (0 appel réseau)');
console.log('✅ Test 10 réussi : Cache furtif de métadonnées groupe (anti-flag IQ stanzas) validé.');

// Test 11: Nouveaux outils médias (/music, /toimg, /pfp)
const musicCmd = getCommand('music');
assert.ok(musicCmd && typeof musicCmd.execute === 'function');
assert.strictEqual(musicCmd.aliases.includes('mp3'), true);

const toimgCmd = getCommand('toimg');
assert.ok(toimgCmd && typeof toimgCmd.execute === 'function');
assert.strictEqual(toimgCmd.aliases.includes('img'), true);

const pfpCmd = getCommand('pfp');
assert.ok(pfpCmd && typeof pfpCmd.execute === 'function');
assert.strictEqual(pfpCmd.aliases.includes('pp'), true);

const idCmd = getCommand('id');
assert.strictEqual(idCmd.adminOnly, true, '/id doit être autorisé pour les administrateurs');

// Test 12: Recherche de participant par pseudo et WarnResolver
const { findSenderByPushName } = await import('../src/services/messageStore.js');
const { HISTORIC_TARGETS } = await import('../src/services/warnResolver.js');
assert.ok(HISTORIC_TARGETS.length >= 60, 'La liste historique doit contenir au moins 60 cibles');

const foundSender = findSenderByPushName('Nolan');
assert.ok(foundSender, 'findSenderByPushName doit retrouver Nolan');
assert.strictEqual(foundSender.pushName, 'Nolan');

console.log('✅ Test 11 & 12 réussis : Modules médias et WarnResolver avec recherche par pseudo validés.');

// Test 13: Guide de modération /help warn
const { getWarnHelpGuide } = await import('../src/commands/help.js');
const guide = getWarnHelpGuide('/');
assert.ok(guide.includes('GUIDE MODÉRATEUR : MAÎTRISER LE /WARN'), 'Le guide doit contenir le titre');
assert.ok(guide.includes('/warn'), 'Le guide doit expliquer /warn');
assert.ok(guide.includes('/id'), 'Le guide doit expliquer /id');
assert.ok(guide.includes('/warn list'), 'Le guide doit expliquer /warn list');
assert.ok(guide.includes('/warn del'), 'Le guide doit expliquer /warn del');
console.log('✅ Test 13 réussi : Guide de modération /help warn validé.');

// Test 14: WebGUI Server & Sécurité
const { startWebServer, stopWebServer } = await import('../src/web/server.js');
const server = startWebServer();
assert.ok(server, 'Le serveur WebGUI doit démarrer avec succès');
stopWebServer();
console.log('✅ Test 14 réussi : Initialisation et cycle de vie WebGUI validés.');

// Test 15: Traqueur d'activité de groupe et détection des changements de pseudo
const { recordGroupMessage, getGroupLeaderboard, getAllGroupsActivity } = await import('../src/services/groupActivityStore.js');
recordGroupMessage({
  groupJid: 'test_group_123@g.us',
  groupName: 'Groupe Test Activité',
  senderJid: '33611223344@s.whatsapp.net',
  pushName: 'TestUser1'
});
recordGroupMessage({
  groupJid: 'test_group_123@g.us',
  groupName: 'Groupe Test Activité',
  senderJid: '33611223344@s.whatsapp.net',
  pushName: 'TestUser1'
});
recordGroupMessage({
  groupJid: 'test_group_123@g.us',
  groupName: 'Groupe Test Activité',
  senderJid: '33699887766@s.whatsapp.net',
  pushName: 'TestUser2'
});

const lb = getGroupLeaderboard('test_group_123@g.us');
assert.strictEqual(lb.totalMessages >= 3, true, 'Le total de messages doit être au moins 3');
assert.strictEqual(lb.leaderboard[0].count >= 2, true, 'Le premier utilisateur doit avoir au moins 2 messages');

const { checkAndTrackPseudo } = await import('../src/services/contactStore.js');
checkAndTrackPseudo('33600001111@s.whatsapp.net', 'AncienPseudo');
const pseudoChange = checkAndTrackPseudo('33600001111@s.whatsapp.net', 'NouveauPseudo');
assert.ok(pseudoChange, 'Le changement de pseudo doit être détecté');
assert.strictEqual(pseudoChange.oldName, 'AncienPseudo');
assert.strictEqual(pseudoChange.newName, 'NouveauPseudo');
console.log('✅ Test 15 réussi : Traqueur d\'activité de groupe (/top) et détection des changements de pseudo validés.');

// Test 16: Système de permissions (/trust, /untrust) et validation des droits
const { addTrustedUser, isUserTrusted, removeTrustedUser, revokeUser, isUserRevoked, unrevokeUser, canUserExecuteCommand } = await import('../src/services/permissionStore.js');

addTrustedUser({ target: '33688990011', name: 'TrustedUser' });
assert.strictEqual(isUserTrusted('33688990011'), true, 'L\'utilisateur doit être reconnu comme trusted');

revokeUser({ target: '33677889900', name: 'RevokedUser' });
assert.strictEqual(isUserRevoked('33677889900'), true, 'L\'utilisateur doit être reconnu comme révoqué');

// Vérification de canUserExecuteCommand
const allowedTrusted = await canUserExecuteCommand({
  sock: null,
  senderJid: '33688990011@s.whatsapp.net',
  commandName: 'warn',
  groupJid: '120363424594930135@g.us',
  isOwner: false
});
assert.strictEqual(allowedTrusted, true, 'Un membre trusted doit pouvoir exécuter /warn');

const deniedRevoked = await canUserExecuteCommand({
  sock: null,
  senderJid: '33677889900@s.whatsapp.net',
  commandName: 'warn',
  groupJid: '120363424594930135@g.us',
  isOwner: false
});
assert.strictEqual(deniedRevoked, false, 'Un membre révoqué NE doit PAS pouvoir exécuter /warn');

removeTrustedUser('33688990011');
unrevokeUser('33677889900');
assert.strictEqual(isUserTrusted('33688990011'), false, 'Après suppression, l\'utilisateur ne doit plus être trusted');
console.log('✅ Test 16 réussi : Système de permissions (/trust, /untrust, révocation) validé.');

// Test 17: Moteur de Giveaway (/gw, durées, réactions, /gw end et /gw reroll)
const {
  parseGiveawayDuration,
  formatRemainingTime,
  createGiveaway,
  handleGiveawayReaction,
  finishGiveaway,
  rerollGiveaway,
  getActiveGiveawayForGroup,
  getLatestGiveawayForGroup,
  getAllGiveaways
} = await import('../src/services/giveawayStore.js');

const p30m = parseGiveawayDuration('30m');
assert.strictEqual(p30m?.durationMs, 30 * 60 * 1000, '30m doit correspondre à 1800000ms');

const p2h = parseGiveawayDuration('2h');
assert.strictEqual(p2h?.durationMs, 2 * 3600 * 1000, '2h doit correspondre à 7200000ms');

const p1j = parseGiveawayDuration('1j');
assert.strictEqual(p1j?.durationMs, 24 * 3600 * 1000, '1j doit correspondre à 86400000ms');

const timeFmt = formatRemainingTime(3600000 * 2 + 1800000);
assert.ok(timeFmt.includes('2 heures'), 'formatRemainingTime doit formater les heures correctement');

// Test création et réaction giveaway
const mockSentMessages = [];
const gwMockSock = {
  sendMessage: async (jid, content) => {
    mockSentMessages.push({ jid, content });
    return { key: { remoteJid: jid, id: `msg_${Date.now()}` } };
  }
};

const gw = createGiveaway({
  groupJid: 'test_group_gw@g.us',
  messageId: 'gw_announce_123',
  messageKey: { remoteJid: 'test_group_gw@g.us', id: 'gw_announce_123' },
  prize: 'Discord Nitro 1 mois',
  durationMs: 60000,
  creatorJid: '33766337937@s.whatsapp.net'
});

assert.strictEqual(gw.status, 'active');
assert.strictEqual(gw.prize, 'Discord Nitro 1 mois');

// Simuler réaction d'un participant 1
await handleGiveawayReaction({
  sock: gwMockSock,
  messageId: 'gw_announce_123',
  reactorJid: '33611223344@s.whatsapp.net',
  emoji: '🎉',
  pushName: 'GamerOne'
});

// Simuler réaction d'un participant 2
await handleGiveawayReaction({
  sock: gwMockSock,
  messageId: 'gw_announce_123',
  reactorJid: '33655667788@s.whatsapp.net',
  emoji: '🚀',
  pushName: 'GamerTwo'
});

assert.strictEqual(gw.participants.length, 2, 'Il doit y avoir 2 participants');

// Vérifier que le DM de confirmation a été envoyé
const dmSent = mockSentMessages.find(m => m.jid.includes('33611223344'));
assert.ok(dmSent, 'Un DM de confirmation doit être envoyé au participant');
assert.ok(dmSent.content.text.includes('Participation enregistrée'), 'Le texte du DM doit confirmer la participation');

// Clôturer le giveaway (/gw end)
const endRes = await finishGiveaway(gwMockSock, gw.id);
assert.strictEqual(gw.status, 'completed');
assert.ok(gw.winner, 'Un gagnant doit être sélectionné');
const firstWinnerNumber = gw.winner.number;

// Relancer le tirage (/gw reroll)
const rerollRes = await rerollGiveaway(gwMockSock, gw.id);
assert.strictEqual(rerollRes.success, true);
assert.ok(rerollRes.winner, 'Un nouveau gagnant doit être sélectionné');
assert.strictEqual(rerollRes.winner.number !== firstWinnerNumber, true, 'Le reroll avec 2 participants doit désigner le second');

// Test helpers de recherche
const activeGw = getActiveGiveawayForGroup('test_group_gw@g.us');
assert.strictEqual(activeGw, undefined, 'Le giveaway étant terminé, aucun actif ne doit être retourné');

const latestGw = getLatestGiveawayForGroup('test_group_gw@g.us');
assert.strictEqual(latestGw?.id, gw.id, 'Le dernier giveaway doit être retrouvé');

console.log('✅ Test 17 réussi : Moteur de giveaway (/gw, durées, réactions, /gw end et /gw reroll) validé.');

console.log('\n🎉 Tous les tests unitaires sont passés avec succès !');
