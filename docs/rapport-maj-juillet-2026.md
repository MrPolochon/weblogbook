# Rapport de mise à jour — Juillet 2026

> Généré automatiquement le 7 juillet 2026. Vérifications effectuées sur la branche courante.

---

## Statut général

| Vérification | Résultat |
|---|---|
| TypeScript (`npx tsc --noEmit`) | **OK — 0 erreur** |
| Fichiers SQL de migration | **7 fichiers présents** |
| Intégrité des fichiers clés | **10/10 vérifications passées** |

---

## Migrations SQL à exécuter (dans l'ordre)

> À exécuter **manuellement** dans l'éditeur SQL de Supabase, dans l'ordre indiqué.
> Ces fichiers sont hors du système de migration automatique (`supabase/migrations/`) et doivent être passés à la main.

| Ordre | Fichier | Description | Statut schéma |
|---|---|---|---|
| 1 | `supabase/add_co_pdg_role.sql` | Ajout colonne `role` dans `compagnie_employes` (co_pdg / employe) | Modifie schéma |
| 2 | `supabase/add_atc_salaire_minute.sql` | Documentation de la réforme ATC (commentaires uniquement — **aucune instruction SQL**) | Aucun changement |
| 3 | `supabase/update_juillet_2026.sql` | Suppression des licences obsolètes + colonne `instruction_indisponible` | Modifie schéma |
| 4 | `supabase/add_ground_crew.sql` | Création des 6 tables Ground Crew + catalogue de portes (200+ gates seed) | Crée tables |
| 5 | `supabase/fix_reparation_tarif_unique.sql` | Correction contrainte UNIQUE sur `reparation_tarifs` | Modifie contrainte |
| 6 | `supabase/fix_ground_crew_role.sql` | Ajout de `ground_crew` dans la CHECK constraint `profiles.role` | Modifie contrainte |
| 7 | `supabase/add_ground_crew_teams.sql` | Création des tables d'équipes GC + modification `ground_service_requests` | Crée tables |

> **Point d'attention n°2 de `update_juillet_2026.sql`** : vérifier que le type ENUM `messages_type_message_enum` (si présent) inclut `cheque_salaire_atc` :
> ```sql
> SELECT unnest(enum_range(NULL::messages_type_message_enum));
> ALTER TYPE messages_type_message_enum ADD VALUE IF NOT EXISTS 'cheque_salaire_atc';
> ```

---

## Changements implémentés

### 1. Corrections de bugs

#### Fix authentification IP (faux changements d'IP)
- **Fichier** : `src/lib/ip-utils.ts` (nouveau)
- **Problème** : les adresses IPv6-mappées IPv4 (`::ffff:x.x.x.x`) étaient traitées comme différentes de leur équivalente IPv4 pure (`x.x.x.x`), déclenchant des fausses alertes de "changement d'IP" à la connexion.
- **Solution** : `normalizeIp()` convertit `::ffff:x.x.x.x → x.x.x.x` avant toute comparaison. `getClientIp()` lit `x-forwarded-for` puis `x-real-ip` de façon normalisée.
- **Impact** : suppression des reconnexions intempestives pour les utilisateurs derrière Vercel/Cloudflare.

#### Fix contrainte tarifs réparation
- **Fichier** : `supabase/fix_reparation_tarif_unique.sql`
- **Problème** : la contrainte composite `UNIQUE(entreprise_id, type_avion_id)` permettait des doublons quand `type_avion_id = NULL`, causant des erreurs lors de la création de tarifs.
- **Solution** : suppression des lignes parasites, puis remplacement par `UNIQUE(entreprise_id)` — un seul tarif de base par entreprise (les réductions alliance restent sur `entreprises_reparation.prix_alliance_pourcent`).

---

### 2. Réforme salariale ATC

- **Fichiers** : `src/lib/atc-salaire.ts` (nouveau), `src/app/api/atc/session/route.ts`, `src/app/api/atc/session/[user_id]/route.ts`
- **Principe** : passage d'un système à taux fixe à un **barème à la minute** selon la position.

