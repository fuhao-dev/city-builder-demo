/* Fixed unlock-time loadouts, held-out seeds, and independent final-goal verification. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const G=require('./game.js'),L=require('./loadouts.js'),S=require('./simulate_scenarios.js');
const stages=[2000,4500,5000];
function configurations(rep,id,difficultyId){
  const suggested=L.recommendation(id,difficultyId,rep);
  let alternative=rep===2000?['blueprint_pack','water_saving']:
    rep===4500?['settlers','food_aid','material_aid']:['civic_support','power_aid','water_saving'];
  if(alternative.slice().sort().join('|')===suggested.buffIds.join('|'))alternative=['blueprint_pack','power_aid','water_saving'];
  return [{name:'suggested',buffIds:suggested.buffIds},{name:'alternative',buffIds:alternative}];
}
function run(start=92001,count=10,selectedStages=stages){
  const rows=[],summaries=[];
  for(const growthRep of selectedStages){
    assert(stages.includes(growthRep),'known unlock milestone');
    const ids=growthRep===2000?['logistics','manufacturing','research']:['resilience','care','capital'];
    for(const id of ids)for(const difficultyId of ['normal','hard'])for(const config of configurations(growthRep,id,difficultyId)){
      assert(G.runConfigStatus({difficultyId,buffIds:config.buffIds},growthRep).ok,'unlocked and affordable configuration');
      const profile=['care','capital'].includes(id)||(id==='resilience'&&difficultyId==='hard')?'livable':undefined;
      const group=[];
      for(let n=0;n<count;n++){
        const row=S.play(start+n,id,false,profile,{difficultyId,buffIds:config.buffIds},growthRep);
        const allowed=G.growthStatus(growthRep);
        for(const action of row.trace)if(action.action==='blueprints')assert(action.ids.every(b=>allowed.blueprintIds.includes(b)),'no future blueprint access');
        assert.equal(G.getState().growthRep,growthRep,'no reputation injection during play');
        group.push({...row,loadout:config.name});
      }
      rows.push(...group);
      const failures={};
      for(const row of group.filter(r=>!r.cleared))for(const c of row.conditions.filter(c=>c.current<c.target))failures[c.label]=(failures[c.label]||0)+1;
      const summary={...S.summarize(group),loadout:config.name,failures};summaries.push(summary);console.log(JSON.stringify(summary));
    }
  }
  return {seeds:{start,count},stages:selectedStages,summaries,rows};
}
if(require.main===module){
  const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
  const start=Number(args.start||92001),count=Number(args.seeds||10),selectedStages=(args.stages||stages.join(',')).split(',').map(Number);
  assert(Number.isInteger(start)&&start>=0&&Number.isInteger(count)&&count>0&&count<=100&&start+count-1<=4294967295,'valid seed range');
  const result=run(start,count,selectedStages);
  if(args.output)fs.writeFileSync(args.output,JSON.stringify(result,null,2));
}
module.exports={configurations,run};
