/* Configuration arithmetic, integration, save migration and isolated progress records. */
const assert=require('node:assert/strict');
const G=require('./game.js');
const P=require('./progress.js');
let passed=0;
const eq=(a,b,message)=>{assert.deepEqual(a,b,message);passed++;};
const ok=(value,message)=>{assert(value,message);passed++;};
const snapshot=()=>JSON.stringify(G.exportState());
const round=n=>Math.round(n*100)/100;
const normal={difficultyId:'normal',buffIds:[]};
function ready(config,scenario='town') {
  const s=G.newGame(15,scenario,config);
  G.chooseBlueprint(s.pendingDraw.options[0]);
  return s;
}
eq(G.DIFFICULTIES.map(x=>x.id),['normal','hard'],'two difficulties');
eq(G.BUFFS.map(x=>x.id),['none','preparation','food_aid','water_saving','settlers','blueprint_pack'],'base and growth buffs');
eq(G.normalizeRunConfig(),normal,'standard default');
eq(G.runModifiers(normal).occupancyCost,6.5,'baseline worker cost');
eq(G.runModifiers({difficultyId:'hard'}).occupancyCost,7.475,'hard worker cost retains precision');
eq(G.runModifiers({buffId:'water_saving'}).occupancyCost,6.45,'water buff updates worker cost');
eq(G.runModifiers({difficultyId:'hard',buffId:'water_saving'}).occupancyCost,7.4175,'multiplicative demand modifiers');

for(const d of G.DIFFICULTIES)for(const b of G.BUFFS.filter(b=>b.unlockRep===0)) {
  const config={difficultyId:d.id,buffId:b.id},s=ready(config),c=G.compute();
  eq(s.runConfig,G.normalizeRunConfig(config),'run stores canonical chosen ids');
  eq(s.money,b.id==='preparation'?360:300,'starting money applies once');
  eq(c.supply.food,b.id==='food_aid'?5:3,'food aid modifies recurring base supply');
  for(const r of G.RES) {
    const rate=r.demand*(d.id==='hard'?1.15:1)*(b.id==='water_saving'&&r.key==='water'?.9:1);
    eq(c.demand[r.key],round(5*rate),config.difficultyId+'/'+config.buffId+' demand '+r.key);
  }
  const before=snapshot(),fc=G.forecast();
  eq(snapshot(),before,'forecast is pure under configuration');
  ok(fc&&fc.last,'configuration can be forecast');
  eq(G.endTurn().ok,true,'configuration advances');
  eq(s.last,fc.last,'forecast and actual configured settlement agree');
  eq(G.compute().supply.food,b.id==='food_aid'?5:3,'food bonus persists next turn');
  const money=s.money,save=G.exportState();
  ok(G.importState(save).ok,'configured run restores');
  eq(G.getState().money,money,'import never grants starting money again');
  eq(G.getState().runConfig,G.normalizeRunConfig(config),'config survives save');
}

const input={difficultyId:'hard',buffId:'water_saving'};
const precision=ready(input);
input.buffId='food_aid';
eq(precision.runConfig.buffIds,['water_saving'],'caller cannot change chosen configuration through original argument');
precision.pop=9;
eq(G.compute().populationDemand.water,.5175,'population rate is not rounded early');
eq(G.compute().demand.water,4.66,'nine people consume rounded total, not rounded per-person rate');
const expectedCost=7.4175;
eq(G.buildingNet(G.buildingDef('farm')),round(6-expectedCost),'building net uses configured worker demand');
eq(G.buildingNet(G.buildingDef('pharma')),round(11-5-expectedCost),'building inputs do not receive population demand multipliers');
eq(G.buildingNet(G.buildingDef('farm'),normal),-.5,'explicit baseline net can be compared');
eq(G.OCCUPANCY_COST,6.5,'exported baseline constant remains backward compatible');

const inputs=ready({difficultyId:'hard',buffId:'water_saving'},'health');
inputs.pop=9;inputs.board=[];
inputs.buildings=[{uid:'pharma',defId:'pharma',active:true}];
inputs.taskSupply={food:20,material:20,power:20,water:20,clothes:20,furniture:20,medicine:0,education:20};
eq(G.compute().demand.water,6.66,'extra building water is added after effective population demand');
eq(G.compute().demand.power,7.18,'extra building electricity is unscaled');
inputs.taskSupply.water=0;
eq(G.compute().advancedOutputPct,75,'configured low-tier shortage reduces pharmaceuticals');
eq(G.compute().advancedReasons.find(r=>r.key==='water').popNeed,4.66,'shortage reason uses effective population demand');
eq(G.compute().advancedReasons.find(r=>r.key==='water').extraNeed,2,'shortage reason separates building inputs');
eq(G.compute().supply.medicine,8.25,'actual medicine supply reflects reduction');

