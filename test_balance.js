/* 平衡观察：简单贪心 AI 跑 5 个种子，接取所有可接任务，看声望 / 人口 / 建筑 / 任务完成 */
const G = require('./game.js');

const PRIORITY = ['farm', 'well', 'mine', 'plant', 'clothes', 'furniture', 'school', 'pharma'];

function autoPlay(seed) {
  const s = G.newGame(seed);
  let guard = 0;
  while (!s.over && guard++ < 300) {
    if (s.rewardQueue && s.rewardQueue.length) {
      G.chooseReward(G.laborAvailable() <= 1 ? 'pop' : 'sup');
      continue;
    }
    if (s.pendingDraw) {
      const pc = s.pendingDraw.count || 1;
      G.chooseBlueprints(s.pendingDraw.options.slice(0, pc));
      continue;
    }
    if (!s.hasBuilt && s.turn <= 24 && G.townUpgradeStatus().ok) {
      G.upgradeTown();
      continue;
    }
    if (!s.hasBuilt) {
      let built = false;
      for (const id of PRIORITY) {
        if (G.buildStatus(id).ok) { G.build(id); built = true; break; }
      }
      if (!built) {
        for (const id of s.unlocked) {
          if (G.buildStatus(id).ok) { G.build(id); built = true; break; }
        }
      }
    }
    const tasks = s.board.filter(x => G.taskDef(x.defId).type !== 'malignant');
    for (const t of tasks) G.acceptTask(t.uid);
    let dg = 0;
    while (G.laborUsed() > s.pop && dg++ < 30) {
      const b = s.buildings.find(x => x.active);
      if (!b) break;
      G.setBuildingActive(b.uid, false);
    }
    const r = G.endTurn();
    if (!r.ok) break;
  }
  return s;
}

const rows = [];
for (const seed of [1, 7, 42, 99, 2026]) {
  const s = autoPlay(seed);
  rows.push({
    seed,
    turn: s.turn,
    rep: s.rep,
    money: s.money,
    pop: s.pop,
    sat: s.sat,
    level: s.townLevel,
    buildings: s.buildings.length,
    unlocked: s.unlocked.length,
    tasksDone: s.stats.tasksDone,
    popLost: s.stats.popLost,
    final: s.final
  });
}
console.log(JSON.stringify(rows, null, 2));
