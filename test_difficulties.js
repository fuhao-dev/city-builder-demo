/* Scenario hard rules, affix integration, frozen rewards, and published-save compatibility. */
const assert=require('node:assert/strict'),G=require('./game.js'),P=require('./progress.js');
let passed=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);passed++;};
const ok=(v,m)=>{assert(v,m);passed++;};
const save=()=>G.exportState();
const hard=(affixIds=[])=>({difficultyId:'hard',affixIds});
function ready(id='town',affixes=[],buffIds=[]){
  const s=G.newGame(71,id,{...hard(affixes),buffIds},7500);
  ok(G.chooseBlueprints(s.pendingDraw.options.slice(0,s.pendingDraw.count)).ok,'choose opening');
  return s;
}
eq(G.SCENARIOS.map(s=>s.id).sort(),Object.keys(G.HARD_RULES).sort(),'every scenario has a hard rule');
eq(new Set(Object.values(G.HARD_RULES).map(r=>JSON.stringify(r.effects))).size,12,'twelve distinct hard rules');
eq(G.runModifiers(hard(),'agriculture').populationDemand.food,1.5,'agricultural main rule is food ×1.5');
eq(G.runModifiers(hard(),'education').populationDemand.education,1.35,'education main rule');
eq(G.runModifiers(hard(),'town').startingMoney,220,'town main rule');
eq(G.runModifiers(hard(),'capital').buildingCostMultiplier,1.2,'capital main rule');
eq(G.runModifiers(hard(['rations']),'agriculture').populationDemand.food,1.65,'main and light affix multiply');
eq(G.runModifiers({...hard(['dry']),buffIds:['water_saving']},'health').populationDemand.water,.594,'main, affix and buff compose without early rounding');
const prior=ready('agriculture');
const beforePreview=save();
eq(G.runModifiers(hard(),'capital').populationDemand.food,1,'explicit preview uses selected scenario, not live city');
eq(save(),beforePreview,'preview cannot change live city');
eq(G.compute().demand.food,7.5,'live city keeps agricultural rule');
eq(G.buildingNet(G.buildingDef('farm'),hard(),'agriculture'),-1,'explicit building comparison includes scenario rule');
eq(G.runModifiers({difficultyId:'normal'},'agriculture').populationDemand.food,1,'normal never inherits hard rule');

// Preserve the original four-affix regression matrix; expanded stacking is covered in test_affixes.js.
const originalAffixes=['idle','tight_budget','dry','rations'];
const combinations=[[],...originalAffixes.map(id=>[id])];
for(let i=0;i<originalAffixes.length;i++)for(let j=i+1;j<originalAffixes.length;j++)combinations.push([originalAffixes[i],originalAffixes[j]]);
for(const scenario of G.SCENARIOS)for(const affixes of combinations){
  const s=ready(scenario.id,affixes,['preparation','water_saving']);
  const before=save(),forecast=G.forecast();
  eq(save(),before,'forecast has no side effects: '+scenario.id+'/'+affixes);
  ok(G.endTurn().ok,'hard affix run advances');
  eq(s.last,forecast.last,'forecast equals actual settlement');
  const exported=save();ok(G.importState(exported).ok,'new difficulty save restores');
  eq(save(),exported,'import preserves all frozen rules, RNG and resources');
}

