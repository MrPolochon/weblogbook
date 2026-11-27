-- Complete les positions manquantes des brouillons PTFS existants.
-- Les reperes des porte-avions sont approximatifs sur le fond de carte.
-- Les positions deja ajustees par les utilisateurs sont conservees.
-- IGRV est retire des brouillons car le terrain a ete detruit.
BEGIN;

UPDATE public.cartography_editor_drafts
SET payload = jsonb_set(
  payload,
  '{positions}',
  (
    '{"IDCS":{"x":48.6,"y":7},"IBRD":{"x":53.5,"y":11.8},"IGFD":{"x":51.5,"y":35.5},"IQEL":{"x":48,"y":60.5}}'::jsonb
    || CASE
      WHEN jsonb_typeof(payload->'positions') = 'object'
        THEN payload->'positions'
      ELSE '{}'::jsonb
    END
  ) - 'IGRV',
  true
),
updated_at = now()
WHERE jsonb_typeof(payload) = 'object'
  AND (
    jsonb_typeof(payload->'positions') IS DISTINCT FROM 'object'
    OR NOT (payload->'positions' ?& ARRAY['IDCS', 'IBRD', 'IGFD', 'IQEL'])
    OR payload->'positions' ? 'IGRV'
  );

COMMIT;
