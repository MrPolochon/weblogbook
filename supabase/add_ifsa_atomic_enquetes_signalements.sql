-- Génération atomique des numéros ENQ-*/SIG-* (évite la violation
-- ifsa_enquetes_numero_dossier_key / homologue signalements en concurrence)

CREATE OR REPLACE FUNCTION public.ifsa_enquetes_create(
  p_titre text,
  p_description text,
  p_priorite text,
  p_pilote_concerne_id uuid,
  p_compagnie_concernee_id uuid,
  p_ouvert_par_id uuid,
  p_enqueteur_id uuid
) RETURNS public.ifsa_enquetes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_part text;
  seq_num integer;
  new_num text;
  result ifsa_enquetes;
BEGIN
  year_part := to_char(now(), 'YYYY');
  PERFORM pg_advisory_xact_lock(100001, (year_part)::integer);

  SELECT coalesce(max(cast(split_part(numero_dossier, '-', 3) as integer)), 0) + 1
  INTO seq_num
  FROM ifsa_enquetes
  WHERE numero_dossier like 'ENQ-' || year_part || '-%';

  new_num := 'ENQ-' || year_part || '-' || lpad(seq_num::text, 4, '0');

  INSERT INTO ifsa_enquetes (
    numero_dossier,
    titre,
    description,
    priorite,
    pilote_concerne_id,
    compagnie_concernee_id,
    ouvert_par_id,
    enqueteur_id,
    statut
  ) VALUES (
    new_num,
    p_titre,
    p_description,
    coalesce(p_priorite, 'normale'),
    p_pilote_concerne_id,
    p_compagnie_concernee_id,
    p_ouvert_par_id,
    p_enqueteur_id,
    'ouverte'
  )
  RETURNING * INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.ifsa_signalements_create(
  p_type_signalement text,
  p_titre text,
  p_description text,
  p_signale_par_id uuid,
  p_pilote_signale_id uuid,
  p_compagnie_signalee_id uuid,
  p_preuves text,
  p_statut text
) RETURNS public.ifsa_signalements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_part text;
  seq_num integer;
  new_num text;
  result ifsa_signalements;
BEGIN
  year_part := to_char(now(), 'YYYY');
  PERFORM pg_advisory_xact_lock(100002, (year_part)::integer);

  SELECT coalesce(max(cast(split_part(numero_signalement, '-', 3) as integer)), 0) + 1
  INTO seq_num
  FROM ifsa_signalements
  WHERE numero_signalement like 'SIG-' || year_part || '-%';

  new_num := 'SIG-' || year_part || '-' || lpad(seq_num::text, 4, '0');

  INSERT INTO ifsa_signalements (
    numero_signalement,
    type_signalement,
    titre,
    description,
    signale_par_id,
    pilote_signale_id,
    compagnie_signalee_id,
    preuves,
    statut
  ) VALUES (
    new_num,
    p_type_signalement,
    p_titre,
    p_description,
    p_signale_par_id,
    p_pilote_signale_id,
    p_compagnie_signalee_id,
    p_preuves,
    coalesce(p_statut, 'nouveau')
  )
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.ifsa_enquetes_create(
  text, text, text, uuid, uuid, uuid, uuid
) FROM public;

REVOKE ALL ON FUNCTION public.ifsa_signalements_create(
  text, text, text, uuid, uuid, uuid, text, text
) FROM public;

GRANT EXECUTE ON FUNCTION public.ifsa_enquetes_create(
  text, text, text, uuid, uuid, uuid, uuid
) TO service_role;

GRANT EXECUTE ON FUNCTION public.ifsa_signalements_create(
  text, text, text, uuid, uuid, uuid, text, text
) TO service_role;

COMMENT ON FUNCTION public.ifsa_enquetes_create IS
  'Création d''enquête avec numéro ENQ verrouillé (concurrence)';

COMMENT ON FUNCTION public.ifsa_signalements_create IS
  'Création de signalement avec numéro SIG verrouillé (concurrence)';
