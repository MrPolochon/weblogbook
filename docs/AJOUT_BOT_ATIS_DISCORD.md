# Ajouter un bot ATIS Discord (étape par étape)

Ce guide te permet de créer le **Bot 2** (ou Bot N) Discord et de le brancher
au système ATIS multi-bot du site. Le code est déjà prêt — tu n'as pas besoin
de toucher au site, seulement à Discord, Render et Supabase.

> **Pré-requis** : tu es admin du serveur Discord cible et tu as accès au
> dashboard Render qui héberge `ATISVoiceMaker`.

---

## Étape 1 — Créer l'application Discord

1. Ouvre [discord.com/developers/applications](https://discord.com/developers/applications).
2. Clique **New Application**. Nomme-la par ex. `ATIS Bot 2 — PTFS`. Accepte
   les ToS.
3. Dans le menu de gauche, va dans **Bot**.
   - Clique **Add Bot** si demandé.
   - Sous **Privileged Gateway Intents**, active les **TROIS** intents :
     - ✅ `PRESENCE INTENT`
     - ✅ `SERVER MEMBERS INTENT`
     - ✅ `MESSAGE CONTENT INTENT`
   - Sauvegarde en bas (**Save Changes**).
4. Clique **Reset Token**, confirme, **copie le token** (il ne sera affiché
   qu'une seule fois — garde-le précieusement, mets-le dans ton gestionnaire
   de mots de passe ou colle-le directement dans Render à l'étape 3).

---

## Étape 2 — Inviter le bot sur ton serveur Discord

1. Toujours dans Discord Developer Portal, va dans **OAuth2** → **URL Generator**.
2. Coche les **scopes** :
   - ✅ `bot`
   - ✅ `applications.commands`
3. Coche les **Bot Permissions** minimales :
   - `View Channels`
   - `Connect` (catégorie *Voice Channel Permissions*)
   - `Speak` (idem)
   - `Use Slash Commands` (catégorie *Text Permissions*)
4. Copie l'URL générée en bas, ouvre-la dans ton navigateur, sélectionne ton
   serveur Discord cible et **Authorize**.
5. Vérifie dans Discord que le bot apparaît dans la liste des membres
   (offline pour l'instant, c'est normal).

---

## Étape 3 — Configurer Render

1. Ouvre ton service `ATISVoiceMaker` sur Render.
2. Onglet **Environment** → **Add Environment Variable** :
   - Key : `DISCORD_TOKEN_2`
   - Value : *colle le token de l'étape 1.4*
   - Save.
3. (Optionnel mais recommandé) Si tu veux pré-configurer un canal vocal de
   secours (utilisé si la DB est vide) :
   ```
   ATIS_WEBHOOK_GUILD_ID_2     = <ton guild_id>
   ATIS_WEBHOOK_VOICE_CHANNEL_ID_2 = <ton channel_id vocal>
   ```
   *(Pour récupérer les IDs : active le mode développeur Discord dans
   Paramètres utilisateur → Avancés → Mode développeur, puis clic droit →
   Copier l'identifiant.)*
4. Render va redéployer automatiquement. Va voir les logs : tu dois voir
   ```
   Initialized 2 ATIS bot instance(s)
   Started ATIS bot instance 1
   Started ATIS bot instance 2
   ```
   Si tu ne vois que `Initialized 1`, vérifie que `DISCORD_TOKEN_2` est bien
   présent et que tu as cliqué Save.

---

## Étape 4 — Migration Supabase

1. Ouvre l'éditeur SQL Supabase (Dashboard → SQL Editor).
2. Copie/colle le contenu de `supabase/add_atis_bot_instance_2.sql`.
3. Exécute (▶ Run). La migration est **idempotente** — tu peux la rejouer
   sans risque.
4. Vérifie le résultat avec les requêtes au bas du fichier (commentées).

---

## Étape 5 — Vérification automatique

1. Connecte-toi au site avec un compte admin.
2. Va dans `/admin/atis-bots` (panneau **Administration → Bots ATIS**).
3. Clique **Relancer le diagnostic**.
4. Tous les checks doivent être verts ✓ :
   - Variables d'environnement (site)
   - Bot Render joignable
   - Secret partagé chargé côté bot
   - Bot manager initialisé
   - Instances Discord prêtes (2)
   - Lignes DB par instance
   - Cohérence DB ↔ bot live

> Si **Config Discord** est en orange (warn), c'est normal : il reste à
> assigner un canal vocal au Bot 2 (étape 6).

---

## Étape 6 — Assigner un canal vocal au Bot 2

1. Mets-toi en service ATC (panneau ATC).
2. Ouvre le panneau ATIS (bouton flottant en bas à gauche).
3. Onglet **Config**.
4. Sélecteur **Bot 2** (cliquable maintenant qu'il est détecté
   automatiquement).
5. Choisis le serveur Discord et le canal vocal cible (différent de celui
   du Bot 1).
6. Clique **Enregistrer config Bot 2**.

À partir de ce moment, quand un ATC démarre un ATIS et que le Bot 1 est déjà
occupé, le système assigne automatiquement le Bot 2. Un ATC peut aussi
forcer un bot précis via le sélecteur **Auto / Bot 1 / Bot 2** au-dessus du
bouton Démarrer.

---

## Test final

1. ATC #1 démarre l'ATIS de l'aéroport A → doit aller sur Bot 1 (canal A).
2. ATC #2 démarre l'ATIS de l'aéroport B → doit aller sur Bot 2 (canal B).
3. ATC #3 essaie de démarrer un 3e ATIS → message « Tous les bots ATIS sont
   déjà actifs ».
4. ATC #1 stop → Bot 1 redevient libre, le slot suivant l'utilisera.

---

## Diagnostic des erreurs courantes

| Symptôme | Cause probable | Fix |
|---|---|---|
| `Bot Render injoignable` (40+s) | Cold start Render free tier | Attendre 1-2 min, recliquer Réessayer |
| `Secret incorrect (401)` | `ATIS_WEBHOOK_SECRET` différent entre site et bot | Vérifier que les deux utilisent **exactement** la même valeur |
| `Initialized 1 ATIS bot instance(s)` au lieu de 2 | `DISCORD_TOKEN_2` non lu | Refaire l'étape 3, vérifier l'orthographe (pas de `DISCORD_TOKEN2` ni `DISCORD_BOT_TOKEN_2`) |
| Bot 2 reste *starting* | Discord refuse la connexion | Vérifier les 3 intents activés, regenerer le token, réinviter le bot |
| `Lignes default détectées` | Migration legacy pas encore lancée | Lancer `supabase/add_atis_bot_instance_2.sql` |
| `1 aeroport déjà diffusé par instance X` | Index unique partiel a fait son boulot | C'est voulu — un même aéroport ne peut être diffusé que par 1 bot |

---

## Pour ajouter un Bot 3, 4, 5...

Le code est **100% dynamique**. Il suffit de :
1. Créer une 3e application Discord (étape 1) → copier le token.
2. Ajouter `DISCORD_TOKEN_3` sur Render (étape 3).
3. Insérer la ligne `id='3'` dans la DB :
   ```sql
   INSERT INTO public.atis_broadcast_state (id, broadcasting) VALUES ('3', false)
     ON CONFLICT (id) DO NOTHING;
   INSERT INTO public.atis_broadcast_config (id) VALUES ('3')
     ON CONFLICT (id) DO NOTHING;
   ```
4. Relancer le health-check `/admin/atis-bots` — Bot 3 apparaît automatiquement.
5. Configurer son canal vocal depuis le panneau ATIS.

**Aucune modification de code n'est requise** — ni côté site, ni côté bot Python.
