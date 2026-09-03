# Suggestions — après MAJ Septembre 2026

Pistes volontairement **non** livrées ce mois-ci, pour ne pas casser la console ATC ni le dépôt de plan.

## Console ATC (suite)

- Bays dédiées par position (Delivery PLAN/CLRD, Ground RAMP/TAXI, etc.) — aujourd’hui : mêmes colonnes + toast hors phase.
- Retrait de la file basse strips + mode compact/standard.
- Hiérarchie de transfert AFIS complète.

## Dépôt / IFSA / téléphone

- Extraire `IfsaClient.tsx` par fichier d’onglet (listes + pagination OK, monolithe ~2900 lignes encore là).
- Shell UI commun ATC / SIAVI téléphone (hook audio partagé ; 12 routes API encore en miroir).

## Perfs / data

- Catalogue perf PTFS : types orphelins (refuser le proxy trop éloigné plutôt que mapper 757→737).
- Storage orphelins : buckets hors `cartes-identite` / `documents` si d’autres apparaissent.

## Sécurité / ops

- RLS : terminer `docs/rls-audit.md` + `fix_supabase_linter_permissive_rls_policies.sql`.
- Dossier `supabase/migrations/` réellement utilisé par la CLI (aujourd’hui ~184 scripts manuels).
