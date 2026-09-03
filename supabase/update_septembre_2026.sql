-- MAJ Septembre 2026 — schéma optionnel (à exécuter manuellement dans l’éditeur SQL Supabase).
-- Ne DROP rien. N’altère pas l’enum messages_type_message (risque de casser la prod).

-- Cooldown BRIA côté serveur (le localStorage reste un filet UX uniquement).
create table if not exists public.bria_cooldowns (
  user_id uuid primary key references auth.users (id) on delete cascade,
  until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.bria_cooldowns enable row level security;

-- Accès uniquement via service role (API Next). Aucune policy utilisateur.

-- Vérifications à lancer à la main (ne pas appliquer en aveugle) :
--   select unnest(enum_range(NULL::messages_type_message_enum));
--   -- si l’enum existe : ALTER TYPE ... ADD VALUE IF NOT EXISTS 'cheque_salaire_atc';
--   -- scripts déjà documentés comme CRITIQUES :
--   --   supabase/add_statut_annule_plans_vol.sql
--   --   supabase/fix_pay_siavi_taxes.sql
--   --   supabase/fix_pay_siavi_intervention.sql
--   --   supabase/add_felitz_atomic_helpers.sql
--   --   supabase/OPTIMISATION_INDEX.sql
--   --   pack Ground Crew (add_ground_crew*.sql)
