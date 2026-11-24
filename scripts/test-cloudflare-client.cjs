const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function client() {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/lib/cloudflare/client.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('module','exports',code)(module,module.exports);
  return module.exports;
}
async function harness(run, canPublish=true) {
  const keys = ['AudioContext','WebSocket','RTCPeerConnection','navigator','MediaStream'];
  const originals = Object.fromEntries(keys.map(key => [key,Object.getOwnPropertyDescriptor(global,key)]));
  const calls = [], pcs = [], contexts = [];
  let captures = 0, captureResolver, delayedCapture = false, muteDuringReplace;
  let delaySubscriber = false, nextMid = 0, subscriberAnswers = 0, incompleteIce = false, relayCandidate = true;
  const mic = { enabled: true, kind:'audio', stopped:false, stop() { this.stopped=true; } };
  global.MediaStream = class { constructor(tracks) { this.tracks=tracks; } };
  global.AudioContext = class {
    state = 'running';
    constructor() { contexts.push(this); }
    async resume() {}
    async close() { this.state = 'closed'; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { disconnect() {}, getFloatTimeDomainData(data) { data.fill(0); } }; }
    createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{ kind:'audio', enabled:true, silence:true, stop() {} }] } }; }
  };
  class Socket extends EventTarget {
    static OPEN = 1;
    readyState = 0;
    constructor(url, protocols) { super(); this.protocols=protocols; queueMicrotask(()=>{ this.readyState=1; this.dispatchEvent(new Event('open')); }); }
    send(data) {
      const request = JSON.parse(data); calls.push(request);
      let result = {};
      if(request.action === 'hello') result={id:'local',canPublish,iceServers:[{urls:'stun:stun.cloudflare.com:3478'},
        {urls:['turn:turn.cloudflare.com:3478?transport=udp','turn:turn.cloudflare.com:53?transport=udp','turns:turn.cloudflare.com:443?transport=tcp'],username:'test',credential:'test'},
        {urls:'turn:turn.cloudflare.com:53?transport=tcp',username:'test',credential:'test'}],peers:[]};
      if(request.action === 'publish') result={sessionDescription:{type:'answer',sdp:'audio answer'}};
      if(request.action === 'subscribe') {
        const receiver = pcs.find(pc => pc !== pcs[0] || !canPublish);
        if (subscriberAnswers && receiver.connectionState !== 'connected') {
          queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:request.id,error:'Subscriber transport not ready'})}));
          return;
        }
        result={sessionDescription:{type:'offer',sdp:'audio offer'},tracks:request.payload.peers.map(peerId=>({peerId,mid:String(nextMid++)}))};
      }
      if(request.action === 'answer') subscriberAnswers++;
      queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:request.id,result})}));
    }
    peers(peers) { this.onmessage?.({data:JSON.stringify({event:'peers',peers})}); }
    close() { this.readyState=3; }
  }
  global.WebSocket=Socket;
  global.RTCPeerConnection=class extends EventTarget {
    connectionState='new'; iceGatheringState='complete'; localDescription=null; remoteDescription=null;
    sender={track:null,replaceTrack:async track=>{ this.sender.track=track; if(muteDuringReplace) { const fn=muteDuringReplace; muteDuringReplace=null; fn(); } }};
    constructor(configuration) { super(); this.configuration=configuration; if(pcs.length===1) pcs.unshift(this); else pcs.push(this); }
    addTransceiver(track) { this.sender.track=track; return {sender:this.sender,mid:'0'}; }
    async createOffer() { return {type:'offer',sdp:'m=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=fmtp:111 minptime=10;useinbandfec=1\r\n'}; }
    async createAnswer() { return {type:'answer',sdp:'audio answer'}; }
    getTransceivers() { return this.transceivers || []; }
    async setLocalDescription(sdp) {
      this.localDescription=sdp;
      if(incompleteIce) {
        this.iceGatheringState='gathering';
        this.localDescription={...sdp,sdp:sdp.sdp+'\r\na=candidate:1 1 udp 100 192.0.2.1 5000 typ host\r\n'+
          (relayCandidate?'a=candidate:2 1 udp 90 192.0.2.2 5001 typ relay raddr 192.0.2.1 rport 5000\r\n':'')};
      }
    }
    async setRemoteDescription(sdp) { this.remoteDescription=sdp; this.connectionState=sdp.type==='offer' && delaySubscriber ? 'connecting' : 'connected'; }
    close() { this.connectionState='closed'; }
  };
  Object.defineProperty(global,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>{
    captures++; if(delayedCapture) await new Promise(resolve=>{captureResolver=resolve;});
    return {getAudioTracks:()=>[mic],getTracks:()=>[mic]};
  }}}});
  const {Room,LocalAudioTrack}=client();
  const room=new Room();
  try { await run({room,LocalAudioTrack,pcs,calls,mic,contexts,captures:()=>captures,
    delayCapture(){delayedCapture=true;},resolveCapture(){captureResolver();},onReplace(fn){muteDuringReplace=fn;},
    delaySubscriber(){delaySubscriber=true;},
    connectSubscriber(){delaySubscriber=false;const pc=pcs[canPublish?1:0];pc.connectionState='connected';pc.dispatchEvent(new Event('connectionstatechange'));},
    resetMids(){nextMid=0;},slowIce(relay=true){incompleteIce=true;relayCandidate=relay;}}); }
  finally { await room.disconnect(); for(const key of keys) { if(originals[key]) Object.defineProperty(global,key,originals[key]);else delete global[key]; } }
}
test('connect publishes silence without acquiring the microphone, and exchanges complete SDP', async () => harness(async h=>{
  await h.room.connect('wss://radio.test/connect','ticket');
  assert.equal(h.captures(),0);
  assert.equal(h.pcs[0].sender.track.silence,true);
  assert.deepEqual(h.calls.map(c=>c.action),['hello','publish','published']);
  assert.match(h.calls[1].payload.sessionDescription.sdp,/usedtx=1/);
  assert.equal(h.room.state,'connected');
}));
test('desktop capture is disabled before publication and mute takes effect synchronously',async()=>harness(async h=>{
  await h.room.connect('wss://radio.test/connect','ticket');
  await h.room.prepareMicrophone();
  assert.equal(h.pcs[0].sender.track,h.mic);
  assert.equal(h.mic.enabled,false);
  const publication=h.room.localParticipant.getTrackPublication('microphone');
  const opening=publication.unmute();
  assert.equal(h.mic.enabled,true);
  const closing=publication.mute();
  assert.equal(h.mic.enabled,false);
  await Promise.all([opening,closing]);
}));
test('late microphone permission after disconnect cannot publish or reactivate audio',async()=>harness(async h=>{
  await h.room.connect('wss://radio.test/connect','ticket');
  h.delayCapture();
  const preparing=h.room.prepareMicrophone();
  await h.room.disconnect();
  h.resolveCapture();
  await assert.rejects(preparing,/annulée/);
  assert.equal(h.mic.stopped,true);
  assert.notEqual(h.pcs[0].sender.track,h.mic);
}));
test('mute during an asynchronous track replacement wins over an earlier unmute',async()=>harness(async h=>{
  await h.room.connect('wss://radio.test/connect','ticket');
  h.onReplace(()=>{void h.room.localParticipant.setMicrophoneEnabled(false);});
  await h.room.localParticipant.setMicrophoneEnabled(true);
  assert.equal(h.mic.enabled,false);
}));
test('subscriber offer/answer is serialized when membership changes during negotiation',async()=>harness(async h=>{
  await h.room.connect('wss://radio.test/connect','ticket');
  h.room.ws.peers([{id:'a',name:'ATC',published:true}]);
  h.room.ws.peers([{id:'a',name:'ATC',published:true},{id:'b',name:'Pilot',published:true}]);
  await h.room.reconcileQueue;
  assert.equal(h.room.remoteParticipants.size,2);
  const actions=h.calls.filter(c=>['subscribe','answer','unsubscribe'].includes(c.action)).map(c=>c.action);
  for(let i=0;i<actions.length;i+=2) assert.deepEqual(actions.slice(i,i+2),['subscribe','answer']);
  h.room.ws.peers([]);
  await h.room.reconcileQueue;
  assert.equal(h.room.remoteParticipants.size,0);
  assert.equal(h.calls.at(-1).action,'unsubscribe');
}));
test('transport failure immediately disables the native mic and closes both peer connections',async()=>harness(async h=>{
  await h.room.connect('wss://radio.test/connect','ticket');
  await h.room.localParticipant.setMicrophoneEnabled(true);
  h.pcs[0].connectionState='failed';h.pcs[0].onconnectionstatechange();
  assert.equal(h.mic.enabled,false);
  assert.equal(h.room.state,'disconnected');
  assert.ok(h.pcs.every(pc=>pc.connectionState==='closed'));
}));
test('a reused receiver attaches the new peer even when the browser emits no second ontrack',async()=>harness(async h=>{
  await h.room.connect('wss://radio.test/connect','ticket');
  const received=[];
  h.room.on('track',track=>received.push(track.sid));
  h.pcs[1].transceivers=[{mid:'0',receiver:{track:{kind:'audio'}}}];
  h.room.ws.peers([{id:'first',name:'First',published:true}]);
  await h.room.reconcileQueue;
  h.room.ws.peers([]);
  await h.room.reconcileQueue;
  h.resetMids();
  h.room.ws.peers([{id:'next',name:'Next',published:true}]);
  await h.room.reconcileQueue;
  assert.deepEqual(received,['first','next']);
}));

