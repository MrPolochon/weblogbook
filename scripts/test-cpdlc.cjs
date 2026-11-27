const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
function load(relative, cache = new Map()) {
  const filename = path.resolve(relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = new Module(filename); module.filename = filename; module.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename,module);
  const original = module.require.bind(module);
  module.require = id => id.startsWith('@/') ? load(`src/${id.slice(2)}.ts`,cache) : id.startsWith('.') ? load(path.resolve(path.dirname(filename),`${id}.ts`),cache) : original(id);
  module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
  return module.exports;
}
const policy = load('src/lib/cpdlc/policy.ts');
const station = (code, position, minutes, id=position) => ({ code,position,started_at:new Date(Date.now()-minutes*60000).toISOString(),session_id:id,user_id:id });
test('clearances follow role priority across TMA coverage; texts choose oldest covering controller',()=>{
  const tower=station('IRFD','Tower',10),center=station('IRFD','Center',20),delivery=station('IRFD','Delivery',1),approach=station('IRFD','APP',30);
  assert.equal(policy.routeStation([tower,center,delivery], 'IRFD',true),delivery);
  assert.equal(policy.routeStation([tower,center,delivery], 'IRFD',false),center);
  assert.equal(policy.routeStation([tower,approach], 'IBTH',true),approach);
  assert.equal(policy.routeStation([tower], 'IBTH',true),null);
  assert.equal(policy.routeStation([center], 'ITKO',true),null);
  assert.equal(policy.routeStation([approach,station('IBTH','Tower',1)], 'IBTH',true).code,'IBTH');
  const coveringApproach=station('IMLR','APP',1);
  assert.equal(policy.routeStation([center,coveringApproach], 'IRFD',true),coveringApproach);
  assert.equal(policy.routeStation([approach,coveringApproach], 'IRFD',true),approach);
  assert.equal(policy.routeStation([station('IRFD','Observer',100),tower], 'IRFD',true),tower);
  assert.equal(policy.coversAirport(center,'IGAR'),true);
  assert.equal(policy.coversAirport(approach,'IGAR'),true);
  assert.equal(policy.coversAirport(approach,'ILKL'),false);
});
test('manual init and clearance validation preserves exact squawk and uppercase accentless text',()=>{
  assert.equal(policy.displayText('Clairancé à départ'), 'CLAIRANCE A DEPART');
  const base={destination:'IRFD',departure:'expect vectors',altitude:'FL050',squawk:'0042',frequency:'118.925',text:'été'};
  assert.match(policy.clearanceText(base),/EXPECT VECTORS\.\nMNTN FL050/);
  assert.match(policy.clearanceText(base),/SQUAWK 0042\nETE$/);
  assert.match(policy.clearanceText({...base,departure:'direct MAKEL',altitude:'5000 FT'}),/DIRECT MAKEL\.\nMNTN 5000 FT/);
  assert.throws(()=>policy.clearanceText({...base,squawk:'8888'}));
  assert.throws(()=>policy.clearanceText({...base,frequency:'118.999'}));
  assert.throws(()=>policy.validateInit({flight_no:'DLH324',dep:'IRFD',dest:'ITKO',altn:'',ete:'0060',utc:'1200',date:'26/11/2026'}));
  assert.throws(()=>policy.validateInit({flight_no:'DLH324',dep:'IRFD',dest:'ITKO',altn:'',ete:'0130',utc:'1200',date:'31/02/2026'}));
});
const uid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
test('optional INIT fields stay optional but provided formats remain checked',()=>{
  const init={flight_no:'DLH324',dep:'IRFD',dest:'ITKO',altn:'',ete:'',utc:'',date:''};
  assert.deepEqual(policy.validateInit(init),init);
  assert.throws(()=>policy.validateInit({...init,utc:'2560'}));
  assert.throws(()=>policy.validateInit({...init,ete:'ABCD'}));
});
test('weather routes covered airports to ATC and uncovered airports to automatic source independently',async()=>{
  const service=load('src/lib/cpdlc/service.ts');
  const plan={id:uid(10),numero_vol:'DLH324',pilote_id:uid(1),copilote_id:null,statut:'depose'};
  const admin=fakeAdmin({plans_vol:[plan],atc_sessions:[{id:uid(20),user_id:uid(2),aeroport:'IRFD',position:'APP',started_at:new Date().toISOString()}]});
  const context=await service.contextFor(admin,uid(1),plan.id);
  await service.executeCommand(admin,context,{action:'weather',flight_no:'DLH324',airports:['IBTH','ITKO'],wx_type:'TAF',client_request_id:uid(310)});
  assert.equal(admin.calls.length,2);
  assert.equal(admin.calls[0].p_data.payload.request_type,'TAF');
  assert.deepEqual(admin.calls[0].p_data.recipient_user_ids,[uid(2)]);
  assert.match(admin.calls[1].p_data.body,/TAF NOT AVAILABLE/);
  assert.notEqual(admin.calls[0].p_data.client_request_id,admin.calls[1].p_data.client_request_id);
});
function fakeAdmin(tables, unavailable) {
  const calls=[];
  return { calls, rpc:async(name,args)=>{calls.push({name,...args});return {data:uid(999),error:null};}, from(table){
    let rows=[...(tables[table]??[])],single=false;
    const value=(row,key)=>key.includes('->>')?row[key.split('->>')[0]]?.[key.split('->>')[1]]:row[key];
    const query={select(){return query;},eq(key,want){rows=rows.filter(row=>value(row,key)===want);return query;},
      in(key,want){rows=rows.filter(row=>want.includes(value(row,key)));return query;},
      ilike(key,pattern){const re=new RegExp(`^${pattern.replace(/%/g,'.*')}$`,'i');rows=rows.filter(row=>re.test(row[key]));return query;},
      maybeSingle(){single=true;return query;},then(resolve,reject){return Promise.resolve({data:single?(rows[0]??null):rows,error:table===unavailable?{code:'42P01',message:'missing relation'}:null}).then(resolve,reject);}};
    return query;
  }};
}

