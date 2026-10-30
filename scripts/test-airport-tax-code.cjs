const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync('supabase/fix_mellor_airport_tax_code_20261030.sql','utf8');
test('Mellor orphaned tax code is corrected once without changing staff rates or other airports',async()=>{
 const db=new PGlite();try{
  await db.exec("CREATE TABLE aeroports(code_oaci text PRIMARY KEY); CREATE TABLE taxes_aeroport(code_oaci text PRIMARY KEY,taxe_pourcent numeric,taxe_vfr_pourcent numeric); INSERT INTO aeroports VALUES('IMLR'),('IRFD'); INSERT INTO taxes_aeroport VALUES('ILMR',5,16),('IRFD',20,21)");
  await db.exec(sql);await db.exec(sql);
  assert.deepEqual((await db.query('SELECT * FROM taxes_aeroport ORDER BY code_oaci')).rows,[{code_oaci:'IMLR',taxe_pourcent:'5',taxe_vfr_pourcent:'16'},{code_oaci:'IRFD',taxe_pourcent:'20',taxe_vfr_pourcent:'21'}]);
 }finally{await db.close();}
});
test('conflicting or unknown airport codes never overwrite an existing staff tax configuration',async()=>{
 const db=new PGlite();try{
  await db.exec("CREATE TABLE aeroports(code_oaci text PRIMARY KEY); CREATE TABLE taxes_aeroport(code_oaci text PRIMARY KEY,taxe_pourcent numeric,taxe_vfr_pourcent numeric); INSERT INTO aeroports VALUES('IMLR'); INSERT INTO taxes_aeroport VALUES('ILMR',5,16),('IMLR',7,8)");
  const before=(await db.query('SELECT * FROM taxes_aeroport ORDER BY code_oaci')).rows;
  await assert.rejects(db.exec(sql),/staff reconciliation/);
  assert.deepEqual((await db.query('SELECT * FROM taxes_aeroport ORDER BY code_oaci')).rows,before);
  await db.exec("DELETE FROM taxes_aeroport WHERE code_oaci='IMLR'; DELETE FROM aeroports");
  await assert.rejects(db.exec(sql),/IMLR is absent/);
  assert.equal((await db.query("SELECT taxe_pourcent FROM taxes_aeroport WHERE code_oaci='ILMR'")).rows[0].taxe_pourcent,'5');
 }finally{await db.close();}
});
