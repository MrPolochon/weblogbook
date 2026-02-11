# 🚀 OPTIMISATIONS PERFORMANCE - WEBLOGBOOK

## 📊 PROBLÈMES IDENTIFIÉS

### 🔴 PROBLÈME #1 : AutoRefresh trop fréquent
**Impact** : CRITIQUE - Des milliers de requêtes inutiles

**Actuellement** :
- ATC/SIAVI : **8 secondes** → 450 refresh/heure
- Pilote : **12 secondes** → 300 refresh/heure

**Impact** :
- Charge serveur énorme
- Consommation data excessive
- Latence ressentie

**Solution** :
```typescript
// ATC/SIAVI : 8s → 15s (passe de 450 à 240 refresh/h = -47%)
<AutoRefresh intervalSeconds={15} />

// Pilote : 12s → 20s (passe de 300 à 180 refresh/h = -40%)
<AutoRefresh intervalSeconds={20} />
```

---

### 🔴 PROBLÈME #2 : Requêtes N+1 (ATC page)
**Impact** : CRITIQUE - Latence multipliée par 10-20x

**Code actuel** (ligne 106-122 de `atc/page.tsx`) :
```typescript
// Pour CHAQUE session ATC → 1 requête SQL séparée
const sessionsEnService = await Promise.all((sessionsEnServiceRaw || []).map(async (sess) => {
  const { data } = await admin.from('profiles').select('identifiant').eq('id', sess.user_id).single();
  return { ...sess, profiles: data };
}));

// Si 10 ATC en ligne → 10 requêtes supplémentaires !
// Si 20 ATC en ligne → 20 requêtes supplémentaires !
```

**Solution** : Utiliser un JOIN
```typescript
// 1 SEULE requête au lieu de N
const { data: sessionsEnService } = await admin
  .from('atc_sessions')
  .select('aeroport, position, user_id, profiles(identifiant)')
  .order('aeroport')
  .order('position');

// Pareil pour AFIS
const { data: afisEnService } = await admin
  .from('afis_sessions')
  .select('aeroport, est_afis, user_id, profiles(identifiant)')
  .order('aeroport');
```

**Gain** : 10-20x plus rapide ! (10-20 requêtes → 1 requête)

---

### 🔴 PROBLÈME #3 : Index manquants
**Impact** : MOYEN - Scans complets de tables

**Index critiques à ajouter** :

```sql
-- Plans de vol : recherches fréquentes par holder et statut
CREATE INDEX IF NOT EXISTS idx_plans_vol_holder 
  ON plans_vol(current_holder_user_id) 
  WHERE current_holder_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plans_vol_statut 
  ON plans_vol(statut);

CREATE INDEX IF NOT EXISTS idx_plans_vol_pilote_statut 
  ON plans_vol(pilote_id, statut);

-- Sessions ATC/SIAVI : recherches par user_id
CREATE INDEX IF NOT EXISTS idx_atc_sessions_user 
  ON atc_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_afis_sessions_user 
  ON afis_sessions(user_id);

-- Messages : recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_messages_destinataire_lu 
  ON messages(destinataire_id, lu);

CREATE INDEX IF NOT EXISTS idx_messages_type 
  ON messages(type_message);

-- Vols ferry : recherches par compagnie et statut
CREATE INDEX IF NOT EXISTS idx_vols_ferry_compagnie_statut 
  ON vols_ferry(compagnie_id, statut);

-- Compagnie avions : recherches par compagnie
CREATE INDEX IF NOT EXISTS idx_compagnie_avions_compagnie 
  ON compagnie_avions(compagnie_id);
```

---

## 📈 GAINS ATTENDUS

| Optimisation | Gain latence | Gain charge serveur |
|--------------|--------------|---------------------|
| AutoRefresh +60% | -30% | -40% |
| Fix N+1 queries | -70% sur page ATC | -90% requêtes |
| Index DB | -50% temps requêtes | -30% CPU DB |
| **TOTAL** | **-60% latence** | **-55% charge** |

---

## 🛠️ IMPLÉMENTATION

### Priorité 1 : AutoRefresh (5 min)
```typescript
// src/app/(atc)/layout.tsx
<AutoRefresh intervalSeconds={15} />  // était 8

// src/app/(siavi)/layout.tsx  
<AutoRefresh intervalSeconds={15} />  // était 8

// src/app/(app)/layout.tsx
<AutoRefresh intervalSeconds={20} />  // était 12
```

### Priorité 2 : Fix N+1 (10 min)
Remplacer les boucles `Promise.all` dans `atc/page.tsx` par des JOIN Supabase

### Priorité 3 : Index DB (2 min)
Exécuter le script SQL des index

---

## 🎯 AUTRES OPTIMISATIONS POSSIBLES

### Cache côté client
```typescript
// Utiliser React Query ou SWR pour cacher les données
// Réduire encore plus les appels API
```

### Lazy loading des composants
```typescript
// Next.js dynamic imports pour composants lourds
const FlightStripBoard = dynamic(() => import('@/components/FlightStripBoard'));
```

### Optimisation images
```typescript
// Next.js Image component avec lazy loading
import Image from 'next/image';
```

---

## 📊 MONITORING

Après optimisations, vérifier :
- ✅ Temps de chargement page ATC < 2s
- ✅ Nombre de requêtes DB < 10 par page
- ✅ Latence perçue acceptable
