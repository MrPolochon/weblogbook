# SID ITKO (Haneda Tokyo)

Procédures SID pour l'aéroport de Tokyo Haneda (ITKO).

**TOKYO 1** = départ omnidirectionnel (RADAR VECTORS DCT).

**Ordre d'exécution :**
1. `supabase/add_sid_star.sql` (création de la table)
2. Option A : `itko.sql` ou `itko/all.sql` (tout ITKO)
3. Option B : chaque SID : `tokyo1.sql`, `astro1.sql`, `honda1.sql`, `letse1.sql`, `onder1.sql`
