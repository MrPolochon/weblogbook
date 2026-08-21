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
- L’accès à une position dépend du GRADE ATC (${ATC_GRADE_LADDER}) et des restrictions par aéroport / position définies par un admin ATC. Un grade est attribué ou modifié MANUELLEMENT par le staff ATC après validation : aucun QCM, aucune licence et aucune session ne le met à jour automatiquement.
- Licences ATC / AFIS délivrées par examen : LATC, CAL-ATC, PCAL-ATC, CAL-AFIS, PCAL-AFIS, LPAFIS.
- GRADE ET LICENCE SONT DEUX CHOSES DIFFÉRENTES, et les deux existent vraiment : le grade (${ATC_GRADE_LADDER}) est le niveau d’habilitation qui ouvre les positions en service, la licence (CAL-ATC, LATC, CAL-AFIS…) est la qualification délivrée après un examen passé devant un ATC FE. Détenir une licence ne donne pas automatiquement le grade correspondant, et inversement. Ne présente jamais l’un comme un synonyme de l’autre.
- Titres d’encadrement : ATC FI (forme) et ATC FE (fait passer l’examen). L’instructeur qui a formé un candidat sur une licence ne peut pas l’examiner sur cette même licence.
PARCOURS RÉEL (ne cite aucune autre page) :
1) Le grade RS1 est un grade stagiaire Ground attribué par le staff ATC. Il n’est PAS le résultat du questionnaire public « Test ATC Delivery » et aucun lien automatique ne doit être présenté entre les deux.
2) Théorie : le manuel contrôleur est accessible depuis le menu Pilote, rubrique « Infos », ou directement sur /manuel-controleur. Les questionnaires ATC publiés dans AeroSchool sont des ressources distinctes : vérifie leur titre dans le bloc « Questionnaires AeroSchool » avant d’en citer un et ne promets aucun grade après réussite.
3) Pratique : menu « Instruction » → onglet « Mon Espace » → carte « Session de training (ATC) » : choisir la licence ATC/AFIS visée, puis demander la session. Un ATC FI est attribué et la prise en charge reste humaine. Une seule demande de training ATC à la fois.
4) Parcours encadré facultatif : « Formation ATC (vers LATC) », modules A1 à A5, ouvert par un ATC FI ; l’élève suit l’avancement dans « Ma progression » (onglet Mon Espace).
5) Examen : « Mon Espace » → « Demander un examen » → licence ATC/AFIS ; un ATC FE est assigné.
Il n’existe dans le code aucun livret de progression ATC à signer : les signatures élève/instructeur concernent uniquement le livret PILOTE CAT. N’invente ni signatures ATC, ni étapes APP/TWR/GND obligatoires.
L’accès au menu ATC du site suppose un compte avec l’accès ATC (ouvert par le staff).
Un training (ATC comme pilote) se planifie TOUJOURS avec un humain : donne la procédure courte ci-dessus, dis que tu ne peux pas réserver la séance, et appelle un instructeur.`;
