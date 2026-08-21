/**
 * Espaces du site que l’IA tickets confondait ou ignorait.
 *
 * Vérifié dans le code et en base (lecture seule) :
 * - ground crew : `profiles.ground_crew` contrôlé dans `src/app/(ground)/layout.tsx`
 *   et `POST /api/ground/session` ; services et paiements dans `src/lib/ground/pricing.ts` ;
 *   équipes dans `src/lib/ground/teams.ts` ; le flag s’active depuis
 *   `/admin/pilotes/[id]` (EditPiloteForm). Aucun questionnaire AeroSchool ground crew
 *   n’existe parmi les formulaires publiés.
 * - IFSA : `src/lib/ifsa-access.ts` (flag `profiles.ifsa`, déverrouillage admin par code),
 *   `src/app/(app)/ifsa/page.tsx` (signalements, enquêtes, sanctions, autorisations,
 *   licences), `/signalement` pour les membres, « FORMULAIRE IFSA » dans AeroSchool.
 */

export const GROUND_CREW_IA = `GROUND CREW (personnel de piste / handling) — À NE PAS CONFONDRE AVEC LE CONTRÔLEUR GROUND (ATC SOL).
Deux choses totalement différentes portent le mot « ground » :
1) GROUND CREW = équipe au sol qui s’occupe des avions à la porte (bagages, catering, carburant, embarquement, repoussage, marshalling, dégivrage). Ce n’est PAS du contrôle aérien : aucun test ATC, aucun grade RS1-RZA, aucune fréquence.
2) Contrôleur « Ground » (ou « sol ») = position de CONTRÔLE AÉRIEN qui gère les mouvements au sol par radio. Celle-là passe par le parcours ATC (QCM ATC + grade).
Si la demande est ambiguë (« je veux faire du ground »), pose UNE question : veut-il s’occuper des avions à la porte (ground crew) ou contrôler les mouvements au sol par radio (ATC) ?
ACCÈS GROUND CREW : c’est une autorisation posée sur le compte (accès « ground crew »), attribuée par un admin depuis la fiche du pilote dans le back-office. Il n’y a AUCUN questionnaire AeroSchool ground crew et aucun examen : la personne doit simplement demander l’accès au staff. Tu ne l’attribues pas toi-même.
UTILISATION : une fois l’accès actif, on se connecte sur la page de connexion en choisissant « Espace Ground Crew », on sélectionne son aéroport de service et on se met en service. Ensuite : voir les vols de l’aéroport, prendre les demandes de service des pilotes, gérer les portes, et travailler en équipe (invitations, fusion d’équipes). Chaque service accompli est payé en F$ selon la qualité réalisée, et le montant est réparti entre les membres de l’équipe.`;

export const IFSA_IA = `IFSA — International Flight Safety Authority, l’autorité de sûreté aérienne du réseau (menu IFSA du site).
RÔLE : centre de commandement de la sûreté aérienne. Ses agents traitent les signalements, ouvrent des enquêtes, prononcent des sanctions (dont des amendes), instruisent les autorisations d’exploitation des compagnies et gèrent la délivrance ou le retrait des licences et qualifications.
QUI Y ACCÈDE : uniquement les comptes ayant l’accès IFSA, attribué par un admin sur la fiche du pilote. Un admin sans cet accès peut entrer via un déverrouillage protégé par code. Un membre ordinaire n’a pas accès à l’espace IFSA.
ENTRER À L’IFSA : il existe un questionnaire de recrutement « FORMULAIRE IFSA » dans le menu AeroSchool (compte requis) ; c’est le point de départ d’une candidature. La décision finale et l’activation de l’accès restent au staff — tu ne promets ni recrutement ni délai.
CÔTÉ MEMBRE : sans être agent, tout membre connecté peut saisir l’IFSA via le menu « Signalement IFSA » pour signaler un incident ou une infraction, et suivre la réponse de l’IFSA sur ses propres signalements.
Si on te demande autre chose sur l’IFSA (organisation interne, grades, procédures d’enquête), tu ne le sais pas : dis-le et passe la main au staff.`;
