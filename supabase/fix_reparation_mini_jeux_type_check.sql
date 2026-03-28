-- Fix: allow all repair mini-game types in score table.
-- This resolves errors like:
-- new row for relation "reparation_mini_jeux_scores"
-- violates check constraint "reparation_mini_jeux_scores_type_jeu_check"

ALTER TABLE public.reparation_mini_jeux_scores
  DROP CONSTRAINT IF EXISTS reparation_mini_jeux_scores_type_jeu_check;

ALTER TABLE public.reparation_mini_jeux_scores
  ADD CONSTRAINT reparation_mini_jeux_scores_type_jeu_check
  CHECK (
    type_jeu IN (
      'inspection',
      'calibrage',
      'assemblage',
      'test_moteur',
      'cablage',
      'hydraulique',
      'soudure',
      'diagnostic'
    )
  );
