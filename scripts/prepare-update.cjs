// Build a local migration packet only. Never connects, deploys, commits or pushes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'output','preparation-mise-a-jour-2026-10-29');
const files=[
  'supabase/logbook_registration_20261029.sql',
  'supabase/logbook_staff_validation_20261029.sql',
  'supabase/flight_submission_integrity_20261029.sql',
  'supabase/flight_plan_access_20261029.sql',
  'supabase/fix_revente_avions_personnels.sql',
];
const migrations=files.map(file=>{
  const source=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
  if((source.match(/^BEGIN;\s*$/gm)||[]).length!==1||(source.match(/^COMMIT;\s*$/gm)||[]).length!==1)throw Error('Unexpected transaction framing: '+file);
  return {file,source,sha256:crypto.createHash('sha256').update(source).digest('hex')};
});
fs.mkdirSync(out,{recursive:true});
const sql='-- LOCAL PREPARATION ONLY. Apply on a test copy before production.\n-- All migrations share one transaction: any failure rolls back the bundle.\nBEGIN;\n'+migrations.map(m=>`\n-- Source: ${m.file}\n-- SHA-256: ${m.sha256}\n${m.source.replace(/^BEGIN;[ \t]*\r?\n/m,'').replace(/^COMMIT;[ \t]*\r?$/m,'')}`).join('\n')+'\nCOMMIT;\n';
fs.writeFileSync(path.join(out,'migrations.sql'),sql);
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({generatedAt:new Date().toISOString(),status:'prepared_locally_not_deployed',productionEnabled:false,novemberEconomyEnabled:false,migrations:migrations.map(({file,sha256})=>({file,sha256})),bundleSha256:crypto.createHash('sha256').update(sql).digest('hex'),requiredChecks:['application tests','TypeScript','ESLint','production compilation with fictitious database','read-only schema preflight on target','test-copy migration and connected flight/ATC/copilot/logbook smoke checks','backup before production change']},null,2)+'\n');
console.log('Dossier préparé : '+path.relative(root,out));
