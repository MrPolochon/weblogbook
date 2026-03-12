# SID / STAR

Procédures SID et STAR par aéroport.

## Structure

```
sid-star/
├── seed-all.sql       # Tout en un (IRFD + futurs aéroports)
├── irfd/              # Rockford (IRFD)
│   ├── all.sql        # Toutes les SID IRFD
│   ├── logan4.sql
│   ├── kened2.sql
│   ├── darrk3.sql
│   ├── oshnn1.sql
│   ├── rfd6.sql
│   └── ...
└── [aeroport]/        # Autres aéroports (KORD, KLAX, etc.)
    └── all.sql       # Toutes les SID de l'aéroport
```

## Exécution

1. Créer la table : `supabase/add_sid_star.sql`
2. Option A — Tout charger : `supabase/sid-star/seed-all.sql`
3. Option B — Par aéroport : `sid-star/irfd/all.sql`, etc.
