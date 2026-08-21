/**
 * Manuel des Opérations et Qualifications (MOQ) — PTFS FRANCE.
 * Résumé fidèle du PDF publié sur ${MANUEL_CONTROLEUR_URL} : grades ATC, volumes
 * d’heures exigés, protocole d’examen. Ne rien ajouter qui ne soit pas dans le PDF.
 */
export const MANUEL_CONTROLEUR_URL = '/manuel-controleur';
export const MANUEL_CONTROLEUR_PDF = '/docs/manuel-controleur.pdf';

export const MANUEL_CONTROLEUR_IA = `MANUEL DES OPÉRATIONS ET QUALIFICATIONS (MOQ) PTFS FRANCE — grades de contrôleur (texte intégral : ${MANUEL_CONTROLEUR_URL}). La progression se fait au mérite : heures de contrôle + validation technique.
- RS1 (Recrue de Secteur 1), stagiaire débutant : Ground uniquement, et seulement si un Tower est actif. Aucune autonomie.
- RS2 : Ground autonome sur tout terrain + Tower sur les aéroports à faible trafic.
- RS3 (Responsable Secteur 3), contrôleur confirmé : Tower sur tout aéroport. Exige une phraséologie parfaite et la gestion du trafic dense. Grade sanctionnable : toute erreur technique fait l’objet d’un rapport disciplinaire. Licence délivrée.
- RTA (Régulateur de Trafic et Approche) : 10 h en RS3 + test pratique supervisé par un RZA ou un ATC FE. Tower complet + Approches sur trafic modéré.
- RLA (Responsable Liaison et Large Approche) : 5 h en RTA + test pratique supervisé par un RZA ou un ATC FE. Toutes les Approches + centres spécifiques.
- RZA (Régulateur de Zone Avancée) : 5 h en RLA + test pratique final supervisé par un RZA ou un ATC FE. Autorité totale, tous centres et toutes positions.
Examen et validation : RS3, RTA, RLA et RZA exigent un temps de service minimum prouvé. À partir de RTA, chaque passage de grade passe par une supervision directe d’un RZA. De RS1 à RS3 le contrôleur a un instructeur référent qui le suit ; l’obligation de référent tombe une fois la licence RS3 obtenue.
Entraînement libre : n’importe quel contrôleur peut demander la supervision d’un ATC FI (ou d’un ATC FE à défaut) pour s’entraîner ; l’instructeur débriefe chaque décision prise.
Sanctions : la rigueur augmente avec le grade ; à partir de RS3 une faute grave entraîne la suspension immédiate des droits. Chaque aéroport dispose d’une fiche R.S.R. (Régulation - Sécurité - Réseau) dans les salons Discord d’aéroport, qui détermine si le contrôleur a le niveau pour tenir le poste.
Tu ne délivres ni ne promets aucun grade : c’est le staff ATC qui le fait.`;
