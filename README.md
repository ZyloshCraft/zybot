# 🤖 ZyBot — Selfbot WhatsApp Furtif & Intelligent

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v20+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Baileys-v7.0-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Baileys" />
  <img src="https://img.shields.io/badge/Mode-Zero--Trace%20Stealth-blueviolet?style=for-the-badge&logo=security&logoColor=white" alt="Stealth" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
</p>

**ZyBot** est un selfbot WhatsApp modulaire, discret et épuré pour compte personnel, conçu sur l'architecture **Baileys** (`@whiskeysockets/baileys`). Doté d'un **moteur anti-détection avancé (Stealth Engine)**, il s'exécute directement sur votre session sans laisser de traces suspectes.

---

## 🛡️ Architecture & Moteur Furtif (Stealth Engine)

ZyBot intègre un ensemble de protections actives pour garantir une invisibilité totale face aux algorithmes de détection de WhatsApp :

1. **Empreinte Officielle (Browser Spoofing)** :
   - Le bot s'identifie auprès des serveurs WhatsApp comme un navigateur légitime `Google Chrome` sur `macOS` (`Mac OS / Chrome`), remplaçant l'empreinte automatique par défaut de Baileys.
2. **Simulation du Comportement Humain (Presence & Typing)** :
   - Avant chaque envoi automatisé, le bot émet l'état *"En train d'écrire..."* (`composing`) ou *"Enregistre un audio..."* (`recording`) pendant un intervalle aléatoire (**jitter de 1,5s à 3,5s**).
3. **Mode Zéro-Trace Intelligent** :
   - **En discussion privée (DMs / chat perso)** : Vos commandes et réponses **ne sont jamais supprimées**, vous permettant de conserver vos notes et données.
   - **En groupe public** : Les commandes et réponses s'auto-détruisent pour tout le monde après 5 secondes pour ne laisser aucune preuve de bot aux autres membres.
   - **Capture de Vue-Unique (`/vv`)** : La commande est immédiatement détruite dans la discussion source. Le média est transféré en clair et de façon permanente dans votre discussion personnelle.
4. **Anti-Spam & Cooldown (Mode Vacances)** :
   - Réponse automatique limitée à **1 fois toutes les 2 heures par contact**, avec exclusion automatique des groupes, newsletters et statuts éphémères.
5. **Suppression Échelonnée (`/clear`)** :
   - Suppression fluide avec un intervalle aléatoire de 800ms à 1600ms entre chaque message pour éviter tout blocage de débit (rate-limiting).

---

## ⚡ Liste Complète des Commandes

Toutes les commandes se déclenchent avec le préfixe `/` (exécutables uniquement par vous-même).

