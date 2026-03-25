const fs = require("fs");
const path = require("path");

const root =
  "c:/Users/bonno/OneDrive/Images/Documents/GitHub/weblogbook";
const supabaseDir = path.join(root, "supabase");
const outPath = path.join(root, ".analysis", "db_tables_condensed_v2.md");

const files = fs
  .readdirSync(supabaseDir)
  .filter((f) => f.endsWith(".sql"));

const tables = {}; // tableName -> { cols: {col: {type, sources:Set}} }

function ensureTable(t) {
  if (!t) return;
  if (!tables[t]) tables[t] = { cols: {}, sources: new Set() };
}

function addCol(t, c, typ, src) {
  if (!t || !c) return;
  ensureTable(t);
  if (!tables[t].cols[c]) tables[t].cols[c] = { type: "", sources: new Set() };
  if (typ && typ.trim()) {
    if (!tables[t].cols[c].type) tables[t].cols[c].type = typ.trim();
  }
  if (src) tables[t].cols[c].sources.add(src);
}

// ---- CREATE TABLE parsing (line-based heuristic) ----
for (const f of files) {
  const p = path.join(supabaseDir, f);
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);

  let cur = null;
  let capturing = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Capture either:
    // CREATE TABLE public.foo ...
    // CREATE TABLE foo ...
    const m = line.match(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)/i
    );
    if (m) {
      cur = m[1];
      capturing = true;
      continue;
    }

    if (!capturing) continue;

    // End condition for CREATE TABLE blocks
    if (line.includes(");")) {
      capturing = false;
      cur = null;
      continue;
    }

    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("--")) continue;
    if (/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|REFERENCES)\b/i.test(t)) continue;

    // Column line heuristic: <name> <type> ...
    const cm = t.match(/^([a-zA-Z0-9_]+)\s+([^\s,]+)(.*)$/);
    if (cm) addCol(cur, cm[1], cm[2], f);
  }
}

// ---- ALTER TABLE ADD COLUMN parsing ----
for (const f of files) {
  const p = path.join(supabaseDir, f);
  const txt = fs.readFileSync(p, "utf8");

  // Includes both:
  // ALTER TABLE public.foo ADD COLUMN bar ...
  // ALTER TABLE foo ADD COLUMN bar ...
  const re = /ALTER\s+TABLE\s+(?:public\.)?([a-zA-Z0-9_]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s+([^,\n;]+?)(?=,|;|\n)/gi;

  let m;
  while ((m = re.exec(txt))) {
    const t = m[1];
    const col = m[2];
    const typ = (m[3] || "").trim().replace(/\s+/g, " ");
    addCol(t, col, typ, f);
  }
}

// ---- Condense: keep "key" columns per table ----
const keyRe = /(^id$|_id$|_at$|_url$|role|statut|status|type|code|token|email|ip|aeroport|position|frequency|created_at|updated_at|started_at|expires_at|purge_at|blocked_until|block_reason|solde|vban|montant|num(numero)?_signalement|titre|description)/i;

const tableNames = Object.keys(tables).sort((a, b) => a.localeCompare(b));
let md = "";

for (const t of tableNames) {
  const cols = Object.keys(tables[t].cols).sort((a, b) => a.localeCompare(b));
  const keyCols = cols.filter((c) => keyRe.test(c));

  // Deduplicate while preserving order
  const uniq = Array.from(new Set(keyCols));
  const show = uniq.slice(0, 22);

  md += "- `" + t + "`: ";
  md += show.length ? show.map((c) => "`" + c + "`").join(", ") : "(colonnes non détectées)";
  md += "\n";
}

fs.writeFileSync(outPath, md, "utf8");
console.log("tables_v2", tableNames.length);

