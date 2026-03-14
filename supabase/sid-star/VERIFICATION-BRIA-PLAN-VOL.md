# Vérification BRIA et Plan de vol

**Date :** 11 mars 2025

---

## 1. Flux BRIA (téléphone)

### Parcours IFR
1. Immatriculation → Régime (VFR/IFR) → Heure départ → Aéroports → Temps vol → Autonomie
2. Vol commercial/ferry/privé → Nb personnes (ou nature transport)
3. **SID** (demandée) → **STAR** (demandée) → Altitude → Indicatif
4. **Pas de question « route »** pour IFR ✓ (route = SID + STAR)

### Parcours VFR
1. Même début jusqu’à altitude/indicatif
2. **« Quelle est votre route ? »** (quoi_ciel) ✓

### Construction de `strip_route` (BRIA IFR)
- Appel API `/api/sid-star?aeroport=DEPART&type=SID` et `...&aeroport=ARRIVEE&type=STAR`
- Recherche par **nom exact** (insensible à la casse) : `s.nom.toUpperCase() === ctx.sid_depart.toUpperCase()`
- Si SID et STAR trouvées : `joinSidStarRoute(sidProc.route, starProc.route)`
- Si SID ou STAR manquante : `strip_route = 'RADAR VECTORS DCT'`

### Points d’attention BRIA
- **Saisie libre** : le pilote doit taper le nom exact (ex. `NORTHERN 1.RENDR VIA BUCFA`)
- Les placeholders (`DEPARTUR1A`, `ARRIVA2B`) sont génériques
- **Correction appliquée** : si SID/STAR non trouvées ou erreur API → `strip_route = 'RADAR VECTORS DCT'` (au lieu de concaténer les noms)

---

## 2. Formulaire manuel (DepotPlanVolForm)

### SID / STAR
- **Liste déroulante** depuis `/api/sid-star` filtrée par aéroport
- Option **« Autre (saisie libre) »** si la procédure n’est pas dans la liste
- En sélection : `selectedSidRoute = proc.route`, `selectedStarRoute = proc.route`

### Route IFR
- Remplie automatiquement par `joinSidStarRoute(selectedSidRoute, selectedStarRoute)`
- Modifiable pour ajouter la partie en route (ex. DCT PUNTO DCT MARUK)
- `strip_route` = `route_ifr` si rempli, sinon `joinSidStarRoute` des routes sélectionnées

### Envoi
- `strip_route` envoyé à l’API si IFR et (route_ifr ou SID/STAR sélectionnés)
- `route_ifr` stocké pour affichage détaillé

---

## 3. API plans-vol

### Champs IFR
- `sid_depart`, `star_arrivee` : obligatoires
- `strip_sid_atc` = sid_depart
- `strip_star` = star_arrivee
- `strip_route` : route complète pour le strip ATC
- `route_ifr` : optionnel, partie « en route » ou route complète

### Validation
- IFR : SID et STAR requises ✓

---

## 4. `joinSidStarRoute` (utils.ts)

```ts
// Supprime le waypoint dupliqué si fin SID = début STAR
// Ex: SID "... dct WELSH" + STAR "welsh dct ..." → "... dct WELSH dct ..." (sans doublon)
```

- Découpe par `dct` / `DCT`
- Compare le dernier waypoint SID au premier waypoint STAR (insensible à la casse)
- Si identiques : concaténation sans doublon ✓

---

## 5. Cohérence SID/STAR

| Source | Format des noms |
|--------|------------------|
| seed-all-complet.sql | `NORTHERN 1.RENDR VIA BUCFA`, `LARNACA 1.MCL`, etc. |
| API sid-star | Retourne `nom` tel quel |
| BRIA | Comparaison `toUpperCase()` |
| DepotPlanVolForm | Liste déroulante avec `s.nom` |

→ Les variantes `.ENTRY`, `.ENTRY VIA TRANSITION` sont bien prises en charge.

---

## 6. Recommandations

1. **BRIA** : En cas d’échec API, éviter d’utiliser les noms saisis comme routes. Mieux vaut `RADAR VECTORS DCT` que des noms concaténés.
2. **Placeholders BRIA** : Remplacer par des exemples réels (ex. `NORTHERN 1.RENDR VIA BUCFA`) pour guider le pilote.
3. **SID/STAR manquantes** : Vérifier que `seed-all-complet.sql` a bien été exécuté dans Supabase pour que les variantes soient disponibles.
