# Bot assistance Discord (tickets)

Les **salons, rôles staff / instructeur** se règlent **uniquement sur le site**
(Admin → Bot assistance Discord), via des menus (pas d’IDs à coller).
Le serveur est `DISCORD_GUILD_ID` déjà présent sur Vercel. Railway ne reçoit **aucun** ID Discord.

Les **boutons / modals du panel** sont acquittés par Vercel (endpoint HTTP Discord, &lt; 3 s).
Le process Railway reste nécessaire pour **lire et répondre dans les tickets**.

## Discord Developer Portal (obligatoire)

1. https://discord.com/developers/applications → l’application du **bot assistance**.
2. **General Information** → **Interactions Endpoint URL** :

   `https://www.mixouairlinesptfsweblogbook.com/api/support/discord/interactions`

   (URL **avec www** : le domaine sans www redirige en 307 et Discord refuse.)
   Enregistrer **après** que `DISCORD_PUBLIC_KEY` soit déployé. Discord envoie un PING ; Vercel doit répondre `{ type: 1 }`.
3. Copier la **Public Key** (même page, hex 64 caractères — **pas** le token bot ni le client secret)
   et la mettre dans Vercel en `DISCORD_PUBLIC_KEY` (Production + Preview), puis redéployer.
4. Bot → Privileged Gateway Intents : **Message Content** recommandé (chat tickets).
   **Server Members** est optionnel.

## Railway

1. New Project → Deploy from GitHub (`MrPolochon/weblogbook`).
2. **Root Directory** : `support-bot`
3. Start command : `python main.py` (déjà dans `railway.json`)
4. Variables **Railway** seulement :

| Variable | Valeur |
|---|---|
| `SUPPORT_BOT_TOKEN` | token du **nouveau** bot |
| `SUPPORT_BOT_SECRET` | même secret que Vercel |
| `WEBLOGBOOK_URL` | `https://mixouairlinesptfsweblogbook.com` |

Pas de `GROQ_API_KEY` ici : l’IA tourne sur Vercel. Redémarrer le service après un push.

## Vercel (site)

| Variable | Rôle |
|---|---|
| `SUPPORT_BOT_TOKEN` | **le même** token (créer salons / panel / transcripts / follow-up interactions) |
| `SUPPORT_BOT_SECRET` | **le même** secret |
| `DISCORD_PUBLIC_KEY` | Public Key du portail Discord (General Information) |
| `GROQ_API_KEY` | Groq (volume) |
| `DISCORD_GUILD_ID` | serveur (déjà en place, pas à retaper) |

## Créer le bot Discord (une fois)

1. https://discord.com/developers/applications → New Application.
2. Bot → token. Intent **Message Content** activé (recommandé).
3. Inviter : scopes `bot` + `applications.commands` ; perms Voir / Envoyer / Embeds / Fichiers / Historique / Gérer les salons / Mention everyone.
4. Interactions Endpoint URL (ci-dessus).
5. Sur le site : choisir salon panel, salon logs, rôle staff, rôle instructeur (CAT / instruction) → **Créer panel + sections**.

Le process Railway relit la config du site toutes les 5 minutes.
