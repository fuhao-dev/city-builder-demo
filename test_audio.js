/* Audio lifecycle, output signal and persistence regression checks. */
const assert = require('node:assert/strict');
const A = require('./audio.js');
let count = 0;
function eq(a,b) { assert.deepEqual(a,b); count++; }
function ok(a) { assert.ok(a); count++; }
function events(target) {
  const listeners = {};
  target.addEventListener = (type,fn)=>{ (listeners[type] ||= []).push(fn); };
  target.removeEventListener = (type,fn)=>{ listeners[type] = listeners[type].filter(f=>f!==fn); };
  target.emit = (type,data={})=>{ for(const fn of listeners[type] || []) fn({type,...data}); };
  return target;
}
function setup(raw,options={}) {
  const saved = new Map(raw === undefined ? [] : [[A.storageKey,raw]]);
  const contexts=[];
  class Context {
    constructor() {
      if(options.constructorFails) throw Error('Audio unavailable');
      this.state='suspended'; this.currentTime=0; this.destination={}; this.sources=[]; this.gains=[]; contexts.push(this);
    }
    createGain() {
      const gain={value:1,cancelScheduledValues(){},setTargetAtTime(v){this.value=v;},setValueAtTime(v){this.value=v;}};
      const node={gain,connect(){}}; this.gains.push(node); return node;
    }
    createBuffer(channels,length,rate) {
      if(options.bufferFails) throw Error('Allocation failed');
      const pcm=new Float32Array(length); return {duration:length/rate,getChannelData:()=>pcm};
    }
    createBufferSource() {
      const source={loop:false,stopped:false,connect(){},disconnect(){},start(when,offset){this.offset=offset || 0;},stop(){this.stopped=true;this.onended?.();}};
      this.sources.push(source); return source;
    }
    transition(state) { this.state=state; this.onstatechange?.(); }
    resume() {
      if(options.resumeFails) return Promise.reject(Error('Gesture required'));
      if(options.deferResume) return new Promise(resolve=>{this.finishResume=()=>{this.transition('running');resolve();};});
      this.transition('running'); return Promise.resolve();
    }
    suspend() {
      if(options.deferSuspend) return new Promise(resolve=>{this.finishSuspend=()=>{this.transition('suspended');resolve();};});
      this.transition('suspended'); return Promise.resolve();
    }
    close(){this.transition('closed');return Promise.resolve();}
  }
  const env=events({AudioContext:options.unsupported?undefined:Context,document:events({hidden:false}),localStorage:{getItem:k=>saved.get(k) || null,setItem:(k,v)=>{if(options.storageFails)throw Error('No storage');saved.set(k,v);}}});
  return {env,contexts,saved,audio:A.create(env)};
}
async function flush(){await Promise.resolve();await Promise.resolve();await Promise.resolve();}
async function run(){
  eq(A.normalizeSettings({music:-2,effects:4,muted:'true'}),{music:0,effects:1,muted:false});
  eq(A.normalizeSettings({music:null,effects:NaN}),{music:0.3,effects:0.6,muted:false});
  const s=setup('{bad json'); s.audio.init(); s.audio.init();
  eq(s.contexts.length,0); eq(s.audio.play('build'),false);
  s.env.document.emit('pointerdown',{isTrusted:false}); eq(s.contexts.length,0);
  await s.audio.unlock(); eq(s.contexts.length,1); eq(s.audio.getState().musicPlaying,true);
  const ctx=s.contexts[0], music=ctx.sources.find(x=>x.loop);
  eq(ctx.gains[1].gain.value,0.3); eq(ctx.gains[2].gain.value,0.6);
  ctx.currentTime=7;
  s.audio.setSettings({music:0.18,effects:0.47});
  eq(ctx.gains[1].gain.value,0.18);eq(ctx.gains[2].gain.value,0.47);
  eq(ctx.sources.filter(x=>x.loop&&!x.stopped).length,1);
  s.audio.play('build'); eq(s.audio.play('click'),false);
  ctx.currentTime+=0.1; eq(s.audio.play('click'),true);
  s.audio.setSettings({muted:true}); eq(music.stopped,true);eq(s.audio.play('reward'),false);
  eq(ctx.gains[1].gain.value,0);eq(ctx.gains[2].gain.value,0);
  ok(ctx.sources.every(x=>x.stopped));
  const restored=setup(s.saved.get(A.storageKey)); restored.audio.init();
  eq(restored.audio.getState().settings,{music:0.18,effects:0.47,muted:true});
  await restored.audio.unlock();eq(restored.contexts.length,0);
  s.audio.setSettings({muted:false});await flush();
  eq(ctx.sources.filter(x=>x.loop&&!x.stopped).length,1);
  eq(ctx.sources.filter(x=>x.loop).at(-1).offset,7.1);
  s.audio.setSettings({music:0});eq(s.audio.getState().musicPlaying,false);eq(s.audio.play('reward'),true);
  s.audio.setSettings({music:0.2,effects:0});eq(s.audio.getState().musicPlaying,true);eq(s.audio.play('build'),false);
  s.audio.setSettings({effects:0.5});
  for(let i=0;i<20;i++) s.audio.play('reward');
  eq(ctx.sources.filter(x=>!x.loop&&!x.stopped).length,4);
  s.audio.setHidden(true);await flush();eq(ctx.state,'suspended');eq(s.audio.getState().musicPlaying,false);
  eq(s.audio.play('reward'),false);ok(ctx.sources.every(x=>x.stopped));
  ctx.currentTime=11;s.audio.setHidden(false);await flush();eq(ctx.state,'running');eq(s.audio.getState().musicPlaying,true);
  eq(ctx.sources.filter(x=>x.loop&&!x.stopped).length,1);
  s.audio.destroy();eq(ctx.state,'closed');eq(s.audio.play('build'),false);
  s.env.document.emit('pointerdown',{isTrusted:true});await flush();eq(s.contexts.length,1);

  const race=setup(JSON.stringify({music:0,effects:0.5}),{deferResume:true});
  const pending=race.audio.unlock();race.audio.setHidden(true);race.contexts[0].finishResume();await pending;await flush();
  eq(race.contexts[0].state,'suspended');eq(race.audio.getState().musicPlaying,false);
  race.audio.destroy();
  const suspendRace=setup(JSON.stringify({music:0,effects:0.5}),{deferSuspend:true});
  await suspendRace.audio.unlock();suspendRace.audio.setHidden(true);suspendRace.audio.setHidden(false);
  suspendRace.contexts[0].finishSuspend();await flush();eq(suspendRace.contexts[0].state,'running');suspendRace.audio.destroy();
  for(const options of [{unsupported:true},{constructorFails:true},{resumeFails:true},{bufferFails:true},{storageFails:true}]){
    const t=setup(undefined,options);t.audio.init();await t.audio.unlock();
    assert.doesNotThrow(()=>t.audio.setSettings({music:0.4,effects:0.2}));count++;
    if(options.unsupported||options.constructorFails||options.bufferFails) eq(t.audio.getState().supported,false);
    if(options.resumeFails) eq(t.audio.play('build'),false);
    t.audio.destroy();
  }
  const realRandom=Math.random;
  Math.random=()=>{throw Error('Audio must not consume shared randomness');};
  let score;
  try { score=A.renderMusic(); } finally { Math.random=realRandom; }
  ok(score.length>22050*40 && score.length<22050*43);
  let energy=0,peak=0;
  for(const sample of score){assert.ok(Number.isFinite(sample));energy+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
  ok(Math.sqrt(energy/score.length)>0.03);ok(peak<=0.551);ok(score[0]===0 && score.at(-1)===0);
  const signals=new Set();
  for(const name of A.effectNames){
    const samples=A.renderEffect(name);let max=0;
    for(const value of samples){assert.ok(Number.isFinite(value));max=Math.max(max,Math.abs(value));}
    ok(max>0.1&&max<=0.551);ok(samples[0]===0 && samples.at(-1)===0);
    signals.add(Buffer.from(samples.buffer).toString('base64'));
  }
  eq(signals.size,A.effectNames.length);
  console.log('PASS '+count+' audio checks: real PCM, category gains, persistence, voice limits, visibility races and graceful failures');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
