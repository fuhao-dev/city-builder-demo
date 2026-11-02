/* 局内 v3.9.1 引擎测试：起手 / 净产出 / 城镇 / 混合蓝图 / 停用 / 任务 / 限时 / 恶性 / 回合压力 / 30 回合 */
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
near(s.sat, 9, '起手满意度 9（15 分制、旧赤字 13）');
eq(s.rep, 0, '起手 0 声望');
eq(s.board.length, 5, '起始 5 任务');
eq(s.last.per.length, 8, '8 资源');
eq(s.pendingDraw.options.length, 3, '开局 3 选 1');
ok(s.last.penalty === 5, 'P5 人口惩罚 5');
ok(s.last.sum === 27, '八项起手 27（每项满分15）');

/* 1.1 建筑人口：全部 ≤1，蓝图中有 0 人口 */
const allBuildings = G.BASE_BUILDINGS.concat(G.BLUEPRINTS);
eq(allBuildings.every(d => d.labor <= 1), true, '所有建筑最多 1 人口');
eq(G.BLUEPRINTS.filter(d => d.labor === 0).length >= 2, true, '至少两种蓝图 0 人口');
eq(G.buildingDef('market').labor, 0, '市场 0 人口');
eq(G.buildingDef('warehouse').labor, 0, '仓库 0 人口');

/* 1.2 净产出：1 人占用 = 6.5 负向产出；基础净 -0.5，蓝图净 +1.5 */
function outSum(d) {
  return Object.keys(d.out || {}).reduce(function (sum, k) { return sum + d.out[k]; }, 0);
}
function extraSum(d) {
  return Object.keys(d.extra || {}).reduce(function (sum, k) { return sum + d.extra[k]; }, 0);
}
near(G.OCCUPANCY_COST, 6.5, '一人八项需求合计 6.5（四项高阶各 1）');
['clothes', 'furniture', 'medicine', 'education'].forEach(function (k) {
  eq(G.resource(k).demand, 1, '高阶资源人均需求 1：' + G.resource(k).name);
});
eq(G.buildingNet(G.buildingDef('market')), null, '市场 0 劳力无净产出');
eq(G.buildingNet(G.buildingDef('warehouse')), null, '仓库 0 劳力无净产出');
G.BASE_BUILDINGS.forEach(function (d) {
  near(G.buildingNet(d), -0.5, '基础生产建筑净产出 -0.5：' + d.name);
});
G.BLUEPRINTS.filter(function (d) { return d.labor > 0; }).forEach(function (d) {
  near(G.buildingNet(d), 1.5, '蓝图净产出 +1.5：' + d.name);
});
['clothes', 'furniture', 'pharma', 'school'].forEach(function (id) {
  near(G.buildingNet(G.buildingDef(id)), -0.5, '高阶基础建筑净产出 -0.5：' + G.buildingDef(id).name);
});
['textile', 'workshop', 'pharm2', 'academy', 'herb', 'medschool'].forEach(function (id) {
  near(G.buildingNet(G.buildingDef(id)), 1.5, '高阶蓝图净产出 +1.5：' + G.buildingDef(id).name);
});
var basicPairs = { greenhouse: 'farm', ranch: 'farm', wind: 'plant', deepwell: 'well' };
Object.keys(basicPairs).forEach(function (bpId) {
  var bp = G.buildingDef(bpId);
  var base = G.buildingDef(basicPairs[bpId]);
  ok(outSum(bp) > outSum(base), bp.name + ' 产出高于 ' + base.name);
  ok(G.buildingNet(bp) > G.buildingNet(base), bp.name + ' 净产出高于 ' + base.name);
});
var advancedPairs = { textile: 'clothes', workshop: 'furniture', pharm2: 'pharma', academy: 'school' };
Object.keys(advancedPairs).forEach(function (bpId) {
  var bp = G.buildingDef(bpId);
  var base = G.buildingDef(advancedPairs[bpId]);
  ok(outSum(bp) > outSum(base), bp.name + ' 产出高于 ' + base.name);
  ok(G.buildingNet(bp) > G.buildingNet(base), bp.name + ' 净产出高于 ' + base.name);
  ok(extraSum(bp) > extraSum(base), bp.name + ' 额外消耗高于 ' + base.name + '（蓝图用投入换净产出）');
});

