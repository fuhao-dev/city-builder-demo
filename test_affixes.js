/* Expanded affixes: unlimited selection, composition arithmetic, real gates, and reward accounting. */
const assert=require('node:assert/strict'),G=require('./game.js'),P=require('./progress.js');
let passed=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);passed++;};
const ok=(v,m)=>{assert(v,m);passed++;};
const all=G.AFFIXES.map(a=>a.id),hard=affixIds=>({difficultyId:'hard',affixIds});
const save=()=>G.exportState();
function ready(affixes=[],scenario='town',buffIds=[]){
  const s=G.newGame(97001,scenario,{...hard(affixes),buffIds},7500);
  ok(G.chooseBlueprints(s.pendingDraw.options.slice(0,s.pendingDraw.count)).ok,'choose opening');return s;
}
eq(all.length,16,'sixteen unique affixes');eq(new Set(all).size,16,'unique catalog ids');
eq(G.normalizeRunConfig(hard(all)).affixIds.length,16,'all sixteen can be selected');
eq(G.normalizeRunConfig(hard(all.slice().reverse())),G.normalizeRunConfig(hard(all)),'all-affix order is canonical');
for(const affixes of [all,all.filter((_,i)=>i%2===0),all.filter((_,i)=>i%2),all.slice(0,3),...all.map(id=>[id])]){
  for(const scenario of G.SCENARIOS){
    const s=ready(affixes,scenario.id),before=save(),f=G.forecast();
    eq(save(),before,'forecast is pure under expanded affixes');
    ok(G.endTurn().ok,'run accepts any number of distinct affixes');
    eq(s.last,f.last,'expanded forecast matches actual settlement');
    const exported=save();ok(G.importState(exported).ok,'expanded save restores');eq(save(),exported,'expanded import is lossless');
  }
}
for(const affixes of [all.concat('idle'),['constructor'],['unknown'],null,[,]]){
  const before=save();assert.throws(()=>G.newGame(1,'town',hard(affixes),7500));passed++;
  eq(save(),before,'invalid affixes preserve city');
  eq(G.importState({...before,runConfig:hard(affixes)}).ok,false,'invalid saved affixes rejected');
  eq(save(),before,'invalid import is atomic');
}
const m=G.runModifiers(hard(all),'town');
eq(m.populationDemand,{food:1.1,material:.55,power:.55,water:.55,clothes:1.1,furniture:1.1,medicine:1.1,education:1.1},'eight demand affixes compose exactly');
eq(m.startingMoney,195,'main and affix starting-money deductions add');eq(m.startingPop,4,'emigration removes one starting resident');
eq(m.idleWorkers,1,'unemployment is independent of emigration');eq(m.buildingCap,22,'cramped removes two building slots');
eq(m.satisfactionPenalty,3,'unease is a separate fixed penalty');
eq(G.runModifiers({...hard(all),buffIds:['settlers']},'town').startingPop,5,'settlers and emigration add');
eq(G.runModifiers({...hard(all),buffIds:['civic_support','water_saving']},'care').populationDemand.medicine,1.089,'main × affix × civic buff retain rate precision');
eq(G.runModifiers({...hard(all),buffIds:['water_saving']},'health').populationDemand.water,.594,'water main × affix × buff');

// Capacity is a real build gate and counts disabled buildings too, including zero-worker buildings.
let s=ready(['cramped']);s.money=10000;s.board=[];
s.unlocked=G.BLUEPRINTS.map(b=>b.id);
s.buildings=G.BASE_BUILDINGS.concat(G.BLUEPRINTS).filter(d=>d.id!=='well').slice(0,21).map((d,i)=>({uid:'fixture-'+i,defId:d.id,active:false}));
eq(G.CAP,24,'exported baseline remains twenty-four');eq(G.buildingCapacity(),22,'actual affixed capacity');
ok(G.build('well').ok,'twenty-second building is allowed');s.hasBuilt=false;
eq(G.buildStatus('farm').ok,false,'twenty-third building rejected');eq(G.buildPreview('farm').ok,false,'preview shares capacity gate');
eq(G.buildStatus('market').ok,false,'zero-worker buildings still need a slot');
const full=save();ok(G.importState(full).ok,'full affixed city restores');eq(G.buildingCapacity(),22,'capacity survives import');

// Price factors multiply before a single upward rounding, and previews actually pay the same cost.
s=ready(['costly_building'],'capital');s.money=1000;s.board=[];
eq(G.buildingCost(G.buildingDef('farm')),96,'ceil(72 ×1.2 ×1.1), no intermediate rounding');
const priceBefore=save(),pricePreview=G.buildPreview('farm');eq(save(),priceBefore,'price preview is pure');
eq(pricePreview.moneyAfter,904,'adjusted preview payment');ok(G.build('farm').ok,'build at adjusted price');eq(s.money,904,'actual payment equals preview');

