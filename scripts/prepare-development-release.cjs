// Local packet only. Never connects to a database or reads private card outcomes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'tmp','development-release');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const files=['supabase/company_development_20261030.sql','supabase/flight_reviews_20261030.sql','supabase/flight_economy_20261030.sql','supabase/development_maintenance_20261030.sql','supabase/development_release_20261030.sql'];
const sources=['output/catalogue-360-recherches-panels-buffs-2026-10-28.json','output/catalogue-900-cartes-RSE-2026-10-28.json','output/catalogue-2000-aleas-mensuels-2026-10-28.json'];
fs.mkdirSync(directory,{recursive:true});
const sourceHashes=[...sources,'src/lib/company-development/catalog.ts'].map(file=>({file,sha256:hash(fs.readFileSync(path.join(root,file)))}));
const cacheFile=path.join(directory,'catalogues.json'),metaFile=path.join(directory,'catalogues-source.json');
let catalog;
if(fs.existsSync(cacheFile)&&fs.existsSync(metaFile)&&JSON.stringify(sourceHashes)===fs.readFileSync(metaFile,'utf8').trim())catalog=JSON.parse(fs.readFileSync(cacheFile,'utf8'));
else{
 const module={exports:{}};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/company-development/catalog.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,module,module.exports);
 catalog=module.exports.compileDevelopmentCatalog(...sources.map(file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'))));
 fs.writeFileSync(cacheFile,JSON.stringify(catalog));fs.writeFileSync(metaFile,JSON.stringify(sourceHashes));
}
if(catalog.research.length!==360||catalog.cards.length!==900||catalog.events.length!==2000)throw Error('Incomplete catalogues');
const seedHash=hash(JSON.stringify(catalog)),literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
let seed=`-- Private catalogue seed. Keep this file local. No precomputed card outcomes.\nDO $$ BEGIN IF EXISTS(SELECT 1 FROM public.economy_release_settings WHERE id AND enabled) THEN RAISE EXCEPTION 'Suspend new engagements before changing the master catalogues'; END IF; END $$;\n`;
for(const [key,table]of [['research','company_research_catalog'],['cards','company_rse_catalog'],['events','company_event_catalog']]){
 const rows=catalog[key],columns=Object.keys(rows[0]);
 if(rows.some(row=>JSON.stringify(Object.keys(row))!==JSON.stringify(columns)))throw Error('Inconsistent seed columns');
 for(let i=0;i<rows.length;i+=100)seed+=`INSERT INTO public.${table}(${columns.join(',')}) SELECT ${columns.join(',')} FROM jsonb_populate_recordset(NULL::public.${table},${literal(rows.slice(i,i+100))}) ON CONFLICT(id) DO UPDATE SET ${columns.filter(c=>c!=='id').map(c=>`${c}=excluded.${c}`).join(',')};\n`;
}
seed+=`INSERT INTO public.company_development_catalog_manifest(id,seed_sha256) VALUES(true,'${seedHash}') ON CONFLICT(id) DO UPDATE SET seed_sha256=excluded.seed_sha256,imported_at=now();\n`;
fs.writeFileSync(path.join(directory,'seed.sql'),seed);
const migrations=files.map(file=>{const source=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');return{file,source,sha256:hash(source)};});
const migrationSql=migrations.map(item=>`\n-- ${item.file}\n${item.source.replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,'')}`).join('\n');
fs.writeFileSync(path.join(directory,'migrations.sql'),`BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='45s';\n${migrationSql}\nCOMMIT;\n`);
fs.writeFileSync(path.join(directory,'install.sql'),`BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='45s';\n${migrationSql}\n${seed}\nDO $$ BEGIN IF NOT coalesce((public.economy_release_readiness()->>'ready')::boolean,false) THEN RAISE EXCEPTION 'Release preparation incomplete'; END IF; END $$;\nCOMMIT;\n`);
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({preparedAt:new Date().toISOString(),status:'prepared_not_installed',enabled:false,migrations:migrations.map(({file,sha256})=>({file,sha256})),sources:sourceHashes,seedSha256:seedHash,installSha256:hash(fs.readFileSync(path.join(directory,'install.sql')))},null,2));
console.log('Dossier local de mise en service préparé, activation désactivée.');
