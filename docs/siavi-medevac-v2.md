# SIAVI / MEDEVAC — déploiement du 21 octobre 2026

## Base de données (à appliquer avant le déploiement du site)

Exécuter dans l’éditeur SQL Supabase, dans cet ordre :

1. `supabase/medevac_crew_remuneration_v2.sql`
2. `supabase/siavi_service_remuneration_v2.sql`

Ces migrations supposent les tables SIAVI, MEDEVAC, Felitz et téléphone déjà installées. Elles sont réexécutables. Aucune clé ni donnée de production n’est stockée dans ce changement.
Le dépôt ne contient pas de connexion de production utilisable ; les migrations sont testées avec PostgreSQL embarqué, mais ne sont pas automatiquement appliquées par un push Git.

Le cron `/api/cron/siavi-payments` utilise le `CRON_SECRET` déjà configuré. Il vérifie chaque minute les sessions ayant atteint une heure depuis leur dernier versement. La clôture et le changement de mode soldent le temps restant immédiatement. Le déclenchement est atomique avec le versement ; en cas de panne de paiement, la session reste conservée.

## Accès et parcours

- `/siavi` : choix de fonction.
- `/siavi/pompier` : pompier aéroportuaire.
- `/siavi/afis` : pompier AFIS, avec les restrictions de présence ATC existantes.
- `/siavi/medevac` : équipage MEDEVAC, missions et étapes.
- `/siavi/medevac/vol/[id]` : console du pilote propriétaire, transpondeur, clôture, annulation et reprise.
- `/siavi/brigade` : modification des grades par le chef de brigade SIAVI ou un administrateur. La nomination des chefs et la gestion de leurs grades restent réservées aux administrateurs.

Les trois fonctions gardent les droits SIAVI existants. La prise de service au sol et le démarrage/reprise d’un vol sont mutuellement exclusifs. Le mode maintenance global est levé ; les contrôles de rôle restent actifs.

## Rémunérations

- Pompier : 100 000 F$/heure, au prorata du temps enregistré.
- AFIS : 200 000 F$/heure, au prorata du temps enregistré.
- Appel reçu et décroché : 50 000 F$ une seule fois par appel, en Pompier ou AFIS ; les appels à soi-même sont exclus.
- Avion MEDEVAC : 150 000 + 5 000 F$ par minute enregistrée, plafond 2 000 000 F$.
- Hélicoptère MEDEVAC : 100 000 + 3 000 F$/min sur les 60 premières minutes, puis 2 000 F$/min, plafond 800 000 F$.

Le revenu porte sur la mission entière, en additionnant les étapes clôturées. 50 % vont au compte SIAVI ; le reste est réparti également entre les participants sélectionnés dans le rapport, pilote inclus. Les éventuels F$ indivisibles sont distribués dans un ordre stable. Le calcul définitif se fait sur les horaires stockés, sans utiliser la chronologie libre saisie dans le rapport.

Les nouvelles missions sont marquées avec `medevac_remuneration_version = 2`. Pour elles, rapport, répartition et crédits bancaires sont enregistrés dans une seule transaction. Une nouvelle soumission retourne le rapport existant sans reverser d’argent. Les missions déjà créées gardent leur ancien barème afin d’éviter un deuxième paiement.

## Vérification après migration et déploiement

Vérifier avec des comptes SIAVI autorisés : connexion dans chacune des trois fonctions ; dépôt MEDEVAC sans passer par le pilote ; transpondeur ; transfert ATC ; clôture et reprise d’une étape ; rapport avec plusieurs participants ; retour au centre de mission ; crédits 50/50 ; accès chef de brigade et refus pour un agent ordinaire. Utiliser une mission de test identifiée pour toute vérification produisant de la monnaie.
