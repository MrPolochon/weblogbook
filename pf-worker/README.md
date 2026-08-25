# PFtesterODW — enregistreur de positions

Service permanent qui interroge l'API trafic de Project Flight chaque seconde et
écrit les positions du serveur privé Mixou dans Supabase (`pf_odw_positions`).

Sans lui, les traces de la carte `/carte-atc` sont construites par le navigateur :
elles n'existent que pendant qu'un admin garde la page ouverte. Avec lui, le
trajet est enregistré en continu et retrouvé par n'importe quel admin.

## Fonctionnement

- Mixou n'envoie le protobuf **qu'à l'ouverture** du WebSocket
  `wss://api.project-flight.com/v3/traffic/server/ws/{serverId}`, puis des
  heartbeats vides. Le worker se reconnecte donc **chaque seconde**, écrit le
  snapshot dans Supabase, et tourne 24/7 même si `/carte-atc` est fermé.
- Un snapshot HTTP toutes les 10 s sert de secours si le WebSocket lâche.
- Un cron Vercel fait une passe par minute si Railway est à l'arrêt.
- Un déplacement anormalement grand est marqué `gap` : la carte coupe le tracé
  au lieu de dessiner une ligne droite à travers la carte.
- Les traces ne sont **pas** archivées. Deux minutes après la dernière position
  d'un appareil, le vol est considéré terminé et toutes ses positions sont
  supprimées (`pf_odw_purge_finished_flights`).
- Le décodeur protobuf est importé depuis `src/lib/pftester-odw.ts` : une seule
  implémentation du format PF pour le site et le worker.

## Prérequis base de données

Exécuter une fois `supabase/pf_odw_positions.sql` dans l'éditeur SQL Supabase.

## Déploiement Railway

Nouveau service sur le dépôt `MrPolochon/weblogbook`, **Root Directory laissé à la
racine** (le worker importe `src/lib`, il a besoin de tout le dépôt).

| Variable | Rôle |
| --- | --- |
| `SUPABASE_URL` | URL du projet Supabase (ou `NEXT_PUBLIC_SUPABASE_URL`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé de service, obligatoire pour écrire |
| `PF_PRIVATE_SERVER_ID` | Optionnel, sinon le serveur Mixou par défaut |
| `PF_WORKER_POLL_MS` | Optionnel, 1000 par défaut |
| `PF_WORKER_IDLE_SEC` | Optionnel, 120 par défaut |

Démarrage et politique de redémarrage sont définis dans `railway.json` à la
racine du dépôt (`npm run pf-worker`, redémarrage systématique).

## Lancement local

Récupérer les variables depuis Vercel dans un fichier ignoré par git, puis lancer :

```bash
npx vercel env pull .env.development.local --environment=production
npx tsx --env-file=.env.development.local pf-worker/index.ts
```

Ce fichier contient la clé de service : le supprimer après usage.

## Tables

- `pf_odw_positions` — les points de trace.
- `pf_odw_flights` — dernière fois que chaque vol a été vu. Indispensable :
  un avion immobile n'ajoute aucun point, mais il est toujours en vol. Sans
  cette table, la purge effacerait sa trace au bout de deux minutes.
