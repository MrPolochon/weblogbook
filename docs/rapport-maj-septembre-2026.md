# Rapport de mise à jour — Septembre 2026

> Mise à jour produit / UX / économie interne. Ce n’est pas une migration aéroports Project Flight.

---

## Statut général

| Vérification | Résultat |
|---|---|
| TypeScript (`npx tsc --noEmit`) | **OK — 0 erreur** |
| SQL manuel | `supabase/update_septembre_2026.sql` (table `bria_cooldowns` uniquement) |
| Enum chèques | **Ne pas** recréer `messages_type_message` — vérifier en prod `cheque_salaire_atc` |

---

## Vague 1 — Économie

- Chèques Ground Crew à la fin de chaque service `completed` (`src/lib/ground/cheques.ts`), idempotents via `cheque_numero_vol`.
- Taxes ATC : `atc_taxes_pending` n’est plus vidé si le chèque n’a pas été créé.
- Ferry : remboursement à l’annulation ; cron `/api/cron/vols-ferry` pour l’auto-clôture.
- Purge messagerie : les chèques non encaissés ne sont plus effacés.
- `ChequeVisuel` affiche l’erreur d’encaissement ; MICR stable.
- Bandeau « chèques à encaisser » sur Felitz et messageries.
- Crons Vercel : prêts, inactivity-cleanup, réparation-transit, ferry.

## Vague 2 — Réparation / alliance

- Onglet **Compte** Felitz pour le PDG réparation (solde, VBAN, virements, extraits).
- Hangars / Tarifs / Employés masqués aux techniciens.
- Virement Felitz autorisé depuis un compte `entreprise_reparation`.
- Alliance : bloc « entreprises de réparation partenaires » + tarif % + lien `/reparation`.

## Vague 3 — Ground Crew

- `GatesView` branché à la place du tableau portes statique.
- Realtime `plans_vol` en plus des demandes de service.
- Bandeau « GC en ligne à [APT] » + récap gains de session.
- Entrée nav « Entreprise GC » (bientôt) retirée.

## Vague 4 — Pilote / BRIA / perf-ptfs

- Calculateur : « Sans volets » = 0 (plus le premier cran du catalogue).
- Mapping silencieux affiché (« calculé comme [type PTFS] »).
- Échec explicite si poussée minimale introuvable.
- Cartes opaques, GO / NO-GO, sync avion TO/LDG, query `?avion=&dep=&arr=`.
- Lien « Calculer les perfs » depuis le dépôt.
- BRIA : cooldown serveur (`bria_cooldowns`) + confirmation visible après dépôt.
- Logbook : bandeau prochaine action (déposer / transpondeur / clôturer / encaisser).

## Vague 5 — Console ATC

- Dock : clôtures **Confirmer** inline ; transferts sortants visibles + **Annuler**.
- Strips outbound conservés chez l’initiateur (plus de filtre `pending_transfer is null`).
- Badges MEDEVAC / OUTBOUND / squawk attendu.
- `alert()` strips → toasts.
- Lien `/atc/creer-plan` dans le menu.
- Cron `/api/cron/atc-transferts` : expiration 90 s (plus le « 1 minute » fictif).

Suite livrée : dock 4 onglets (Nouveaux / Handoffs / Clôtures / Réseau), modal plans hors service seulement, avertissement soft si bay hors phase. Bays PLAN/CLRD/HOLD dédiés par position : non (colonnes sol/départ/arrivée conservées).

## Vague 5b — SIAVI / IFSA

- Menu hamburger SIAVI + « Non surveillés » visible sur mobile.
- IFSA : file du mois + lien Licences dans les onglets.

Téléphone ATC/SIAVI : toujours deux UIs (hook `useLiveKitCall` déjà partagé).

## Vague 6 — UI / nav / P0

- Tokens `--surface-0/1/2` opaques.
- AeroSchool retiré du bandeau desktop (reste dans le menu Infos).
- Hub admin : lien Radar beta.
- Rate limit : `verify-superadmin`, POST `plans-vol`, export logbook, POST recrutement.
- Classement : RPC `get_classement_pilotes()` (plus de plafond 10k vols).
- Discord : plus de fail-open si le bot est down (dernier état connu).
- WebAuthn : fallback `mixouairlinesptfsweblogbook.com`.
- Marché : cron `/api/cron/marche` (15 min) ; plus de `regenerer_*` à chaque SSR ; alerte si regen absente/stale ; client cargo orphelin supprimé.
- IFSA : listes 200 + compteurs SQL ; onglet persisté en session.
- Dépôt : wizard 3 étapes (appareil & route / détails / soumission) — départ = position de l’avion.
- Téléphone : `usePhoneAudioDevices` + codes SIAVI unifiés ; cleanup appels expirés partagé (`cleanupExpiredCallsForUser`).
- Storage orphelins : incidents + images flotte ; rate limit scan.
- Perf PTFS : proxies trop éloignés refusés (757/767/CRJ/Q400).
- Marketplace : soldes compagnies en une requête (plus de N+1 Felitz).
- IFSA : onglets avion + autorisations extraits (`IfsaAvionTab`, `IfsaAutorisationsTab`).
- Transfert ATC → AFIS : `transferer` / `accepter_transfert` + hiérarchie Ground/Tower + acceptation SIAVI.

**PF-ODW** : le worker Railway (`pf-worker`) est la source de vérité des tracks ; le cron Vercel `/api/cron/pf-odw-tracks` est un filet, pas une 2e ingestion parallèle à activer sans décision.

---

## SQL appliqué en prod (2 sept. 2026)

- `bria_cooldowns` créée + RLS (aucune policy utilisateur).
- `pay_siavi_taxes` / `pay_siavi_intervention` : plus de crédit direct (chèque seulement).
- Helpers Felitz `debiter/crediter/virer_avec_trace` : déjà présents ; **EXECUTE retiré à `anon` / `authenticated`** (service_role seulement).
- Pack Ground Crew : tables déjà présentes.
- `plans_vol.statut` : `annule` déjà accepté (plus `planifie_suivant` / `en_pause`) — **script `add_statut_annule` non réappliqué** (il aurait retiré ces valeurs).
- `type_message` est du `text` (pas d’enum) : `cheque_salaire_atc` utilisable sans ALTER TYPE.
- Index `OPTIMISATION_INDEX.sql` (IF NOT EXISTS).
- RPC `get_classement_pilotes()` (`supabase/add_classement_rpc.sql`).

Voir aussi [septembre-2026-suggestions.md](septembre-2026-suggestions.md).
