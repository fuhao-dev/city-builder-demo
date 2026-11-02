/* v3.10.0: scenario goals, live final-turn evaluation, forecasts and legacy saves. */
const assert = require('node:assert/strict');
const G = require('./game.js');
let passed = 0;
const eq = (a,b,label) => { assert.deepEqual(a,b,label); passed++; };
const ok = (value,label) => { assert(value,label); passed++; };
const snapshot = () => JSON.stringify(G.exportState());
function ready(id, pop) {
  const s = G.newGame(15,id);
  G.chooseBlueprint(s.pendingDraw.options[0]);
  s.pop = pop;
  s.turn = 30;
  s.board = [];
  s.active = [];
  s.money = 1000;
  G.RES.forEach(r=>{s.taskSupply[r.key]=100;});
  return s;
}
function fixed(pop,sat,net,key='food') {
  const c={pop,sat,supply:{},demand:{},occ:{}};
  c.supply[key]=30+net;c.demand[key]=25;c.occ[key]=5;
  return c;
}
eq(G.SCENARIOS.map(s=>s.id),['town','agriculture','education'],'three confirmed scenarios');
eq(G.newGame(15).scenarioId,'town','backward compatible default scenario');
for(const id of ['missing','__proto__','constructor']) {
  const before=snapshot();
  assert.throws(()=>G.newGame(15,id),/未知关卡/);passed++;
  eq(snapshot(),before,'invalid scenario preserves current city');
}
eq(G.evaluateScenario('missing',fixed(20,100,30)),null,'unknown scenario has no result');
eq(G.evaluateScenario('town',fixed(9,20,0)).cleared,true,'town exact boundary');
eq(G.evaluateScenario('town',fixed(8,100,0)).cleared,false,'population requirement cannot be replaced by satisfaction');
eq(G.evaluateScenario('town',fixed(9,19.99,0)).cleared,false,'town satisfaction just below threshold');
eq(G.evaluateScenario('agriculture',fixed(15,35,18)).cleared,true,'agriculture exact boundary');
eq(G.evaluateScenario('agriculture',fixed(15,35,17.99)).cleared,false,'agriculture includes city demand and task occupation');
eq(G.evaluateScenario('agriculture',fixed(14,100,50)).cleared,false,'all agriculture conditions required');
eq(G.evaluateScenario('education',fixed(12,50,4,'education')).cleared,true,'education exact boundary');
eq(G.evaluateScenario('education',fixed(12,50,3.99,'education')).cleared,false,'education threshold is four');
eq(G.evaluateScenario('education',fixed(12,49.99,20,'education')).cleared,false,'education requires a livable city');
const deficit=G.evaluateScenario('agriculture',fixed(15,35,-2));
eq(deficit.conditions.find(r=>r.key==='balance').shortfall,20,'shortfall starts from negative resource balance');

for(const id of G.SCENARIOS.map(s=>s.id)) {
  const s=ready(id,20);
  s.rep=123;
  s.sat=-99; // The historical settlement must not determine the live goal result.
  const before=snapshot();
  const live=G.goalStatus();
  eq(live.cleared,true,id+' current conditions are met');
  eq(s.over,false,id+' early qualification does not finish the game');
  eq(snapshot(),before,id+' checking goals has no side effects');
  const projection=G.forecast();
  eq(projection.final.cleared,true,id+' forecast includes final evaluation');
  eq(projection.last.repGain,0,id+' final validation does not project duplicate reputation');
  eq(snapshot(),before,id+' forecast does not award a clear');
  ok(G.endTurn().ok,id+' final validation succeeds');
  eq(s.final.goal,live,id+' final result captures exact current requirements');
  eq(s.final.cleared,true,id+' final clear');
  eq(s.final.sat,live.conditions.find(r=>r.key==='sat').current,id+' final satisfaction uses current supply');
  eq(s.rep,123,id+' no reputation awarded by goal evaluation');
  eq(G.endTurn().ok,false,id+' cannot validate twice');
  const saved=G.exportState();
  G.newGame(1);
  ok(G.importState(saved).ok,id+' completed save restores');
  eq(G.getState().final.goal,live,id+' completed goal snapshot survives reload');
}

const failed=ready('agriculture',15);
failed.taskSupply.food=29.99; // base 3 + 29.99 - population 15 = 17.99
failed.rep=999;
eq(G.goalStatus().cleared,false,'high score does not bypass the food requirement');
ok(G.endTurn().ok,'failed scenario still finishes normally');
eq(failed.final.cleared,false,'failed goal is explicitly not a clear');
eq(failed.final.rep,999,'failed scenario retains its score');
eq(failed.final.goal.conditions.find(r=>r.key==='balance').current,17.99,'final failure explains the missing resource');

const temporary=ready('town',9);
eq(G.goalStatus().cleared,true,'temporary qualification');
temporary.pop=8;
G.endTurn();
eq(temporary.final.cleared,false,'temporary qualification is not permanently latched');