test('registered aircraft callsigns with a hyphen can send clearances and receive free text',async()=>{
  const service=load('src/lib/cpdlc/service.ts');
  const plan={id:uid(10),numero_vol:'F-XZZA',pilote_id:uid(1),copilote_id:null,statut:'depose'};
  const other={...plan,id:uid(11),numero_vol:'DLH324',pilote_id:uid(3)};
  const admin=fakeAdmin({plans_vol:[plan,other]});
  const context=await service.contextFor(admin,uid(1),plan.id);
  await service.executeCommand(admin,context,{action:'clearance',init:{flight_no:'F-XZZA',dep:'IPPH',dest:'ILKL',altn:'IZOL',ete:'0015',utc:'0440',date:''},client_request_id:uid(320)});
  assert.equal(admin.calls[0].p_data.from_station,'F-XZZA');
  const otherContext=await service.contextFor(admin,uid(3),other.id);
  await service.executeCommand(admin,otherContext,{action:'free_text',flight_no:'DLH324',to:'F-XZZA',text:'TEST',client_request_id:uid(321)});
  assert.deepEqual(admin.calls[1].p_data.recipient_user_ids,[uid(1)]);
});
test('server context and commands enforce active crew, ATC role, manual identity, unique callsign and ACK',async()=>{
  const service=load('src/lib/cpdlc/service.ts');
  const plan={id:uid(10),numero_vol:'DLH324',pilote_id:uid(1),copilote_id:uid(4),statut:'depose'};
  const session={id:uid(20),user_id:uid(2),aeroport:'IRFD',position:'APP',started_at:new Date().toISOString()};
  const admin=fakeAdmin({plans_vol:[plan],atc_sessions:[session],profiles:[{id:uid(2),role:'pilote',atc:false}]});
  await assert.rejects(service.contextFor(admin,uid(3),uid(10)),/ACTIVE FLIGHT CREW/);
  await assert.rejects(service.contextFor(admin,uid(2)),/ATC ACCESS/);
  assert.equal((await service.contextFor(admin,uid(4),uid(10))).mode,'pilot');
  await assert.rejects(service.contextFor(fakeAdmin({plans_vol:[{...plan,statut:'cloture'}]}),uid(1),uid(10)),/ACTIVE FLIGHT CREW/);
  const context=await service.contextFor(admin,uid(1),uid(10));
  const init={flight_no:'DLH324',dep:'IBTH',dest:'ITKO',altn:'',ete:'0130',utc:'1200',date:'26/11/2026'};
  const command={action:'clearance',plan_id:plan.id,init,client_request_id:uid(300)};
  await assert.rejects(service.executeCommand(admin,context,{...command,init:{...init,flight_no:'ACA4553'}}),/DOES NOT MATCH/);
  await assert.rejects(service.executeCommand(admin,context,{...command,init:{...init,dep:''}}),/INVALID AIRPORT/);
  const start=Date.now();await service.executeCommand(admin,context,command);
  assert.deepEqual(admin.calls[0].p_data.recipient_user_ids,[uid(2)]);
  assert.ok(Date.parse(admin.calls[0].p_data.deadline_at)-start>=299900);
  const offline=fakeAdmin({plans_vol:[plan]});const offlineContext=await service.contextFor(offline,uid(1),plan.id);
  await service.executeCommand(offline,offlineContext,command);
  assert.equal(offline.calls[0].p_data.status,'STANDBY');
  assert.ok(Date.parse(offline.calls[0].p_data.deadline_at)-Date.now()<=30000);
  const duplicates=fakeAdmin({plans_vol:[plan,{...plan,id:uid(11),numero_vol:'DLH 324'}]});
  await assert.rejects(service.executeCommand(duplicates,context,command),/AMBIGUOUS STATION/);
  const parent={id:uid(301),plan_id:plan.id,recipient_plan_id:plan.id,sender_user_ids:[uid(2)],recipient_user_ids:[uid(1)],kind:'RESPONSE',payload:{sender_mode:'atc',recipient_mode:'pilot',response:'CLEAR'},assigned_session_id:null};
  const messages=fakeAdmin({cpdlc_messages:[parent]});
  await assert.rejects(service.executeCommand(messages,context,{action:'respond',message_id:parent.id,response:'WILCO',client_request_id:uid(302)}),/ACK MESSAGE FIRST/);
  const replyContext={...context,stations:[{session_id:uid(21),user_id:uid(2),code:'ITKO',position:'Tower',started_at:new Date().toISOString()},{session_id:uid(30),user_id:uid(3),code:'IRFD',position:'Tower',started_at:new Date().toISOString()}]};
  const replies=fakeAdmin({cpdlc_messages:[{...parent,from_station:'IRFD',payload:{...parent.payload,sender_session_id:uid(20),airport:'IRFD'}}],cpdlc_receipts:[{message_id:parent.id,user_id:uid(1)}]});
  await service.executeCommand(replies,replyContext,{action:'respond',message_id:parent.id,response:'WILCO',client_request_id:uid(303)});
  assert.deepEqual(replies.calls[0].p_data.recipient_user_ids,[uid(3)]);
  assert.equal(replies.calls[0].p_data.assigned_session_id,uid(30));
  await service.executeCommand(replies,{...replyContext,stations:[replyContext.stations[0]]},{action:'respond',message_id:parent.id,response:'UNABLE',client_request_id:uid(304)});
  assert.deepEqual(replies.calls[1].p_data.recipient_user_ids,[]);
  assert.equal(replies.calls[1].p_data.assigned_session_id,null);
  const missing=fakeAdmin({},'cpdlc_messages');
  await assert.rejects(service.executeCommand(missing,context,command),error=>error.status===503);
});

