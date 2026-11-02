/* Legal goal-directed strategies for reproducible balance checks, not human win rates. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const G = require('./game.js');
const profiles = {
  balanced: {weight:2,from:14,margin:2,satWeight:.8},
  focused: {weight:4,from:10,margin:2,satWeight:.7},
  quality: {weight:3,from:14,margin:4,satWeight:1.2}
};
const selected = {town:'balanced',agriculture:'balanced',education:'quality',
  industry:'balanced',health:'focused',metropolis:'quality'};
const baseOrder = ['medschool','geothermal','recycling','warehouse','greenhouse','market','herb',
  'garment','hydrofarm','deepwell','wind','ranch','pharm2','workshop','academy','textile'];
const openingOrder = ['greenhouse','hydrofarm','geothermal','recycling','ranch','deepwell','wind',
  'medschool','warehouse','herb','garment','market','academy','pharm2','workshop','textile'];
const must = (r,label) => { assert(r && r.ok,label+': '+JSON.stringify(r)); return r; };
const net = (c,k) => Math.round((c.supply[k]-c.demand[k]-c.occ[k])*100)/100;
function evaluate(def,c) {
  return def.requirements.map(r=>({...r,current:r.key==='pop'?c.pop:r.key==='sat'?c.sat:net(c,r.resource)}));
}
function utility(c,s,def,cfg) {
  const satTarget=def.requirements.find(r=>r.key==='sat').target;
  let buffers=0,tasks=0;
  for(const p of c.per) buffers+=Math.min(1,Math.max(0,p.sup-p.occ-p.dem)/(p.group==='basic'?4:2))*2;
  for(const t of s.board) {
    const d=G.taskDef(t.defId); if(d.type==='malignant')continue;
    const coverage=Math.min(...Object.keys(d.occ).map(k=>Math.min(1,
      Math.max(0,c.supply[k]-c.occ[k])/(d.occ[k]*(1-c.occDiscount)))));
    tasks+=coverage*(d.type==='timed'?8:2);
  }
  let value=c.repGain*4+Math.min(c.sat,satTarget+cfg.margin+15)*cfg.satWeight+c.sum*.2+buffers+tasks;
  for(const r of def.requirements.filter(r=>r.key==='balance')) {
    const phase=.25+.75*Math.min(1,s.turn/cfg.from);
    value+=Math.min(r.target+cfg.margin,net(c,r.resource))*cfg.weight*phase;
  }
  return value;
}
function adjust(s,def,cfg,trace) {
  for(let guard=0;guard<30;guard++) {
    const over=G.laborUsed()>s.pop, before=utility(G.compute(),s,def,cfg);
    let best;
    for(const b of s.buildings) {
      const d=G.buildingDef(b.defId);
      if(over&&(!b.active||d.labor===0))continue;
      if(!b.active&&d.labor>G.laborAvailable())continue;
      const active=b.active;
      let value;
      try { b.active=!active; value=utility(G.compute(),s,def,cfg); }
      finally { b.active=active; }
      if((over||value>before+.01)&&(!best||value>best.value)) best={b,active:!active,value};
    }
    if(!best) { assert(!over,'must release enough labor'); break; }
    must(G.setBuildingActive(best.b.uid,best.active),'activate');
    trace.push({turn:s.turn,action:'activate',uid:best.b.uid,id:best.b.defId,active:best.active});
  }
}
function acceptTasks(s,def,cfg,trace) {
  const popTarget=def.requirements.find(r=>r.key==='pop').target;
  for(let guard=0;guard<25;guard++) {
    const before=G.forecast(); if(!before)break;
    const c=G.compute(); let best;
    for(const t of s.board) {
      if(!G.taskAcceptStatus(t.uid).ok)continue;
      const d=G.taskDef(t.defId),ft=G.forecastTask(t.uid); if(!ft||ft.last.popLoss)continue;
      const est=G.estimateTaskFinish(t.uid); if(!est.ok||est.late)continue;
      const lostRep=Math.max(0,before.last.repGain-ft.last.repGain)*(est.finishTurn-s.turn);
      const supplyValue=Object.entries(d.reward.sup||{}).reduce((n,[k,v])=>n+v*(G.resource(k).group==='advanced'?1.5:1),0);
      let benefit=d.reward.rep+d.reward.money*.025+supplyValue*Math.max(0,30-est.finishTurn)*.08-
        lostRep-Math.max(0,-ft.delta)*.05;
      if(s.pop<popTarget&&est.finishTurn<=26)benefit+=Math.min(popTarget-s.pop,d.reward.pop+G.TASK_POP_BONUS)*4;
      if(s.pop>=popTarget) for(const r of def.requirements.filter(r=>r.key==='balance'))
        benefit+=Math.min(d.reward.sup?.[r.resource]||0,Math.max(0,r.target+cfg.margin-net(c,r.resource)))*cfg.weight;
      if(benefit>0&&(!best||benefit>best.benefit))best={uid:t.uid,id:d.id,benefit};
    }
    if(!best)break;
    must(G.acceptTask(best.uid),'accept'); trace.push({turn:s.turn,action:'accept',uid:best.uid,id:best.id});
  }
}
function play(seed,id,basicOnly=false,profile=selected[id]) {
  const def=G.SCENARIOS.find(d=>d.id===id),cfg=profiles[profile];
  assert(def&&cfg,'known scenario and profile');
  const s=G.newGame(seed,id),trace=[],popTarget=id==='health'?15:def.requirements.find(r=>r.key==='pop').target;
  let guard=0,firstQualified=null;
  while(!s.over&&guard++<300) {
    if(s.rewardQueue.length) {
      const choice=s.pop<popTarget&&(G.laborAvailable()<=2||s.turn>=8)?'pop':'sup';
      must(G.chooseReward(choice),'reward'); trace.push({turn:s.turn,action:'reward',choice}); continue;
    }
    if(s.pendingDraw) {
      const resources=def.requirements.filter(r=>r.key==='balance').map(r=>r.resource);
      const preferred=id==='metropolis'?['medschool','geothermal','recycling','herb','garment','market']:
        resources.includes('medicine')?['pharm2','medschool','herb','geothermal','recycling','market']:
        resources.includes('material')?['recycling','geothermal','wind','garment','warehouse']:
        resources.includes('food')?['greenhouse','hydrofarm','herb','ranch']:
        resources.includes('education')?['academy','medschool','geothermal','recycling','deepwell','wind']:[];
      const order=[...new Set(preferred.concat(s.pendingDraw.source==='opening'?openingOrder:baseOrder))];
      const ids=s.pendingDraw.options.slice().sort((a,b)=>order.indexOf(a)-order.indexOf(b)).slice(0,s.pendingDraw.count||1);
      must(G.chooseBlueprints(ids),'blueprints'); trace.push({turn:s.turn,action:'blueprints',ids}); continue;
    }
    adjust(s,def,cfg,trace);
    const c=G.compute();
    if(!basicOnly&&!s.hasBuilt&&s.turn<=20&&G.townUpgradeStatus().ok&&c.sat>=35&&c.advancedShort<=1) {
      must(G.upgradeTown(),'upgrade'); trace.push({turn:s.turn,action:'upgrade'}); continue;
    }
    if(!s.hasBuilt) {
      const before=utility(G.compute(),s,def,cfg); let best;
      for(const d of (basicOnly?G.BASE_BUILDINGS:G.BASE_BUILDINGS.concat(G.BLUEPRINTS))) {
        // A legal replacement can first pause an existing building to release its worker.
        const options=G.buildStatus(d.id).ok?[null]:d.labor>G.laborAvailable()?
          s.buildings.filter(b=>b.active&&G.buildingDef(b.defId).labor>0):[];
        for(const off of options) {
          let preview;
          try {
            if(off)off.active=false;
            if(G.buildStatus(d.id).ok)preview=G.buildPreview(d.id);
          } finally { if(off)off.active=true; }
          if(!preview||!preview.ok)continue;
          const value=utility(preview.after,s,def,cfg)-before-Math.sqrt(d.cost)*.1;
          if(value>.1&&(!best||value>best.value))best={id:d.id,value,off};
        }
      }
      if(best) {
        if(best.off) {
          must(G.setBuildingActive(best.off.uid,false),'release worker');
          trace.push({turn:s.turn,action:'activate',uid:best.off.uid,id:best.off.defId,active:false});
        }
        must(G.build(best.id),'build'); trace.push({turn:s.turn,action:'build',id:best.id});
      }
    }
    if(s.turn<30)acceptTasks(s,def,cfg,trace);
    else {
      for(const t of s.active.slice()) {
        must(G.abandonTask(t.uid),'terminal abandon');trace.push({turn:30,action:'abandon',uid:t.uid,id:t.defId});
      }
      adjust(s,def,cfg,trace);
    }
    if(firstQualified===null&&evaluate(def,G.compute()).every(r=>r.current>=r.target))firstQualified=s.turn;
    must(G.endTurn(),'end');trace.push({turn:s.turn,action:'end'});
  }
  assert(s.over&&s.turn===30&&s.money>=0&&s.pop>=1&&s.buildings.length<=G.CAP,'legal finished run');
  const conditions=evaluate(def,G.compute());
  const cleared=conditions.every(r=>r.current>=r.target);
  assert.equal(s.final.cleared,cleared,'production evaluation agrees with independent oracle');
  const save=G.exportState(); must(G.importState(save),'save roundtrip');
  assert.deepEqual(G.getState().final,s.final,'final snapshot survives save roundtrip');
  const blueprintsBuilt=s.buildings.filter(b=>!G.BASE_BUILDINGS.some(d=>d.id===b.defId)).length;
  if(basicOnly)assert.equal(blueprintsBuilt,0,'base-building-only route');
  return {seed,id,basicOnly,profile,cleared,rep:s.rep,pop:s.pop,sat:s.final.sat,money:s.money,
    buildings:s.buildings.length,blueprintsBuilt,firstQualified,conditions,
    types:Object.fromEntries([...new Set(s.buildings.map(b=>b.defId))].map(id=>[id,s.buildings.filter(b=>b.defId===id).length])),trace};
}
function summarize(rows) {
  const avg=key=>+(rows.reduce((sum,r)=>sum+r[key],0)/rows.length).toFixed(2);
  return {id:rows[0].id,basicOnly:rows[0].basicOnly,profile:rows[0].profile,runs:rows.length,
    cleared:rows.filter(r=>r.cleared).length,meanPop:avg('pop'),meanSat:avg('sat'),meanBuildings:avg('buildings'),
    failSeeds:rows.filter(r=>!r.cleared).map(r=>r.seed)};
}
if(require.main===module) {
  const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
  const count=Number(args.seeds||20),start=Number(args.start||30001);
  assert(Number.isInteger(count)&&count>0&&count<=1000,'seeds must be 1–1000');
  assert(Number.isInteger(start)&&start>=0&&start+count-1<=4294967295,'valid seed range');
  const ids=args.levels?args.levels.split(','):G.SCENARIOS.map(d=>d.id);
  assert(ids.every(id=>G.SCENARIOS.some(d=>d.id===id)),'unknown level');
  const rows=[],summaries=[];
  for(const id of ids)for(const basicOnly of [false,true]) {
    const group=[];
    for(let n=0;n<count;n++)group.push(play(start+n,id,basicOnly,args.profile||selected[id]));
    rows.push(...group);const summary=summarize(group);summaries.push(summary);console.log(JSON.stringify(summary));
  }
  if(args.output)fs.writeFileSync(args.output,JSON.stringify({seeds:{start,count},profiles,selected,summaries,rows},null,2));
}
module.exports={play,summarize};