### 🥷 Furtivité, Nettoyage & Médias
| Commande | Syntaxe | Description |
| :--- | :--- | :--- |
| **`/vv`** | *(En réponse)* `/vv` | Capture discrètement une photo ou vidéo à vue unique (View Once 1️⃣) et vous la transmet en clair dans votre chat personnel. Zéro trace dans le chat ! |
| **`/persoping`** | *(En réponse)* `/persoping` | Transfère le message ciblé dans votre chat personnel avec sa **date/heure d'envoi originale**, son auteur, son origine et son ID. *(Auto-supprimé sous 5s en groupe)*. |
| **`/clear`** | `/clear <nb> [all\|me]` | Supprime vos derniers messages avec un délai aléatoire anti-flag. `all` = pour tous (delete revoke), `me` = pour vous seul. *(Prend en charge les messages d'avant le lancement)*. |
| **`/vocal`** | `/vocal <texte> [lang]` | Convertit le texte en une véritable note vocale WhatsApp (onde verte PTT) avec simulation d'enregistrement. Supprime le texte de la commande direct. |
| **`/edit`** | *(En réponse)* `/edit <texte>` | Modifie directement l'un de vos messages récents sans passer par les menus de l'application. |

### 🛠️ Utilitaires & Productivité
| Commande | Syntaxe | Description |
| :--- | :--- | :--- |
| **`/calc`** | `/calc <calcul>` | Calcule instantanément une expression mathématique (ex: `/calc 15 * 84 + 12.5`) et remplace la commande sur place. |
| **`/rappel`** | `/rappel <texte> \| <temps>` | Définit un rappel personnel envoyé automatiquement dans votre chat privé personnel (ex: `/rappel Réunion \| +15m` ou `/rappel Sortir \| 18:30`). |
| **`/meteo`** | `/meteo [ville]` | Affiche la météo en direct d'une ville (température, ressenti, vent) directement à la place de la commande. |
| **`/crypto`** | `/crypto [symbole]` | Affiche le cours en direct d'une cryptomonnaie (ex: `/crypto btc`, `/crypto eth`, `/crypto sol`). |
| **`/translate`** | `/translate [lang] [texte]` | Traduit le texte ou le message cité directement à la place de la commande (ex: `/translate en Bonjour`, `/translate es`). |

### 👥 Gestion de Groupes & Automatisation
| Commande | Syntaxe | Description |
| :--- | :--- | :--- |
| **`/poll`** | `/poll <question> \| <c1> \| <c2>` | Crée instantanément un vrai sondage natif WhatsApp dans la discussion courante. |
| **`/tagall`** | `/tagall [message]` | *(En groupe)* Mentionne instantanément tous les membres du groupe d'un seul coup. |
| **`/id`** | `/id` | Affiche l'ID unique WhatsApp (`@g.us`) du groupe ou de la discussion, ainsi que son alias si configuré. |
| **`/groupe`** | `/groupe` ou `/groupe alias <nom>` | Liste tous vos groupes ou attribue un alias simple (ex: `famille`, `travail`) utilisable directement dans `/program`. |
| **`/alert`** | `/alert [list\|add\|del\|on\|off]` | Surveille des mots-clés dans vos groupes et discussions privées. Vous envoie un ping privé dès qu'un mot est prononcé. |
| **`/program`** | `/program` ou `/program <msg> \| <date> [\| dest]` | **Mode Guidé Interactif** : tapez juste `/program` pour être guidé pas-à-pas (date/heure, message long, destinataire). En direct : permet d'indiquer le numéro du contact en privé (ex: `0612345678`) ou envoie sur le groupe si vous êtes dans un groupe. Envoie un récapitulatif complet dans votre chat privé personnel ! Annulable avec `/stop`. |
| **`/vacances`** | `/vacances [on\|off\|msg\|cooldown]`| Active ou configure le répondeur intelligent d'absence (anti-flood par contact). |

### ⚙️ Système & Maintenance
| Commande | Syntaxe | Description |
| :--- | :--- | :--- |
| **`/reboot`** | `/reboot` | Relance le processus du bot en arrière-plan pour appliquer immédiatement les modifications du code sans toucher au terminal. |
| **`/bot`** | `/bot` | Affiche l'uptime, l'utilisation RAM, la latence et la version Node.js. |
| **`/help`** | `/help` | Affiche le menu d'aide condensé. |

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
5. Une fois connecté, le message vert s'affiche :
   ```text
   ✅ CONNECTÉ AVEC SUCCÈS À WHATSAPP !
   ```

---

## 💡 Astuces d'Utilisation

- **Mode Furtif Absolu** : Vous pouvez exécuter vos commandes directement dans votre propre chat personnel (**"Message à vous-même"**). Personne ne saura jamais que vous utilisez un bot.
- **Rappels Faciles** : Utilisez `/rappel <tâche> | +Xm` pour recevoir des notifications privées automatisées.
- **Rechargement Facile** : Après avoir modifié un fichier, tapez simplement `/reboot` dans WhatsApp pour appliquer les changements instantanément !

---

## 🔒 Sécurité & Confidentialité

- Vos identifiants de session WhatsApp sont stockés localement dans le dossier `auth_info/`. Ce dossier est strictement **exclu de Git** via `.gitignore`.
- **Ne partagez jamais** le contenu de votre dossier `auth_info/`.
- ZyBot est conçu exclusivement pour un usage personnel respectueux des conditions d'utilisation de WhatsApp (aucun spam massif ni diffusion non sollicitée).
