const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function receiver(t){
 const oscillators=[], sources=[];
 const param=()=>({value:0,setValueAtTime(v){this.value=v},linearRampToValueAtTime(v){this.value=v},exponentialRampToValueAtTime(v){this.value=v},cancelScheduledValues(){}});
 const node=()=>({gain:param(),frequency:param(),Q:param(),connect(target){this.target=target;return target},disconnect(){this.disconnected=true},start(){this.started=true},stop(){this.stopped=true;this.onended?.()}});
 class AudioContext {state='running';currentTime=0;sampleRate=8000;destination={};createGain(){return node()}createOscillator(){const n=node();oscillators.push(n);return n}createBiquadFilter(){return node()}createBufferSource(){const n=node();sources.push(n);return n}createBuffer(_,size){return{getChannelData:()=>new Float32Array(size)}}async resume(){}async close(){this.state='closed'}}
 const code=ts.transpileModule(fs.readFileSync('src/lib/radio-squelch.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};new Function('module','exports','AudioContext',code)(m,m.exports,AudioContext);
 const sound=new m.exports.RadioSquelch(0.8);t.after(()=>sound.close());return{sound,oscillators,sources};
}
test('one voice is clean; overlapping voices add one tone and leave the voice graph untouched',t=>{
 const {sound,oscillators}=receiver(t);sound.setReceive(true,1);assert.equal(oscillators.length,0);
 sound.setReceive(true,2);assert.equal(oscillators.length,1);assert.equal(oscillators[0].frequency.value,2100);
 sound.setReceive(true,3);assert.equal(oscillators.length,1,'do not stack tones with more speakers');
 sound.setReceive(true,1);assert.equal(oscillators[0].stopped,true);
});
test('local transmission counts once and the tone ends on release',t=>{
 const {sound,oscillators}=receiver(t);sound.setTransmit(true);assert.equal(oscillators.length,0);
 sound.setReceive(true,1);assert.equal(oscillators.length,1);sound.setTransmit(false);assert.equal(oscillators[0].stopped,true);
});
test('effects switch, radio volume and disconnect control collision audio',t=>{
 const {sound,oscillators}=receiver(t);sound.setEnabled(false);sound.setReceive(true,2);assert.equal(oscillators.length,0);
 sound.setEnabled(true);assert.equal(oscillators.length,1);sound.setVolume(0);assert.equal(oscillators[0].target.target.gain.value,0);
 sound.setEnabled(false);assert.equal(oscillators[0].stopped,true);
 sound.setEnabled(true);sound.close();assert.equal(oscillators[1].stopped,true);
});

test('carrier runs throughout speech without stacking and fades out on release',t=>{
 const {sound,sources}=receiver(t);
 sound.setTransmit(true);const carrier=sources.find(n=>n.loop);assert.ok(carrier?.started);
 sound.setTransmit(true);sound.setReceive(true);assert.equal(sources.filter(n=>n.loop).length,1);
 sound.setTransmit(false);assert.ok(!carrier.stopped,'receiver keeps the carrier alive');
 sound.close();assert.ok(carrier.stopped);assert.ok(carrier.disconnected);
});
test('effects and volume govern carrier; re-enabling creates only one replacement',t=>{
 const {sound,sources}=receiver(t);sound.setTransmit(true);const first=sources.find(n=>n.loop);
 sound.setVolume(0);assert.equal(first.target.target.target.gain.value,0);
 sound.setEnabled(false);assert.ok(first.stopped);
 sound.setEnabled(true);sound.setEnabled(true);const carriers=sources.filter(n=>n.loop);assert.equal(carriers.length,2);
 sound.setTransmit(false);assert.ok(carriers[1].stopped);
});
