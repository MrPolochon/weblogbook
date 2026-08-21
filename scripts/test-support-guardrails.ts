import assert from 'node:assert/strict';
import { detectDirectoryIntent } from '../src/lib/support/annuaire';
import {
  authoritativeSupportReply,
  CLARIFICATION_ONBOARDING,
  OFFICIAL_SITE_URL,
  sanitizeOfficialSiteUrl,
  shouldHonorIfsaPing,
  updateClarificationMemory,
} from '../src/lib/support/guardrails';
import { LIVRET_PROGRESSION_IA } from '../src/lib/support/livret-progression';
import { searchDocs } from '../src/lib/support/doc-index';
import { ATC_FORMATIONS_IA } from '../src/lib/support/atc-formations';
import { atcDossierGuidance } from '../src/lib/support/requester-context';
import { shouldOfferResolution } from '../src/lib/support/ticket-actions';
import {
  toLlmMessages,
  trimConversation,
  type TicketTurn,
} from '../src/lib/support/ticket-memory';

// a) Le serveur refuse un marqueur IFSA hors sujet, même si le modèle l'a émis.
assert.equal(shouldHonorIfsaPing('Comment devenir ATC ?', 'Formation contrôleur'), false);
assert.equal(shouldHonorIfsaPing("Je veux candidater à l'IFSA", 'Assistance'), true);
assert.equal(shouldHonorIfsaPing('Comment les contacter ?', 'Candidature IFSA'), true);

// b) Une panne d'authentification ouverte bloque toujours [[RESOLU]].
assert.equal(
  shouldOfferResolution('Essaie à nouveau.\n[[RESOLU]]', {
    escalate: false,
    memberMessages: 4,
    memberAsked: false,
    alreadyOffered: false,
    unresolvedAuthIssue: true,
  }),
  false,
);

// c) Les formulations de recommandation déclenchent l'annuaire ATC.
assert.equal(detectDirectoryIntent('Conseille-moi un instructeur ATC'), 'atc-instructors');
assert.equal(detectDirectoryIntent('Tu recommandes qui comme formateur ATC ?'), 'atc-instructors');

// d) CAT3 et CAT4 gardent leur mapping officiel.
assert.match(LIVRET_PROGRESSION_IA, /CAT 3[^]*approfondir le VFR/);
assert.match(LIVRET_PROGRESSION_IA, /CAT 4[^]*bases[^]*IFR/);

// e) Un détenteur LATC sans accès/grade ne recommence pas un parcours débutant.
const dossierAdvice = atcDossierGuidance(
  { atc: false, role: 'pilote', atc_grade_id: null },
  ['CAT 4', 'LATC', 'CAL-ATC', 'ATC FE'],
);
assert.match(dossierAdvice || '', /qualifications déjà détenues/);
assert.match(dossierAdvice || '', /Ne propose pas un parcours débutant/);
assert.match(dossierAdvice || '', /accès à l’espace ATC.*grade ATC/);

// f) Mot de passe oublié : lien 24 h, jamais code.
const forgotReply = authoritativeSupportReply("J'ai oublié mon mot de passe");
assert.match(forgotReply || '', /\/login\?reset=TOKEN/);
assert.match(forgotReply || '', /24 h/);
assert.match(forgotReply || '', /jamais de code à 6 chiffres/);
const missingCodeReply = authoritativeSupportReply('je ne reçois pas le code envoyé par mail');
assert.match(missingCodeReply || '', /vérification de connexion/);
assert.match(missingCodeReply || '', /passe la main à un staff/);

// g) URL officielle exacte et canonicalisation de l'ancienne fausse adresse.
assert.equal(OFFICIAL_SITE_URL, 'https://mixouairlinesptfsweblogbook.com/');
const obsoleteHost = ['https://ptfs', 'logbook/'].join('.');
assert.equal(sanitizeOfficialSiteUrl(`Va sur ${obsoleteHost}`), `Va sur ${OFFICIAL_SITE_URL}`);
assert.equal(authoritativeSupportReply('Quel est le site officiel ?'), `Le seul site officiel est ${OFFICIAL_SITE_URL}`);

// h) Après deux clarifications infructueuses, proposer un onboarding concret.
const first = updateClarificationMemory('', 'je comprends rien');
assert.equal(first.showOnboarding, false);
const second = updateClarificationMemory(first.memory, 'tout');
assert.equal(second.showOnboarding, true);
assert.match(CLARIFICATION_ONBOARDING, /Compte \/ connexion/);
assert.match(CLARIFICATION_ONBOARDING, /ATC \/ formation/);
assert.equal(updateClarificationMemory(second.memory, 'Comment déposer un plan ?').count, 0);

// i) Le transcript persiste au-delà de 10 tours, le contexte LLM reste borné.
const turns: TicketTurn[] = Array.from({ length: 60 }, (_, index) => ({
  role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
  content: `tour-${index}`,
}));
assert.equal(trimConversation(turns).length, 60);
const llmMessages = toLlmMessages('system', 'context', turns, 'dernier message');
assert.equal(llmMessages.length, 13); // deux systèmes + dix tours + dernier message
assert.equal(llmMessages[2].content, 'tour-50');

// Rejeu documentaire de formulations du ticket réel.
assert.match(
  searchDocs("c'est quoi un NOTAM", { prefer: ['site'] }).map((chunk) => chunk.text).join('\n'),
  /NOTAMS : lecture accessible/,
);
assert.match(
  searchDocs('temps minimum RTA RLA RZA', { prefer: ['manuel'] }).map((chunk) => chunk.text).join('\n'),
  /10 h en RS3/,
);
assert.match(
  ATC_FORMATIONS_IA,
  /Session de training \(ATC\)/,
);

console.log('Support guardrails: 9 groupes de tests réussis.');
