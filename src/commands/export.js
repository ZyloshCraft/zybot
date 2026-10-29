import { getConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { getChatMessages } from '../services/messageStore.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';

export default {
  name: 'export',
  description: 'Exporte les derniers messages de la discussion sous forme de fichier texte ou Markdown (.md)',
  async execute({ sock, msg, jid, args }) {
    const config = getConfig();

    let count = 50;
    let isMarkdown = false;

    for (const arg of args) {
      const lower = arg.toLowerCase();
      if (lower === 'md' || lower === 'markdown') {
        isMarkdown = true;
      } else {
        const parsed = parseInt(arg, 10);
        if (!isNaN(parsed) && parsed > 0) {
          count = Math.min(parsed, 500);
        }
      }
    }

    const messages = getChatMessages(jid, count);
    if (!messages || messages.length === 0) {
      await replyOrEdit(
        sock,
        jid,
        msg,
        '📭 Aucun message mémorisé pour cette discussion dans l\'historique récent du bot.'
      );
      return;
    }

    const formatLabel = isMarkdown ? 'Markdown (.md)' : 'texte (.txt)';
    await replyOrEdit(sock, jid, msg, `⏳ Génération de l'archive ${formatLabel} (${messages.length} messages)...`);

    // Déterminer le nom du chat
    let chatName = jid;
    if (jid.endsWith('@g.us')) {
      try {
        const meta = await getCachedGroupMetadata(sock, jid);
        chatName = meta?.subject || jid;
      } catch {
        chatName = jid;
      }
    } else {
      chatName = `Discussion privée (+${jid.split('@')[0]})`;
    }

    const exportDate = new Date().toLocaleString('fr-FR');
    let fullContent = '';
    let cleanFilename = '';
    let mimeType = 'text/plain';

    if (isMarkdown) {
      cleanFilename = `export_${chatName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.md`;
      mimeType = 'text/markdown';

      const mdHeader = [
        `# 📄 Archive de conversation WhatsApp — ZyBot`,
        ``,
        `- **💬 Discussion :** ${chatName}`,
        `- **🆔 Identifiant :** \`${jid}\``,
        `- **📅 Date d'export :** ${exportDate}`,
        `- **📊 Messages archivés :** ${messages.length}`,
        ``,
        `---`,
        ``,
        `## 📜 Historique des messages`,
        ``
      ].join('\n');

      const mdBody = messages.map((m) => {
        const d = new Date(m.timestamp).toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        const senderTag = m.fromMe
          ? '**Valentin (Moi)**'
          : (m.pushName ? `**${m.pushName}** (\`+${(m.sender || '').split('@')[0]}\`)` : `\`+${(m.sender || '').split('@')[0]}\``);

        const content = m.text ? m.text.replace(/\n/g, '\n> ') : '*(Média ou message sans texte)*';
        return `### ${senderTag} — *${d}*\n> ${content}\n`;
      }).join('\n---\n\n');

      fullContent = mdHeader + mdBody;
    } else {
      cleanFilename = `export_${chatName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.txt`;
      mimeType = 'text/plain';

      const headerLines = [
        '======================================================================',
        '📄 ARCHIVE DE CONVERSATION WHATSAPP — ZYBOT',
        `💬 Discussion : ${chatName}`,
        `🆔 Identifiant : ${jid}`,
        `📅 Date d'export : ${exportDate}`,
        `📊 Nombre de messages : ${messages.length}`,
        '======================================================================\n'
      ];

      const bodyLines = messages.map((m) => {
        const d = new Date(m.timestamp).toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        const senderTag = m.fromMe
          ? 'Valentin (Moi)'
          : (m.pushName ? `${m.pushName} (+${(m.sender || '').split('@')[0]})` : `+${(m.sender || '').split('@')[0]}`);

        const content = m.text ? m.text : '_(Média ou message sans texte)_';
        return `[${d}] ${senderTag} :\n${content}\n`;
      });

      fullContent = headerLines.concat(bodyLines).join('\n');
    }

    const fileBuffer = Buffer.from(fullContent, 'utf-8');
    const targetHub = config.hub?.systemNotifs || jid;

    await sock.sendMessage(targetHub, {
      document: fileBuffer,
      mimetype: mimeType,
      fileName: cleanFilename,
      caption: `📄 *Archive ${isMarkdown ? 'Markdown (.md)' : 'texte (.txt)'} générée avec succès*\n💬 Origine : *${chatName}*\n📊 Messages : *${messages.length}*\n📅 Date : ${exportDate}`
    });

    if (targetHub !== jid) {
      await replyOrEdit(sock, jid, msg, `✅ Archive de *${messages.length} messages* envoyée dans votre hub système (${isMarkdown ? '.md' : '.txt'}).`);
    }
  }
};
