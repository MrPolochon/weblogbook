# Déploiement multi-bot ATIS

Ce document décrit les étapes pour activer **deux bots ATIS simultanés** (un par token Discord).

## Architecture

- Le bot `ATISVoiceMaker` lance **plusieurs bots Discord dans le même process Python**
  via `BotManager` (`bot_manager.py`).
- Chaque bot a un `instance_id` (1, 2, …). Les slash commands ne sont enregistrées que
  sur l'instance 1 (pour éviter les doublons), mais chaque bot peut diffuser un ATIS
  indépendant.
- Le site `weblogbook` stocke un état par instance dans `atis_broadcast_state` et
  `atis_broadcast_config` (PK = `id` text avec valeurs '1', '2', …).
- Démarrage d'un ATIS depuis le site = **auto-assign** sur le 1er bot disponible.
- Un même aéroport ne peut être diffusé que par un seul bot à la fois.

## Étapes de déploiement

### 1. Côté Discord Developer Portal

1. Créer un 2e bot Discord ([https://discord.com/developers/applications](https://discord.com/developers/applications))
2. Activer les intents :
   - **PRESENCE INTENT**
   - **SERVER MEMBERS INTENT**
   - **MESSAGE CONTENT INTENT**
3. Récupérer le token sous **Bot → Reset Token**
4. Inviter le 2e bot sur le serveur Discord cible avec les permissions :
   - **View Channels**
   - **Connect** (canaux vocaux)
   - **Speak** (canaux vocaux)
   - **Use Slash Commands**

### 2. Côté Render (service du bot)

Dans **Environment Variables**, ajouter :

```
DISCORD_TOKEN_2 = <le token du 2e bot>
```

Le `render.yaml` déclare déjà `DISCORD_TOKEN_2` (avec `sync: false` = la valeur vient du
dashboard).

Optionnel : si tu veux préconfigurer le serveur/canal du 2e bot pour les commandes slash
Discord (pas indispensable si la config est faite via le site) :

```
ATIS_WEBHOOK_GUILD_ID_2 = <guild_id>
ATIS_WEBHOOK_VOICE_CHANNEL_ID_2 = <channel_id>
```

Render va redéployer le service automatiquement après ajout des vars. Dans les logs tu
dois voir :

```
Initialized 2 ATIS bot instance(s)
Started ATIS bot instance 1
Started ATIS bot instance 2
```

### 3. Côté Supabase (migration DB)

Exécuter le script SQL :

```
supabase/migrate_atis_multi_instance.sql
```

Ce script :
- Renomme la ligne historique `id='default'` en `id='1'` dans `atis_broadcast_state`
  et `atis_broadcast_config`.
- Crée la ligne `id='2'` pour le 2e bot.
- Ajoute un index unique partiel pour empêcher qu'un même aéroport soit diffusé
  par 2 bots en même temps.
- Ajoute un index sur `controlling_user_id` pour les lookups rapides.

Le script est idempotent — tu peux le rejouer sans danger.

### 4. Côté site (weblogbook)

Aucune nouvelle variable d'environnement à ajouter (le secret partagé
`ATIS_WEBHOOK_SECRET` est déjà utilisé). Le code du site est déjà prêt :

- Les routes API détectent automatiquement quelle instance utiliser.
- Le panel ATIS (`AtcAtisButton`) affiche un sélecteur **Bot 1 / Bot 2** pour
  configurer le serveur et le canal vocal de chaque bot.

Une fois déployé, n'importe quel ATC peut :
1. Ouvrir le panneau ATIS
2. Cliquer sur **Bot 2** dans la section "Discord"
3. Choisir le canal vocal du Bot 2 (différent de celui du Bot 1)
4. Cliquer **Enregistrer**

À partir de ce moment, quand un ATC démarre un ATIS et que le Bot 1 est déjà
occupé, le système assigne automatiquement le Bot 2.

## Tests post-déploiement

1. **Lancer 1 ATIS** depuis l'interface ATC → vérifier qu'il démarre sur le Bot 1
   (canal vocal du Bot 1).
2. **Avec un autre ATC**, lancer un 2e ATIS sur un autre aéroport → vérifier qu'il
   démarre sur le Bot 2 (canal vocal du Bot 2).
3. **Tenter de lancer un 3e ATIS** → vérifier le message d'erreur "Tous les bots
   ATIS sont déjà actifs".
4. **Tenter de lancer un ATIS sur un aéroport déjà broadcast** → vérifier le
   message d'erreur "L'ATIS de XXX est déjà diffusé par un autre contrôleur".
5. **Stop** un ATIS → vérifier que seul l'ATIS du Bot correspondant s'arrête,
   l'autre continue.
6. **Modifier code/CAVOK/bilingue/runway** → vérifier que ça affecte le bon Bot
   (celui que l'ATC contrôle).

## Ajouter un 3e bot (futur)

La logique est générique : pour ajouter un Bot 3, il suffit de :
- Ajouter `DISCORD_TOKEN_3` dans Render
- Insérer manuellement les lignes `id='3'` dans `atis_broadcast_state` et
  `atis_broadcast_config` :

```sql
INSERT INTO public.atis_broadcast_state (id, broadcasting) VALUES ('3', false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO public.atis_broadcast_config (id) VALUES ('3')
  ON CONFLICT (id) DO NOTHING;
```

- Mettre à jour le sélecteur du panel ATIS (`AtcAtisButton.tsx`, ligne
  `[1, 2].map((id) => ...)` → `[1, 2, 3].map(...)`).