test('CPDLC database: authorization, ACK, atomic replies, expiry, late response and transfers',async t=>{
  const db=new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE plans_vol(id uuid PRIMARY KEY); CREATE TABLE atc_sessions(id uuid PRIMARY KEY,user_id uuid);
      INSERT INTO plans_vol VALUES('${uid(10)}'); INSERT INTO atc_sessions VALUES('${uid(20)}','${uid(2)}'),('${uid(30)}','${uid(3)}');`);
    const migration=fs.readFileSync('supabase/cpdlc_20261126.sql','utf8'); await db.exec(migration); await db.exec(migration);
    let request=0;
    const rpc=async(actor,action,data)=>(await db.query('SELECT cpdlc_apply($1,$2,$3) id',[actor,action,data])).rows[0].id;
    const send=(extra={})=>rpc(uid(1),'send',{client_request_id:uid(100+(++request)),sender_user_ids:[uid(1)],recipient_user_ids:[uid(2)],from_station:'DLH324',to_station:'IRFD',kind:'CLEARANCE',body:'CLEARANCE REQUEST',plan_id:uid(10),assigned_session_id:uid(20),deadline_at:new Date(Date.now()+300000).toISOString(),payload:{sender_mode:'pilot',recipient_mode:'atc',fallback_frequency:'118.925'},...extra});
    const read=async id=>(await db.query('SELECT * FROM cpdlc_messages WHERE id=$1',[id])).rows[0];
    await t.test('direct client access denied',async()=>{
      await db.exec('SET ROLE authenticated');
      await assert.rejects(db.query('SELECT * FROM cpdlc_messages'),/permission denied/);
      await assert.rejects(db.query('SELECT cpdlc_apply($1,$2,$3)',[uid(1),'send',{}]),/permission denied/);
      await assert.rejects(db.query('SELECT * FROM cpdlc_inbox($1,$2,NULL)',[uid(1),uid(10)]),/permission denied/);
      await db.exec('RESET ROLE');
    });
    await t.test('ACK requires recipient and leaves operational status unchanged',async()=>{
      const id=await send(); await assert.rejects(rpc(uid(3),'ack',{message_id:id}),/NOT A RECIPIENT/);
      await rpc(uid(2),'ack',{message_id:id}); await rpc(uid(2),'ack',{message_id:id});
      assert.equal((await read(id)).status,'SENT');
      assert.equal((await db.query('SELECT count(*)::integer n FROM cpdlc_receipts WHERE message_id=$1',[id])).rows[0].n,1);
    });
    await t.test('timeout occurs only after deadline and creates one notification',async()=>{
      const fresh=await send();await rpc(uid(1),'expire',{message_id:fresh});assert.equal((await read(fresh)).status,'SENT');
      const old=await send({deadline_at:new Date(Date.now()-31000).toISOString(),recipient_user_ids:[],assigned_session_id:null,status:'STANDBY'});
      await rpc(uid(1),'expire',{message_id:old});await rpc(uid(1),'expire',{message_id:old});
      const notifications=(await db.query('SELECT * FROM cpdlc_messages WHERE reply_to=$1',[old])).rows;
      assert.equal(notifications.length,1);assert.equal(notifications[0].body,'NO ANSWER - CONTACT 118.925');
      assert.equal((await read(old)).status,'TIMED_OUT');
    });
    await t.test('late clearance remains possible, retry idempotent, pilot response returns to ATC',async()=>{
      const id=await send({deadline_at:new Date(Date.now()-1000).toISOString()}); await rpc(uid(1),'expire',{message_id:id});
      const reply={message_id:id,client_request_id:uid(200),sender_user_ids:[uid(2)],recipient_user_ids:[uid(1)],from_station:'IRFD',to_station:'DLH324',kind:'RESPONSE',body:'CLD TO ITKO.',status:'CLEAR',plan_id:uid(10),payload:{response:'CLEAR',sender_mode:'atc',recipient_mode:'pilot'}};
      const rid=await rpc(uid(2),'reply',reply); assert.equal(await rpc(uid(2),'reply',reply),rid);
      assert.equal((await read(rid)).late,true);assert.equal((await read(rid)).assigned_session_id,null);
      await assert.rejects(rpc(uid(2),'reply',{...reply,client_request_id:uid(201)}),/ALREADY ANSWERED/);
      await rpc(uid(1),'ack',{message_id:rid});
      const responseId=await rpc(uid(1),'reply',{message_id:rid,client_request_id:uid(202),sender_user_ids:[uid(1)],recipient_user_ids:[uid(2)],from_station:'DLH324',to_station:'IRFD',kind:'RESPONSE',body:'UNABLE',status:'UNABLE',assigned_session_id:uid(20),plan_id:uid(10)});
      assert.equal((await read(rid)).status,'UNABLE');
      assert.equal((await db.query('SELECT count(*)::integer n FROM cpdlc_receipts WHERE message_id=$1',[responseId])).rows[0].n,0);
    });
    await t.test('clearance ACK, STANDBY and WILCO stay separate and produce new unread messages',async()=>{
      const id=await send();
      const rid=await rpc(uid(2),'reply',{message_id:id,client_request_id:uid(210),sender_user_ids:[uid(2)],recipient_user_ids:[uid(1)],from_station:'IRFD',to_station:'DLH324',kind:'RESPONSE',body:'CLD TO ITKO.',status:'CLEAR',plan_id:uid(10),payload:{response:'CLEAR',sender_mode:'atc',recipient_mode:'pilot'}});
      assert.equal((await read(rid)).late,false);
      await rpc(uid(1),'ack',{message_id:rid});assert.equal((await read(rid)).status,'CLEAR');
      const response={message_id:rid,sender_user_ids:[uid(1)],recipient_user_ids:[uid(2)],from_station:'DLH324',to_station:'IRFD',kind:'RESPONSE',assigned_session_id:uid(20),plan_id:uid(10)};
      const standby=await rpc(uid(1),'reply',{...response,client_request_id:uid(211),body:'STANDBY',status:'STANDBY'});
      assert.equal((await read(rid)).status,'STANDBY');assert.equal((await read(standby)).late,false);
      await rpc(uid(2),'ack',{message_id:standby});
      const wilco=await rpc(uid(1),'reply',{...response,client_request_id:uid(212),body:'WILCO',status:'WILCO'});
      assert.equal((await read(rid)).status,'WILCO');assert.equal((await read(wilco)).late,false);
      assert.equal((await db.query('SELECT count(*)::integer n FROM cpdlc_receipts WHERE message_id=$1',[wilco])).rows[0].n,0);
      await assert.rejects(rpc(uid(1),'reply',{...response,client_request_id:uid(213),body:'UNABLE',status:'UNABLE'}),/ALREADY ANSWERED/);
    });
    await t.test('offline and disconnected requests recover without stale assignment overwriting a transfer',async()=>{
      const offline=await send({recipient_user_ids:[],assigned_session_id:null,status:'STANDBY',deadline_at:new Date(Date.now()-31000).toISOString()});
      await rpc(uid(1),'expire',{message_id:offline});
      await rpc(uid(3),'assign',{message_id:offline,expected_session_id:null,target_user_id:uid(3),target_session_id:uid(30)});
      assert.equal((await read(offline)).status,'TIMED_OUT');assert.deepEqual((await read(offline)).recipient_user_ids,[uid(3)]);
      const id=await send();await db.query('DELETE FROM atc_sessions WHERE id=$1',[uid(20)]);
      await assert.rejects(rpc(uid(2),'ack',{message_id:id}),/ATC SESSION CHANGED/);
      await rpc(uid(3),'assign',{message_id:id,expected_session_id:uid(20),target_user_id:uid(3),target_session_id:uid(30)});
      await db.query('INSERT INTO atc_sessions VALUES($1,$2)',[uid(20),uid(2)]);
      await rpc(uid(2),'assign',{message_id:id,expected_session_id:uid(20),target_user_id:uid(2),target_session_id:uid(20)});
      assert.equal((await read(id)).assigned_session_id,uid(30));
      await assert.rejects(rpc(uid(2),'ack',{message_id:id}),/NOT A RECIPIENT/);
      const response=await send({kind:'RESPONSE',status:'UNABLE',body:'UNABLE',recipient_user_ids:[],assigned_session_id:null,deadline_at:null});
      await rpc(uid(3),'assign',{message_id:response,expected_session_id:null,target_user_id:uid(3),target_session_id:uid(30)});
      assert.deepEqual((await read(response)).recipient_user_ids,[uid(3)]);
      await rpc(uid(3),'ack',{message_id:response});
      await rpc(uid(2),'assign',{message_id:response,expected_session_id:uid(30),target_user_id:uid(2),target_session_id:uid(20)});
      assert.deepEqual((await read(response)).recipient_user_ids,[uid(3)]);
    });
    await t.test('transfer removes old controller authority and duplicate cannot reset ACK',async()=>{
      const id=await send();const data={message_id:id,client_request_id:uid(250),target_user_id:uid(3),target_session_id:uid(30)};
      await rpc(uid(2),'transfer',data);await rpc(uid(3),'ack',{message_id:id});await rpc(uid(2),'transfer',data);
      assert.deepEqual((await read(id)).recipient_user_ids,[uid(3)]);
      assert.equal((await db.query('SELECT count(*)::integer n FROM cpdlc_receipts WHERE message_id=$1',[id])).rows[0].n,1);
      await assert.rejects(rpc(uid(2),'ack',{message_id:id}),/NOT A RECIPIENT/);
    });
    await t.test('unread messages survive 500 newer rows and ATC inbox is scoped before history limit',async()=>{
      const oldest=await send();
      await db.query("UPDATE cpdlc_messages SET created_at=now()-interval '2 days' WHERE id=$1",[oldest]);
      await db.query(`INSERT INTO cpdlc_messages(sender_user_id,sender_user_ids,recipient_user_ids,from_station,to_station,kind,body,plan_id,assigned_session_id,payload,client_request_id)
        SELECT $1,ARRAY[$1::uuid],ARRAY[$2::uuid],'DLH324','IRFD','FREE_TEXT','HISTORY',$3,$4,'{"recipient_mode":"atc"}', 'history:'||n FROM generate_series(1,510) n`,[uid(1),uid(2),uid(10),uid(20)]);
      await db.query("INSERT INTO cpdlc_receipts(message_id,user_id) SELECT id,$1 FROM cpdlc_messages WHERE client_request_id LIKE 'history:%'",[uid(2)]);
      let inbox=(await db.query('SELECT * FROM cpdlc_inbox($1,NULL,$2)',[uid(2),uid(20)])).rows;
      assert.ok(inbox.length>500);assert.ok(inbox.some(row=>row.id===oldest));
      await rpc(uid(2),'ack',{message_id:oldest});
      inbox=(await db.query('SELECT * FROM cpdlc_inbox($1,NULL,$2)',[uid(2),uid(20)])).rows;
      assert.equal(inbox.some(row=>row.id===oldest),false);
      await db.query('DELETE FROM atc_sessions WHERE id=$1',[uid(20)]);
      await db.query('INSERT INTO atc_sessions VALUES($1,$2)',[uid(21),uid(2)]);
      assert.equal((await db.query('SELECT * FROM cpdlc_inbox($1,NULL,$2)',[uid(2),uid(21)])).rows.length,0);
      assert.equal((await db.query('SELECT * FROM cpdlc_inbox($1,NULL,$2)',[uid(2),uid(20)])).rows.length,0);
    });
  } finally { await db.close(); }
});
