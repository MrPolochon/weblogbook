# Checkup SID/STAR — Rapport complet

**Date :** 11 mars 2025

---

## 1. Synchronicité seed-all-complet.sql ↔ star-all.sql

### ❌ Incohérences détectées (corrigées)

| Fichier | Problème | Statut |
|---------|----------|--------|
| star-all.sql | **SISTA 2.DINER** : route incorrecte (`diner dct antny` au lieu de `diner dct romns dct antny`) | Corrigé |
| star-all.sql | **SISTA 2.CAMEL** : variante manquante | Corrigé |

---

## 2. Format des variantes STAR

### Format appliqué
- **STAR.ENTRY** : point d'entrée (ex. `NORTHERN 1.RENDR`, `WELSH 1.KEN`)
- **STAR.ENTRY VIA TRANSITION** : entrée + transition piste (ex. `NORTHERN 1.RENDR VIA BUCFA`)
- **STAR.VIA TRANSITION** : quand une seule entrée (ex. `JAMSI 1.VIA LAZER` pour IPAP)

### Cohérence
- IRFD, ITKO, IBTH, IPPH, ILAR, IMLR, IGRV, IPAP, ISAU, IIAB : format cohérent ✓

---

## 3. Nomenclature DINER vs DINNER

| Contexte | Utilisation | Note |
|----------|--------------|------|
| LOGAN 4 (IRFD SID) | **DINNER** | Waypoint spécifique à cette procédure |
| Autres SID/STAR | **DINER** | Point d'entrée standard |

→ Cohérent, pas de correction nécessaire.

---

## 4. Waypoints référencés

### Dans aeroports-ptfs.ts
- ATPEV, BUCFA, DINER, HAWFA, LAZER, AQWRT, etc. ✓

### Potentiellement manquants (utilisés dans les routes)
- **BRDGE** (KUNAV 2 IRFD) — BRIDGE
- **ALISO** (KUNAV 2 IRFD)
- **SWEET** (KUNAV 2 IRFD)
- **HUT** (JAMSI 1 IPAP) — HUNTER VOR
- **KIN** (JAMSI 1 IPAP) — KINDLE VOR
- **ROMNS**, **ANTNY**, **NKITA**, **SURGE**, **KENED**

→ Les routes utilisent des identifiants VOR/FIX standards. À ajouter dans `aeroports-ptfs.ts` si validation stricte requise.

---

## 5. Routes terminant par l'aéroport

Toutes les routes STAR se terminent correctement par :
- le code OACI (ex. `... dct IRFD`)
- ou `RADAR VECTORS DCT` + code OACI (ex. `... RADAR VECTORS DCT IMLR`)

---

## 6. Récapitulatif par aéroport

| Aéroport | SID | STAR | Statut |
|----------|-----|------|--------|
| IRFD | 6 procédures + variantes | 11 procédures + variantes | ✓ |
| ITKO | 4 procédures + variantes | 4 procédures + variantes | ✓ |
| IBTH | 5 procédures + variantes | 5 procédures + variantes | ✓ |
| IPPH | 4 procédures + variantes | 4 procédures + variantes | ✓ |
| ILAR | 4 procédures + variantes | 3 procédures + variantes | ✓ |
| IGRV | 6 procédures | 2 procédures | ✓ |
| IMLR | 5 procédures + variantes | 3 procédures + variantes | ✓ |
| IPAP | 3 procédures + variantes | 2 procédures + variantes | ✓ |
| ISAU | 6 procédures | 3 procédures | ✓ |
| IIAB | 2 procédures | 1 procédure + 4 variantes | ✓ |

---

## 7. Variantes STAR récentes (vérifiées)

- **LARNACA 1 (IIAB)** : .GRASS, .RENTS, .MCL ✓
- **NORTHERN 1 (IMLR)** : .RENDR VIA BUCFA/KUNAV, .DINER VIA BUCFA/KUNAV ✓
- **KUNAV 2 (IRFD)** : .RENDR/.DINER VIA BRDGE/HAWFA ✓
- **SISTA 2 (IPPH)** : .DINER (avec ROMNS), .ROMNS, .SILVA, .CAMEL ✓
- **JAMSI 1 (IPAP)** : base (VIA GRASS), .VIA LAZER ✓

---

## 8. Recommandations

1. **Exécuter** `seed-all-complet.sql` dans Supabase pour appliquer toutes les procédures.
2. **Vérifier** les waypoints BRDGE, ALISO, SWEET, HUT, KIN dans les cartes PTFS si besoin de validation.
3. **Conserver** `star-all.sql` synchronisé avec `seed-all-complet.sql` (section STAR).
