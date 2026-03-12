# SID / STAR

Procédures SID et STAR par aéroport.

## Structure

```
sid-star/
├── irfd.sql           # GRAND FICHIER IRFD — toutes les SID Rockford
├── itko.sql           # GRAND FICHIER ITKO — toutes les SID Haneda Tokyo
├── ibth.sql           # GRAND FICHIER IBTH — toutes les SID Saint Barthelemy
├── ipph.sql           # GRAND FICHIER IPPH — toutes les SID Perth
├── ilar.sql           # GRAND FICHIER ILAR — toutes les SID Larnaca
├── seed-all.sql       # Tout en un (IRFD + ITKO + IBTH + IPPH + ILAR + futurs aéroports)
├── irfd/              # Rockford (IRFD)
│   ├── all.sql        # Toutes les SID IRFD
│   ├── logan4.sql
│   ├── kened2.sql
│   ├── darrk3.sql
│   ├── oshnn1.sql
│   ├── trn1.sql
│   ├── wnndy3.sql
│   ├── rfd6.sql
│   └── ...
├── itko/              # Haneda Tokyo (ITKO)
│   ├── all.sql
│   ├── tokyo1.sql     # Omnidirectionnel
│   ├── astro1.sql
│   ├── honda1.sql
│   ├── letse1.sql
│   └── onder1.sql
├── ibth/              # Saint Barthelemy (IBTH)
│   ├── all.sql
│   ├── sbh1.sql       # Omnidirectionnel
│   ├── montn1.sql
│   ├── ocean1.sql
│   ├── res1.sql
│   └── vox1.sql
├── ipph/              # Perth (IPPH)
│   ├── all.sql
│   ├── perth2.sql     # Omnidirectionnel
│   ├── camel2.sql
│   ├── diner2.sql
│   └── narxx1.sql
├── ilar/              # Larnaca (ILAR)
│   ├── all.sql
│   ├── larnaca1.sql   # Omnidirectionnel
│   ├── grass1.sql
│   ├── odoku1.sql
│   └── rents1.sql
└── [aeroport]/        # Autres aéroports (KORD, KLAX, etc.)
    └── all.sql       # Toutes les SID de l'aéroport
```

## Exécution

1. Créer la table : `supabase/add_sid_star.sql`
2. Option A — Tout charger : `supabase/sid-star/seed-all.sql`
3. Option B — Par aéroport : `sid-star/irfd/all.sql`, `sid-star/itko/all.sql`, `sid-star/ibth/all.sql`, `sid-star/ipph/all.sql`, `sid-star/ilar/all.sql`, etc.

**Migration (SID déjà en base avec anciens noms) :**
1. `sid-star/migration-noms-sid.sql` (supprime IRFD, ITKO, IBTH)
2. Puis `seed-all.sql`
