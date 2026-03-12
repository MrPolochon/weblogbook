# SID / STAR

Procédures SID et STAR par aéroport.

## Structure

```
sid-star/
├── irfd/          # Rockford (IRFD)
│   ├── logan4.sql
│   ├── kened2.sql
│   └── ...
└── [aeroport]/    # Autres aéroports (ex: kord/, kord/, etc.)
```

## Exécution

1. Créer la table : `supabase/add_sid_star.sql`
2. Charger les procédures : exécuter les `.sql` dans chaque dossier aéroport