/* 2. 选蓝图 + 混合建筑池 */
eq(G.BLUEPRINTS.length, 16, '蓝图池 16 张（10 单产 + 6 混合）');
eq(s.pendingDraw.options.length, 3, '开局 3 张候选');
eq(s.pendingDraw.count, 1, '开局选 1 张');
eq(s.pendingDraw.source, 'opening', '开局来源标记');
const MIXED_IDS = ['hydrofarm', 'geothermal', 'recycling', 'herb', 'garment', 'medschool'];
MIXED_IDS.forEach(function (id) {
  const m = G.buildingDef(id);
  ok(!!m, '混合蓝图存在：' + id);
  eq(Object.keys(m.out).length, 2, '双产出：' + m.name);
  eq(m.labor, 1, '双产出 1 劳力：' + m.name);
  eq(m.max, 1, '双产出上限 1：' + m.name);
  ok(m.cost > 0 && Object.keys(m.extra || {}).length > 0, '双产出有额外投入：' + m.name);
});
eq(G.TOWN_LEVELS.length, 4, '城镇 4 级');
eq(JSON.stringify(G.TOWN_LEVELS), JSON.stringify([6, 9, 12, 15]), '城镇人口门槛 P6/P9/P12/P15');
let picked = s.pendingDraw.options[0];
ok(G.chooseBlueprint(picked).ok, '选择蓝图');
eq(s.unlocked.length, 1, '解锁 1 张');
eq(s.pendingDraw, null, '选完关闭');
ok(G.chooseBlueprint(picked).ok === false, '重复选择失败');

/* 3. 建造 / 回合推进 */
ok(G.build('farm').ok, '建农场');
eq(s.money, 228, '农场后 228');
eq(G.laborUsed(), 1, '劳力 1');
ok(G.build('farm').ok === false, '每回合只能建 1 次');
ok(G.setBuildingActive(s.buildings[0].uid, false).ok, '停用农场');
eq(G.laborUsed(), 0, '停用后劳力 0');
ok(G.setBuildingActive(s.buildings[0].uid, true).ok, '启用农场');
eq(G.laborUsed(), 1, '启用后劳力 1');
ok(G.endTurn().ok, '进入 T2');
eq(s.turn, 2, 'T2');
near(s.sat, 15, 'T2 满意度 15');
eq(s.backlog === undefined, true, 'no backlog');

/* 4. 四基础 + 劳力门槛 */
ok(G.build('well').ok, '建水厂');
G.endTurn();
eq(s.turn, 3, 'T3');
near(s.sat, 24, 'T3 满意度 24');
ok(G.build('mine').ok, '建原料站');
G.endTurn();
eq(s.turn, 4, 'T4');
near(s.sat, 33, 'T4 满意度 33');
ok(G.build('plant').ok, '建电站');
G.endTurn();
eq(s.turn, 5, 'T5');
near(s.sat, 42, 'T5 满意度 42');
eq(s.rep, 6, 'T5 声望 6（T3 +1、T4 +2、T5 +3）');
eq(G.laborUsed(), 4, '四基础劳力 4');
eq(s.money, 48, 'T5 金钱 48');
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
eq(s.rewardQueue.length, 1, '开垦完成 → 奖励待选择');
let reclaimOffer = s.rewardQueue[0];
eq(reclaimOffer.pop, 3, '开垦人口选项 1 + 任务奖励 2 = 3');
eq(reclaimOffer.money, 160, '开垦金钱 160');
eq(reclaimOffer.rep, 3, '开垦声望 3');
eq(reclaimOffer.sup.food, 3, '开垦资源选项 食物 3');
let rewardMoney = s.money;
let rewardEnd = G.endTurn();
ok(rewardEnd.ok === false && rewardEnd.error.indexOf('奖励') >= 0, '未选奖励不能进下回合');
let badChoice = G.chooseReward('bad');
ok(badChoice.ok === false && s.money === rewardMoney, '非法奖励选择不改金钱');
ok(G.chooseReward('pop').ok, '选择人口奖励');
eq(s.pop, 8, '开垦人口 +3 → P8');
eq(s.money, 208, '开垦 +160 → 208');
eq(s.rep, 16, 'T5 6 + T6/T7 +2、T8 +3 + 开垦 +3 = 16');
eq(G.laborUsed(), 4, '四基础仍 4');
ok(G.build('clothes').ok, 'P8 后服装厂落地（1 劳力）');
eq(G.buildingDef('clothes').labor, 1, '服装厂只占 1 人口');
eq(s.money, 108, '服装厂后 108');
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

