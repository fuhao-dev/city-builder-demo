/* Growth ledger, capacity constraints, composable buffs, blueprint eligibility and rerolls. */
const assert=require('node:assert/strict');
const G=require('./game.js');
const P=require('./progress.js');
let passed=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);passed++;};
const ok=(a,m)=>{assert(a,m);passed++;};
const rejects=(fn,m)=>{assert.throws(fn,undefined,m);passed++;};
const snapshot=()=>JSON.stringify(G.exportState());
const round=n=>Math.round(n*100)/100;
function ready(config,rep=0,seed=15){const s=G.newGame(seed,'town',config,rep);ok(G.chooseBlueprints(s.pendingDraw.options.slice(0,s.pendingDraw.count)).ok,'opening is legally selected');return s;}
eq(G.normalizeRunConfig({buffId:'food_aid'}),{difficultyId:'normal',buffIds:['food_aid']},'legacy single buff migrates');
eq(G.normalizeRunConfig({buffIds:['water_saving','preparation']}),{difficultyId:'normal',buffIds:['preparation','water_saving']},'combination order is canonical');
for(const c of [{buffIds:['preparation','preparation']},{buffIds:['none']},{buffIds:['unknown']},{buffId:'none',buffIds:[]},{buffIds:'food_aid'}])rejects(()=>G.normalizeRunConfig(c),'invalid combinations rejected');
for(const [rep,capacity] of [[0,2],[99,2],[100,3],[599,3],[600,4],[999,4],[1000,5],[1799,5],[1800,6]])eq(G.growthStatus(rep).capacity,capacity,'capacity boundary '+rep);
eq(G.growthStatus(79).buffIds.includes('settlers'),false,'population buff locked below threshold');
eq(G.growthStatus(80).buffIds.includes('settlers'),true,'population buff unlocks at threshold');
eq(G.growthStatus(399).buffIds.includes('blueprint_pack'),false,'extra opening blueprint locked');
eq(G.growthStatus(400).buffIds.includes('blueprint_pack'),true,'extra opening blueprint unlocks');
eq(G.growthStatus(119).rerolls,0,'reroll locked');eq(G.growthStatus(120).rerolls,1,'one reroll per run');
for(const [rep,size] of [[0,16],[449,16],[450,17],[899,17],[900,18],[1399,18],[1400,19]])eq(G.growthStatus(rep).blueprintIds.length,size,'blueprint pool boundary '+rep);
for(const rep of [-1,1.2,'100',Infinity,Number.MAX_SAFE_INTEGER+1])rejects(()=>G.growthStatus(rep),'invalid lifetime reputation');
ok(G.runConfigStatus({buffIds:['preparation','water_saving']},0).ok,'two one-point buffs fit starting capacity');
eq(G.runConfigStatus({buffIds:['preparation','food_aid']},0).ok,false,'combined cost is enforced');
eq(G.runConfigStatus({buffIds:['settlers']},0).ok,false,'locked buff cannot be equipped');
ready();
for(const [c,rep] of [[{buffIds:['settlers']},0],[{buffIds:['preparation','food_aid']},0],[{buffIds:['blueprint_pack','settlers']},300]]){
  const before=snapshot();rejects(()=>G.newGame(1,'town',c,rep),'invalid loadout cannot start');eq(snapshot(),before,'failed start preserves city and RNG');
}

let combinations=0;
for(const rep of [0,400,1800]){
  const available=G.growthStatus(rep).buffIds;
  const sets=available.reduce((sets,id)=>sets.concat(sets.map(ids=>ids.concat(id))),[[]]);
  for(const difficultyId of ['normal','hard'])for(const buffIds of sets){
    const config={difficultyId,buffIds};if(!G.runConfigStatus(config,rep).ok)continue;
    combinations++;
    const s=G.newGame(15,'town',config,rep),pop=5+(buffIds.includes('settlers')?1:0);
    eq(s.pop,pop,'initial population is additive');eq(s.money,300+(buffIds.includes('preparation')?60:0),'money bonus is applied once');
    eq(s.townLevel,0,'P6 start still needs manual town upgrade');
    eq(s.pendingDraw.count,buffIds.includes('blueprint_pack')?2:1,'opening choice count');
    eq(s.pendingDraw.options.length,buffIds.includes('blueprint_pack')?5:3,'opening option count');
    ok(s.pendingDraw.options.every(id=>G.growthStatus(rep).blueprintIds.includes(id)),'opening only draws eligible blueprints');
    ok(G.chooseBlueprints(s.pendingDraw.options.slice(0,s.pendingDraw.count)).ok,'atomic opening choices');
    const c=G.compute();eq(c.supply.food,buffIds.includes('food_aid')?5:3,'persistent supply stacks with other buffs');
    for(const r of G.RES){
      const rate=r.demand*(difficultyId==='hard'?1.15:1)*(r.key==='water'&&buffIds.includes('water_saving')?.9:1);
      eq(c.demand[r.key],round(pop*rate),'population bonus and demand multipliers compose: '+r.key);
    }
    const before=snapshot(),fc=G.forecast();eq(snapshot(),before,'configured forecast never changes the run');
    ok(G.endTurn().ok,'configured run advances');eq(s.last,fc.last,'forecast agrees with actual settlement');
    const saved=G.exportState();ok(G.importState(saved).ok,'combination restores');eq(G.exportState(),saved,'restore does not grant money, people, blueprints or refreshes');
  }
}

