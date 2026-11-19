# 🤖 ZyBot — Selfbot WhatsApp Furtif & Intelligent

<p align="center">
  <img src="https://img.shields.io/badge/Version-v1.28.0-orange?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/Node.js-v20+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Baileys-v7.0-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Baileys" />
  <img src="https://img.shields.io/badge/Commandes-38%20actives-blueviolet?style=for-the-badge" alt="Commandes" />
  <img src="https://img.shields.io/badge/Mode-Zero--Trace%20Stealth-emerald?style=for-the-badge&logo=security&logoColor=white" alt="Stealth" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
</p>

> 📖 **[Guide Complet du Bot (Wiki)](WIKI.md)** — Documentation exhaustive des 38 commandes, de l'architecture furtive, du système Anti-Raid, du moteur Anti-Spam et du tableau de bord WebGUI (Playit.gg).

**ZyBot** est un selfbot WhatsApp modulaire, discret et ultra-épuré pour compte personnel, conçu sur l'architecture **Baileys** (`@whiskeysockets/baileys`). Doté d'un **moteur anti-détection avancé (Stealth Engine)**, d'un **système Anti-Delete & Anti-Edit**, d'un **tableau de bord WebGUI public et SuperAdmin**, d'un **moteur IA multi-modèles (Gemini / Gemma)** et d'un **système Anti-Spam d'activité**, il s'exécute directement sur votre session sans laisser de traces suspectes.

---

## 🌐 Tableau de Bord WebGUI & Observabilité (Playit.gg)

ZyBot intègre une interface web complète conçue selon le design system sombre épuré **Playit.gg** (`#091322`, `#0e1b2e`, `#1d314c`, `#f97316`) :

