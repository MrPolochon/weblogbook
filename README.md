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
