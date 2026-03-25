const fs = require("fs");
const path = require("path");

const root = "c:/Users/bonno/OneDrive/Images/Documents/GitHub/weblogbook";
const pages = JSON.parse(
  fs.readFileSync(path.join(root, ".analysis", "pages.json"), "utf8")
);

function uniq(arr) {
  return Array.from(new Set(arr));
}

function rel(p) {
  return path.relative(root, p).replace(/\\/g, "/");
}

let md = "";

for (const pg of pages) {
  const txt = fs.readFileSync(pg.file, "utf8");

  const apiRefs = uniq(
    (txt.match(/fetch\(\s*["'](\/api\/[^"']+)["']\s*[,)]/g) || []).map((s) => {
      const m = s.match(/["'](\/api\/[^"']+)["']/);
      return m ? m[1] : null;
    })
  ).filter(Boolean);

  const tables = uniq(
    (txt.match(/\.from\(\s*["']([^"']+)["']\s*\)/g) || []).map((s) => {
      const m = s.match(/from\(\s*["']([^"']+)["']/);
      return m ? m[1] : null;
    })
  ).filter(Boolean);

  const imports = uniq(
    (txt.match(/import\s+[^;]*?\s+from\s+["'](@\/components\/[^"']+)["']/g) ||
      []).map((s) => {
        const m = s.match(/from\s+["'](@\/components\/[^"']+)["']/);
        return m ? m[1] : null;
      })
  ).filter(Boolean);

  md += "### " + pg.route + "\n";
  md += "- fichier: " + rel(pg.file) + "\n";
  md +=
    "- Appels API repérés: " +
    (apiRefs.length
      ? apiRefs.slice(0, 6).join(", ") + (apiRefs.length > 6 ? " ..." : "")
      : "(aucun via fetch(/api/))") +
    "\n";
  md +=
    "- Tables Supabase repérées: " +
    (tables.length
      ? tables.slice(0, 10).join(", ") + (tables.length > 10 ? " ..." : "")
      : "(aucune occurrence de .from(...))") +
    "\n";
  md +=
    "- Imports composants (local): " +
    (imports.length
      ? imports
          .slice(0, 6)
          .join(", ") +
        (imports.length > 6 ? " ..." : "")
      : "(non détectés via regex)") + "\n\n";
}

fs.writeFileSync(
  path.join(root, ".analysis", "pages_summary.md"),
  md,
  "utf8"
);

// Version "compacte" : une ligne par route
let mdCompact = "";
for (const pg of pages) {
  const txt = fs.readFileSync(pg.file, "utf8");
  const apiRefs = uniq(
    (txt.match(/fetch\(\s*["'](\/api\/[^"']+)["']\s*[,)]/g) || []).map((s) => {
      const m = s.match(/["'](\/api\/[^"']+)["']/);
      return m ? m[1] : null;
    })
  ).filter(Boolean);
  const tables = uniq(
    (txt.match(/\.from\(\s*["']([^"']+)["']\s*\)/g) || []).map((s) => {
      const m = s.match(/from\(\s*["']([^"']+)["']/);
      return m ? m[1] : null;
    })
  ).filter(Boolean);
  mdCompact +=
    pg.route +
    " | API: " +
    (apiRefs.length ? apiRefs.slice(0, 4).join(", ") + (apiRefs.length > 4 ? " ..." : "") : "aucune") +
    " | DB: " +
    (tables.length ? tables.slice(0, 5).join(", ") + (tables.length > 5 ? " ..." : "") : "aucune") +
    "\n";
}
fs.writeFileSync(
  path.join(root, ".analysis", "pages_compact.md"),
  mdCompact,
  "utf8"
);

console.log("pages_summary_generated");

