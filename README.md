# 🤖 ZyBot — Selfbot WhatsApp Furtif & Intelligent

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v20+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Baileys-v7.0-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Baileys" />
  <img src="https://img.shields.io/badge/Mode-Zero--Trace%20Stealth-blueviolet?style=for-the-badge&logo=security&logoColor=white" alt="Stealth" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
</p>

**ZyBot** est un selfbot WhatsApp modulaire, discret et ultra-épuré pour compte personnel, conçu sur l'architecture **Baileys** (`@whiskeysockets/baileys`). Doté d'un **moteur anti-détection avancé (Stealth Engine)**, d'un **système Anti-Delete & Anti-Edit**, d'un **mode éphémère sélectif (`/temp`)** et d'un **Hub Communautaire privé**, il s'exécute directement sur votre session sans laisser de traces suspectes.

---

## 🛡️ Architecture Furtive & Fonctionnalités Clés

### 1. 🗑️ Moteur Anti-Delete & ✏️ Anti-Edit (Zéro Message Perdu)
- **Anti-Delete** : Intercepte automatiquement **tous les messages supprimés pour tous** par d'autres utilisateurs (textes, photos, vidéos, vocaux, stickers, documents) et les retransmet instantanément dans le groupe dédié **`antidelete`** (`120363430044075107@g.us`).
- **Anti-Edit** : Intercepte en temps réel les **messages modifiés** par vos interlocuteurs et affiche dans `antidelete` le comparatif exact :
  - ❌ *Avant :* [ancien texte]
  - ✅ *Après :* [nouveau texte]
- Filtre intelligemment vos propres actions (pas de faux positifs lors d'un `/clear` ou d'un `/edit`).

### 2. 🏛️ Hub Communautaire de Gestion Dédié
Au lieu d'encombrer votre chat personnel, ZyBot achemine chaque catégorie d'événement vers vos groupes de gestion privés :
- 🧪 **Groupe Test (`testbot`)** : `120363412992633770@g.us`
- 🚨 **Groupe Alertes Mots-Clés (`importantmsg`)** : `120363432686901629@g.us`
- 🔒 **Groupe Vue-Unique & Persoping (`persopingunevue`)** : `120363430665427462@g.us`
- 📢 **Groupe Notifications Système (`notifds`)** : `120363413901804206@g.us`
- 🗑️ **Groupe Anti-Delete & Anti-Edit (`antidelete`)** : `120363430044075107@g.us`
- 🛡️ **Groupe Administration & Modération (`admintaverne`)** : `120363424594930135@g.us`

> **Règle d'or : Dans tous ces groupes du Hub ainsi qu'en message privé, les messages ne s'effacent JAMAIS.**

### 3. ⏱️ Auto-Destruction Sélective (`/temp`)
- Activez l'auto-destruction automatique de **tous vos prochains messages** dans une discussion spécifique :
  - `/temp 30s`, `/temp 5m`, `/temp 1h`, etc.
  - Vos messages envoyés dans cette discussion s'effacent automatiquement pour tous après le délai configuré.
  - Désactivation en un clin d'œil avec `/temp off`.

### 4. 📊 Statistiques Journalières & Rapport Automatique (`/recap`)
- Suivi automatique de votre activité quotidienne :
  - Messages envoyés par vous.
  - Messages reçus en privé (hors groupes).
  - Messages supprimés interceptés par l'Anti-Delete.
  - Messages modifiés interceptés par l'Anti-Edit.
  - Alertes mots-clés déclenchées.
  - Vues uniques capturées.
- **Rapport automatique tous les soirs à 23h00** envoyé discrètement dans votre groupe `notifds`.
- Consultation instantanée à tout moment avec `/recap`.

### 5. 🔔 Notifications Mémoire Long Terme (`notifds`)
Dès qu'un élément persistant est ajouté ou supprimé de la configuration, une notification est automatiquement envoyée dans votre groupe `notifds` avec les émojis dédiés :
- `✅ Alias : <nom> <id_groupe>` / `🗑️ Alias : <nom> supprimé`
- `✅ Mot-clé : <mot>` / `🗑️ Mot-clé : <mot> supprimé`
- `✅ Mode temporaire : activé (<temps>) pour <jid>` / `🗑️ Mode temporaire : désactivé`
- Récapitulatif complet de chaque message programmé avec `/program` ou `/rappel`.