/* 6.1 任务奖励二选一：资源选项；多个完成时排队 */
let sr = G.newGame(41);
G.chooseBlueprint(sr.pendingDraw.options[0]);
sr.board = [];
sr.active = [{ uid: 'rw-sup', defId: 'irrigate', spawnTurn: 1, progress: 1, aReleased: false }];
let beforeSup = sr.taskSupply.food;
let beforePop = sr.pop;
let beforeMoney = sr.money;
G.endTurn(); // T2，灌溉完成
eq(sr.rewardQueue.length, 1, '灌溉完成 → 1 个奖励待选');
eq(sr.pop, beforePop, '奖励未选前不加人口');
ok(G.build('farm').ok === false, '奖励未选前不能建造');
ok(G.chooseReward('sup').ok, '选择资源奖励');
eq(sr.pop, beforePop, '资源奖励不加人口');
eq(sr.taskSupply.food, beforeSup + 2, '灌溉资源奖励 食物 +2');
eq(sr.money, beforeMoney + 120, '灌溉金钱 +120');
eq(sr.rewardQueue.length, 0, '资源奖励领取后队列清空');

let sr2 = G.newGame(42);
G.chooseBlueprint(sr2.pendingDraw.options[0]);
sr2.board = [];
sr2.active = [
  { uid: 'rw-a', defId: 'reclaim', spawnTurn: 1, progress: 3, aReleased: false },
  { uid: 'rw-b', defId: 'irrigate', spawnTurn: 1, progress: 2, aReleased: false }
];
G.endTurn(); // T2，两个任务同时完成
eq(sr2.rewardQueue.length, 2, '两个任务完成 → 两个奖励排队');
let qFirst = sr2.rewardQueue[0];
ok(G.chooseReward('pop').ok, '先领取第一个奖励');
eq(sr2.rewardQueue.length, 1, '队列剩 1');
eq(sr2.rewardQueue[0].uid === qFirst.uid, false, '领完后显示下一个任务奖励');
ok(G.chooseReward('sup').ok, '再领取资源奖励');
eq(sr2.rewardQueue.length, 0, '全部领完');

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

/* 11. 城镇升级：P6 手动升级，消耗建造行动，5 选 2；声望不再给蓝图 */
let s4 = G.newGame(4);
G.chooseBlueprint(s4.pendingDraw.options[0]);
eq(s4.townLevel, 0, '开局城镇 Lv.0');
s4.pop = 6;
eq(G.townUpgradeStatus().ok, true, 'P6 可升级 Lv.1');
let townMoney = s4.money;
let up = G.upgradeTown();
ok(up.ok, '执行城镇升级');
eq(s4.money, townMoney, '城镇升级不花钱');
eq(s4.buildings.length, 0, '城镇升级不占建筑位');
eq(s4.stats.townUpgrades, 1, '记录城镇升级次数');
eq(s4.townLevel, 1, '城镇 Lv.1');
eq(s4.hasBuilt, true, '升级消耗建造行动');
ok(!!s4.pendingDraw, '升级弹出蓝图');
eq(s4.pendingDraw.options.length, 5, '城镇升级 5 张候选');
eq(s4.pendingDraw.count, 2, '城镇升级选 2 张');
eq(s4.pendingDraw.source, 'town', '来源标记为城镇');
eq(G.chooseBlueprint(s4.pendingDraw.options[0]).ok, false, '城镇升级不能只选 1 张');
eq(G.chooseBlueprints([s4.pendingDraw.options[0], s4.pendingDraw.options[0]]).ok, false, '不能重复选同一张');
let townIds = s4.pendingDraw.options.slice(0, 2);
ok(G.chooseBlueprints(townIds).ok, '城镇升级一次选 2 张');
eq(s4.unlocked.length, 3, '开局 1 + 城镇 2 = 3 张');
eq(s4.pendingDraw, null, '选完关闭');
s4.rep = 10;
G.endTurn(); // T2；声望 10 不再触发蓝图
ok(!s4.pendingDraw, '声望 10 不再给蓝图');
eq(s4.townLevel, 1, '升级后不降级');
s4.pop = 5;
eq(G.townUpgradeStatus().ok, false, '人口不足时不能升下一级');
eq(s4.townLevel, 1, '人口下降也不降级');
s4.pop = 9;
eq(G.townUpgradeStatus().ok, true, 'P9 可升 Lv.2');
s4.hasBuilt = true;
eq(G.townUpgradeStatus().ok, false, '每回合只能升级/建造 1 次');
s4.hasBuilt = false;
s4.turn = 30;
eq(G.townUpgradeStatus().ok, false, '最后一回合不能升级');
s4.turn = 2;
let sMax = G.newGame(24);
G.chooseBlueprint(sMax.pendingDraw.options[0]);
sMax.townLevel = 4;
eq(G.townUpgradeStatus().ok, false, 'Lv.4 已满级');
eq(G.nextTownPop(), null, '满级后没有下一门槛');

