// Génère le seed SQL du module de questions « Code de Conduite MIXOU AIRLINES PTFS »
// à partir de scripts/cdc-module.json.
//
// Conversion : la source utilise un index `answer` (0-based) sur `options`.
// Le format attendu par aeroschool_question_modules est :
//   { id, title, options, correct_answers }  (correct_answers = [texte de la bonne option])
//
// Usage : node scripts/gen-cdc-module.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'cdc-module.json');
const OUT = join(__dirname, '..', 'supabase', 'seed_qcm_code_conduite_mixou.sql');

const raw = JSON.parse(readFileSync(SRC, 'utf8'));
const mod = raw.module;
const srcQuestions = mod.questions;

const seen = new Set();
const questions = srcQuestions.map((q) => {
  if (!Array.isArray(q.options) || q.options.length < 2) {
    throw new Error(`Question ${q.id} : options invalides`);
  }
  if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.options.length) {
    throw new Error(`Question ${q.id} : index de réponse invalide (${q.answer})`);
  }
  const id = `cdc-${String(q.id).padStart(3, '0')}`;
  if (seen.has(id)) throw new Error(`ID dupliqué : ${id}`);
  seen.add(id);
  return {
    id,
    title: String(q.question),
    options: q.options.map((o) => String(o)),
    correct_answers: [String(q.options[q.answer])],
  };
});

const jsonText = JSON.stringify(questions, null, 2);

// Dollar-quoting Postgres : pas d'échappement des apostrophes nécessaire.
// On vérifie juste que le tag n'apparaît pas dans le contenu.
const TAG = '$cdc$';
if (jsonText.includes(TAG)) {
  throw new Error('Le tag de dollar-quoting est présent dans les données : changez de tag.');
}

const title = mod.title.replace(/'/g, "''");

const sql = `-- ============================================================
-- Module de questions : ${mod.title}
-- Version source : ${mod.version} — ${questions.length} questions (QCM, 1 bonne réponse).
-- Banque pour AeroSchool (aeroschool_question_modules).
-- Généré depuis scripts/cdc-module.json via scripts/gen-cdc-module.mjs — NE PAS éditer à la main.
-- ============================================================
--
-- Non destructif : aucune suppression. L'insertion n'a lieu que si aucun module
-- ne porte déjà ce titre, donc le script peut être relancé sans créer de doublon.
-- (Pour mettre à jour un module existant, modifiez-le via l'admin AeroSchool.)

INSERT INTO aeroschool_question_modules (title, questions)
SELECT
  '${title}',
  ${TAG}${jsonText}${TAG}::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM aeroschool_question_modules WHERE title = '${title}'
);

-- Vérification (optionnel) :
-- SELECT jsonb_array_length(questions) FROM aeroschool_question_modules WHERE title = '${title}';
`;

writeFileSync(OUT, sql, 'utf8');

// Sanity check : on relit le JSON intégré pour s'assurer qu'il est valide.
JSON.parse(jsonText);

console.log(`OK — ${questions.length} questions écrites dans ${OUT}`);
console.log(`Exemple [0]:`, JSON.stringify(questions[0]));
console.log(`Exemple [299]:`, JSON.stringify(questions[questions.length - 1]));
