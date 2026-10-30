// Builds an additive patch only after the identical migrations passed the schema copy.
// No catalogue seeds, activation changes or connection to an external database.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'tmp','company-economy-patch');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const report=JSON.parse(fs.readFileSync(path.join(root,'tmp/itineraries-real-schema-validation.json'),'utf8'));
const names=['company_research_limit','company_itineraries','company_economy_corrections','company_flight_ground_cleanup','company_flight_review_batches'];
const migrations=names.map(name=>{
 const file=`supabase/${name}_20261030.sql`,source=fs.readFileSync(path.join(root,file),'utf8'),sha256=hash(source);
 if(report.status!=='passed'||!report.newMigrations?.some(item=>item.file===file&&item.sha256===sha256))throw Error(`Schema-copy validation missing or stale: ${file}`);
 return{file,source,sha256};
});
const tables=['profiles','compagnies','compagnie_avions','plans_vol','vols','felitz_comptes','felitz_transactions','flight_submission_quotes','flight_economy_settlements','flight_reviews','company_research_projects','company_rse_hands','company_rse_commitments','company_development_cycles','company_service_settings','company_global_events','ground_service_requests'];
const projection=tables.map(table=>`SELECT '${table}'::text table_name,count(*)::bigint row_count,md5(coalesce(jsonb_agg(r ORDER BY r::text)::text,'[]')) row_hash FROM (SELECT ${table==='plans_vol'?"to_jsonb(t)-'company_itinerary_id'-'company_itinerary_leg_id'-'review_generated_count'-'review_generated_at'":table==='flight_reviews'?"to_jsonb(t)-'review_sequence'":'to_jsonb(t)'} r FROM public.${table} t) observed`).join('\nUNION ALL\n');
const checks=[['research_limit','company_development_guard_research_limit','company_research_projects','company_research_concurrency_limit'],['itineraries','sync_company_itinerary_leg','plans_vol','sync_company_itinerary_leg'],['ground_cleanup','cleanup_ground_requests_after_flight','plans_vol','cleanup_ground_requests_after_flight'],['ferry_restrictions','guard_new_ferry_development_restrictions','vols_ferry','guard_new_ferry_development_restrictions'],['review_batches','guard_flight_review_batch_marker','plans_vol','guard_flight_review_batch_marker']];
const guard=checks.map(([key,fn,table,trigger])=>`'${key}',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.${table}'::regclass AND tgname='${trigger}' AND tgenabled<>'D') AND to_regprocedure('public.${fn}()') IS NOT NULL`).join(',\n');
const sql=`-- Additive economy patch. All original business rows and public opening state are verified unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
LOCK TABLE ${tables.map(table=>'public.'+table).join(',')} IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE company_economy_patch_baseline(table_name text PRIMARY KEY,row_count bigint,row_hash text) ON COMMIT DROP;
ALTER TABLE company_economy_patch_baseline ENABLE ROW LEVEL SECURITY;
INSERT INTO company_economy_patch_baseline ${projection};
CREATE TEMP TABLE company_economy_patch_activation ON COMMIT DROP AS SELECT * FROM public.economy_release_settings;
ALTER TABLE company_economy_patch_activation ENABLE ROW LEVEL SECURITY;
${migrations.map(m=>`\n-- ${m.file} (${m.sha256})\n${m.source.replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,'')}`).join('\n')}
DO $verification$
DECLARE changed text; controls jsonb;
BEGIN
 SELECT string_agg(table_name,', ') INTO changed FROM (SELECT * FROM company_economy_patch_baseline EXCEPT SELECT * FROM (${projection}) current_data) differences;
 IF changed IS NOT NULL THEN RAISE EXCEPTION 'Patch cancelled: existing data changed in %',changed; END IF;
 IF EXISTS(SELECT * FROM company_economy_patch_activation EXCEPT SELECT * FROM public.economy_release_settings) THEN RAISE EXCEPTION 'Patch cancelled: public opening state changed'; END IF;
 SELECT jsonb_build_object(${guard}) INTO controls;
 IF EXISTS(SELECT 1 FROM jsonb_each(controls) WHERE value<>'true'::jsonb) THEN RAISE EXCEPTION 'Patch incomplete: %',controls; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('company_itineraries','company_itinerary_legs','company_itinerary_account_deletions') AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'Itinerary tables must retain RLS'; END IF;
END $verification$;
NOTIFY pgrst,'reload schema';
SELECT jsonb_build_object(${guard},'existing_data_preserved',true,'public_opening_unchanged',true) AS patch_verification;
COMMIT;
`;
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'install-verified.sql'),sql);
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({status:'validated_not_installed',preparedAt:new Date().toISOString(),copyPassed:true,migrations:migrations.map(({file,sha256})=>({file,sha256})),installSha256:hash(sql)},null,2));
console.log(`Additive patch prepared (${Buffer.byteLength(sql)} bytes). No catalogue or activation change.`);