| Position | Taux / minute |
|---|---|
| Delivery | 200 F$/min |
| Clairance | 200 F$/min |
| Ground | 400 F$/min |
| Tower | 600 F$/min |
| APP | 800 F$/min |
| DEP | 800 F$/min |
| Center | 1 000 F$/min |

- **Calcul** : `salaire = durée_session_minutes × taux_position`
- Le chèque final (`cheque_taxes_atc`) cumule salaire + taxes aéroportuaires accumulées (`atc_taxes_pending`).
- Les deux routes de déconnexion (normale et forcée par admin) utilisent le même barème via `ATC_TAUX_PAR_MINUTE`.
- **Aucun changement de schéma Supabase requis** pour cette réforme (colonnes existantes réutilisées).

---

### 3. Suppression de licences

- **Fichiers** : `src/lib/licence-types.ts`, `src/lib/instruction-programs.ts`, `supabase/update_juillet_2026.sql`
- **Licences supprimées** : PPL, CPL, ATPL, IR ME, Multi Crew attestation, CLASS-M, CLASS-MT, CLASS-MRP, IFR, VFR, COM 1–6.

**Actions SQL associées** :
1. Suppression des entrées dans `licences_qualifications` pour les types obsolètes.
2. Réinitialisation des formations actives (`formation_instruction_active = false`) pour les élèves en parcours PPL/CPL/ATPL/IR ME.
3. Suppression des items de progression `instruction_progression_items` liés aux parcours supprimés.
4. Archivage (suppression) des demandes d'examens en attente (`assigne`, `accepte`, `en_cours`) pour les licences supprimées.

**Licences encore actives** : FI, FE, ATC FI, ATC FE, Qualification Type, CAT 1–6, C1/C2/C3/C4/C6, CAL-ATC, CAL-AFIS, PCAL-ATC, PCAL-AFIS, LPAFIS, LATC.

---

### 4. Système d'instruction (FI/FE)

- **Fichiers** : `src/lib/instruction-programs.ts`, `src/lib/instruction-permissions.ts`, `src/app/(app)/instruction/InstructionClient.tsx`, `src/app/api/instruction/disponibilite/route.ts` (nouveau)
- **Programme actif** : seul `ATC-INIT` (formation vers LATC, 5 modules A1–A5) est conservé.

**Mode indisponible** :
- Nouvelle colonne `profiles.instruction_indisponible` (BOOLEAN, défaut `false`).
- Un FI/FE/ATC FI/ATC FE peut se marquer indisponible : il est automatiquement exclu des pools de sélection pour les nouvelles demandes de training et d'examen.
- L'API `POST /api/instruction/disponibilite` gère le basculement.
- Un index partiel `idx_profiles_instruction_indisponible` optimise le filtre.

---

### 5. Espace Ground Crew

- **Fichiers** : `src/app/(ground)/` (nouveau layout), `src/app/(ground)/ground/page.tsx`, `src/app/(ground)/ground/GatesView.tsx`, `src/app/(ground)/ground/GroundConnexionForm.tsx`, `src/app/(ground)/ground/GroundDashboard.tsx`, `src/app/(ground)/ground/ServiceRequestCard.tsx`
- **API** : `src/app/api/ground/` (6 routes : session, gates, gate-assignments, service-requests, priority, boarding)

**Tables créées** (`add_ground_crew.sql`) :
- `ground_sessions` — connexions GC en service (unique par utilisateur)
- `airport_gates` — catalogue des portes par aéroport (seed 200+ gates pour IRFD, ITKO, IZOL, IPPH, ILAR, IPAP, IKFL, IMLR, ISAU + 15 petits aéroports)
- `gate_assignments` — attributions de portes aux plans de vol
- `ground_service_requests` — demandes de services (bagages, catering, fuel, boarding)
- `boarding_status` — suivi embarquement passagers
- `company_gate_priority` — priorité de portes payante par compagnie
- `compagnie_gate_preferences` — préférences de portes (soft, sans coût)

**Mini-jeux** (7) : Bagages, Boarding, Catering, Checklist, Dégivrage, Carburant, Marshalling.

---

### 6. Système d'équipes Ground Crew

