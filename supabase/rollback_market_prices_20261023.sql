-- Retour aux prix précédents uniquement si les tarifs n’ont pas été modifiés depuis.
BEGIN;
DO $$ DECLARE expected integer; changed integer; BEGIN
SELECT count(*) INTO expected FROM market_price_adjustments_audit WHERE batch_id='civil-20261023';
IF expected<>57 THEN RAISE EXCEPTION 'Historique absent ou incomplet'; END IF;
UPDATE types_avion t SET prix=a.ancien_prix FROM market_price_adjustments_audit a WHERE a.batch_id='civil-20261023' AND t.id=a.type_avion_id AND t.prix=a.nouveau_prix;
GET DIAGNOSTICS changed=ROW_COUNT; IF changed<>expected THEN RAISE EXCEPTION 'Un tarif a changé depuis : retour arrière annulé'; END IF;
DELETE FROM market_price_adjustments_audit WHERE batch_id='civil-20261023';
END $$;
COMMIT;
