/* Complete fresh-account journeys using legal runs and the real settlement ledger. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const G=require('./game.js'),P=require('./progress.js'),S=require('./simulate_scenarios.js');
const levels=G.SCENARIOS.map(s=>s.id);
const loadouts={construction:['settlers','preparation','water_saving','material_aid','power_aid','food_aid','civic_support','blueprint_pack'],
  blueprints:['blueprint_pack','civic_support','food_aid','material_aid','power_aid','preparation','water_saving','settlers']};
const policies=['tour','challenge','town','basic'];
function configAt(total,difficultyId,loadout){
  let buffIds=[];
  for(const id of loadouts[loadout])if(G.runConfigStatus({difficultyId,buffIds:buffIds.concat(id)},total).ok)buffIds.push(id);
  return G.normalizeRunConfig({difficultyId,buffIds});
}
function journey(start,gameCount=12,policy='tour',loadout='construction'){
  assert(policies.includes(policy)&&loadouts[loadout],'known journey policy');
  let ledger=P.loadGrowth();const rows=[],claims=new Set(),milestones={firstBuff:null,reroll:null,openingBuff:null,firstBatch:null,allBlueprints:null,maxCapacity:null,secondBatch:null,secondReroll:null,finalCapacity:null};
  for(let index=0;index<gameCount;index++){
    const before=P.totalRep(ledger),available=G.growthStatus(before).scenarioIds;
    const intended=policy==='town'?'town':policy==='challenge'?levels[index%6]:levels[index%levels.length];
    const id=available.includes(intended)?intended:available[available.length-1];
    const difficultyId=policy==='challenge'&&index>=6?'hard':'normal';
    const runConfig=configAt(before,difficultyId,loadout);
    assert(G.runConfigStatus(runConfig,before).ok,'only unlocked affordable buffs are selected');
    const row=S.play(start+index,id,policy==='basic',undefined,runConfig,before),save=G.exportState();
    const score=save.rep,claim=id+'|'+difficultyId,definition=P.REWARDS[id];
    const clear=row.cleared?definition.clear*(difficultyId==='hard'?2:1):0;
    const first=row.cleared&&!claims.has(claim)?definition.first:0;
    const preview=P.growthReward(ledger,save);
    assert.equal(P.totalRep(ledger),before,'preview never credits');
    ledger=P.creditGrowth(ledger,save);
    const receipt=ledger.settled[save.runId],after=P.totalRep(ledger);
    assert.deepEqual(receipt,preview,'preview matches actual receipt');
    assert.equal(receipt.total,score+clear+first,'independent first-clear accounting');
    assert.equal(after,before+receipt.total,'account total equals previous plus receipt');
    assert.equal(G.getState().rep,score,'growth bonus never changes in-run score');
    assert.equal(G.getState().growthRep,before,'unlocks never change the active run');
    assert.deepEqual(P.creditGrowth(ledger,save),ledger,'end render does not duplicate credit');
    ledger=P.loadGrowth(JSON.parse(JSON.stringify(ledger)));
    assert.equal(P.totalRep(ledger),after,'account survives JSON persistence');
    if(row.cleared)claims.add(claim);
    const thresholds={firstBuff:G.BUFFS.find(b=>b.id==='settlers').unlockRep,reroll:G.REROLL_UNLOCK_REP,
      openingBuff:G.BUFFS.find(b=>b.id==='blueprint_pack').unlockRep,firstBatch:G.SCENARIOS.find(s=>s.id==='logistics').unlockRep,
      allBlueprints:Math.max(...G.BLUEPRINTS.map(b=>b.unlockRep||0)),maxCapacity:G.CAPACITY_LEVELS.find(l=>l.capacity===6).rep,
      secondBatch:G.SCENARIOS.find(s=>s.id==='capital').unlockRep,secondReroll:G.SECOND_REROLL_REP,
      finalCapacity:G.CAPACITY_LEVELS.find(l=>l.capacity===7).rep};
    for(const [key,rep] of Object.entries(thresholds))if(milestones[key]===null&&after>=rep)milestones[key]=index+1;
    rows.push({game:index+1,seed:row.seed,id,difficultyId,runConfig,growthBefore:before,cleared:row.cleared,
      baseRep:score,clearBonus:clear,firstClearBonus:first,income:receipt.total,growthAfter:after,
      capacity:G.growthStatus(after).capacity,pool:G.growthStatus(after).blueprintIds.length,pop:row.pop,sat:row.sat});
  }
  return {start,policy,loadout,games:rows.length,cleared:rows.filter(r=>r.cleared).length,totalRep:P.totalRep(ledger),milestones,rows};
}
function summarize(accounts){
  const groups=[];
  for(const policy of [...new Set(accounts.map(a=>a.policy))])for(const loadout of [...new Set(accounts.map(a=>a.loadout))]){
    const set=accounts.filter(a=>a.policy===policy&&a.loadout===loadout);if(!set.length)continue;
    const range=key=>{const values=set.map(a=>a.milestones[key]).filter(n=>n!==null);return {reached:values.length,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null};};
    groups.push({policy,loadout,accounts:set.length,games:set.reduce((n,a)=>n+a.games,0),cleared:set.reduce((n,a)=>n+a.cleared,0),
      totalRepRange:[Math.min(...set.map(a=>a.totalRep)),Math.max(...set.map(a=>a.totalRep))],
      milestones:Object.fromEntries(Object.keys(set[0].milestones).map(key=>[key,range(key)]))});
  }
  return groups;
}
if(require.main===module){
  const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
  const count=Number(args.accounts||3),games=Number(args.games||12),start=Number(args.start||71001);
  const selectedPolicies=(args.policies||policies.join(',')).split(','),selectedLoadouts=(args.loadouts||Object.keys(loadouts).join(',')).split(',');
  assert(Number.isInteger(count)&&count>0&&count<=100,'accounts must be 1–100');
  assert(Number.isInteger(games)&&games>0&&games<=30,'games must be 1–30');
  assert(Number.isInteger(start)&&start>=0&&start+count*games<=4294967295,'valid seed range');
  const accounts=[];
  for(const policy of selectedPolicies)for(const loadout of selectedLoadouts)for(let n=0;n<count;n++){
    const account=journey(start+n*games,games,policy,loadout);accounts.push(account);
    console.log(JSON.stringify({...account,rows:undefined}));
  }
  const summaries=summarize(accounts);console.log(JSON.stringify({summaries}));
  if(args.output)fs.writeFileSync(args.output,JSON.stringify({version:'3.14.0',accounts,summaries},null,2));
}
module.exports={journey,summarize,configAt};
