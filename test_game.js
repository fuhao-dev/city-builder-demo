/* 局内 v3.5.0 引擎测试：起手 / 建筑人口 / 停用 / 任务 / 限时 / 恶性 / 蓝图 / 回合压力 / 30 回合 */
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
eq(s.board.length, 5, '起始 5 任务');
eq(s.last.per.length, 8, '8 资源');
eq(s.pendingDraw.options.length, 3, '开局 3 选 1');
ok(s.last.penalty === 5, 'P5 人口惩罚 5');
ok(s.last.sum === 18, '八项起手 18');

/* 1.1 建筑人口：全部 ≤1，蓝图中有 0 人口 */
const allBuildings = G.BASE_BUILDINGS.concat(G.BLUEPRINTS);
eq(allBuildings.every(d => d.labor <= 1), true, '所有建筑最多 1 人口');
eq(G.BLUEPRINTS.filter(d => d.labor === 0).length >= 2, true, '至少两种蓝图 0 人口');
eq(G.buildingDef('market').labor, 0, '市场 0 人口');
eq(G.buildingDef('warehouse').labor, 0, '仓库 0 人口');

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
ok(clothesTry.ok === false && clothesTry.error.indexOf('金钱') >= 0, 'T5 服装厂被金钱挡住（劳力已够）');

/* 5. 停用释放劳力；任务补人后才建得起 */
ok(G.setBuildingActive(s.buildings[0].uid, false).ok, '停用农场');
eq(G.laborUsed(), 3, '释放后劳力 3');
eq(G.laborAvailable(), 2, '可用 2');
clothesTry = G.build('clothes');
ok(clothesTry.ok === false && clothesTry.error.indexOf('金钱') >= 0, '还是建不起（钱不够）');
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
eq(s.pop, 10, '开垦 +1 + 任务人口奖励 4 → P10');
eq(s.money, 210, '开垦 +160 → 210');
eq(s.rep, 5, 'T5/T6/T7 共 5 声望；T8 人口升到 10，满意度 14.08 不给声望，开垦 +3');
eq(G.laborUsed(), 4, '四基础仍 4');
ok(G.build('clothes').ok, 'P10 后服装厂落地（1 劳力）');
eq(G.buildingDef('clothes').labor, 1, '服装厂只占 1 人口');
eq(s.money, 110, '服装厂后 110');
eq(G.laborUsed(), 5, '4 基础 + 服装厂 1 = 5');

/* 7. 停用服装厂 → 劳力释放；重新启用 */
let clothes = s.buildings.find(b => b.defId === 'clothes');
ok(G.setBuildingActive(clothes.uid, false).ok, '停用服装厂');
eq(G.laborUsed(), 4, '停用后 4');
ok(G.setBuildingActive(clothes.uid, true).ok, '重新启用服装厂');
eq(G.laborUsed(), 5, '恢复 5');

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

/* 8.5 按建筑类型设置启用数量 */
let s5 = G.newGame(5);
G.chooseBlueprint(s5.pendingDraw.options[0]);
ok(G.build('farm').ok, '数量测试：建第 1 座农场');
G.endTurn();
ok(G.build('farm').ok, '数量测试：建第 2 座农场');
eq(s5.buildings.filter(b => b.defId === 'farm').length, 2, '2 座农场');
eq(G.laborUsed(), 2, '2 座全启用');
ok(G.setBuildingCount('farm', 1).ok, '设置农场启用 1 座');
eq(s5.buildings.filter(b => b.defId === 'farm' && b.active).length, 1, '只剩 1 座启用');
eq(G.laborUsed(), 1, '释放 1 劳力');
ok(G.setBuildingCount('farm', 0).ok, '设置农场启用 0 座');
eq(G.laborUsed(), 0, '全部停用');
ok(G.setBuildingCount('farm', 2).ok, '重新启用 2 座');
eq(G.laborUsed(), 2, '恢复 2 劳力');
ok(G.setBuildingCount('farm', 3).ok === false, '不能超过已建数');
ok(s5.hasBuilt === true, '调整数量不算建造行动');
s5.pop = 1;
ok(G.setBuildingCount('farm', 1).ok, '人口降到 1，先停 1 座');
let countRes = G.setBuildingCount('farm', 2);
ok(countRes.ok === false && countRes.error.indexOf('劳力') >= 0, '人口不足时不能启用第 2 座');
ok(G.setBuildingCount('farm', 0).ok, '全部停用');
eq(G.laborUsed(), 0, '劳力归零');
s5.pop = 5;
ok(G.setBuildingCount('water', 1).ok === false, '没有水厂时不能设置数量');

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