/* 12. 存档、下回合预测、蓝图差异化 */
let sv = G.newGame(21);
G.chooseBlueprint(sv.pendingDraw.options[0]);
let svMoney = sv.money;
ok(G.build('farm').ok, '存档测试：建农场');
let svBuildings = sv.buildings.length;
let fc = G.forecast();
ok(!!fc && !!fc.last, '下回合预测可用');
eq(fc.last.per[0].sup, 9, '预测食物 = 基础 3 + 农场 6');
eq(fc.last.sat, 15, '预测满意度 15');
eq(sv.turn, 1, '预测不推进真实回合');
eq(sv.buildings.length, svBuildings, '预测不增删建筑');
eq(sv.money, svMoney - 72, '预测不改真实金钱');

let exported = G.exportState();
ok(exported && exported.version === G.SAVE_VERSION, '存档带版本号');
ok(typeof exported.rngState === 'number' && !exported.rng, '存档保存随机数状态，不存函数');

G.newGame(22);
G.chooseBlueprint(G.getState().pendingDraw.options[0]);
let imported = G.importState(exported);
ok(imported.ok, '读档成功');
eq(G.getState().seed, 21, '读档种子一致');
eq(G.getState().money, svMoney - 72, '读档金钱一致');
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

/* 12.1 完成回合估算：其他任务先完成时，奖励队列不能误报“无法完成” */
let se = G.newGame(2);
G.chooseBlueprint(se.pendingDraw.options[0]);
se.active = [
  { uid: 'est-a', defId: 'irrigate', spawnTurn: 1, progress: 0, aReleased: false },
  { uid: 'est-b', defId: 'reclaim', spawnTurn: 1, progress: 0, aReleased: false }
];
let estB = G.estimateTaskFinish('est-b');
eq(estB.finishTurn, 7, '另一任务完成并进奖励队列后，目标仍估算 T7');
eq(estB.late, false, '奖励队列不再导致误报无法完成');

/* 12.2 恰好在 T30 完成不应标红 */
let sEndEst = G.newGame(3);
G.chooseBlueprint(sEndEst.pendingDraw.options[0]);
sEndEst.turn = 28;
sEndEst.active = [{ uid: 'est-t30', defId: 'irrigate', spawnTurn: 1, progress: 0, aReleased: false }];
let estT30 = G.estimateTaskFinish('est-t30');
eq(estT30.finishTurn, 30, 'T30 完成估算为 T30');
eq(estT30.late, false, 'T30 完成不标为无法完成');

eq(G.buildingDef('wind').labor, 1, '风电站 1 劳力');
eq(G.buildingDef('wind').out.power, 8, '风电站 8 电');
eq(G.buildingDef('deepwell').labor, 1, '深水井 1 劳力');
eq(G.buildingDef('deepwell').out.water, 8, '深水井 8 水');

