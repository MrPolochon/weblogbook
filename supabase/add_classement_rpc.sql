-- Classement pilotes : agrégation SQL (plus de limite 10 000 vols en mémoire).
-- Même règles que src/app/(app)/classement/page.tsx :
--   vols.validé, attribution à tous les participants (dédup par vol),
--   heures = heures_initiales + SUM(duree), IFR/VFR/Instruction/Vol militaire.

CREATE OR REPLACE FUNCTION public.get_classement_pilotes()
RETURNS TABLE (
  id                    uuid,
  identifiant           text,
  total_minutes         bigint,
  nb_vols               bigint,
  nb_licences           bigint,
  nb_aeroports          bigint,
  nb_types_avion        bigint,
  nb_vols_ifr           bigint,
  nb_vols_vfr           bigint,
  nb_vols_instruction   bigint,
  nb_vols_militaires    bigint,
  longest_flight        integer,
  solde                 bigint,
  nb_avions             bigint,
  member_since          timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH participants AS (
    SELECT v.id AS vol_id, v.duree_minutes, v.type_vol,
           v.aeroport_depart, v.aeroport_arrivee, v.type_avion_id,
           v.pilote_id AS profile_id
    FROM public.vols v
    WHERE v.statut = 'validé' AND v.pilote_id IS NOT NULL
    UNION
    SELECT v.id, v.duree_minutes, v.type_vol,
           v.aeroport_depart, v.aeroport_arrivee, v.type_avion_id,
           v.copilote_id
    FROM public.vols v
    WHERE v.statut = 'validé' AND v.copilote_id IS NOT NULL
    UNION
    SELECT v.id, v.duree_minutes, v.type_vol,
           v.aeroport_depart, v.aeroport_arrivee, v.type_avion_id,
           v.instructeur_id
    FROM public.vols v
    WHERE v.statut = 'validé' AND v.instructeur_id IS NOT NULL
    UNION
    SELECT v.id, v.duree_minutes, v.type_vol,
           v.aeroport_depart, v.aeroport_arrivee, v.type_avion_id,
           v.chef_escadron_id
    FROM public.vols v
    WHERE v.statut = 'validé' AND v.chef_escadron_id IS NOT NULL
    UNION
    SELECT v.id, v.duree_minutes, v.type_vol,
           v.aeroport_depart, v.aeroport_arrivee, v.type_avion_id,
           e.profile_id
    FROM public.vols_equipage_militaire e
    JOIN public.vols v ON v.id = e.vol_id
    WHERE v.statut = 'validé' AND e.profile_id IS NOT NULL
  ),
  agg AS (
    SELECT
      profile_id,
      COUNT(*)::bigint AS nb_vols,
      COALESCE(SUM(duree_minutes), 0)::bigint AS vol_minutes,
      COUNT(*) FILTER (WHERE type_vol = 'IFR')::bigint AS nb_vols_ifr,
      COUNT(*) FILTER (WHERE type_vol = 'VFR')::bigint AS nb_vols_vfr,
      COUNT(*) FILTER (WHERE type_vol = 'Instruction')::bigint AS nb_vols_instruction,
      COUNT(*) FILTER (WHERE type_vol = 'Vol militaire')::bigint AS nb_vols_militaires,
      COALESCE(MAX(duree_minutes), 0)::integer AS longest_flight,
      COUNT(DISTINCT type_avion_id) FILTER (WHERE type_avion_id IS NOT NULL)::bigint AS nb_types_avion
    FROM participants
    GROUP BY profile_id
  ),
  airports AS (
    SELECT profile_id, COUNT(DISTINCT apt)::bigint AS nb_aeroports
    FROM (
      SELECT profile_id, aeroport_depart AS apt
      FROM participants
      WHERE aeroport_depart IS NOT NULL AND aeroport_depart <> ''
      UNION
      SELECT profile_id, aeroport_arrivee
      FROM participants
      WHERE aeroport_arrivee IS NOT NULL AND aeroport_arrivee <> ''
    ) x
    GROUP BY profile_id
  ),
  licences AS (
    SELECT user_id, COUNT(*)::bigint AS n
    FROM public.licences_qualifications
    GROUP BY user_id
  ),
  avions AS (
    SELECT proprietaire_id, COUNT(*)::bigint AS n
    FROM public.inventaire_avions
    WHERE proprietaire_id IS NOT NULL
    GROUP BY proprietaire_id
  ),
  soldes AS (
    SELECT DISTINCT ON (proprietaire_id)
      proprietaire_id,
      COALESCE(solde, 0)::bigint AS solde
    FROM public.felitz_comptes
    WHERE type = 'personnel' AND proprietaire_id IS NOT NULL
    ORDER BY proprietaire_id, solde DESC
  )
  SELECT
    p.id,
    p.identifiant,
    (COALESCE(p.heures_initiales_minutes, 0) + COALESCE(a.vol_minutes, 0))::bigint,
    COALESCE(a.nb_vols, 0),
    COALESCE(l.n, 0),
    COALESCE(ap.nb_aeroports, 0),
    COALESCE(a.nb_types_avion, 0),
    COALESCE(a.nb_vols_ifr, 0),
    COALESCE(a.nb_vols_vfr, 0),
    COALESCE(a.nb_vols_instruction, 0),
    COALESCE(a.nb_vols_militaires, 0),
    COALESCE(a.longest_flight, 0),
    COALESCE(s.solde, 0),
    COALESCE(inv.n, 0),
    p.created_at
  FROM public.profiles p
  LEFT JOIN agg a ON a.profile_id = p.id
  LEFT JOIN airports ap ON ap.profile_id = p.id
  LEFT JOIN licences l ON l.user_id = p.id
  LEFT JOIN soldes s ON s.proprietaire_id = p.id
  LEFT JOIN avions inv ON inv.proprietaire_id = p.id
  WHERE p.identifiant IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_classement_pilotes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_classement_pilotes() TO service_role, authenticated;