/* 12. 存档、下回合预测、蓝图差异化 */
let sv = G.newGame(21);
G.chooseBlueprint(sv.pendingDraw.options[0]);
let svMoney = sv.money;
ok(G.build('farm').ok, '存档测试：建农场');
let svBuildings = sv.buildings.length;
let fc = G.forecast();
ok(!!fc && !!fc.last, '下回合预测可用');
eq(fc.last.per[0].sup, 9, '预测食物 = 基础 3 + 农场 6');
eq(fc.last.sat, 4, '预测满意度 4');
eq(sv.turn, 1, '预测不推进真实回合');
eq(sv.buildings.length, svBuildings, '预测不增删建筑');
eq(sv.money, svMoney - 60, '预测不改真实金钱');

let exported = G.exportState();
ok(exported && exported.version === G.SAVE_VERSION, '存档带版本号');
ok(typeof exported.rngState === 'number' && !exported.rng, '存档保存随机数状态，不存函数');

G.newGame(22);
G.chooseBlueprint(G.getState().pendingDraw.options[0]);
let imported = G.importState(exported);
ok(imported.ok, '读档成功');
eq(G.getState().seed, 21, '读档种子一致');
eq(G.getState().money, svMoney - 60, '读档金钱一致');
eq(G.getState().buildings.length, svBuildings, '读档建筑一致');
let fc2 = G.forecast();
eq(fc2.last.sat, fc.last.sat, '读档后预测一致');

let badSave = Object.assign({}, exported, { version: 0 });
ok(G.importState(badSave).ok === false, '版本不兼容的存档被拒绝');

G.importState(exported);
let reclaimT = G.getState().board.find(t => t.defId === 'reclaim');
let ft = G.forecastTask(reclaimT.uid);
ok(!!ft && typeof ft.sat === 'number', '接取后预测可用');
ok(ft.delta <= 0, '开垦占用食物，接取后预测下降');
eq(G.getState().turn, 1, '接取预测不推进真实回合');
eq(G.getState().board.length, 5, '接取预测不移除真实任务');

eq(G.buildingDef('wind').labor, 1, '风电站 1 劳力');
eq(G.buildingDef('wind').out.power, 8, '风电站 8 电');
eq(G.buildingDef('deepwell').labor, 1, '深水井 1 劳力');
eq(G.buildingDef('deepwell').out.water, 8, '深水井 8 水');

/* 12.5 回合压力：T1–6 为 0，T7 起线性增加到 T30 的 -5；正负基础满意度都扣 */
const negCases = [
  { turn: 4,  next: 5,  pressure: 0,    sat: -6,    popLoss: 1 },
  { turn: 9,  next: 10, pressure: 0.83, sat: -6.83, popLoss: 1 },
  { turn: 14, next: 15, pressure: 1.88, sat: -7.88, popLoss: 1 },
  { turn: 19, next: 20, pressure: 2.92, sat: -8.92, popLoss: 1 },
  { turn: 24, next: 25, pressure: 3.96, sat: -9.96, popLoss: 1 },
  { turn: 29, next: 30, pressure: 5,    sat: -11,   popLoss: 2 }
];
for (const c of negCases) {
  const st = G.newGame(31);
  G.chooseBlueprint(st.pendingDraw.options[0]);
  const relief = st.board.find(t => t.defId === 'relief');
  G.acceptTask(relief.uid);
  st.turn = c.turn;
  const f = G.forecast();
  eq(f.last.turnPressure, c.pressure, 'T' + c.next + ' 回合压力 ' + c.pressure);
  eq(f.last.sat, c.sat, 'T' + c.next + ' 满意度 ' + c.sat);
  eq(f.last.popLoss, c.popLoss, 'T' + c.next + ' 掉人口 ' + c.popLoss);
  eq(G.getState().turn, c.turn, 'T' + c.next + ' 预测不推进真实回合');
}

/* 基础满意度为正 / 为 0 时，T30 仍会扣满 5 点回合压力 */
const posState = G.newGame(32);
G.chooseBlueprint(posState.pendingDraw.options[0]);
G.build('farm');
posState.turn = 29;
const posF = G.forecast();
ok(posF.last.baseSat > 0, 'T30 正数基础满意度');
eq(posF.last.turnPressure, 5, '正数基础满意度 T30 仍扣 5');
eq(posF.last.sat, -1, '正数基础满意度 T30 被压到 -1');

const zeroState = G.newGame(33);
G.chooseBlueprint(zeroState.pendingDraw.options[0]);
zeroState.turn = 29;
const zeroF = G.forecast();
eq(zeroF.last.baseSat, 0, 'T30 基础满意度为 0');
eq(zeroF.last.turnPressure, 5, '基础满意度 0 时 T30 也扣 5');
eq(zeroF.last.sat, -5, '基础满意度 0 时 T30 为 -5');
eq(zeroF.last.popLoss, 1, '基础满意度 0 时 T30 掉 1 人口');