// Labor capacity affects building, activation, preview, and end-turn gates; population retains its meaning.
let s=ready('agriculture',['idle']);
eq(s.pop,5,'idle residents still count as population');eq(G.laborCapacity(),4,'one nonworking resident');
eq(G.compute().demand.food,7.5,'idle residents still eat');
eq(G.buildingNet(G.buildingDef('farm')),-1,'idle is a capacity limit, not a second resource deduction');
s.board=[];s.money=1000;
s.buildings=G.BASE_BUILDINGS.filter(d=>d.labor===1).slice(0,4).map((d,i)=>({uid:'fixture-'+i,defId:d.id,active:true}));
eq(G.laborUsed(),4,'four workers employed');eq(G.laborAvailable(),0,'nonworker cannot fill a fifth job');
eq(G.buildStatus(G.BASE_BUILDINGS.filter(d=>d.labor===1)[4].id).ok,false,'build rejects exhausted working population');
eq(G.buildPreview(G.BASE_BUILDINGS.filter(d=>d.labor===1)[4].id).ok,false,'preview also rejects');
s.pop=4;
const over=save();eq(G.laborAvailable(),-1,'population loss can overstaff the city');
eq(G.endTurn().ok,false,'must free labor before next turn');eq(save(),over,'failed end turn is atomic');
ok(G.setBuildingActive(s.buildings[0].uid,false).ok,'shutdown frees labor');
eq(G.laborAvailable(),0,'capacity restored after shutdown');
eq(G.setBuildingActive(s.buildings[0].uid,true).ok,false,'cannot reactivate beyond capacity');
ok(G.endTurn().ok,'settlement possible after shutdown');
s=ready('town',['idle']);s.pop=1;s.buildings=[];s.board=[];
eq(G.laborCapacity(),0,'working population is clamped to zero');eq(G.laborAvailable(),0,'zero capacity is legal');
ok(G.endTurn().ok,'zero-worker city can advance with no active jobs');
s=ready('town',['idle'],['settlers']);eq(s.pop,6,'settlers add a real resident');eq(G.laborCapacity(),5,'idle remains fixed at one after population growth');
ok(G.townUpgradeStatus().ok,'idle residents count toward town threshold');
s.pop=9;s.board=[];G.RES.forEach(r=>s.taskSupply[r.key]=100);
eq(G.goalStatus().conditions.find(c=>c.key==='pop').current,9,'goal uses total residents');
s.pop=15;eq(G.compute().repGain,5,'actual reputation cap uses population, not fourteen workers');

// Actual price, affordability, and preview all share the capital rule.
s=ready('capital',['tight_budget']);s.money=1000;s.board=[];
const farm=G.buildingDef('farm'),price=G.buildingCost(farm);
eq(price,87,'72 ×1.2 rounds upward to 87');
const beforeBuild=save(),preview=G.buildPreview('farm');
eq(save(),beforeBuild,'price preview is pure');eq(preview.moneyBefore-preview.moneyAfter,87,'preview charges adjusted price');
ok(G.build('farm').ok,'capital construction succeeds');eq(s.money,913,'actual price equals preview');eq(G.compute(),preview.after,'price does not alter resource calculation');
s.hasBuilt=false;s.money=86;
eq(G.buildStatus('farm').ok,false,'base price is insufficient under premium');
eq(G.build('farm').ok,false,'build cannot bypass price gate');
eq(G.buildingCost(farm,{difficultyId:'normal'},'capital'),72,'normal price remains unchanged');

// Illegal combinations are rejected without touching the current city or RNG.
for(const bad of [hard(['idle','idle']),hard(['constructor']),hard('idle'),hard([,]),
  {difficultyId:'normal',affixIds:['idle']},{difficultyId:'normal',hardRulesVersion:2},{difficultyId:'hard',hardRulesVersion:3},
  {difficultyId:'hard',hardRulesVersion:1,affixIds:['dry']}]){
  const before=save();assert.throws(()=>G.newGame(1,'town',bad));passed++;
  eq(save(),before,'invalid new run preserves city');
  eq(G.importState({...before,runConfig:bad}).ok,false,'invalid saved rules rejected');eq(save(),before,'invalid import preserves city');
}