- **Fichiers** : `src/lib/ground/teams.ts` (nouveau), `supabase/add_ground_crew_teams.sql`

**Tables créées** :
- `ground_crew_teams` — équipes actives (avec `disbanded_at`)
- `ground_crew_team_members` — membres (contrainte UNIQUE sur utilisateur actif)
- `ground_crew_team_invitations` — invitations avec expiration automatique à 5 minutes
- `ground_crew_service_contributions` — score mini-jeu et montant perçu par membre

**Logique métier** (`teams.ts`) :
- Un GC sans équipe se voit créer automatiquement une équipe "solo".
- Système d'invitation avec expiration : un GC ne peut être dans qu'une seule équipe active.
- Dissolution automatique si le dernier membre quitte → réassignation des plans aux équipes disponibles, ou statut `ground_crew_unavailable` si aucune équipe n'est dispo.
- Fusion de deux équipes (`fusionnerEquipes`).
- Distribution proportionnelle du paiement selon les scores mini-jeux de chaque membre.

---

### 7. Bonus pilote/compagnie (services au sol)

- **Fichier** : `src/lib/plans-vol/closure.ts`
- Lors de la clôture d'un plan de vol commercial avec services au sol complétés (`bonusGroundServices > 0`) :
  - **+10%** sur le salaire net du pilote
  - **+5%** sur le revenu net de la compagnie
- Les chèques mentionnent explicitement le bonus (ex. : `🛬 Bonus services au sol: +X F$ (+10%)`).
- La logique est appliquée après déduction des taxes et avant le remboursement de prêt.

---

### 8. Sécurité et performance

- **Normalisation IP** : `src/lib/ip-utils.ts` — évite les faux positifs d'alerte sécurité (voir §1).
- **Protection admin serveur** : `src/app/(app)/admin/layout.tsx` — layout serveur Next.js 14 qui vérifie `role === 'admin'` côté serveur avant de rendre toute page admin ; redirect vers `/login` si non authentifié, redirect vers `/` si non-admin.
- **Middleware** : `src/middleware.ts` — routes protégées par rôle.
- **RLS** : toutes les nouvelles tables Ground Crew ont RLS activé avec des politiques explicites.
- **Index** créés : `idx_profiles_instruction_indisponible`, `ground_sessions_user_unique`, `gate_assignments_gate_idx`, `ground_service_requests_aeroport_statut_idx`, `ground_crew_team_members_unique_active`.

---

### 9. Améliorations visuelles

- **Services au sol** : nouveau panneau `ServicesAuSolPanel.tsx` dans `src/app/(app)/logbook/plans-vol/` — affiche les demandes de services au sol liées au plan de vol actif.
- **Dépôt plan de vol** : `DepotPlanVolForm.tsx` — formulaire enrichi avec sélection de porte de départ (`PorteDepartSelect.tsx`).
- **Espace Ground** : interface dédiée `(ground)/ground/` avec tableau de bord, vue des gates, cards de services et mini-jeux.
- **Compagnie priorités portes** : `CompagniePrioritesPortesClient.tsx` dans `(app)/ma-compagnie/`.
- **Téléphone ATC** : `AtcTelephone.tsx` déplacé en composant partagé ; `AtcNavBar.tsx` et `GroundNavBar.tsx` créés.

---

### 10. Entreprises de réparation

- **Fichier** : `supabase/fix_reparation_tarif_unique.sql`
- Correction du bug de contrainte (cf. §1 — Corrections de bugs).
- `ReparationClient.tsx` mis à jour pour afficher les tarifs correctement après la normalisation du schéma.
- La logique d'agrandissement de hangars (`/api/reparation/hangars/[id]/agrandir/route.ts`) et de tarifs (`/api/reparation/tarifs/route.ts`) ont été mises à jour en cohérence.

---

### 11. Alliances

- **Fichier** : `src/app/(app)/alliance/AllianceClient.tsx` (nouveau)
- Interface dédiée à la gestion des alliances avec vue des membres et des flux financiers inter-compagnies.
- La logique de codeshare et de taxe alliance dans `closure.ts` reste inchangée.

---

### 12. Administration

