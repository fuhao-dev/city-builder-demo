/* Reward economics, first-clear scope, receipts, migration, and frozen payout rules. */
const assert=require('node:assert/strict');
const G=require('./game.js'),P=require('./progress.js');
let passed=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);passed++;};
const ok=(a,m)=>{assert(a,m);passed++;};
function finish(id='town',difficultyId='normal',buffIds=[],rep=60,win=true,growthRep=0){
  const s=G.newGame(23,id,{difficultyId,buffIds},Math.max(growthRep,G.SCENARIOS.find(s=>s.id===id).unlockRep||0));
  G.chooseBlueprints(s.pendingDraw.options.slice(0,s.pendingDraw.count));
  s.turn=30;s.rep=rep;s.pop=win?25:1;s.board=[];s.active=[];
  for(const r of G.RES)s.taskSupply[r.key]=win?100:0;
  ok(G.endTurn().ok,'genuine engine finalization');eq(s.final.cleared,win,'fixture meets independent win/loss intent');
  return G.exportState();
}
const expected=[['town',10,20],['agriculture',15,30],['education',20,40],['industry',25,50],['health',30,60],['metropolis',40,80],
  ['logistics',40,80],['manufacturing',45,90],['research',50,100],['resilience',55,110],['care',60,120],['capital',70,140]];
for(const [id,clear,first] of expected)for(const difficulty of ['normal','hard']){
  const f=finish(id,difficulty),raw=JSON.stringify(f),ledger=P.creditGrowth({},f),r=ledger.settled[f.runId];
  eq(r.baseRep,60,'base score unchanged');eq(r.clearBonus,difficulty==='hard'?Math.ceil(clear*1.5):clear,'difficulty scales clear bonus only');
  eq(r.firstClearBonus,first,'first reward is fixed per scenario');eq(r.total,60+r.clearBonus+first,'receipt sums correctly');
  eq(P.totalRep(ledger),r.total,'total derived from receipts');eq(r.beforeRep,0,'starts from no reputation');eq(r.afterRep,r.total,'after total captured');
  eq(P.creditGrowth(ledger,f),ledger,'repeated credit is idempotent');eq(JSON.stringify(f),raw,'settlement never mutates engine snapshot');
  eq(P.loadGrowth(JSON.parse(JSON.stringify(ledger))),ledger,'receipt survives JSON roundtrip');
  eq(P.rewardPreview(ledger,id,{difficultyId:difficulty,buffIds:['preparation']}).firstClearBonus,0,'changing buff cannot claim first twice');
  const opposite=difficulty==='normal'?'hard':'normal';eq(P.rewardPreview(ledger,id,{difficultyId:opposite}).firstClearBonus,first,'other difficulty retains first reward');
}
let ledger=P.loadGrowth();
const first=finish();const firstR=P.growthReward(ledger,first);
eq(P.totalRep(ledger),0,'reward preview does not credit');eq(P.growthReward(ledger,first),firstR,'preview stable without mutation');
ledger=P.creditGrowth(ledger,first);eq(P.totalRep(ledger),90,'first town earns 60 + 10 + 20');
const repeat=finish('town','normal',['preparation','water_saving'],60,true,90);
const repeatR=P.growthReward(ledger,repeat);eq(repeatR.firstClearBonus,0,'different combo shares first-clear claim');
eq(repeatR.clearBonus,10,'repeat wins still get clear reward');ledger=P.creditGrowth(ledger,repeat);eq(P.totalRep(ledger),160,'repeat reward added once');
const fail=finish('town','hard',[],20,false,160),failed=P.creditGrowth(ledger,fail);
eq(failed.settled[fail.runId].total,20,'failure receives base only');eq(P.rewardPreview(failed,'town',{difficultyId:'hard'}).firstClearBonus,20,'failure does not consume first');
const hard=finish('town','hard',[],40,true,180);ledger=P.creditGrowth(failed,hard);
eq(ledger.settled[hard.runId].firstClearBonus,20,'hard first can be claimed after failure');
eq(ledger.settled[hard.runId].clearBonus,15,'hard adds 50% to clear reward');
eq(P.growthReward(ledger,first),firstR,'saved receipt stays identical after later games');
eq(P.loadGrowth(ledger,{'metropolis|hard|none':{cleared:true,bestRep:100}}),ledger,'v2 reload never imports newly written scores as historical');

