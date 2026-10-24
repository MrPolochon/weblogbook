-- Rebalance du 23 octobre 2026, fondé sur les données des 30 derniers jours.
-- Salaire pilote médian 2936 F$, chèque compagnie médian 20792 F$.
-- Référence cargo : 4 F$/kg, chargement 50 %, ponctualité 75 %, part nette 78 %, 100 vols.
-- Il s'agit d'un scénario de comparaison, pas d'une rentabilité garantie.
-- Tarifs civils uniquement. Prix nuls/hors vente et militaires préservés.
BEGIN;
CREATE TABLE IF NOT EXISTS public.market_price_adjustments_audit(
 batch_id text NOT NULL,type_avion_id uuid NOT NULL,nom text NOT NULL,
 ancien_prix integer NOT NULL,nouveau_prix integer NOT NULL,applied_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(batch_id,type_avion_id)
);
ALTER TABLE public.market_price_adjustments_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_price_adjustments_audit FROM anon,authenticated;
GRANT ALL ON public.market_price_adjustments_audit TO service_role;
DO $$
DECLARE n integer;
BEGIN
 IF EXISTS(SELECT 1 FROM market_price_adjustments_audit WHERE batch_id='civil-20261023') THEN
  IF (SELECT count(*) FROM market_price_adjustments_audit WHERE batch_id='civil-20261023') <> 57 THEN RAISE EXCEPTION 'Historique de rééquilibrage incomplet'; END IF;
  RETURN;
 END IF;
 PERFORM id FROM types_avion ORDER BY id FOR UPDATE;
 INSERT INTO market_price_adjustments_audit(batch_id,type_avion_id,nom,ancien_prix,nouveau_prix)
 SELECT 'civil-20261023',t.id,t.nom,t.prix,v.new_price
 FROM types_avion t JOIN (VALUES
('b03d157f-7ea1-44a6-8afe-3569feb3d4c5'::uuid,'Piper Cub Amphibie',144000,60000),
('b23e36ad-6d6c-4189-aa12-2306b459691c'::uuid,'Cessna 172',160000,75000),
('b28cc1e3-5056-4921-9791-587c6eea5dba'::uuid,'Piper PA-28',200000,90000),
('06900480-b526-460d-b5be-2f001677ddc9'::uuid,'Cessna 172 Amphibie',216000,100000),
('a5e03509-1b33-4be4-95ef-9a4fd4ffc541'::uuid,'Cessna 182',240000,120000),
('cc123f61-5e17-4cf8-ba75-484b1fa1302b'::uuid,'Diamond DA50',280000,150000),
('7030558b-bdbc-42ee-86e5-19317f7116a3'::uuid,'Cessna Caravan Cargo',300000,250000),
('d9295b5f-d0b8-492d-94e0-f44835deadac'::uuid,'Cessna 182 Amphibie',320000,160000),
('9d09ed86-264f-46d5-8112-dc644656a4c5'::uuid,'Cessna Caravan',450000,200000),
('53bcf5da-62d0-48fe-ba32-d9fe0a7d1899'::uuid,'Cessna Caravan Cargo Amphibie',500000,300000),
('8524cf17-6bcd-499e-9f18-74168578eb0e'::uuid,'Cessna Caravan Skydiving',500000,250000),
('4ccf0562-f91c-46f9-8d10-125472f936a0'::uuid,'Cessna Caravan Amphibie',500000,275000),
('f0f75662-f045-496a-92dc-06734d1dbba3'::uuid,'Cirrus Vision SF50',550000,350000),
('7db59a5a-0650-4054-a427-c9510f7bfc21'::uuid,'Extra 300s',550000,175000),
('e12efd17-297b-416b-acb9-5f73a8625dad'::uuid,'Cessna 402',650000,250000),
('a8d8794b-5da1-400a-9ee4-af28a49b97f5'::uuid,'DHC-6 Twin Otter',750000,350000),
('8d4ace45-8e45-4542-a910-2feb22ede306'::uuid,'King Air 260',850000,400000),
('2a198986-8b14-4287-8edb-f55f08552c50'::uuid,'Bombardier Q400',900000,600000),
('b4bfa4f3-b074-4728-8bbe-763eac59588f'::uuid,'DC-10F',900000,4500000),
('e066c63b-816c-46b4-9c37-efbeb30be47a'::uuid,'Bombardier Learjet',945000,650000),
('51270bdb-5155-4816-8e76-7a245b278eac'::uuid,'Bombardier CRJ700',950000,650000),
('f7594cec-2004-4732-93f3-76137bc29166'::uuid,'ATR 72F',1000000,500000),
('45600922-f58b-4630-b90c-91a2412a1a84'::uuid,'ATR-72',1000000,500000),
('86729e96-b76b-45c2-acef-70fb9e62b869'::uuid,'Boeing 707',1000000,1100000),
('bf97dd60-5edd-4d28-80be-bfe6509e674a'::uuid,'Airbus A220',1000000,1100000),
('a25ad1e7-152d-4c64-9496-ca52aef50117'::uuid,'DHC-6 Twin Otter Amphibie',1400000,475000),
('bf5226ae-5c85-497b-9198-6103035920bc'::uuid,'Embraer E190',1500000,800000),
('20df4ee0-21a4-4697-992e-748d3f2bc6db'::uuid,'Boeing 737',2100000,1450000),
('21504b8f-0cd2-47d9-bc08-857652f260b5'::uuid,'Boeing 727 Cargo',2400000,1650000),
('e46b3fd6-3930-4017-ad19-b0dc9a406297'::uuid,'Boeing 737 Cargo',2400000,1350000),
('815350a4-62b1-4e85-9eb2-cfde2222d383'::uuid,'Airbus A320',2500000,1500000),
('b142b677-5ace-4639-ad73-eab5ba1a5787'::uuid,'Boeing 727',2500000,1150000),
('7e8094dd-7a55-4ef0-9071-5932633cfe50'::uuid,'DC-10',2500000,2100000),
('75a6dab8-b136-440d-abbe-d3f27009902c'::uuid,'McDonnell Douglas MD-90',2700000,1350000),
('4ba0e87b-533a-42c2-830e-ec1b331d9926'::uuid,'Lockheed Tristar',2800000,2000000),
('e793d8cf-fdbc-4c31-8952-71f0ff882c89'::uuid,'Airbus A330 Cargo',2900000,4150000),
('c8be9996-15bd-4c5a-83fe-505ffbf4212d'::uuid,'McDonnell Douglas MD-11 Cargo',3000000,5325000),
('8d7ecccc-551d-421b-bc99-9bbf99ce2645'::uuid,'McDonnell Douglas MD-11',3000000,2500000),
('d4702274-e27f-4455-b7d5-bdbe191e9dbe'::uuid,'Airbus A330',3000000,2400000),
('b60f4cdc-dffc-46ee-a83c-ea7c09a050db'::uuid,'Boeing 757',3500000,1800000),
('9c61c742-adbb-49dd-b493-1af5ce82e997'::uuid,'Airbus A340',3900000,3100000),
('0b131822-afa0-4d41-b220-8703e3a2ad33'::uuid,'Sikorsky S-92',4000000,2400000),
('cc67d283-6608-4568-b163-4e4a587e5c83'::uuid,'Boeing 757 Cargo',4000000,2325000),
('6c92cb60-4bfe-4444-a946-9ac9f423a9a6'::uuid,'Airbus A350',4200000,3000000),
('ff9f331c-4557-499b-b976-3eae123a6cec'::uuid,'Boeing 787',4500000,2800000),
('6c8b8aec-2b10-4aa5-8d17-31acdcbff0c3'::uuid,'Boeing 767 Cargo',4500000,3075000),
('2111cb62-0e5a-4272-8c08-00a13441a02a'::uuid,'Boeing 767',4500000,2350000),
('ec0936c8-fa43-42fc-beee-c3b93df80540'::uuid,'Boeing 777 Cargo',5000000,5975000),
('201df69d-dce9-4930-889f-384db4ba71ff'::uuid,'Boeing 777',5000000,3600000),
('d01471ef-2391-4c68-80fc-e81cf5da91e2'::uuid,'Boeing 747',8000000,4500000),
('7a1e9b3d-4063-4743-a771-1722c6826ae0'::uuid,'Boeing 747 Cargo',8000000,7025000),
('6519933e-790e-4ddd-b561-a6e254b2f8c9'::uuid,'Airbus A380',8500000,5500000),
('a8926cdd-52f0-4524-8449-afcb3a98ef03'::uuid,'Airbus BelugaXL',9000000,3425000),
('248b65da-7228-4ae9-b8dc-2a9f54d11fbd'::uuid,'Antonov An-22',10000000,4675000),
('56c1ac58-dfac-4852-ba4d-b61245385317'::uuid,'Antonov AN-225',11000000,17550000),
('d23a1a74-aeb5-4e37-8bb1-9890fb7ff668'::uuid,'Boeing DreamLifter',12000000,7300000),
('ba1a0bd3-955e-49be-a5fe-9e75a5337c42'::uuid,'Concorde',55000000,8000000)
 ) v(id,nom,old_price,new_price) ON t.id=v.id AND t.nom=v.nom AND t.prix=v.old_price
 WHERE t.est_militaire=false AND t.prix>0;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>57 THEN RAISE EXCEPTION 'Catalogue modifié depuis l’analyse : % lignes sur 57. Aucune modification appliquée.',n; END IF;
 UPDATE types_avion t SET prix=a.nouveau_prix FROM market_price_adjustments_audit a
 WHERE a.batch_id='civil-20261023' AND a.type_avion_id=t.id;
END $$;
COMMIT;
