-- Targeted entry-level adjustment based on balances observed on 2026-10-06.
-- Personal median: 12,654 F$; company median: 1,691,687 F$.
-- No usable per-aircraft net revenue was stored: cargo and large airliners stay unchanged.
-- Run once. Expected old prices protect against overwriting later admin changes.
BEGIN;
DO $$
DECLARE changed integer;
BEGIN
  UPDATE public.types_avion t SET prix = v.new_price
  FROM (VALUES
    ('Piper Cub',150000,120000),
    ('Piper Cub Amphibie',180000,144000),
    ('Cessna 172',200000,160000),
    ('Piper PA-28',250000,200000),
    ('Cessna 172 Amphibie',270000,216000),
    ('Cessna 182',300000,240000),
    ('Cessna 182 Amphibie',400000,320000),
    ('Diamond DA50',350000,280000)
  ) AS v(nom,old_price,new_price)
  WHERE t.nom=v.nom AND t.prix=v.old_price;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed <> 8 THEN
    RAISE EXCEPTION 'Expected 8 unchanged catalog entries, found %. No prices changed.',changed;
  END IF;
END $$;
COMMIT;
