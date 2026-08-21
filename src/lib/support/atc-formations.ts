/**
 * Formations et positions ATC — bloc de connaissance pour l’IA tickets.
 *
 * Tout ce qui suit est vérifié dans le code du site :
 * - positions : `src/lib/atc-positions.ts`
 * - grades et restrictions : `src/lib/atc-grade-restrictions.ts` (table `atc_grades`)
 * - licences ATC / AFIS examinables : `src/lib/instruction-permissions.ts`
 * - demande de training ATC : `src/app/api/instruction/atc-trainings/route.ts`
 *   et l’onglet « Mon Espace » de `src/app/(app)/instruction`
 * - parcours encadré ATC-INIT : `src/lib/instruction-programs.ts`
 * - QCM ATC dédiés : formulaires AeroSchool publiés en base
 *
 * Ne rien ajouter ici sans l’avoir vérifié : l’IA prend ce bloc pour argent comptant.
 */

/** Positions de contrôle ouvrables en service (identique à ATC_POSITIONS). */
export const ATC_POSITION_LABELS = 'Delivery, Clairance, Ground, Tower, APP, DEP, Center';

/** Grades ATC réels, du plus bas au plus haut (table atc_grades, colonne ordre). */
export const ATC_GRADE_LADDER = 'RS1 < RS2 < RS3 < RTA < RLA < RZA';

export const ATC_FORMATIONS_IA = `FORMATIONS ATC (contrôle aérien) — À NE JAMAIS CONFONDRE AVEC LES CAT PILOTE.
« Training Center / Approach (APP) / Tower (TWR) / Ground / Delivery / Clairance / DEP / CTR / DEL » = positions de CONTRÔLE. Une demande de ce type n’a AUCUN rapport avec les licences CAT 1–5 ni avec le livret de progression pilote : ne réponds jamais CAT / QCM CAT / plan de vol à quelqu’un qui demande un training ATC.
- Positions ouvrables en service : ${ATC_POSITION_LABELS}.
- L’accès à une position dépend du GRADE ATC (${ATC_GRADE_LADDER}) et des restrictions par aéroport / position définies par un admin ATC. Les habilitations et les heures exigées par grade sont détaillées dans le manuel du contrôleur (/manuel-controleur), résumé plus bas. Un grade se change uniquement par le staff ATC : tu ne peux ni l’attribuer ni promettre une position.
- Licences ATC / AFIS délivrées par examen : LATC, CAL-ATC, PCAL-ATC, CAL-AFIS, PCAL-AFIS, LPAFIS.
- Titres d’encadrement : ATC FI (forme) et ATC FE (fait passer l’examen). L’instructeur qui a formé un candidat sur une licence ne peut pas l’examiner sur cette même licence.
PARCOURS RÉEL (ne cite aucune autre page) :
1) Théorie : menu AeroSchool, QCM ATC dédiés — « Test ATC Delivery » et « Test ATC ground (sol) » sont ouverts sans compte, « FORMULAIRE ATC TOWER » et « GRAND TEST ATC — Contrôleur Confirmé » exigent un compte connecté. Ce ne sont pas les QCM CAT pilote. Vérifie le bloc « Questionnaires AeroSchool » du contexte avant d’en citer un.
2) Pratique : menu Instruction, onglet « Mon Espace », carte « Session de training (ATC) » : choisir la licence ATC/AFIS visée, message facultatif, puis « Demander une session de training ». Un instructeur ATC FI est assigné automatiquement ; la date se convient avec lui en message privé. Une seule demande de training ATC à la fois.
3) Parcours encadré facultatif : « Formation ATC (vers LATC) », modules A1 à A5, ouvert par un ATC FI ; l’élève suit l’avancement dans « Ma progression » (onglet Mon Espace).
4) Examen : « Mon Espace » → « Demander un examen » → licence ATC/AFIS ; un ATC FE est assigné.
L’accès au menu ATC du site suppose un compte avec l’accès ATC (ouvert par le staff).
Un training (ATC comme pilote) se planifie TOUJOURS avec un humain : donne la procédure courte ci-dessus, dis que tu ne peux pas réserver la séance, et appelle un instructeur.`;
