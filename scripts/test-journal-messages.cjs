const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
test('new journal publications notify all members once, with readable link, and roll back together on failure',async()=>{const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user_id',true),'')::uuid $$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,identifiant text,role text);
 INSERT INTO profiles VALUES('${id(1)}','admin','admin'),('${id(2)}','pilote','pilote'),('${id(3)}','controleur','atc'),('${id(4)}','secours','siavi');
 CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),expediteur_id uuid,destinataire_id uuid REFERENCES profiles(id),titre text CHECK(char_length(titre)<=200),contenu text,type_message text CHECK(type_message IN ('normal','broadcast')),lu boolean,metadata jsonb);
 `);
 await db.exec(fs.readFileSync('supabase/tribunal_bulletins_20261006.sql','utf8'));
 await db.exec("INSERT INTO tribunal_bulletins(title,category,content,author_name) VALUES('Ancien bulletin','Information','Publication antérieure à la nouvelle fonction.','Administration')");
 const migration=fs.readFileSync('supabase/tribunal_bulletin_messages_20261023.sql','utf8');await db.exec(migration);
 assert.equal((await db.query('SELECT count(*)::int n FROM messages')).rows[0].n,0);
 await db.exec('SET ROLE anon');await assert.rejects(()=>db.query("SELECT publish_tribunal_bulletin('Interdit','Loi','Publication interdite anonyme')"),/permission denied/);await db.exec('RESET ROLE');
 await db.query("SELECT set_config('test.user_id',$1,false)",[id(2)]);await db.exec('SET ROLE authenticated');await assert.rejects(()=>db.query("SELECT publish_tribunal_bulletin('Interdit','Loi','Publication interdite au pilote')"),/administrateurs/);await db.exec('RESET ROLE');
 await db.query("SELECT set_config('test.user_id',$1,false)",[id(1)]);await db.exec('SET ROLE authenticated');
 const publish=async(title='Nouveau bulletin')=>(await db.query('SELECT publish_tribunal_bulletin($1,$2,$3) id',[title,'Information','Texte officiel. '.repeat(60)])).rows[0].id;
 const bulletin=await publish();await db.exec('RESET ROLE');
 const messages=(await db.query('SELECT * FROM messages ORDER BY destinataire_id')).rows;
 assert.equal(messages.length,4);assert.deepEqual(messages.map(m=>m.destinataire_id),[1,2,3,4].map(id));
 for(const m of messages){assert.equal(m.lu,false);assert.equal(m.type_message,'broadcast');assert.equal(m.metadata.bulletin_id,bulletin);assert.equal(m.metadata.broadcast_audience,'all');assert(m.contenu.includes('Nouveau bulletin'));assert(m.contenu.includes('Catégorie : Information'));assert(m.contenu.includes('https://www.mixouairlinesptfsweblogbook.com/journal/'+bulletin));assert(m.contenu.includes('…'));}
 await db.query("UPDATE tribunal_bulletins SET title='Rectification administrative' WHERE id=$1",[bulletin]);await db.exec(migration);assert.equal((await db.query('SELECT count(*)::int n FROM messages')).rows[0].n,4);
 await assert.rejects(()=>db.query('INSERT INTO messages(destinataire_id,metadata) VALUES($1,$2)',[id(1),messages[0].metadata]),/duplicate key/);
 await db.exec(`CREATE FUNCTION fail_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.destinataire_id='${id(3)}' THEN RAISE EXCEPTION 'messagerie indisponible'; END IF;RETURN NEW;END $$;CREATE TRIGGER fail_message BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION fail_message();`);
 await assert.rejects(()=>publish('Publication annulée'),/messagerie indisponible/);assert.equal((await db.query('SELECT count(*)::int n FROM messages')).rows[0].n,4);assert.equal((await db.query('SELECT count(*)::int n FROM tribunal_bulletins')).rows[0].n,2);
 await db.exec('DROP TRIGGER fail_message ON messages');await publish('Autre bulletin');assert.equal((await db.query('SELECT count(*)::int n FROM messages')).rows[0].n,8);
}finally{await db.close()}});
