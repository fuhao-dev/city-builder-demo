/* 局内 v3.3 引擎测试：起手 / 劳力 / 停用 / 任务 / 限时 / 恶性 / 蓝图 / 30 回合 */
const G = require('./game.js');

let passed = 0;
function ok(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  passed++;
}
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + a + ', want ' + b + ')'); }
function near(a, b, msg) { ok(Math.abs(a - b) < 1e-6, msg + ' (got ' + a + ', want ' + b + ')'); }

/* 1. 起手 */
let s = G.newGame(1);
eq(s.turn, 1, 'T1');
eq(s.pop, 5, 'P5');
eq(s.money, 300, '300 金');
near(s.sat, 0, '起手满意度 0');
eq(s.rep, 0, '起手 0 声望');
eq(s.board.length, 4, '起始 4 任务');
eq(s.last.per.length, 8, '8 资源');
eq(s.pendingDraw.options.length, 3, '开局 3 选 1');
ok(s.last.penalty === 5, 'P5 人口惩罚 5');
ok(s.last.sum === 18, '八项起手 18');

/* 2. 选蓝图 */
let picked = s.pendingDraw.options[0];
ok(G.chooseBlueprint(picked).ok, '选择蓝图');
eq(s.unlocked.length, 1, '解锁 1 张');
eq(s.pendingDraw, null, '选完关闭');
ok(G.chooseBlueprint(picked).ok === false, '重复选择失败');

/* 3. 建造 / 回合推进 */
ok(G.build('farm').ok, '建农场');
eq(s.money, 240, '农场后 240');
eq(G.laborUsed(), 1, '劳力 1');
ok(G.build('farm').ok === false, '每回合只能建 1 次');
ok(G.setBuildingActive(s.buildings[0].uid, false).ok, '停用农场');
eq(G.laborUsed(), 0, '停用后劳力 0');
ok(G.setBuildingActive(s.buildings[0].uid, true).ok, '启用农场');
eq(G.laborUsed(), 1, '启用后劳力 1');
ok(G.endTurn().ok, '进入 T2');
eq(s.turn, 2, 'T2');
near(s.sat, 4, 'T2 满意度 4');
eq(s.backlog === undefined, true, 'no backlog');

/* 4. 四基础 + 劳力门槛 */
ok(G.build('well').ok, '建水厂');
G.endTurn();
eq(s.turn, 3, 'T3');
near(s.sat, 10, 'T3 满意度 10');
ok(G.build('mine').ok, '建原料站');
G.endTurn();
eq(s.turn, 4, 'T4');
near(s.sat, 16, 'T4 满意度 16');
ok(G.build('plant').ok, '建电站');
G.endTurn();
eq(s.turn, 5, 'T5');
near(s.sat, 22, 'T5 满意度 22');
eq(s.rep, 1, 'T5 声望 1');
eq(G.laborUsed(), 4, '四基础劳力 4');
eq(s.money, 50, 'T5 金钱 50');
let clothesTry = G.build('clothes');
ok(clothesTry.ok === false && clothesTry.error.indexOf('劳力') >= 0, 'T5 服装厂被劳力挡住');

/* 5. 停用释放劳力；任务补人后才建得起 */
ok(G.setBuildingActive(s.buildings[0].uid, false).ok, '停用农场');
eq(G.laborUsed(), 3, '释放后劳力 3');
eq(G.laborAvailable(), 2, '可用 2');
clothesTry = G.build('clothes');
ok(clothesTry.ok === false, '还是建不起（钱/劳力）');
ok(G.setBuildingActive(s.buildings[0].uid, true).ok, '重新启用农场');

/* 6. 开垦任务：占用、完成奖励、补人解锁服装厂 */
let reclaim = s.board.find(t => t.defId === 'reclaim');
ok(!!reclaim, '任务栏有开垦');
ok(G.acceptTask(reclaim.uid).ok, '接开垦');
eq(s.active.length, 1, '进行中 1');
G.endTurn(); // T6
G.endTurn(); // T7
G.endTurn(); // T8，开垦完成
eq(s.turn, 8, 'T8');
eq(s.pop, 6, '开垦 +1 人 → P6');
eq(s.money, 130, '开垦 +80 → 130');
eq(s.rep, 7, 'T5 1 + T6/T7/T8 3 + 开垦 3 = 7');
eq(G.laborUsed(), 4, '四基础仍 4');
ok(G.build('clothes').ok, 'P6 后服装厂落地');
eq(s.money, 30, '服装厂后 30');
eq(G.laborUsed(), 6, '4 基础 + 服装厂 2 = 6');

/* 7. 停用服装厂 → 劳力释放；重新启用 */
let clothes = s.buildings.find(b => b.defId === 'clothes');
ok(G.setBuildingActive(clothes.uid, false).ok, '停用服装厂');
eq(G.laborUsed(), 4, '停用后 4');
ok(G.setBuildingActive(clothes.uid, true).ok, '重新启用服装厂');
eq(G.laborUsed(), 6, '恢复 6');

