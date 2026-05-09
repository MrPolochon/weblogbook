-- =============================================================================
-- Réattribution « équitable » des demandes d’examen (round-robin) + messages
-- =============================================================================
-- Pools : vol = titulaires licence **FE** ; examens ATC/AFIS = titulaires **ATC FE**
--   (même principe que l’appli, sans mélange admin automatique).
--
-- Méthode : triter les demandes par `created_at` ; chaque type (vol / ATC) a son
-- compteur k ; nouvel examinateur = pool[1 + (k % taille du pool)] (répartition
-- identique en charge si tous les profils reçoivent le même poids d’examens).
--
-- Pour chaque ligne où l’instructeur change, insère 2 ou 3 messages (candidat,
-- nouvel examinateur, ancien si connu) via le premier compte **admin** comme
-- expéditeur. Si vous préférez l’algorithme charge + hachage (comme
-- l’API TypeScript), utilisez : POST /api/admin/reassign-open-exam-requests
--
-- Prérequis : exécuter dans l’éditeur SQL Supabase (rôle avec droit bypass RLS
-- / propriétaire). Testez d’abord en lecture (section APERÇU) si vous adaptez.
-- =============================================================================

DO $$
DECLARE
  pool_fe uuid[] := coalesce((
    SELECT array_agg(l.user_id ORDER BY l.user_id)
    FROM public.licences_qualifications l
    WHERE l.type = 'FE'
  ), ARRAY[]::uuid[]);
  pool_atc uuid[] := coalesce((
    SELECT array_agg(l.user_id ORDER BY l.user_id)
    FROM public.licences_qualifications l
    WHERE l.type = 'ATC FE'
  ), ARRAY[]::uuid[]);
  n_fe int;
  n_atc int;
  k_fe int := 0;
  k_atc int := 0;
  expediteur_id uuid;
  r record;
  new_ins uuid;
  old_ins uuid;
  ident_req text;
  ident_new text;
  v_old_name text;
  msg text;
  is_atc boolean;
  updated int := 0;
  atc_licence constant text[] := ARRAY[
    'CAL-ATC', 'PCAL-ATC', 'CAL-AFIS', 'PCAL-AFIS', 'LPAFIS', 'LATC'
  ];
BEGIN
  n_fe := coalesce(array_length(pool_fe, 1), 0);
  n_atc := coalesce(array_length(pool_atc, 1), 0);
  RAISE NOTICE 'Pool FE: %, pool ATC FE: %', n_fe, n_atc;

  IF n_fe = 0 AND n_atc = 0 THEN
    RAISE EXCEPTION 'Aucun examinateur : ajoutez des licences FE et/ou ATC FE.';
  END IF;

  SELECT p.id
  INTO expediteur_id
  FROM public.profiles p
  WHERE p.role = 'admin'
  ORDER BY p.id
  LIMIT 1;

  IF expediteur_id IS NULL THEN
    RAISE EXCEPTION 'Aucun compte admin trouvé (obligatoire pour expediteur_id des messages).';
  END IF;

  FOR r IN
    SELECT
      er.id,
      er.requester_id,
      er.instructeur_id,
      er.licence_code,
      er.created_at
    FROM public.instruction_exam_requests er
    WHERE er.statut IN ('assigne', 'accepte', 'en_cours')
    ORDER BY er.created_at ASC, er.id ASC
  LOOP
    is_atc := r.licence_code = ANY (atc_licence);
    IF is_atc THEN
      IF n_atc = 0 THEN
        RAISE NOTICE 'Skip % (ATC) : pas de pool ATC FE', r.id;
        CONTINUE;
      END IF;
      new_ins := pool_atc[1 + (k_atc % n_atc)];
      k_atc := k_atc + 1;
    ELSE
      IF n_fe = 0 THEN
        RAISE NOTICE 'Skip % (vol) : pas de pool FE', r.id;
        CONTINUE;
      END IF;
      new_ins := pool_fe[1 + (k_fe % n_fe)];
      k_fe := k_fe + 1;
    END IF;

    old_ins := r.instructeur_id;
    IF new_ins IS NOT DISTINCT FROM old_ins THEN
      CONTINUE;
    END IF;

    UPDATE public.instruction_exam_requests e
    SET
      instructeur_id = new_ins,
      updated_at = now()
    WHERE e.id = r.id;

    SELECT p.identifiant INTO ident_req FROM public.profiles p WHERE p.id = r.requester_id;
    SELECT p.identifiant INTO ident_new FROM public.profiles p WHERE p.id = new_ins;
    IF old_ins IS NOT NULL THEN
      SELECT p.identifiant INTO v_old_name FROM public.profiles p WHERE p.id = old_ins;
    ELSE
      v_old_name := NULL;
    END IF;

    ident_req := coalesce(ident_req, '?');
    ident_new := coalesce(ident_new, '?');

    -- Candidat
    IF r.instructeur_id IS NULL THEN
      msg := format(
        E'Votre demande d''examen pour la licence %s a été assignée (harmonisation).\n\n' ||
        E'Nouvel examinateur : %s\n\n' ||
        E'Conservez ce message pour référence. Pour toute question, contactez l''équipe ou votre instructeur référent.',
        r.licence_code,
        ident_new
      );
    ELSE
      msg := format(
        E'Votre demande d''examen pour la licence %s a été réattribuée (harmonisation des assignations).\n\n' ||
        'Ancien examinateur assigné : %s\n' ||
        'Nouvel examinateur assigné : %s\n\n' ||
        E'Conservez ce message pour référence. Pour toute question, contactez l''équipe ou votre instructeur référent.',
        r.licence_code,
        coalesce(v_old_name, '—'),
        ident_new
      );
    END IF;

    INSERT INTO public.messages (expediteur_id, destinataire_id, titre, contenu, type_message)
    VALUES (
      expediteur_id,
      r.requester_id,
      'Examen ' || r.licence_code || ' — Examinateur modifié',
      msg,
      'normal'
    );

    -- Nouvel examinateur
    msg := format(
      E'Une demande d''examen vous a été assignée :\n\n' ||
      E'Candidat : %s\n' ||
      'Licence visée : %s\n' ||
      '%s' ||
      E'\n\nRetrouvez la demande dans la page Instruction (demandes d''examen reçues).',
      ident_req,
      r.licence_code,
      CASE
        WHEN r.instructeur_id IS NOT NULL THEN
          format(E'Cette assignation remplace l''examinateur précédent (%s).', coalesce(v_old_name, '—'))
        ELSE
          ''
      END
    );
    INSERT INTO public.messages (expediteur_id, destinataire_id, titre, contenu, type_message)
    VALUES (
      expediteur_id,
      new_ins,
      'Examen ' || r.licence_code || ' — Nouvelle assignation',
      msg,
      'normal'
    );

    -- Ancien examinateur
    IF r.instructeur_id IS NOT NULL AND r.instructeur_id IS DISTINCT FROM new_ins THEN
      msg := format(
        E'La demande d''examen de %s (%s) ne vous est plus assignée. Nouvel examinateur : %s.\n\n' ||
        'Motif : réattribution administrative (harmonisation).',
        ident_req,
        r.licence_code,
        ident_new
      );
      INSERT INTO public.messages (expediteur_id, destinataire_id, titre, contenu, type_message)
      VALUES (
        expediteur_id,
        old_ins,
        'Examen ' || r.licence_code || ' — Assignation retirée',
        msg,
        'normal'
      );
    END IF;

    updated := updated + 1;
  END LOOP;

  RAISE NOTICE 'Demandes mises à jour (changement d''instructeur) : %', updated;
END
$$;
