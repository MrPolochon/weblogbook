# Archive — Migrations Supabase

Ce dossier contient les fichiers SQL qui ne sont **plus nécessaires** au fonctionnement
quotidien du site. Ils restent versionnés pour référence historique mais ne
doivent **pas être ré-exécutés**.

## Catégories

### Scripts ponctuels déjà exécutés (one-shot)
Opérations administratives à usage unique, déjà appliquées en production :

- `delete_737_from_inventaires.sql`, `delete_737_qatar.sql`
- `disconnect_all_sessions.sql`
- `drop_april_fool_ack.sql`
- `rembourser_tous_les_prets.sql`
- `reset_economie_felitz.sql`, `reset_felitz_historique_garder_soldes.sql`
- `revoke_admin_except_mrpolochon.sql`
- `set_felitz_personnel_300000.sql`
- `dedupe_felitz_comptes.sql`
- `migrate_avions_to_siavi.sql`
- `purge_plans_vol_historiques_plus_1_mois.sql`
- `reassign_exam_requests_fair_with_messages.sql`
- `reassign_instruction_exam_requests_ancien_systeme.sql`
- `reequilibrage_prix_avions.sql`
- `add_transactions_dotation_01012025.sql`

### Scripts de vérification / listage
Outils de debug, non destructifs mais sans valeur pour une nouvelle install :

- `list_changements_ip.sql`, `list_ips_comptes.sql`
- `VERIF_KEFLAVIK_PINGEYRI.sql`

### Migrations Felitz superseded
Versions intermédiaires consolidées plus tard dans le `schema.sql` actuel :

- `add_felitz_bank_system.sql` (V1)
- `MIGRATION_FELITZ_V2.sql`
- `MIGRATION_FELITZ_V3.sql`
- `create_felitz_accounts_existing.sql`

### Anciens packs de migrations consolidées
Remplacés par `schema.sql` au top-level + les `add_*.sql` / `fix_*.sql` individuels
encore présents :

- `MIGRATIONS_COMPLETES.sql`
- `MIGRATIONS_SUPABASE_CONSOLIDEES.sql`
- `MIGRATIONS_CHECKUP_COMPLET.sql`
- `MIGRATIONS_SECURITE_TOUT_EN_UN.sql`
- `TOUTES_MIGRATIONS.sql`
- `MIGRATION_COMPLETE_FLOTTE.sql`
- `migration_convertir_flotte.sql`
- `migration_flotte_individuelle.sql`
- `MIGRATIONS_A_EXECUTER.md` (doc obsolète)

## Pour une nouvelle installation

Voir le `README.md` à la racine du projet :
1. `supabase/schema.sql`
2. `supabase/seed_avions_ptfs.sql`
3. Les `add_*.sql` / `fix_*.sql` au top-level selon les fonctionnalités voulues.
