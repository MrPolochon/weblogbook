const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync('supabase/market_prices_20261023.sql','utf8');const rollback=fs.readFileSync('supabase/rollback_market_prices_20261023.sql','utf8');
const rows=[...sql.matchAll(/\('([a-f0-9-]+)'::uuid,'([^']+)',(\d+),(\d+)\)/g)].map(m=>({id:m[1],nom:m[2],old:Number(m[3]),next:Number(m[4])}));
const load=()=>{const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/lib/compagnie-utils.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(require,m,m.exports);return m.exports};
test('hub maintenance charges actual damage and caps reconstruction at 15%',()=>{const {calculerCoutReparationHub:cost}=load();assert.equal(cost(1500000,98),4500);assert.equal(cost(1500000,90),22500);assert.equal(cost(1500000,50),112500);assert.equal(cost(1500000,0),225000);assert.equal(cost(1500000,100),0);assert.equal(cost(1500000,-20),225000);assert.equal(cost(1500000,120),0);assert.equal(cost(0,50),0);assert.throws(()=>cost(NaN,50));assert.throws(()=>cost(100,NaN));assert.throws(()=>cost(-100,50));});
test('price migration is atomic, repeatable, preserves excluded aircraft and can be rolled back',async()=>{const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE TABLE types_avion(id uuid PRIMARY KEY,nom text,prix integer,est_militaire boolean);`);
 for(const r of rows)await db.query('INSERT INTO types_avion VALUES($1,$2,$3,false)',[r.id,r.nom,r.old]);
 await db.exec("INSERT INTO types_avion VALUES('00000000-0000-4000-8000-000000000001','Piper hors vente',0,false),('00000000-0000-4000-8000-000000000002','Avion militaire',200000000,true)");
 const first=rows[0];await db.query('UPDATE types_avion SET prix=prix+1 WHERE id=$1',[first.id]);
 await assert.rejects(()=>db.exec(sql),/Catalogue modifié/);await db.exec('ROLLBACK');
 assert.equal((await db.query('SELECT prix FROM types_avion WHERE id=$1',[rows[1].id])).rows[0].prix,rows[1].old);
 await db.query('UPDATE types_avion SET prix=$2 WHERE id=$1',[first.id,first.old]);await db.exec(sql);await db.exec(sql);
 assert.equal((await db.query('SELECT count(*)::int n FROM market_price_adjustments_audit')).rows[0].n,57);
 for(const r of rows)assert.equal((await db.query('SELECT prix FROM types_avion WHERE id=$1',[r.id])).rows[0].prix,r.next);
 assert.equal((await db.query("SELECT prix FROM types_avion WHERE nom='Avion militaire'")).rows[0].prix,200000000);assert.equal((await db.query("SELECT prix FROM types_avion WHERE nom='Piper hors vente'")).rows[0].prix,0);
 await db.query('UPDATE types_avion SET prix=prix+1 WHERE id=$1',[first.id]);await assert.rejects(()=>db.exec(rollback),/retour arrière annulé/);await db.exec('ROLLBACK');assert.equal((await db.query('SELECT prix FROM types_avion WHERE id=$1',[rows[1].id])).rows[0].prix,rows[1].next);
 await db.query('UPDATE types_avion SET prix=$2 WHERE id=$1',[first.id,first.next]);await db.exec(rollback);for(const r of rows)assert.equal((await db.query('SELECT prix FROM types_avion WHERE id=$1',[r.id])).rows[0].prix,r.old);
}finally{await db.close()}});
