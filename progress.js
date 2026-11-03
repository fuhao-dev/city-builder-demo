/* Pure configuration-specific progress records. Browser storage stays in ui.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game.js'));
  else root.DSHProgress = factory(root.DSHGame);
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';
  var REWARDS = {
    town: { clear: 50, first: 100 }, agriculture: { clear: 75, first: 150 },
    education: { clear: 100, first: 200 }, industry: { clear: 125, first: 250 },
    health: { clear: 150, first: 300 }, metropolis: { clear: 200, first: 400 },
    logistics: { clear: 200, first: 400 }, manufacturing: { clear: 225, first: 450 }, research: { clear: 250, first: 500 },
    resilience: { clear: 275, first: 550 }, care: { clear: 300, first: 600 }, capital: { clear: 350, first: 700 }
  };
  function firstClearKey(scenarioId, difficultyId) {
    if (!Object.prototype.hasOwnProperty.call(REWARDS, scenarioId) || !G.DIFFICULTIES.some(function (d) { return d.id === difficultyId; })) throw new Error('未知奖励关卡或难度');
    return scenarioId + '|' + difficultyId;
  }
  function validId(id) { return typeof id === 'string' && /^run-[a-zA-Z0-9-]{8,100}$/.test(id); }
  function amount(n) { return Number.isSafeInteger(n) && n >= 0; }
  function growthSignature(totalRep, legacyUnlockRep, rerollsGranted) {
    var g = G.growthStatus(totalRep, legacyUnlockRep);
    if (rerollsGranted !== undefined) {
      if (!Number.isInteger(rerollsGranted) || rerollsGranted < 0 || rerollsGranted > g.rerolls) throw new Error('刷新权限无效');
      g.rerolls = rerollsGranted;
    }
    var extra = g.blueprintIds.filter(function (id) { return G.buildingDef(id).unlockRep > 0; }).sort();
    return g.rerolls || extra.length ? '|growth:' + g.rerolls + ':' + extra.join('+') : '';
  }
  function key(scenarioId, config, growthRep, legacyUnlockRep, rerollsGranted) {
    if (!G.SCENARIOS.some(function (s) { return s.id === scenarioId; })) throw new Error('未知关卡');
    var c = G.normalizeRunConfig(config);
    return scenarioId + '|' + c.difficultyId + '|' + (c.buffIds.join('+') || 'none') +
      (c.hardRulesVersion === G.HARD_RULES_VERSION ? '|hard:' + c.hardRulesVersion : '') +
      (c.affixIds ? '|affixes:' + c.affixIds.join('+') : '') + growthSignature(growthRep, legacyUnlockRep, rerollsGranted);
  }
  function validRecord(r) {
    return r && r.cleared === true && typeof r.bestRep === 'number' && isFinite(r.bestRep) && r.bestRep >= 0;
  }
  function load(data, legacy) {
    var records = {};
    Object.keys(data && typeof data === 'object' ? data : {}).forEach(function (k) {
      var parts = k.split('|'), config = { difficultyId: parts[1], buffIds: parts[2] === 'none' ? [] : (parts[2] || '').split('+') };
      if (config.difficultyId === 'hard') {
        config.hardRulesVersion = parts.indexOf('hard:' + G.HARD_RULES_VERSION) >= 0 ? G.HARD_RULES_VERSION : 1;
        var affixPart = parts.filter(function (part) { return part.indexOf('affixes:') === 0; })[0];
        if (affixPart) config.affixIds = affixPart.slice(8).split('+');
      }
      // Only known growth profiles and canonical combinations can become record keys.
      var profiles = [0, G.REROLL_UNLOCK_REP, G.SECOND_REROLL_REP].concat(G.BLUEPRINTS.filter(function (b) { return b.unlockRep > 0; }).map(function (b) { return b.unlockRep; }));
      try {
        if (profiles.some(function (rep) { return key(parts[0], config, rep) === k; }) && validRecord(data[k]))
          records[k] = { cleared: true, bestRep: data[k].bestRep };
      } catch (e) {}
    });
    G.SCENARIOS.forEach(function (s) {
      var old = legacy && legacy[s.id], plain = key(s.id);
      if (validRecord(old) && (!records[plain] || old.bestRep > records[plain].bestRep))
        records[plain] = { cleared: true, bestRep: old.bestRep };
    });
    return records;
  }
  function record(data, state) {
    var records = load(data), f = state && state.final;
    if (!state || !state.over || !f || f.cleared !== true || f.scenarioId !== state.scenarioId ||
        !f.goal || !f.goal.cleared || typeof f.rep !== 'number' || !isFinite(f.rep) || f.rep < 0) return records;
    var k;
    try {
      k = key(state.scenarioId, state.runConfig, state.growthRep, state.legacyUnlockRep, state.rerollsGranted);
      if (key(f.scenarioId, f.runConfig, f.growthRep, f.legacyUnlockRep, f.rerollsGranted) !== k) return records;
    } catch (e) { return records; }
    if (!records[k] || f.rep > records[k].bestRep) records[k] = { cleared: true, bestRep: f.rep };
    return records;
  }
  function legacyReceipt(rep) {
    return { baseRep: rep, clearBonus: 0, firstClearBonus: 0, total: rep, scenarioId: null,
      difficultyId: null, cleared: false, rewardVersion: 0, beforeRep: null, afterRep: null };
  }
  function validReceipt(r) {
    if (!r || !amount(r.baseRep) || !amount(r.clearBonus) || !amount(r.firstClearBonus) ||
        (r.affixBonus !== undefined && !amount(r.affixBonus)) ||
        !amount(r.total) || r.total !== r.baseRep + r.clearBonus + r.firstClearBonus + (r.affixBonus || 0) ||
        typeof r.cleared !== 'boolean' || (r.rewardVersion !== 0 && r.rewardVersion !== G.REWARD_VERSION)) return false;
    if (r.rewardVersion === 0 && (r.clearBonus || r.firstClearBonus || r.affixBonus)) return false;
    if (!r.cleared && (r.clearBonus || r.firstClearBonus || r.affixBonus)) return false;
    if (r.scenarioId !== null) {
      try { firstClearKey(r.scenarioId, r.difficultyId); } catch (e) { return false; }
    } else if (r.difficultyId !== null || r.cleared) return false;
    return (r.beforeRep === null && r.afterRep === null) ||
      (amount(r.beforeRep) && amount(r.afterRep) && r.afterRep === Math.min(Number.MAX_SAFE_INTEGER, r.beforeRep + r.total));
  }
  function loadGrowth(data, legacyRecords) {
    var ledger = { version: 2, settled: {}, legacyClears: {}, legacyUnlockRep: 0 };
    if (data && (data.version === 1 || data.version === 2) && data.settled && typeof data.settled === 'object') {
      Object.keys(data.settled).forEach(function (id) {
        var r = data.settled[id];
        if (!validId(id)) return;
        if (data.version === 1 && amount(r)) ledger.settled[id] = legacyReceipt(r);
        else if (data.version === 2 && validReceipt(r)) ledger.settled[id] = JSON.parse(JSON.stringify(r));
      });
    }
    if (data && data.version === 2) {
      if (amount(data.legacyUnlockRep)) ledger.legacyUnlockRep = data.legacyUnlockRep;
      Object.keys(data.legacyClears || {}).forEach(function (k) {
        var parts = k.split('|');
        try { if (data.legacyClears[k] === true && firstClearKey(parts[0], parts[1]) === k) ledger.legacyClears[k] = true; } catch (e) {}
      });
    } else {
      // Only the first migration reads historical scores; a newly recorded clear must not consume its own reward.
      Object.keys(load(legacyRecords)).forEach(function (k) {
        var parts = k.split('|'); ledger.legacyClears[firstClearKey(parts[0], parts[1])] = true;
      });
      var oldTotal = Object.keys(ledger.settled).reduce(function (sum, id) { return Math.min(Number.MAX_SAFE_INTEGER, sum + ledger.settled[id].total); }, 0);
      ledger.legacyUnlockRep = G.legacyGrowthRep(oldTotal);
    }
    return ledger;
  }
  function totalRep(data) {
    var settled = loadGrowth(data).settled;
    return Object.keys(settled).reduce(function (sum, id) { return Math.min(Number.MAX_SAFE_INTEGER, sum + settled[id].total); }, 0);
  }
  function permissionRep(data) {
    var ledger = loadGrowth(data);
    return Math.max(totalRep(ledger), ledger.legacyUnlockRep);
  }
  function firstCleared(data, scenarioId, difficultyId) {
    var ledger = loadGrowth(data), k = firstClearKey(scenarioId, difficultyId);
    return !!ledger.legacyClears[k] || Object.keys(ledger.settled).some(function (id) {
      var r = ledger.settled[id];
      return r.rewardVersion === G.REWARD_VERSION && r.cleared && firstClearKey(r.scenarioId, r.difficultyId) === k;
    });
  }
  function rewardPreview(data, scenarioId, config) {
    var c = G.normalizeRunConfig(config), claimed = firstCleared(data, scenarioId, c.difficultyId);
    var clear = REWARDS[scenarioId].clear * (c.difficultyId === 'hard' ? 2 : 1);
    var percent = (c.affixIds || []).reduce(function (sum, id) {
      return sum + G.AFFIXES.filter(function (a) { return a.id === id; })[0].rewardPercent;
    }, 0);
    return { clearBonus: clear, affixBonus: Math.floor(clear * percent / 100), affixPercent: percent,
      firstClearBonus: claimed ? 0 : REWARDS[scenarioId].first, firstCleared: claimed };
  }
  function growthReward(data, state) {
    var ledger = loadGrowth(data), f = state && state.final;
    if (!state || !state.over || state.turn !== G.MAX_TURNS || state.growthEligible !== true || !f ||
        !validId(state.runId) || f.runId !== state.runId || f.growthRep !== state.growthRep ||
        !amount(f.rep) || f.rep !== state.rep || f.scenarioId !== state.scenarioId ||
        f.legacyUnlockRep !== state.legacyUnlockRep || f.rerollsGranted !== state.rerollsGranted ||
        f.rewardVersion !== state.rewardVersion || (state.rewardVersion !== 0 && state.rewardVersion !== G.REWARD_VERSION)) return null;
    try {
      if (JSON.stringify(G.normalizeRunConfig(f.runConfig)) !== JSON.stringify(G.normalizeRunConfig(state.runConfig))) return null;
      if (!G.runConfigStatus(state.runConfig, state.growthRep, state.legacyUnlockRep).ok) return null;
      if (state.scenarioId && G.growthStatus(state.growthRep, state.legacyUnlockRep).scenarioIds.indexOf(state.scenarioId) < 0) return null;
      if (Object.prototype.hasOwnProperty.call(ledger.settled, state.runId)) return ledger.settled[state.runId];
      var scenarioId = state.scenarioId || null, c = G.normalizeRunConfig(state.runConfig);
      if (scenarioId) { firstClearKey(scenarioId, c.difficultyId); key(scenarioId, c, state.growthRep, state.legacyUnlockRep, state.rerollsGranted); }
      if (scenarioId && (!f.goal || typeof f.cleared !== 'boolean' || f.goal.cleared !== f.cleared)) return null;
      var cleared = !!scenarioId && f.cleared === true && !!f.goal && f.goal.cleared === true && state.rewardVersion === G.REWARD_VERSION;
      var bonus = cleared ? rewardPreview(ledger, scenarioId, c) : { clearBonus: 0, firstClearBonus: 0, affixBonus: 0 };
      var before = totalRep(ledger), total = f.rep + bonus.clearBonus + bonus.firstClearBonus + bonus.affixBonus;
      if (!amount(total)) return null;
      return { baseRep: f.rep, clearBonus: bonus.clearBonus, firstClearBonus: bonus.firstClearBonus,
        affixBonus: bonus.affixBonus, total: total, scenarioId: scenarioId, difficultyId: scenarioId ? c.difficultyId : null,
        cleared: cleared, rewardVersion: state.rewardVersion, beforeRep: before,
        afterRep: Math.min(Number.MAX_SAFE_INTEGER, before + total) };
    } catch (e) { return null; }
  }
  function creditGrowth(data, state) {
    var ledger = loadGrowth(data), receipt = growthReward(ledger, state);
    if (receipt && !Object.prototype.hasOwnProperty.call(ledger.settled, state.runId)) ledger.settled[state.runId] = receipt;
    if (state && state.turn === G.MAX_TURNS && state.rewardVersion === 0 && state.final && state.final.rewardVersion === 0 &&
        state.final.rep === state.rep && Object.keys(record({}, state)).length) {
      var c = G.normalizeRunConfig(state.runConfig);
      ledger.legacyClears[firstClearKey(state.scenarioId, c.difficultyId)] = true;
    }
    return ledger;
  }
  return { key: key, load: load, record: record, loadGrowth: loadGrowth, totalRep: totalRep,
    creditGrowth: creditGrowth, growthReward: growthReward, rewardPreview: rewardPreview, firstCleared: firstCleared, permissionRep: permissionRep,
    REWARDS: JSON.parse(JSON.stringify(REWARDS)) };
});
