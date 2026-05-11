# Journal des blocages

Format: une entree par blocage, avec date, contexte, erreur, decision.

## Template

### YYYY-MM-DD - Titre

- **Tache** : (T1, T2, ...)
- **Symptome** : ...
- **Cause** : ...
- **Decision** : (rollback / contournement / reportee)
- **Suite** : ...

---

### 2026-05-10 - npm run build echoue localement (env OneDrive)

- **Tache** : Verification finale Phase 1
- **Symptome** : `npm run build` echoue avec "The cloud file provider exited unexpectedly. (os error 404)" sur des fichiers `node_modules/next/dist/...`
- **Cause** : Le projet est dans un dossier OneDrive synchronise. Certains fichiers de `node_modules` sont marques "online-only" et OneDrive n'arrive pas a les rendre disponibles assez vite.
- **Decision** : Pas un blocage Phase 1 (ne vient pas de mes modifications). `npx tsc --noEmit` passe sans erreur, `npm run lint` egalement. Le build devra etre relance apres synchronisation OneDrive complete, ou en deplacant le repo hors OneDrive (recommande pour un projet Node).
- **Suite** : Recommander au mainteneur de soit (a) mettre `node_modules/` en "always keep on this device" via OneDrive, (b) deplacer le repo hors OneDrive (par ex. `C:/dev/weblogbook`).

### 2026-05-10 - T6 noUncheckedIndexedAccess reportee

- **Tache** : T6 - TS strict++
- **Symptome** : Activation de `noUncheckedIndexedAccess` -> 384 erreurs TypeScript reparties sur tout le codebase (lib, components, routes API).
- **Cause** : Codebase large (226 routes API, 40+ composants 10+KB) avec acces a des arrays/objets indexes sans verification preliminaire (pattern `array[0]` sans default).
- **Decision** : Flag desactive pour Phase 1. La correction sera traitee par un effort dedie (Phase 2 ou tache parallele) avec un PR par lot de modules (lib/ d'abord, puis api/, puis components/).
- **Suite** : Voir Phase 2 du plan. Considerer `as const` plus large + helpers safe-access pour reduire l'amplitude.

### 2026-05-10 - Refonte cartes d'identite + selecteur logo compagnie

- **Tache** : Amelioration cartes d'identite (demande utilisateur)
- **Contexte** : Permettre a un utilisateur dans plusieurs compagnies de choisir le logo affiche sur sa carte ; refonte visuelle ; nettoyage code mort.
- **Changements** :
  - Migration SQL `supabase/add_carte_logo_source.sql` -> ajoute `logo_source` (auto/compagnie/manuel/aucun) et `logo_compagnie_id` a `cartes_identite`.
  - Nouveau helper `src/lib/cartes/logo-resolver.ts` -> centralise le calcul de logo et liste les compagnies de l'user (PDG / co-PDG / employe).
  - Nouvelles routes :
    - `GET  /api/cartes/mes-logos-disponibles` (liste compagnies + choix actuel)
    - `PATCH /api/cartes/mon-logo` (change auto/compagnie/aucun, valide rattachement)
  - Routes mises a jour :
    - `auto-generate` : pose `logo_source='auto'` + utilise le helper.
    - `refresh-all` : respecte `logo_source` ; ne touche pas au logo si `manuel`.
    - `upload` : un upload de logo par admin/IFSA bascule `logo_source='manuel'` + supprime l'ancien fichier perso (jamais ceux du dossier `logos/` partage).
  - UI :
    - `CarteIdentite.tsx` refondu (degrade, halo, grille subtile, photo encadree, bande STAFF doree, mode `interactive` avec tilt 3D + shine au hover).
    - Nouveau `MonLogoSelector.tsx` (cards radio par compagnie avec role et logo, options Auto/Aucun, prise en charge mode `manuel` lock).
    - `MaCartePhoto.tsx` integre le selecteur + utilise `sonner` au lieu d'etats locaux.
  - Cleanup :
    - `src/app/api/cartes/photo/` et `src/app/api/cartes/refresh-daily/` -> dossiers vides supprimes.
    - `delete-user.ts` -> ajoute `purgeUserStorageFolder('cartes-identite', userId)` pour supprimer les fichiers perso de l'utilisateur lors du delete (evite les futurs orphelins).
  - Accessibilite : globals.css ajoute un bloc `prefers-reduced-motion: reduce` qui desactive transitions, animations, tilt 3D et shine.
- **Verification** : `npx tsc --noEmit` OK, `npm run lint` OK (warnings pre-existants uniquement sur `<img>`). Build local KO -> bug OneDrive deja documente, non lie a ces changements.
- **A faire avant deploiement** : appliquer la migration SQL `add_carte_logo_source.sql` dans Supabase.


