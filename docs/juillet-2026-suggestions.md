# Suggestions structurelles — Juillet 2026

> Document généré après analyse du codebase. Ne pas refactoriser en une seule passe : chaque point représente un chantier distinct avec ses propres risques de régression.

---

## 1. Composants à extraire pour réduire la duplication

### 1.1 `StatusBadge` — composant partagé

**Problème :** la logique de rendu d'un badge de statut (couleur, icône, libellé) est dupliquée dans au moins 4 fichiers :
- `src/app/(app)/logbook/page.tsx` (statut vol : validé / en attente / refusé)
- `src/app/(app)/instruction/InstructionClient.tsx` (statut examen : assigné / accepté / en cours / terminé)
- `src/app/(atc)/atc/page.tsx` (statut position en service)
- `src/app/(app)/messagerie/MessagerieClient.tsx` (badge type de message)

**Suggestion :** créer `src/components/StatusBadge.tsx` :
```tsx
// Exemple d'interface
interface StatusBadgeProps {
  status: string;
  map: Record<string, { label: string; className: string; icon?: LucideIcon }>;
  fallback?: string;
}
```

### 1.2 `useLiveKitCall` — hook partagé

**Problème :** `src/components/AtcTelephone.tsx` et `src/app/(siavi)/SiaviTelephone.tsx` partagent ~400 lignes de logique LiveKit quasi-identique (joinLiveKitCall, cleanupLiveKit, gestion des events Room, attachement des tracks audio, timeout 30s).

**Suggestion :** extraire `src/hooks/useLiveKitCall.ts` avec l'API :
```ts
function useLiveKitCall(opts: {
  getTokenUrl: string;
  participantName: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onParticipantJoined?: () => void;
  onError?: (msg: string) => void;
}): {
  join: (callId: string) => Promise<boolean>;
  cleanup: () => Promise<void>;
  connectionStatus: string;
  audioLevel: number;
}
```
Économie estimée : ~300 lignes de code dupliqué.

### 1.3 `TrainingSessionList` — composant partagé

