/*
 * 城建设计局 · 局内 v3.3 引擎
 * 纯逻辑、无 DOM，可在 Node 里直接 require 测试。
 *
 * 核心：30 回合 / 每回合 1 次建造 / 8 资源 / 人口常驻占用劳力 /
 *       任务奖励声望与供给 / 满意度分段人口惩罚 / 建筑可停用。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DSHGame = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_TURNS = 30;
  var CAP = 24;
  var DEFICIT = 13;
  var START_MONEY = 300;
  var START_POP = 5;
  var NODES = [10, 25, 45, 65];
  var REFRESH = [6, 11, 16, 21, 26];
  var START_TASKS = ['reclaim', 'waterworks', 'mining', 'relief'];

  var RES = [
    { key: 'food',      name: '食物', icon: '🌾', group: 'basic',    base: 3, demand: 1.0 },
    { key: 'material',  name: '原料', icon: '⛏',  group: 'basic',    base: 1, demand: 0.5 },
    { key: 'power',     name: '电力', icon: '⚡', group: 'basic',    base: 1, demand: 0.5 },
    { key: 'water',     name: '水',   icon: '💧', group: 'basic',    base: 1, demand: 0.5 },
    { key: 'clothes',   name: '衣服', icon: '👕', group: 'advanced', base: 0, demand: 0.4 },
    { key: 'furniture', name: '家具', icon: '🛋', group: 'advanced', base: 0, demand: 0.3 },
    { key: 'medicine',  name: '药品', icon: '💊', group: 'advanced', base: 0, demand: 0.2 },
    { key: 'education', name: '教育', icon: '📚', group: 'advanced', base: 0, demand: 0.15 }
  ];
  var RES_BY_KEY = {};
  RES.forEach(function (r) { RES_BY_KEY[r.key] = r; });

  var BASE_BUILDINGS = [
    { id: 'farm',      name: '农场',   icon: '🌾', cost: 60,  labor: 1, max: 6, out: { food: 6 } },
    { id: 'mine',      name: '原料站', icon: '⛏',  cost: 60,  labor: 1, max: 6, out: { material: 5 } },
    { id: 'plant',     name: '电站',   icon: '⚡', cost: 70,  labor: 1, max: 6, out: { power: 5 } },
    { id: 'well',      name: '水厂',   icon: '💧', cost: 60,  labor: 1, max: 6, out: { water: 5 } },
    { id: 'clothes',   name: '服装厂', icon: '👕', cost: 100, labor: 2, max: 3, out: { clothes: 3 }, extra: { power: 2, water: 2 } },
    { id: 'furniture', name: '家具厂', icon: '🛋', cost: 120, labor: 2, max: 3, out: { furniture: 2 }, extra: { material: 3, power: 2 } },
    { id: 'pharma',    name: '制药厂', icon: '💊', cost: 150, labor: 3, max: 2, out: { medicine: 2 }, extra: { water: 2, power: 2, material: 1 } },
    { id: 'school',    name: '学校',   icon: '📚', cost: 120, labor: 2, max: 2, out: { education: 2 }, extra: { power: 1, water: 1 } }
  ];

  var BLUEPRINTS = [
    { id: 'greenhouse', name: '温室',     icon: '🌱', cost: 90,  labor: 1, max: 2, out: { food: 8 } },
    { id: 'ranch',      name: '牧场',     icon: '🐄', cost: 120, labor: 2, max: 2, out: { food: 12 }, extra: { material: 1 } },
    { id: 'wind',       name: '风电站',   icon: '🌬', cost: 110, labor: 2, max: 2, out: { power: 8 } },
    { id: 'deepwell',   name: '深水井',   icon: '🕳', cost: 100, labor: 2, max: 2, out: { water: 8 } },
    { id: 'textile',    name: '纺织厂',   icon: '🧵', cost: 160, labor: 3, max: 2, out: { clothes: 5 }, extra: { power: 3, water: 3 } },
    { id: 'workshop',   name: '家具工坊', icon: '🪚', cost: 160, labor: 3, max: 2, out: { furniture: 4 }, extra: { material: 4, power: 3 } },
    { id: 'pharm2',     name: '药厂',     icon: '🧪', cost: 180, labor: 4, max: 1, out: { medicine: 3 }, extra: { water: 3, power: 3, material: 2 } },
    { id: 'academy',    name: '学院',     icon: '🎓', cost: 150, labor: 3, max: 1, out: { education: 4 }, extra: { power: 2, water: 2 } },
    { id: 'market',     name: '市场',     icon: '🏪', cost: 90,  labor: 0, max: 1, out: {}, bonus: { sat: 5 } },
    { id: 'warehouse',  name: '仓库',     icon: '📦', cost: 80,  labor: 0, max: 1, out: {}, bonus: { occDiscount: 0.2 } }
  ];

  var ALL_BUILDINGS = BASE_BUILDINGS.concat(BLUEPRINTS);
  var BUILDING_BY_ID = {};
  ALL_BUILDINGS.forEach(function (b) { BUILDING_BY_ID[b.id] = b; });

  var TASK_DEFS = [
    { id: 'reclaim',   name: '开垦',     type: 'normal', duration: 3, blocks: [1], occ: { food: 5 }, reward: { pop: 1, sup: { food: 3 }, rep: 3, money: 80 } },
    { id: 'irrigate',  name: '灌溉',     type: 'normal', duration: 2, blocks: [1], occ: { food: 3 }, reward: { pop: 1, sup: { food: 2 }, rep: 3, money: 60 } },
    { id: 'mining',    name: '采矿',     type: 'normal', duration: 4, blocks: [1], occ: { material: 4 }, reward: { pop: 1, sup: { material: 3 }, rep: 4, money: 86 } },
    { id: 'prospect',  name: '勘探',     type: 'normal', duration: 2, blocks: [1], occ: { material: 3 }, reward: { pop: 1, sup: { material: 2 }, rep: 3, money: 58 } },
    { id: 'wiring',    name: '架线',     type: 'normal', duration: 3, blocks: [1], occ: { power: 4 }, reward: { pop: 1, sup: { power: 3 }, rep: 3, money: 76 } },
    { id: 'waterworks',name: '供水',     type: 'normal', duration: 3, blocks: [1], occ: { water: 4 }, reward: { pop: 1, sup: { water: 3 }, rep: 3, money: 76 } },
    { id: 'tailor',    name: '制衣',     type: 'normal', duration: 4, blocks: [1, 2], occ: { clothes: 2 }, reward: { pop: 1, sup: { clothes: 2 }, rep: 4, money: 78 } },
    { id: 'furniture_order', name: '家具订单', type: 'normal', duration: 4, blocks: [2], occ: { material: 3, power: 2 }, reward: { pop: 1, sup: { furniture: 2 }, rep: 4, money: 90 } },
    { id: 'vaccine',   name: '疫苗',     type: 'normal', duration: 5, blocks: [2, 3], occ: { water: 3, power: 3 }, reward: { pop: 1, sup: { medicine: 2 }, rep: 5, money: 110 } },
    { id: 'teaching',  name: '支教',     type: 'normal', duration: 4, blocks: [2], occ: { power: 2, water: 2 }, reward: { pop: 1, sup: { education: 2 }, rep: 4, money: 90 } },
    { id: 'nightschool', name: '夜校',   type: 'normal', duration: 4, blocks: [2], occ: { food: 4, power: 4 }, reward: { pop: 2, rep: 5, money: 110 } },
    { id: 'resettle',  name: '移民安置', type: 'normal', duration: 5, blocks: [3], occ: { food: 6, clothes: 2 }, reward: { pop: 3, rep: 6, money: 112 } },
    { id: 'renewal',   name: '旧城改造', type: 'normal', duration: 5, blocks: [3], occ: { food: 5, material: 5, power: 5 }, reward: { pop: 2, sup: { food: 2, material: 2, power: 2 }, rep: 6, money: 120 } },
    { id: 'relief',    name: '紧急救济', type: 'timed', window: 3, duration: 2, blocks: [1], occ: { food: 8 }, reward: { pop: 1, rep: 8, money: 82 } },
    { id: 'festival',  name: '庆典',     type: 'timed', window: 2, duration: 2, blocks: [2], occ: { clothes: 3, food: 4 }, reward: { rep: 10, money: 78 } },
    { id: 'expo',      name: '博览会',   type: 'timed', window: 3, duration: 3, blocks: [3], occ: { power: 6, clothes: 3 }, reward: { rep: 12, money: 100 } },
    { id: 'pollution', name: '污染工厂', type: 'malignant', duration: 3, burdenA: { material: 5 }, occ: { material: 2 }, reward: { rep: 6, sup: { material: 4 }, money: 88 } },
    { id: 'blackmarket', name: '黑市',   type: 'malignant', duration: 4, burdenA: { clothes: 4 }, occ: { clothes: 2 }, reward: { rep: 8, money: 120 } }
  ];
  var TASK_BY_ID = {};
  TASK_DEFS.forEach(function (t) { TASK_BY_ID[t.id] = t; });

  var state = null;

  /* ---------------- utils ---------------- */

  function round2(n) { return Math.round(n * 100) / 100; }

  function emptyRes() {
    var o = {};
    RES.forEach(function (r) { o[r.key] = 0; });
    return o;
  }

  function addTo(target, src) {
    if (!src) return;
    Object.keys(src).forEach(function (k) {
      target[k] = round2((target[k] || 0) + src[k]);
    });
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function resName(key) {
    return RES_BY_KEY[key] ? RES_BY_KEY[key].name : key;
  }

  function popPenalty(pop) {
    var brackets = [[5, 1.0], [10, 1.5], [15, 2.0], [20, 2.5], [25, 3.0], [30, 3.5]];
    var prev = 0, sum = 0;
    for (var i = 0; i < brackets.length; i++) {
      if (pop <= prev) break;
      var cap = brackets[i][0], rate = brackets[i][1];
      var n = Math.min(pop, cap) - prev;
      if (n > 0) sum += n * rate;
      prev = cap;
    }
    if (pop > 30) sum += (pop - 30) * 4.0;
    return round2(sum);
  }

  /* ---------------- log ---------------- */

  function log(text, kind) {
    state.log.unshift({ turn: state.turn, text: text, kind: kind || 'info' });
    if (state.log.length > 90) state.log.length = 90;
  }

  /* ---------------- task helpers ---------------- */

  function blockOfTurn(turn) {
    return turn <= 10 ? 1 : turn <= 20 ? 2 : 3;
  }

  function addTask(defId, spawnTurn, extra) {
    var def = TASK_BY_ID[defId];
    if (!def) throw new Error('unknown task ' + defId);
    var t = {
      uid: 't' + (state.nextUid++),
      defId: defId,
      spawnTurn: spawnTurn,
      progress: 0,
      aReleased: false
    };
    if (def.type === 'timed') t.acceptBy = spawnTurn + def.window;
    if (extra) Object.keys(extra).forEach(function (k) { t[k] = extra[k]; });
    state.board.push(t);
    if (def.type === 'normal') {
      var block = blockOfTurn(spawnTurn);
      if (state.spawnedNormals[block].indexOf(defId) < 0) state.spawnedNormals[block].push(defId);
    }
    return t;
  }

  function isTaskPresent(defId) {
    return state.board.some(function (t) { return t.defId === defId; }) ||
      state.active.some(function (t) { return t.defId === defId; });
  }

  function completeTask(t) {
    var def = TASK_BY_ID[t.defId];
    var r = def.reward || {};
    var parts = [];
    if (r.pop) { state.pop += r.pop; parts.push('人口 +' + r.pop); }
    if (r.money) { state.money += r.money; parts.push('金 +' + r.money); }
    if (r.rep) { state.rep += r.rep; parts.push('声望 +' + r.rep); }
    if (r.sup) {
      Object.keys(r.sup).forEach(function (k) {
        state.taskSupply[k] = round2((state.taskSupply[k] || 0) + r.sup[k]);
        parts.push(resName(k) + ' +' + r.sup[k]);
      });
    }
    state.active = state.active.filter(function (x) { return x.uid !== t.uid; });
    state.stats.tasksDone += 1;
    log('任务完成：' + def.name + '（' + parts.join('、') + '）', 'good');
  }

  function refreshTasks() {
    var block = blockOfTurn(state.turn);
    var normals = TASK_DEFS.filter(function (d) {
      return d.type === 'normal' && d.blocks.indexOf(block) >= 0 &&
        !isTaskPresent(d.id) && state.spawnedNormals[block].indexOf(d.id) < 0;
    });
    if (normals.length) {
      var pick = normals[Math.floor(state.rng() * normals.length)];
      addTask(pick.id, state.turn);
    }
    var timedPool = TASK_DEFS.filter(function (d) {
      return d.type === 'timed' && d.blocks.indexOf(block) >= 0;
    });
    var malignantPool = TASK_DEFS.filter(function (d) { return d.type === 'malignant'; });
    if (state.rng() < 0.5 && timedPool.length) {
      addTask(timedPool[Math.floor(state.rng() * timedPool.length)].id, state.turn);
    } else if (malignantPool.length) {
      addTask(malignantPool[Math.floor(state.rng() * malignantPool.length)].id, state.turn);
    }
    log('任务栏刷新：T' + state.turn + ' 追加 2 张', 'task');
  }

  /* ---------------- compute ---------------- */

  function compute() {
    var supply = emptyRes();
    var demand = emptyRes();
    var extra = emptyRes();
    var occ = emptyRes();

    RES.forEach(function (r) { supply[r.key] = r.base; });
    RES.forEach(function (r) {
      supply[r.key] = round2(supply[r.key] + (state.taskSupply[r.key] || 0));
    });

    state.buildings.forEach(function (b) {
      if (!b.active) return;
      var def = BUILDING_BY_ID[b.defId];
      if (!def) return;
      addTo(supply, def.out);
      addTo(extra, def.extra);
    });

    RES.forEach(function (r) {
      demand[r.key] = round2(state.pop * r.demand + (extra[r.key] || 0));
    });

    state.active.forEach(function (t) {
      var def = TASK_BY_ID[t.defId];
      addTo(occ, def.occ);
    });
    state.board.forEach(function (t) {
      var def = TASK_BY_ID[t.defId];
      if (def.type === 'malignant' && !t.aReleased) addTo(occ, def.burdenA);
    });

    var discount = 0;
    var market = 0;
    state.buildings.forEach(function (b) {
      if (!b.active) return;
      var def = BUILDING_BY_ID[b.defId];
      if (!def || !def.bonus) return;
      if (def.bonus.occDiscount) discount = Math.max(discount, def.bonus.occDiscount);
      if (def.bonus.sat) market += def.bonus.sat;
    });
    if (discount) {
      RES.forEach(function (r) { occ[r.key] = round2((occ[r.key] || 0) * (1 - discount)); });
    }

    var per = RES.map(function (r) {
      var d = demand[r.key] || 0;
      var o = occ[r.key] || 0;
      var avail = Math.max(0, round2(supply[r.key] - o));
      var score = d <= 0 ? 10 : 10 * Math.min(1, avail / d);
      return {
        key: r.key, name: r.name, icon: r.icon, group: r.group,
        sup: round2(supply[r.key]), dem: d, occ: round2(o), avail: avail,
        score: round2(score)
      };
    });

    var sum = round2(per.reduce(function (s, p) { return s + p.score; }, 0));
    var penalty = popPenalty(state.pop);
    var sat = round2(sum - penalty - DEFICIT + market);
    var repGain = sat > 10 ? Math.min(5, Math.floor((sat - 10) / 10)) : 0;
    var popLoss = sat < 0 ? Math.min(3, 1 + Math.floor(-sat / 10)) : 0;

    return {
      supply: supply, demand: demand, extra: extra, occ: occ, per: per,
      sum: sum, penalty: penalty, sat: sat, repGain: repGain, popLoss: popLoss, market: market
    };
  }

  /* ---------------- turn ---------------- */

  function settle() {
    var c = compute();
    state.last = c;
    state.sat = c.sat;
    if (c.repGain > 0) {
      state.rep += c.repGain;
      log('满意度 ' + c.sat.toFixed(1) + '，声望 +' + c.repGain, 'good');
    } else if (c.sat < 0) {
      log('满意度 ' + c.sat.toFixed(1) + '，人口 -' + c.popLoss, 'bad');
    } else {
      log('满意度 ' + c.sat.toFixed(1) + '，稳定', 'info');
    }
    if (c.popLoss > 0) {
      state.pop = Math.max(1, state.pop - c.popLoss);
      state.stats.popLost += c.popLoss;
    }
  }

  function startTurn() {
    var done = [];
    state.active.forEach(function (t) {
      t.progress += 1;
      var def = TASK_BY_ID[t.defId];
      if (t.progress >= def.duration) done.push(t);
    });
    done.forEach(completeTask);
    settle();
    state.hasBuilt = false;
    checkNodes();
  }

  /* ---------------- blueprint ---------------- */

  function openDraw(node, opening) {
    var pool = BLUEPRINTS.filter(function (b) { return state.unlocked.indexOf(b.id) < 0; });
    if (!pool.length) return false;
    var options = shuffle(pool, state.rng).slice(0, 3).map(function (b) { return b.id; });
    state.pendingDraw = { options: options, node: node || null, opening: !!opening };
    log(opening ? '开局蓝图：3 选 1' : '声望 ' + node + '：蓝图 3 选 1', 'draw');
    return true;
  }

  function checkNodes() {
    if (state.pendingDraw || state.over) return;
    while (state.nodeIndex < NODES.length && state.rep >= NODES[state.nodeIndex]) {
      var node = NODES[state.nodeIndex];
      state.nodeIndex += 1;
      if (openDraw(node, false)) return;
    }
  }

  function chooseBlueprint(id) {
    if (!state.pendingDraw) return { ok: false, error: '没有待选蓝图' };
    if (state.pendingDraw.options.indexOf(id) < 0) return { ok: false, error: '该蓝图不在选项中' };
    state.unlocked.push(id);
    var def = BUILDING_BY_ID[id];
    state.pendingDraw = null;
    log('蓝图解锁：' + def.name, 'good');
    checkNodes();
    return { ok: true };
  }

  /* ---------------- build / toggle ---------------- */

  function isBuildingAvailable(defId) {
    if (!BUILDING_BY_ID[defId]) return false;
    if (BASE_BUILDINGS.some(function (b) { return b.id === defId; })) return true;
    return state.unlocked.indexOf(defId) >= 0;
  }

  function countBuilt(defId) {
    return state.buildings.filter(function (b) { return b.defId === defId; }).length;
  }

  function laborUsed() {
    return state.buildings.reduce(function (s, b) {
      return s + (b.active ? BUILDING_BY_ID[b.defId].labor : 0);
    }, 0);
  }

  function laborAvailable() {
    return state.pop - laborUsed();
  }

  function buildStatus(defId) {
    var def = BUILDING_BY_ID[defId];
    if (!def) return { ok: false, reason: '未知建筑' };
    if (state.over) return { ok: false, reason: '游戏已结束' };
    if (state.pendingDraw) return { ok: false, reason: '先选蓝图' };
    if (!isBuildingAvailable(defId)) return { ok: false, reason: '蓝图未解锁' };
    if (state.hasBuilt) return { ok: false, reason: '本回合已建造' };
    if (state.buildings.length >= CAP) return { ok: false, reason: '城市已满 24 座' };
    if (countBuilt(defId) >= def.max) return { ok: false, reason: '已达上限 ' + def.max };
    if (def.labor > laborAvailable()) return { ok: false, reason: '劳力不足' };
    if (state.money < def.cost) return { ok: false, reason: '金钱不足' };
    return { ok: true, reason: '' };
  }

  function build(defId) {
    var st = buildStatus(defId);
    if (!st.ok) return { ok: false, error: st.reason };
    var def = BUILDING_BY_ID[defId];
    state.money -= def.cost;
    state.buildings.push({ uid: 'b' + (state.nextUid++), defId: defId, active: true });
    state.hasBuilt = true;
    state.stats.built += 1;
    log('建造：' + def.name + '（-' + def.cost + ' 金，劳力 ' + def.labor + '）', 'build');
    return { ok: true };
  }

  function setBuildingActive(uid, active) {
    if (state.over) return { ok: false, error: '游戏已结束' };
    var b = state.buildings.find(function (x) { return x.uid === uid; });
    if (!b) return { ok: false, error: '建筑不存在' };
    if (b.active === active) return { ok: true };
    var def = BUILDING_BY_ID[b.defId];
    if (active) {
      if (def.labor > laborAvailable()) {
        return { ok: false, error: '劳力不足：可用 ' + laborAvailable() + '，需要 ' + def.labor };
      }
      b.active = true;
      log('启用：' + def.name, 'build');
    } else {
      b.active = false;
      log('停用：' + def.name + '，释放 ' + def.labor + ' 劳力', 'warn');
    }
    return { ok: true };
  }

  /* 按建筑类型设置启用数量：0..已建总数；增加时一次性检查劳力 */
  function setBuildingCount(defId, count) {
    if (state.over) return { ok: false, error: '游戏已结束' };
    var def = BUILDING_BY_ID[defId];
    if (!def) return { ok: false, error: '未知建筑' };
    var list = state.buildings.filter(function (b) { return b.defId === defId; });
    if (!list.length) return { ok: false, error: '还没有建造' + def.name };
    var n = Math.floor(Number(count));
    if (!isFinite(n) || n < 0 || n > list.length) {
      return { ok: false, error: '数量需在 0–' + list.length + ' 之间' };
    }
    var active = list.filter(function (b) { return b.active; });
    if (n === active.length) return { ok: true, active: n };
    if (n > active.length) {
      var delta = n - active.length;
      var need = delta * def.labor;
      var avail = laborAvailable();
      if (need > avail) {
        return { ok: false, error: '劳力不足：还需 ' + need + '，可用 ' + Math.max(0, avail) };
      }
      list.filter(function (b) { return !b.active; }).slice(0, delta).forEach(function (b) {
        b.active = true;
      });
    } else {
      active.slice(n).forEach(function (b) { b.active = false; });
    }
    log(def.name + '：启用 ' + n + ' / ' + list.length, 'info');
    return { ok: true, active: n };
  }

  /* ---------------- tasks ---------------- */

  function previewTask(uid) {
    var idx = state.board.findIndex(function (t) { return t.uid === uid; });
    if (idx < 0) return null;
    var t = state.board[idx];
    var savedBoard = state.board;
    var savedActive = state.active;
    try {
      state.board = state.board.filter(function (x) { return x.uid !== uid; });
      state.active = state.active.concat([Object.assign({}, t, { progress: 0 })]);
      return compute().sat;
    } finally {
      state.board = savedBoard;
      state.active = savedActive;
    }
  }

  function acceptTask(uid) {
    if (state.over) return { ok: false, error: '游戏已结束' };
    if (state.pendingDraw) return { ok: false, error: '先选蓝图' };
    var idx = state.board.findIndex(function (t) { return t.uid === uid; });
    if (idx < 0) return { ok: false, error: '任务不存在' };
    var t = state.board[idx];
    var def = TASK_BY_ID[t.defId];
    if (def.type === 'timed' && t.acceptBy < state.turn) {
      return { ok: false, error: '已过接取期限' };
    }
    state.board.splice(idx, 1);
    t.progress = 0;
    if (def.type === 'malignant') t.aReleased = true;
    state.active.push(t);
    log('接取：' + def.name, 'task');
    return { ok: true };
  }

  function abandonTask(uid) {
    if (state.over) return { ok: false, error: '游戏已结束' };
    var idx = state.active.findIndex(function (t) { return t.uid === uid; });
    if (idx < 0) return { ok: false, error: '任务不在进行中' };
    var t = state.active[idx];
    var def = TASK_BY_ID[t.defId];
    state.active.splice(idx, 1);
    t.progress = 0;
    if (def.type === 'malignant') t.aReleased = true;
    if (def.type === 'timed' && t.acceptBy < state.turn) {
      log('放弃：' + def.name + '（已过期限，移出）', 'warn');
      return { ok: true };
    }
    state.board.push(t);
    log('放弃：' + def.name, 'task');
    return { ok: true };
  }

  /* ---------------- end turn ---------------- */

  function endTurn() {
    if (state.over) return { ok: false, error: '游戏已结束' };
    if (state.pendingDraw) return { ok: false, error: '先选择蓝图' };
    var used = laborUsed();
    if (used > state.pop) {
      return { ok: false, error: '劳力不足：已占用 ' + used + ' / 人口 ' + state.pop + '，请先停用建筑' };
    }
    if (state.turn >= MAX_TURNS) {
      state.over = true;
      state.final = {
        rep: state.rep, pop: state.pop, sat: state.sat,
        buildings: state.buildings.length, tasksDone: state.stats.tasksDone,
        money: state.money, built: state.stats.built, popLost: state.stats.popLost
      };
      log('30 回合结束。最终声望 ' + state.rep + '。', 'end');
      return { ok: true, over: true };
    }
    var before = state.board.length;
    state.board = state.board.filter(function (t) {
      var def = TASK_BY_ID[t.defId];
      return !(def.type === 'timed' && t.acceptBy <= state.turn);
    });
    if (before !== state.board.length) log('限时任务到期，移出任务栏', 'warn');

    state.turn += 1;
    state.hasBuilt = false;
    if (REFRESH.indexOf(state.turn) >= 0) refreshTasks();
    startTurn();
    return { ok: true };
  }

  /* ---------------- new game ---------------- */

  function newGame(seed) {
    var s = (seed === undefined || seed === null || seed === '') ? Math.floor(Math.random() * 1000000007) : Number(seed);
    if (!isFinite(s)) s = 1;
    s = s >>> 0;
    state = {
      seed: s,
      rng: mulberry32(s),
      turn: 1,
      money: START_MONEY,
      pop: START_POP,
      rep: 0,
      sat: 0,
      buildings: [],
      board: [],
      active: [],
      unlocked: [],
      spawnedNormals: { 1: [], 2: [], 3: [] },
      taskSupply: emptyRes(),
      hasBuilt: false,
      over: false,
      final: null,
      pendingDraw: null,
      nodeIndex: 0,
      nextUid: 1,
      log: [],
      stats: { tasksDone: 0, built: 0, popLost: 0 },
      last: null
    };
    START_TASKS.forEach(function (id) { addTask(id, 1); });
    startTurn();
    log('城市开局：P5、300 金，满意度 0。先补基础供给。', 'start');
    checkNodes();
    if (!state.pendingDraw) openDraw(null, true);
    return state;
  }

  function getState() { return state; }

  return {
    newGame: newGame,
    getState: getState,
    build: build,
    buildStatus: buildStatus,
    setBuildingActive: setBuildingActive,
    setBuildingCount: setBuildingCount,
    acceptTask: acceptTask,
    abandonTask: abandonTask,
    previewTask: previewTask,
    endTurn: endTurn,
    chooseBlueprint: chooseBlueprint,
    laborUsed: laborUsed,
    laborAvailable: laborAvailable,
    popPenalty: popPenalty,
    RES: RES,
    BASE_BUILDINGS: BASE_BUILDINGS,
    BLUEPRINTS: BLUEPRINTS,
    TASK_DEFS: TASK_DEFS,
    MAX_TURNS: MAX_TURNS,
    CAP: CAP,
    NODES: NODES,
    REFRESH: REFRESH,
    DEFICIT: DEFICIT,
    START_MONEY: START_MONEY,
    START_POP: START_POP,
    buildingDef: function (id) { return BUILDING_BY_ID[id]; },
    taskDef: function (id) { return TASK_BY_ID[id]; },
    resource: function (key) { return RES_BY_KEY[key]; }
  };
});
