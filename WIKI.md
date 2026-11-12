# 📚 ZyBot — Guide Complet & Wiki Officiel

Bienvenue sur la documentation exhaustive de **ZyBot**, selfbot WhatsApp pour compte personnel conçu sur l'architecture **Baileys** (`@whiskeysockets/baileys`).

---

## 📑 Sommaire
1. [Vue d'ensemble & Philosophie](#1-vue-densemble--philosophie)
2. [Architecture Furtive (Zero-Trace)](#2-architecture-furtive-zero-trace)
3. [Hub Communautaire Dédié](#3-hub-communautaire-dédié)
4. [Répertoire Exhaustif des Commandes (36 commandes)](#4-répertoire-exhaustif-des-commandes)
   - [A. Modération & Sécurité](#a-modération--sécurité)
   - [B. Vie Privée, Anti-Delete & Anti-Edit](#b-vie-privée-anti-delete--anti-edit)
   - [C. Giveaways & Animations](#c-giveaways--animations)
   - [D. Profil, Médias & OSINT WhatsApp](#d-profil-médias--osint-whatsapp)
   - [E. Utilitaires & Programmation](#e-utilitaires--programmation)
   - [F. Alertes, DND & Notifications Push](#f-alertes-dnd--notifications-push)
5. [Système Anti-Raid & Anti-Lien](#5-système-anti-raid--anti-lien)
6. [Tableau de Bord Web (WebGUI) & Design Playit.gg](#6-tableau-de-bord-web-webgui--design-playitgg)
   - [Design System & Interface](#design-system--interface)
   - [Espace Public : Casier Communautaire](#espace-public--casier-communautaire)
   - [Panel Admin (/admin)](#panel-admin-admin)
   - [Panel SuperAdmin (/superadmin) & Sécurité](#panel-superadmin-superadmin--sécurité)
7. [Installation, Configuration & Déploiement PM2](#7-installation-configuration--déploiement-pm2)
8. [Audit de Sécurité & Confidentialité GitHub](#8-audit-de-sécurité--confidentialité-github)

---

## 1. Vue d'ensemble & Philosophie

ZyBot n'est pas un bot conventionnel bruyant : c'est un **selfbot compagnon furtif** qui s'exécute sur votre propre compte WhatsApp personnel.
- **Zéro spam visible** : Les commandes exécutées par vous peuvent s'auto-éditer ou disparaître sans laisser d'encart *"Ce message a été supprimé"*.
- **Protection totale de la vie privée** : Sauvegarde des messages supprimés, des modifications, des vues uniques et des stories sans émettre d'accusé de lecture.
- **Routage intelligent** : Tous les logs, alertes et médias interceptés sont acheminés vers des groupes privés fermés (le Hub Communautaire).

---

## 2. Architecture Furtive (Zero-Trace)

ZyBot intègre un ensemble de protections avancées contre le bannissement WhatsApp et la détection :
1. **Empreinte Officielle (Browser Spoofing)** : Le bot s'identifie auprès des serveurs WhatsApp comme une session Web légitime `Google Chrome` sur `macOS` (`v2.3000.1043857760`).
2. **Simulation Comportementale Humaine** :
   - Émission aléatoire du statut d'écriture (`composing`) pendant un délai naturel de **1,5s à 3,5s** avant l'envoi de réponses complexes.
   - Suppression échelonnée pour `/clear` avec micro-délais aléatoires (40ms à 130ms) pour éviter les vagues de suppressions synchronisées suspectes.
3. **Gestion des Stanzas IQ & Caching** : Les métadonnées de groupes sont conservées en cache 60 secondes pour éviter de sur-solliciter l'API de WhatsApp lors des consultations répétées.
4. **Cloisonnement des Sessions Signal** : Stockage multi-clés isolé dans `auth_info/` avec gestion des renouvellements de sessions chiffrées libsignal.

---

## 3. Hub Communautaire Dédié

Pour éviter d'encombrer votre discussion personnelle avec vous-même (*Message to Yourself*), ZyBot achemine tous ses événements vers **6 groupes WhatsApp privés** réservés à votre usage :

| Alias Interne | Rôle Principal | JID Groupe Exemple |
| :--- | :--- | :--- |
| `testbot` | Groupe bac à sable pour tester vos commandes en direct | `120363412992633770@g.us` |
| `importantmsg` | Réception des alertes mots-clés configurés (`val`, `valentin`...) | `120363432686901629@g.us` |
| `persopingunevue`| Capture des vues uniques et archivage des notes `/persoping` | `120363430665427462@g.us` |
| `notifds` | Notifications système (ajouts d'alias, récapitulatif 23h, /whois) | `120363413901804206@g.us` |
| `antidelete` | Flux temps réel des messages supprimés et comparatifs avant/après | `120363430044075107@g.us` |
| `admintaverne` | Hub de modération et alertes des membres Taverne | `120363424594930135@g.us` |

> 🔒 **Règle absolue** : Les messages ne s'auto-détruisent **jamais** dans les groupes du Hub ni en message privé direct.

---

## 4. Répertoire Exhaustif des Commandes

Toutes les commandes s'exécutent avec le préfixe configuré (par défaut `/`). Le bot ne réagit qu'aux messages provenant de son propriétaire ou des membres ayant reçu la permission `/trust`.

### A. Modération & Sécurité
- `/warn <cible> [raison]` : Attribue un avertissement à un membre (par numéro, mention ou citation). À 3 avertissements ou plus, le membre passe en statut `BAN`.
- `/unwarn <cible>` : Retire un avertissement à un membre.
- `/clearwarns <cible>` (alias: `/resetwarns`) : Réinitialise l'intégralité du casier d'un membre.
- `/casier [cible]` (alias: `/warnlist`) : Affiche l'historique complet des infractions (date, groupe, raison, modérateur).
- `/ban <cible> [raison]` : Applique directement 3 avertissements et ordonne l'exclusion du membre.
- `/unban <cible>` : Réhabilite un membre banni et réinitialise son casier.
- `/kick <cible>` : Éjecte un membre du groupe actuel (nécessite que le compte bot soit administrateur du groupe).
- `/trust <cible> [nom]` : Autorise un utilisateur tiers à utiliser les commandes modérateur de ZyBot.
- `/untrust <cible>` : Révoque immédiatement les droits d'un utilisateur.
- `/permissions` (alias: `/perms`) : Affiche la liste des membres autorisés et révoqués.

### B. Vie Privée, Anti-Delete & Anti-Edit
- `/temp <durée|off>` : Active l'auto-destruction automatique de **tous vos prochains messages** dans la discussion courante (ex: `/temp 30s`, `/temp 5m`, `/temp 1h`, `/temp off`).
- `/clear <nombre|all|me>` : Supprime en masse et sans trace les derniers messages de la discussion.
- `/antidelete <on|off|status>` : Active ou désactive l'interception automatique des messages supprimés pour tous.
- `/viewonce` (alias: `/vv`) : Permet de renvoyer en clair une photo ou vidéo reçue en vue unique.

### C. Giveaways & Animations
- `/gw <durée> <lot>` : Crée un giveaway interactif dans le groupe courant. Les membres participent en cliquant sur la réaction 🎉 (ex: `/gw 30m Discord Nitro 1 mois`, `/gw 2h 5000 V-Bucks`).
- `/gw end [id]` : Clôture immédiatement un giveaway actif et tire au sort un gagnant parmi les participants réels.
- `/gw reroll [id]` : Tire un nouveau gagnant au sort pour un giveaway déjà terminé.
- `/gw list` : Affiche tous les giveaways en cours ou récents avec le décompte des participants.

### D. Profil, Médias & OSINT WhatsApp
- `/whois [cible]` : Génère un dossier d'investigation complet (Photo de profil HD, Bio WhatsApp, groupes partagés, type de compte personnel/business, pays d'origine, rôle de modération).
- `/pfp [cible]` : Télécharge et envoie en haute résolution la photo de profil du compte ou du groupe ciblé.
- `/statut [cible]` : Affiche les statuts WhatsApp récents archivés furtivement par le bot, ou télécharge les stories d'un contact ciblé.
- `/s` (alias: `/sticker`) : Convertit instantanément l'image ou la vidéo citée en sticker WhatsApp animé ou statique.
- `/toimg` : Reconvertit un sticker en image JPEG plein écran.

### E. Utilitaires & Programmation
- `/program` : Ouvre un assistant interactif pas-à-pas pour planifier l'envoi d'un message à une date et heure précise. À la fin, les messages du guide sont auto-supprimés pour ne laisser aucune trace.
- `/rappel <temps> <texte>` : Programme un rappel rapide (ex: `/rappel 45m Penser à sortir le pain`).
- `/bref` (alias: `/tldr`) : Génère un résumé condensé et humain des derniers échanges de la discussion courante.
- `/top [messages]` : Affiche le classement des membres les plus bavards dans le groupe courant avec décompte exact.
- `/persoping <note>` : Sauvegarde une citation ou un message important avec son contexte d'origine dans le groupe `persopingunevue`.
- `/export [nombre]` : Exporte l'historique récent de la discussion au format texte clair.
- `/ping` : Vérifie la latence de réponse du bot et le statut de la socket WhatsApp.
- `/help [commande]` : Affiche le guide interactif avec la syntaxe et les options disponibles.

### F. Alertes, DND & Notifications Push
- `/alert <mot>` : Ajoute un mot-clé surveillé dans tous les groupes (ex: `/alert valentin`).
- `/alert list` : Liste les mots surveillés.
- `/alert delete <mot>` : Retire un mot-clé de la surveillance.
- `/alert strict <on|off>` : Active le mode anti-faux positifs (ignore les mots dérivés comme `valise` ou `vallée`).
- `/alert ignore <numéro>` : Blackliste un utilisateur troll pour qu'il ne puisse plus déclencher vos alertes.
- `/dnd <heures|durée>` : Règle le créneau Ne Pas Déranger pour les notifications de nuit (ex: `/dnd 23h 06h` ou `/dnd 2h`).
- `/ntfy <sujet>` : Connecte le bot à l'application mobile push `ntfy` pour sonneries et vibrations instantanées.
- `/recap` : Affiche le récapitulatif des statistiques journalières (auto-envoyé chaque soir à 23h00).

---

## 5. Système Anti-Raid & Anti-Lien

Le système Anti-Raid protège vos groupes contre les attaques de spammeurs et l'envoi de liens non sollicités par les nouveaux membres :
- **Période de probation (par défaut 10 minutes)** : Tout membre ayant rejoint le groupe depuis moins de 10 minutes est placé sous surveillance automatique.
- **Règle Anti-Lien stricte** : Si un membre en période de probation publie un lien internet (URL, lien d'invitation Discord/Telegram/WhatsApp), son message est immédiatement supprimé.
- **Avertissements progressifs** :
  - Le bot le mentionne avec un message court, humain et précis l'avertissant du temps restant avant d'avoir le droit d'envoyer des liens.
  - Le bot lui indique le nombre d'avertissements restants.
- **Auto-Ban au bout de 5 avertissements** : Si le troll insiste et atteint le seuil (5 avertissements), il est automatiquement exclu du groupe et inscrit dans le casier de modération.

---

## 6. Tableau de Bord Web (WebGUI) & Design Playit.gg

ZyBot embarque une interface Web complète accessible sur le port `3050` (ou via reverse-proxy Nginx à l'adresse `/bot/`).

### Design System & Interface
L'interface respecte strictement le design system épuré de **Playit.gg** :
- **Palette** : Fond `#091322`, cartes `#0e1b2e` avec bordure nette `1px solid #1d314c`, accent orange vif `#f97316`.
- **Typographie** : Inter pour l'interface générale, et police **Monospace** (`JetBrains Mono`) pour tous les numéros de téléphone, JIDs et compteurs.
- **Zéro Débordement** : Tous les numéros (ex: `+33612345678`) sont tronqués proprement pour ne jamais déborder des cartes KPI sur mobile ou petit écran.
- **Navigation par onglets texte** : Onglets discrets avec soulignement orange sous l'onglet actif.

### Espace Public : Casier Communautaire
Accessible librement à la racine (`/bot/` si déconnecté) :
- Permet à n'importe quel membre de la communauté de rechercher son pseudo pour vérifier l'état de son casier de modération (nombre de warns, statut normal ou ban).
- Données anonymisées pour préserver la vie privée (seul le pseudo est affiché, aucun numéro de téléphone ni JID n'est exposé publiquement).

### Panel Admin (`/admin`)
Protégé par le mot de passe modérateur :
- **Warns & Casier** : 3 cartes KPI, recherche en temps réel, tableau de gestion avec boutons Détails et Réinitialisation.
- **Activité des Groupes** : Données récupérées en direct depuis l'API WhatsApp Baileys (`groupFetchAllParticipating` avec cache 60s) : vrai nom du groupe, JID, nombre réel de participants, volume total de messages et Top 3 des parleurs avec leurs pseudos réels.
- **Logs PM2** : Console intégrée avec coloration syntaxique des erreurs et défilement automatique.

### Panel SuperAdmin (`/superadmin`) & Sécurité
Réservé exclusivement au propriétaire du bot avec le mot de passe maître :
- **Cloisonnement strict côté serveur** : Un utilisateur non authentifié ne reçoit **pas** le code HTML du tableau de bord. Le serveur lui renvoie exclusivement une page de connexion minimaliste. Supprimer des éléments via l'inspecteur du navigateur ne permet aucun accès.
- **Onglet Permissions** : Ajout et révocation des administrateurs `/trust` et `/untrust`.
- **Onglet Notifications & Alertes** : Sélecteur déroulant alimenté par la liste réelle des groupes WhatsApp pour choisir où envoyer les logs du bot, avec interrupteurs par type d'événement.
- **Onglet Giveaways & PersoPings** : Création manuelle de giveaways, tirage, reroll, suppression et gestion des notes sauvegardées.
- **Onglet Réglages Bot** : Interrupteurs pour l'Anti-Raid, le mode DND, la vitesse de frappe furtive et redémarrage PM2.

---

## 7. Installation, Configuration & Déploiement PM2

### Prérequis
- Node.js 20+ et npm
- PM2 (`npm install -g pm2`)
- Git

### Installation Locale ou sur Raspberry Pi
```bash
# Cloner le dépôt
git clone https://github.com/ZyloshCraft/zybot.git
cd zybot

# Installer les dépendances
npm install

# Lancer la suite de tests unitaires (20 tests)
npm test

# Démarrer le bot avec PM2
pm2 start src/index.js --name zybot

# Sauvegarder la configuration PM2 pour démarrage automatique au boot
pm2 save
pm2 startup
```

### Configuration Nginx (Reverse Proxy)
Pour exposer la WebGUI sous `https://votredomaine/bot/`, ajoutez cette configuration dans `/etc/nginx/sites-available/` :
```nginx
location = /bot {
    return 301 /bot/;
}

location /bot/ {
    proxy_pass http://127.0.0.1:3050/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /api/ {
    proxy_pass http://127.0.0.1:3050/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location = /superadmin {
    return 301 /bot/superadmin;
}
```

---

## 8. Audit de Sécurité & Confidentialité GitHub

### Ce qui est STRICTEMENT PROTÉGÉ et NON PRÉSENT sur GitHub :
| Élément | Statut | Protection |
| :--- | :--- | :--- |
| **Identifiants de connexion WhatsApp (`auth_info/`)** | ❌ **Non présent sur GitHub** | Protégé par `.gitignore`. Vos clés privées, sessions et base SQLite libsignal restent 100% locales sur votre machine. |
| **Mots de passe des panels WebGUI (`.env`)** | ❌ **Non présent sur GitHub** | Stockés dans le fichier `.env` local (protégé par `.gitignore`) et configurables directement depuis le SuperAdmin. |
| **Historique des messages (`message_history.json`)** | ❌ **Non présent sur GitHub** | Protégé par `.gitignore`. Aucun message privé ou de groupe n'est envoyé sur GitHub. |
| **Statuts & Stories WhatsApp (`statuses/`)** | ❌ **Non présent sur GitHub** | Protégé par `.gitignore`. |
| **Base des Warns & Casier (`warns.json`)** | ❌ **Non présent sur GitHub** | Protégé par `.gitignore`. Les infractions restent locales. |
| **Activité des Groupes (`group_activity.json`)** | ❌ **Non présent sur GitHub** | Protégé par `.gitignore`. |
| **Contacts & Pseudos réels (`contacts.json`)** | ❌ **Non présent sur GitHub** | Protégé par `.gitignore`. |
| **Giveaways réels (`giveaways.json`)** | ❌ **Non présent sur GitHub** | Protégé par `.gitignore`. |
| **Permissions accordées (`permissions.json`)** | ❌ **Non présent sur GitHub** | Protégé par `.gitignore`. |
| **Fichiers de logs (`*.log`)** | ❌ **Non présent sur GitHub** | Protégé par `.gitignore`. |
| **Variables d'environnement (`.env`)** | ❌ **Non présent sur GitHub** | Protégé par `.gitignore`. |