// Refresh operates on the current draw, spends one shared token, preserves choices and resources.
const draw=G.newGame(15,'town',{buffIds:['blueprint_pack']},450),options=draw.pendingDraw.options.slice(),rng=draw.rngState;
const unchanged={money:draw.money,pop:draw.pop,turn:draw.turn,hasBuilt:draw.hasBuilt,count:draw.pendingDraw.count,source:draw.pendingDraw.source};
ok(G.rerollBlueprints().ok,'eligible player can reroll');
eq(draw.rerollsRemaining,0,'one token spent');ok(draw.pendingDraw.options.some(id=>!options.includes(id)),'reroll introduces fresh options');
eq(new Set(draw.pendingDraw.options).size,5,'no duplicate options');ok(draw.rngState!==rng,'reroll consumes game RNG');
eq({money:draw.money,pop:draw.pop,turn:draw.turn,hasBuilt:draw.hasBuilt,count:draw.pendingDraw.count,source:draw.pendingDraw.source},unchanged,'reroll changes no resources or actions');
const spent=snapshot();eq(G.rerollBlueprints().ok,false,'cannot refresh twice');eq(snapshot(),spent,'failed reroll consumes no RNG');
ok(G.importState(G.exportState()).ok,'spent token survives reload');eq(G.getState().rerollsRemaining,0,'reload cannot refill token');
ok(G.chooseBlueprints(G.getState().pendingDraw.options.slice(0,2)).ok,'refreshed opening can finish');
G.getState().pop=6;ok(G.upgradeTown().ok,'town upgrade after opening is legal');eq(G.blueprintRerollStatus().remaining,0,'opening and town draws share one token');
const exhausted=G.newGame(1,'town',{},1800);exhausted.unlocked=G.growthStatus(1800).blueprintIds.filter(id=>!exhausted.pendingDraw.options.includes(id));
const noFresh=snapshot();eq(G.rerollBlueprints().ok,false,'no alternative cards means no refresh');eq(snapshot(),noFresh,'no alternative preserves token and RNG');

// New cards join the pool; they are not automatically buildable.
const expanded=ready({},1400);eq(G.buildStatus('library').ok,false,'permanent unlock still requires in-run draw');
expanded.pop=6;ok(G.upgradeTown().ok,'expanded pool used by upgrade');
ok(expanded.pendingDraw.options.every(id=>G.growthStatus(1400).blueprintIds.includes(id)&&!expanded.unlocked.includes(id)),'town excludes owned and locked blueprints');
for(const id of ['supplycamp','purifier','library'])eq(G.buildingNet(G.buildingDef(id),{}),1.5,'new blueprint retains baseline net tier');

