const assert=require('node:assert/strict'),G=require('./game.js'),P=require('./progress.js');
let passed=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);passed++;};
const ok=(a,m)=>{assert(a,m);passed++;};
for(const [rep,count] of [[0,6],[1999,6],[2000,9],[4499,9],[4500,12]])eq(G.growthStatus(rep).scenarioIds.length,count,'chapter unlock boundary '+rep);
for(const [id,rep] of [['material_aid',1800],['power_aid',3000],['civic_support',5000]]){
  eq(G.growthStatus(rep-1).buffIds.includes(id),false,'new buff locked below '+rep);
  eq(G.growthStatus(rep).buffIds.includes(id),true,'new buff unlocked at '+rep);
}
eq(G.growthStatus(5499).rerolls,1,'second refresh locked');eq(G.growthStatus(5500).rerolls,2,'second refresh unlocked');
eq(G.growthStatus(7499).capacity,6,'seventh point locked');eq(G.growthStatus(7500).capacity,7,'seventh point unlocked');
G.newGame(1);
for(const id of G.SCENARIOS.filter(s=>s.unlockRep).map(s=>s.id)){
  const def=G.SCENARIOS.find(s=>s.id===id),before=G.exportState();
  assert.throws(()=>G.newGame(1,id,{},def.unlockRep-1),/解锁/);passed++;
  eq(G.exportState(),before,'locked start preserves city and RNG');
  const s=G.newGame(1,id,{},def.unlockRep);eq(s.scenarioId,id,'unlocked stage starts');
  G.chooseBlueprints(s.pendingDraw.options.slice(0,s.pendingDraw.count));
  ok(G.importState(G.exportState()).ok,'new stage save roundtrip');
  const bad=G.exportState();bad.growthRep=def.unlockRep-1;
  eq(G.importState(bad).ok,false,'lowered chapter permission rejected on import');
}
const legacy=G.growthStatus(400,G.legacyGrowthRep(400));
eq(legacy.scenarioIds.length,6,'old preserved pool does not open new chapters');eq(legacy.buffIds.includes('material_aid'),false,'old floor does not grant new material buff');
for(const d of G.SCENARIOS){
  const c={pop:99,sat:120,supply:{},demand:{},occ:{}};
  G.RES.forEach(r=>{c.supply[r.key]=100;c.demand[r.key]=0;c.occ[r.key]=0;});
  for(const r of d.requirements){if(r.key==='pop')c.pop=r.target;else if(r.key==='sat')c.sat=r.target;else c.supply[r.resource]=r.target;}
  eq(G.evaluateScenario(d.id,c).cleared,true,'all exact boundaries qualify '+d.id);
  for(const r of d.requirements){
    const fail=JSON.parse(JSON.stringify(c));if(r.key==='pop')fail.pop--;else if(r.key==='sat')fail.sat-=.01;else fail.supply[r.resource]-=.01;
    eq(G.evaluateScenario(d.id,fail).cleared,false,'each independent requirement matters '+d.id+' '+r.label);
  }
}
let combinations=0;
const ids=G.growthStatus(7500).buffIds,sets=ids.reduce((sets,id)=>sets.concat(sets.map(s=>s.concat(id))),[[]]);
for(const difficultyId of ['normal','hard'])for(const buffIds of sets){
  if(!G.runConfigStatus({difficultyId,buffIds},7500).ok)continue;
  combinations++;
  const s=G.newGame(18,'capital',{difficultyId,buffIds},7500);
  G.chooseBlueprints(s.pendingDraw.options.slice(0,s.pendingDraw.count));
  const c=G.compute();
  eq(c.supply.material,buffIds.includes('material_aid')?3:1,'material support applied once');
  eq(c.supply.power,buffIds.includes('power_aid')?3:1,'power support applied once');
  for(const r of G.RES){
    const rate=r.demand*(difficultyId==='hard'?1.15:1)*(r.key==='water'&&buffIds.includes('water_saving')?.9:1)*(r.group==='advanced'&&buffIds.includes('civic_support')?.9:1);
    eq(c.demand[r.key],Math.round(rate*s.pop*100)/100,'late combination demand '+r.key);
  }
  const before=G.exportState(),forecast=G.forecast();eq(G.exportState(),before,'forecast does not settle growth');
  ok(G.endTurn().ok,'late combination advances');eq(G.getState().last,forecast.last,'late forecast agrees with actual');
}
const refresh=G.newGame(9,'town',{},5500);
ok(G.rerollBlueprints().ok,'first of two refreshes');eq(refresh.rerollsRemaining,1,'one left');
ok(G.rerollBlueprints().ok,'second refresh allowed');eq(refresh.rerollsRemaining,0,'both spent');
const spent=G.exportState();eq(G.rerollBlueprints().ok,false,'third rejected');eq(G.exportState(),spent,'rejection preserves RNG');
ok(G.importState(spent).ok,'two-spent state restores');eq(G.getState().rerollsRemaining,0,'no refill on reload');
ok(P.key('town',{},3500)!==P.key('town',{},5500),'two-refresh scores have a separate group');
const records={[P.key('town',{},5500)]:{cleared:true,bestRep:100}};eq(P.load(records),records,'late growth group survives loading');
console.log('PASS '+passed+' unlock assertions ('+combinations+' late loadouts)');