test('OBS joins and subscribes without publisher or hardware capture, even if client requests transmission',async()=>harness(async h=>{
  await h.room.connect('wss://radio.test/connect','ticket',{canPublish:true});
  assert.equal(h.room.canPublish,false);
  assert.deepEqual(h.calls.map(c=>c.action),['hello']);
  assert.equal(h.pcs.length,1);
  await assert.rejects(h.room.prepareMicrophone(),/OBS/);
  await assert.rejects(h.room.localParticipant.publishTrack(new h.LocalAudioTrack(h.mic)),/OBS/);
  assert.equal(h.captures(),0);
  h.room.ws.peers([{id:'atc',name:'ATC',published:true}]);
  await h.room.reconcileQueue;
  assert.ok(h.calls.some(c=>c.action==='subscribe'));
},false));

test('browser ICE excludes blocked TURN port 53 and preserves UDP and TLS relays',async()=>harness(async h=>{
  await h.room.connect('wss://radio.test/connect','ticket');
  for (const pc of h.pcs) {
    const urls=pc.configuration.iceServers.flatMap(server=>server.urls);
    assert.ok(!urls.some(url=>/:53(?:\?|$)/.test(url)));
    assert.ok(urls.includes('turn:turn.cloudflare.com:3478?transport=udp'));
    assert.ok(urls.includes('turns:turn.cloudflare.com:443?transport=tcp'));
    assert.equal(pc.configuration.bundlePolicy,'max-bundle');
  }
}));

