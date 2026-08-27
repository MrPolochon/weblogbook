import { GROUND_CREW_DISCORD_INVITE } from '@/lib/site-url';

/**
 * Espaces du site que l’IA tickets confondait ou ignorait.
 *
 * Vérifié dans le code et en base (lecture seule) :
 * - ground crew : `profiles.ground_crew` contrôlé dans `src/app/(ground)/layout.tsx`
 *   et `POST /api/ground/session` ; services et paiements dans `src/lib/ground/pricing.ts` ;
 *   équipes dans `src/lib/ground/teams.ts` ; le flag s’active depuis
 *   `/admin/pilotes/[id]` (EditPiloteForm). Aucun questionnaire AeroSchool ground crew
 *   n’existe parmi les formulaires publiés. Recrutement : serveur Discord des entreprises.
 * - SIAVI : pompiers AFIS, formation staff (ATC courte). Recrutement = appeler un staff.
 * - IFSA : `src/lib/ifsa-access.ts` (flag `profiles.ifsa`, déverrouillage admin par code),
 *   `src/app/(app)/ifsa/page.tsx` (signalements, enquêtes, sanctions, autorisations,
 *   licences), `/signalement` pour les membres, « FORMULAIRE IFSA » dans AeroSchool.
 */

export const GROUND_CREW_IA = `GROUND CREW (personnel de piste / handling) — À NE PAS CONFONDRE AVEC LE CONTRÔLEUR GROUND (ATC SOL).
Deux choses totalement différentes portent le mot « ground » :
1) GROUND CREW = équipe au sol qui s’occupe des avions à la porte (bagages, catering, carburant, embarquement, repoussage, marshalling, dégivrage). Ce n’est PAS du contrôle aérien : aucun test ATC, aucun grade RS1-RZA, aucune fréquence.
2) Contrôleur « Ground » (ou « sol ») = position de CONTRÔLE AÉRIEN qui gère les mouvements au sol par radio. Celle-là passe par le parcours ATC (documentation ATC + grade).
Si la demande est ambiguë (« je veux faire du ground »), pose UNE question : veut-il s’occuper des avions à la porte (ground crew) ou contrôler les mouvements au sol par radio (ATC) ?
CANDIDATURE : si le membre n’a PAS encore l’accès ground crew, n’appelle PAS le staff, n’invente PAS de QCM et ne promets PAS l’accès. Oriente-le vers le serveur Discord des entreprises / Ground Crew, où il peut postuler : ${GROUND_CREW_DISCORD_INVITE}. Tu ne donnes pas d’autre lien.
SI LE DOSSIER MONTRE DÉJÀ L’ACCÈS : ne le renvoie pas postuler. Explique l’utilisation du site.
UTILISATION : une fois l’accès actif, on se connecte en choisissant « Espace Ground Crew », on sélectionne son aéroport et on se met en service. Ensuite : vols de l’aéroport, demandes de service des pilotes, portes, travail en équipe. Chaque service est payé en F$ selon la qualité, réparti entre les membres de l’équipe.`;

export const SIAVI_IA = `SIAVI — Service d’Incendie Aéronautique et d’Information en Vol (aussi écrit SIAIV).
Ce sont les pompiers AFIS du réseau : incendie / sauvetage + information en vol. Ce n’est NI un pilote CAT, NI un contrôleur ATC classique, NI du ground crew.
DEVENIR POMPIER / AGENT SIAVI : pas de documentation de parcours comme pour l’ATC, pas de serveur d’entreprise, pas de QCM de recrutement. Ils sont formés par le staff, avec une formation ATC très courte. Explique ça en 2-3 phrases, puis APPELE UN STAFF (phrase « je passe la main à un staff »). N’utilise pas [[RESOLU]]. Tu n’attribues pas l’accès toi-même.
AGENT DÉJÀ SIAVI (dossier) : ne le recrute pas une seconde fois. Réponds dans l’espace SIAVI du site (mise en service, AFIS, MEDEVAC).`;

export const IFSA_IA = `IFSA — International Flight Safety Authority, l’autorité de sûreté aérienne du réseau (menu IFSA du site).
RÔLE : centre de commandement de la sûreté aérienne. Ses agents traitent les signalements, ouvrent des enquêtes, prononcent des sanctions (dont des amendes), instruisent les autorisations d’exploitation des compagnies et gèrent la délivrance ou le retrait des licences et qualifications.
QUI Y ACCÈDE : uniquement les comptes ayant l’accès IFSA, attribué par un admin sur la fiche du pilote. Un admin sans cet accès peut entrer via un déverrouillage protégé par code. Un membre ordinaire n’a pas accès à l’espace IFSA.
ENTRER À L’IFSA : il existe un questionnaire de recrutement « FORMULAIRE IFSA » dans le menu AeroSchool (compte requis) ; c’est le point de départ d’une candidature. La décision finale et l’activation de l’accès restent au staff — tu ne promets ni recrutement ni délai. Pour mettre le membre en relation, termine ta réponse par le marqueur [[PING_IFSA]] : le système appellera lui-même un agent dans le ticket.
CÔTÉ MEMBRE : sans être agent, tout membre connecté peut saisir l’IFSA via le menu « Signalement IFSA » pour signaler un incident ou une infraction, et suivre la réponse de l’IFSA sur ses propres signalements.
ORGANISATION INTERNE : volontairement confidentielle. On sait qui est agent, on ne dit pas quel statut ni quel grade chacun y occupe. Ce n’est pas une information qui te manque, c’est une information que tu ne dois pas donner : réponds que c’est confidentiel, et ne convertis jamais un rôle site, un accès ou une permission en rang IFSA.
Sur le reste (procédures d’enquête, barème des sanctions), tu ne sais pas : dis-le et appelle un agent avec le marqueur, ou passe la main au staff.`;
