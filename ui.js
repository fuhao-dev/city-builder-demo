/* 城建设计局 · v3.15.1 界面 */
(function () {
  'use strict';

  var G = window.DSHGame;
  var P = window.DSHProgress;
  var L = window.DSHLoadouts;
  var $ = function (id) { return document.getElementById(id); };
  var BEST_KEY = 'dsh_city_best_rep_v33';
  var SAVE_KEY = 'dsh_city_save_v34';
  var CAMPAIGN_KEY = 'dsh_city_campaign_v2';
  var LEGACY_CAMPAIGN_KEY = 'dsh_city_campaign_v1';
  var GROWTH_KEY = 'dsh_city_growth_v1';
  var LOADOUT_KEY = 'dsh_city_loadouts_v1';
  var toastTimer = null;
  var taskFilter = 'all';
  var showHelp = false;
  var buildPreviewId = null;
  var drawPick = [];
  var drawKey = null;
  var modalHidden = false;
  var selectingScenario = false;
  var configuringScenario = null;
  var growthOpen = false;
  var pendingRunConfig = G.normalizeRunConfig();
  var pendingSeed;
  var loadouts = L.load();
  var loadoutNames = [];

  var BP_NOTES = {
    greenhouse: '食物专精：单座供给更高，节省建筑位',
    ranch: '食物专精：净产出高，耗少量原料',
    wind: '电力专精：单座供给更高，节省建筑位',
    deepwell: '水专精：单座供给更高，节省建筑位',
    textile: '衣服专精：净产出高于服装厂，耗电/水',
    workshop: '家具专精：净产出高于家具厂，耗原料/电',
    pharm2: '药品专精：净产出高于制药厂，耗水/电/原料',
    academy: '教育专精：净产出高于学校，耗电/水',
    hydrofarm: '食物 + 水双供；省 1 槽/劳力，耗电',
    geothermal: '电力 + 水双供；省 1 槽/劳力，耗原料',
    recycling: '原料 + 电力双供；省 1 槽/劳力，耗水',
    herb: '食物 + 药品双供；省 1 槽/劳力，耗水/电/原料',
    garment: '衣服 + 原料双供；省 1 槽/劳力，耗电/水',
    medschool: '药品 + 教育双供；省 1 槽/劳力，耗水/电/原料',
    market: '0 劳力，满意度 +5',
    warehouse: '0 劳力，任务占用 −20%',
    supplycamp: '食物与原料双供，适合扩张前期',
    purifier: '高额供水，需要配套电力',
    library: '教育专精，需要原料和电力'
  };
  function bpNote(id) { return BP_NOTES[id] || ''; }

  function fmt(n) { return Math.round(n).toLocaleString('zh-CN'); }
  function fmt1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  function fmtNet(n) { return (n > 0 ? '+' : '') + (Math.round(n * 100) / 100).toFixed(2); }
  function fmtRate(n) { return String(Number(n.toFixed(4))); }
  function configLabel(config) {
    var c = G.normalizeRunConfig(config);
    return G.DIFFICULTIES.filter(function (d) { return d.id === c.difficultyId; })[0].name + ' · ' +
      (c.buffIds.map(function (id) { return G.BUFFS.filter(function (b) { return b.id === id; })[0].name; }).join('＋') || '无加成') +
      (c.affixIds ? ' · 词缀：' + c.affixIds.map(function (id) { return G.AFFIXES.filter(function (a) { return a.id === id; })[0].name; }).join('＋') : '');
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function loadBest() {
    try { return Number(localStorage.getItem(BEST_KEY) || 0) || 0; } catch (e) { return 0; }
  }
  function loadSavedLoadouts() {
    try { loadouts = L.load(JSON.parse(localStorage.getItem(LOADOUT_KEY) || 'null')); }
    catch (e) { loadouts = L.load(); }
    loadoutNames = loadouts.slots.map(function (slot, index) { return slot ? slot.name : '方案 ' + (index + 1); });
  }
  function buffLabel(ids) {
    return ids.map(function (id) { return G.BUFFS.filter(function (b) { return b.id === id; })[0].name; }).join('＋') || '无加成';
  }
  function saveLoadout(index) {
    var g = currentGrowth(), check = G.runConfigStatus(pendingRunConfig, g.totalRep, g.legacyUnlockRep);
    if (!check.ok) { toast(check.error); return; }
    var updated = L.save(loadouts, index, loadoutNames[index], pendingRunConfig.buffIds);
    try { localStorage.setItem(LOADOUT_KEY, JSON.stringify(updated)); }
    catch (e) { toast('方案未能保存，请检查浏览器存储'); return; }
    loadouts = updated;
    loadoutNames[index] = updated.slots[index].name;
    render();
    toast('已保存「' + updated.slots[index].name + '」');
  }
  function applyLoadout(index) {
    var g = currentGrowth();
    try {
      var applied = L.apply(loadouts.slots[index], pendingRunConfig.difficultyId, g.totalRep, g.legacyUnlockRep);
      pendingRunConfig = G.normalizeRunConfig(Object.assign({}, pendingRunConfig, { buffIds: applied.buffIds }));
    }
    catch (e) { toast(e.message); return; }
    render();
    toast('已载入「' + loadouts.slots[index].name + '」，难度与词缀保持不变');
  }
  function saveBest(rep) {
    try { localStorage.setItem(BEST_KEY, String(rep)); } catch (e) {}
  }
  function loadCampaign() {
    function read(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; } }
    return P.load(read(CAMPAIGN_KEY), read(LEGACY_CAMPAIGN_KEY));
  }
  function loadGrowth() {
    var raw = {};
    try { raw = JSON.parse(localStorage.getItem(GROWTH_KEY) || '{}') || {}; } catch (e) {}
    var ledger = P.loadGrowth(raw, loadCampaign());
    if (raw.version !== 2) {
      try { localStorage.setItem(GROWTH_KEY, JSON.stringify(ledger)); } catch (e) {}
    }
    return ledger;
  }
  function currentGrowth() {
    var ledger = loadGrowth(), g = G.growthStatus(P.totalRep(ledger), ledger.legacyUnlockRep);
    g.permissionRep = Math.max(g.totalRep, g.legacyUnlockRep);
    return g;
  }
  function recordGrowth(S) {
    var before = loadGrowth(), after = P.creditGrowth(before, S);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      try { localStorage.setItem(GROWTH_KEY, JSON.stringify(after)); }
      catch (e) { toast('局外成长未能保存，请检查浏览器存储'); }
    }
  }
  function recordClear(S) {
    var records = loadCampaign();
    var updated = P.record(records, S);
    if (JSON.stringify(updated) === JSON.stringify(records)) return;
    try { localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(updated)); } catch (e) {}
  }
  function persist() {
    var note = $('saveNote');
    try {
      var S = G.getState();
      if (!S) return;
      localStorage.setItem(SAVE_KEY, JSON.stringify(G.exportState()));
      if (note) note.textContent = '已自动存档 · T' + S.turn;
    } catch (e) {
      if (note) note.textContent = '自动存档不可用';
    }
  }
  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }
  function defOfTask(t) { return G.taskDef(t.defId); }
  function defOfBuilding(b) { return G.buildingDef(b.defId); }
  function resName(key) { return G.resource(key) ? G.resource(key).name : key; }
  function round2(n) { return Math.round(n * 100) / 100; }
  function taskOccText(def, t) {
    var c = G.taskResourcePreview(t.uid);
    var occ = G.adjustedTaskOccupancy(def.occ);
    var per = (c && c.per) || [];
    return Object.keys(def.occ || {}).map(function (k) {
      var p = null;
      for (var i = 0; i < per.length; i++) if (per[i].key === k) p = per[i];
      if (!p) return resName(k) + ' ' + occ[k] + '（—）';
      var left = round2(p.sup - p.dem - p.occ);
      var tag = left < 0
        ? '<span class="tc-lack">缺 ' + fmt1(-left) + '</span>'
        : '<span class="tc-surplus">余 ' + fmt1(left) + '</span>';
      return resName(k) + ' ' + occ[k] + '（' + tag + '）';
    }).join('、');
  }

  function occText(occ) {
    if (!occ) return '无';
    var keys = Object.keys(occ);
    if (!keys.length) return '无';
    return keys.map(function (k) { return resName(k) + ' ' + occ[k]; }).join('、');
  }
  function outText(def, base) {
    var parts = [];
    var output = base ? def.out || {} : G.buildingOutput(def);
    Object.keys(output).forEach(function (k) { parts.push(resName(k) + ' +' + output[k]); });
    if (def.bonus) {
      if (def.bonus.sat) parts.push('满意度 +' + def.bonus.sat);
      if (def.bonus.occDiscount) parts.push('任务占用 −' + Math.round(def.bonus.occDiscount * 100) + '%');
    }
    return parts.length ? parts.join(' · ') : '无直接产出';
  }
  function extraText(def) {
    if (!def.extra) return '';
    return Object.keys(def.extra).map(function (k) { return resName(k) + ' ' + def.extra[k]; }).join('、');
  }
  function rewardText(def) {
    var r = def.reward || {};
    var common = [];
    if (r.rep) common.push('声望 +' + r.rep);
    if (r.money) common.push('金 +' + r.money);
    var popPart = '人口 +' + ((r.pop || 0) + G.TASK_POP_BONUS);
    var supPart = r.sup ? Object.keys(r.sup).map(function (k) {
      return resName(k) + ' +' + r.sup[k];
    }).join('、') : '资源';
    return common.join(' · ') + ' · 二选一：' + popPart + ' / ' + supPart;
  }
  function typeLabel(type) {
    return type === 'timed' ? '限时' : type === 'malignant' ? '恶性' : '普通';
  }
  function typeOrder(type) {
    return type === 'timed' ? 0 : type === 'malignant' ? 1 : 2;
  }

  function render() {
    if (growthOpen || selectingScenario || configuringScenario) {
      var detailsOpen = !!$('modalCard').querySelector('.setup-details[open]');
      var presetsOpen = !!$('modalCard').querySelector('.loadout-presets[open]');
      $('modalCard').innerHTML = growthOpen ? growthHtml() : configuringScenario ? runSetupHtml(detailsOpen, presetsOpen) : scenarioSelectionHtml();
      $('modal').classList.remove('hidden');
      $('btnShowModal').classList.add('hidden');
      $('btnNext').disabled = true;
      $('btnHelp').disabled = true;
      return;
    }
    var S = G.getState();
    if (!S) return;
    $('btnHelp').disabled = false;
    var used = G.laborUsed();
    var best = loadBest();
    if (S.over && S.final && S.final.rep > best) {
      best = S.final.rep;
      saveBest(best);
    }
    recordClear(S);
    recordGrowth(S);
    var current = G.compute();
    renderHud(S, used, best, current);
    renderGoal(S, current);
    var fc = G.forecast();
    renderResources(S, fc, current);
    renderCity(S, used);
    renderTownUpgrade(S);
    renderBuild(S, used);
    renderTasks(S, fc);
    renderLog(S);
    renderAction(S, used);
    renderModal(S, best);
    persist();
  }

  function renderHud(S, used, best, current) {
    $('statTurn').textContent = S.turn + ' / ' + G.MAX_TURNS;
    $('statMoney').textContent = fmt(S.money);
    $('statPop').textContent = S.pop;
    var sat = $('statSat');
    sat.textContent = fmt1(current.sat);
    sat.className = 'v sat ' + (current.sat < 0 ? 'neg' : current.sat < G.REP_START ? 'mid' : 'pos');
    sat.title = '满意度达到 ' + G.REP_THRESHOLDS.join(' / ') + '：每回合声望 +1 / +2 / +3 / +4 / +5；当前 P' + S.pop + ' 上限 +' + G.repCapFor(S.pop);
    $('statPop').title = '每回合声望上限：P<12 为 +3，P12–14 为 +4，P≥15 为 +5；按当前人口计算';
    $('statRep').textContent = S.rep;
    var labor = $('statLabor');
    labor.textContent = used + ' / ' + G.laborCapacity();
    labor.className = 'v labor' + (used > G.laborCapacity() ? ' neg' : '');
    labor.title = '已占用 ' + used + ' · 可用 ' + G.laborAvailable() + ' · 总人口 ' + S.pop + ' · 闲人 ' + G.runModifiers().idleWorkers;
    $('statCity').textContent = S.buildings.length + ' / ' + G.buildingCapacity();
    var town = $('statTown');
    town.textContent = 'Lv.' + S.townLevel;
    town.className = 'v town' + (S.townLevel >= G.TOWN_LEVELS.length ? ' max' : '');
    var nextPop = G.nextTownPop();
    $('statTownNext').textContent = nextPop ? '下阶 P' + nextPop : '已满级';
    $('statBest').textContent = best ? best : '—';
    $('statBest').title = '本机最高最终声望（全部难度与 BUFF）';
  }

  function renderResources(S, fc, current) {
    var c = current;
    var grid = $('resGrid');
    if (!c) { grid.innerHTML = ''; $('satMath').textContent = ''; return; }
    var n = fc && fc.last ? fc.last : null;
    var nextLabel = S.turn >= G.MAX_TURNS ? (S.scenarioId ? '验收' : '结算') : '下回合';
    function nextOf(key) {
      if (!n) return null;
      for (var i = 0; i < n.per.length; i++) if (n.per[i].key === key) return n.per[i];
      return null;
    }
    grid.innerHTML = c.per.map(function (p) {
      var np = nextOf(p.key);
      var score = np ? np.score : p.score;
      var barP = p;
      var barTotal = Math.round((barP.dem + barP.occ) * 100) / 100;
      var coveredDem = Math.max(0, Math.min(barP.dem, barP.sup - barP.occ));
      var shortDem = Math.max(0, barP.dem - coveredDem);
      var occPct = barTotal > 0 ? Math.min(100, Math.max(0, (barP.occ / barTotal) * 100)) : 0;
      var demPct = barTotal > 0 ? Math.max(0, (coveredDem / barTotal) * 100) : 0;
      var shortPct = barTotal > 0 ? Math.max(0, (shortDem / barTotal) * 100) : 0;
      var cls = p.group === 'advanced' ? 'advanced' : 'basic';
      var full = barP.sup > 0 && barP.occ === 0 ? ' full' : barP.sup <= 0 ? ' zero' : '';
      var barOver = barP.over > 0 ? ' over' : '';
      var short = shortDem > 0 ? ' short' : '';
      var deltaCls = np ? (np.score > p.score ? ' up' : np.score < p.score ? ' down' : '') : '';
      var supCls = np ? (np.sup > p.sup ? ' up' : np.sup < p.sup ? ' down' : '') : '';
      var advPct = c.advancedOutputPct == null ? 100 : c.advancedOutputPct;
      var advWarn = p.group === 'advanced' && c.advancedShort > 0;
      var extraSup = round2(barP.sup - barP.occ - barP.dem);
      var extraCls = extraSup < 0 ? ' neg' : extraSup > 0 ? ' pos' : '';
      var extraLabel = extraSup < 0 ? '缺口' : '额外供给';
      var extraNum = extraSup < 0 ? fmt1(-extraSup) : (extraSup > 0 ? '+' : '') + fmt1(extraSup);
      return '<article class="res-card ' + cls + full + barOver + short + '" title="额外供给 = 提供 ' + barP.sup + ' − 占用 ' + barP.occ + ' − 需求 ' + barP.dem + '；供给 ' + barP.sup + ' / 占用 ' + barP.occ + ' / 需求 ' + barP.dem + (shortDem > 0 ? ' / 基础需求缺口 ' + Math.round(shortDem * 100) / 100 : '') + '">' +
        '<div class="res-top"><span class="res-icon">' + p.icon + '</span>' +
        '<span class="res-name">' + p.name + '</span>' +
        '<span class="res-tag">' + (p.group === 'advanced' ? '高级' : '基础') + '</span></div>' +
        '<div class="res-flow">' +
        '<span class="rf-label">当前</span><b>' + p.sup + '</b>' +
        '<span class="res-arrow">→</span>' +
        '<span class="rf-label">' + nextLabel + '</span><b class="res-next' + supCls + '">' + (np ? np.sup : '—') + '</b>' +
        '<span class="res-sub">/ 需 ' + (np ? np.dem : p.dem) + '</span>' +
        '</div>' +
        '<div class="res-extra' + extraCls + '"><span>' + extraLabel + '</span><b>' + extraNum + '</b><small>/ 回合</small></div>' +
        '<div class="res-scoreline">满足 <b>' + fmt1(p.score) + '</b>' +
        '<span class="res-arrow">→</span><b class="res-next' + deltaCls + '">' + (np ? fmt1(np.score) : '—') + '</b></div>' +
        '<div class="bar res-bar' + barOver + short + '">' +
        '<i class="occ" style="width:' + occPct + '%"></i>' +
        '<i class="dem" style="width:' + demPct + '%"></i>' +
        '<i class="shortfall" style="width:' + shortPct + '%"></i></div>' +
        '<div class="res-foot">供给 ' + barP.sup + ' · 占用 ' + barP.occ + ' · 需求 ' + barP.dem +
        (barP.over ? ' · <span class="res-over">超额 ' + barP.over + '</span>' : '') +
        (advWarn ? ' · <span class="res-stopped">低阶不足·' + (advPct > 0 ? '产出 ' + advPct + '%' : '停产') + '</span>' : '') + '</div>' +
        '</article>';
    }).join('');
    var math;
    if (n) {
      var pressure = n.turnPressure || 0;
      math = '当前 <b>' + fmt1(c.sat) + '</b> → ' + nextLabel + ' <b>' + fmt1(n.sat) + '</b>' +
        '<span class="sat-detail">八项 ' + fmt1(n.sum) + ' − 人口惩罚 ' + fmt1(n.penalty) +
        ' − 赤字 ' + G.DEFICIT +
        (n.affixPenalty ? ' − 词缀 ' + n.affixPenalty : '') +
        (pressure ? ' − <span class="sat-neg">回合压力 ' + fmt1(pressure) + '</span>' : '') +
        (n.market ? ' + 市场 ' + n.market : '') + '</span>' +
        '<span class="sat-rep">' + nextLabel + '声望 +' + n.repGain + '（P' + n.pop + ' 上限 +' + G.repCapFor(n.pop) + '）</span>';
    } else {
      math = '当前 <b>' + fmt1(c.sat) + '</b> · ' + (S.over ? '本局已结束' :
        '预测暂不可用（先处理奖励、蓝图或劳力）');
    }
    $('satMath').innerHTML = math;
    $('statRepNext').textContent = n ? nextLabel + '声望 +' + n.repGain : S.over ? '本局已结束' : '下回合 —';
    $('statRepNext').title = n ? '按预测结算人口 P' + n.pop + '，每回合声望上限 +' + G.repCapFor(n.pop) + '；任务声望奖励不受此上限限制' : '';
  }

  function goalConditionHtml(r) {
    var value = r.key === 'balance' ? fmtNet(r.current) : r.key === 'sat' ? fmt1(r.current) : fmt(r.current);
    return '<div class="goal-condition' + (r.met ? ' met' : '') + '">' +
      '<span class="goal-check">' + (r.met ? '✓' : '◇') + '</span>' +
      '<div><span>' + esc(r.label) + '</span><b>' + value + ' <small>/ ' + r.target + '</small></b></div>' +
      '<small class="goal-gap">' + (r.met ? '符合' : '还差 ' + fmt1(r.shortfall)) + '</small></div>';
  }

  function renderGoal(S, current) {
    var goal = S.over && S.final ? S.final.goal : G.goalStatus(current);
    if (!goal) {
      $('gameSubtitle').textContent = '自由经营 · 30 回合声望成绩';
      $('goalPanel').innerHTML = '<div class="goal-heading"><h2>自由经营 · 旧存档</h2>' +
        '<span class="goal-state">保留原进度</span></div>' +
        '<p class="goal-note">本局记录声望，不参与关卡验收。可在选关后开启新的建设目标。</p>';
      return;
    }
    $('gameSubtitle').textContent = goal.name + ' · ' + configLabel(S.runConfig);
    var status = S.over ? (S.final.cleared ? '已通关' : '未通关') :
      goal.cleared ? '当前达标 · 待 T30 验收' : '建设中 · 剩 ' + (G.MAX_TURNS - S.turn) + ' 回合';
    $('goalPanel').innerHTML = '<div class="goal-heading"><h2>' + esc(goal.name) + ' · 建设目标</h2>' +
      '<span class="goal-state' + (goal.cleared ? ' met' : '') + '">' + status + '</span></div>' +
      '<div class="goal-conditions">' + goal.conditions.map(goalConditionHtml).join('') + '</div>' +
      (G.runModifiers().hardRule ? '<p class="goal-note"><b>' + G.runModifiers().hardRule.name + '</b>：' + G.runModifiers().hardRule.description +
        (S.runConfig.affixIds ? ' 词缀：' + S.runConfig.affixIds.map(function (id) { var a = G.AFFIXES.filter(function (a) { return a.id === id; })[0]; return a.name + '（' + a.description + '）'; }).join('、') : '') + '</p>' : '') +
      '<p class="goal-note">' + (S.over ? '本局验收已完成，声望成绩单独保留。' :
        'T30 完成奖励选择与建设操作后验收，全部条件符合才通关。净余量 = 供给 − 城市需求 − 全部任务占用。') + '</p>';
  }

  function scenarioSelectionHtml() {
    var records = loadCampaign(), g = currentGrowth();
    return '<div class="modal-head"><h2>选择建设关卡</h2>' +
      '<p>每关 30 回合，达成全部建设目标才算通关。共 ' + G.SCENARIOS.length + ' 关，现已开放 ' + g.scenarioIds.length + ' 关；累计声望 ' + chapterThresholds().join(' / ') + ' 各解锁一批新关卡。</p></div>' +
      growthSummaryHtml() +
      '<div class="scenario-grid">' + G.SCENARIOS.map(function (s, index) {
        var locked = g.scenarioIds.indexOf(s.id) < 0;
        var count = Object.keys(records).filter(function (key) { return key.indexOf(s.id + '|') === 0; }).length;
        return '<button class="scenario-card' + (locked ? ' locked' : '') + '" data-scenario="' + s.id + '" type="button"' + (locked ? ' disabled' : '') + '>' +
          '<span class="scenario-tag">第 ' + (index + 1) + ' 关 · ' + s.tag + '</span><span class="scenario-icon">' + s.icon + '</span>' +
          '<h3>' + s.name + '</h3><p>' + s.description + '</p>' +
          '<ul>' + s.requirements.map(function (r) { return '<li>' + r.label + ' ≥ ' + r.target + '</li>'; }).join('') + '</ul>' +
          '<span class="scenario-record' + (count ? ' cleared' : '') + '">' +
          (count ? '✓ 已通关 · ' + count + ' 种配置' : '尚未通关') + '</span>' +
          '<span class="pick-btn">' + (locked ? '累计 ' + s.unlockRep + ' 声望解锁 · 还差 ' + (s.unlockRep - g.totalRep) : '选择难度与 BUFF') + '</span></button>';
      }).join('') + '</div><p class="goal-note">' +
      (G.getState() ? '确认开局时替换当前进度；通关记录和最佳声望保留。' : '选择关卡、难度和 BUFF 后，进入开局蓝图。') + '</p>' +
      (G.getState() ? '<div class="modal-actions"><button class="btn ghost" data-cancel-scenario="1" type="button">返回当前城市</button></div>' : '');
  }

  function chapterThresholds() {
    return G.SCENARIOS.map(function (s) { return s.unlockRep || 0; }).filter(function (rep, i, all) { return rep > 0 && all.indexOf(rep) === i; }).sort(function (a,b) { return a-b; });
  }
  function growthMilestones() {
    var rows = G.BUFFS.filter(function (b) { return b.unlockRep > 0; }).map(function (b) {
      return { rep: b.unlockRep, name: 'BUFF · ' + b.name, description: b.description + ' 消耗 ' + b.cost + ' 点额度。', legacy: !b.newIn314 };
    });
    G.CAPACITY_LEVELS.slice(1).forEach(function (l) { rows.push({ rep: l.rep, name: '携带额度 ' + l.capacity + ' 点', description: '可选择更多 BUFF 组合，每局自由调整。', legacy: l.capacity <= 6 }); });
    rows.push({ rep: G.REROLL_UNLOCK_REP, name: '蓝图刷新', description: '每局可刷新 1 次待选蓝图，开局与城镇升级共用次数。', legacy: true });
    rows.push({ rep: G.SECOND_REROLL_REP, name: '蓝图刷新升级', description: '每局共可刷新 2 次，开局与城镇升级共用次数。', legacy: false });
    G.BLUEPRINTS.filter(function (b) { return b.unlockRep > 0; }).forEach(function (b) {
      rows.push({ rep: b.unlockRep, name: '新蓝图 · ' + b.name, description: outText(b, true) + (extraText(b) ? '；耗 ' + extraText(b) : '') + '。解锁后加入随机池，仍需抽取和花钱建造。', legacy: true });
    });
    chapterThresholds().forEach(function (rep, index) {
      var stages = G.SCENARIOS.filter(function (s) { return s.unlockRep === rep; });
      rows.push({ rep: rep, name: (index === 0 ? '拓展关卡' : '高阶关卡') + ' · 新增 ' + stages.length + ' 关', description: stages.map(function (s) { return s.name; }).join('、') + '，解锁后可自由挑战。', legacy: false });
    });
    return rows.sort(function (a, b) { return a.rep - b.rep; });
  }
  function milestoneUnlocked(row, total, floor) { return (row.legacy ? Math.max(total, floor) : total) >= row.rep; }
  function growthSummaryHtml() {
    var g = currentGrowth(), next = growthMilestones().filter(function (r) { return !milestoneUnlocked(r, g.totalRep, g.legacyUnlockRep); })[0];
    return '<div class="growth-summary"><div><b>累计声望 ' + fmt(g.totalRep) + '</b><span>携带额度 ' + g.capacity + ' · 蓝图池 ' + g.blueprintIds.length + ' · 每局刷新 ' + g.rerolls + ' 次</span>' +
      '<small>' + (next ? '下个解锁：' + next.name + '，还差 ' + fmt(next.rep - g.totalRep) + ' 声望' : '当前成长已全部解锁') + '</small></div>' +
      '<button class="btn ghost" data-open-growth="1" type="button">局外成长</button></div>';
  }
  function growthSettlementHtml(S) {
    var r = loadGrowth().settled[S.runId];
    if (S.growthEligible !== true) return '<p class="end-growth">旧版已结束的对局不补算成长声望。</p>';
    if (!r) return '<p class="end-growth">成长声望尚未保存，请检查浏览器存储后刷新重试。</p>';
    var floor = loadGrowth().legacyUnlockRep;
    var unlocked = r.beforeRep === null ? [] : growthMilestones().filter(function (m) { return !milestoneUnlocked(m, r.beforeRep, floor) && milestoneUnlocked(m, r.afterRep, floor); });
    return '<section class="growth-settlement" aria-label="本次成长结算"><h3>本次成长结算</h3><dl>' +
      '<div><dt>本局声望</dt><dd>+' + fmt(r.baseRep) + '</dd></div>' +
      '<div><dt>通关奖励</dt><dd>+' + fmt(r.clearBonus) + '</dd></div>' +
      ((S.runConfig.affixIds || []).length || r.affixBonus ? '<div><dt>词缀奖励</dt><dd>+' + fmt(r.affixBonus || 0) + '</dd></div>' : '') +
      '<div><dt>首通奖励</dt><dd>+' + fmt(r.firstClearBonus) + '</dd></div>' +
      '<div class="growth-total"><dt>累计声望收入</dt><dd>+' + fmt(r.total) + '</dd></div></dl>' +
      (r.beforeRep !== null ? '<p>累计 ' + fmt(r.beforeRep) + ' → ' + fmt(r.afterRep) + '</p>' : '') +
      (r.rewardVersion === 0 ? '<p class="goal-note">历史对局保留原入账金额，不补发通关与首通奖励。</p>' :
        !r.cleared ? '<p class="goal-note">未通关，仍保留本局声望；达成建设目标可获得额外奖励。</p>' :
        !r.firstClearBonus ? '<p class="goal-note">此关此难度的首通已领取，切换 BUFF 或词缀不重复发放。</p>' : '') +
      (unlocked.length ? '<div class="growth-new"><b>本次解锁 · 下一局生效</b><ul>' + unlocked.map(function (m) { return '<li>' + esc(m.name) + '</li>'; }).join('') + '</ul></div>' : '') + '</section>';
  }
  function failureAdviceHtml(f) {
    if (!f.goal || f.cleared) return '';
    return '<div class="failure-advice"><b>下一局建设建议</b><ul>' + f.goal.conditions.filter(function (r) { return !r.met; }).map(function (r) {
      var advice = r.key === 'pop' ? '为人口奖励预留基础供给，减少低满意度掉人口。' :
        r.key === 'sat' ? '先补基础缺口，再配套高级供给；接任务前查看满意度预测。' :
        '提高' + resName(r.resource) + '供给，并检查人口需求、建筑投入和任务占用。';
      return '<li>' + esc(r.label) + '还差 ' + fmt1(r.shortfall) + '：' + advice + '</li>';
    }).join('') + '</ul></div>';
  }
  function growthHtml() {
    var g = currentGrowth();
    return '<div class="modal-head"><h2>局外成长</h2><p>完成 30 回合后，本局声望计入累计；通关额外获得关卡奖励和未领取的首通奖励。首通按关卡 × 难度领取，换 BUFF 不重复发放。累计达标自动解锁，不扣除声望，新解锁在下一局生效。</p></div>' +
      '<div class="setup-summary"><b>累计声望 ' + fmt(g.totalRep) + '</b><span>携带额度 ' + g.capacity + ' 点 · 已开放蓝图 ' + g.blueprintIds.length + ' 张 · 每局蓝图刷新 ' + g.rerolls + ' 次</span></div>' +
      '<p class="goal-note">本局声望 100% 计入累计，失败也保留；中途重开不结算。困难通关奖励为普通的 2 倍，首通奖励按关卡固定、每难度各领一次。旧账本金额和已解锁权限保留，历史通关视为已领取首通，不补发奖励。</p>' +
      '<div class="growth-list">' + growthMilestones().map(function (r) {
        var unlocked = milestoneUnlocked(r, g.totalRep, g.legacyUnlockRep);
        return '<div class="growth-item' + (unlocked ? ' unlocked' : '') + '"><div><b>' + (unlocked ? '✓ ' : '◇ ') + r.name + '</b><span>' + r.description + '</span></div>' +
          '<small>' + (unlocked ? (g.totalRep < r.rep ? '旧版权限保留' : '已解锁') : '累计 ' + fmt(r.rep) + ' · 还差 ' + fmt(r.rep - g.totalRep)) + '</small></div>';
      }).join('') + '</div><div class="modal-actions"><button class="btn primary" data-close-growth="1" type="button">返回</button></div>';
  }

  function loadoutAdviceHtml(g) {
    var advice = L.recommendation(configuringScenario, pendingRunConfig.difficultyId, g.totalRep, g.legacyUnlockRep);
    if (!advice) return '';
    var selected = pendingRunConfig.buffIds.join('|') === advice.buffIds.join('|');
    return '<section class="loadout-advice" aria-label="本关配装建议"><b>本关建设建议</b><p>' + esc(advice.focus) + '</p>' +
      '<div><span>建议 BUFF：' + esc(buffLabel(advice.buffIds)) + ' · ' + advice.cost + ' / ' + g.capacity + ' 点</span>' +
      '<button class="btn ghost" type="button" data-apply-advice="1"' + (selected ? ' disabled' : '') + '>' +
      (selected ? '已采用此组合' : '采用建议 BUFF') + '</button></div>' +
      '<small>按当前已解锁内容提供一种搭配，可自由调整；蓝图仍需抽取。' +
      (pendingRunConfig.difficultyId === 'hard' ? '困难模式更依赖资源调度，建议先熟悉普通模式。' : '') + '</small></section>';
  }
  function loadoutPresetsHtml(g, open) {
    return '<details class="loadout-presets"' + (open ? ' open' : '') + '><summary>我的 BUFF 方案 · 已保存 ' +
      loadouts.slots.filter(function (s) { return !!s; }).length + ' / ' + L.SLOT_COUNT + '</summary>' +
      '<p>保存到此浏览器，跨关卡使用。载入只替换 BUFF，保留当前难度与词缀；确认开始本局后生效。</p>' +
      '<div class="loadout-grid">' + loadouts.slots.map(function (slot, index) {
        var check = L.status(slot, pendingRunConfig.difficultyId, g.totalRep, g.legacyUnlockRep);
        var reason = check.ok ? check.cost + ' / ' + check.capacity + ' 点' : check.error;
        return '<div class="loadout-slot"><label for="loadout-name-' + index + '">方案 ' + (index + 1) + ' 名称</label>' +
          '<input id="loadout-name-' + index + '" data-loadout-name="' + index + '" maxlength="' + L.NAME_LIMIT + '" value="' + esc(loadoutNames[index]) + '">' +
          '<span>' + esc(slot ? buffLabel(slot.buffIds) : '保存当前选择，方便下次使用') + '</span><small>' + esc(reason) + '</small>' +
          '<div class="loadout-actions"><button class="btn ghost" data-save-loadout="' + index + '" type="button">' +
          (slot ? '覆盖为当前 BUFF' : '保存当前 BUFF') + '</button>' +
          '<button class="btn ghost" data-apply-loadout="' + index + '" aria-label="载入方案 ' + (index + 1) + '" type="button"' +
          (check.ok ? '' : ' disabled') + '>载入</button></div></div>';
      }).join('') + '</div></details>';
  }
  function runSetupHtml(detailsOpen, presetsOpen) {
    var s = G.SCENARIOS.filter(function (x) { return x.id === configuringScenario; })[0];
    var m = G.runModifiers(pendingRunConfig, s.id);
    var g = currentGrowth(), status = G.runConfigStatus(pendingRunConfig, g.totalRep, g.legacyUnlockRep);
    var reward = P.rewardPreview(loadGrowth(), s.id, pendingRunConfig);
    var record = loadCampaign()[P.key(s.id, pendingRunConfig, g.totalRep, g.legacyUnlockRep)];
    function option(def, field) {
      var buff = field === 'buffIds';
      var selected = buff ? (def.id === 'none' ? !pendingRunConfig.buffIds.length : pendingRunConfig.buffIds.indexOf(def.id) >= 0) : pendingRunConfig[field] === def.id;
      var locked = buff && g.buffIds.indexOf(def.id) < 0 && def.id !== 'none';
      var over = buff && def.id !== 'none' && !selected && status.cost + def.cost > g.capacity;
      return '<button class="setup-option' + (selected ? ' selected' : '') + '" data-config-field="' + field +
        '" data-config-value="' + def.id + '" aria-pressed="' + selected + '" type="button"' + ((locked || over) && !selected ? ' disabled' : '') + '>' +
        '<b>' + def.name + (buff && def.id !== 'none' ? ' · ' + def.cost + ' 点' : '') + '</b><span>' +
        (field === 'difficultyId' && def.id === 'hard' ? G.hardRule({ difficultyId: 'hard' }, s.id).name + '：' + G.hardRule({ difficultyId: 'hard' }, s.id).description : def.description) + '</span>' +
        (locked ? '<small>累计 ' + def.unlockRep + ' 声望解锁</small>' : over ? '<small>剩余额度不足</small>' : '') + '</button>';
    }
    return '<div class="modal-head"><h2>' + s.icon + ' ' + s.name + ' · 开局配置</h2>' +
      '<p>可携带多个不同 BUFF，总消耗不能超过携带额度。点击已选项可移除。</p></div>' +
      '<div class="setup-goal"><b>通关要求</b>：' + s.requirements.map(function (r) {
        return r.label + ' ≥' + r.target;
      }).join('、') + '</div>' +
      growthSummaryHtml() +
      '<div class="setup-rewards"><b>成长奖励预览</b><span>本局声望 100% ＋ 通关 ' + reward.clearBonus + ' ＋ 词缀 ' + reward.affixBonus + ' ＋ 首通 ' + reward.firstClearBonus +
      (reward.firstCleared ? '（此难度已领取）' : '（此关此难度仅一次）') + '</span><small>通关才获得额外奖励；未通关仍累计本局声望。</small></div>' +
      '<fieldset class="setup-group"><legend>难度</legend><div class="setup-options difficulties">' +
      G.DIFFICULTIES.map(function (d) { return option(d, 'difficultyId'); }).join('') + '</div></fieldset>' +
      (pendingRunConfig.difficultyId === 'hard' ? '<fieldset class="setup-group"><legend>附加困难词缀 · 已选 ' + (pendingRunConfig.affixIds || []).length + ' 项 · 奖励 +' + reward.affixPercent + '%</legend>' +
        '<p class="goal-note">每种可选一次，数量不限，可全部勾选，不消耗 BUFF 额度。词缀奖励百分比相加、不封顶，以困难通关奖励为基数；不放大本局声望或首通奖励。</p>' +
        '<div class="affix-actions"><button class="btn ghost" data-affix-action="all" type="button">全选词缀</button><button class="btn ghost" data-affix-action="clear" type="button">清空词缀</button></div><div class="setup-options affixes">' +
        G.AFFIXES.map(function (a) {
          var selected = (pendingRunConfig.affixIds || []).indexOf(a.id) >= 0;
          return '<button class="setup-option' + (selected ? ' selected' : '') + '" data-affix="' + a.id + '" aria-pressed="' + selected + '" type="button">' +
            '<b>' + a.name + '</b><span>' + a.description + '</span><small>通关词缀奖励 +' + a.rewardPercent + '%</small></button>';
        }).join('') + '</div></fieldset>' : '') +
      loadoutAdviceHtml(g) + loadoutPresetsHtml(g, presetsOpen) +
      '<fieldset class="setup-group"><legend>开局 BUFF · 已用 ' + status.cost + ' / ' + g.capacity + ' 点</legend><div class="setup-options">' +
      G.BUFFS.map(function (b) { return option(b, 'buffIds'); }).join('') + '</div></fieldset>' +
      '<div class="setup-summary"><b>' + configLabel(pendingRunConfig) + '</b>' +
      '<span>初始金钱 ' + m.startingMoney + ' · 初始人口 ' + m.startingPop + ' · 可工作 ' + Math.max(0, m.startingPop - m.idleWorkers) + ' · 开局蓝图 ' + (m.openingBlueprints > 1 ? '5 选 2' : '3 选 1') + ' · 每人需求合计 ' + fmtRate(m.occupancyCost) + '</span>' +
      '<span>建筑上限 ' + m.buildingCap + ' · 建筑价格 ×' + fmtRate(m.buildingCostMultiplier) + ' · 建筑资源产出 ×' + fmtRate(m.buildingOutputMultiplier) + ' · 任务占用 ×' + fmtRate(m.taskOccupancyMultiplier) + ' · 满意度 −' + m.satisfactionPenalty + '</span>' +
      '<span>' + (record ? '✓ 此配置已通关 · 最佳通关声望 ' + fmt(record.bestRep) : '此配置尚未通关') + '</span></div>' +
      '<details class="setup-details"' + (detailsOpen ? ' open' : '') + '><summary>查看开局供给和人口需求</summary><table class="setup-table">' +
      '<thead><tr><th>资源</th><th>基础供给／回合</th><th>人均需求</th><th>P' + m.startingPop + ' 人口需求</th></tr></thead><tbody>' +
      G.RES.map(function (r) { return '<tr><td>' + r.icon + ' ' + r.name + '</td><td>' +
        (r.base + m.baseSupply[r.key]) + '</td><td>' + fmtRate(m.populationDemand[r.key]) + '</td><td>' +
        fmtRate(round2(m.populationDemand[r.key] * m.startingPop)) + '</td></tr>'; }).join('') +
      '</tbody></table><p class="goal-note">人口需求按基础值 × 本关困难倍率 × 词缀倍率 × BUFF 倍率计算，汇总城市需求时统一保留两位小数。建筑投入与任务占用另行计入。' +
      (m.buildingCostMultiplier !== 1 ? '本局建筑价格 ×' + m.buildingCostMultiplier + '，逐座向上取整。' : '') + '</p></details>' +
      '<div class="modal-actions"><button class="btn ghost" data-back-scenarios="1" type="button">返回选关</button>' +
      '<button class="btn primary" data-start-configured="1" type="button"' + (status.ok ? '' : ' disabled') + '>开始本局</button></div>';
  }

  function renderCity(S, used) {
    var hint = $('cityHint');
    var activeCount = S.buildings.filter(function (b) { return b.active; }).length;
    hint.textContent = '已建 ' + S.buildings.length + ' / ' + G.buildingCapacity() + ' · 启用 ' + activeCount + ' 座 · 劳力 ' + used + ' / ' + G.laborCapacity();
    hint.className = 'hint' + (used > G.laborCapacity() ? ' danger' : '');
    var list = $('cityList');
    if (!S.buildings.length) {
      list.innerHTML = '<div class="empty">还没有建筑。先从右边建造基础供给。</div>';
      return;
    }
    var groups = [];
    S.buildings.forEach(function (b) {
      var d = defOfBuilding(b);
      var g = null;
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].def.id === d.id) { g = groups[i]; break; }
      }
      if (!g) { g = { def: d, total: 0, active: 0 }; groups.push(g); }
      g.total += 1;
      if (b.active) g.active += 1;
    });
    list.innerHTML = groups.map(function (g) {
      var d = g.def;
      return '<div class="city-row' + (g.active ? '' : ' off') + '">' +
        '<span class="cr-icon">' + d.icon + '</span>' +
        '<div class="cr-main"><b>' + d.name + '<span class="cr-total">×' + g.total + '</span></b>' +
        '<small>劳力 ' + d.labor + '/座 · 启用 ' + g.active + ' / ' + g.total + '</small></div>' +
        '<div class="cr-stepper">' +
        '<button class="step" data-step="-1" data-def="' + d.id + '"' + (g.active <= 0 ? ' disabled' : '') + ' type="button">−</button>' +
        '<span class="step-val">' + g.active + '</span>' +
        '<button class="step" data-step="1" data-def="' + d.id + '"' + (g.active >= g.total ? ' disabled' : '') + ' type="button">+</button>' +
        '</div></div>';
    }).join('');
  }

  function buildCard(S, id) {
    var d = G.buildingDef(id);
    var st = G.buildStatus(id);
    var count = S.buildings.filter(function (b) { return b.defId === id; }).length;
    var extra = extraText(d);
    var note = bpNote(id);
    var net = G.buildingNet(d);
    var netLine = net === null ? '' :
      '<small class="bc-net" title="满产净产出 = 产出 − 额外消耗 − 劳力×' + G.runModifiers().occupancyCost + '；仅用于横向比较，不重复扣实际供需">满产净 ' + fmtNet(net) + ' / 回合</small>';
    var reason = st.ok ? '' : '<span class="bc-reason">' + st.reason + '</span>';
    return '<button class="build-card' + (st.ok ? '' : ' is-dis') + '" data-build="' + id + '"' +
      (st.ok ? '' : ' disabled') + ' title="' + (st.ok ? '预览建造 ' + d.name : st.reason) + '" type="button">' +
      '<span class="bc-icon">' + d.icon + '</span>' +
      '<div class="bc-main"><b>' + d.name + '</b>' +
      '<small>' + outText(d) + ' · 劳力 ' + d.labor + '</small>' +
      (extra ? '<small class="extra">耗 ' + extra + '</small>' : '') +
      (netLine) +
      (note ? '<small class="bp-note">' + note + '</small>' : '') + '</div>' +
      '<div class="bc-right"><span class="bc-cost">' + G.buildingCost(d) + '</span>' +
      '<span class="bc-count">' + count + '/' + d.max + '</span>' + reason + '</div>' +
      '</button>';
  }

  function renderTownUpgrade(S) {
    var box = $('townUpgrade');
    if (!box) return;
    var maxLevel = G.TOWN_LEVELS.length;
    if (S.townLevel >= maxLevel) {
      box.innerHTML = '<div class="town-box maxed">' +
        '<div class="town-main"><span class="town-lv">Lv.' + S.townLevel + '</span>' +
        '<div><b>城镇已满级</b><small>蓝图池 ' + S.unlocked.length + ' / ' + G.growthStatus(S.growthRep, S.legacyUnlockRep).blueprintIds.length + '</small></div></div>' +
        '<span class="town-tag">MAX</span></div>';
      return;
    }
    var st = G.townUpgradeStatus();
    var need = G.nextTownPop();
    var nextLevel = S.townLevel + 1;
    var can = st.ok;
    var reason = can ? '当前 P' + S.pop + ' / 需求 P' + need : st.reason;
    box.innerHTML = '<div class="town-box' + (can ? ' ready' : '') + '">' +
      '<div class="town-main"><span class="town-lv">Lv.' + S.townLevel + '</span>' +
      '<div><b>升级城镇 → Lv.' + nextLevel + '</b>' +
      '<small>需求 P' + need + ' · 5 选 2 蓝图 · 消耗本回合建造</small></div></div>' +
      '<button class="town-btn" data-town-upgrade="1" type="button"' + (can ? '' : ' disabled') + '>' +
      (can ? '升级' : '不可升级') + '</button>' +
      '<div class="town-note' + (can ? '' : ' muted') + '">' + reason + '</div></div>';
  }

  function renderBuild(S, used) {
    var hint = $('buildHint');
    hint.textContent = (S.hasBuilt ? '本回合已建造/升级' : '每回合 1 次') + ' · 劳力 ' + used + ' / ' + G.laborCapacity() + ' · 蓝图 ' + S.unlocked.length + '/' + G.growthStatus(S.growthRep, S.legacyUnlockRep).blueprintIds.length;
    hint.className = 'hint' + (used > G.laborCapacity() ? ' danger' : '');
    var html = '<div class="build-group"><div class="group-head"><span>基础</span><span>8 种</span></div><div class="build-grid">';
    html += G.BASE_BUILDINGS.map(function (d) { return buildCard(S, d.id); }).join('');
    html += '</div></div>';
    var unlocked = G.BLUEPRINTS.filter(function (d) { return S.unlocked.indexOf(d.id) >= 0; });
    if (unlocked.length) {
      html += '<div class="build-group"><div class="group-head"><span>蓝图</span><span>' + unlocked.length + ' 张</span></div><div class="build-grid">';
      html += unlocked.map(function (d) { return buildCard(S, d.id); }).join('');
      html += '</div></div>';
    } else {
      html += '<div class="empty small">蓝图从开局选择和城镇升级获得；先选完开局蓝图。</div>';
    }
    $('buildList').innerHTML = html;
  }

  function renderTasks(S, fc) {
    var nextSat = fc && fc.last ? fmt1(fc.last.sat) : '—';
    var nextRep = fc && fc.last ? fc.last.repGain : 0;
    var nextOver = fc && fc.last ? fc.last.over : 0;
    var nextLabel = S.turn >= G.MAX_TURNS ? '终局' : '下回合';
    $('taskHint').textContent = '任务栏 ' + S.board.length + ' · 进行中 ' + S.active.length +
      ' · ' + nextLabel + '预测 ' + nextSat + ' · ' + nextLabel + '声望 +' + nextRep +
      (nextOver ? ' · 超额 ' + nextOver : '');
    var board = S.board.slice().filter(function (t) {
      return taskFilter === 'all' || defOfTask(t).type === taskFilter;
    }).sort(function (a, b) {
      var da = defOfTask(a), db = defOfTask(b);
      return typeOrder(da.type) - typeOrder(db.type) || a.spawnTurn - b.spawnTurn;
    });
    var list = $('boardList');
    if (!board.length) {
      list.innerHTML = taskFilter === 'all'
        ? '<div class="empty">任务栏空了。等刷新节点，或先补建筑。</div>'
        : '<div class="empty">当前筛选没有任务。</div>';
    } else {
      list.innerHTML = board.map(function (t) {
        var d = defOfTask(t);
        var gate = G.taskAcceptStatus(t.uid);
        var blocked = !gate.ok;
        var ft = blocked ? null : G.forecastTask(t.uid);
        var est = blocked ? null : G.estimateTaskFinish(t.uid);
        var preview = ft ? ft.sat : null;
        var previewCls = preview === null ? '' : preview < 0 ? ' neg' : preview >= G.REP_START ? ' pos' : ' mid';
        var deltaTxt = ft
          ? '<span class="tc-delta ' + (ft.delta >= 0 ? 'pos' : 'neg') + '">变化 ' + (ft.delta >= 0 ? '+' : '') + fmt1(ft.delta) +
            ' · ' + (S.turn >= G.MAX_TURNS ? '终局' : '下回合') + '声望 +' + ft.last.repGain + '</span>'
          : '';
        var extra = '';
        if (blocked) {
          extra += '<div class="tc-deadline urgent">无法接取：' + esc(gate.error) + '</div>';
        }
        if (ft && ft.last.over > nextOver) {
          extra += '<div class="tc-deadline urgent">接取后总超额 ' + ft.last.over +
            '；相关任务进度变慢</div>';
        }
        if (d.type === 'timed') {
          var left = t.acceptBy - S.turn;
          extra += '<div class="tc-deadline' + (left <= 1 ? ' urgent' : '') + '">限时：T' + t.acceptBy + ' 前接' +
            (left <= 1 ? '（最后回合）' : '（剩 ' + left + ' 回合）') + '</div>';
        } else if (d.type === 'malignant') {
          extra += '<div class="tc-deadline">出生负担 A：' + occText(G.adjustedTaskOccupancy(d.burdenA)) +
            (t.aReleased ? '（已释放）' : '（接取前持续占用）') + '</div>';
        }
        if (est && est.ok) {
          if (est.finishTurn) {
            var slowTxt = est.step < 1 ? ' · 接取后进度 ×' + est.step : '';
            extra += '<div class="tc-deadline' + (est.late ? ' urgent' : '') + '">接取后预计 T' + est.finishTurn +
              ' 完成' + slowTxt + '</div>';
            if (est.late) {
              extra += '<div class="tc-deadline urgent">本局内无法完成（最终 T' + G.MAX_TURNS + '）</div>';
            }
          } else if (est.late) {
            extra += '<div class="tc-deadline urgent">接取后无法在 T' + G.MAX_TURNS + ' 前完成</div>';
          }
        }
        var occLabel = d.type === 'malignant' ? '接取占用 B' : '占用';
        return '<article class="task-card ' + d.type + (blocked ? ' blocked' : '') + '">' +
          '<div class="tc-top"><b>' + d.name + '</b><span class="badge ' + d.type + '">' + typeLabel(d.type) + '</span>' +
          '<span class="tc-dur">' + d.duration + ' 回合</span></div>' +
          '<div class="tc-occ" title="占用含词缀倍率，仓库在汇总后减免；余额 = 接取后供给 − 城市需求（人口及建筑消耗）− 全部任务占用；已计入仓库与高级减产">' + occLabel + '：' + taskOccText(d, t) + '</div>' +
          '<div class="tc-reward">' + rewardText(d) + '</div>' +
          extra +
          '<div class="tc-foot"><span class="tc-sat' + previewCls + '">接取后预计满意度 ' +
          (preview === null ? '—' : fmt1(preview)) + deltaTxt + '</span>' +
          '<button class="btn small primary" data-accept="' + t.uid + '"' +
          (blocked || S.pendingDraw || S.over ? ' disabled' : '') + ' type="button">' +
          (blocked ? '产出不足' : '接取') + '</button></div>' +
          '</article>';
      }).join('');
    }

    $('activeCount').textContent = S.active.length;
    var act = $('activeList');
    if (!S.active.length) {
      act.innerHTML = '<div class="empty small">暂无进行中的任务。任务栏不限张数，按占用自然限制。</div>';
    } else {
      act.innerHTML = S.active.map(function (t) {
        var d = defOfTask(t);
        var step = G.taskProgressStep(t.uid);
        var remain = Math.max(0, (d.duration - t.progress) / step);
        var pct = Math.min(100, Math.round((t.progress / d.duration) * 100));
        var finishTurn = S.turn + Math.ceil(remain);
        var late = finishTurn > G.MAX_TURNS;
        var slow = step < 1 ? '同资源超额，进度 ×' + step + '；' : '';
        var foot = late
          ? slow + '本局内无法完成（预计 T' + finishTurn + '）'
          : (remain <= 1 ? slow + '下回合完成' : slow + '还需约 ' + Math.ceil(remain) + ' 回合');
        var occLabel = d.type === 'malignant' ? '接取占用 B' : '占用';
        return '<article class="task-card active ' + d.type + '">' +
          '<div class="tc-top"><b>' + d.name + '</b><span class="badge">进行中</span>' +
          '<span class="tc-dur">' + t.progress + ' / ' + d.duration + '</span></div>' +
          '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="tc-occ" title="当前余额 = 当前供给 − 城市需求（人口及建筑消耗）− 全部任务占用；自身占用已计入，仓库减免已生效">' + occLabel + '：' + taskOccText(d, t) + '</div>' +
          '<div class="tc-reward">完成奖励：' + rewardText(d) + '</div>' +
          (late ? '<div class="tc-deadline urgent">本局剩余回合不足：预计 T' + finishTurn + ' 完成，最终 T' + G.MAX_TURNS + '</div>' : '') +
          '<div class="tc-foot"><span class="tc-sat' + (late ? ' neg' : '') + '">' + foot + '</span>' +
          '<button class="btn small ghost" data-abandon="' + t.uid + '" type="button">放弃</button></div>' +
          '</article>';
      }).join('');
    }
  }

  function renderLog(S) {
    $('logList').innerHTML = S.log.slice(0, 40).map(function (l) {
      return '<div class="log-line ' + l.kind + '"><span class="log-turn">T' + l.turn + '</span><span>' + esc(l.text) + '</span></div>';
    }).join('');
  }

  function renderAction(S, used) {
    var over = S.over;
    var laborOver = used > G.laborCapacity();
    var finalTurn = S.turn >= G.MAX_TURNS;
    var rewardWait = !!(S.rewardQueue && S.rewardQueue.length);
    var canEnd = !over && !S.pendingDraw && !laborOver && !rewardWait;
    var btn = $('btnNext');
    btn.disabled = !canEnd;
    btn.textContent = over ? '已结束' : finalTurn ? (S.scenarioId ? '验收本关' : '结算本局') : '进入下回合 →';
    var hint = $('actionHint');
    if (rewardWait) hint.textContent = '先选择任务奖励：金钱+人口，或金钱+资源供给';
    else if (S.pendingDraw) hint.textContent = '先选择蓝图';
    else if (over) hint.textContent = (S.final.goal ? S.final.goal.name + ' · ' + (S.final.cleared ? '通关' : '未通关') : '自由经营结束') + ' · 声望 ' + S.rep;
    else if (laborOver) hint.textContent = '劳力不足：已占用 ' + used + ' / 可工作人口 ' + G.laborCapacity() + '，停用建筑后才能进入下回合';
    else if (finalTurn) hint.textContent = S.scenarioId ? '第 30 回合 · 完成操作后点击验收本关' : '第 30 回合 · 点击结算本局';
    else if (!S.hasBuilt) hint.textContent = '本回合还可建造或升级 1 次 · 剩 ' + (G.MAX_TURNS - S.turn) + ' 回合 · 种子 ' + S.seed;
    else hint.textContent = '本回合已建造/升级；可接/放弃任务 · 剩 ' + (G.MAX_TURNS - S.turn) + ' 回合 · 种子 ' + S.seed;
    hint.className = 'action-hint' + (laborOver ? ' danger' : '');
  }

  function introHtml() {
    return '<div class="intro">' +
      '<div class="intro-goal">目标：<b>达成本关全部建设要求才通关</b>；30 回合累计声望作为经营成绩保留。</div>' +
      '<div class="intro-goal">本局配置：' + configLabel(G.getState().runConfig) + '</div>' +
      '<ul>' +
      '<li><b>资源条</b>：总长度 = 需求 + 占用；金色段为任务占用，青色/蓝色段为已覆盖需求，红色斜纹段为供给缺口；满足分改为文字。</li>' +
      '<li><b>资源余量</b>：资源卡大字显示“额外供给 / 缺口”，口径为提供 − 占用 − 需求；负数表示满足需求后仍缺的量。</li>' +
      '<li><b>满意度</b> = 八项资源满足分 − 人口惩罚 − 赤字 ' + G.DEFICIT + ' − 回合压力。&lt;0 掉人口；0–19.99 稳定、不加声望；达到 20 / 35 / 50 / 65 / 75 时，每回合声望分别 +1 / +2 / +3 / +4 / +5。</li>' +
      '<li><b>人口与声望</b>：人口惩罚分段累加，1–5 人每人扣 1，6–15 人每人扣 0.5，16–25 人每人扣 1，26 人起每人扣 1.5。每回合声望上限按当前人口：P&lt;12 为 +3，P12–14 为 +4，P≥15 为 +5；任务声望奖励不受此上限限制。</li>' +
      '<li><b>超额减速</b>：任务所用资源的超额合计大于 0 且小于 2 时为 0.8 速，达到 2 且小于 3 时为 0.6 速，达到 3 时为 0.5 速。仓库产生的小数也按此分档。</li>' +
      '<li><b>高级减产</b>：低阶资源每缺 1 项，高级产出 -25%；缺 2 项 -50%，缺 3 项 -75%，四项全缺停产。部分减产仍按原高级投入计算，停产时才暂停额外投入。</li>' +
      '<li><b>回合压力</b>：T1–6 为 0，T7 起线性增加到 T30 的 −5；不管基础满意度正负都扣，后期越来越难拿声望。</li>' +
      '<li><b>每回合</b> 1 次建造或城镇升级；所有建筑最多占 1 人口，市场/仓库等部分蓝图 0 人口；人口既提供劳力也产生需求。</li>' +
      '<li><b>净产出</b>：1 劳力会占用 1 人，其八项需求合计 ' + fmtRate(G.runModifiers().occupancyCost) + '（含本局难度与 BUFF），作为该建筑的负向产出；额外消耗也从产出中扣除。农场满产净 ' + fmtNet(G.buildingNet(G.buildingDef('farm'))) + '，风电站满产净 ' + fmtNet(G.buildingNet(G.buildingDef('wind'))) + '，建造卡会直接标出。净产出用于横向比较，实际供需不会重复扣一次。</li>' +
      '<li><b>城镇升级</b>：当前人口达到 P6 / P9 / P12 / P15 时，可手动升级城镇；升级消耗本回合建造行动，不花金钱、不占建筑位、不降级。每次升级从 5 张蓝图中选 2 张。</li>' +
      '<li><b>建造预览</b>：点击建筑卡先预览；确认后才扣钱/占劳力。预览列出资源变化、满意度与具体高级减产原因。</li>' +
      '<li><b>任务</b> 开局 5 张，T' + G.REFRESH.join('/T') + ' 各刷新 3 张；接取前供给须大于其他任务占用，0 产出不能接。任务卡会提前显示「接取后预计完成回合」；占用行的“余 X / 缺 X”计入城市需求：接取后供给 − 人口及建筑消耗 − 接取后全部任务占用，仓库减免和高级减产同时生效。城市出现缺口仍可接取，需权衡满意度。完成后二选一：金钱+人口，或金钱+资源供给，选择前不能继续；选择弹窗可隐藏查看资源。</li>' +
      '<li><b>蓝图</b> 开局通常 3 选 1，蓝图筹备改为 5 选 2；之后城镇升级每次 5 选 2。局外累计声望可扩展随机池并解锁每局 1／2 次刷新；本局蓝图仍需抽取，建造仍花钱/劳力。选择弹窗可隐藏查看资源。</li>' +
      '</ul></div>';
  }

  function helpHtml() {
    return '<div class="rules">' +
      '<div class="end-kicker">30 回合 · 建设目标决定通关 · 声望记录经营成绩</div>' +
      '<h2>规则速览</h2>' +
      '<p><b>本局配置</b>：' + configLabel(G.getState().runConfig) + '。普通采用标准规则，困难启用当前关卡的专属规则，可另选任意数量的不同词缀；每项效果在开局固定。BUFF 可多选，总消耗不超过额度；初始人口增加也会增加需求，蓝图筹备将开局改为 5 选 2。配置与成长在开局时固定，之后解锁不追补当前局。成绩按关卡、困难规则版本、词缀、BUFF 组合及有效成长功能分别记录。</p>' +
      '<p><b>局外成长</b>：完成 T30 后，本局声望 100% 计入累计，再加通关奖励和首通奖励；困难通关奖励为普通的 2 倍；词缀奖励在此基础上按标示百分比相加后向下取整，不放大本局声望与首通奖励。未通关仍累计本局声望，中途重开不结算。首通按关卡和难度各领取一次，更换 BUFF 或词缀不重复领取。达到门槛自动解锁 BUFF、携带额度、新关卡、蓝图刷新和新蓝图，不扣除声望。累计 ' + chapterThresholds().join('／') + ' 各解锁三关；蓝图刷新按成长每局共 1／2 次，开局和升级抽取共用，不消耗建造行动；新蓝图先加入随机池，仍需抽取再建造。</p>' +
      '<p><b>BUFF 方案</b>：开局配置中可命名并保存 3 套 BUFF，跨关卡载入，保留当前难度与词缀；只在本浏览器保存。超过额度或含未解锁 BUFF 的方案不可载入。关卡建议提供一种当前可用搭配，可自由调整；点击“开始本局”后才替换城市。</p>' +
      '<p><b>建设目标</b>：开局选择关卡，要求固定且全程可见。多项资源分别验收，富余资源不能抵消另一项的缺口。</p><ul>' +
      G.SCENARIOS.map(function (s, index) { return '<li><b>第 ' + (index + 1) + ' 关 · ' + s.name + '</b>：' +
        s.requirements.map(function (r) { return r.label + ' ≥' + r.target; }).join('、') + '。</li>'; }).join('') + '</ul>' +
      '<p><b>通关验收</b>：T30 先处理全部奖励，并完成建设、启停建筑与任务操作，再点击“验收本关”。按此时实际供需判断，全部条件符合才通关。提前达标仍需保持到终局；未通关也记录声望，只有通关才写入本机关卡通关记录。旧存档作为自由经营保留。</p>' +
      '<p><b>满意度</b>：八项资源各 0–15 分，减去人口惩罚、赤字 ' + G.DEFICIT + ' 和回合压力。&lt;0 掉人口；0≤满意度&lt;20 不加声望；20≤满意度&lt;35 每回合 +1，35≤满意度&lt;50 +2，50≤满意度&lt;65 +3，65≤满意度&lt;75 +4，≥75 +5。</p>' +
      '<p><b>人口惩罚</b>：分段累加，1–5 人每人扣 1，6–15 人每人扣 0.5，16–25 人每人扣 1，26 人起每人扣 1.5。例如 P5 扣 5、P11 扣 8、P15 扣 10、P20 扣 15、P25 扣 20。</p>' +
      '<p><b>声望人口上限</b>：P&lt;12 每回合最多 +3，P12–14 最多 +4，P≥15 最多 +5。按结算时当前人口计算，人口下降会降低上限，城镇等级不能保留上限。任务的固定声望奖励不受影响；选择人口奖励会改变后续上限，不补发本回合已结算的声望。</p>' +
      '<p><b>超额减速</b>：任务所用资源的超额合计为 0 时正常推进；大于 0 且小于 2 时为 0.8 速，达到 2 且小于 3 时为 0.6 速，达到 3 时为 0.5 速。小数按所在区间处理，超额越多不会反而加速。</p>' +
      '<p><b>回合压力</b>：T1–6 为 0，T7 起线性增加，T30 为 −5；无论基础满意度正负都扣。后期想拿声望，需要比前期更高的基础供给。</p>' +
      '<p><b>资源条</b>：彩条不再表示满意度，总长度 = 需求 + 占用；金色为任务占用，青色/蓝色为已覆盖需求，红色斜纹为供给缺口。文字显示满足分，悬停可看供给、占用、需求与缺口。</p>' +
      '<p><b>资源余量</b>：资源卡大字“额外供给 / 缺口”= 提供 − 占用 − 需求；正数为满足需求后的额外供给，负数为仍缺的量（按缺口绝对值显示）。</p>' +
      '<p><b>资源</b>：卡面显示「当前 → 下回合预测」。下回合预测包含已建建筑、任务占用和下一回合会完成的任务；建造后立即变化。</p>' +
      '<p><b>高级减产</b>：高级建筑（衣服 / 家具 / 药品 / 教育）需要基础资源。食物、原料、电力、水每缺 1 项，高级产出 -25%；缺 2 项 -50%，缺 3 项 -75%，四项全缺停产。部分减产仍按原高级投入计算，停产时才暂停额外基础消耗；资源卡会标「低阶不足·产出 N%」。</p>' +
      '<p><b>劳力</b>：所有建筑最多占 1 人口；市场、仓库等部分蓝图 0 人口。启用建筑会占用人口，可工作人口 = 总人口 − 闲人（最低为 0）；闲人仍消耗资源并计入通关、城镇升级和声望人口档位。已占用超过可工作人口时不能进入下回合。城市面板按类型用 − / + 调整启用数量，停用会同时停掉供给和额外消耗。</p>' +
      '<p><b>净产出</b>：把占用人口视为负向产出。本局 1 人八项需求合计 ' + fmtRate(G.runModifiers().occupancyCost) + '；满产净产出 = 产出总和 − 额外消耗总和 − 劳力 × ' + fmtRate(G.runModifiers().occupancyCost) + '。农场 ' + fmtNet(G.buildingNet(G.buildingDef('farm'))) + '，风电站 ' + fmtNet(G.buildingNet(G.buildingDef('wind'))) + '；建筑资源产出先应用词缀，再受低阶短缺减产；建筑投入不会随产出词缀减少。</p>' +
      '<p><b>建造预览</b>：点击建筑卡先打开预览，确认后才真正建造。预览显示金钱/劳力/满意度变化、资源供需变化，以及高级建筑当前和建造后的具体减产原因（哪项低阶资源、可用/需求/缺口）。</p>' +
      '<p><b>城镇升级</b>：当前人口达到 P6 / P9 / P12 / P15 时可手动升级；每级消耗本回合建造行动，不花金钱、不占建筑位、不降级。每次升级弹出 5 选 2 蓝图。声望不再给蓝图。</p>' +
      '<p><b>任务</b>：开局 5 张，T' + G.REFRESH.join('/T') + ' 各刷新 3 张。任务栏不限张数；限时任务过期消失；恶性任务不接也占出生负担 A。接取前看「接取后预计满意度」、变化量和「接取后预计完成回合」；占用行的“余 X / 缺 X”= 接取后供给 − 城市需求（人口及建筑消耗）− 接取后全部任务占用。仓库减免、高级减产和恶性 A→B 替换均计入；进行中显示当前余额，自身占用只算一次。完成回合已经计入同资源超额减速，预计超过 T30 会提前标红。接取条件仍为当前供给 &gt; 其他任务占用，0 产出不能接；城市余额为负时仍可接取。完成后在「金钱+人口」和「金钱+资源供给」中二选一，选择前不能继续。</p>' +
      '<p><b>选择弹窗</b>：任务奖励和蓝图选择弹窗都可以点“隐藏窗口，查看资源与人口”，右下角“返回选择”恢复；隐藏期间不会丢失奖励或蓝图选择状态。</p>' +
      '<p><b>终局</b>：第 30 回合关卡按钮变为「验收本关」；自由经营为「结算本局」。接取前若预计完成回合超过 T' + G.MAX_TURNS + '，任务卡会标红提醒。</p>' +
      '<button class="btn primary" data-close-help="1" type="button">知道了</button>' +
      '</div>';
  }

  function advReasonLine(r) {
    return '<li><b>' + esc(r.name) + '</b>：可用 <b>' + r.available + '</b> / 需求 <b>' + r.need +
      '</b>（缺 ' + r.gap + '；人口 ' + r.popNeed + ' + 额外 ' + r.extraNeed + '）</li>';
  }

  function advReasonBlock(before, after) {
    var br = before && before.advancedReasons ? before.advancedReasons : [];
    var ar = after && after.advancedReasons ? after.advancedReasons : [];
    var out = '<div class="bp-reasons' + (!br.length && !ar.length ? ' none' : '') + '">';
    out += '<div class="bp-subhead">高级减产原因</div>';
    if (!br.length && !ar.length) {
      out += '<p class="bp-none">当前没有高级减产，八项资源均按其产出计算。</p></div>';
      return out;
    }
    if (ar.length) {
      out += '<p class="bp-warn">建造后高级产出 ' + after.advancedOutputPct + '%：</p><ul>' +
        ar.map(advReasonLine).join('') + '</ul>';
    } else {
      out += '<p class="bp-good">建造后解除高级减产，高级产出恢复 100%。</p>';
    }
    if (br.length) {
      out += '<p class="bp-before-label">建造前高级产出 ' + before.advancedOutputPct + '%：</p><ul class="bp-before">' +
        br.map(advReasonLine).join('') + '</ul>';
    }
    out += '</div>';
    return out;
  }

  function rewardHtml(S) {
    var offer = S.rewardQueue && S.rewardQueue[0];
    if (!offer) return '';
    var sup = Object.keys(offer.sup || {}).map(function (k) {
      return resName(k) + ' +' + offer.sup[k];
    }).join('、') || '资源';
    var more = S.rewardQueue.length > 1
      ? '<p class="reward-more">还有 ' + (S.rewardQueue.length - 1) + ' 个完成任务的奖励待选择。</p>' : '';
    return '<div class="modal-head"><h2>任务完成 · ' + offer.icon + ' ' + esc(offer.name) + '</h2>' +
      '<p>奖励二选一：人口或永久资源供给。两者都包含金钱与声望，选择后立即生效。</p></div>' +
      '<div class="reward-grid">' +
      '<button class="reward-card" data-reward-choice="pop" type="button">' +
      '<span class="reward-kicker">方案 A</span><b>人口 +' + offer.pop + '</b>' +
      '<span class="reward-sub">劳力增加，同时八项需求增加</span>' +
      '<span class="reward-common">金 +' + offer.money + ' · 声望 +' + offer.rep + '</span>' +
      '<span class="reward-btn">选择人口</span></button>' +
      '<button class="reward-card" data-reward-choice="sup" type="button">' +
      '<span class="reward-kicker">方案 B</span><b>' + sup + '</b>' +
      '<span class="reward-sub">永久供给增加，不占建筑与劳力</span>' +
      '<span class="reward-common">金 +' + offer.money + ' · 声望 +' + offer.rep + '</span>' +
      '<span class="reward-btn">选择资源</span></button>' +
      '</div>' + more +
      '<div class="modal-actions modal-view-actions"><button class="btn ghost" data-hide-modal="1" type="button">隐藏窗口，查看资源与人口</button></div>';
  }

  function buildPreviewHtml(id) {
    var p = G.buildPreview(id);
    if (!p || !p.ok) {
      return '<div class="modal-head"><h2>无法建造</h2><p>' + esc(p && p.error ? p.error : '预览失败') + '</p></div>' +
        '<div class="modal-actions"><button class="btn ghost" data-close-build="1" type="button">关闭</button></div>';
    }
    var d = p.def;
    var b = p.before;
    var a = p.after;
    var rows = G.RES.map(function (r) {
      var s0 = b.supply[r.key] || 0;
      var s1 = a.supply[r.key] || 0;
      var d0 = b.demand[r.key] || 0;
      var d1 = a.demand[r.key] || 0;
      if (Math.abs(s1 - s0) < 0.0001 && Math.abs(d1 - d0) < 0.0001) return '';
      return '<div class="bp-row"><span class="bp-name">' + r.name + '</span>' +
        '<span>供给 ' + s0 + ' → <b>' + s1 + '</b></span>' +
        '<span>需求 ' + d0 + ' → <b>' + d1 + '</b></span></div>';
    }).join('');
    var nextTxt = p.next
      ? '<div class="bp-next">下回合预测：满意度 <b>' + fmt1(p.next.sat) + '</b> · 声望 +' + p.next.repGain +
        ' · 高级产出 ' + p.next.advancedOutputPct + '%</div>'
      : '<div class="bp-next muted">下回合预测不可用（可能受劳力或蓝图限制）。</div>';
    var net = G.buildingNet(d);
    var netTxt = net === null ? '' :
      '<div class="bp-net">满产净产出 <b>' + fmtNet(net) + '</b> / 回合' +
      '<span>已扣除额外消耗与 1 人占用 ' + fmtRate(G.runModifiers().occupancyCost) + ' 点（' + G.RES.map(function (r) { return r.name + ' ' + fmtRate(G.runModifiers().populationDemand[r.key]); }).join('、') + '）；已计入本局难度与 BUFF，实际供需不会重复扣一次。</span></div>';
    var afterGoal = G.goalStatus(a);
    return '<div class="modal-head"><h2>建造预览 · ' + d.icon + ' ' + d.name + '</h2>' +
      '<p>确认后立即建造，本回合不能再建。花费 ' + G.buildingCost(d) + ' 金 · 劳力 ' + d.labor + ' · 建成后不可撤销。</p></div>' +
      '<div class="build-preview">' +
      '<div class="bp-stats">' +
      '<span>金钱 <b>' + p.moneyBefore + ' → ' + p.moneyAfter + '</b></span>' +
      '<span>劳力 <b>' + p.laborBefore + ' → ' + p.laborAfter + ' / ' + G.laborCapacity() + '</b></span>' +
      '<span>满意度 <b>' + fmt1(b.sat) + ' → ' + fmt1(a.sat) + '</b></span>' +
      '</div>' +
      netTxt +
      '<div class="bp-compare"><div class="bp-subhead">资源变化</div>' +
      (rows || '<p class="bp-none">建造后供需无明显变化。</p>') + '</div>' +
      nextTxt +
      (afterGoal ? '<div class="bp-subhead">建造后建设目标 · ' + esc(afterGoal.name) + '</div>' +
        '<div class="goal-conditions">' + afterGoal.conditions.map(goalConditionHtml).join('') + '</div>' : '') +
      advReasonBlock(b, a) +
      '<div class="modal-actions">' +
      '<button class="btn ghost" data-close-build="1" type="button">取消</button>' +
      '<button class="btn primary" data-confirm-build="' + d.id + '" type="button">确认建造</button>' +
      '</div></div>';
  }

  function renderModal(S, best) {
    var modal = $('modal');
    var card = $('modalCard');
    var hasChoice = !!(S.rewardQueue && S.rewardQueue.length) || !!S.pendingDraw;
    if (showHelp || buildPreviewId || !hasChoice) modalHidden = false;
    if (modalHidden && hasChoice) {
      card.innerHTML = '';
      modal.classList.add('hidden');
      $('btnShowModal').classList.remove('hidden');
      return;
    }
    $('btnShowModal').classList.add('hidden');
    if (showHelp) {
      card.innerHTML = helpHtml();
      modal.classList.remove('hidden');
      return;
    }
    if (buildPreviewId) {
      card.innerHTML = buildPreviewHtml(buildPreviewId);
      modal.classList.remove('hidden');
      return;
    }
    if (S.rewardQueue && S.rewardQueue.length) {
      card.innerHTML = rewardHtml(S);
      modal.classList.remove('hidden');
      return;
    }
    if (S.pendingDraw) {
      var d = S.pendingDraw;
      var pickCount = d.count || 1;
      var key = (d.source || 'opening') + ':' + (d.level || '') + ':' + d.options.join(',');
      if (drawKey !== key) {
        drawKey = key;
        drawPick = [];
      }
      if (drawPick.length > pickCount) drawPick = drawPick.slice(0, pickCount);
      var title = d.source === 'town'
        ? '城镇升级 Lv.' + d.level + ' · 5 选 2'
        : (G.goalStatus() ? G.goalStatus().name + ' · 开局蓝图' : '开局蓝图 · 先看目标');
      var intro = d.source === 'town'
        ? '本次城镇升级已消耗本回合建造行动。'
        : '蓝图只是建筑类型，建造时仍要花金钱和劳力。';
      intro = '从 ' + d.options.length + ' 张中选 ' + pickCount + ' 张解锁。' + intro + '选完才能继续。';
      var html = '<div class="modal-head"><h2>' + title + '</h2>' +
        '<p>' + intro + '</p></div>';
      if (d.opening) {
        var openingGoal = G.goalStatus();
        if (openingGoal) html += '<div class="goal-conditions opening-goals">' + openingGoal.conditions.map(goalConditionHtml).join('') + '</div>';
        html += introHtml();
      }
      html += '<div class="pick-grid' + (d.options.length > 3 ? ' five' : '') + '">';
      html += d.options.map(function (id) {
        var b = G.buildingDef(id);
        var extra = extraText(b);
        var note = bpNote(id);
        var selected = drawPick.indexOf(id) >= 0;
        var btnLabel = pickCount > 1 ? (selected ? '已选' : '选择') : '选择';
        var net = G.buildingNet(b);
        return '<button class="pick-card' + (selected ? ' selected' : '') + '" data-pick="' + id + '" type="button">' +
          '<span class="pick-icon">' + b.icon + '</span>' +
          '<h3>' + b.name + '</h3>' +
          '<p>' + outText(b) + (extra ? '<br><span class="muted">耗 ' + extra + '</span>' : '') + '</p>' +
          (net === null ? '' : '<span class="pick-net">满产净 ' + fmtNet(net) + '</span>') +
          (note ? '<p class="pick-note">' + note + '</p>' : '') +
          '<span class="pick-req">劳力 ' + b.labor + ' · 上限 ' + b.max + '</span>' +
          '<span class="pick-cost">' + G.buildingCost(b) + ' 金</span>' +
          '<span class="pick-btn">' + btnLabel + '</span>' +
          '</button>';
      }).join('');
      html += '</div>';
      if (pickCount > 1) {
        html += '<div class="pick-foot"><span class="pick-count">已选 ' + drawPick.length + ' / ' + pickCount + '</span>' +
          '<button class="btn primary" data-confirm-draw="1" type="button"' +
          (drawPick.length === pickCount ? '' : ' disabled') + '>确认选择</button></div>';
      }
      var reroll = G.blueprintRerollStatus();
      html += '<div class="draw-reroll"><button class="btn ghost" data-reroll-blueprints="1" type="button"' + (reroll.ok ? '' : ' disabled') + '>刷新蓝图 · 剩余 ' + reroll.remaining + ' 次</button>' +
        '<small>' + (reroll.ok ? '刷新整批并清空勾选，优先出现新牌；每局次数共用。' : reroll.reason) + '</small></div>';
      html += '<div class="modal-actions modal-view-actions"><button class="btn ghost" data-hide-modal="1" type="button">隐藏窗口，查看资源与人口</button></div>';
      card.innerHTML = html;
      modal.classList.remove('hidden');
      return;
    }
    if (S.over && S.final) {
      var f = S.final;
      var isBest = f.rep >= best;
      card.innerHTML = '<div class="end">' +
        '<div class="end-kicker">' + (f.goal ? esc(f.goal.name) + ' · 建设验收' : '自由经营 · 30 回合结束') + '</div>' +
        '<div class="end-config">' + configLabel(f.runConfig) + '</div>' +
        (f.goal ? '<h2 class="end-result' + (f.cleared ? ' cleared' : '') + '">' + (f.cleared ? '建设达标 · 通关' : '建设目标未完成 · 未通关') + '</h2>' : '') +
        '<div class="end-rep">' + f.rep + '<small>声望</small></div>' +
        '<div class="end-sub">经营成绩' + (isBest ? ' · 全部配置最高声望' : '') + '</div>' +
        (f.goal ? '<div class="goal-conditions end-goals">' + f.goal.conditions.map(goalConditionHtml).join('') + '</div>' : '') + failureAdviceHtml(f) +
        '<div class="end-grid">' +
        '<div class="end-stat"><b>Lv.' + (f.level || 0) + '</b><span>城镇</span></div>' +
        '<div class="end-stat"><b>' + f.pop + '</b><span>人口</span></div>' +
        '<div class="end-stat"><b>' + f.buildings + '</b><span>建筑</span></div>' +
        '<div class="end-stat"><b>' + f.tasksDone + '</b><span>完成任务</span></div>' +
        '<div class="end-stat"><b>' + fmt(f.money) + '</b><span>剩余金钱</span></div>' +
        '</div>' +
        (S.scenarioId ? '<div class="end-best">此配置最佳通关声望：' +
          (loadCampaign()[P.key(S.scenarioId, S.runConfig, S.growthRep, S.legacyUnlockRep, S.rerollsGranted)] ? fmt(loadCampaign()[P.key(S.scenarioId, S.runConfig, S.growthRep, S.legacyUnlockRep, S.rerollsGranted)].bestRep) : '尚未通关') + '</div>' : '') +
        '<div class="end-best">本机最高声望（全部配置）：' + best + ' · 种子 ' + S.seed + '</div>' +
        growthSettlementHtml(S) + growthSummaryHtml() +
        '<button class="btn primary big" data-restart="1" type="button">返回选关</button>' +
        '</div>';
      modal.classList.remove('hidden');
      return;
    }
    modal.classList.add('hidden');
    card.innerHTML = '';
  }

  function nextTurn() {
    var r = G.endTurn();
    if (!r.ok) toast(r.error);
    render();
  }

  function build(id) {
    var r = G.build(id);
    if (!r.ok) toast(r.error);
    render();
  }

  function openBuildPreview(id) {
    var st = G.buildStatus(id);
    if (!st.ok) {
      toast(st.reason);
      return;
    }
    buildPreviewId = id;
    render();
  }

  function closeBuildPreview() {
    buildPreviewId = null;
    render();
  }

  function confirmBuild(id) {
    buildPreviewId = null;
    build(id);
  }

  function setCount(defId, delta) {
    var S = G.getState();
    var list = S.buildings.filter(function (b) { return b.defId === defId; });
    var active = list.filter(function (b) { return b.active; }).length;
    var r = G.setBuildingCount(defId, active + delta);
    if (!r.ok) toast(r.error);
    render();
  }

  function accept(uid) {
    var r = G.acceptTask(uid);
    if (!r.ok) toast(r.error);
    render();
  }

  function abandon(uid) {
    var r = G.abandonTask(uid);
    if (!r.ok) toast(r.error);
    render();
  }

  function chooseTaskReward(choice) {
    var r = G.chooseReward(choice);
    if (!r.ok) toast(r.error);
    else {
      modalHidden = false;
      var o = r.offer;
      var supTxt = Object.keys(o.sup || {}).map(function (k) { return resName(k) + ' +' + o.sup[k]; }).join('、');
      toast(choice === 'pop'
        ? o.name + '：人口 +' + o.pop + ' · 金 +' + o.money
        : o.name + '：' + supTxt + ' · 金 +' + o.money);
    }
    render();
  }

  function pick(id) {
    var S = G.getState();
    if (!S || !S.pendingDraw) return;
    modalHidden = false;
    if ((S.pendingDraw.count || 1) === 1) {
      var r = G.chooseBlueprint(id);
      if (!r.ok) toast(r.error);
      drawPick = [];
      drawKey = null;
      render();
      return;
    }
    var i = drawPick.indexOf(id);
    if (i >= 0) {
      drawPick.splice(i, 1);
    } else if (drawPick.length < S.pendingDraw.count) {
      drawPick.push(id);
    }
    render();
  }

  function confirmDraw() {
    var S = G.getState();
    if (!S || !S.pendingDraw) return;
    modalHidden = false;
    var r = G.chooseBlueprints(drawPick);
    if (!r.ok) {
      toast(r.error);
      return;
    }
    drawPick = [];
    drawKey = null;
    render();
  }

  function upgradeTown() {
    var r = G.upgradeTown();
    if (!r.ok) toast(r.error);
    drawPick = [];
    drawKey = null;
    render();
  }

  function newGame(seed, scenarioId, config) {
    var growth = currentGrowth(), status = G.runConfigStatus(config, growth.totalRep, growth.legacyUnlockRep);
    if (!status.ok) { toast(status.error); return; }
    if (growth.scenarioIds.indexOf(scenarioId) < 0) { toast('此关卡尚未解锁'); return; }
    selectingScenario = false;
    configuringScenario = null;
    growthOpen = false;
    pendingSeed = undefined;
    showHelp = false;
    buildPreviewId = null;
    modalHidden = false;
    drawPick = [];
    drawKey = null;
    taskFilter = 'all';
    try {
      var btns = document.querySelectorAll('#taskFilter .filter-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('on', btns[i].getAttribute('data-filter') === 'all');
      }
    } catch (e) {}
    G.newGame(seed, scenarioId, config, growth.totalRep, growth.legacyUnlockRep);
    render();
    $('modalCard').scrollTop = 0;
  }

  function openScenarioSelection(seed) {
    growthOpen = false;
    selectingScenario = true;
    configuringScenario = null;
    pendingSeed = seed;
    modalHidden = false;
    render();
    $('modalCard').scrollTop = 0;
  }

  function openRunSetup(id, config) {
    if (currentGrowth().scenarioIds.indexOf(id) < 0) { openScenarioSelection(pendingSeed); toast('累计声望达标后解锁此关'); return; }
    growthOpen = false;
    configuringScenario = id;
    selectingScenario = false;
    pendingRunConfig = G.normalizeRunConfig(config);
    render();
    $('modalCard').scrollTop = 0;
  }

  function restart() {
    openScenarioSelection();
  }

  function init() {
    // Migrate historical clears before rendering can record this run's first victory.
    loadGrowth();
    loadSavedLoadouts();
    $('btnGrowth').addEventListener('click', function () { growthOpen = true; render(); $('modalCard').scrollTop = 0; });
    $('btnNext').addEventListener('click', nextTurn);
    $('btnRestart').addEventListener('click', function () { restart(false); });
    $('btnHelp').addEventListener('click', function () { buildPreviewId = null; showHelp = true; modalHidden = false; render(); });
    $('btnShowModal').addEventListener('click', function () { modalHidden = false; render(); });

    $('buildList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-build]');
      if (btn) openBuildPreview(btn.getAttribute('data-build'));
    });
    $('townUpgrade').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-town-upgrade]');
      if (btn) upgradeTown();
    });
    $('cityList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-step]');
      if (btn) setCount(btn.getAttribute('data-def'), Number(btn.getAttribute('data-step')));
    });
    $('boardList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-accept]');
      if (btn) accept(btn.getAttribute('data-accept'));
    });
    $('activeList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-abandon]');
      if (btn) abandon(btn.getAttribute('data-abandon'));
    });
    $('taskFilter').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-filter]');
      if (!btn) return;
      taskFilter = btn.getAttribute('data-filter');
      var btns = e.currentTarget.querySelectorAll('.filter-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('on', btns[i].getAttribute('data-filter') === taskFilter);
      }
      render();
    });
    $('modalCard').addEventListener('input', function (e) {
      var input = e.target.closest('[data-loadout-name]');
      if (input) loadoutNames[Number(input.getAttribute('data-loadout-name'))] = input.value;
    });
    $('modalCard').addEventListener('click', function (e) {
      var savePreset = e.target.closest('[data-save-loadout]');
      if (savePreset) { saveLoadout(Number(savePreset.getAttribute('data-save-loadout'))); return; }
      var applyPreset = e.target.closest('[data-apply-loadout]');
      if (applyPreset) { applyLoadout(Number(applyPreset.getAttribute('data-apply-loadout'))); return; }
      if (e.target.closest('[data-apply-advice]')) {
        var g = currentGrowth(), advice = L.recommendation(configuringScenario, pendingRunConfig.difficultyId, g.totalRep, g.legacyUnlockRep);
        if (advice) pendingRunConfig = G.normalizeRunConfig(Object.assign({}, pendingRunConfig, { buffIds: L.apply(advice, pendingRunConfig.difficultyId, g.totalRep, g.legacyUnlockRep).buffIds }));
        render(); return;
      }
      if (e.target.closest('[data-open-growth]')) { growthOpen = true; render(); $('modalCard').scrollTop = 0; return; }
      if (e.target.closest('[data-close-growth]')) { growthOpen = false; render(); $('modalCard').scrollTop = 0; return; }
      if (e.target.closest('[data-reroll-blueprints]')) {
        var refresh = G.rerollBlueprints();
        if (!refresh.ok) toast(refresh.error);
        else { drawKey = null; drawPick = []; }
        render(); return;
      }
      var scenario = e.target.closest('[data-scenario]');
      if (scenario) { openRunSetup(scenario.getAttribute('data-scenario')); return; }
      var affixAction = e.target.closest('[data-affix-action]');
      if (affixAction) {
        var action = affixAction.getAttribute('data-affix-action');
        pendingRunConfig = G.normalizeRunConfig(Object.assign({}, pendingRunConfig, { affixIds: action === 'all' ? G.AFFIXES.map(function (a) { return a.id; }) : [] }));
        render();
        $('modalCard').querySelector('[data-affix-action="' + action + '"]').focus();
        return;
      }
      var affixOption = e.target.closest('[data-affix]');
      if (affixOption) {
        var affixId = affixOption.getAttribute('data-affix'), affixes = pendingRunConfig.affixIds || [];
        try {
          pendingRunConfig = G.normalizeRunConfig(Object.assign({}, pendingRunConfig, { affixIds: affixes.indexOf(affixId) >= 0 ? affixes.filter(function (id) { return id !== affixId; }) : affixes.concat([affixId]) }));
        } catch (err) { toast(err.message); return; }
        render();
        $('modalCard').querySelector('[data-affix="' + affixId + '"]').focus();
        return;
      }
      var configOption = e.target.closest('[data-config-field]');
      if (configOption) {
        var field = configOption.getAttribute('data-config-field');
        var value = configOption.getAttribute('data-config-value');
        if (field === 'buffIds') {
          var ids = pendingRunConfig.buffIds;
          pendingRunConfig.buffIds = value === 'none' ? [] : ids.indexOf(value) >= 0 ? ids.filter(function (id) { return id !== value; }) : ids.concat([value]);
          var selectedGrowth = currentGrowth();
          var configStatus = G.runConfigStatus(pendingRunConfig, selectedGrowth.totalRep, selectedGrowth.legacyUnlockRep);
          if (!configStatus.ok) { pendingRunConfig.buffIds = ids; toast(configStatus.error); return; }
          pendingRunConfig = G.normalizeRunConfig(pendingRunConfig);
        } else if (pendingRunConfig.difficultyId !== value) {
          pendingRunConfig = G.normalizeRunConfig({ difficultyId: value, buffIds: pendingRunConfig.buffIds });
        }
        render();
        $('modalCard').querySelector('[data-config-field="' + field + '"][data-config-value="' + value + '"]').focus();
        return;
      }
      if (e.target.closest('[data-start-configured]')) { newGame(pendingSeed, configuringScenario, pendingRunConfig); return; }
      if (e.target.closest('[data-back-scenarios]')) { openScenarioSelection(pendingSeed); return; }
      var cancelScenario = e.target.closest('[data-cancel-scenario]');
      if (cancelScenario) { selectingScenario = false; configuringScenario = null; pendingSeed = undefined; render(); return; }
      var hideView = e.target.closest('[data-hide-modal]');
      if (hideView) { modalHidden = true; render(); return; }
      var helpClose = e.target.closest('[data-close-help]');
      if (helpClose) { showHelp = false; render(); return; }
      var buildClose = e.target.closest('[data-close-build]');
      if (buildClose) { closeBuildPreview(); return; }
      var buildConfirm = e.target.closest('[data-confirm-build]');
      if (buildConfirm) { confirmBuild(buildConfirm.getAttribute('data-confirm-build')); return; }
      var pickBtn = e.target.closest('[data-pick]');
      if (pickBtn) { pick(pickBtn.getAttribute('data-pick')); return; }
      var rewardBtn = e.target.closest('[data-reward-choice]');
      if (rewardBtn) { chooseTaskReward(rewardBtn.getAttribute('data-reward-choice')); return; }
      var drawConfirm = e.target.closest('[data-confirm-draw]');
      if (drawConfirm) { confirmDraw(); return; }
      var restartBtn = e.target.closest('[data-restart]');
      if (restartBtn) { restart(true); }
    });

    var seed = null;
    var scenarioId = null;
    var requestedConfig = G.normalizeRunConfig();
    try {
      var params = new URLSearchParams(window.location.search);
      var q = params.get('seed');
      if (q !== null && q !== '' && isFinite(Number(q))) seed = Number(q);
      var requested = params.get('level');
      if (G.SCENARIOS.some(function (s) { return s.id === requested; })) scenarioId = requested;
      var requestedBuffs = params.get('buff') || 'none';
      requestedConfig = G.normalizeRunConfig({ difficultyId: params.get('difficulty') || 'normal', buffIds: requestedBuffs === 'none' ? [] : requestedBuffs.split(','), affixIds: params.get('affixes') ? params.get('affixes').split(',') : [] });
    } catch (e) {}

    if (seed === null && scenarioId === null) {
      var saved = loadSave();
      if (saved) {
        var imported = G.importState(saved);
        if (imported.ok) {
          render();
          var S = G.getState();
          toast(S.over ? '已恢复上次结算 · 声望 ' + S.rep : '已恢复上次进度 · T' + S.turn);
          return;
        }
        clearSave();
      }
    }
    if (scenarioId) { pendingSeed = seed; openRunSetup(scenarioId, requestedConfig); }
    else openScenarioSelection(seed);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
