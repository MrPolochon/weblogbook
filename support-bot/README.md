# Bot assistance Discord (tickets)

Les **salons, le rôle staff et le serveur** se règlent **uniquement sur le site**
(Admin → Bot assistance Discord). Railway ne reçoit **aucun** ID Discord.

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

Pas de `GROQ_API_KEY` ici : l’IA tourne sur Vercel.

## Vercel (site)

| Variable | Rôle |
|---|---|
| `SUPPORT_BOT_TOKEN` | **le même** token (créer salons / panel / transcripts) |
| `SUPPORT_BOT_SECRET` | **le même** secret |
| `GROQ_API_KEY` | Groq (volume) |

## Créer le bot Discord (une fois)

1. https://discord.com/developers/applications → New Application.
2. Bot → token + intents **Server Members** et **Message Content**.
3. Inviter : scopes `bot` + `applications.commands` ; perms Voir / Envoyer / Embeds / Fichiers / Historique / Gérer les salons / Mention everyone.
4. Sur le site : coller serveur, salon panel, salon logs, rôle staff → **Créer panel + sections**.

Le process Railway relit la config du site toutes les 5 minutes.
