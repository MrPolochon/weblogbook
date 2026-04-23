# one-off: strip copilote snapshot from vols [id] route
from pathlib import Path
import re

p = Path(__file__).resolve().parents[1] / "src" / "app" / "api" / "vols" / "[id]" / "route.ts"
text = p.read_text(encoding="utf-8")

# Remove isConfirmingByCopilote block
text = re.sub(
    r"\n    if \(isConfirmingByCopilote\) \{[\s\S]+?\n    \}\n\n    let statutFinal",
    "\n    let statutFinal",
    text,
    count=1,
)

# Remove copiloteAttenteSnapshotNew
text = re.sub(
    r"\n    const copiloteAttenteSnapshotNew =[\s\S]+?\n\n    const updates",
    "\n    const updates",
    text,
    count=1,
)

# Fix compLibMaj references
text = text.replace(
    "compagnie_libelle: compLibMaj,",
    "compagnie_libelle: String(compagnie_libelle).trim() || 'Pour moi-même',",
)

# Simplify vol select
text = re.sub(
    r"    const \{ data: vol \} = await supabase\n      \.from\('vols'\)\n      \.select\(\n        \[[\s\S]+?\]\.join\(', '\)\n      \)\n      \.eq\('id', id\)\n      \.single\(\);",
    "    const { data: vol } = await supabase\n      .from('vols')\n      .select('pilote_id, copilote_id, copilote_confirme_par_pilote, instructeur_id, statut, refusal_count')\n      .eq('id', id)\n      .single();",
    text,
    count=1,
)

# Remove any leftover copilote_attente in updates
text = re.sub(
    r"\n      copilote_attente_snapshot: [^,]+,\n",
    "\n",
    text,
)

p.write_text(text, encoding="utf-8")
print("done")
