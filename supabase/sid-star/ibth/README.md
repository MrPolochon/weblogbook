# SID IBTH (Saint Barthelemy)

Procédures SID pour l'aéroport de Saint Barthelemy (IBTH).

**Noms** = identifiants des cartes (10-3, 10-3A, etc.) pour correspondre au BRIA et au panel de dépôt de plan de vol :
- BARTHELEMY 1 (omnidirectionnel)
- MOUNTAIN 1
- OCEAN 1
- RESURGE 1
- VONARX 1

**Ordre d'exécution :**
1. `supabase/add_sid_star.sql` (création de la table)
2. Option A : `ibth.sql` ou `ibth/all.sql` (tout IBTH)
3. Option B : chaque SID : `sbh1.sql`, `montn1.sql`, `ocean1.sql`, `res1.sql`, `vox1.sql`
