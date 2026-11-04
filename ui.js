/* 周目小镇 · v3.19.0 城市大厅、引导、声音与存档管理 */
(function () {
  'use strict';

  var G = window.DSHGame;
  var mainGame = G;
  var O = window.DSHOnboarding;
  var P = window.DSHProgress;
  var L = window.DSHLoadouts;
  var audio = window.DSHAudio.create(window);
  var saves = window.DSHSaves, saveUI;
  var $ = function (id) { return document.getElementById(id); };
  var BEST_KEY = 'dsh_city_best_rep_v33';
  var SAVE_KEY = 'dsh_city_save_v34';
  var CAMPAIGN_KEY = 'dsh_city_campaign_v2';
  var LEGACY_CAMPAIGN_KEY = 'dsh_city_campaign_v1';
  var GROWTH_KEY = 'dsh_city_growth_v1';
  var LOADOUT_KEY = 'dsh_city_loadouts_v1';
  var UI_KEY = 'dsh_city_ui_v1';
  var homeVisible = true;
  var homeTab = 'scenarios';
  var blueprintFilter = 'all';
  var cityTab = 'resources';
  var resourceDetails = false;
  var tutorial = null;
  var tutorialReturnHome = true;
  var tutorialLastStep = null;
  var uiPrefs = {};
  var storyIndex = null;
  var replacingCity = false;
  var focusReturn = null;
  var toastTimer = null;
  var taskFilter = 'all';
  var showHelp = false;
  var buildPreviewId = null;
  var drawPick = [];
  var drawKey = null;
  var modalHidden = false;
  var configuringScenario = null;
  var growthOpen = false;
  var pendingRunConfig = G.normalizeRunConfig();
  var pendingSeed;
  var loadouts = L.load();
  var loadoutNames = [];

  function fmt(n) { return Math.round(n).toLocaleString('zh-CN'); }
  function syncSound() {
    var state = audio.getState(), prefs = state.settings;
    ['music','effects'].forEach(function (key) {
      var id = key === 'music' ? 'soundMusic' : 'soundEffects', value = Math.round(prefs[key] * 100);
      $(id).value = value;
      $(id).setAttribute('aria-valuetext', value + '%');
      $(id + 'Value').value = value + '%';
    });
    $('soundMuted').checked = prefs.muted;
    $('soundPreview').disabled = !state.supported || prefs.muted || !prefs.effects;
    var status = !state.supported ? '当前环境暂不支持声音' : prefs.muted ? '全部声音已静音' : state.hidden ? '已在后台暂停' :
      state.musicPlaying ? '正在播放 · 晨光街角' : !prefs.music ? '背景音乐已关闭' : '首次操作后播放音乐';
    $('soundStatus').textContent = status;
    $('soundStatus').dataset.audioState = state.musicPlaying ? 'playing' : 'paused';
    Array.from(document.querySelectorAll('[data-open-sound]')).forEach(function (b) {
      b.textContent = (prefs.muted ? '🔇' : '🔊') + ' 声音';
      b.setAttribute('aria-label', '声音设置' + (prefs.muted ? '（已静音）' : ''));
    });
  }
  function openSound() {
    syncSound();
    if (!$('soundSettings').open) $('soundSettings').showModal();
  }
  function initSound() {
    $('soundClose').addEventListener('click', function () { $('soundSettings').close(); });
    $('soundDone').addEventListener('click', function () { $('soundSettings').close(); });
    $('soundMuted').addEventListener('change', function () {
      audio.setSettings({ muted: this.checked }); audio.unlock();
    });
    [['soundMusic','music'],['soundEffects','effects']].forEach(function (row) {
      $(row[0]).addEventListener('input', function () {
        var change = {}; change[row[1]] = Number(this.value) / 100;
        audio.setSettings(change); audio.unlock();
      });
    });
    $('soundEffects').addEventListener('change', function () { audio.unlock().then(function () { audio.play('confirm'); }); });
    $('soundPreview').addEventListener('click', function () { audio.unlock().then(function () { audio.play('reward'); }); });
    audio.init(syncSound);
  }
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
    try { saves.write(localStorage, LOADOUT_KEY, JSON.stringify(updated)); }
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
    try { saves.write(localStorage, BEST_KEY, String(rep)); } catch (e) {}
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
      try { saves.write(localStorage, GROWTH_KEY, JSON.stringify(ledger)); } catch (e) {}
    }
    return ledger;
  }
  function currentGrowth() {
    var ledger = loadGrowth(), g = G.growthStatus(P.totalRep(ledger), ledger.legacyUnlockRep);
    g.permissionRep = Math.max(g.totalRep, g.legacyUnlockRep);
    return g;
  }
  function recordGrowth(S) {
    if (tutorial) return;
    var before = loadGrowth(), after = P.creditGrowth(before, S);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      try { saves.write(localStorage, GROWTH_KEY, JSON.stringify(after)); }
      catch (e) { toast('局外成长未能保存，请检查浏览器存储'); }
    }
  }
  function recordClear(S) {
    if (tutorial) return;
    var records = loadCampaign();
    var updated = P.record(records, S);
    if (JSON.stringify(updated) === JSON.stringify(records)) return;
    try { saves.write(localStorage, CAMPAIGN_KEY, JSON.stringify(updated)); } catch (e) {}
  }
  function persist() {
    if (tutorial) return;
    var note = $('saveNote');
    try {
      var S = G.getState();
      if (!S) return;
      saves.write(localStorage, SAVE_KEY, JSON.stringify(G.exportState()));
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
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }
  function defOfTask(t) { return G.taskDef(t.defId); }
  function defOfBuilding(b) { return G.buildingDef(b.defId); }
  function resName(key) { var r = G.resource(key); return r ? r.icon + ' ' + r.name : key; }
  function resDescription(text) {
    return esc(text).replace(/食物|原料|电力|衣服|家具|药品|教育|用水|水/g, function (name, offset, full) {
      var r = G.RES.filter(function (r) { return r.name === (name === '用水' ? '水' : name); })[0];
      return r && !full.slice(0,offset).endsWith(r.icon + ' ') ? r.icon + ' ' + name : name;
    });
  }
  function requirementLabel(r) { return (r.resource ? G.resource(r.resource).icon + ' ' : '') + r.label; }
  function saveUiPrefs() { try { saves.write(localStorage, UI_KEY, JSON.stringify(uiPrefs)); } catch (e) {} }
  function storyHtml() {
    var scenes = O.story(), scene = scenes[storyIndex], last = storyIndex === scenes.length - 1;
    var town = mainGame.SCENARIOS.filter(function (s) { return s.id === 'town'; })[0];
    var goals = town.requirements.map(function (r) {
      return '<span>' + (r.key === 'pop' ? '👥' : '♥') + ' ' + esc(r.label) + ' <b>≥' + r.target + '</b></span>';
    }).join('');
    return '<div class="story-opening" data-story-scene="' + scene.id + '">' +
      '<div class="story-top"><img src="assets/brand/loop-town-wordmark.png?v=3162a" width="180" height="60" alt="周目小镇"><button class="text-btn" data-story-skip type="button">跳过剧情</button></div>' +
      '<div class="story-layout"><div class="story-art"><img src="assets/intro/town-dawn.svg" width="480" height="320" alt="晨光照亮小镇，田地与房屋旁留着待建的空地"><span>一座小镇，从你的第一步开始。</span></div>' +
      '<section class="story-copy" aria-labelledby="storyTitle"><span class="eyebrow">' + scene.chapter + '</span><h2 id="storyTitle" tabindex="-1">' + scene.title + '</h2>' +
      '<div class="story-speaker"><span aria-hidden="true">✉</span><b>镇务员 · 阿禾</b></div><p class="story-dialogue">' + scene.text.replace('{turns}', mainGame.MAX_TURNS) + '</p>' +
      (scene.id === 'commission' ? '<div class="story-commission"><span>第一站 · ' + town.name + '</span><div>' + goals + '</div><small>第 ' + mainGame.MAX_TURNS + ' 回合验收 · 所有目标同时达成</small></div>' :
        scene.id === 'practice' ? '<div class="story-practice"><span>📜 选蓝图</span><i>→</i><span>🌾 建农场</span><i>→</i><span>✓ 做任务</span></div><p class="story-note">结算声望会积累，逐步解锁 BUFF、蓝图与更多关卡。</p>' :
        '<p class="story-note">市政厅的灯亮着，第一份委托已经放在桌上。</p>') +
      '<div class="story-bottom"><div class="story-progress" role="group" aria-label="开场剧情进度">' + scenes.map(function (s, i) { return '<span class="' + (i === storyIndex ? 'current' : '') + '" aria-hidden="true"></span>'; }).join('') + '<small>' + (storyIndex + 1) + ' / ' + scenes.length + '</small></div>' +
      '<div class="story-actions">' + (storyIndex > 0 ? '<button class="text-btn" data-story-back type="button">上一幕</button>' : '') +
      (last ? '<button class="btn ghost" data-story-skip type="button">' + (showHelp ? '返回手册' : '先去大厅') + '</button><button class="btn primary" data-story-tutorial type="button">开始新手教程 →</button>' : '<button class="btn primary" data-story-next type="button">继续 →</button>') + '</div></div></section></div></div>';
  }
  function openStory() {
    storyIndex = 0;
    render();
    $('modalCard').scrollTop = 0;
    $('storyTitle').focus({ preventScroll: true });
  }
  function finishStory(practice) {
    storyIndex = null;
    uiPrefs.intro = 'seen'; saveUiPrefs();
    if (practice) startTutorial();
    else render();
  }
  function changeStory(delta) {
    storyIndex = Math.max(0, Math.min(O.story().length - 1, storyIndex + delta));
    render();
    $('modalCard').scrollTop = 0;
    $('storyTitle').focus({ preventScroll: true });
  }
  function setCityTab(tab) {
    cityTab = tab;
    document.body.dataset.cityTab = tab;
    Array.from($('cityNav').querySelectorAll('[data-city-tab]')).forEach(function (b) {
      var selected = b.dataset.cityTab === tab;
      b.classList.toggle('on', selected);
      b.setAttribute('aria-pressed', String(selected));
    });
  }
  function tutorialAllows(action, value) {
    if (!tutorial || tutorial.allows(action, value)) return true;
    toast('跟随当前步骤，或点击「退出练习」');
    return false;
  }
  function tutorialHtml() {
    var step = tutorial.step();
    var s = G.getState();
    var progress = step.id === 'turn' ? ' · 已推进 ' + (s.turn - 1) + ' / 3 回合' : '';
    return '<div class="guide-copy"><span class="eyebrow">独立练习 · ' + (step.id === 'done' ? '已完成' : (step.index + 1) + ' / ' + step.total) + progress + '</span>' +
      '<h2>' + step.title + '</h2><p>' + resDescription(step.text) + '</p></div>' +
      '<div class="guide-actions">' + (step.id === 'welcome' ? '<button class="btn primary" data-guide-next type="button">开始操作 →</button>' :
        step.id === 'done' ? '<button class="btn primary" data-guide-finish type="button">完成教程</button>' : '') +
      '<button class="text-btn" data-guide-exit type="button">退出练习</button></div>';
  }
  function startTutorial() {
    tutorialReturnHome = homeVisible;
    tutorial = O.create(mainGame);
    G = tutorial.game;
    homeVisible = false;
    growthOpen = false;
    configuringScenario = null;
    showHelp = false;
    buildPreviewId = null;
    drawKey = null; drawPick = [];
    modalHidden = false;
    tutorialLastStep = null;
    render();
  }
  function endTutorial(completed) {
    if (!tutorial) return;
    uiPrefs.tutorial = completed || uiPrefs.tutorial === 'done' ? 'done' : 'skipped'; saveUiPrefs();
    tutorial = null;
    G = mainGame;
    homeVisible = tutorialReturnHome || !G.getState();
    showHelp = false; buildPreviewId = null; modalHidden = false;
    drawKey = null; drawPick = []; tutorialLastStep = null;
    setCityTab('resources');
    render();
    toast(completed ? '教程完成，可以开始建设了' : '已退出练习，原城市进度保留');
  }
  function renderTutorial() {
    var box = $('tutorialPanel');
    document.body.classList.toggle('is-tutorial', !!tutorial);
    if (!tutorial) { box.classList.add('hidden'); delete document.body.dataset.tutorialStep; return; }
    var step = tutorial.step();
    var changedStep = tutorialLastStep !== step.id;
    document.body.dataset.tutorialStep = step.id;
    if (changedStep) {
      setCityTab(step.target === 'build' ? 'build' : step.target === 'tasks' ? 'tasks' : 'resources');
      tutorialLastStep = step.id;
    }
    box.innerHTML = tutorialHtml();
    box.classList.toggle('hidden', !$('modal').classList.contains('hidden'));
    Array.from(document.querySelectorAll('[data-build]')).forEach(function (b) { b.disabled = b.disabled || !tutorial.allows('build', b.dataset.build); });
    Array.from(document.querySelectorAll('[data-accept]')).forEach(function (b) {
      var target = tutorial.allows('accept', b.dataset.accept);
      b.disabled = b.disabled || !target;
      b.closest('.task-card').classList.toggle('guide-target', target);
    });
    Array.from(document.querySelectorAll('[data-abandon], [data-step]')).forEach(function (b) { b.disabled = true; });
    Array.from(document.querySelectorAll('[data-town-upgrade]')).forEach(function (b) { b.disabled = b.disabled || !tutorial.allows('upgrade'); });
    $('btnNext').disabled = $('btnNext').disabled || !tutorial.allows('next');
    $('btnRestart').disabled = true;
    $('btnGrowth').disabled = true;
    $('btnHelp').disabled = true;
    if (step.id === 'reward') {
      var resourceReward = $('modalCard').querySelector('[data-reward-choice="sup"]');
      if (resourceReward) resourceReward.disabled = true;
    }
    if (!$('modal').classList.contains('hidden') && step.id !== 'welcome') {
      var guidance = document.createElement('div');
      guidance.className = 'tutorial-callout'; guidance.innerHTML = tutorialHtml();
      $('modalCard').prepend(guidance);
    }
    if (changedStep) {
      if (!$('modal').classList.contains('hidden')) $('modalCard').scrollTop = 0;
      else box.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    $('saveNote').textContent = '练习不覆盖存档';
  }
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

  function requirementChips(requirements) {
    var grouped = {}, result = [];
    requirements.forEach(function (r) {
      if (r.key !== 'balance') result.push('<span>' + esc(requirementLabel(r)) + ' <b>≥' + r.target + '</b></span>');
      else (grouped[r.target] || (grouped[r.target] = [])).push(r);
    });
    Object.keys(grouped).forEach(function (target) {
      var rows = grouped[target];
      result.push('<span title="' + esc(rows.map(requirementLabel).join('、')) + '">' +
        rows.map(function (r) { return resName(r.resource); }).join(' / ') +
        (rows.length > 1 ? ' 净余量各' : ' 净余量') + ' <b>≥' + target + '</b></span>');
    });
    return result.join('');
  }
  function homeScenariosHtml(g) {
    var records = loadCampaign();
    return [0].concat(chapterThresholds()).map(function (threshold, chapter) {
      var stages = G.SCENARIOS.filter(function (s) { return (s.unlockRep || 0) === threshold; });
      return '<section class="chapter"><div class="section-heading"><h2>' + ['基础建设', '产业拓展', '城市进阶'][chapter] + '</h2><span>' +
        (threshold && g.totalRep < threshold ? '累计 ' + fmt(threshold) + ' 声望解锁 · 还差 ' + fmt(threshold - g.totalRep) : stages.length + ' 个关卡') + '</span></div>' +
        '<div class="home-scenarios">' + stages.map(function (s) {
          var index = G.SCENARIOS.indexOf(s), locked = g.scenarioIds.indexOf(s.id) < 0;
          var cleared = Object.keys(records).some(function (k) { return k.indexOf(s.id + '|') === 0; });
          var normal = Object.keys(records).some(function (k) { return k.indexOf(s.id + '|normal|') === 0; });
          var hard = Object.keys(records).some(function (k) { return k.indexOf(s.id + '|hard|') === 0; });
          return '<button class="home-scenario' + (locked ? ' locked' : '') + '" data-scenario="' + s.id + '" type="button"' + (locked ? ' disabled' : '') + '>' +
            '<div class="scenario-top"><span class="scenario-number">' + String(index + 1).padStart(2, '0') + ' / ' + s.tag + '</span><span class="status-pill' + (cleared ? ' complete' : '') + '">' +
            (locked ? '未解锁' : cleared ? '✓ 已通关' : '可挑战') + '</span></div>' +
            '<div class="scenario-name"><span>' + s.icon + '</span><h3>' + s.name + '</h3></div>' +
            '<div class="requirement-chips">' + requirementChips(s.requirements) + '</div>' +
            '<div class="scenario-bottom"><span>' + (locked ? '声望 ' + fmt(threshold) : (normal ? '普通 ✓' : '普通 ○') + ' · ' + (hard ? '困难 ✓' : '困难 ○')) + '</span><b>' + (locked ? '待开放' : '选择关卡 →') + '</b></div></button>';
        }).join('') + '</div></section>';
    }).join('');
  }
  function growthContentHtml() {
    var g = currentGrowth(), rows = growthMilestones();
    var next = rows.filter(function (r) { return !milestoneUnlocked(r, g.totalRep, g.legacyUnlockRep); })[0];
    return '<div class="section-heading"><h2>声望成长</h2><span>累计达标自动解锁，不消耗声望</span></div>' +
      '<div class="growth-overview"><div><b>' + g.capacity + '<small> 点</small></b><span>BUFF 携带额度</span></div><div><b>' + g.buffIds.length + '<small> / ' + (G.BUFFS.length - 1) + '</small></b><span>可用 BUFF</span></div><div><b>' + g.rerolls + '<small> 次 / 局</small></b><span>蓝图刷新</span></div><div><b>' + g.scenarioIds.length + '<small> / ' + G.SCENARIOS.length + '</small></b><span>可选关卡</span></div></div>' +
      '<div class="growth-track">' + rows.map(function (r) {
        var unlocked = milestoneUnlocked(r, g.totalRep, g.legacyUnlockRep);
        return '<article class="milestone' + (unlocked ? ' unlocked' : r === next ? ' next' : '') + '"><div class="milestone-mark">' + (unlocked ? '✓' : '◇') + '</div>' +
          '<div><b>' + r.name + '</b><p>' + resDescription(r.description) + '</p></div><div class="milestone-threshold"><b>' + fmt(r.rep) + '</b><small>' +
          (unlocked ? (g.totalRep < r.rep ? '旧版权限保留' : '已解锁') : '还差 ' + fmt(r.rep - g.totalRep)) + '</small></div></article>';
      }).join('') + '</div><details class="plain-details"><summary>声望如何获得？</summary><p>完成 30 回合后，本局声望 100% 计入累计。通关再加关卡奖励与首通奖励；失败仍保留本局声望，中途重开不结算。首通按关卡与难度各领取一次，换 BUFF 或词缀不重复领取。新成长从下一局生效。</p></details>';
  }
  function blueprintsHtml(g) {
    var current = mainGame.getState(), all = G.BLUEPRINTS;
    var rows = all.filter(function (b) { var unlocked = g.blueprintIds.indexOf(b.id) >= 0; return blueprintFilter === 'all' || (blueprintFilter === 'unlocked' ? unlocked : !unlocked); });
    return '<div class="section-heading"><div><h2>蓝图图鉴 <small>' + g.blueprintIds.length + ' / ' + all.length + '</small></h2><p>加入随机池后，仍需在局内抽取并建造。</p></div>' +
      '<div class="filter-bar" aria-label="筛选蓝图">' + [['all','全部'],['unlocked','已开放'],['locked','待解锁']].map(function (f) {
        return '<button class="filter-btn' + (blueprintFilter === f[0] ? ' on' : '') + '" data-bp-filter="' + f[0] + '" aria-pressed="' + (blueprintFilter === f[0]) + '" type="button">' + f[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="blueprint-catalog">' + rows.map(function (b) {
        var unlocked = g.blueprintIds.indexOf(b.id) >= 0, inCity = current && current.unlocked.indexOf(b.id) >= 0;
        return '<article class="catalog-card' + (unlocked ? '' : ' locked') + '"><div class="catalog-heading"><span class="catalog-icon">' + b.icon + '</span><div><h3>' + b.name + '</h3><span class="status-pill' + (unlocked ? ' complete' : '') + '">' + (unlocked ? '已加入随机池' : '累计 ' + fmt(b.unlockRep) + ' 解锁') + '</span></div></div>' +
          '<p class="catalog-output">' + outText(b, true) + '</p><p class="catalog-input">' + (extraText(b) ? '投入 ' + extraText(b) : '无额外资源投入') + '</p>' +
          '<div class="catalog-footer"><span>' + b.cost + ' 金 · ' + b.labor + ' 劳力 · 上限 ' + b.max + '</span><b>' + (inCity ? (current.over ? '上局已选 ✓' : '本局已选 ✓') : unlocked ? '等待局内抽取' : '还差 ' + fmt(b.unlockRep - g.totalRep)) + '</b></div></article>';
      }).join('') + '</div>' + (!rows.length ? '<div class="empty">此分类暂无蓝图。</div>' : '') + '<p class="home-note">图鉴展示标准建筑参数；本局价格和产出以开局配置、局内卡片为准。</p>';
  }
  function renderHome() {
    var g = currentGrowth(), S = mainGame.getState();
    if (S && S.over) {
      recordGrowth(S); recordClear(S);
      if (S.rep > loadBest()) saveBest(S.rep);
      g = currentGrowth();
    }
    var rows = growthMilestones(), next = rows.filter(function (r) { return !milestoneUnlocked(r, g.totalRep, g.legacyUnlockRep); })[0];
    var clearedCount = G.SCENARIOS.filter(function (s) { return Object.keys(loadCampaign()).some(function (k) { return k.indexOf(s.id + '|') === 0; }); }).length;
    $('homeScreen').innerHTML = '<header class="home-header"><a class="home-brand" href="#" aria-label="周目小镇主界面"><img class="home-app-icon" src="assets/icons/icon-192.png?v=3" alt="" width="48" height="48"><div class="brand-lockup"><h1><img class="wordmark" src="assets/brand/loop-town-wordmark.png?v=3162a" width="252" height="84" alt="周目小镇"></h1><span>城市大厅 · v3.19.0</span></div></a><div class="home-header-actions">' +
      (uiPrefs.tutorial ? '<button class="text-btn" data-start-tutorial type="button">' + (uiPrefs.tutorial === 'done' ? '重玩教程' : '新手教程') + '</button>' : '') + '<button class="btn ghost" data-open-saves type="button">存档</button><button class="btn ghost" data-open-sound type="button">声音</button><button class="btn ghost" data-home-help type="button">玩法帮助</button></div></header>' +
      '<section class="home-hero"><div class="home-welcome"><span class="eyebrow">从一座小镇开始</span><h2>规划你的下一座城市</h2><p>30 回合，让城市达成建设目标。</p><div class="home-counts"><span><b>' + clearedCount + '</b> / ' + G.SCENARIOS.length + ' 关已通关</span><span><b>' + fmt(loadBest()) + '</b> 最高声望</span></div></div>' +
      '<div class="home-progress"><span class="eyebrow">累计声望</span><strong>' + fmt(g.totalRep) + '</strong>' +
      '<div class="progress-track" role="progressbar" aria-label="下一成长目标" aria-valuemin="0" aria-valuemax="' + (next ? next.rep : Math.max(1,g.totalRep)) + '" aria-valuenow="' + g.totalRep + '"><i style="width:' + (next ? Math.min(100,g.totalRep / next.rep * 100) : 100) + '%"></i></div>' +
      '<p>' + (next ? '下一目标 · ' + next.name + '<span>还差 ' + fmt(next.rep - g.totalRep) + ' 声望</span>' : '所有成长内容已解锁') + '</p></div></section>' +
      (S ? '<section class="continue-card"><div><span class="eyebrow">' + (S.over ? '上次建设' : '进行中的城市') + '</span><h3>' + (S.scenarioId ? G.SCENARIOS.filter(function (s) { return s.id === S.scenarioId; })[0].name : '自由经营') + '</h3><p>T' + S.turn + ' / 30 · 人口 ' + S.pop + ' · 声望 ' + S.rep + (S.over ? ' · ' + (S.final.cleared ? '已通关' : '已结算') : '') + '</p></div><button class="btn primary" data-resume-city type="button">' + (S.over ? '查看结算' : '继续城市 →') + '</button></section>' : '') +
      (!uiPrefs.tutorial ? '<section class="learn-card"><span class="learn-icon" aria-hidden="true">✦</span><div><b>第一次当市长？</b><p>选蓝图、建造、完成任务。独立练习，不覆盖城市进度。</p></div><button class="btn primary" data-start-tutorial type="button">新手教程</button><button class="text-btn" data-dismiss-tutorial type="button">稍后学习</button></section>' : '') +
      '<nav class="home-nav" aria-label="大厅导航">' + [['scenarios','建设关卡',g.scenarioIds.length + ' / ' + G.SCENARIOS.length],['growth','局外成长',g.capacity + ' 点额度'],['blueprints','蓝图图鉴',g.blueprintIds.length + ' / ' + G.BLUEPRINTS.length]].map(function (tab) {
        return '<button data-home-tab="' + tab[0] + '" aria-pressed="' + (homeTab === tab[0]) + '" class="' + (homeTab === tab[0] ? 'selected' : '') + '" type="button">' + tab[1] + '<small>' + tab[2] + '</small></button>';
      }).join('') + '</nav><div id="homeContent">' + (homeTab === 'growth' ? growthContentHtml() : homeTab === 'blueprints' ? blueprintsHtml(g) : homeScenariosHtml(g)) + '</div><footer class="home-footer">本机自动保存 · 进度保存在当前浏览器</footer>';
  }
  function replaceCityHtml() {
    var S = mainGame.getState(), target = G.SCENARIOS.filter(function (s) { return s.id === configuringScenario; })[0];
    return '<div class="modal-head"><h2>开始新的城市？</h2><p>当前 T' + S.turn + ' 城市将被替换，中途结束不结算声望。通关记录和局外成长保留。</p></div>' +
      '<div class="setup-summary"><b>' + target.icon + ' ' + target.name + '</b><span>' + (pendingRunConfig.difficultyId === 'hard' ? '困难' : '普通') + ' · BUFF ' + pendingRunConfig.buffIds.length + ' · 词缀 ' + (pendingRunConfig.affixIds || []).length + '</span></div>' +
      '<div class="modal-actions"><button class="btn ghost" data-back-setup type="button">继续配置</button><button class="btn primary" data-confirm-new type="button">替换并开始</button></div>';
  }
  function render() {
    var wasOpen = !$('modal').classList.contains('hidden');
    var focused = document.activeElement;
    var openSections = Array.from($('modalCard').querySelectorAll('details[open] > summary')).map(function (n) { return n.textContent.split('·')[0].trim(); });
    renderScreen();
    Array.from($('modalCard').querySelectorAll('details')).forEach(function (d) {
      if (d.querySelector('summary') && openSections.indexOf(d.querySelector('summary').textContent.split('·')[0].trim()) >= 0) d.open = true;
    });
    var isOpen = !$('modal').classList.contains('hidden');
    $('modalCard').classList.toggle('story-card', storyIndex !== null);
    if (storyIndex !== null) $('modalCard').setAttribute('aria-labelledby', 'storyTitle');
    else $('modalCard').removeAttribute('aria-labelledby');
    if (isOpen) {
      var soundButton = document.createElement('button');
      soundButton.type = 'button'; soundButton.className = 'text-btn modal-sound';
      soundButton.setAttribute('data-open-sound', '');
      var toolsRow = document.createElement('div'); toolsRow.className = 'modal-tools';
      var saveButton = document.createElement('button'); saveButton.type = 'button'; saveButton.className = 'text-btn';
      saveButton.setAttribute('data-open-saves', ''); saveButton.textContent = '存档';
      toolsRow.appendChild(saveButton); toolsRow.appendChild(soundButton); $('modalCard').appendChild(toolsRow);
    }
    syncSound();
    $('homeScreen').inert = isOpen;
    $('gameScreen').inert = isOpen;
    if (isOpen && !wasOpen) focusReturn = focused;
    if (isOpen && (!$('modalCard').contains(document.activeElement) || document.activeElement === document.body)) $('modalCard').focus({ preventScroll: true });
    if (!isOpen && wasOpen) {
      var target = focusReturn && focusReturn.isConnected ? focusReturn : homeVisible ? $('homeScreen').querySelector('[data-home-tab="' + homeTab + '"]') : $('btnNext');
      if (target && !target.disabled) target.focus({ preventScroll: true });
      focusReturn = null;
    }
  }
  function renderScreen() {
    $('homeScreen').classList.toggle('hidden', !homeVisible);
    $('gameScreen').classList.toggle('hidden', homeVisible);
    $('btnGrowth').disabled = false;
    $('btnRestart').disabled = false;
    $('tutorialPanel').classList.add('hidden');
    document.body.classList.toggle('is-home', homeVisible);
    document.body.classList.toggle('is-tutorial', !!tutorial);
    if (!tutorial) delete document.body.dataset.tutorialStep;
    if (homeVisible) renderHome();
    if (storyIndex !== null) {
      $('modalCard').innerHTML = storyHtml();
      $('modal').classList.remove('hidden');
      $('btnShowModal').classList.add('hidden');
      return;
    }
    if (growthOpen || configuringScenario) {
      var detailsOpen = !!$('modalCard').querySelector('.setup-details[open]');
      var presetsOpen = !!$('modalCard').querySelector('.loadout-presets[open]');
      var affixesOpen = !!$('modalCard').querySelector('.affix-details[open]');
      $('modalCard').innerHTML = growthOpen ? growthHtml() : replacingCity ? replaceCityHtml() : runSetupHtml(detailsOpen, presetsOpen, affixesOpen);
      $('modal').classList.remove('hidden');
      $('btnShowModal').classList.add('hidden');
      $('btnNext').disabled = true;
      $('btnHelp').disabled = true;
      return;
    }
    if (homeVisible) {
      $('modalCard').innerHTML = showHelp ? helpHtml() : '';
      $('modal').classList.toggle('hidden', !showHelp);
      $('btnShowModal').classList.add('hidden');
      return;
    }
    var S = G.getState();
    if (!S) return;
    $('btnHelp').disabled = false;
    var used = G.laborUsed();
    var best = loadBest();
    if (!tutorial && S.over && S.final && S.final.rep > best) {
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
    renderTutorial();
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
    var next = fc && fc.last, grid = $('resGrid');
    grid.classList.toggle('show-details', resourceDetails);
    $('btnResourceDetail').textContent = resourceDetails ? '收起数据' : '详细数据';
    $('btnResourceDetail').setAttribute('aria-pressed', String(resourceDetails));
    grid.innerHTML = current.per.map(function (p) {
      var np = next && next.per.filter(function (r) { return r.key === p.key; })[0];
      var balance = round2(p.sup - p.dem - p.occ), nextBalance = np ? round2(np.sup - np.dem - np.occ) : null;
      var total = p.dem + p.occ, covered = Math.max(0, Math.min(p.dem, p.sup - p.occ));
      return '<article class="res-card ' + p.group + (balance < 0 ? ' short' : ' full') + '" aria-label="' + p.name + '余量 ' + balance + '">' +
        '<div class="res-top"><span class="res-icon">' + p.icon + '</span><span class="res-name">' + p.name + '</span><span class="res-tag">' + (p.group === 'basic' ? '基础' : '民生') + '</span></div>' +
        '<div class="resource-balance' + (balance < 0 ? ' negative' : '') + '"><span>' + (balance < 0 ? '缺口' : '余量') + '</span><b>' + fmtNet(balance) + '</b></div>' +
        '<div class="resource-forecast">' + (S.over ? '本局已结束' : nextBalance === null ? '处理选择后显示预测' : (S.turn === G.MAX_TURNS ? '验收' : '下回合') + ' <b class="' + (nextBalance < 0 ? 'negative' : 'positive') + '">' + fmtNet(nextBalance) + '</b>') + '</div>' +
        (p.group === 'advanced' && current.advancedShort > 0 ? '<small class="resource-warning">基础不足 · 产出 ' + current.advancedOutputPct + '%</small>' : '') +
        '<div class="res-data"><div>供给 ' + p.sup + ' − 城市需求 ' + p.dem + ' − 任务 ' + p.occ + '</div><div>满足分 ' + fmt1(p.score) + ' / 15</div>' +
        '<div class="bar res-bar"><i class="occ" style="width:' + (total ? Math.min(100,p.occ / total * 100) : 0) + '%"></i><i class="dem" style="width:' + (total ? covered / total * 100 : 0) + '%"></i></div></div></article>';
    }).join('');
    $('satMath').innerHTML = '<div class="satisfaction-summary"><span>满意度 <b>' + fmt1(current.sat) + '</b>' + (next ? ' → <b>' + fmt1(next.sat) + '</b>' : '') + '</span><span class="' + (next && next.sat < 0 ? 'negative' : 'positive') + '">' +
      (S.over ? '本局已结束' : !next ? '先处理待选项' : next.sat < 0 ? '下回合会掉人口' : '下回合声望 +' + next.repGain) + '</span></div>' +
      '<details class="plain-details"><summary>余量与满意度怎么算？</summary><p>余量 = 供给 − 城市需求 − 全部任务占用。满意度由八项资源满足分相加，再减人口惩罚、赤字与回合压力；基础缺口会降低高级建筑产出。</p>' +
      '<p>当前：资源 ' + fmt1(current.sum) + ' − 人口 ' + fmt1(current.penalty) + ' − 赤字 ' + G.DEFICIT + ' − 压力 ' + fmt1(current.turnPressure || 0) +
      (current.affixPenalty ? ' − 词缀 ' + current.affixPenalty : '') + (current.market ? ' + 市场 ' + current.market : '') + ' = ' + fmt1(current.sat) + '</p></details>';
    $('statRepNext').textContent = next ? '下回合 +' + next.repGain : S.over ? '已结束' : '待选择';
  }

  function goalConditionHtml(r) {
    var value = r.key === 'balance' ? fmtNet(r.current) : r.key === 'sat' ? fmt1(r.current) : fmt(r.current);
    return '<div class="goal-condition' + (r.met ? ' met' : '') + '">' +
      '<span class="goal-check">' + (r.met ? '✓' : '◇') + '</span>' +
      '<div><span>' + esc(requirementLabel(r)) + '</span><b>' + value + ' <small>/ ' + r.target + '</small></b></div>' +
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
    $('gameSubtitle').textContent = goal.name + ' · ' + (S.runConfig.difficultyId === 'hard' ? '困难' : '普通') +
      (S.runConfig.buffIds.length ? ' · BUFF ' + S.runConfig.buffIds.length : '') + ((S.runConfig.affixIds || []).length ? ' · 词缀 ' + S.runConfig.affixIds.length : '');
    $('gameSubtitle').title = configLabel(S.runConfig);
    var status = S.over ? (S.final.cleared ? '已通关' : '未通关') :
      goal.cleared ? '当前达标 · 待 T30 验收' : '建设中 · 剩 ' + (G.MAX_TURNS - S.turn) + ' 回合';
    $('goalPanel').innerHTML = '<div class="goal-heading"><h2>' + esc(goal.name) + ' · 建设目标</h2>' +
      '<span class="goal-state' + (goal.cleared ? ' met' : '') + '">' + status + '</span></div>' +
      '<div class="goal-conditions">' + goal.conditions.map(goalConditionHtml).join('') + '</div>' +
      (G.runModifiers().hardRule ? '<details class="plain-details goal-rules"><summary>' + G.runModifiers().hardRule.name + ' · 词缀 ' + (S.runConfig.affixIds || []).length + ' · 查看本局规则</summary><p>' + resDescription(G.runModifiers().hardRule.description) + '</p>' +
        (S.runConfig.affixIds || []).map(function (id) { var a = G.AFFIXES.filter(function (a) { return a.id === id; })[0]; return '<p><b>' + a.name + '</b> · ' + resDescription(a.description) + '</p>'; }).join('') + '</details>' : '');
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
      return '<li>' + esc(requirementLabel(r)) + '还差 ' + fmt1(r.shortfall) + '：' + advice + '</li>';
    }).join('') + '</ul></div>';
  }
  function growthHtml() {
    return '<div class="modal-head"><h2>局外成长</h2><p>累计声望 ' + fmt(currentGrowth().totalRep) + ' · 新解锁在下一局生效</p></div>' +
      growthContentHtml() + '<div class="modal-actions"><button class="btn primary" data-close-growth type="button">返回城市</button></div>';
  }

  function loadoutAdviceHtml(g) {
    var advice = L.recommendation(configuringScenario, pendingRunConfig.difficultyId, g.totalRep, g.legacyUnlockRep);
    if (!advice) return '';
    var selected = pendingRunConfig.buffIds.join('|') === advice.buffIds.join('|');
    return '<section class="loadout-advice" aria-label="本关配装建议"><b>本关建设建议</b><p>' + resDescription(advice.focus) + '</p>' +
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
  function runSetupHtml(detailsOpen, presetsOpen, affixesOpen) {
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
        resDescription(field === 'difficultyId' && def.id === 'hard' ? G.hardRule({ difficultyId: 'hard' }, s.id).name + '：' + G.hardRule({ difficultyId: 'hard' }, s.id).description : def.description) + '</span>' +
        (locked ? '<small>累计 ' + def.unlockRep + ' 声望解锁</small>' : over ? '<small>剩余额度不足</small>' : '') + '</button>';
    }
    return '<div class="modal-head"><h2>' + s.icon + ' ' + s.name + ' · 开局配置</h2>' +
      '<p>选择难度与 BUFF，准备建设。</p></div>' +
      '<div class="requirement-chips setup-goal" aria-label="通关目标">' + requirementChips(s.requirements) + '</div>' +
      '<fieldset class="setup-group"><legend>难度</legend><div class="setup-options difficulties">' +
      G.DIFFICULTIES.map(function (d) { return option(d, 'difficultyId'); }).join('') + '</div></fieldset>' +
      (pendingRunConfig.difficultyId === 'hard' ? '<details class="affix-details plain-details"' + (affixesOpen ? ' open' : '') + '><summary>附加困难词缀 · 已选 ' + (pendingRunConfig.affixIds || []).length + ' 项 · 奖励 +' + reward.affixPercent + '%</summary>' +
        '<p class="goal-note">数量不限，不占 BUFF 额度。奖励按困难通关奖励计算，百分比相加。</p>' +
        '<div class="affix-actions"><button class="btn ghost" data-affix-action="all" type="button">全选词缀</button><button class="btn ghost" data-affix-action="clear" type="button">清空词缀</button></div><div class="setup-options affixes">' +
        G.AFFIXES.map(function (a) {
          var selected = (pendingRunConfig.affixIds || []).indexOf(a.id) >= 0;
          return '<button class="setup-option' + (selected ? ' selected' : '') + '" data-affix="' + a.id + '" aria-pressed="' + selected + '" type="button">' +
            '<b>' + a.name + '</b><span>' + resDescription(a.description) + '</span><small>通关奖励 +' + a.rewardPercent + '%</small></button>';
        }).join('') + '</div></details>' : '') +
      '<fieldset class="setup-group"><legend>开局 BUFF · ' + status.cost + ' / ' + g.capacity + ' 点</legend><div class="setup-options">' +
      G.BUFFS.filter(function (b) { return b.id === 'none' || g.buffIds.indexOf(b.id) >= 0; }).map(function (b) { return option(b, 'buffIds'); }).join('') + '</div></fieldset>' +
      (g.buffIds.length < G.BUFFS.length - 1 ? '<details class="plain-details"><summary>待解锁 BUFF · ' + (G.BUFFS.length - 1 - g.buffIds.length) + ' 种</summary><div class="setup-options">' + G.BUFFS.filter(function (b) { return b.id !== 'none' && g.buffIds.indexOf(b.id) < 0; }).map(function (b) { return option(b, 'buffIds'); }).join('') + '</div></details>' : '') +
      '<details class="plain-details"><summary>配装建议</summary>' + loadoutAdviceHtml(g) + '</details>' + loadoutPresetsHtml(g, presetsOpen) +
      '<div class="setup-mini-stats"><span>初始金钱 <b>' + m.startingMoney + '</b></span><span>人口 / 可工作 <b>' + m.startingPop + ' / ' + Math.max(0,m.startingPop - m.idleWorkers) + '</b></span><span>开局蓝图 <b>' + (m.openingBlueprints > 1 ? '5 选 2' : '3 选 1') + '</b></span></div>' +
      '<div class="setup-rewards"><span>本局声望 100% ＋ 通关 ' + reward.clearBonus + (reward.affixBonus ? ' ＋ 词缀 ' + reward.affixBonus : '') + ' ＋ 首通 ' + reward.firstClearBonus + '</span><small>' + (reward.firstCleared ? '此难度首通已领取' : '首通每关、每难度仅一次') + (record ? ' · ✓ 此配置已通关' : '') + '</small></div>' +
      '<details class="setup-details"' + (detailsOpen ? ' open' : '') + '><summary>查看开局供给和人口需求</summary><table class="setup-table">' +
      '<thead><tr><th>资源</th><th>基础供给</th><th>人均需求</th><th>总人口需求</th></tr></thead><tbody>' +
      G.RES.map(function (r) { return '<tr><td>' + r.icon + ' ' + r.name + '</td><td>' +
        (r.base + m.baseSupply[r.key]) + '</td><td>' + fmtRate(m.populationDemand[r.key]) + '</td><td>' +
        fmtRate(round2(m.populationDemand[r.key] * m.startingPop)) + '</td></tr>'; }).join('') +
      '</tbody></table><p class="goal-note">人口需求按关卡、词缀与 BUFF 倍率叠加；建筑投入与任务占用另计。</p><p class="goal-note">建筑上限 ' + m.buildingCap + ' · 价格 ×' + fmtRate(m.buildingCostMultiplier) + ' · 产出 ×' + fmtRate(m.buildingOutputMultiplier) + ' · 任务占用 ×' + fmtRate(m.taskOccupancyMultiplier) + ' · 满意度 −' + m.satisfactionPenalty + '</p><p class="goal-note">' + configLabel(pendingRunConfig) + '</p></details>' +
      '<div class="modal-actions setup-actions"><button class="btn ghost" data-back-scenarios="1" type="button">返回主界面</button>' +
      '<button class="btn primary" data-start-configured="1" type="button"' + (status.ok ? '' : ' disabled') + '>开始本局</button></div>';
  }

  function renderCity(S, used) {
    var hint = $('cityHint');
    var activeCount = S.buildings.filter(function (b) { return b.active; }).length;
    hint.textContent = '已建 ' + S.buildings.length + ' / ' + G.buildingCapacity() + ' · 启用 ' + activeCount + ' 座 · 劳力 ' + used + ' / ' + G.laborCapacity();
    hint.className = 'hint' + (used > G.laborCapacity() ? ' danger' : '');
    var list = $('cityList');
    if (!S.buildings.length) {
      list.innerHTML = '<div class="empty">先建一座供给建筑，城市将从这里开始。</div>';
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
    var reason = st.ok ? '' : '<span class="bc-reason">' + st.reason + '</span>';
    return '<button class="build-card' + (st.ok ? '' : ' is-dis') + '" data-build="' + id + '"' +
      (st.ok ? '' : ' disabled') + ' title="' + (st.ok ? '预览建造 ' + d.name : st.reason) + '" type="button">' +
      '<span class="bc-icon">' + d.icon + '</span>' +
      '<div class="bc-main"><b>' + d.name + '</b>' +
      '<small>' + outText(d) + ' · 劳力 ' + d.labor + '</small>' +
      (extra ? '<small class="extra">耗 ' + extra + '</small>' : '') +
      '</div>' +
      '<div class="bc-right"><span class="bc-cost">' + G.buildingCost(d) + ' 金</span>' +
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
    var nextOver = fc && fc.last ? fc.last.over : 0;
    $('taskHint').textContent = '待接 ' + S.board.length + ' · 进行中 ' + S.active.length;
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
            ' · 声望 +' + ft.last.repGain + '</span>'
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
          '<div class="tc-foot"><span class="tc-sat' + previewCls + '">预计满意度 ' +
          (preview === null ? '—' : fmt1(preview)) + deltaTxt + '</span>' +
          '<button class="btn small primary" data-accept="' + t.uid + '"' +
          (blocked || S.pendingDraw || S.over ? ' disabled' : '') + ' type="button">' +
          (blocked ? '产出不足' : '接取') + '</button></div>' +
          '</article>';
      }).join('');
    }

    $('activeCount').textContent = S.active.length;
    $('activeSection').classList.toggle('hidden', !S.active.length);
    var act = $('activeList');
    if (!S.active.length) {
      act.innerHTML = '<div class="empty small">接取任务后，在这里查看进度。</div>';
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
      return '<div class="log-line ' + esc(l.kind) + '"><span class="log-turn">T' + esc(l.turn) + '</span><span>' + esc(l.text) + '</span></div>';
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
    else if (!S.hasBuilt) hint.textContent = '还可建造或升级 1 次';
    else hint.textContent = '建设行动已用 · 可处理任务';
    hint.className = 'action-hint' + (laborOver ? ' danger' : '');
  }

  function introHtml() {
    return '<div class="opening-tip">✦ 蓝图解锁建筑类型，建造仍需金钱与劳力。先补基础供给，再发展民生。</div>';
  }

  function helpHtml() {
    var sections = [
      ['资源与满意度', '余量 = 供给 − 城市需求 − 全部任务占用，红色表示缺口。八项满足分各 0–15，相加后减人口惩罚、赤字 ' + G.DEFICIT + '、回合压力及词缀惩罚，再加市场加成。满意度低于 0 会掉人口；达到 20 / 35 / 50 / 65 / 75，每回合声望 +1 / +2 / +3 / +4 / +5。基础资源每缺一项，高级产出降低 25%，四项全缺停产。'],
      ['人口、劳力与建设', '人口提供劳力，也消耗全部资源；闲人只减少可工作人口。城市用 − / + 调整建筑启停，劳力超额时需先停用建筑。每回合只能建造或升级一次。达到人口 6 / 9 / 12 / 15 时可免费升级城镇，获得 5 选 2 蓝图；建筑最多 ' + G.CAP + ' 座（词缀可降低上限）。'],
      ['任务与奖励', '接取前看资源余额、预计满意度和完成时间。余额包含城市需求与全部任务占用，仓库减免和高级减产已计入。限时任务有接取期限；恶性任务未接时也占资源，接取后改为任务占用。任务超额占用会减速：超额 (0,2) 为 0.8 速，[2,3) 为 0.6 速，≥3 为 0.5 速。完成后选择人口或永久供给，两者均有金钱与声望。开局 5 张任务，T' + G.REFRESH.join(' / ') + ' 各刷新 3 张。'],
      ['声望与人口档位', '人口惩罚分段累加：1–5 人每人 −1，6–15 人 −0.5，16–25 人 −1，26 人起 −1.5。每回合声望上限：人口 <12 为 +3，12–14 为 +4，≥15 为 +5；任务奖励不受上限限制。T1–6 无回合压力，之后逐渐增加至 T30 的 −5。'],
      ['通关与局外成长', '第 30 回合处理完全部奖励与建设操作，再点击「验收本关」。所有目标同时达标才通关，某种资源富余不能抵消另一种缺口。本局声望 100% 累计，失败也保留，中途重开不结算。通关和首通另加奖励；首通按关卡 × 难度各一次。累计声望自动解锁新内容，不花费声望，下一局生效。'],
      ['困难、BUFF 与蓝图', '每关困难规则不同，可追加任意数量的不同词缀；词缀奖金百分比相加，以困难通关奖励为基数，不放大本局声望与首通。BUFF 可多选但总消耗不能超过额度。成长蓝图只加入随机池，仍需局内抽取；刷新次数开局与升级抽取共用。BUFF 方案保存组合，载入时保留难度与词缀。'],
      ['计算与存档', '点击「详细数据」查看资源明细，建筑预览查看投入与产出变化。满产净产出用于建筑横向比较：产出 − 额外消耗 − 劳力对应的人口需求，不重复扣实际供需。城市、成绩、成长与方案只保存在当前浏览器；返回主界面或刷新会保留城市。选择新关卡直到确认开局才替换存档。']
    ];
    return '<div class="modal-head"><h2>市长手册</h2><p>先做一轮，再按需要查阅。</p></div><div class="help-quick"><div><b>01 建造</b><span>补供给，看余量</span></div><div><b>02 做任务</b><span>看预测，选奖励</span></div><div><b>03 达成目标</b><span>保持到第 30 回合</span></div></div>' +
      '<button class="btn primary" data-start-tutorial type="button">' + (mainGame.getState() ? '进入独立练习（保留当前城市）' : '开始新手教程') + '</button>' +
      '<button class="text-btn help-story" data-open-story type="button">重看开场剧情</button>' +
      '<div class="help-sections">' + sections.map(function (r) { return '<details class="plain-details"><summary>' + r[0] + '</summary><p>' + resDescription(r[1]) + '</p></details>'; }).join('') + '</div>' +
      '<div class="modal-actions"><button class="btn ghost" data-close-help type="button">返回</button></div>';
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
    return '<div class="modal-head"><h2>任务完成 · ' + esc(offer.icon) + ' ' + esc(offer.name) + '</h2>' +
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
      return '<div class="bp-row"><span class="bp-name">' + resName(r.key) + '</span>' +
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
      '<span>已扣除额外消耗与 ' + d.labor + ' 人占用 ' + fmtRate(d.labor * G.runModifiers().occupancyCost) + ' 点（' + G.RES.map(function (r) { return resName(r.key) + ' ' + fmtRate(G.runModifiers().populationDemand[r.key]); }).join('、') + '）；已计入本局难度与 BUFF，实际供需不会重复扣一次。</span></div>';
    var afterGoal = G.goalStatus(a);
    return '<div class="modal-head"><h2>建造预览 · ' + d.icon + ' ' + d.name + '</h2>' +
      '<p>确认后立即建造，本回合不能再建。花费 ' + G.buildingCost(d) + ' 金 · 劳力 ' + d.labor + ' · 建成后不可撤销。</p></div>' +
      '<div class="build-preview">' +
      '<div class="bp-stats">' +
      '<span>金钱 <b>' + p.moneyBefore + ' → ' + p.moneyAfter + '</b></span>' +
      '<span>劳力 <b>' + p.laborBefore + ' → ' + p.laborAfter + ' / ' + G.laborCapacity() + '</b></span>' +
      '<span>满意度 <b>' + fmt1(b.sat) + ' → ' + fmt1(a.sat) + '</b></span>' +
      '</div>' +
      '<div class="bp-compare"><div class="bp-subhead">资源变化</div>' +
      (rows || '<p class="bp-none">建造后供需无明显变化。</p>') + '</div>' +
      nextTxt +
      (a.advancedShort ? '<p class="bp-warn">基础资源不足，高级产出为 ' + a.advancedOutputPct + '%</p>' : '') +
      '<details class="plain-details"><summary>更多计算与目标变化</summary>' + netTxt +
        (afterGoal ? '<div class="bp-subhead">建造后建设目标 · ' + esc(afterGoal.name) + '</div><div class="goal-conditions">' + afterGoal.conditions.map(goalConditionHtml).join('') + '</div>' : '') +
        advReasonBlock(b, a) + '</details>' +
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
    if (tutorial && tutorial.step().id === 'welcome') {
      card.innerHTML = '<div class="tutorial-callout">' + tutorialHtml() + '</div><div class="goal-conditions">' + G.goalStatus().conditions.map(goalConditionHtml).join('') + '</div><p class="goal-note">练习随时可退出；正式城市、成长与成绩不受影响。刷新页面将结束练习并回到主界面。</p>';
      modal.classList.remove('hidden');
      return;
    }
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
      var intro = '从 ' + d.options.length + ' 张中选 ' + pickCount + ' 张。' + (d.source === 'town' ? '本回合建设行动已使用。' : '');
      var html = '<div class="modal-head"><h2>' + title + '</h2>' +
        '<p>' + intro + '</p></div>';
      if (d.opening && !tutorial) {
        var openingGoal = G.goalStatus();
        if (openingGoal) html += '<div class="requirement-chips opening-goals">' + requirementChips(openingGoal.conditions) + '</div>';
        html += introHtml();
      }
      html += '<div class="pick-grid' + (d.options.length > 3 ? ' five' : '') + '">';
      html += d.options.map(function (id) {
        var b = G.buildingDef(id);
        var extra = extraText(b);
        var selected = drawPick.indexOf(id) >= 0;
        var btnLabel = pickCount > 1 ? (selected ? '已选' : '选择') : '选择';
        return '<button class="pick-card' + (selected ? ' selected' : '') + '" data-pick="' + id + '" type="button">' +
          '<span class="pick-icon">' + b.icon + '</span>' +
          '<h3>' + b.name + '</h3>' +
          '<p>' + outText(b) + (extra ? '<br><span class="muted">耗 ' + extra + '</span>' : '') + '</p>' +
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
      if (!tutorial) {
        html += '<div class="draw-reroll"><button class="btn ghost" data-reroll-blueprints="1" type="button"' + (reroll.ok ? '' : ' disabled') + '>刷新蓝图 · 剩余 ' + reroll.remaining + ' 次</button>' +
          '<small>' + (reroll.ok ? '开局与升级共用次数' : reroll.reason) + '</small></div>';
        html += '<div class="modal-actions modal-view-actions"><button class="btn ghost" data-hide-modal="1" type="button">查看城市</button></div>';
      }
      card.innerHTML = html;
      modal.classList.remove('hidden');
      return;
    }
    if (S.over && S.final) {
      var f = S.final;
      var isBest = f.rep >= best;
      card.innerHTML = '<div class="end">' +
        '<div class="end-kicker">' + (f.goal ? esc(f.goal.name) + ' · 建设验收' : '自由经营 · 30 回合结束') + '</div>' +
        '<details class="plain-details end-config"><summary>本局配置</summary><p>' + configLabel(f.runConfig) + '</p></details>' +
        (f.goal ? '<h2 class="end-result' + (f.cleared ? ' cleared' : '') + '">' + (f.cleared ? '建设达标 · 通关' : '建设目标未完成 · 未通关') + '</h2>' : '') +
        '<div class="end-rep">' + f.rep + '<small>声望</small></div>' +
        '<div class="end-sub">经营成绩' + (isBest ? ' · 全部配置最高声望' : '') + '</div>' +
        growthSettlementHtml(S) +
        (f.goal ? '<div class="goal-conditions end-goals">' + f.goal.conditions.map(goalConditionHtml).join('') + '</div>' : '') +
        (f.goal && !f.cleared ? '<details class="plain-details"><summary>下次如何改进？</summary>' + failureAdviceHtml(f) + '</details>' : '') +
        '<details class="plain-details"><summary>经营成绩与记录</summary><div class="end-grid">' +
        '<div class="end-stat"><b>Lv.' + (f.level || 0) + '</b><span>城镇</span></div>' +
        '<div class="end-stat"><b>' + f.pop + '</b><span>人口</span></div>' +
        '<div class="end-stat"><b>' + f.buildings + '</b><span>建筑</span></div>' +
        '<div class="end-stat"><b>' + f.tasksDone + '</b><span>完成任务</span></div>' +
        '<div class="end-stat"><b>' + fmt(f.money) + '</b><span>剩余金钱</span></div>' +
        '</div>' +
        (S.scenarioId ? '<div class="end-best">此配置最佳通关声望：' +
          (loadCampaign()[P.key(S.scenarioId, S.runConfig, S.growthRep, S.legacyUnlockRep, S.rerollsGranted)] ? fmt(loadCampaign()[P.key(S.scenarioId, S.runConfig, S.growthRep, S.legacyUnlockRep, S.rerollsGranted)].bestRep) : '尚未通关') + '</div>' : '') +
        '<div class="end-best">本机最高声望（全部配置）：' + best + ' · 种子 ' + S.seed + '</div></details>' +
        '<div class="modal-actions"><button class="btn ghost" data-open-growth type="button">查看成长</button><button class="btn primary big" data-restart="1" type="button">返回主界面</button></div>' +
        '</div>';
      modal.classList.remove('hidden');
      return;
    }
    modal.classList.add('hidden');
    card.innerHTML = '';
  }

  function nextTurn() {
    if (!tutorialAllows('next')) return;
    var r = G.endTurn();
    if (!r.ok) { audio.play('error'); toast(r.error); }
    else audio.play(G.getState().over ? 'settle' : G.getState().rewardQueue.length ? 'reward' : 'turn');
    render();
  }

  function build(id) {
    var r = G.build(id);
    if (!r.ok) { audio.play('error'); toast(r.error); }
    else audio.play('build');
    render();
  }

  function openBuildPreview(id) {
    if (!tutorialAllows('build', id)) return;
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
    if (!tutorialAllows('build', id)) return;
    buildPreviewId = null;
    build(id);
  }

  function setCount(defId, delta) {
    if (tutorial) return;
    var S = G.getState();
    var list = S.buildings.filter(function (b) { return b.defId === defId; });
    var active = list.filter(function (b) { return b.active; }).length;
    var r = G.setBuildingCount(defId, active + delta);
    if (!r.ok) { audio.play('error'); toast(r.error); }
    render();
  }

  function accept(uid) {
    if (!tutorialAllows('accept', uid)) return;
    var r = G.acceptTask(uid);
    if (!r.ok) { audio.play('error'); toast(r.error); }
    else audio.play('task');
    render();
  }

  function abandon(uid) {
    if (tutorial) return;
    var r = G.abandonTask(uid);
    if (!r.ok) { audio.play('error'); toast(r.error); }
    render();
  }

  function chooseTaskReward(choice) {
    if (!tutorialAllows('reward', choice)) return;
    var r = G.chooseReward(choice);
    if (!r.ok) { audio.play('error'); toast(r.error); }
    else {
      audio.play('reward');
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
    if (!tutorialAllows('pick', id)) return;
    var S = G.getState();
    if (!S || !S.pendingDraw) return;
    modalHidden = false;
    if ((S.pendingDraw.count || 1) === 1) {
      var r = G.chooseBlueprint(id);
      if (!r.ok) { audio.play('error'); toast(r.error); }
      else audio.play('blueprint');
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
    if (!tutorialAllows('pick')) return;
    var S = G.getState();
    if (!S || !S.pendingDraw) return;
    modalHidden = false;
    var r = G.chooseBlueprints(drawPick);
    if (!r.ok) {
      audio.play('error');
      toast(r.error);
      return;
    }
    drawPick = [];
    drawKey = null;
    audio.play('blueprint');
    render();
  }

  function upgradeTown() {
    if (!tutorialAllows('upgrade')) return;
    var r = G.upgradeTown();
    if (!r.ok) { audio.play('error'); toast(r.error); }
    else audio.play('upgrade');
    drawPick = [];
    drawKey = null;
    render();
  }

  function newGame(seed, scenarioId, config) {
    if (tutorial) return;
    var growth = currentGrowth(), status = G.runConfigStatus(config, growth.totalRep, growth.legacyUnlockRep);
    if (!status.ok) { toast(status.error); return; }
    if (growth.scenarioIds.indexOf(scenarioId) < 0) { toast('此关卡尚未解锁'); return; }
    configuringScenario = null;
    growthOpen = false;
    homeVisible = false;
    replacingCity = false;
    setCityTab('resources');
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
    audio.play('confirm');
    render();
    $('modalCard').scrollTop = 0;
  }

  function openScenarioSelection(seed) {
    if (tutorial) return;
    growthOpen = false;
    homeVisible = true;
    homeTab = 'scenarios';
    configuringScenario = null;
    replacingCity = false;
    showHelp = false;
    buildPreviewId = null;
    pendingSeed = seed;
    modalHidden = false;
    render();
    $('modalCard').scrollTop = 0;
  }

  function openRunSetup(id, config) {
    if (currentGrowth().scenarioIds.indexOf(id) < 0) { openScenarioSelection(pendingSeed); toast('累计声望达标后解锁此关'); return; }
    growthOpen = false;
    homeVisible = true;
    replacingCity = false;
    configuringScenario = id;
    pendingRunConfig = G.normalizeRunConfig(config);
    render();
    $('modalCard').scrollTop = 0;
  }

  function restart() {
    openScenarioSelection();
  }

  function init() {
    try { saves.recover(localStorage); }
    catch (e) { toast('本机恢复日志未能完成，请保留当前设备数据并检查存储空间'); return; }
    // Migrate historical clears before rendering can record this run's first victory.
    loadGrowth();
    loadSavedLoadouts();
    try {
      var prefs = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
      if (prefs && (prefs.tutorial === 'done' || prefs.tutorial === 'skipped')) uiPrefs.tutorial = prefs.tutorial;
      if (prefs && prefs.intro === 'seen') uiPrefs.intro = 'seen';
    } catch (e) {}
    setCityTab('resources');
    $('btnResourceDetail').addEventListener('click', function () { resourceDetails = !resourceDetails; render(); });
    $('cityNav').addEventListener('click', function (e) {
      var b = e.target.closest('[data-city-tab]');
      if (b) setCityTab(b.dataset.cityTab);
    });
    document.addEventListener('click', function (e) {
      var target = e.target;
      if (target.closest('[data-open-sound]')) { openSound(); return; }
      if (target.closest('[data-open-saves]')) { saveUI.open(); return; }
      if (target.closest('[data-open-story]')) { openStory(); return; }
      if (target.closest('[data-story-skip]')) { finishStory(false); return; }
      if (target.closest('[data-story-next]')) { changeStory(1); return; }
      if (target.closest('[data-story-back]')) { changeStory(-1); return; }
      if (target.closest('[data-story-tutorial]')) { finishStory(true); return; }
      if (target.closest('[data-guide-next]')) { tutorial.acknowledge(); render(); return; }
      if (target.closest('[data-guide-exit]')) { endTutorial(false); return; }
      if (target.closest('[data-guide-finish]')) { endTutorial(true); return; }
      if (target.closest('[data-start-tutorial]')) { startTutorial(); return; }
      if (target.closest('[data-dismiss-tutorial]')) { uiPrefs.tutorial = 'skipped'; saveUiPrefs(); render(); return; }
      if (target.closest('[data-home-help]')) { showHelp = true; render(); return; }
      if (target.closest('[data-resume-city]')) {
        homeVisible = false; configuringScenario = null; growthOpen = false; showHelp = false; modalHidden = false;
        render(); return;
      }
      var tab = target.closest('[data-home-tab]');
      if (tab) { homeTab = tab.dataset.homeTab; render(); $('homeScreen').querySelector('[data-home-tab="' + homeTab + '"]').focus({ preventScroll: true }); return; }
      var bp = target.closest('[data-bp-filter]');
      if (bp) { blueprintFilter = bp.dataset.bpFilter; render(); $('homeScreen').querySelector('[data-bp-filter="' + blueprintFilter + '"]').focus({ preventScroll: true }); return; }
      var scenario = target.closest('#homeScreen [data-scenario]');
      if (scenario) { openRunSetup(scenario.dataset.scenario); return; }
    });
    document.addEventListener('keydown', function (e) {
      if ($('soundSettings').open || $('saveManager').open) return;
      if ($('modal').classList.contains('hidden')) return;
      if (e.key === 'Escape' && !tutorial) {
        if (storyIndex !== null) finishStory(false);
        else if (buildPreviewId) closeBuildPreview();
        else if (showHelp) { showHelp = false; render(); }
        else if (growthOpen) { growthOpen = false; render(); }
        else if (configuringScenario) { if (replacingCity) { replacingCity = false; render(); } else openScenarioSelection(pendingSeed); }
        else if (G.getState() && !G.getState().over) { modalHidden = true; render(); }
        e.preventDefault();
      }
      if (e.key === 'Tab') {
        var nodes = Array.from($('modalCard').querySelectorAll('button:not(:disabled), input:not(:disabled), summary, a[href], [tabindex="0"]')).filter(function (n) { return n.getClientRects().length; });
        if (!nodes.length) { e.preventDefault(); return; }
        var first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === $('modalCard'))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === $('modalCard'))) { e.preventDefault(); first.focus(); }
      }
    });
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
        else { drawKey = null; drawPick = []; audio.play('blueprint'); }
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
      if (e.target.closest('[data-back-setup]')) { replacingCity = false; render(); return; }
      if (e.target.closest('[data-confirm-new]')) { newGame(pendingSeed, configuringScenario, pendingRunConfig); return; }
      if (e.target.closest('[data-start-configured]')) {
        if (mainGame.getState() && !mainGame.getState().over) { replacingCity = true; render(); $('modalCard').scrollTop = 0; }
        else newGame(pendingSeed, configuringScenario, pendingRunConfig);
        return;
      }
      if (e.target.closest('[data-back-scenarios]')) { openScenarioSelection(pendingSeed); return; }
      var cancelScenario = e.target.closest('[data-cancel-scenario]');
      if (cancelScenario) { configuringScenario = null; pendingSeed = undefined; render(); return; }
      var hideView = e.target.closest('[data-hide-modal]');
      if (hideView && !tutorial) { modalHidden = true; render(); return; }
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

    initSound();
    saveUI = window.DSHSaveUI.create(window, { toast: toast, isTutorial: function () { return !!tutorial; }, reload: function () { window.location.reload(); } });
    var saved = loadSave();
    if (saved) {
      var imported = mainGame.importState(saved);
      if (!imported.ok) { toast('上次城市存档无法读取，可在「存档」中导出原始数据或恢复备份'); }
      else { try { saves.write(localStorage, SAVE_KEY, JSON.stringify(mainGame.exportState())); } catch (e) { toast('城市已读取，但本机存储不可写；可导出文件留存'); } }
    }
    if (scenarioId) { pendingSeed = seed; openRunSetup(scenarioId, requestedConfig); }
    else openScenarioSelection(seed);
    var hasProgress = !!saved || !!mainGame.getState() || loadBest() > 0 || P.totalRep(loadGrowth()) > 0 || Object.keys(loadCampaign()).length > 0;
    if (!scenarioId && O.shouldShowStory(uiPrefs, hasProgress)) openStory();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