- **🏆 Top 50 Activité (Taverne d'Ionia)** :
  - Classement en temps réel des 50 membres les plus actifs avec podium en surbrillance.
  - Statistiques complètes : volumes de messages, part de l'activité du groupe et date du dernier message.
  - **Graphique interactif 24h (Courbe Spline SVG)** : Courbe d'activité dynamique animée avec gradient, détection de l'heure de pointe et infobulles précises au survol.
  - Recherche instantanée par pseudo, numéro ou identifiant.
- **⚖️ Casier Communautaire de Modération** :
  - Consultation publique des avertissements attribués par la modération.
  - Modal interactive dévoilant la date, le groupe et le motif précis de chaque infraction.
- **🛡️ Panel SuperAdmin & Sécurité (`/superadmin`)** :
  - Observabilité système en direct (RAM, CPU, uptime, latence, statut WhatsApp).
  - Gestion des mots de passe admin et superadmin avec hash SHA-256 et sessions JWT.
  - Sélecteur dynamique de modèles IA (Gemma 4 31B, Gemini 3.5 Flash, Gemini 3.1 Flash-Lite, etc.).
  - Journal d'audit complet (`AuditLogStore`), explorateur Anti-Delete et gestion des Giveaways.

---

## 🛡️ Fonctionnalités Majeures & Sécurité

### 1. 🚫 Système Anti-Spam & Protection du Classement
- **Détection intelligente du spam d'activité** :
  - **Flood rapide** : $\ge 5$ messages en moins de 4 secondes ou $\ge 8$ messages en moins de 10 secondes.
  - **Spam de doublons** : Le même message répété 3 fois consécutivement.
  - **Farming de caractères courts** : Messages de $\le 2$ caractères envoyés en boucle pour gonfler les stats.
  - **Flood de caractères/mots** : Répétitions excessives (50+ caractères identiques ou 12+ mots répétés).
- **Exclusion automatique** : Les messages détectés comme spam ne sont **jamais comptabilisés** dans le `/top` ni sur le site web.
- **Alerte explicative dans `admintaverne`** : Le bot envoie une notification détaillant l'auteur, le groupe, l'extrait et la **raison exacte** de l'exclusion (protégé par un cooldown intelligent de 60s pour éviter de flooder les admins).

### 2. 🗑️ Moteur Anti-Delete & ✏️ Anti-Edit (Zéro Perte)
- **Anti-Delete** : Intercepte automatiquement **tous les messages supprimés pour tous** (textes, photos, vidéos, vocaux, stickers, documents) et les retransmet instantanément dans le groupe dédié **`antidelete`** (`120363430044075107@g.us`).
- **Anti-Edit** : Capture en temps réel les **messages modifiés** et affiche le comparatif clair *Avant / Après*.

### 3. 🧠 Intelligence Artificielle Multi-Modèles (Gemini & Gemma)
- Commandes `/ask` (conversationnel), `/bref` (résumé concis de groupe en points clés français) et `/resume`.
- **Résilience multi-tier** : Découverte dynamique des modèles disponibles sur la clé API avec bascule automatique en cascade (`gemma-4-31b-it`, `gemini-3.5-flash`, `gemini-3.1-flash-lite`).
- Choix du modèle actif en direct depuis le panneau SuperAdmin.

### 4. 🎉 Moteur de Giveaways Automatisé (`/gw`)
- Créez des concours interactifs avec décompte en temps réel (ex: `/gw "Discord Nitro 1 mois" | 2h | 1`).
- **Participation par réaction** (emoji 🎁) sans polluer le chat de messages.
- Tirage au sort cryptographique automatique à la fin du compte à rebours, avec commandes `/gw end` et `/gw reroll`.

### 5. 🔒 Verrouillage Express de Groupe (`/lock`)
- Basculez un groupe en mode *Admins seuls* ou *Ouvert à tous* en un clin d'œil avec `/lock` ou `/unlock`.

### 6. 🏛️ Hub Communautaire de Gestion Dédié
Les événements sont acheminés sans encombrer votre messagerie personnelle vers vos salons réservés :
- 🧪 **Groupe Test (`testbot`)** : `120363412992633770@g.us`
- 🚨 **Groupe Alertes Mots-Clés (`importantmsg`)** : `120363432686901629@g.us`
- 🔒 **Groupe Vue-Unique & Persoping (`persopingunevue`)** : `120363430665427462@g.us`
- 📢 **Groupe Notifications Système (`notifds`)** : `120363413901804206@g.us`
- 🗑️ **Groupe Anti-Delete & Anti-Edit (`antidelete`)** : `120363430044075107@g.us`
- 🛡️ **Groupe Administration & Modération (`admintaverne`)** : `120363424594930135@g.us`

---

## ⚡ Répertoire des 38 Commandes Actives

Toutes les commandes se déclenchent avec le préfixe `/` (exécutables par vous-même ou les membres de confiance autorisés via `/trust`).

### 🛡️ Modération & Sécurité
| Commande | Syntaxe | Description |
| :--- | :--- | :--- |
| **`/warn`** | `/warn <membre> [raison]` | *(Alias: `/av`)* Attribue un avertissement, enregistre l'infraction et notifie le salon `admintaverne`. |
| **`/warn list`** | `/warn list [membre]` | *(Alias: `/av list`)* Consulte le casier complet d'un membre ou de la communauté. |
| **`/warn del`** | `/warn del <membre> [index]` | *(Alias: `/av del`)* Supprime les avertissements d'un membre. |
| **`/lock`** | `/lock [on\|off]` | *(Alias: `/verrouiller`, `/unlock`)* Verrouille le groupe aux admins seuls ou le réouvre à tous. |
| **`/antiraid`** | `/antiraid [on\|off]` | Protection anti-liens automatique pour les nouveaux arrivants (< 10 min). |
| **`/antinsfw`** | `/antinsfw [check\|on\|off]` | Filtre et analyse les images par IA dans les groupes administrés. |
| **`/trust`** | `/trust <numéro>` | Autorise un membre de confiance à exécuter des commandes restreintes. |
| **`/untrust`** | `/untrust <numéro>` | Retire les privilèges d'un membre de confiance. |

### 📊 Activité, Statistiques & Intelligence Artificielle
| Commande | Syntaxe | Description |
| :--- | :--- | :--- |
| **`/top`** | `/top [nb\|groupe]` | *(Alias: `/classement`, `/leaderboard`, `/activite`)* Affiche le classement des membres les plus actifs et l'heure de pointe. |
| **`/ask`** | `/ask <question>` | *(Alias: `/ai`, `/gemini`)* Pose une question à l'assistant IA (Gemini / Gemma). |
| **`/bref`** | `/bref [nb]` | *(Alias: `/tldr`)* Résumé clair et concis des derniers messages du groupe par IA. |
| **`/resume`** | `/resume [nb]` | *(Alias: `/summary`)* Analyse synthétique d'une conversation par IA. |
| **`/recap`** | `/recap` | Tableau de bord direct des statistiques et interceptions de la journée. |
| **`/texte`** | *(En réponse)* `/texte` | *(Alias: `/transcrire`)* Transcrit un message vocal audio en texte clair. |

### 🎉 Giveaways & Animations
| Commande | Syntaxe | Description |
| :--- | :--- | :--- |
| **`/gw`** | `/gw "<lot>" \| <durée> \| [gagnants]` | *(Alias: `/giveaway`)* Lance un concours interactif avec participation par réaction 🎁. |
| **`/gw end`** | `/gw end <id\|nom>` | Termine immédiatement un giveaway et tire au sort les gagnants. |
| **`/gw reroll`** | `/gw reroll <id\|nom>` | Sélectionne un nouveau gagnant pour un concours terminé. |

### ✨ Médias, Vie Privée & Téléchargements
| Commande | Syntaxe | Description |
| :--- | :--- | :--- |
| **`/s`** | *(En réponse/légende)* `/s` | Convertit une photo ou courte vidéo en sticker WhatsApp officiel. |
| **`/toimg`** | *(En réponse à un sticker)* `/toimg` | *(Alias: `/img`)* Convertit un sticker en image PNG ou vidéo MP4. |
| **`/music`** | `/music <titre ou lien>` | *(Alias: `/mp3`, `/song`)* Télécharge un audio en MP3 haute qualité. |
| **`/dl`** | `/dl <lien>` | *(Alias: `/telecharger`)* Télécharge une vidéo TikTok, Twitter/X, Instagram ou YouTube. |
| **`/pfp`** | `/pfp [@membre\|groupe]` | *(Alias: `/pp`)* Télécharge la photo de profil en pleine résolution HD. |
| **`/whois`** | `/whois [@membre\|numéro]` | Fiche profil approfondie (Photo HD, bio, groupes communs, pays, type de compte). |
| **`/statut`** | `/statut [cible\|id@lid]` | Archive et télécharge les stories/statuts WhatsApp récents d'un contact dans `notifds`. |
| **`/vv`** | *(En réponse)* `/vv` | Capture discrètement une vue unique (View Once 1️⃣) et la transmet dans `persopingunevue`. |
| **`/persoping`** | *(En réponse)* `/persoping` | *(Alias: `/save`)* Sauvegarde un message avec sa date et son auteur dans `persopingunevue`. |
| **`/temp`** | `/temp <durée\|off>` | Active l'auto-destruction programmée de tous vos prochains messages dans ce chat. |
| **`/clear`** | `/clear <nb> [all\|me]` | Supprime vos derniers messages instantanément (~1s pour 10 messages). |
| **`/edit`** | *(En réponse)* `/edit <texte>` | Modifie l'un de vos messages récents sur place. |
| **`/translate`** | `/translate [lang] [texte]` | Traduit un texte avec bascule multi-fournisseurs (MyMemory / Google). |
| **`/calc`** | `/calc <calcul>` | Calcule instantanément une expression mathématique. |
| **`/meteo`** | `/meteo [ville]` | Affiche la météo en direct d'une ville. |

### ⚙️ Administration du Bot & Système
| Commande | Syntaxe | Description |
| :--- | :--- | :--- |
| **`/alert`** | `/alert [list\|add\|del\|ignore]` | Surveille des mots-clés avec mode strict anti-spam et blacklist troll. |
| **`/dnd`** | `/dnd [on\|off\|durée]` | Mode Ne Pas Déranger : coupe le son des notifications push ntfy la nuit ou temporairement. |
| **`/ntfy`** | `/ntfy <canal\|off>` | Active les notifications push prioritaires sur smartphone (iOS/Android). |
| **`/program`** | `/program` | Mode guidé interactif pour programmer l'envoi de messages différés sans traces. |
| **`/export`** | `/export [nb]` | Exporte les N derniers messages du chat sous forme d'archive texte propre dans `notifds`. |
| **`/alias`** | `/alias [list\|add\|del]` | Gère les alias courts pour les groupes WhatsApp. |
| **`/groupe`** | `/groupe [alias <nom>]` | Liste vos groupes ou associe un identifiant à un nom court. |
| **`/id`** | `/id` | Affiche l'ID WhatsApp unique (`@g.us`) et les alias du groupe courant. |
| **`/update`** | `/update [force]` | Met à jour le bot depuis GitHub (`git pull`) et redémarre le processus. |
| **`/reboot`** | `/reboot` | Redémarre proprement le bot pour recharger le code sans toucher au terminal. |
| **`/bot`** | `/bot` | Affiche l'uptime, l'état de la mémoire RAM, la version et l'environnement Node.js. |
| **`/help`** | `/help [commande]` | Affiche la liste organisée des commandes et le guide de modération. |

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

### 3. Exécuter la suite de tests unitaires
```bash
npm test
```
*Valide automatiquement les 24 tests unitaires de régression, de sécurité et d'API.*

### 4. Lancer ZyBot
```bash
npm start
```
*Pour la production avec PM2 :*
```bash
pm2 start src/index.js --name "zybot"
pm2 save
```

### 5. Associer votre compte WhatsApp
1. Un **QR Code** s'affiche directement dans votre console.
2. Ouvrez **WhatsApp** sur votre téléphone > **Appareils connectés** > **Connecter un appareil**.
3. Scannez le QR Code pour démarrer votre session furtive.

---

## 🔒 Sécurité & Confidentialité

- Vos identifiants de session WhatsApp sont stockés localement dans le dossier `auth_info/`. Ce dossier est strictement **exclu de Git** via `.gitignore`.
- **Ne partagez jamais** le contenu de votre dossier `auth_info/` ni vos mots de passe configurés dans `config.json`.
- ZyBot est conçu exclusivement pour un usage personnel respectueux des conditions d'utilisation de WhatsApp.
