export const LIVRET_PROGRESSION_URL = '/livret-progression';
/** Document instructeur rempli (usage interne, pas la page publique). */
export const LIVRET_PROGRESSION_PDF = '/docs/livret-progression-akizor.pdf';
/** Formulaire vierge affiché sur /livret-progression et le lien AeroSchool. */
export const LIVRET_PROGRESSION_VIERGE_PDF = '/docs/livret-progression-vierge.pdf';

/** Condensé : le détail complet des compétences reste sur ${LIVRET_PROGRESSION_URL}. */
export const LIVRET_PROGRESSION_IA = `PARCOURS CATÉGORIES (licences CAT 1 à 5) — Livret de progression AeroSchool / Instruction (${LIVRET_PROGRESSION_URL}).
Chaque catégorie se fait EN DEUX TEMPS, toujours dans cet ordre :
1) QCM théorique dans le menu AeroSchool du site ;
2) partie PRATIQUE ensuite, via le menu Instruction (demande de training, vol instructeur-élève, fiches de compétences).
Ne dis jamais de passer l’instruction avant le QCM. Le livret se remplit à chaque séance (signatures élève + instructeur).

CAT 1 (~2 h) — bases serveur, site et aéronautique, surtout VFR : utilisation du site, dépôt de plan de vol, NOTAM, carnet de vol, roulage, décollage, montée, palier, virages, gestion moteur, tour de piste, réglementation et communication VFR.
CAT 2 (~1 h 30) — bases de navigation VFR : lecture des cartes VFR, documents du site, IMC/VMC, préparation du vol, calcul des performances, briefing, montée initiale, tenue de route, intégration.
CAT 3 (~2 h) — approfondir le VFR et décider seul : préparation et anticipation, gestion des pannes, communication avancée, navigation ON TOP, récupération de position inhabituelle, déroutement, interruption volontaire du vol, VFR spécial, gestion de la charge de travail.
CAT 4 (~2 h) — bases serveur/site et aéronautique surtout IFR : préparation du vol, lecture des cartes, procédures de départ et d’arrivée, création du plan de vol, clairance de départ, briefing, communication et navigation IFR, réglementation IFR, ILS / RNP / visuel.
CAT 5 (~2 h) — approfondir : préparation du vol, turbopropulseur et turbine, briefing, attente en vol, finale (axe/plan/vitesse), déroutement, tenue de route, pilotage IMC, communication.
Pour voler EN COMPAGNIE il faut au moins CAT 4 (les CAT 1 à 3 restent personnelles). Recrutement / création de compagnie : serveur Discord dédié, pas le logbook.

Ce parcours ne concerne QUE les pilotes : une demande de formation ou de position ATC (Center, Approach, Tower, Ground, Delivery…) relève du bloc FORMATIONS ATC, jamais des CAT.
Ticket CAT / AeroSchool / Instruction côté pilote : oriente d’abord vers le QCM AeroSchool de la catégorie, puis vers Instruction pour le vol pratique.`;