const warehouse=ready('agriculture',15);
warehouse.buildings=[{uid:'wh',defId:'warehouse',active:true}];
warehouse.active=[{uid:'food-task',defId:'reclaim',progress:0}];
warehouse.taskSupply.food=34;
eq(G.compute().occ.food,4,'warehouse occupation is discounted');
eq(G.goalStatus().conditions.find(r=>r.key==='balance').current,18,'goal shares warehouse-aware resource calculation');
eq(G.goalStatus().cleared,true,'warehouse-aware goal qualifies');

const school=ready('education',12);
school.buildings=[{uid:'school1',defId:'school',active:true},{uid:'school2',defId:'school',active:true}];
school.taskSupply.education=0;
for(const k of ['food','material','power','water'])school.taskSupply[k]=0;
ok(G.compute().advancedOutputPct<100,'school production is reduced without its inputs');
eq(G.goalStatus().cleared,false,'nameplate education production cannot qualify a stopped school');
for(const k of ['food','material','power','water'])school.taskSupply[k]=100;
eq(G.goalStatus().conditions.find(r=>r.key==='balance').current,4,'working schools satisfy population before extra education');
eq(G.goalStatus().cleared,true,'restored inputs make education goal achievable');
G.setBuildingActive('school1',false);
eq(G.goalStatus().cleared,false,'inactive school no longer counts');

const build=ready('education',12);
build.taskSupply.education=2;
build.buildings=[{uid:'first-school',defId:'school',active:true}];
const beforeBuild=snapshot();
eq(G.goalStatus().cleared,false,'before final-turn construction');
const preview=G.buildPreview('school');
ok(preview.ok,'last-turn construction can be previewed');
eq(G.goalStatus(preview.after).cleared,true,'preview uses post-construction goal progress');
eq(snapshot(),beforeBuild,'preview does not construct or complete the scenario');
ok(G.build('school').ok,'last-turn construction is legal');
const finalProjection=G.forecast();
eq(finalProjection.final.cleared,true,'final projection sees the new school');
eq(finalProjection.last.supply.education,18,'T30 resource forecast uses current construction');
eq(finalProjection.last.repGain,0,'T30 construction does not add another settlement');
G.endTurn();
eq(build.final.cleared,true,'last-turn construction counts at final evaluation');

const reward=ready('agriculture',15);
reward.taskSupply.food=29; // net 17
reward.rewardQueue=[{name:'粮食援助',pop:3,money:0,rep:3,sup:{food:1}}];
eq(G.endTurn().ok,false,'must choose pending reward before evaluation');
ok(G.chooseReward('sup').ok,'resource reward can be chosen on T30');
eq(G.goalStatus().cleared,true,'reward is included in the live goal');
G.endTurn();
eq(reward.final.cleared,true,'final reward counts toward clear');

const task=ready('agriculture',15);
task.taskSupply.food=30;
task.active=[{uid:'still-active',defId:'reclaim',progress:0}];
eq(G.goalStatus().cleared,false,'active occupation reduces goal surplus');
ok(G.abandonTask('still-active').ok,'final-turn task abandonment is legal');
eq(G.goalStatus().cleared,true,'released occupation is reflected immediately');
G.endTurn();
eq(task.final.cleared,true,'evaluation uses final task choices');

const future=ready('town',9);
future.turn=29;
const futureBefore=snapshot();
const next=G.forecast();
eq(next.over,false,'T29 forecast begins T30, it does not finish the scenario');
ok(next.last.repGain>0,'entering T30 still earns normal per-turn reputation');
eq(snapshot(),futureBefore,'T29 forecast leaves scenario intact');

let legacy=G.exportState();
delete legacy.scenarioId;
ok(G.importState(legacy).ok,'unfinished v3.9 save restores');
eq(G.getState().scenarioId,null,'legacy run remains free play');
eq(G.goalStatus(),null,'legacy save gets no retroactive objective');
G.getState().turn=30;
G.endTurn();
eq(G.getState().final.cleared,null,'legacy finish is not a clear or a failure');
eq(G.getState().final.goal,null,'legacy finish has no scenario results');
const legacyCompleted=G.exportState();
delete legacyCompleted.scenarioId;
delete legacyCompleted.final.scenarioId;
delete legacyCompleted.final.cleared;
delete legacyCompleted.final.goal;
ok(G.importState(legacyCompleted).ok,'completed v3.9 save restores');
eq(G.getState().final.cleared,null,'completed legacy run cannot claim a scenario clear');

const real=G.newGame(15,'education');
const valid=G.exportState();
const invalid={...valid,scenarioId:'constructor'};
const validBefore=snapshot();
eq(G.importState(invalid).ok,false,'invalid saved scenario rejected');
eq(snapshot(),validBefore,'invalid import preserves current game');
eq(G.getState(),real,'invalid import does not replace state reference');
eq(G.importState({...valid,final:{scenarioId:'town'}}).ok,false,'mismatched saved result rejected');

console.log('PASS '+passed+' scenario assertions');