// Old totals and old claims migrate together, without bonus backfill or claiming per BUFF.
const oldId='run-legacy-12345678',oldData={version:1,settled:{[oldId]:240}};
const scores={'town|normal|preparation':{cleared:true,bestRep:60},'education|hard|none':{cleared:true,bestRep:80}};
const migrated=P.loadGrowth(oldData,scores);
eq(migrated.version,2,'ledger upgraded');eq(P.totalRep(migrated),240,'old amount preserved');
eq(migrated.settled[oldId].total,240,'legacy receipt retains amount');eq(migrated.settled[oldId].clearBonus,0,'no invented historical bonus');
eq(P.rewardPreview(migrated,'town',{}).firstClearBonus,0,'old cleared scenario is already claimed');
eq(P.rewardPreview(migrated,'town',{difficultyId:'hard'}).firstClearBonus,20,'old normal clear cannot consume hard first');
eq(P.rewardPreview(migrated,'education',{difficultyId:'hard',buffIds:['water_saving']}).firstClearBonus,0,'legacy claim ignores buff');
eq(P.loadGrowth(JSON.parse(JSON.stringify(migrated))),migrated,'migration is idempotent');eq(oldData.version,1,'migration does not mutate old data');
eq(P.permissionRep(migrated),450,'old blueprint and capacity permissions retained independently of amount');
for(const [oldRep,permissionRep,capacity,pool] of [[179,179,3,16],[180,400,3,16],[200,450,3,17],[300,600,4,17],[400,900,4,18],[600,1000,5,18],[650,1400,5,19],[1000,1800,6,19]]){
  const oldLedger=P.loadGrowth({version:1,settled:{[oldId]:oldRep}}),g=G.growthStatus(P.totalRep(oldLedger),oldLedger.legacyUnlockRep);
  eq(P.totalRep(oldLedger),oldRep,'migration never invents cumulative points');eq(P.permissionRep(oldLedger),permissionRep,'old permissions mapped at boundary');
  eq(g.capacity,capacity,'old capacity retained');eq(g.blueprintIds.length,pool,'old pool retained without granting next feature');
}
const oldCity=G.newGame(1,'town',{buffIds:['blueprint_pack']},1400);
const oldCitySave=G.exportState();delete oldCitySave.rewardVersion;oldCitySave.growthRep=650;
const oldCityRng=oldCity.rngState;ok(G.importState(oldCitySave).ok,'old expanded-pool city imports');
eq(G.getState().growthRep,650,'active city keeps actual growth snapshot');eq(G.getState().legacyUnlockRep,1400,'active city preserves old library permission');eq(G.getState().rngState,oldCityRng,'permission migration never changes RNG');
eq(G.getState().pendingDraw,oldCitySave.pendingDraw,'pending blueprint candidates preserved');
const preserved=G.growthStatus(400,G.legacyGrowthRep(400));
eq(preserved.buffIds.includes('material_aid'),false,'legacy floor cannot unlock brand-new buffs early');
eq(preserved.scenarioIds.length,6,'legacy floor cannot unlock brand-new chapters early');
eq(G.growthStatus(2199,10000).rerolls,1,'legacy floor cannot grant a second refresh');
eq(G.growthStatus(2799,10000).capacity,6,'legacy floor cannot grant new seventh capacity');
const veryOld=G.newGame(21,'town',{},3000),oldHigh=G.exportState();
delete oldHigh.rewardVersion;delete oldHigh.rerollsGranted;delete oldHigh.legacyUnlockRep;
oldHigh.rerollsRemaining=0;
ok(G.importState(oldHigh).ok,'high-reputation legacy run migrates');eq(G.getState().rerollsGranted,1,'legacy run retains original one-refresh group');
eq(G.getState().rerollsRemaining,0,'legacy spent refresh not regranted');
eq(P.key('town',{},3000,G.getState().legacyUnlockRep,G.getState().rerollsGranted),P.key('town',{},1400),'legacy high-reputation score stays in one-refresh profile');

// Active pre-reward saves can earn new bonuses; finished saves cannot backfill them.
const active=G.newGame(10,'town');G.chooseBlueprints(active.pendingDraw.options.slice(0,1));
const oldActive=G.exportState();delete oldActive.rewardVersion;
ok(G.importState(oldActive).ok,'old active save imports');eq(G.getState().rewardVersion,1,'active old run receives new payout rules');
const oldFinished=finish();delete oldFinished.rewardVersion;delete oldFinished.final.rewardVersion;
ok(G.importState(oldFinished).ok,'old final imports');const oldFinal=G.exportState();
eq(oldFinal.rewardVersion,0,'finished old run retains legacy payout');eq(P.growthReward({},oldFinal).total,60,'uncredited legacy final receives base only');
const alreadyPaid=P.loadGrowth({version:1,settled:{[oldFinal.runId]:60}},scores);
eq(P.creditGrowth(alreadyPaid,oldFinal),alreadyPaid,'previously paid final not topped up');
eq(P.growthReward(alreadyPaid,oldFinal).total,60,'UI shows original historical receipt');
for(const bad of [{...first,rewardVersion:99},{...first,final:{...first.final,rewardVersion:0}}]){
  const before=G.exportState();eq(G.importState(bad).ok,false,'invalid payout version rejected');eq(G.exportState(),before,'failed import preserves city');
}
for(const bad of [{...first,turn:29},{...first,over:false},{...first,growthEligible:false},{...first,rewardVersion:0},
  {...first,scenarioId:'bogus',final:{...first.final,scenarioId:'bogus'}},{...first,final:{...first.final,rep:999}},
  {...first,final:{...first.final,cleared:false}},{...first,pop:5,runConfig:{buffIds:['blueprint_pack']},final:{...first.final,runConfig:{buffIds:['blueprint_pack']}}}])
  eq(P.creditGrowth({},bad),P.loadGrowth(),'incomplete or inconsistent final cannot award');
for(const mutate of [r=>r.total++,r=>r.baseRep=-1,r=>r.beforeRep=-1,r=>r.afterRep++,r=>r.scenarioId='bogus',r=>r.cleared=false,r=>r.rewardVersion=9]){
  const r=JSON.parse(JSON.stringify(firstR));mutate(r);
  eq(P.totalRep({version:2,settled:{[first.runId]:r}}),0,'malformed receipt ignored');
}
eq(P.totalRep({version:1,settled:{bad:1,[oldId]:0}}),0,'zero legacy payouts are valid and malformed ids ignored');
eq(P.loadGrowth({version:2,settled:{},legacyClears:{'town|normal':true,'town|normal|extra':true,'__proto__|normal':true}}).legacyClears,{'town|normal':true},'claim keys validated');
console.log('PASS '+passed+' reward assertions');
