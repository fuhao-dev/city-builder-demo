/* 城建设计局 · v3.4.1 界面 */
(function () {
  'use strict';

  var G = window.DSHGame;
  var $ = function (id) { return document.getElementById(id); };
  var BEST_KEY = 'dsh_city_best_rep_v33';
  var SAVE_KEY = 'dsh_city_save_v34';
  var toastTimer = null;
  var taskFilter = 'all';
  var showHelp = false;

  var BP_NOTES = {
    greenhouse: '同劳力，食物 8（农场 6），省 1 座槽',
    ranch: '2 劳力 = 2 农场，多 1 原料，省 1 槽',
    wind: '同劳力，电力 8（电站 5），省 1 座槽',
    deepwell: '同劳力，水 8（水厂 5），省 1 座槽',
    textile: '3 劳力 ≈ 2 服装厂（4 劳力），省 1 劳力 + 1 槽',
    workshop: '3 劳力 ≈ 2 家具厂（4 劳力），省 1 劳力 + 1 槽',
    pharm2: '4 劳力 ≈ 2 制药厂（6 劳力），省 2 劳力 + 1 槽',
    academy: '3 劳力 ≈ 2 学校（4 劳力），省 1 劳力 + 1 槽',
    market: '0 劳力，满意度 +5',
    warehouse: '0 劳力，任务占用 −20%'
  };
  function bpNote(id) { return BP_NOTES[id] || ''; }

  function fmt(n) { return Math.round(n).toLocaleString('zh-CN'); }
  function fmt1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function loadBest() {
    try { return Number(localStorage.getItem(BEST_KEY) || 0) || 0; } catch (e) { return 0; }
  }
  function saveBest(rep) {
    try { localStorage.setItem(BEST_KEY, String(rep)); } catch (e) {}
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
  function occText(occ) {
    if (!occ) return '无';
    var keys = Object.keys(occ);
    if (!keys.length) return '无';
    return keys.map(function (k) { return resName(k) + ' ' + occ[k]; }).join('、');
  }
  function outText(def) {
    var parts = [];
    if (def.out) Object.keys(def.out).forEach(function (k) { parts.push(resName(k) + ' +' + def.out[k]); });
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
    var parts = [];
    if (r.pop) parts.push('人口 +' + r.pop);
    if (r.sup) Object.keys(r.sup).forEach(function (k) { parts.push(resName(k) + ' +' + r.sup[k]); });
    if (r.rep) parts.push('声望 +' + r.rep);
    if (r.money) parts.push('金 +' + r.money);
    return parts.join(' · ');
  }
  function typeLabel(type) {
    return type === 'timed' ? '限时' : type === 'malignant' ? '恶性' : '普通';
  }
  function typeOrder(type) {
    return type === 'timed' ? 0 : type === 'malignant' ? 1 : 2;
  }

  function render() {
    var S = G.getState();
    if (!S) return;
    var used = G.laborUsed();
    var best = loadBest();
    if (S.over && S.final && S.final.rep > best) {
      best = S.final.rep;
      saveBest(best);
    }
    renderHud(S, used, best);
    var fc = G.forecast();
    renderResources(S, fc);
    renderCity(S, used);
    renderBuild(S, used);
    renderTasks(S, fc);
    renderLog(S);
    renderAction(S, used);
    renderModal(S, best);
    persist();
  }

  function renderHud(S, used, best) {
    $('statTurn').textContent = S.turn + ' / ' + G.MAX_TURNS;
    $('statMoney').textContent = fmt(S.money);
    $('statPop').textContent = S.pop;
    var sat = $('statSat');
    sat.textContent = fmt1(S.sat);
    sat.className = 'v sat ' + (S.sat < 0 ? 'neg' : S.sat <= 10 ? 'mid' : 'pos');
    $('statRep').textContent = S.rep;
    var labor = $('statLabor');
    labor.textContent = used + ' / ' + S.pop;
    labor.className = 'v labor' + (used > S.pop ? ' neg' : '');
    labor.title = '已占用 ' + used + ' · 可用 ' + (S.pop - used);
    $('statCity').textContent = S.buildings.length + ' / ' + G.CAP;
    $('statBest').textContent = best ? best : '—';
    $('statBest').title = '本机最佳最终声望';
  }

  function renderResources(S, fc) {
    var c = S.last;
    var grid = $('resGrid');
    if (!c) { grid.innerHTML = ''; $('satMath').textContent = ''; return; }
    var n = fc && fc.last ? fc.last : null;
    var nextLabel = S.turn >= G.MAX_TURNS ? '结算' : '下回合';
    function nextOf(key) {
      if (!n) return null;
      for (var i = 0; i < n.per.length; i++) if (n.per[i].key === key) return n.per[i];
      return null;
    }
    grid.innerHTML = c.per.map(function (p) {
      var np = nextOf(p.key);
      var score = np ? np.score : p.score;
      var left = Math.min(100, Math.max(0, (score / 10) * 100));
      var cls = p.group === 'advanced' ? 'advanced' : 'basic';
      var full = score >= 10 ? ' full' : score <= 0 ? ' zero' : '';
      var deltaCls = np ? (np.score > p.score ? ' up' : np.score < p.score ? ' down' : '') : '';
      var supCls = np ? (np.sup > p.sup ? ' up' : np.sup < p.sup ? ' down' : '') : '';
      return '<article class="res-card ' + cls + full + '" title="上回合 ' + p.sup + ' / 下回合 ' + (np ? np.sup : '—') + '">' +
        '<div class="res-top"><span class="res-icon">' + p.icon + '</span>' +
        '<span class="res-name">' + p.name + '</span>' +
        '<span class="res-tag">' + (p.group === 'advanced' ? '高级' : '基础') + '</span></div>' +
        '<div class="res-flow">' +
        '<span class="rf-label">上回合</span><b>' + p.sup + '</b>' +
        '<span class="res-arrow">→</span>' +
        '<span class="rf-label">' + nextLabel + '</span><b class="res-next' + supCls + '">' + (np ? np.sup : '—') + '</b>' +
        '<span class="res-sub">/ 需 ' + (np ? np.dem : p.dem) + '</span>' +
        '</div>' +
        '<div class="res-scoreline">满足 <b>' + fmt1(p.score) + '</b>' +
        '<span class="res-arrow">→</span><b class="res-next' + deltaCls + '">' + (np ? fmt1(np.score) : '—') + '</b></div>' +
        '<div class="bar"><i style="width:' + left + '%"></i></div>' +
        '<div class="res-foot">' + (np
          ? ((np.occ > 0 ? '占用 ' + np.occ + ' · ' : '') + '可用 ' + np.avail)
          : '下回合待结算 · 上回合可用 ' + p.avail) + '</div>' +
        '</article>';
    }).join('');
    var math;
    if (n) {
      var neg = n.negPenalty || 0;
      math = '上回合 <b>' + fmt1(c.sat) + '</b> → ' + nextLabel + ' <b>' + fmt1(n.sat) + '</b>' +
        '<span class="sat-detail">八项 ' + fmt1(n.sum) + ' − 人口惩罚 ' + fmt1(n.penalty) +
        ' − 赤字 ' + G.DEFICIT +
        (neg ? ' − <span class="sat-neg">负值惩罚 ' + fmt1(neg) + '</span>' : '') +
        (n.market ? ' + 市场 ' + n.market : '') + '</span>';
    } else {
      math = '上回合 <b>' + fmt1(c.sat) + '</b> · 下回合预测不可用（先处理蓝图/劳力）';
    }
    $('satMath').innerHTML = math;
  }

  function renderCity(S, used) {
    var hint = $('cityHint');
    var activeCount = S.buildings.filter(function (b) { return b.active; }).length;
    hint.textContent = '已建 ' + S.buildings.length + ' / 24 · 启用 ' + activeCount + ' 座 · 劳力 ' + used + ' / ' + S.pop;
    hint.className = 'hint' + (used > S.pop ? ' danger' : '');
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
    var reason = st.ok ? '' : '<span class="bc-reason">' + st.reason + '</span>';
    return '<button class="build-card' + (st.ok ? '' : ' is-dis') + '" data-build="' + id + '"' +
      (st.ok ? '' : ' disabled') + ' title="' + (st.ok ? '建造 ' + d.name : st.reason) + '" type="button">' +
      '<span class="bc-icon">' + d.icon + '</span>' +
      '<div class="bc-main"><b>' + d.name + '</b>' +
      '<small>' + outText(d) + ' · 劳力 ' + d.labor + '</small>' +
      (extra ? '<small class="extra">耗 ' + extra + '</small>' : '') +
      (note ? '<small class="bp-note">' + note + '</small>' : '') + '</div>' +
      '<div class="bc-right"><span class="bc-cost">' + d.cost + '</span>' +
      '<span class="bc-count">' + count + '/' + d.max + '</span>' + reason + '</div>' +
      '</button>';
  }

  function renderBuild(S, used) {
    var hint = $('buildHint');
    hint.textContent = (S.hasBuilt ? '本回合已建造' : '每回合 1 次') + ' · 劳力 ' + used + ' / ' + S.pop + ' · 蓝图 ' + S.unlocked.length + '/10';
    hint.className = 'hint' + (used > S.pop ? ' danger' : '');
    var html = '<div class="build-group"><div class="group-head"><span>基础</span><span>8 种</span></div><div class="build-grid">';
    html += G.BASE_BUILDINGS.map(function (d) { return buildCard(S, d.id); }).join('');
    html += '</div></div>';
    var unlocked = G.BLUEPRINTS.filter(function (d) { return S.unlocked.indexOf(d.id) >= 0; });
    if (unlocked.length) {
      html += '<div class="build-group"><div class="group-head"><span>蓝图</span><span>' + unlocked.length + ' 张</span></div><div class="build-grid">';
      html += unlocked.map(function (d) { return buildCard(S, d.id); }).join('');
      html += '</div></div>';
    } else {
      html += '<div class="empty small">蓝图在开局和声望 10/25/45/65 抽取。先选完开局蓝图。</div>';
    }
    $('buildList').innerHTML = html;
  }

  function renderTasks(S, fc) {
    var nextSat = fc && fc.last ? fmt1(fc.last.sat) : '—';
    var nextLabel = S.turn >= G.MAX_TURNS ? '终局' : '下回合';
    $('taskHint').textContent = '任务栏 ' + S.board.length + ' · 进行中 ' + S.active.length + ' · ' + nextLabel + '预测 ' + nextSat;
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
        var ft = G.forecastTask(t.uid);
        var preview = ft ? ft.sat : null;
        var previewCls = preview === null ? '' : preview < 0 ? ' neg' : preview > 10 ? ' pos' : ' mid';
        var deltaTxt = ft
          ? '<span class="tc-delta ' + (ft.delta >= 0 ? 'pos' : 'neg') + '">变化 ' + (ft.delta >= 0 ? '+' : '') + fmt1(ft.delta) + '</span>'
          : '';
        var extra = '';
        if (d.type === 'timed') {
          var left = t.acceptBy - S.turn;
          extra = '<div class="tc-deadline' + (left <= 1 ? ' urgent' : '') + '">限时：T' + t.acceptBy + ' 前接' +
            (left <= 1 ? '（最后回合）' : '（剩 ' + left + ' 回合）') + '</div>';
        } else if (d.type === 'malignant') {
          extra = '<div class="tc-deadline">出生负担 A：' + occText(d.burdenA) +
            (t.aReleased ? '（已释放）' : '（接取前持续占用）') + '</div>';
        }
        var finishTurn = S.turn + d.duration;
        if (finishTurn > G.MAX_TURNS) {
          extra += '<div class="tc-deadline urgent">本局剩余回合不足：预计 T' + finishTurn +
            ' 完成，最终 T' + G.MAX_TURNS + '</div>';
        }
        var occLabel = d.type === 'malignant' ? '接取占用 B' : '占用';
        return '<article class="task-card ' + d.type + '">' +
          '<div class="tc-top"><b>' + d.name + '</b><span class="badge ' + d.type + '">' + typeLabel(d.type) + '</span>' +
          '<span class="tc-dur">' + d.duration + ' 回合</span></div>' +
          '<div class="tc-occ">' + occLabel + '：' + occText(d.occ) + '</div>' +
          '<div class="tc-reward">' + rewardText(d) + '</div>' +
          extra +
          '<div class="tc-foot"><span class="tc-sat' + previewCls + '">接取后预计满意度 ' +
          (preview === null ? '—' : fmt1(preview)) + deltaTxt + '</span>' +
          '<button class="btn small primary" data-accept="' + t.uid + '"' + (S.pendingDraw || S.over ? ' disabled' : '') + ' type="button">接取</button></div>' +
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
        var pct = Math.min(100, Math.round((t.progress / d.duration) * 100));
        var finishTurn = S.turn + (d.duration - t.progress);
        var late = finishTurn > G.MAX_TURNS;
        var foot = late
          ? '本局内无法完成（预计 T' + finishTurn + '）'
          : (t.progress + 1 >= d.duration ? '下回合完成' : '还需 ' + (d.duration - t.progress) + ' 回合');
        return '<article class="task-card active ' + d.type + '">' +
          '<div class="tc-top"><b>' + d.name + '</b><span class="badge">进行中</span>' +
          '<span class="tc-dur">' + t.progress + ' / ' + d.duration + '</span></div>' +
          '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="tc-occ">占用：' + occText(d.occ) + '</div>' +
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
    var laborOver = used > S.pop;
    var finalTurn = S.turn >= G.MAX_TURNS;
    var canEnd = !over && !S.pendingDraw && !laborOver;
    var btn = $('btnNext');
    btn.disabled = !canEnd;
    btn.textContent = over ? '已结束' : finalTurn ? '结算本局' : '进入下回合 →';
    var hint = $('actionHint');
    if (S.pendingDraw) hint.textContent = '先选择蓝图';
    else if (over) hint.textContent = '30 回合结束 · 最终声望 ' + S.rep;
    else if (laborOver) hint.textContent = '劳力不足：已占用 ' + used + ' / 人口 ' + S.pop + '，停用建筑后才能进入下回合';
    else if (finalTurn) hint.textContent = '第 30 回合 · 点击结算本局（剩余 0 回合）';
    else if (!S.hasBuilt) hint.textContent = '本回合还可建造 1 次 · 剩 ' + (G.MAX_TURNS - S.turn) + ' 回合 · 种子 ' + S.seed;
    else hint.textContent = '本回合已建造；可接/放弃任务 · 剩 ' + (G.MAX_TURNS - S.turn) + ' 回合 · 种子 ' + S.seed;
    hint.className = 'action-hint' + (laborOver ? ' danger' : '');
  }

  function introHtml() {
    return '<div class="intro">' +
      '<div class="intro-goal">目标：30 回合累计声望，<b>最终得分只看累计声望</b>。</div>' +
      '<ul>' +
      '<li><b>满意度</b> = 八项资源满足分 − 人口惩罚 − 赤字 ' + G.DEFICIT + ' − 负值惩罚（&lt;0 才触发）。&gt;10 每回合给声望（每 +10 多 1，最多 5）；&lt;0 掉人口，且负值随回合加深（T26–30 额外 −5）；0–10 稳定。</li>' +
      '<li><b>每回合</b> 1 次建造；人口既提供劳力也产生需求，劳力不足不能进入下回合。</li>' +
      '<li><b>任务</b> 开局 4 张，T' + G.REFRESH.join('/T') + ' 各刷新 2 张；普通任务也给声望，限时任务过期消失。</li>' +
      '<li><b>蓝图</b> 开局和声望 10/25/45/65 各 3 选 1；蓝图不花建造行动，但建造仍花钱/劳力。</li>' +
      '</ul></div>';
  }

  function helpHtml() {
    return '<div class="rules">' +
      '<div class="end-kicker">30 回合 · 最终得分 = 累计声望</div>' +
      '<h2>规则速览</h2>' +
      '<p><b>满意度</b>：八项资源各 0–10 分，减去人口惩罚、赤字 ' + G.DEFICIT + ' 和负值惩罚。&gt;10 才给声望，每多 10 分 +1（最多 5）；&lt;0 掉人口；0–10 稳定。</p>' +
      '<p><b>负值惩罚</b>：满意度 &lt;0 时，负值随回合加深：T1–5 为 0、T6–10 额外 −1、T11–15 −2、T16–20 −3、T21–25 −4、T26–30 −5。正数不触发；越拖越痛。</p>' +
      '<p><b>资源</b>：卡面显示「上回合 → 下回合预测」。下回合预测包含已建建筑、任务占用和下一回合会完成的任务；建造后立即变化。</p>' +
      '<p><b>劳力</b>：启用建筑会占用人口，已占用 &gt; 人口时不能进入下回合。城市面板按类型用 − / + 调整启用数量，停用会同时停掉供给和额外消耗。</p>' +
      '<p><b>任务</b>：开局 4 张，T' + G.REFRESH.join('/T') + ' 各刷新 2 张。任务栏不限张数；限时任务过期消失；恶性任务不接也占出生负担 A。接取前看「接取后预计满意度」和变化量。</p>' +
      '<p><b>终局</b>：第 30 回合按钮变为「结算本局」；接取前若预计完成回合超过 T' + G.MAX_TURNS + '，任务卡会标红提醒。</p>' +
      '<button class="btn primary" data-close-help="1" type="button">知道了</button>' +
      '</div>';
  }

  function renderModal(S, best) {
    var modal = $('modal');
    var card = $('modalCard');
    if (showHelp) {
      card.innerHTML = helpHtml();
      modal.classList.remove('hidden');
      return;
    }
    if (S.pendingDraw) {
      var d = S.pendingDraw;
      var title = d.opening ? '开局蓝图 · 先看目标' : '声望 ' + d.node + ' · 蓝图';
      var html = '<div class="modal-head"><h2>' + title + '</h2>' +
        '<p>从 3 张中选 1 张解锁。蓝图只是建筑类型，建造时仍要花金钱和劳力。选完才能继续。</p></div>';
      if (d.opening) html += introHtml();
      html += '<div class="pick-grid">';
      html += d.options.map(function (id) {
        var b = G.buildingDef(id);
        var extra = extraText(b);
        var note = bpNote(id);
        return '<button class="pick-card" data-pick="' + id + '" type="button">' +
          '<span class="pick-icon">' + b.icon + '</span>' +
          '<h3>' + b.name + '</h3>' +
          '<p>' + outText(b) + (extra ? '<br><span class="muted">耗 ' + extra + '</span>' : '') + '</p>' +
          (note ? '<p class="pick-note">' + note + '</p>' : '') +
          '<span class="pick-req">劳力 ' + b.labor + ' · 上限 ' + b.max + '</span>' +
          '<span class="pick-cost">' + b.cost + ' 金</span>' +
          '<span class="pick-btn">选择</span>' +
          '</button>';
      }).join('');
      html += '</div>';
      card.innerHTML = html;
      modal.classList.remove('hidden');
      return;
    }
    if (S.over && S.final) {
      var f = S.final;
      var isBest = f.rep >= best;
      card.innerHTML = '<div class="end">' +
        '<div class="end-kicker">30 回合结束</div>' +
        '<div class="end-rep">' + f.rep + '<small>声望</small></div>' +
        '<div class="end-sub">最终得分只看累计声望' + (isBest ? ' · 本机最佳' : '') + '</div>' +
        '<div class="end-grid">' +
        '<div class="end-stat"><b>' + f.pop + '</b><span>人口</span></div>' +
        '<div class="end-stat"><b>' + f.buildings + '</b><span>建筑</span></div>' +
        '<div class="end-stat"><b>' + f.tasksDone + '</b><span>完成任务</span></div>' +
        '<div class="end-stat"><b>' + fmt(f.money) + '</b><span>剩余金钱</span></div>' +
        '</div>' +
        '<div class="end-best">本机最佳最终声望：' + best + ' · 种子 ' + S.seed + '</div>' +
        '<button class="btn primary big" data-restart="1" type="button">再来一局</button>' +
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

  function pick(id) {
    var r = G.chooseBlueprint(id);
    if (!r.ok) toast(r.error);
    render();
  }

  function newGame(seed) {
    showHelp = false;
    taskFilter = 'all';
    try {
      var btns = document.querySelectorAll('#taskFilter .filter-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('on', btns[i].getAttribute('data-filter') === 'all');
      }
    } catch (e) {}
    G.newGame(seed);
    render();
  }

  function restart(force) {
    if (!force && !confirm('重新开始？当前进度会被自动存档覆盖。')) return;
    newGame();
  }

  function init() {
    $('btnNext').addEventListener('click', nextTurn);
    $('btnRestart').addEventListener('click', function () { restart(false); });
    $('btnHelp').addEventListener('click', function () { showHelp = true; render(); });

    $('buildList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-build]');
      if (btn) build(btn.getAttribute('data-build'));
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
    $('modalCard').addEventListener('click', function (e) {
      var helpClose = e.target.closest('[data-close-help]');
      if (helpClose) { showHelp = false; render(); return; }
      var pickBtn = e.target.closest('[data-pick]');
      if (pickBtn) { pick(pickBtn.getAttribute('data-pick')); return; }
      var restartBtn = e.target.closest('[data-restart]');
      if (restartBtn) { restart(true); }
    });

    var seed = null;
    try {
      var q = new URLSearchParams(window.location.search).get('seed');
      if (q !== null && q !== '' && isFinite(Number(q))) seed = Number(q);
    } catch (e) {}

    if (seed === null) {
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
    newGame(seed);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