// Task occupancy and malignant A→B replacement share multiplication and warehouse aggregate rounding.
s=ready(['heavy_tasks']);s.board=[];G.RES.forEach(r=>s.taskSupply[r.key]=20);
s.board=[{uid:'water-fixture',defId:'waterworks',spawnTurn:1}];
s.buildings=[{uid:'warehouse-fixture',defId:'warehouse',active:true}];
eq(G.adjustedTaskOccupancy({water:4}),{water:4.4},'display amount includes affix, before warehouse');
eq(G.taskResourcePreview('water-fixture').occ.water,3.52,'task preview includes 4 ×1.1 ×0.8');
const taskPreview=G.taskResourcePreview('water-fixture');ok(G.acceptTask('water-fixture').ok,'accept scaled task');eq(G.compute(),taskPreview,'actual and preview task balance agree');
s.board.push({uid:'pollution-fixture',defId:'pollution',spawnTurn:1,aReleased:false});
eq(G.compute().occ.material,4.4,'malignant birth burden includes affix and warehouse');
const malignantPreview=G.taskResourcePreview('pollution-fixture');eq(malignantPreview.occ.material,1.76,'preview replaces A with B, without double count');
ok(G.acceptTask('pollution-fixture').ok,'accept malignant task');eq(G.compute(),malignantPreview,'malignant preview equals actual');

// Production affects buildings only, both basic and advanced, while inputs retain their old amount.
s=ready(['worn_tools']);s.board=[];s.taskSupply.food=7;
s.buildings=[{uid:'farm-fixture',defId:'farm',active:true}];
eq(G.buildingOutput(G.buildingDef('farm')),{food:5.7},'building display uses effective output');
eq(G.compute().supply.food,15.7,'base 3 + permanent task 7 + building 5.7');
eq(G.buildingNet(G.buildingDef('farm')),-.8,'comparison uses reduced building output');
s.buildings=[{uid:'pharma-fixture',defId:'pharma',active:true}];G.RES.forEach(r=>s.taskSupply[r.key]=20);
s.taskSupply.medicine=0;s.taskSupply.water=0;
eq(G.compute().advancedOutputPct,75,'water deficit still causes one tier of advanced reduction');
eq(G.compute().supply.medicine,7.84,'11 ×0.95 ×0.75 rounds once at output aggregation');
eq(G.compute().extra.water,2,'production penalty does not reduce building inputs');
eq(G.buildingNet(G.buildingDef('pharma')),-1.05,'advanced comparison includes full inputs and reduced output');

// Fixed satisfaction penalties flow into real reputation tiers, and resident loss is not unemployment.
s=ready();s.turn=30;s.pop=15;s.board=[];G.RES.forEach(r=>s.taskSupply[r.key]=100);s.taskSupply.education=0;
const calm=G.compute();eq(calm.sat,77,'known pre-affix satisfaction');eq(calm.repGain,5,'known pre-affix reputation tier');
s.runConfig=G.normalizeRunConfig(hard(['unease']));const uneasy=G.compute();eq(uneasy.sat,74,'fixed minus-three satisfaction');eq(uneasy.repGain,4,'penalty affects actual reputation tier');
s=ready(['emigration','idle']);eq(s.pop,4,'one resident actually emigrates');eq(G.laborCapacity(),3,'one remaining resident cannot work');
s=ready(['emigration','idle'],'town',['settlers']);eq(s.pop,5,'settler offsets one emigrant');eq(G.laborCapacity(),4,'idle deduction remains fixed');

function finish(affixes,cleared=true){
  const s=ready(affixes,'agriculture');s.turn=30;s.rep=81;s.board=[];s.active=[];s.pop=cleared?15:1;
  G.RES.forEach(r=>s.taskSupply[r.key]=cleared?100:0);ok(G.endTurn().ok,'final fixture settles');return save();
}
const won=finish(all),reward=P.growthReward({},won);
eq(P.rewardPreview({},'agriculture',hard(all)).affixPercent,185,'all sixteen sum past one hundred percent without a cap');
eq(reward.baseRep,81,'full base reputation retained');eq(reward.clearBonus,150,'hard clear base unchanged');
eq(reward.affixBonus,277,'floor(150 ×185%), no bonus cap');eq(reward.firstClearBonus,150,'first clear is not multiplied');eq(reward.total,658,'all reward sources sum');
let ledger=P.creditGrowth({},won);eq(P.totalRep(ledger),658,'full reward credits once');eq(P.creditGrowth(ledger,won),ledger,'all-affix payout idempotent');
const reloaded=P.loadGrowth(JSON.parse(JSON.stringify(ledger)));eq(reloaded,ledger,'large-bonus receipt survives storage');
const different=finish(['heavy_tasks','emigration']);eq(P.growthReward(ledger,different).firstClearBonus,0,'changing affixes does not reset first clear');
eq(P.growthReward({},different).affixBonus,45,'sum two 15% bonuses before rounding, not 22+22');
const loss=finish(all,false),lossReward=P.growthReward(ledger,loss);eq(lossReward.total,81,'failure retains base only');eq(lossReward.affixBonus,0,'no affix bonus on failure');
const records=P.record({},won),key=P.key('agriculture',won.runConfig,7500);ok(records[key],'sixteen-affix result has its own score group');eq(P.load(records),records,'long canonical score keys reload');
eq(P.key('agriculture',hard(all.slice().reverse()),7500),key,'selection order never creates another score group');
ok(G.importState(won).ok,'all-affix completed save restores');eq(save(),won,'completed inputs remain frozen');

// High-stack runs are allowed to finish unsuccessfully; this is a correctness check, not a win-rate target.
s=ready(all);for(let turn=1;turn<=30;turn++)ok(G.endTurn().ok,'all-affix passive run can reach legal T30 settlement');
ok(s.over,'passive high-stack run ended');eq(s.final.cleared,false,'failure is allowed without blocking settlement');
const passive=P.growthReward({},s);eq(passive.total,s.rep,'passive failure still transfers full earned base reputation');
console.log('PASS '+passed+' expanded-affix assertions');
