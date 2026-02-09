-- Bucket Storage pour les images des cartes d'identité
-- Exécuter dans l'éditeur SQL Supabase

-- Créer le bucket pour les cartes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cartes-identite',
  'cartes-identite',
  true,
  5242880, -- 5MB max
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Politique: tout le monde peut voir les images
CREATE POLICY "cartes_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cartes-identite');

-- Politique: admins et IFSA peuvent uploader
CREATE POLICY "cartes_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cartes-identite'
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (role = 'admin' OR role = 'ifsa' OR ifsa = true)
    )
  );

-- Politique: admins et IFSA peuvent mettre à jour
CREATE POLICY "cartes_storage_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cartes-identite'
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (role = 'admin' OR role = 'ifsa' OR ifsa = true)
    )
  );

-- Politique: admins peuvent supprimer
CREATE POLICY "cartes_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'cartes-identite'
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );
