# Bot assistance Discord (tickets)

Les **salons, rôles staff / instructeur** se règlent **uniquement sur le site**
(Admin → Bot assistance Discord), via des menus (pas d’IDs à coller).
Le serveur est `DISCORD_GUILD_ID` déjà présent sur Vercel. Railway ne reçoit **aucun** ID Discord.

`/register` est ouverte à **tous les membres** du serveur (PTFR Assistance).
Dans les tickets, le salon doit avoir la permission Discord **Utiliser les commandes d’application**
(sinon seuls les admins voient la commande). Les tickets créés après ce correctif l’ont ;
pour les tickets déjà ouverts : Admin → Bot assistance → **Réparer /register**.

La `/register` d’**ATC ROBOT** (bot ATIS) est une autre commande. Si les membres ne la voient
pas : Paramètres du serveur Discord → Intégrations → ATC ROBOT → `/register` → autoriser @everyone.

Les **boutons / modals du panel** sont acquittés par Vercel (endpoint HTTP Discord, &lt; 3 s).
Le process Railway reste nécessaire pour **lire et répondre dans les tickets**
(gateway `MESSAGE_CREATE` — l’endpoint Interactions ne vole **pas** les messages de chat).

Les boutons **C'est résolu / Pas résolu — staff / Fermer (staff)** n’apparaissent **pas** à l’ouverture :
l’IA les poste seulement quand elle pense avoir réglé le problème (`[[RESOLU]]`).

## Discord Developer Portal (obligatoire)

1. https://discord.com/developers/applications → l’application du **bot assistance**.
2. **General Information** → **Interactions Endpoint URL** :

   `https://www.mixouairlinesptfsweblogbook.com/api/support/discord/interactions`

   (URL **avec www** : le domaine sans www redirige en 307 et Discord refuse.)
   Enregistrer **après** que `DISCORD_PUBLIC_KEY` soit déployé. Discord envoie un PING ; Vercel doit répondre `{ type: 1 }`.
3. Copier la **Public Key** (même page, hex 64 caractères — **pas** le token bot ni le client secret)
   et la mettre dans Vercel en `DISCORD_PUBLIC_KEY` (Production + Preview), puis redéployer.
4. Bot → Privileged Gateway Intents : **Message Content** **obligatoire** (sinon `message.content` est vide et l’IA ne répond pas).
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
| `WEBLOGBOOK_URL` | `https://www.mixouairlinesptfsweblogbook.com` (**www** obligatoire) |

Pas de `GROQ_API_KEY` ici : l’IA tourne sur Vercel. Redémarrer le service après un push.

## Vercel (site)

| Variable | Rôle |
|---|---|
| `SUPPORT_BOT_TOKEN` | **le même** token (créer salons / panel / transcripts / follow-up interactions) |
| `SUPPORT_BOT_SECRET` | **le même** secret |
| `DISCORD_PUBLIC_KEY` | Public Key du portail Discord (General Information) |
| `GROQ_API_KEY` | Groq (volume) |
| `DISCORD_GUILD_ID` | serveur (déjà en place, pas à retaper) |

## Choix du modèle IA (`src/lib/support/llm.ts`)

Tout passe par des variables : changer de modèle ou de fournisseur ne demande
aucune modification de code, seulement un redéploiement.

| Variable | Rôle | Valeur actuelle |
|---|---|---|
| `SUPPORT_LLM_BASE_URL` | endpoint compatible OpenAI | `https://api.groq.com/openai/v1` |
| `SUPPORT_LLM_API_KEY` | clé du fournisseur (à défaut `GROQ_API_KEY`) | — |
| `SUPPORT_LLM_MODEL` | modèle principal | `openai/gpt-oss-120b` |
| `SUPPORT_LLM_FALLBACK_MODEL` | replis, séparés par des virgules | `groq/compound-mini,openai/gpt-oss-20b` |
| `SUPPORT_LLM_BASE_URL_2` / `SUPPORT_LLM_API_KEY_2` / `SUPPORT_LLM_MODEL_2` | second fournisseur, essayé si le premier est totalement HS | non défini |

Les quotas Groq sont comptés **par modèle** : le plan gratuit donne 8K tokens/minute
et 1000 requêtes/jour à `gpt-oss-120b` (≈ 3 à 4 messages de ticket par minute) mais
70K tokens/minute et 250 requêtes/jour à `groq/compound-mini`. Enchaîner les trois
modèles additionne des seaux indépendants : ≈ 22 messages/minute et 2250/jour.

`groq/compound` est un système agentique : l’appel est bridé au seul interpréteur
de code (`compound_custom.tools.enabled_tools`) pour lui interdire la recherche web,
hors sujet pour un support qui ne cite que la documentation du site — et facturée à
part dès qu’on quitte le plan gratuit.

## Créer le bot Discord (une fois)

1. https://discord.com/developers/applications → New Application.
2. Bot → token. Intent **Message Content** activé (**obligatoire** pour le chat).
3. Inviter : scopes `bot` + `applications.commands` ; perms Voir / Envoyer / Embeds / Fichiers / Historique / Gérer les salons / Mention everyone.
4. Interactions Endpoint URL (ci-dessus).
5. Sur le site : choisir salon panel, salon logs, rôle staff, rôle instructeur (CAT / instruction) → **Créer panel + sections**.

Le process Railway relit la config du site toutes les **1 minute**.