### 6. 🚨 Détection Intelligente, Mode Strict & Blacklist Anti-Troll
Le système `/alert` surveille tous les groupes et discussions avec une protection anti-spam avancée :
- **Mode Strict Anti-Faux Positifs (Activé par défaut)** : Les mots courts comme `val` ne se déclenchent **QUE** s'ils sont isolés (ex: `salut val`, `hey @val`, `*Val*`). Les mots rattachés comme `valise`, `vallée`, `cheval` ou `valllllll` sont automatiquement ignorés !
- **🚫 Blacklist Anti-Troll (`/alert ignore <numéro>`)** : Si un plaisantin s'amuse à spammer votre mot-clé, ignorez-le définitivement d'une seule commande. Vous pouvez aussi répondre à son message avec `/alert ignore`. Ses messages ne déclencheront plus jamais d'alerte. Retrait facile avec `/alert unignore <numéro>`.
- **Insensible à la casse** : `val`, `Val`, `VAL`.
- **Insensible au formatage** : `*val*` (gras), `_val_` (italique), `~val~` (barré).
- **Insensible aux accents** : `héros` / `heros`, `Valèntin` / `valentin`.
- **Contrôle rapide** : Activez ou désactivez le mode strict avec `/alert strict on` ou `/alert strict off`.

### 7. 🌙 Mode Ne Pas Déranger (DND) pour Alertes Push (`/dnd`)
- **Silence Nocturne Automatique (23h00 - 06h00 par défaut)** : Les notifications push `ntfy` sur smartphone sont automatiquement mises en sourdine chaque nuit pour préserver votre sommeil.
- **DND Temporaire** : Coupez les notifications pour une durée déterminée avec `/dnd 2h`, `/dnd 30m`, etc.
- **Personnalisation des Horaires** : Réglez votre propre créneau en tapant simplement `/dnd 22:30 07:00` ou `/dnd 23h 06h`.

### 8. 🕵️‍♂️ Dossier Profil Complet & OSINT WhatsApp (`/whois`)
Générez instantanément une fiche d'information approfondie sur n'importe quel contact :
- **Photo de profil en Haute Définition (HD)** récupérée et envoyée dans votre hub `notifds`.
- **Bio / Statut WhatsApp** et historique.
- **Groupes en commun avec vous** (nombre total et liste des groupes partagés).
- **Type de compte** (Personnel ou WhatsApp Business avec description, email pro, site web et catégorie).
- **Pays estimé** et indicatif téléphonique.
- **Rôle dans le groupe courant** (SuperAdmin, Admin, Membre).