/* 12.6 声望档位：20 起才 +1，此前 10–19.9 只有稳定 */
eq(G.repGainFor(11.9), 0, '11.9 不加声望');
eq(G.repGainFor(12.4), 0, '12.4 不加声望');
eq(G.repGainFor(18.4), 0, '18.4 不加声望');
eq(G.repGainFor(19.99), 0, '19.99 不加声望');
eq(G.repGainFor(20), 1, '20 声望 +1');
eq(G.repGainFor(29.99), 1, '29.99 声望 +1');
eq(G.repGainFor(30), 2, '30 声望 +2');
eq(G.repGainFor(60), 5, '60 声望 +5');
eq(G.repGainFor(70), 5, '70 封顶 +5');

/* 12.7 同资源超额：接取前必须有正余量；供给下降后仍会超额减速 */
const overState = G.newGame(51);
G.chooseBlueprint(overState.pendingDraw.options[0]);
for (const id of ['farm', 'well', 'mine', 'plant']) {
  if (!G.build(id).ok) throw new Error('超额测试建筑失败: ' + id);
  G.endTurn();
}
G.endTurn(); // T6
overState.board = [
  { uid: 'ov-mining', defId: 'mining', spawnTurn: 6, acceptBy: 99 },
  { uid: 'ov-pollution', defId: 'pollution', spawnTurn: 6, acceptBy: 99 },
  { uid: 'ov-prospect', defId: 'prospect', spawnTurn: 6, acceptBy: 99 }
];
eq(G.acceptTask('ov-mining').ok, true, '接取第 1 个原料任务');
eq(G.acceptTask('ov-pollution').ok, true, '接取第 2 个原料任务（此时原料仍有正余量）');
const ovGate = G.acceptTask('ov-prospect');
ok(ovGate.ok === false && ovGate.error.indexOf('当前产出') >= 0, '原料占用达到供给后，不能再接第 3 个');
// 供给下降：停用原料站，制造已接任务的超额
const mineB = overState.buildings.find(b => b.defId === 'mine');
ok(G.setBuildingActive(mineB.uid, false).ok, '停用原料站，制造供给下降');
const overF = G.forecast();
eq(overF.last.over, 5, '原料占用 6 - 供给 1 = 超额 5');
eq(G.taskProgressStep('ov-mining'), 0.5, '超额 3+ 时每回合只推进 0.5');
G.endTurn(); // T7
eq(G.getState().active.every(t => t.progress === 0.5), true, '两个任务都只推进 0.5');
eq(G.getState().active.every(t => t.progress < 1), true, '没有任务在 T7 完成');

/* 12.8 高级资源：低阶不足停产；0 产出任务不能接 */
const advBad = G.newGame(88);
G.chooseBlueprint(advBad.pendingDraw.options[0]);
ok(G.build('clothes').ok, '无基础时也能先建服装厂');
const badFc = G.forecast();
eq(badFc.last.advancedStopped, true, '低阶资源不足时高级建筑停产');
eq(badFc.last.supply.clothes, 0, '衣服产出为 0');
eq(badFc.last.extra.power, 0, '停产时不再消耗电力');
advBad.board.push({ uid: 'zero-clothes', defId: 'festival', spawnTurn: 1, acceptBy: 9 });
const zeroGate = G.acceptTask('zero-clothes');
ok(zeroGate.ok === false && zeroGate.error.indexOf('当前产出') >= 0, '0 产出资源上的任务不能接取');

const advGood = G.newGame(89);
G.chooseBlueprint(advGood.pendingDraw.options[0]);
for (const id of ['farm', 'well', 'mine', 'plant']) {
  if (!G.build(id).ok) throw new Error('高级测试建基础失败: ' + id);
  G.endTurn();
}
advGood.money = 300;
ok(G.build('clothes').ok, '基础齐后建服装厂');
const goodFc = G.forecast();
eq(goodFc.last.advancedStopped, false, '低阶资源充足时高级建筑恢复生产');
eq(goodFc.last.supply.clothes, 3, '衣服产出 3');

/* 12.9 刷新节点一次追加 3 张（2 普通 + 1 特殊） */
const rf = G.newGame(77);
G.chooseBlueprint(rf.pendingDraw.options[0]);
rf.board = [];
rf.turn = 5;
rf.hasBuilt = true;
G.endTurn(); // T6
eq(rf.turn, 6, '刷新测试到 T6');
eq(rf.board.length, 3, 'T6 刷新追加 3 张');

/* 13. 30 回合自动跑：只验证不崩、不越界 */
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