test('third participant waits for the first receiving transport instead of disconnecting the radio',async()=>harness(async h=>{
  await h.room.connect('wss://radio.test/connect','ticket');
  h.delaySubscriber();
  const first={id:'first',name:'First',published:true};
  h.room.ws.peers([first]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(h.calls.some(call=>call.action==='answer'));
  h.room.ws.peers([first,{id:'third',name:'Third',published:true}]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.calls.filter(call=>call.action==='subscribe').length,1,'No mutation before ICE/DTLS is connected');
  h.connectSubscriber();
  await h.room.reconcileQueue;
  assert.equal(h.room.state,'connected');
  assert.equal(h.room.remoteParticipants.size,2);
  assert.equal(h.calls.filter(call=>call.action==='subscribe').length,2);
  assert.equal(new Set(h.room.subscribed.values()).size,2);
}));

test('50 participants retain distinct subscriptions across batches and leave/rejoin',async()=>harness(async h=>{
  await h.room.connect('wss://radio.test/connect','ticket');
  const peers=Array.from({length:49},(_,i)=>({id:'peer-'+i,name:'Pilot '+i,published:true}));
  h.room.ws.peers(peers);
  await h.room.reconcileQueue;
  assert.equal(h.room.remoteParticipants.size,49);
  assert.equal(new Set(h.room.subscribed.values()).size,49);
  assert.deepEqual(h.calls.filter(call=>call.action==='subscribe').map(call=>call.payload.peers.length),[32,17]);
  h.room.ws.peers(peers.slice(1));
  await h.room.reconcileQueue;
  h.room.ws.peers([...peers.slice(1),{id:'replacement',name:'Replacement',published:true}]);
  await h.room.reconcileQueue;
  assert.equal(h.room.state,'connected');
  assert.equal(h.room.subscribed.size,49);
  assert.ok(!h.room.subscribed.has('peer-0'));
  assert.ok(h.room.subscribed.has('replacement'));
}));

test('a gathered TURN relay allows setup without waiting for unused server timeouts',async()=>harness(async h=>{
  h.slowIce();
  const started=Date.now();
  await h.room.connect('wss://radio.test/connect','ticket');
  assert.ok(Date.now()-started<2000,'A usable relay must not wait for the 12-second ICE deadline');
  assert.equal(h.pcs[0].iceGatheringState,'gathering');
  assert.match(h.calls.find(call=>call.action==='publish').payload.sessionDescription.sdp,/typ relay/);
  assert.equal(h.room.state,'connected');
}));

test('host-only candidates do not skip TURN gathering and cancellation does not publish',async()=>harness(async h=>{
  h.slowIce(false);
  const connecting=h.room.connect('wss://radio.test/connect','ticket');
  await new Promise(resolve=>setTimeout(resolve,450));
  assert.ok(!h.calls.some(call=>call.action==='publish'));
  await h.room.disconnect();
  await assert.rejects(connecting,/interrompue|déconnectée/);
  assert.equal(h.captures(),0);
}));