### 9. 📸 Archivage & Téléchargement des Statuts / Stories (`/statut`)
- **Archivage Furtif Continu** : Le bot intercepte et met en mémoire les statuts (photos, vidéos, textes) publiés par vos contacts sans envoyer d'accusé de lecture.
- **Inspection Rapide** : Tapez `/statut` pour voir qui a publié des statuts récemment.
- **Extraction & Téléchargement** : Tapez `/statut <numéro_ou_mention>` (ou répondez au message de quelqu'un avec `/statut`) pour recevoir toutes ses stories en haute qualité directement dans votre hub `notifds` !

### 10. 📲 Notifications Push Smartphone Instantanées (`/ntfy`)
- **Sonnerie & Vibration en temps réel** : Même avec WhatsApp fermé ou téléphone verrouillé, recevez des notifications push instantanées via l'application gratuite et open-source **ntfy** (iOS/Android).
- Relié en direct à vos alertes :
  - 🚨 Alertes mots-clés (`importantmsg`).
  - 🗑️ Messages supprimés et ✏️ modifiés (`antidelete`).
  - 👁️ Vues uniques capturées (`persopingunevue`).
- Configuration ultra-rapide avec `/ntfy <nom_du_canal>`.

### 8. 🥷 Furtivité Zéro-Trace & Browser Spoofing
- **Empreinte Officielle** : Le bot s'identifie auprès des serveurs WhatsApp comme un navigateur légitime `Google Chrome` sur `macOS` (`Mac OS / Chrome`).
- **Comportement Humain** : Simulation d'écriture (`composing`) pendant un intervalle aléatoire (**1,5s à 3,5s**).
- **Suppression Invisible `/program`** : À la fin de la programmation, les messages du guide pas-à-pas sont supprimés pour tous puis pour vous-même, évitant l'encart *"Ce message a été supprimé"*.
- **Suppression Échelonnée Rapide `/clear`** : Délai optimisé de 60ms à 130ms (mode `all`) et 40ms à 80ms (mode `me`) pour supprimer 10 messages en ~1 seconde sans blocage ni risque de détection.

---

## ⚡ Liste Complète des Commandes

Toutes les commandes se déclenchent avec le préfixe `/` (exécutables uniquement par vous-même).

### 🥷 Furtivité, Nettoyage & Médias
| Commande | Syntaxe | Description |
| :--- | :--- | :--- |
| **`/s`** | *(En réponse ou légende)* `/s` | Convertit instantanément n'importe quelle photo ou courte vidéo en **vrai sticker WhatsApp officiel**. |
| **`/dl`** | `/dl <lien>` | Télécharge et envoie directement une vidéo TikTok (sans filigrane), Twitter/X, Instagram ou YouTube. |
| **`/texte`** | *(En réponse)* `/texte` | Transcrit une note vocale audio reçue en texte écrit clair sans avoir besoin de l'écouter. |
| **`/export`** | `/export [nb]` | Exporte les N derniers messages du chat sous forme d'archive texte propre transmise dans `notifds`. |
| **`/vv`** | *(En réponse)* `/vv` | Capture discrètement une photo ou vidéo à vue unique (View Once 1️⃣) et la transmet en clair dans le groupe `persopingunevue`. Zéro trace dans le chat ! |
| **`/statut`** | `/statut [numéro]` | Archive et télécharge les stories/statuts WhatsApp récents d'un contact (photos, vidéos, textes) directement dans votre hub `notifds`. |
| **`/persoping`** | *(En réponse)* `/persoping` | Transfère le message ciblé dans `persopingunevue` avec sa **date/heure d'envoi originale**, son auteur, son origine et son ID. |
| **`/clear`** | `/clear <nb> [all\|me]` | Supprime vos derniers messages instantanément (~1s pour 10 messages). `all` = pour tous (revoke), `me` = pour vous seul. |
| **`/temp`** | `/temp <temps\|off>` | Active l'auto-destruction de tous vos futurs messages dans cette discussion (ex: `/temp 30s`, `/temp 5m`, `/temp 1h`, `/temp off`). |
| **`/edit`** | *(En réponse)* `/edit <texte>` | Modifie directement l'un de vos messages récents sans passer par les menus de l'application. |

### 🛠️ Utilitaires & Productivité
| Commande | Syntaxe | Description |
| :--- | :--- | :--- |
| **`/resume`** | `/resume [nb]` | Génère un résumé synthétique par IA (Gemini 3.5 Flash Lite) des derniers échanges en mode ultra-économe en tokens. |
| **`/whois`** | `/whois [@contact\|numéro]` | Génère une fiche profil complète dans `notifds` (Photo HD, bio, type de compte personnel/business, groupes en commun, pays). |
| **`/dnd`** | `/dnd [on\|off\|2h\|23h 06h]` | Mode Ne Pas Déranger : coupe le son des notifications push ntfy la nuit (défaut 23h-06h) ou temporairement. |
| **`/recap`** | `/recap` | Affiche en direct le tableau de bord des statistiques d'activité et d'interception du jour. |
| **`/ntfy`** | `/ntfy <canal\|off>` | Active les notifications push avec sonnerie et vibration sur votre smartphone via l'application ntfy. |
| **`/calc`** | `/calc <calcul>` | Calcule instantanément une expression mathématique (ex: `/calc 15 * 84 + 12.5`) et remplace la commande sur place. |
| **`/rappel`** | `/rappel <texte> \| <temps>` | Définit un rappel personnel envoyé automatiquement dans `notifds` (ex: `/rappel Réunion \| +15m` ou `/rappel Sortir \| 18:30`). |
| **`/meteo`** | `/meteo [ville]` | Affiche la météo en direct d'une ville (température, ressenti, vent) directement à la place de la commande. |
| **`/translate`** | `/translate [lang] [texte]` | Traduit le texte ou le message cité directement à la place de la commande (ex: `/translate en Bonjour`, `/translate es`). |

### 🛡️ Modération & Administration de Groupe (Admins & Propriétaire)
| Commande | Syntaxe | Description |
| :--- | :--- | :--- |
| **`/ban`** | `/ban <membre> [raison]` | Expulse un membre du groupe, lui envoie un message privé (DM) explicatif, et consigne la sanction dans `admintaverne` et `notifds`. |
| **`/warn`** | `/warn <membre> [raison]` | *(Alias: `/av`)* Avertit un membre, mémorise la sanction à long terme, et transmet le dossier complet dans le groupe `admintaverne`. |
| **`/warn list`** | `/warn list [membre]` | *(Alias: `/av list`)* Liste tous les membres ayant des avertissements ou affiche l'historique complet d'une personne avec raisons et dates. |
| **`/warn del`** | `/warn del <membre>` | *(Alias: `/av del`)* Efface tous les avertissements d'un membre et notifie les salons d'administration. |

### 👥 Gestion de Groupes & Automatisation
| Commande | Syntaxe | Description |
| :--- | :--- | :--- |
| **`/poll`** | `/poll <question> \| <c1> \| <c2>` | Crée instantanément un vrai sondage natif WhatsApp dans la discussion courante. |
| **`/tagall`** | `/tagall [message]` | *(En groupe)* Mentionne instantanément tous les membres du groupe d'un seul coup. |
| **`/id`** | `/id` | Affiche l'ID unique WhatsApp (`@g.us`) du groupe ou de la discussion, ainsi que son alias si configuré. |
| **`/groupe`** | `/groupe` ou `/groupe alias <nom> [id]` | Liste tous vos groupes ou attribue un alias court (ex: `testbot`, `travail`) utilisable dans `/program`. |
| **`/alert`** | `/alert [list\|add\|del\|ignore\|on\|off]` | Surveille des mots-clés dans vos discussions et permet d'ignorer des trolls avec `/alert ignore <numéro>`. Alerte dans `importantmsg`. |
| **`/program`** | `/program` ou direct : `<msg> \| <date> [\| dest]` | **Mode Guidé Interactif** : tapez juste `/program` pour être guidé pas-à-pas (date/heure, message, destinataire/alias). Annulable avec `/stop`. Supprime les messages de setup sans trace ! |

### ⚙️ Système & Maintenance
| Commande | Syntaxe | Description |
| :--- | :--- | :--- |
| **`/update`** | `/update` ou `/update [on\|off]` | Vérifie les commits GitHub, effectue le `git pull`, met à jour les dépendances et redémarre instantanément. |
| **`/reboot`** | `/reboot` | Relance le processus du bot en arrière-plan pour appliquer immédiatement les modifications du code sans toucher au terminal. |
| **`/bot`** | `/bot` | Affiche la version du bot (ex: v1.22), l'uptime, l'utilisation RAM, la latence et Node.js. |
| **`/help`** | `/help` | Affiche le menu d'aide condensé (31 commandes). |

---

## 🚀 Installation & Démarrage

### Prérequis
- **Node.js** version 20 ou supérieure (`node -v`)
- **npm** version 9 ou supérieure (`npm -v`)
- Un compte WhatsApp actif sur smartphone

### 1. Cloner le projet
```bash
git clone https://github.com/ZyloshCraft/zybot.git
cd zybot
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Lancer ZyBot
```bash
npm start
```
*Pour le rechargement automatique en développement :*
```bash
npm run dev
```

### 4. Associer votre compte WhatsApp
1. Un **QR Code** s'affiche directement dans votre console.
2. Ouvrez **WhatsApp** sur votre téléphone.
3. Allez dans **Réglages** (iOS) ou **Options `⋮`** (Android) > **Appareils connectés**.
4. Touchez **Connecter un appareil** et scannez le QR Code du terminal.
5. Une fois connecté, le message de confirmation s'affiche :
   ```text
   ✅ CONNECTÉ AVEC SUCCÈS À WHATSAPP !
   ```

---

## 💡 Astuces d'Utilisation

- **Mode Furtif Absolu** : Vous pouvez exécuter vos commandes directement dans votre propre chat personnel (**"Message à vous-même"**). Personne ne saura jamais que vous utilisez un bot.
- **Rappels Faciles** : Utilisez `/rappel <tâche> | +Xm` pour recevoir des notifications automatisées dans `notifds`.
- **Rechargement Facile** : Après avoir modifié un fichier, tapez simplement `/reboot` dans WhatsApp pour appliquer les changements instantanément !

---

## 🔒 Sécurité & Confidentialité

- Vos identifiants de session WhatsApp sont stockés localement dans le dossier `auth_info/`. Ce dossier est strictement **exclu de Git** via `.gitignore`.
- **Ne partagez jamais** le contenu de votre dossier `auth_info/`.
- ZyBot est conçu exclusivement pour un usage personnel respectueux des conditions d'utilisation de WhatsApp.