// Published hard saves retain universal ×1.15, including when the new scenario rule differs.
s=ready('agriculture');s.money=17;s.pop=9;
const old=save();old.runConfig={difficultyId:'hard',buffId:'water_saving'};
delete old.rewardVersion;delete old.rerollsGranted;old.rerollsRemaining=0;
ok(G.importState(old).ok,'published hard city imports');
eq(G.getState().runConfig.hardRulesVersion,1,'old difficulty version frozen');
eq(G.compute().demand.food,10.35,'old city retains food ×1.15 instead of new ×1.5');
eq(G.compute().demand.water,4.66,'published water rate keeps original precision');
eq(G.getState().money,17,'migration does not repay money');eq(G.getState().rngState,old.rngState,'migration does not reroll');
eq(G.getState().rerollsGranted,1,'published hard city retains its original one-refresh entitlement');
const legacy=save(),legacyForecast=G.forecast();
ok(G.importState(legacy).ok,'migrated legacy city can reload');eq(save(),legacy,'legacy snapshot is stable');
ok(G.endTurn().ok,'legacy city continues');eq(G.getState().last,legacyForecast.last,'legacy forecast uses frozen rule');
let oldFinished=G.getState();oldFinished.turn=30;oldFinished.pop=15;oldFinished.board=[];oldFinished.active=[];
G.RES.forEach(r=>oldFinished.taskSupply[r.key]=100);ok(G.endTurn().ok,'legacy city finishes normally');
oldFinished=save();delete oldFinished.runConfig.hardRulesVersion;delete oldFinished.final.runConfig.hardRulesVersion;
delete oldFinished.rewardVersion;delete oldFinished.final.rewardVersion;
ok(G.importState(oldFinished).ok,'published completed hard city imports');
eq(G.getState().final.runConfig.hardRulesVersion,1,'legacy final keeps its original difficulty');
const oldState=G.getState(),oldKey=P.key('agriculture',oldState.runConfig,oldState.growthRep,oldState.legacyUnlockRep,oldState.rerollsGranted);
ok(!oldKey.includes('hard:2'),'legacy final remains in old record group');
ok(P.record({},G.getState())[oldKey],'legacy finished score is still recordable');
eq(P.growthReward({},G.getState()).clearBonus,0,'published completed hard city is not retroactively paid a new clear bonus');
assert.throws(()=>G.newGame(1,'town',{difficultyId:'hard',hardRulesVersion:1}));passed++;

function finish(affixes=[],cleared=true){
  const s=ready('agriculture',affixes);s.turn=30;s.rep=81;s.board=[];s.active=[];s.pop=cleared?15:1;
  G.RES.forEach(r=>s.taskSupply[r.key]=cleared?100:0);
  ok(G.endTurn().ok,'finish legal T30 fixture');return save();
}
let ledger=P.loadGrowth(),won=finish(['idle','rations']);
let reward=P.growthReward(ledger,won);
eq(reward.baseRep,81,'base reputation transfers 100 percent');eq(reward.clearBonus,150,'hard clear retains ×2');
eq(reward.affixBonus,45,'20%+10% of hard clear, no compounding');eq(reward.firstClearBonus,150,'first clear is not multiplied');eq(reward.total,426,'separate reward sources sum');
ledger=P.creditGrowth(ledger,won);eq(P.totalRep(ledger),426,'combined reward credits once');
eq(P.creditGrowth(ledger,won),ledger,'reloading a win never pays twice');
const receipt=JSON.parse(JSON.stringify(ledger.settled[won.runId]));
const another=finish(['dry']);reward=P.growthReward(ledger,another);
eq(reward.firstClearBonus,0,'affix swap never renews first clear');eq(reward.affixBonus,15,'single light affix earns 10 percent');
ledger=P.creditGrowth(ledger,another);eq(ledger.settled[won.runId],receipt,'old receipt never recalculates');
const failed=finish(['idle'],false),loss=P.growthReward(ledger,failed);
eq(loss.total,81,'failed run still grants full base reputation');eq(loss.affixBonus,0,'failure never grants affix bonus');
const record=P.record({},won),key=P.key('agriculture',won.runConfig,7500);
ok(record[key],'affix result records its actual configuration');eq(P.load(record),record,'new record key survives storage');
ok(key!==P.key('agriculture',hard(),7500),'bare hard and affix hard do not share best score');
ok(P.key('agriculture',hard(),0)!==P.key('agriculture',{difficultyId:'hard',hardRulesVersion:1},0),'old hard scores do not mix with new rules');
eq(P.load({'agriculture|hard|none':{cleared:true,bestRep:99}})['agriculture|hard|none'].bestRep,99,'published records survive');
ok(P.firstCleared(P.loadGrowth(null,{'agriculture|hard|none':{cleared:true,bestRep:99}}),'agriculture','hard'),'published first clear remains claimed');
eq(P.key('agriculture',{...hard(['rations','idle']),buffIds:[]},7500),key,'affix order is canonical');
const malformed=JSON.parse(JSON.stringify(ledger));malformed.settled[won.runId].affixBonus++;
eq(P.loadGrowth(malformed).settled[won.runId],undefined,'corrupt receipt sums are rejected');
ok(G.importState(won).ok,'new completed affix run restores');eq(G.exportState(),won,'completed rules and payout inputs frozen');
console.log('PASS '+passed+' difficulty assertions ('+combinations.length+' affix combinations × 12 scenarios)');
