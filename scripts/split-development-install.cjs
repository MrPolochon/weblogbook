// SQL Editor fallback: smaller transactions, public activation remains disabled.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const directory='tmp/development-release',source=fs.readFileSync(`${directory}/install-verified.sql`,'utf8');
const report=JSON.parse(fs.readFileSync(`${directory}/copy-validation.json`,'utf8'));
if(report.status!=='passed'||report.installSha256!==crypto.createHash('sha256').update(source).digest('hex'))throw Error('Current packet has not passed schema-copy validation.');
const marker=source.indexOf('-- Private catalogue seed.');
const verification=source.indexOf('DO $verification$');
if(marker<0||verification<marker)throw Error('Unexpected installation framing.');
const baseline=source.slice(verification,source.indexOf('COMMIT;',verification));
const migrations=source.slice(0,marker)+baseline+'\nCOMMIT;\n';
const seed=fs.readFileSync(`${directory}/seed.sql`,'utf8').split(/\r?\n/).filter(line=>line.startsWith('INSERT INTO public.company_'));
if(!seed.length)throw Error('Private catalogue packet missing.');
const groups=[];let group=[];let bytes=0;
for(const statement of seed){const size=Buffer.byteLength(statement);if(size>240000)throw Error('One seed statement exceeds editor-safe packet size.');if(bytes+size>240000&&group.length){groups.push(group);group=[];bytes=0;}group.push(statement);bytes+=size;}
if(group.length)groups.push(group);
const guard="DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.economy_release_settings WHERE id AND enabled) THEN RAISE EXCEPTION 'Suspend new engagements before updating the catalogues'; END IF; END $$;\n";
const blocks=[migrations,...groups.map((rows,i)=>`BEGIN;\nSET LOCAL statement_timeout='45s';\n${guard}${rows.join('\n')}\n${i===groups.length-1?"DO $$ BEGIN IF NOT coalesce((public.economy_release_readiness()->>'ready')::boolean,false) THEN RAISE EXCEPTION 'Installation incomplete'; END IF; END $$;\n":''}COMMIT;\n${i===groups.length-1?"SELECT public.economy_release_readiness() AS controle,(SELECT enabled FROM public.economy_release_settings WHERE id) AS ouverture_publique;\n":''}`)];
const output=path.join(directory,'sql-editor');fs.mkdirSync(output,{recursive:true});
for(const [index,sql]of blocks.entries())fs.writeFileSync(path.join(output,`${String(index+1).padStart(2,'0')}-installation.sql`),`-- Installation ${index+1}/${blocks.length}. Public activation stays disabled.\n${sql}`);
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({sourceSha256:report.installSha256,enabled:false,blocks:blocks.map((sql,index)=>({file:`${String(index+1).padStart(2,'0')}-installation.sql`,bytes:Buffer.byteLength(sql)}))},null,2));
console.log(JSON.stringify({directory:output,blocks:blocks.length,maximumBytes:Math.max(...blocks.map(sql=>Buffer.byteLength(sql)))}));
