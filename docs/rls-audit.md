# Audit RLS Supabase - weblogbook

## Methode

- `createClient()` (src/lib/supabase/server.ts) : client cookies utilisateur, RLS actif.
- `createAdminClient()` (src/lib/supabase/admin.ts) : client service_role, **bypass RLS**. Usage strictement server-side et justifie.

## Utilisations de `createAdminClient` identifiees

A completer ligne par ligne. Chaque entree doit prouver pourquoi le bypass est necessaire.

| Fichier | Lignes | Justification | Statut |
|---|---|---|---|
| src/app/(app)/layout.tsx | 21, 56-89 | Lecture compteurs admin (vols pendants, plans, password resets, aeroschool) - donnees globales non accessibles via RLS utilisateur | A revoir : pourrait passer par RPC SECURITY DEFINER |
| src/middleware.ts | 83-104 | Lecture security_logout, site_config, discord_links - middleware doit fonctionner avant resolution du contexte utilisateur RLS | OK |
| src/lib/delete-user.ts | TBD | Suppression cascade utilisateur | A verifier |
| src/lib/email.ts | TBD | Envoi mails systeme | A verifier |
| ... | | | A inventorier |

Commande pour lister: `rg "createAdminClient" src/`.

## Tables et policies RLS

| Table | SELECT | INSERT | UPDATE | DELETE | Notes |
|---|---|---|---|---|---|
| profiles | self / admin | self (signup) | self / admin | admin | A verifier |
| vols | pilote/copilote/instructeur | pilote | pilote / admin | admin | A verifier |
| plans_vol | pilote / ATC en service | pilote / ATC | pilote / admin | admin | A verifier |
| messages | participants | sender | sender | admin | A verifier |
| notams | public auth | admin | admin | admin | A verifier |
| atc_sessions / atc_espace | public auth | self | self | self | A verifier dans add_atc_espace.sql |
| compagnies | public auth | admin | pdg / co_pdg / admin | admin | A verifier |
| compagnie_employes | members | pdg | pdg | pdg | A verifier |
| alliances | members | admin | president | admin | A verifier |
| documents | proprio / admin | admin | admin | admin | A verifier |
| flight_strips | controleur en service | controleur | controleur | controleur | A verifier add_flight_strips.sql |
| ... | | | | | A completer pour toutes les tables |

## Actions requises

- [ ] Inventorier tous les `createAdminClient` (commande rg ci-dessus)
- [ ] Verifier chaque migration dans `supabase/` pour les `CREATE POLICY`
- [ ] Lister les tables sans RLS (potentiellement risque)
- [ ] Documenter chaque bypass restant
- [ ] Migrer les bypass evitables vers des RPC `SECURITY DEFINER`

## References

- Lint Supabase deja partiellement traite : voir `supabase/fix_supabase_linter_*.sql`
- Tables sans RLS deja corrigees : `supabase/fix_rls_missing_tables.sql`
