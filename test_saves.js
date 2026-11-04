const assert = require('node:assert/strict');
const G = require('./game.js'), P = require('./progress.js'), L = require('./loadouts.js'), O = require('./onboarding.js'), S = require('./saves.js');
let passed = 0;
function eq(a,b) { assert.deepEqual(a,b); passed++; }
function ok(v) { assert.ok(v); passed++; }
function bad(fn, pattern) { assert.throws(fn, pattern); passed++; }
function store() {
  const values = new Map();
  return { values, getItem:k=>values.has(k)?values.get(k):null, setItem:(k,v)=>values.set(k,String(v)), removeItem:k=>values.delete(k) };
}
const st = store();
eq(S.summary(S.capture(st,undefined,1)).totalRep,0);
eq(S.bytes('中🌾abc'),Buffer.byteLength('中🌾abc'));
for (const [i,scenario] of G.SCENARIOS.entries()) {
  const g = G.createInstance(), ledger = P.loadGrowth({version:1,settled:{'run-test-12345678':10000}});
  g.newGame(i+100, scenario.id, {difficultyId:'hard',affixIds:G.AFFIXES.map(a=>a.id)}, P.totalRep(ledger));
  st.setItem(S.keys.growth,JSON.stringify(ledger));
  st.setItem(S.keys.loadouts,JSON.stringify(L.save(L.load(),0,'测试方案',[])));
  st.setItem(S.keys.prefs,JSON.stringify({intro:'seen',tutorial:'done'}));
  st.setItem('dsh_city_audio_v1','device-audio');
  st.setItem('dsh_city_cloud_meta_v1','device-quota');
  for (const stage of ['draw','city','over']) {
    if (stage === 'city') ok(g.build('farm').ok);
    if (stage === 'over') for (let turn=0;turn<30;turn++) ok(g.endTurn().ok);
    if (stage === 'over') st.setItem(S.keys.growth,JSON.stringify(P.creditGrowth(ledger,g.exportState())));
    S.write(st,S.keys.city,JSON.stringify(g.exportState()),1000+i);
    const bundle = S.capture(st), decoded = S.parse(JSON.stringify(bundle));
    eq(decoded,bundle); eq(decoded.payload.data.city,g.exportState());
    const target=store(); target.setItem('dsh_city_audio_v1','other-audio'); target.setItem('dsh_city_cloud_meta_v1','other-quota');
    S.apply(target,bundle,S.fingerprint(S.capture(target)));
    eq(S.capture(target),bundle);
    eq(target.getItem('dsh_city_audio_v1'),'other-audio'); eq(target.getItem('dsh_city_cloud_meta_v1'),'other-quota');
    const restored=G.createInstance(); ok(restored.importState(decoded.payload.data.city).ok);
    if (stage==='draw') { ok(g.chooseBlueprint(g.getState().pendingDraw.options[0]).ok); ok(restored.chooseBlueprint(restored.getState().pendingDraw.options[0]).ok); eq(restored.exportState(),g.exportState()); }
    if (stage==='over') eq(P.creditGrowth(decoded.payload.data.growth,restored.exportState()),decoded.payload.data.growth);
  }
}
// A task reward waiting to be chosen must survive; a tutorial must not leak into it.
const game=G.createInstance(); game.newGame(27); game.chooseBlueprint(game.getState().pendingDraw.options[0]); game.build('farm');
game.acceptTask(game.getState().board.find(t=>t.defId==='reclaim').uid);
for(let i=0;i<3;i++) ok(game.endTurn().ok);
ok(game.getState().rewardQueue.length>0);
const empty=store(); S.write(empty,S.keys.city,JSON.stringify(game.exportState()),123);
const original=S.capture(empty); const practice=O.create(game); practice.acknowledge();
eq(S.capture(empty),original); eq(S.parse(original).payload.data.city.rewardQueue,game.getState().rewardQueue);
// Validation must reject bad inputs before any original storage is touched.
bad(()=>S.parse('{}'),/兼容/); bad(()=>S.parse('{'),/JSON/); bad(()=>S.parse('x'.repeat(S.maxBytes+1)),/10 MB/);
let broken=JSON.parse(JSON.stringify(original)); broken.payload.data.best++; bad(()=>S.parse(broken),/校验/);
broken=JSON.parse(JSON.stringify(original)); broken.version=2; bad(()=>S.parse(broken),/兼容/);
broken=JSON.parse(JSON.stringify(original.payload.data)); broken.city.money=-1; bad(()=>S.make(broken),/城市/);
broken=JSON.parse(JSON.stringify(original.payload.data)); broken.city.buildings[0].defId='unknown'; bad(()=>S.make(broken),/建筑/);
broken=JSON.parse(JSON.stringify(original.payload.data)); broken.city.board[0].progress='oops'; bad(()=>S.make(broken),/任务/);
broken=JSON.parse(JSON.stringify(original.payload.data)); broken.city.rewardQueue[0].pop='oops'; bad(()=>S.make(broken),/奖励/);
broken=JSON.parse(JSON.stringify(original.payload.data)); broken.city.taskSupply.food=-2; bad(()=>S.make(broken),/供给/);
broken=JSON.parse(JSON.stringify(original.payload.data)); broken.city.buildings[0].uid='b1" onclick="alert(1)'; bad(()=>S.make(broken),/标识/);
broken=JSON.parse(JSON.stringify(original.payload.data)); broken.city.log[0].kind='"><img src=x>'; bad(()=>S.make(broken),/日志/);
broken=JSON.parse(JSON.stringify(original.payload.data)); broken.city.unlocked=['constructor']; bad(()=>S.make(broken),/蓝图/);
broken=JSON.parse(JSON.stringify(original.payload.data)); broken.city.spawnedNormals[1]=null; bad(()=>S.make(broken),/刷新记录/);
broken=JSON.parse(JSON.stringify(original.payload.data)); broken.growth.settled.invalid=5; bad(()=>S.make(broken),/成长/);
broken=JSON.parse(JSON.stringify(original.payload.data)); broken.city=null; broken.growth.legacyUnlockRep=NaN; bad(()=>S.make(broken),/数值/);
bad(()=>S.parse('{"__proto__":{}}'),/非法/);
const before=Object.fromEntries(empty.values);
bad(()=>S.apply(empty,original,'changed-fingerprint'),/其他窗口/); eq(Object.fromEntries(empty.values),before);
// Stable content comparison ignores clock changes on a new account.
const blank=store(), fresh=S.capture(blank,undefined,1); S.apply(blank,original,S.fingerprint(fresh)); eq(S.capture(blank),original);
const changed=store(); S.write(changed,S.keys.best,'3',1); eq(S.write(changed,S.keys.best,'3',2),false); eq(JSON.parse(changed.getItem(S.metaKey)).changedAt,1);
// Backup or journal quota errors must not mutate any progress. Mid-restore errors roll back.
for (const failingKey of [S.recoveryKey,S.journalKey,S.keys.campaign]) {
  const target=store(); S.write(target,S.keys.best,'7',99); const saved=new Map(target.values), set=target.setItem; let failed=false;
  target.setItem=(k,v)=>{ if(k===failingKey&&!failed){failed=true;throw new Error('quota');}set(k,v); };
  bad(()=>S.apply(target,original));
  for(const key of Object.values(S.keys).concat(S.metaKey)) eq(target.getItem(key),saved.get(key)||null);
  eq(target.getItem(S.journalKey),null);
}
// Simulate a browser crash during restore and replay the durable transaction journal.
const crash=store(), originals={}; for(const key of Object.values(S.keys).concat(S.metaKey)) originals[key]=null;
originals[S.keys.best]='42'; crash.setItem(S.journalKey,JSON.stringify(originals)); crash.setItem(S.keys.best,'999');
eq(S.recover(crash),true); eq(crash.getItem(S.keys.best),'42'); eq(S.recover(crash),false);
crash.setItem(S.journalKey,'{}'); bad(()=>S.recover(crash),/恢复日志/);
const corrupt=store();corrupt.setItem(S.keys.city,'{broken');const rawToken=S.rawFingerprint(corrupt);
S.apply(corrupt,original,rawToken);eq(S.capture(corrupt),original);
const rawBackup=JSON.parse(corrupt.getItem(S.recoveryKey));eq(rawBackup.format,'loop-town-raw-backup');eq(rawBackup.values[S.keys.city],'{broken');
const legacy=JSON.parse(JSON.stringify(original.payload.data));delete legacy.city.runId;delete legacy.city.growthEligible;delete legacy.city.rewardVersion;
eq(S.make(legacy,1),S.make(legacy,1));eq(S.make(legacy,1).payload.data.city.rngState,legacy.city.rngState);
console.log('Save management: '+passed+' assertions passed');
