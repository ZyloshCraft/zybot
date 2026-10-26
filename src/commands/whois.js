import { getConfig } from '../config.js';
import { replyOrEdit } from '../utils/stealth.js';
import { getCachedGroupMetadata } from '../utils/groupCache.js';

// Table indicative des indicatifs téléphoniques les plus courants
const COUNTRY_CODES = {
  '33': '🇫🇷 France',
  '32': '🇧🇪 Belgique',
  '41': '🇨🇭 Suisse',
  '1': '🇺🇸/🇨🇦 USA / Canada',
  '44': '🇬🇧 Royaume-Uni',
  '49': '🇩🇪 Allemagne',
  '34': '🇪🇸 Espagne',
  '39': '🇮🇹 Italie',
  '351': '🇵🇹 Portugal',
  '212': '🇲🇦 Maroc',
  '213': '🇩🇿 Algérie',
  '216': '🇹🇳 Tunisie',
  '221': '🇸🇳 Sénégal',
  '225': '🇨🇮 Côte d\'Ivoire',
  '237': '🇨🇲 Cameroun',
  '243': '🇨🇩 RDC'
};

function getCountryName(phoneNumber) {
  for (const [code, country] of Object.entries(COUNTRY_CODES).sort((a, b) => b[0].length - a[0].length)) {
    if (phoneNumber.startsWith(code)) {
      return country;
    }
  }
  return '🌍 International';
}

export default {
  name: 'whois',
  description: 'Génère un dossier profil complet sur un contact (Photo HD, bio, groupes communs, business, etc.)',
  async execute({ sock, msg, jid, args }) {
    const config = getConfig();

    // 1. Identifier la cible (message cité, mention, argument, ou discussion privée)
    const msgContent = msg.message;
    const contextInfo =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.[Object.keys(msgContent || {})[0]]?.contextInfo;

    let targetJid = null;

    if (contextInfo?.participant) {
      targetJid = contextInfo.participant;
    } else if (contextInfo?.mentionedJid && contextInfo.mentionedJid.length > 0) {
      targetJid = contextInfo.mentionedJid[0];
    } else if (args[0]) {
      const cleanNum = args[0].replace(/[^0-9]/g, '');
      if (cleanNum.length >= 6) {
        targetJid = `${cleanNum}@s.whatsapp.net`;
      }
    } else if (!jid.endsWith('@g.us') && !jid.endsWith('@broadcast')) {
      targetJid = jid;
    }

    if (!targetJid) {
      await replyOrEdit(sock, jid, msg, 'Usage : Répondez au message de quelqu\'un avec `/whois`, mentionnez-le (`/whois @contact`), ou tapez son numéro (`/whois 33612345678`).');
      return;
    }

    // Normaliser JID
    targetJid = targetJid.split('@')[0].split(':')[0] + '@s.whatsapp.net';
    const rawNumber = targetJid.split('@')[0];
    const country = getCountryName(rawNumber);

    await replyOrEdit(sock, jid, msg, `🔎 Analyse du profil de +${rawNumber} en cours...`);

    // 2. Récupérer les informations en parallèle
    let pfpUrl = null;
    let bioStatus = null;
    let businessProfile = null;
    let mutualGroups = [];
    let groupRole = null;

    // A. Photo de profil HD
    try {
      pfpUrl = await sock.profilePictureUrl(targetJid, 'image');
    } catch {
      // Pas de photo ou photo privée
      pfpUrl = null;
    }

    // B. Bio / Statut texte
    try {
      const statusRes = await sock.fetchStatus(targetJid);
      bioStatus = statusRes?.status || null;
    } catch {
      bioStatus = null;
    }

    // C. Profil Professionnel (Business)
    try {
      businessProfile = await sock.getBusinessProfile(targetJid);
    } catch {
      businessProfile = null;
    }

    // D. Groupes en commun
    try {
      const allGroups = await sock.groupFetchAllParticipating();
      const groupList = Object.values(allGroups);
      for (const g of groupList) {
        const hasMember = g.participants?.some((p) => {
          const pNum = p.id.split('@')[0].split(':')[0];
          return pNum === rawNumber;
        });
        if (hasMember) {
          mutualGroups.push(g.subject || 'Groupe sans nom');
        }
      }
    } catch {
      mutualGroups = [];
    }

    // E. Rôle dans le groupe actuel si exécuté dans un groupe
    if (jid.endsWith('@g.us')) {
      try {
        const groupMeta = await getCachedGroupMetadata(sock, jid);
        const participant = groupMeta?.participants?.find((p) => p.id.split('@')[0].split(':')[0] === rawNumber);
        if (participant) {
          if (participant.admin === 'superadmin') groupRole = '👑 Créateur / SuperAdmin';
          else if (participant.admin === 'admin') groupRole = '⭐ Administrateur';
          else groupRole = 'Membre standard';
        }
      } catch {
        groupRole = null;
      }
    }

    // 3. Formater le rapport
    const lines = [
      `🕵️‍♂️ *DOSSIER PROFIL WHATSAPP*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📱 *Numéro :* +${rawNumber}`,
      `📍 *Pays estimé :* ${country}`,
      `💬 *Bio / Actu :* ${bioStatus ? `"${bioStatus}"` : '_(Aucune ou masquée)_'}`
    ];

    if (groupRole) {
      lines.push(`🛡️ *Rôle dans ce groupe :* ${groupRole}`);
    }

    if (businessProfile) {
      lines.push(`💼 *Type de compte :* Compte Professionnel (Business)`);
      if (businessProfile.description) lines.push(`📝 *Description Pro :* ${businessProfile.description}`);
      if (businessProfile.email) lines.push(`📧 *Email Pro :* ${businessProfile.email}`);
      if (businessProfile.website && businessProfile.website.length > 0) {
        lines.push(`🌐 *Site web :* ${businessProfile.website.join(', ')}`);
      }
      if (businessProfile.category) lines.push(`🏷️ *Catégorie :* ${businessProfile.category}`);
    } else {
      lines.push(`👤 *Type de compte :* Personnel standard`);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`👥 *Groupes en commun avec le bot :* ${mutualGroups.length}`);
    if (mutualGroups.length > 0) {
      const displayGroups = mutualGroups.slice(0, 8);
      displayGroups.forEach((g) => lines.push(`  • ${g}`));
      if (mutualGroups.length > 8) {
        lines.push(`  • _... et ${mutualGroups.length - 8} autre(s)_`);
      }
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🖼️ *Photo de profil HD :* ${pfpUrl ? 'Disponible ci-dessus' : 'Aucune (ou privée)'}`);

    const reportText = lines.join('\n');
    const targetHub = config.hub?.systemNotifs || jid;

    // 4. Envoyer avec photo HD dans le Hub Notifs (pour garder la furtivité) ou dans le chat
    if (pfpUrl) {
      await sock.sendMessage(targetHub, {
        image: { url: pfpUrl },
        caption: reportText
      });
    } else {
      await sock.sendMessage(targetHub, {
        text: reportText
      });
    }

    if (targetHub !== jid) {
      await replyOrEdit(sock, jid, msg, `✅ Dossier profil de +${rawNumber} envoyé dans votre hub système.`);
    }
  }
};
