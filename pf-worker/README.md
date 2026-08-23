# PFtesterODW — enregistreur de positions

Service permanent qui interroge l'API trafic de Project Flight chaque seconde et
écrit les positions du serveur privé Mixou dans Supabase (`pf_odw_positions`).

Sans lui, les traces de la carte `/carte-atc` sont construites par le navigateur :
elles n'existent que pendant qu'un admin garde la page ouverte. Avec lui, le
trajet est enregistré en continu et retrouvé par n'importe quel admin.

## Fonctionnement

- Une position par seconde et par appareil, uniquement si l'appareil a bougé
  (un avion au parking n'écrit pas une ligne par seconde).
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

```bash
npm install
npm run pf-worker
```

Les variables peuvent être placées dans `.env.local` puis exportées, ou passées
directement dans l'environnement du shell.