for(const config of [{difficultyId:'normal',buffId:'food_aid'},{difficultyId:'hard',buffId:'water_saving'}]) {
  const s=ready(config),task=s.board.find(t=>t.defId==='waterworks');
  const before=snapshot(),preview=G.taskResourcePreview(task.uid);
  eq(snapshot(),before,'configured task preview is pure');
  eq(preview.occ.water,4,'difficulty and buff do not scale task occupation');
  ok(G.acceptTask(task.uid).ok,'task can be accepted');
  eq(G.compute(),preview,'task preview matches actual configured balance');
  const pop=s.pop;
  eq(preview.demand.water,round(pop*.5*(config.difficultyId==='hard'?1.15:1)*
    (config.buffId==='water_saving'?.9:1)),'preview uses effective city demand');
}
const warehouse=ready({difficultyId:'hard',buffId:'water_saving'});
warehouse.buildings=[{uid:'wh',defId:'warehouse',active:true}];
warehouse.active=[{uid:'water-task',defId:'waterworks',progress:0}];
eq(G.compute().occ.water,3.2,'warehouse discount is applied once independently of demand changes');

const final=ready({difficultyId:'hard',buffId:'food_aid'},'agriculture');
final.turn=30;final.pop=15;final.board=[];final.active=[];final.money=1000;
G.RES.forEach(r=>final.taskSupply[r.key]=100);
final.taskSupply.food=30.25; // Base 3 + aid 2 + reward 30.25 - hard population demand 17.25 = 18.
eq(G.goalStatus().conditions.find(r=>r.resource==='food').current,18,'configured final goal includes aid and increased demand');
const beforeFinal=snapshot(),projection=G.forecast();
eq(snapshot(),beforeFinal,'configured final forecast is pure');
eq(projection.final.runConfig,final.runConfig,'forecast final stores chosen configuration');
eq(projection.last.repGain,0,'validation does not add another configured settlement');
ok(G.endTurn().ok,'configured final validation');
eq(final.final.cleared,true,'configured final clear');
eq(final.final.runConfig,final.runConfig,'configuration is part of frozen final result');

const completed=G.exportState();
ok(G.importState(completed).ok,'completed configured run restores');
eq(G.getState().final,completed.final,'completed final remains stable');
const old=ready(normal);old.money=17;
const oldSave=G.exportState();delete oldSave.runConfig;
ok(G.importState(oldSave).ok,'pre-configuration active save migrates');
eq(G.getState().runConfig,normal,'old city stays standard');
eq(G.getState().money,17,'migration preserves spent money');
G.getState().turn=30;G.endTurn();
const oldEnd=G.exportState();delete oldEnd.runConfig;delete oldEnd.final.runConfig;
ok(G.importState(oldEnd).ok,'pre-configuration completed save migrates');
eq(G.getState().final.runConfig,normal,'old final gets standard configuration');

for(const bad of ['hard',[],{difficultyId:'constructor'},{buffId:'__proto__'},
  {buffId:['preparation','food_aid']},{buffIds:['preparation','food_aid']},{populationDemand:0}]) {
  const before=snapshot();
  assert.throws(()=>G.newGame(1,'town',bad));passed++;
  eq(snapshot(),before,'invalid configuration cannot replace current city');
  const saved=G.exportState();saved.runConfig=bad;
  eq(G.importState(saved).ok,false,'invalid saved config is rejected');
  eq(snapshot(),before,'invalid import preserves active city');
}
const mismatch=G.exportState();mismatch.final.runConfig={difficultyId:'hard',buffId:'none'};
eq(G.importState(mismatch).ok,false,'saved final must match city configuration');

const legacy={town:{cleared:true,bestRep:100},health:{cleared:true,bestRep:150}};
const records=P.load({},legacy);
eq(records['town|normal|none'].bestRep,100,'legacy clear maps to normal with no buff');
eq(records['town|hard|none'],undefined,'legacy clear cannot claim hard mode');
eq(records['town|normal|food_aid'],undefined,'legacy clear cannot claim buff mode');
eq(legacy.town.bestRep,100,'record migration does not mutate input');
eq(P.load({'town|hard|none':{cleared:true,bestRep:90}},legacy)['town|normal|none'].bestRep,100,'migration retains legacy and new records together');
eq(Object.keys(P.load({'town|bad|none':{cleared:true,bestRep:999},
  'town|hard|none':{cleared:true,bestRep:Infinity}})).length,0,'unknown configurations and corrupt scores are ignored');
const won=completed;
let updated=P.record(records,won);
eq(updated['agriculture|hard|food_aid'].bestRep,won.final.rep,'clear credited only to actual difficulty and buff');
eq(updated['town|normal|none'].bestRep,100,'new clear retains legacy progress');
eq(updated['agriculture|hard|none'],undefined,'buffed clear does not credit no-buff challenge');
eq(P.record(updated,won),updated,'repeated rendering is idempotent');
const lower=JSON.parse(JSON.stringify(won));lower.final.rep=0;
eq(P.record(updated,lower),updated,'lower score cannot overwrite best');
const failed=JSON.parse(JSON.stringify(won));failed.final.cleared=false;
eq(P.record(records,failed),records,'failure never awards clear');
eq(P.record(records,{...won,over:false}),records,'forecast or active run never awards clear');
const wrong=JSON.parse(JSON.stringify(won));wrong.final.runConfig=normal;
eq(P.record(records,wrong),records,'mismatched final cannot award another configuration');
console.log('PASS '+passed+' run configuration assertions');