/* 8. 人口低于已占用：不能进下回合 */
let savedPop = s.pop;
s.pop = 4;
let endRes = G.endTurn();
ok(endRes.ok === false && endRes.error.indexOf('劳力不足') >= 0, '劳力不足禁止进入下回合');
ok(G.setBuildingActive(clothes.uid, false).ok, '停用服装厂腾劳力');
eq(G.laborUsed(), 4, '已占用 4 = 人口 4');
ok(G.endTurn().ok, '停用后可以进入下回合');
eq(s.turn, 9, 'T9');
s.pop = savedPop; // 还原，避免影响后续

/* 9. 限时任务到期 */
let s2 = G.newGame(2);
G.chooseBlueprint(s2.pendingDraw.options[0]);
let relief = s2.board.find(t => t.defId === 'relief');
ok(!!relief && relief.acceptBy === 4, '紧急救济 T4 截止');
G.endTurn(); G.endTurn(); G.endTurn(); // T2/T3/T4
ok(s2.board.some(t => t.defId === 'relief'), 'T4 结束前仍在');
G.endTurn(); // 结束 T4 → T5
ok(!s2.board.some(t => t.defId === 'relief'), 'T4 结束后移除');

/* 10. 恶性任务 A/B */
let s3 = G.newGame(3);
G.chooseBlueprint(s3.pendingDraw.options[0]);
s3.board.push({ uid: 'test-m', defId: 'pollution', spawnTurn: 1, progress: 0, aReleased: false });
G.endTurn(); // T2，出生负担 A = 原料 5
eq(s3.last.occ.material, 5, '恶性 A 占用原料 5');
let preview = G.previewTask('test-m');
ok(typeof preview === 'number', '接取前能预览满意度');
ok(G.acceptTask('test-m').ok, '接取恶性');
G.endTurn(); // T3，接取占用 B = 原料 2
eq(s3.last.occ.material, 2, '恶性 B 占用原料 2');
ok(G.abandonTask('test-m').ok, '放弃恶性');
eq(s3.board.find(t => t.uid === 'test-m').aReleased, true, 'A 已释放');
G.endTurn(); // T4
eq(s3.last.occ.material, 0, '放弃后 A 不回来');

/* 11. 声望节点蓝图 */
let s4 = G.newGame(4);
G.chooseBlueprint(s4.pendingDraw.options[0]);
s4.rep = 10;
G.endTurn(); // T2；checkNodes 在 T2 开局触发
ok(!!s4.pendingDraw, '声望 10 触发蓝图');
eq(s4.pendingDraw.node, 10, '节点 10');
ok(G.chooseBlueprint(s4.pendingDraw.options[0]).ok, '选节点蓝图');
eq(s4.unlocked.length, 2, '开局 + 节点 = 2 张');

/* 12. 30 回合自动跑：只验证不崩、不越界 */
function autoPlay(seed) {
  const st = G.newGame(seed);
  let guard = 0;
  const priority = ['farm', 'well', 'mine', 'plant', 'clothes', 'furniture', 'school', 'pharma'];
  while (!st.over && guard++ < 300) {
    if (st.pendingDraw) {
      G.chooseBlueprint(st.pendingDraw.options[0]);
      continue;
    }
    if (!st.hasBuilt) {
      for (const id of priority) {
        if (G.buildStatus(id).ok) { G.build(id); break; }
      }
    }
    const t = st.board.find(x => G.taskDef(x.defId).type !== 'malignant');
    if (t) G.acceptTask(t.uid);
    let dg = 0;
    while (G.laborUsed() > st.pop && dg++ < 30) {
      const b = st.buildings.find(x => x.active);
      if (!b) break;
      G.setBuildingActive(b.uid, false);
    }
    const r = G.endTurn();
    if (!r.ok) break;
  }
  return st;
}

const results = [];
for (const seed of [1, 7, 42]) {
  const st = autoPlay(seed);
  ok(st.over === true, 'seed ' + seed + ' 结束');
  eq(st.turn, 30, 'seed ' + seed + ' T30');
  ok(st.money >= 0, 'seed ' + seed + ' 金钱非负');
  ok(st.pop >= 1, 'seed ' + seed + ' 人口 ≥1');
  ok(st.buildings.length <= G.CAP, 'seed ' + seed + ' 建筑 ≤24');
  ok(st.rep >= 0, 'seed ' + seed + ' 声望 ≥0');
  results.push({
    seed: seed, rep: st.rep, money: st.money, pop: st.pop,
    sat: st.sat, buildings: st.buildings.length, tasksDone: st.stats.tasksDone
  });
}

console.log('PASS ' + passed + ' assertions');
console.log(JSON.stringify(results, null, 2));
