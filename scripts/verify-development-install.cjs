// Produces an installation protected by the successful local schema-copy result.
const fs=require('node:fs'),crypto=require('node:crypto');
const directory='tmp/development-release',hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const sql=fs.readFileSync(`${directory}/install.sql`,'utf8');
const report=JSON.parse(fs.readFileSync(process.argv[2]??`${directory}/copy-validation.json`,'utf8'));
if(report.status!=='passed'||(report.sourceInstallSha256??report.installSha256)!==hash(sql))throw Error('Validate the current installation on a schema copy first.');
const tables={
  vols:'to_jsonb(t)',
  plans_vol:"to_jsonb(t)-'economy_snapshot'-'economy_version'",
  felitz_comptes:'to_jsonb(t)',
  felitz_transactions:'to_jsonb(t)',
  compagnie_avions:"to_jsonb(t)-'development_maintenance_started_at'",
  compagnies:"to_jsonb(t)||jsonb_build_object('prix_billet_pax',t.prix_billet_pax::double precision,'prix_kg_cargo',t.prix_kg_cargo::double precision)",
  tarifs_liaisons:"to_jsonb(t)||jsonb_build_object('prix_billet',t.prix_billet::double precision)",
};
const projection=Object.entries(tables).map(([table,expr])=>`SELECT '${table}'::text table_name,count(*)::bigint row_count,md5(coalesce(jsonb_agg(r ORDER BY r::text)::text,'[]')) row_hash FROM (SELECT ${expr} r FROM public.${table} t) records`).join('\nUNION ALL\n');
const before=`
-- Brief write lock: the installation itself changes no flight, balance or ledger.
LOCK TABLE public.compagnies,public.tarifs_liaisons,public.plans_vol,public.vols,public.felitz_comptes,public.felitz_transactions,public.compagnie_avions IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE economy_install_baseline(table_name text PRIMARY KEY,row_count bigint,row_hash text) ON COMMIT DROP;
ALTER TABLE economy_install_baseline ENABLE ROW LEVEL SECURITY;
INSERT INTO economy_install_baseline ${projection};
`;
const after=`
DO $verification$
DECLARE changed_tables text;
BEGIN
 SELECT string_agg(table_name,', ') INTO changed_tables FROM (SELECT * FROM economy_install_baseline EXCEPT SELECT * FROM (${projection}) observed) changed;
 IF changed_tables IS NOT NULL THEN
   RAISE EXCEPTION 'Installation cancelled: existing business rows changed in %.',changed_tables;
 END IF;
 IF EXISTS(SELECT 1 FROM public.economy_release_settings WHERE id AND enabled) THEN
   RAISE EXCEPTION 'Public opening must remain a separate final step.';
 END IF;
END $verification$;
`;
const verified=sql.replace(/^BEGIN;\s*\n/,'BEGIN;\n'+before).replace(/COMMIT;\s*$/m,after+'\nCOMMIT;\n');
fs.writeFileSync(`${directory}/install-verified.sql`,verified);
fs.writeFileSync(`${directory}/installation-verification.json`,JSON.stringify({validatedSourceSha256:hash(sql),verifiedInstallSha256:hash(verified),schemaCopyPassed:true,enabled:false},null,2));
console.log('Installation vérifiée préparée : historique et soldes protégés, activation séparée.');
