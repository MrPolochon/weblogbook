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
| `SUPPORT_BOT_SECRET` | même secret que Vercel (dédié, pas ATIS_WEBHOOK_SECRET) |
| `WEBLOGBOOK_URL` | `https://www.mixouairlinesptfsweblogbook.com` (**www** obligatoire) |

Pas de `GROQ_API_KEY` ici : l’IA tourne sur Vercel. Redémarrer le service après un push.

## Vercel (site)

| Variable | Rôle |
|---|---|
| `SUPPORT_BOT_TOKEN` | **le même** token (créer salons / panel / transcripts / follow-up interactions) |
| `SUPPORT_BOT_SECRET` | **le même** secret dédié (pas ATIS_WEBHOOK_SECRET) |
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

## Rôles administrateurs et corrections des tickets

Appliquer `supabase/add_support_admin_roles.sql` avant de configurer les nouveaux
rôles dans Admin → Bot assistance Discord → **Rôles administrateurs reconnus**.
Plusieurs rôles peuvent être sélectionnés. La permission Discord Administrateur
est également reconnue. Le bouton Réparer /register ajoute les permissions des
rôles configurés aux tickets existants.

Les noms par défaut sont désormais `ticket-xxxx`, stables quel que soit l'état.
Le bot confirme auprès du site qu'un salon correspond à un ticket ouvert du
serveur configuré : le nom ou la catégorie seuls ne donnent jamais accès.

Le dossier IA inclut les trois derniers plans de vol et avions personnels du
demandeur, en lecture seule. Les alertes staff répétées sont dédupliquées ;
les mentions @everyone/@here ne sont pas autorisées dans les messages du bot.

Simulation locale sans connexion Discord : `python support-bot/test_channel_filter.py`.
Elle couvre les salons hors tickets, les tickets fermés, les autres serveurs,
les messages privés et les différents rôles administrateurs/staff/instructeur.

## Remise à zéro des tickets après la mise à jour du 1er octobre 2026

1. Appliquer `supabase/reset_support_tickets_october_2026.sql` dans le projet
   Supabase du site. Il prépare la liste des tickets ouverts créés au plus tard
   le **1er octobre 2026 à 22:06:31 UTC** (instant de préparation de cette demande).
2. Déployer le site Vercel et redémarrer le bot Railway avec cette version.
   Le bot traite un ticket par minute via l’API protégée par `SUPPORT_BOT_SECRET`.
3. Consulter **Admin → Bot assistance Discord → Réinitialisation des anciens
   tickets**, puis **Actualiser le suivi** pour voir l’avancement et les MP refusés.

Pour chaque ticket ciblé, le bot conserve le transcript (jusqu’aux 400 derniers
messages, comme à la fermeture habituelle), supprime son salon puis envoie au
demandeur un MP expliquant la mise à jour et lui demandant de rouvrir un ticket,
avec le lien du panel. Une panne de lecture/archivage empêche la suppression.
Si le salon était déjà supprimé, la conversation conservée sur le site sert
de transcript. Le panel, les logs, les catégories et les nouveaux tickets sont
exclus. Aucun salon n’est ciblé à partir de son nom.

La file conserve les étapes réussies et un verrou par ticket : redémarrages et
réexécution du SQL ne relancent pas les éléments terminés. Les erreurs
temporaires sont réessayées après cinq minutes. Les MP refusés par Discord
(code 50007) sont marqués comme impossibles, sans prétendre avoir averti le membre.
Un nonce stable réduit aussi le risque de double MP si Discord a accepté l’envoi
juste avant une panne ; la déduplication de Discord n’est valable que quelques
minutes ([documentation Discord](https://docs.discord.com/developers/resources/message#create-message)).

Sans ce SQL, aucune réinitialisation ne démarre. Ce mécanisme est propre à cette
demande et ne supprime pas automatiquement les tickets aux mises à jour suivantes.

Simulation des pannes et reprises sans accès Discord :
`node scripts/test-support-update-reset.cjs`.

## Connaissances du site et relais humains

L’assistant suit le dernier sujet du ticket, conserve les détails d’erreur des
messages longs et utilise les procédures vérifiées des pages plans de vol,
copilote, inventaire, Felitz, NOTAMs, calendrier et compte. La liaison Discord
active est revérifiée avant chaque consultation du dossier ; un ancien compte
délié n’est jamais réutilisé. Le dossier inclut aussi les vols comme copilote.
Les erreurs de lecture sont signalées comme des informations indisponibles.

Sur une question ciblée, le bot consulte en lecture seule un aperçu daté des
NOTAMs de l’aéroport PTFS demandé (compte lié requis) ou du calendrier public.
Il conserve les unités et les horaires UTC et indique les limites de l’aperçu.
Il ne consulte pas les soldes bancaires et ne modifie aucune donnée métier.

Une demande explicite d’humain interrompt les questions d’inscription et ne
dépend pas du fournisseur IA. Les questions informatives, citations, négations
et hypothèses ne déclenchent pas à elles seules un appel. Un litige ou une
intervention nécessaire peut être transmis au staff ; une demande de séance
peut également mentionner le rôle instructeur configuré. Sans rôle staff, le
premier rôle administrateur configuré valide sert de secours.

Les commandes, boutons et réponses IA partagent une réservation d’alerte :
un seul ping pendant l’attente, même si le membre continue à discuter. Un
échec d’envoi libère cette réservation pour permettre un nouvel essai au
prochain message. La prise en charge par le staff garde l’IA silencieuse.

Cette amélioration ne nécessite aucun nouveau SQL. Elle se déploie côté site,
qui fournit les réponses au bot Railway. Simulations sans réseau ni message
Discord réel : `node scripts/test-support-ai.cjs` (inclut les garde-fous existants).
