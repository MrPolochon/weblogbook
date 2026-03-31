-- Bucket Storage pour les documents admin (PDF, images, etc.)
-- Exécuter dans l'éditeur SQL Supabase si le bucket n'existe pas encore.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  20971520, -- 20 MiB (aligné avec DOCUMENTS_MAX_BYTES côté API)
  NULL -- tout type MIME (l’API accepte aussi application/octet-stream)
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit;
