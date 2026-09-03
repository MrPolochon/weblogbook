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

-- Inventaire prod (2 sept. 2026) : type_message = text (pas d’enum).
-- add_statut_annule_plans_vol.sql : NE PAS réappliquer (perdrait planifie_suivant / en_pause).
-- Compléments appliqués : fix_pay_siavi_*.sql, OPTIMISATION_INDEX.sql, add_classement_rpc.sql.
