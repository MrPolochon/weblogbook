-- Fix : autoriser l'upload dans le dossier avions/ du bucket cartes-identite
-- pour les PDG et co-PDG de compagnies (l'API utilise le service_role mais
-- la politique storage s'applique quand même dans certaines versions de Supabase).

-- On récupère les politiques existantes et on les met à jour.

DROP POLICY IF EXISTS "cartes_storage_insert" ON storage.objects;

CREATE POLICY "cartes_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cartes-identite'
    AND (
      -- Admins et IFSA peuvent tout uploader
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND (role = 'admin' OR role = 'ifsa' OR ifsa = true)
      )
      OR
      -- Les utilisateurs peuvent uploader dans leur propre dossier (user_id/)
      (storage.foldername(name))[1] = auth.uid()::text
      OR
      -- Les PDG/co-PDG peuvent uploader dans avions/ (images de flotte pour l'ODW)
      (
        (storage.foldername(name))[1] = 'avions'
        AND (
          EXISTS (
            SELECT 1 FROM public.compagnies
            WHERE pdg_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.compagnie_employes
            WHERE pilote_id = auth.uid() AND role = 'co_pdg'
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "cartes_storage_update" ON storage.objects;

CREATE POLICY "cartes_storage_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cartes-identite'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND (role = 'admin' OR role = 'ifsa' OR ifsa = true)
      )
      OR
      (storage.foldername(name))[1] = auth.uid()::text
      OR
      (
        (storage.foldername(name))[1] = 'avions'
        AND (
          EXISTS (SELECT 1 FROM public.compagnies WHERE pdg_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.compagnie_employes WHERE pilote_id = auth.uid() AND role = 'co_pdg')
        )
      )
    )
  );

DROP POLICY IF EXISTS "cartes_storage_delete" ON storage.objects;

CREATE POLICY "cartes_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'cartes-identite'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role = 'admin'
      )
      OR
      (storage.foldername(name))[1] = auth.uid()::text
      OR
      (
        (storage.foldername(name))[1] = 'avions'
        AND (
          EXISTS (SELECT 1 FROM public.compagnies WHERE pdg_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.compagnie_employes WHERE pilote_id = auth.uid() AND role = 'co_pdg')
        )
      )
    )
  );