/* 12.5 回合压力：T1–6 为 0，T7 起线性增加到 T30 的 -5；正负基础满意度都扣 */
const negCases = [
  { turn: 4,  next: 5,  pressure: 0 },
  { turn: 9,  next: 10, pressure: 0.83 },
  { turn: 14, next: 15, pressure: 1.88 },
  { turn: 19, next: 20, pressure: 2.92 },
  { turn: 24, next: 25, pressure: 3.96 },
  { turn: 29, next: 30, pressure: 5 }
];
for (const c of negCases) {
  const st = G.newGame(31);
  G.chooseBlueprint(st.pendingDraw.options[0]);
  const relief = st.board.find(t => t.defId === 'relief');
  G.acceptTask(relief.uid);
  st.turn = c.turn;
  const f = G.forecast();
  const wantSat = Math.round((f.last.baseSat - c.pressure) * 100) / 100;
  const wantLoss = wantSat < 0 ? Math.min(3, 1 + Math.floor(-wantSat / 10)) : 0;
  eq(f.last.turnPressure, c.pressure, 'T' + c.next + ' 回合压力 ' + c.pressure);
  eq(f.last.sat, wantSat, 'T' + c.next + ' 满意度 ' + wantSat);
  eq(f.last.popLoss, wantLoss, 'T' + c.next + ' 掉人口 ' + wantLoss);
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
eq(posF.last.sat, posF.last.baseSat - 5, '正数基础满意度 T30 只扣 5');

const zeroState = G.newGame(33);
G.chooseBlueprint(zeroState.pendingDraw.options[0]);
const zeroRelief = zeroState.board.find(t => t.defId === 'relief');
G.acceptTask(zeroRelief.uid); // 食物占用 8，低阶满足分正好压到 18
zeroState.turn = 29;
const zeroF = G.forecast();
eq(zeroF.last.baseSat, 0, 'T30 基础满意度为 0');
eq(zeroF.last.turnPressure, 5, '基础满意度 0 时 T30 也扣 5');
eq(zeroF.last.sat, -5, '基础满意度 0 时 T30 为 -5');
eq(zeroF.last.popLoss, 1, '基础满意度 0 时 T30 掉 1 人口');

/* 12.6 声望档位：20 起才 +1，此前 0–19.9 只有稳定 */
eq(G.repGainFor(11.9), 0, '11.9 不加声望');
eq(G.repGainFor(12.4), 0, '12.4 不加声望');
eq(G.repGainFor(18.4), 0, '18.4 不加声望');
eq(G.repGainFor(19.99), 0, '19.99 不加声望');
eq(G.repGainFor(20), 1, '20 声望 +1');
eq(G.repGainFor(29.99), 1, '29.99 声望 +1');
eq(G.repGainFor(30), 2, '30 声望 +2');
eq(G.repGainFor(40), 3, '40 声望 +3');
eq(G.repGainFor(50), 4, '50 声望 +4');
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
eq(G.acceptTask('ov-prospect').ok, true, '接取第 3 个原料任务（供给 7，占用 6）');
overState.board.push({ uid: 'ov-mining-2', defId: 'mining', spawnTurn: 6, acceptBy: 99 });
const ovGate = G.acceptTask('ov-mining-2');
ok(ovGate.ok === false && ovGate.error.indexOf('当前产出') >= 0, '原料占用达到供给后，不能再接第 4 个');
// 供给下降：停用原料站，制造已接任务的超额
const mineB = overState.buildings.find(b => b.defId === 'mine');
ok(G.setBuildingActive(mineB.uid, false).ok, '停用原料站，制造供给下降');
const overF = G.forecast();
eq(overF.last.over, 8, '原料占用 9 - 供给 1 = 超额 8');
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
/* 避开 T6 刷新随机恶性任务影响预测：固定在 T6，且清掉当前恶性负担 */
advGood.turn = 6;
advGood.board = advGood.board.filter(t => G.taskDef(t.defId).type !== 'malignant');
const goodFc = G.forecast();
eq(goodFc.last.advancedStopped, false, '低阶资源充足时高级建筑恢复生产');
eq(goodFc.last.supply.clothes, 10, '衣服产出 10');

/* 12.8.1 低阶短缺按项 -25%：电力/水各缺 1 项 → 高级产出 50% */
advGood.pop = 11;
advGood.taskSupply.food = 2;
const partialFc = G.forecast();
eq(partialFc.last.advancedShort, 2, '电力/水两项短缺');
eq(partialFc.last.advancedStopped, false, '部分短缺不再全停');
eq(partialFc.last.advancedOutputPct, 50, '高级产出 -50%');
eq(partialFc.last.supply.clothes, 5, '衣服产出 10 × 50% = 5');
eq(partialFc.last.extra.power, 2, '部分减产仍按原高级投入计算');

/* 12.8.2 只缺 1 项 → 高级产出 75% */
advGood.taskSupply.water = 1;
const oneShortFc = G.forecast();
eq(oneShortFc.last.advancedShort, 1, '只有电力一项短缺');
eq(oneShortFc.last.advancedOutputPct, 75, '高级产出 -25%');
eq(oneShortFc.last.supply.clothes, 7.5, '衣服产出 10 × 75% = 7.5');
eq(oneShortFc.last.advancedReasons[0].key, 'power', '减产原因能定位到具体资源');
ok(oneShortFc.last.advancedReasons[0].gap > 0, '减产原因包含缺口值');

/* 12.8.3 建造预览不落地，且能带出减产原因 */
advGood.taskSupply.food = 0;
advGood.hasBuilt = false;
advGood.money = 300;
const advBp = G.buildPreview('farm');
eq(advBp.ok, true, '建造预览可用');
eq(advBp.moneyAfter, 228, '预览扣钱但不改真实金钱');
eq(G.getState().buildings.length, advGood.buildings.length, '预览不真正建造');
eq(advBp.after.supply.food, 15, '预览显示农场建成后的食物供给');
ok(advBp.after.advancedReasons.length > 0, '预览显示具体减产原因');

/* 12.8.3 混合高级建筑的基础产出要计入低阶供给：原料卡足够时不能误判减产 */
const advMix = G.newGame(91);
G.chooseBlueprint(advMix.pendingDraw.options[0]);
advMix.unlocked.push('garment');
advMix.pop = 20;
advMix.money = 9999;
for (const id of ['farm', 'well', 'mine', 'plant', 'garment', 'furniture']) {
  advMix.hasBuilt = false;
  if (!G.build(id).ok) throw new Error('混合供给测试建造失败: ' + id);
}
advMix.pop = 9;
advMix.hasBuilt = true;
advMix.board = [];
advMix.active = [];
const mixFc = G.forecast();
ok(mixFc.last.supply.material >= mixFc.last.demand.material, '混合建筑产原料后原料供给足够');
eq(mixFc.last.advancedReasons.some(r => r.key === 'material'), false, '原料足够时不会误报原料减产');
eq(mixFc.last.advancedOutputPct, 50, '电力/水仍按实际缺口减产 50%');

/* 12.8.4 接取前预估完成回合，必须计入接取后的叠接减速 */
const late = G.newGame(90);
G.chooseBlueprint(late.pendingDraw.options[0]);
late.turn = 26;
late.pop = 5;
late.money = 999;
late.buildings = [];
late.active = [{ uid: 'fest', defId: 'festival', spawnTurn: 24, progress: 0, aReleased: false, acceptBy: 26 }];
late.board = [{ uid: 'tail', defId: 'tailor', spawnTurn: 24, progress: 0, aReleased: false }];
late.taskSupply.clothes = 4;
eq(G.importState(late).ok, true, '导入 T26 叠接场景');
const lateEst = G.estimateTaskFinish('tail');
eq(lateEst.ok, true, '接取前可以估算完成回合');
eq(lateEst.finishTurn, 31, '接取前预计 T31 完成（不是静态 T30）');
eq(lateEst.late, true, '接取前已标记本局无法完成');
eq(G.getState().board.length, 1, '估算不会真的接取任务');

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
    if (st.rewardQueue && st.rewardQueue.length) {
      G.chooseReward(G.laborAvailable() <= 1 ? 'pop' : 'sup');
      continue;
    }
    if (st.pendingDraw) {
      var pc = st.pendingDraw.count || 1;
      G.chooseBlueprints(st.pendingDraw.options.slice(0, pc));
      continue;
    }
    if (!st.hasBuilt && G.townUpgradeStatus().ok) {
      G.upgradeTown();
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
