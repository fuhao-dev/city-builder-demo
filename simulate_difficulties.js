/* Paired seeds, unlock-time growth, and real legal actions for scenario hard rules and optional affixes. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const G=require('./game.js'),L=require('./loadouts.js'),S=require('./simulate_scenarios.js');
function run(start=94001,count=5){
  const rows=[],summaries=[];
  const variants=[{name:'normal',difficultyId:'normal',affixIds:[]},
    {name:'hard',difficultyId:'hard',affixIds:[]},
    // Keep the original v3.15.0 comparison reproducible; new affixes are verified for arithmetic, not clear rates.
    ...['idle','tight_budget','dry','rations'].map(id=>({name:id,difficultyId:'hard',affixIds:[id]})),
    {name:'idle+rations',difficultyId:'hard',affixIds:['idle','rations']}];
  for(const scenario of G.SCENARIOS){
    const growthRep=scenario.unlockRep||0;
    // Use the same legal BUFFs for every difficulty/affix of this scenario, so only the challenge changes.
    const advice=L.recommendation(scenario.id,'normal',growthRep);
    const profile=scenario.id==='capital'?'livable':undefined;
    for(const variant of variants){
      const config=G.normalizeRunConfig({difficultyId:variant.difficultyId,buffIds:advice.buffIds,affixIds:variant.affixIds});
      assert(G.runConfigStatus(config,growthRep).ok,'unlocked legal setup');
      const group=[];
      for(let n=0;n<count;n++){
        const row=S.play(start+n,scenario.id,false,profile,config,growthRep);
        assert.equal(G.getState().growthRep,growthRep,'growth stays frozen');
        group.push({...row,variant:variant.name});
      }
      rows.push(...group);
      const failures={};
      for(const row of group.filter(r=>!r.cleared))for(const condition of row.conditions.filter(c=>c.current<c.target))failures[condition.label]=(failures[condition.label]||0)+1;
      const summary={...S.summarize(group),variant:variant.name,failures};summaries.push(summary);console.log(JSON.stringify(summary));
    }
  }
  return {hardRulesVersion:G.HARD_RULES_VERSION,seeds:{start,count},summaries,rows};
}
if(require.main===module){
  const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
  const start=Number(args.start||94001),count=Number(args.seeds||5);
  assert(Number.isInteger(start)&&start>=0&&Number.isInteger(count)&&count>0&&count<=100&&start+count-1<=4294967295,'valid seed range');
  const result=run(start,count);
  if(args.output)fs.writeFileSync(args.output,JSON.stringify(result,null,2));
}
module.exports={run};