// A stable run id credits complete games once, regardless of win/loss or repeated same-seed runs.
function finished(seed=1){const s=ready({},0,seed);s.turn=30;s.rep=95;s.pop=11;s.board=[];s.active=[];G.RES.forEach(r=>s.taskSupply[r.key]=100);ok(G.endTurn().ok,'final validation');return G.exportState();}
const won=finished();let ledger=P.creditGrowth({},won);
eq(P.totalRep(ledger),125,'completed score plus clear and first rewards become lifetime reputation');eq(P.creditGrowth(ledger,won),ledger,'repeat render gives no duplicate reputation');
ok(G.importState(won).ok,'completed game restores');eq(P.creditGrowth(ledger,G.getState()),ledger,'reload does not duplicate credit');
const sameSeed=finished();ok(sameSeed.runId!==won.runId,'same seed starts a distinct genuine run');ledger=P.creditGrowth(ledger,sameSeed);eq(P.totalRep(ledger),230,'separate same-seed completion earns base and repeat clear reward');
const failed=finished(2);failed.final.cleared=false;failed.final.goal.cleared=false;
ledger=P.creditGrowth(ledger,failed);eq(P.totalRep(ledger),325,'failed goal still earns finished-game reputation');
for(const bad of [{...won,over:false},{...won,turn:29},{...won,growthEligible:false},{...won,runId:'bad'},
  {...won,final:{...won.final,rep:999}},{...won,final:{...won.final,runId:sameSeed.runId}},
  {...won,final:{...won.final,growthRep:120}},{...won,final:{...won.final,scenarioId:'health'}}])eq(P.creditGrowth({},bad),P.loadGrowth(),'incomplete or inconsistent settlement cannot award');
eq(P.totalRep({version:1,settled:{bad:999,[won.runId]:NaN}}),0,'malformed ledger entries ignored');
eq(P.loadGrowth({version:9,settled:{[won.runId]:100}}),P.loadGrowth(),'unknown ledger version is not interpreted');

// Save migration preserves active cities and does not invent historical lifetime totals.
const old=ready({buffId:'food_aid'});old.money=17;
const legacy=G.exportState();legacy.runConfig={difficultyId:'normal',buffId:'food_aid'};
for(const k of ['runId','growthRep','growthEligible','rerollsRemaining'])delete legacy[k];
const oldRng=legacy.rngState;ok(G.importState(legacy).ok,'v3.12 active save migrates');
eq(G.getState().money,17,'spent money preserved');eq(G.getState().rngState,oldRng,'migration leaves RNG alone');
eq(G.getState().runConfig.buffIds,['food_aid'],'legacy buff kept');eq(G.getState().growthRep,0,'legacy city keeps original pool and features');
ok(G.getState().growthEligible,'old active run can earn reputation when completed');
const activeId=G.getState().runId;ok(G.importState(G.exportState()).ok,'migrated active state restores');eq(G.getState().runId,activeId,'run id is stable');
const historical=JSON.parse(JSON.stringify(won));
for(const k of ['runId','growthRep','growthEligible','rerollsRemaining'])delete historical[k];
delete historical.final.runId;delete historical.final.growthRep;
ok(G.importState(historical).ok,'historical completed save migrates');eq(G.getState().growthEligible,false,'completed legacy game is not retroactively credited');
eq(P.totalRep(P.creditGrowth({},G.getState())),0,'best scores do not invent lifetime totals');
const valid=G.exportState();
for(const bad of [{...valid,growthRep:-1},{...valid,rerollsRemaining:1},{...valid,runConfig:{buffIds:['settlers']}},
  {...valid,final:{...valid.final,growthRep:120}}]){
  const before=snapshot();eq(G.importState(bad).ok,false,'invalid growth save rejected');eq(snapshot(),before,'rejected growth save preserves city');
}
// Records distinguish combinations and effective growth features, with stable old keys.
eq(P.key('town',{buffIds:['preparation','water_saving']},0),P.key('town',{buffIds:['water_saving','preparation']},0),'combo order does not split records');
eq(P.key('town',{buffId:'food_aid'},0),'town|normal|food_aid','legacy single-buff record key preserved');
ok(P.key('town',{},0)!==P.key('town',{},120),'reroll access has its own record group');
ok(P.key('town',{},120)!==P.key('town',{},450),'new blueprint pool has its own record group');
const combo=finished(3);combo.runConfig={difficultyId:'normal',buffIds:['preparation','water_saving']};combo.final.runConfig=combo.runConfig;
const scores=P.record({},combo),comboKey=P.key('town',combo.runConfig,0);
eq(scores[comboKey].bestRep,95,'combination clear is recorded');eq(P.load(scores),scores,'combination record survives load');
eq(scores['town|normal|preparation'],undefined,'combination does not claim a single-buff clear');
const matured={...won,growthRep:1400,rerollsGranted:1,final:{...won.final,growthRep:1400,rerollsGranted:1}};
const advancedScores=P.record(scores,matured);ok(advancedScores[P.key('town',won.runConfig,1400)],'mature growth records saved');eq(P.load(advancedScores),advancedScores,'growth signatures survive load');
console.log('PASS '+passed+' growth assertions ('+combinations+' legal loadouts checked)');