- **Fichiers** : `src/app/(app)/admin/layout.tsx`, `src/app/(app)/admin/pilotes/page.tsx`, `src/app/(app)/admin/pilotes/PilotesListClient.tsx`, `src/app/(app)/admin/pilotes/[id]/EditPiloteForm.tsx`, `src/app/api/pilotes/[id]/route.ts`
- Espace admin protégé par layout serveur (voir §8).
- Nouvelle page liste pilotes avec recherche et édition inline.
- **Co-PDG** (`supabase/add_co_pdg_role.sql`) : nouvelle colonne `role` dans `compagnie_employes` permettant de désigner des co-PDG avec droits de gestion étendus (flotte, employés, hubs, réparations) sans accès aux opérations critiques (fermeture, changement de PDG).
- `AdminSpaceSelector.tsx` créé pour la navigation entre espaces admin.

---

## Points d'attention

> Actions manuelles requises avant ou après déploiement.

1. **Exécuter les 6 migrations SQL** dans l'ordre du tableau ci-dessus (hors `add_atc_salaire_minute.sql` qui est documentaire).

2. **Vérifier l'enum `type_message`** dans Supabase :
   ```sql
   SELECT unnest(enum_range(NULL::messages_type_message_enum));
   ```
   Si le type existe, ajouter `cheque_salaire_atc` :
   ```sql
   ALTER TYPE messages_type_message_enum ADD VALUE IF NOT EXISTS 'cheque_salaire_atc';
   ```

3. **Seed des portes** : le seed dans `add_ground_crew.sql` commence par `DELETE FROM airport_gates;` — ne pas ré-exécuter si des attributions de portes (`gate_assignments`) ou priorités compagnies sont déjà en production.

4. **Élèves en formation supprimée** : `update_juillet_2026.sql` réinitialise automatiquement les formations actives PPL/CPL/ATPL/IR ME. Prévenir les utilisateurs concernés que leur parcours a été fermé et qu'ils doivent s'inscrire à ATC-INIT s'ils souhaitent continuer une formation.

5. **add_ground_crew_teams.sql** modifie la CHECK constraint de `ground_service_requests.statut` — à exécuter **après** `add_ground_crew.sql` (ordre respecté dans le tableau).

6. **Migrations à déplacer** : selon la suggestion du fichier `docs/juillet-2026-suggestions.md` §5.2, envisager de déplacer les nouveaux `.sql` vers `supabase/migrations/` avec un numéro de version si le projet passe en gestion de migrations automatiques.

---

## Suggestions futures

> Extrait priorisé depuis `docs/juillet-2026-suggestions.md`.

### Priorité haute

1. **`useLiveKitCall` — hook partagé** *(risque faible, gain immédiat)*
   `AtcTelephone.tsx` et `SiaviTelephone.tsx` partagent ~400 lignes de logique LiveKit quasi-identique. Extraire dans `src/hooks/useLiveKitCall.ts` permettrait d'économiser ~300 lignes dupliquées.

2. **N+1 queries dans `atc/page.tsx`** *(impact performance, risque moyen)*
   L'enrichissement des plans vol (pilote/compagnie/avion) génère potentiellement 80+ requêtes Supabase pour 20 plans actifs. Grouper par `.in(ids)` réduirait à 4–5 requêtes.

### Priorité moyenne

3. **Découpage `InstructionClient.tsx`** (~2 050 lignes) *(risque élevé — tester minutieusement)*
   Découper en orchestrateur + hooks `useInstructionState`/`useInstructionActions` + 4 sous-composants onglets.

4. **`StatusBadge` partagé** *(risque faible)*
   La logique de badge de statut est dupliquée dans au moins 4 fichiers. Extraire `src/components/StatusBadge.tsx`.

### Priorité basse

5. **Skeleton loading** : les pages pilotes manquent de squelettes inline pour les sections post-hydratation.

6. **`enrichTransactionsWithVban`** : logique métier dans `felitz-bank/page.tsx` à déplacer vers `src/lib/felitz/transactions.ts`.

7. **Configuration navigation** : le tableau `piloteSections` (~50 lignes) dans `NavBar.tsx` à extraire vers `src/lib/nav-config.ts`.
