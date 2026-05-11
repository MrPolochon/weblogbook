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


