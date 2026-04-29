-- Élargit compagnie_avions.statut pour la réparation pro (en_reparation), l’état détruit,
-- et les libellés alternatifs utilisés ailleurs dans l’app (disponible / en_vol, etc.).
-- Sans cela, les UPDATE vers en_reparation ou detruit peuvent violer une ancienne CHECK
-- (ground, in_flight, maintenance, bloque uniquement).

DO $$
DECLARE
  con_name text;
BEGIN
  FOR con_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE t.relname = 'compagnie_avions'
      AND n.nspname = 'public'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%statut%'
  LOOP
    EXECUTE format('ALTER TABLE public.compagnie_avions DROP CONSTRAINT %I', con_name);
  END LOOP;
END $$;

ALTER TABLE public.compagnie_avions
  ADD CONSTRAINT compagnie_avions_statut_check
  CHECK (
    statut IN (
      'ground',
      'in_flight',
      'maintenance',
      'bloque',
      'en_reparation',
      'detruit',
      'disponible',
      'en_vol',
      'en_maintenance',
      'en_transit',
      'en_location'
    )
  );
