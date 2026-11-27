# weblogbook – Logbook Serveur RP Aviation

**Repository GitHub :** [MrPolochon/weblogbook](https://github.com/MrPolochon/weblogbook)

Projet **séparé** du bot ATIS. Logbook pour pilotes avec auth, validation des vols par les admins, documents, etc.

## Emplacement

```
c:\Users\bonno\OneDrive\Bureau\Logbook\
```

## Setup

1. **Node.js** : installer Node (LTS) si besoin.
2. **Dépendances** :  
   `npm install`
3. **Supabase** : créer un projet sur [supabase.com](https://supabase.com), puis :
   - Copier `env.example.txt` en `.env.local`
   - Remplir `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - **Auth** : Désactiver l’inscription publique (Dashboard > Authentication > Providers > Email > « Enable email signup » = off).
   - **Storage** : Créer un bucket nommé `documents` (privé, ~20 Mo max par fichier). Vous pouvez exécuter `supabase/add_storage_documents.sql` dans l’éditeur SQL. Les téléchargements passent par l’API (URL signée) ; les **uploads admin** vont directement vers Storage (URL signée générée par l’API) pour éviter les limites de taille des requêtes sur l’hébergeur.
4. **Base de données** : exécuter le script SQL dans `supabase/schema.sql` (éditeur SQL Supabase).
5. **Lancer** :  
   `npm run dev`
6. **Premier lancement** : aller sur `/setup` pour créer le premier administrateur.

## Stack

- Next.js 14 (App Router), TypeScript, Tailwind
- Supabase (Auth, Postgres, Storage)

## CPDLC / AOC

Le DCDU apparaît sous la ComBox d'un plan déposé ou actif. Le bouton MCDU ouvre un îlot déplaçable avec les pages AOC uniquement ; toutes les données de demande sont saisies manuellement. Les contrôleurs disposent du panneau CPDLC dans la barre ATC pour lire, acquitter, répondre et transférer les messages.

Avant de publier cette version, appliquer `supabase/cpdlc_20261126.sql` à la base concernée. La migration est réexécutable et réserve ses tables et fonctions au serveur. Sans migration, le panneau signale une indisponibilité ; il ne prétend pas avoir envoyé de message. Les paramètres Supabase et ceux du bot ATIS sont ceux déjà utilisés par le site.

- Clairances : priorité Delivery / Clairance / Ground / Tower / DEP / APP / Center parmi les positions couvrant le terrain, y compris TMA et FIR configurées. À rôle égal, priorité au terrain local, puis à la plus ancienne session.
- Texte libre vers ATS : plus ancienne session couvrant le terrain. Les réponses et transferts sont liés à la session ; un changement de terrain du même contrôleur ne détourne pas la conversation.
- Délai de réponse : 30 secondes sans position couvrante, 5 minutes sinon. Les réponses tardives restent possibles et sont signalées.
- ACK confirme la lecture, séparément de WILCO / UNABLE / STANDBY. Le son fourni se répète toutes les 3 secondes tant que des messages restent non acquittés. Une interaction peut être nécessaire pour autoriser l'audio du navigateur ; un seul onglet sonne lorsque Web Locks est disponible.
- ATIS : texte explicitement publié pour le terrain par le bot du serveur. La météo AeroNav est une source distincte : observations de jeu au format METAR, sans date d'observation fournie. Cette source ne publie actuellement aucun TAF ; le DCDU affiche `TAF NOT AVAILABLE`.

Vérification locale : `npm test` inclut les tests CPDLC du routage, des droits d'accès, des transactions PostgreSQL, des délais, des acquittements, de l'audio et des interfaces. Avant activation sur un serveur réel, effectuer un échange avec un compte pilote et deux positions ATC, un transfert, une relève de position et une demande hors couverture. Pour revenir à l'interface précédente, rétablir la version applicative en conservant les tables CPDLC et leur historique.
