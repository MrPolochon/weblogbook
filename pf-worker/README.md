# PFtesterODW — enregistreur de positions

Service permanent qui lit le trafic Project Flight et écrit les positions du
serveur privé Mixou dans Supabase (`pf_odw_positions`).

Sans lui, les traces de la carte `/carte-atc` n'existent que pendant qu'un
admin garde la page ouverte.

## Fonctionnement

- Un **WebSocket unique** reste ouvert sur
  `wss://api.project-flight.com/v3/traffic/server/ws/{serverId}`. Les frames
  vides sont des heartbeats : on ne se reconnecte pas, on ne les compte pas
  comme des échecs. Le protobuf Mixou est ingéré quand il arrive.
- Un snapshot HTTP `https://api.project-flight.com/v3/traffic/fetch` toutes
  les **10 s** reste la source fiable dès que le WS ne livre pas d'avions.
- Un cron Vercel (1/min) ne tourne que si le heartbeat worker en base a plus
  de 90 s.
- Heartbeat `pf_odw_health.updated_at` toutes les 10 s, même à 0 avion : la
  carte affiche « aucun trafic Mixou », pas « worker arrêté ».
- Un déplacement anormalement grand est marqué `gap` : la carte coupe le tracé.
- Les traces ne sont **pas** archivées. Deux minutes après la dernière
  position, le vol est purgé (`pf_odw_purge_finished_flights`).

## Déploiement Railway

Root Directory à la **racine** du dépôt (le worker importe `src/lib`). Après un
push, **redémarrer le service pf-worker** si Railway n'a pas repris tout seul
(SIGTERM d'un déploiement en cours).

| Variable | Rôle |
| --- | --- |
| `SUPABASE_URL` | URL du projet Supabase (ou `NEXT_PUBLIC_SUPABASE_URL`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé de service, obligatoire pour écrire |
| `PF_PRIVATE_SERVER_ID` | Optionnel, sinon le serveur Mixou par défaut |
| `PF_WORKER_IDLE_SEC` | Optionnel, 120 par défaut |

`railway.json` : `npm run pf-worker`, Node 20, redémarrage `ALWAYS`.

## Lancement local

```
npx vercel env pull .env.development.local --environment=production
npx tsx --env-file=.env.development.local pf-worker/index.ts
```

Ce fichier contient la clé de service : le supprimer après usage.
