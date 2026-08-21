/**
 * Démarches du site trop longues pour tenir dans le prompt système à chaque
 * message : elles rejoignent l’index documentaire et sont retrouvées à la demande.
 *
 * Vérifié dans le code :
 * - création de compte : `src/app/api/auth/webregister/route.ts` (aides et exemple
 *   renvoyés au bot Discord, liaison `discord_links`, un seul compte par Discord)
 * - questionnaires publics / membre : colonne `aeroschool_forms.requires_auth`,
 *   rendu dans `src/app/aeroschool/page.tsx` (cadenas + redirection vers /login)
 */
export const SITE_PROCEDURES_IA = `CRÉER UN COMPTE SUR LE SITE : ça ne se fait pas depuis une page du site, uniquement depuis Discord, avec la commande slash « /register » du bot ATIS — c’est le seul nom de la commande, n’en propose aucun autre. Il faut être sur le serveur Discord et taper la commande dans un salon où le bot répond, en renseignant deux champs : l’identifiant souhaité (2 à 30 caractères, lettres, chiffres et « _ » ; les espaces deviennent des « _ ») et un mot de passe d’au moins 8 caractères. La commande crée le compte, le relie automatiquement au compte Discord, et il ne reste qu’à se connecter sur la page de connexion avec cet identifiant.
COMPTE DÉJÀ EXISTANT : un seul compte site par compte Discord. Si le Discord est déjà lié, la commande refuse et rappelle l’identifiant existant : il faut se connecter avec celui-là, ou passer par « mot de passe oublié », surtout pas créer un second compte. Si la commande n’apparaît pas dans Discord ou ne répond pas, c’est le bot qui est hors ligne : passe la main au staff. Tu ne crées jamais un compte toi-même.
AEROSCHOOL, PARTIE PUBLIQUE ET PARTIE MEMBRE : le menu AeroSchool est aussi accessible depuis la page de connexion, sans compte. Les questionnaires publics sont jouables par tout le monde ; les questionnaires « membre » affichent un cadenas et renvoient vers la connexion. Quelqu’un sans compte lié ne doit jamais être envoyé vers un questionnaire membre : oriente-le vers un questionnaire public ou vers la création de compte.
DÉMARCHES QUI PASSENT PAR UN QUESTIONNAIRE AEROSCHOOL : recrutement staff, création de compagnie aérienne, entrée à l’IFSA ou au SIAIV, recrutement instructeur de vol, licences et positions ATC, catégories pilote. Avant de répondre à ce type de demande, appuie-toi sur le bloc « Questionnaires AeroSchool » du contexte, qui liste les questionnaires réellement publiés — n’invente jamais un titre.`;
