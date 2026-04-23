import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const p = join(__dirname, "../src/app/api/vols/[id]/route.ts");
let text = readFileSync(p, "utf8");

text = text.replace(
  /\n    if \(isConfirmingByCopilote\) \{[\s\S]+?\n    \}\n\n    let statutFinal/,
  "\n    let statutFinal"
);

text = text.replace(
  /\n    const copiloteAttenteSnapshotNew =[\s\S]+?\n\n    const updates/,
  "\n    const updates"
);

text = text.replace(
  "compagnie_libelle: compLibMaj,",
  "compagnie_libelle: String(compagnie_libelle).trim() || 'Pour moi-même',"
);

text = text.replace(
  /    const \{ data: vol \} = await supabase\n      \.from\('vols'\)\n      \.select\(\n        \[[\s\S]+?\]\.join\(', '\)\n      \)\n      \.eq\('id', id\)\n      \.single\(\);/,
  `    const { data: vol } = await supabase
      .from('vols')
      .select('pilote_id, copilote_id, copilote_confirme_par_pilote, instructeur_id, statut, refusal_count')
      .eq('id', id)
      .single();`
);

text = text.replace(/\n      copilote_attente_snapshot: [^,]+,\n/g, "\n");

writeFileSync(p, text, "utf8");
console.log("done");
