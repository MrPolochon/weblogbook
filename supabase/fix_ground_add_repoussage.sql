-- Migration : ajout des types de service repoussage et marshalling,
-- colonne direction et colonne pilote_confirme sur ground_service_requests

-- 1. Mise à jour de la contrainte CHECK sur service_type
ALTER TABLE ground_service_requests
  DROP CONSTRAINT IF EXISTS ground_service_requests_service_type_check;

ALTER TABLE ground_service_requests
  ADD CONSTRAINT ground_service_requests_service_type_check
  CHECK (service_type IN ('bagages', 'catering', 'fuel', 'boarding', 'repoussage', 'marshalling'));

-- 2. Colonne direction (pour repoussage : 'gauche' ou 'droite')
ALTER TABLE ground_service_requests
  ADD COLUMN IF NOT EXISTS direction TEXT
  CHECK (direction IN ('gauche', 'droite'));

-- 3. Colonne pilote_confirme (pilote confirme que le service est terminé)
ALTER TABLE ground_service_requests
  ADD COLUMN IF NOT EXISTS pilote_confirme BOOLEAN DEFAULT FALSE;