**Problème :** dans `InstructionClient.tsx`, les sections "Training vol" et "Training ATC" ont une structure HTML/logique identique (liste d'items avec bouton Annuler ou Session terminée). Ce pattern est répété deux fois.

**Suggestion :** extraire `src/components/TrainingSessionList.tsx` avec props `sessions`, `onCancel`, `onFinish`, `variant: 'assigned' | 'mine'`.

---

## 2. Logique métier à déplacer vers des hooks ou lib/

### 2.1 `nombreEnLettres` dans `ChequeVisuel.tsx`

**Problème :** la fonction `nombreEnLettres` (conversion numérique → texte en français) est définie inline dans `src/components/ChequeVisuel.tsx`. C'est une fonction utilitaire pure sans dépendance React.

**Suggestion :** déplacer vers `src/lib/felitz/utils.ts` (fichier à créer) ou `src/lib/utils.ts`.

### 2.2 `enrichTransactionsWithVban` dans `felitz-bank/page.tsx`

**Problème :** la fonction `enrichTransactionsWithVban` dans `src/app/(app)/felitz-bank/page.tsx` est une logique métier de résolution VBAN qui appartient à la couche lib, pas à un composant page.

**Suggestion :** déplacer vers `src/lib/felitz/transactions.ts` (fichier à créer). Elle pourrait être réutilisée dans d'autres pages affichant des transactions.

### 2.3 Configuration de navigation dans `NavBar.tsx`

**Problème :** le tableau `piloteSections` (~50 lignes de données) est défini directement dans le composant `NavBar.tsx`, mélangeant données et rendu.

**Suggestion :** extraire vers `src/lib/nav-config.ts` pour permettre l'import et la réutilisation (tests, Storybook, etc.) sans dépendance React.

### 2.4 Logique de calcul de progression dans `InstructionClient.tsx`

**Problème :** les calculs `progressionByEleve`, `myCompletedSet`, `myProgressPercent` et la gestion des overrides optimistes sont des calculs métier complexes qui alourdissent le composant.

**Suggestion :** extraire un hook `useProgressionInstruction(eleves, elevesProgression, myProgression, programs)` dans `src/hooks/useProgressionInstruction.ts`.

---

## 3. Pages trop longues à découper

### 3.1 `InstructionClient.tsx` — ~2 050 lignes ⚠️

C'est le fichier le plus critique. Il mélange :
- Gestion d'état (30+ useState/useMemo/useCallback)
- Logique réseau (15+ fonctions async)
- 3 onglets de rendu distincts (Mon Espace / Formation / Examens & Titres)
- 1 dialog modal de fin d'examen

**Plan de découpage suggéré :**
```
src/app/(app)/instruction/
  ├── InstructionClient.tsx        (orchestrateur, ~200 lignes)
  ├── hooks/
  │   ├── useInstructionState.ts   (tous les useState)
  │   └── useInstructionActions.ts (toutes les fonctions async réseau)
  └── components/
      ├── MonEspaceTab.tsx         (onglet Mon Espace)
      ├── FormationTab.tsx         (onglet Formation + liste élèves)
      ├── ExamensTab.tsx           (onglet Examens & Titres)
      └── ExamFinishDialog.tsx     (dialog modale de fin de session)
```

### 3.2 `MessagerieClient.tsx` — ~720 lignes

Le composant gère 6 onglets très différents (inbox, recrutement, chèques, sanctions, envoyés, composer).

**Plan de découpage suggéré :**
```
src/app/(app)/messagerie/
  ├── MessagerieClient.tsx         (orchestrateur + layout 2 colonnes)
  ├── MessageRow.tsx               (ligne de message dans la liste)
  ├── MessageDetail.tsx            (panneau de détail droit)
  ├── ComposeForm.tsx              (formulaire de composition)
  └── tabs/
      ├── ChequesList.tsx          (onglet Chèques avec encaisser tout)
      ├── InvitationsList.tsx      (onglet Recrutement)
      └── SanctionsList.tsx        (onglet Sanctions)
```

### 3.3 `AtcTelephone.tsx` — ~1 000 lignes

La logique LiveKit occupe ~400 lignes. Après extraction du hook `useLiveKitCall` (voir §1.2), le fichier passerait à ~600 lignes, soit une réduction de 40%.

---

## 4. Patterns d'optimisation React manquants

### 4.1 `renderMessageRow` et `renderDetail` dans `MessagerieClient.tsx`

**Problème :** ces deux fonctions sont redéfinies à chaque rendu du composant parent. Avec une liste potentiellement longue de messages, cela peut provoquer des re-renders inutiles.

**Suggestion :**
```tsx
// Extraire en composants memo avec props stables
const MessageRow = memo(function MessageRow({ msg, isSelected, onSelect, ... }: Props) { ... });
const MessageDetail = memo(function MessageDetail({ message, onReply, ... }: Props) { ... });
```

### 4.2 N+1 queries dans `src/app/(atc)/atc/page.tsx`

**Problème :** la section "Enrichir les plans avec données pilote/compagnie/avion" fait plusieurs appels DB **séquentiels par plan** via `Promise.all(plans.map(async plan => { ...await admin.from... }))`. Avec 20 plans actifs, cela génère potentiellement 80+ requêtes Supabase.

**Suggestion :** regrouper les IDs et faire des requêtes `.in(ids)` en batch, puis reconstituer la map par ID. Exemple :
```ts
// Au lieu de N requêtes séquentielles :
const allTypeAvionIds = plans.map(p => p.type_avion_id).filter(Boolean);
const { data: allTypesAvion } = await admin.from('types_avion').select('id, nom, code_oaci').in('id', allTypeAvionIds);
const typeAvionById = Object.fromEntries(allTypesAvion.map(t => [t.id, t]));
```
Impact : réduction de 80+ → 4-5 requêtes pour 20 plans.

### 4.3 `useMemo` manquant sur `byAeroport` dans `atc/page.tsx`

**Problème :** le `reduce` de `byAeroport` est recalculé côté serveur (OK ici, mais à vérifier si des composants clients similaires existent avec le même pattern sans memoization).

### 4.4 `useCallback` manquant sur les handlers de formulaire dans `InstructionClient.tsx`

**Problème :** des fonctions comme `createEleve`, `requestPilotTraining`, etc. sont redéfinies à chaque rendu du composant (~15 fonctions async). Même si le composant lui-même ne se re-rend pas souvent, cela transmet des références instables aux enfants.

**Suggestion :** wrapper avec `useCallback` les handlers passés à des composants enfants (boutons Submit, selects contrôlés).

---

## 5. Divers

### 5.1 Fichiers `public/` — état actuel

Tous les fichiers dans `public/` sont référencés dans le code :
- `mixou-bg.png`, `ptfs-logo.jpg`, `ptfs-map.png` → fallbacks logo page de connexion
- `maps/ptfs-enroute-chart-official.svg` → cartographie
- `downloads/RadarCapture.exe` + `downloads/README.txt` → page de téléchargement radar
- `README.txt` (racine public/) → documentation développeur, non servi mais non référencé dans le code

### 5.2 Migrations SQL

Les fichiers dans `supabase/migrations/` semblent cohérents ; aucun doublon évident détecté lors de l'analyse. Les nouveaux fichiers `supabase/add_atc_salaire_minute.sql` et `supabase/update_juillet_2026.sql` sont des scripts hors-migration à intégrer manuellement (non tracés par le système de migration automatique — à déplacer dans `supabase/migrations/` avec un numéro de version si ce n'est pas encore fait).

### 5.3 Skeleton loading manquants

Les pages pilotes (logbook, instruction, felitz-bank) utilisent `src/app/(app)/loading.tsx` global mais n'ont pas de squelettes inline pour les sections qui se chargent après hydratation (états de chargement de listes via `useTransition`). Envisager des composants `<Skeleton>` dans les sections où `loading = true`.

---

*Priorité suggérée pour les prochaines itérations :*
1. **`useLiveKitCall`** — gain immédiat, duplication critique, risque faible
2. **N+1 ATC page** — impact performance, risque moyen
3. **Découpage `InstructionClient`** — maintenabilité, risque élevé (tester minutieusement)
4. **`StatusBadge` partagé** — qualité visuelle cohérente, risque faible
