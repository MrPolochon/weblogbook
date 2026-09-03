# Suggestions — après MAJ Septembre 2026

Pistes volontairement **non** livrées ce mois-ci, pour ne pas casser la console ATC ni le dépôt de plan.

## Console ATC (suite)

- Bays dédiées par position (Delivery PLAN/CLRD, Ground RAMP/TAXI, etc.) — aujourd’hui : mêmes colonnes + toast hors phase.
- Retrait de la file basse strips + mode compact/standard.
- Hiérarchie de transfert AFIS complète.

## Dépôt / IFSA / téléphone

- Wizard dépôt en 4 étapes (avion → route → charge → soumission) sans réécrire les 2300 lignes d’un coup.
- Extraire `IfsaClient.tsx` par onglet ; pagination au-delà de 50.
- Shell UI commun ATC / SIAVI téléphone (12 routes API miroir).

## Perfs / data

- Marché cargo : `/marche-cargo` redirige encore vers passagers ; `MarcheCargoClient` est mort — relivrer ou supprimer.
- RPC `regenerer_*` marché à chaque SSR → cron + alerte si RPC absente.
- Storage orphelins : étendre au-delà de `cartes-identite` + `documents`.
- Catalogue perf PTFS : types orphelins (refuser le proxy trop éloigné plutôt que mapper 757→737).

## Sécurité / ops

- RLS : terminer `docs/rls-audit.md` + `fix_supabase_linter_permissive_rls_policies.sql`.
- Double ingestion PF-ODW (Railway vs cron Vercel) : une seule source de vérité.
- Dossier `supabase/migrations/` réellement utilisé par la CLI (aujourd’hui ~184 scripts manuels).
