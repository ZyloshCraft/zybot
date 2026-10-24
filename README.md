# 🤖 ZyBot - WhatsApp Selfbot

ZyBot est un selfbot WhatsApp modulaire, furtif à 100% (Zéro Trace) et épuré pour compte personnel, propulsé par `@whiskeysockets/baileys`.

---

## 🛡️ Mode Furtif Zéro Trace (Stealth Engine)

1. **Auto-suppression systématique (5s)** : Les commandes exécutées dans les discussions avec des tiers ou des groupes (ex: `/persoping`, `/bot`, `/help`) affichent leur réponse puis **s'auto-détruisent pour tout le monde après 5 secondes**.
2. **Invisible sur `/vv`** : La commande `/vv` est immédiatement supprimée du chat de l'expéditeur, sans confirmation visible. Le média est envoyé directement dans votre discussion personnelle.
3. **Suppression anti-flag (`/clear`)** : Supprime vos messages avec un intervalle aléatoire de 800ms à 1600ms pour ne pas éveiller les soupçons des serveurs WhatsApp.
4. **Vrais Vocaux WhatsApp (`/vocal`)** : Convertit du texte en vraie note vocale PTT (onde verte) avec statut "enregistrement" réaliste.
5. **Redémarrage à chaud (`/reboot`)** : Recharge le code et applique les modifications directement depuis WhatsApp.

---

## ⚡ Commandes Disponibles

| Commande | Description |
| :--- | :--- |
| `/reboot` | Redémarre le processus du bot pour appliquer immédiatement les modifications. |
| `/vv` | *(En réponse)* Capture une photo/vidéo à vue unique en privé sans laisser aucune trace dans le chat ! |
| `/vocal <texte> [lang]` | Convertit le texte en un vrai vocal WhatsApp (PTT). Supprime la commande direct. |
| `/edit <texte>` | *(En réponse à un de vos messages)* Modifie le message cité sans passer par les menus. |
| `/persoping` | *(En réponse)* Transfère le message avec sa date d'envoi originale (auto-supprimé après 5s). |
| `/clear <nb> [all\|me]` | Supprime vos messages (`all` = pour tous, `me` = pour vous). Fonctionne sur l'historique antérieur ! |
| `/translate [lang] <texte>` | Traduit le texte ou le message cité directement à la place de la commande. |
| `/poll <titre> \| <opt1> \| <opt2>` | Crée instantanément un sondage natif WhatsApp. |
| `/tagall [message]` | *(Groupe)* Mentionne tous les membres du groupe d'un seul coup. |
| `/alert [list\|add\|del\|on\|off]` | Ping privé dès qu'un mot surveillé est cité (en groupe ou en privé). |
| `/program <msg> \| <date>` | Programme l'envoi d'un message (+15m, 21:00, JJ/MM/AAAA HH:MM). |
| `/vacances [on\|off\|msg]` | Active ou configure le répondeur d'absence (anti-flood par contact). |
| `/bot` | Affiche l'uptime, la RAM et la latence (auto-supprimé après 5s). |
| `/help` | Affiche le menu des commandes (auto-supprimé après 8s). |

---

## 🚀 Démarrage

```bash
cd /Users/valentin/Desktop/whatsapp-bot
npm start
```
Tapez `/help` dans votre discussion personnelle pour tester !
# zybot
