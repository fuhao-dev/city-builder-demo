/* Pure configuration-specific progress records. Browser storage stays in ui.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game.js'));
  else root.DSHProgress = factory(root.DSHGame);
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';
  function growthSignature(totalRep) {
    var g = G.growthStatus(totalRep);
    var extra = g.blueprintIds.filter(function (id) { return G.buildingDef(id).unlockRep > 0; }).sort();
    return g.rerolls || extra.length ? '|growth:' + g.rerolls + ':' + extra.join('+') : '';
  }
  function key(scenarioId, config, growthRep) {
    if (!G.SCENARIOS.some(function (s) { return s.id === scenarioId; })) throw new Error('未知关卡');
    var c = G.normalizeRunConfig(config);
    return scenarioId + '|' + c.difficultyId + '|' + (c.buffIds.join('+') || 'none') + growthSignature(growthRep);
  }
  function validRecord(r) {
    return r && r.cleared === true && typeof r.bestRep === 'number' && isFinite(r.bestRep) && r.bestRep >= 0;
  }
  function load(data, legacy) {
    var records = {};
    Object.keys(data && typeof data === 'object' ? data : {}).forEach(function (k) {
      var parts = k.split('|'), config = { difficultyId: parts[1], buffIds: parts[2] === 'none' ? [] : (parts[2] || '').split('+') };
      // Only known growth profiles and canonical combinations can become record keys.
      var profiles = [0, G.REROLL_UNLOCK_REP].concat(G.BLUEPRINTS.filter(function (b) { return b.unlockRep > 0; }).map(function (b) { return b.unlockRep; }));
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
      k = key(state.scenarioId, state.runConfig, state.growthRep);
      if (key(f.scenarioId, f.runConfig, f.growthRep) !== k) return records;
    } catch (e) { return records; }
    if (!records[k] || f.rep > records[k].bestRep) records[k] = { cleared: true, bestRep: f.rep };
    return records;
  }
  function loadGrowth(data) {
    var settled = {};
    if (data && data.version === 1 && data.settled && typeof data.settled === 'object') {
      Object.keys(data.settled).forEach(function (id) {
        var rep = data.settled[id];
        if (/^run-[a-zA-Z0-9-]{8,100}$/.test(id) && Number.isSafeInteger(rep) && rep >= 0) settled[id] = rep;
      });
    }
    return { version: 1, settled: settled };
  }
  function totalRep(data) {
    var settled = loadGrowth(data).settled;
    return Object.keys(settled).reduce(function (sum, id) { return Math.min(Number.MAX_SAFE_INTEGER, sum + settled[id]); }, 0);
  }
  function creditGrowth(data, state) {
    var ledger = loadGrowth(data), f = state && state.final;
    if (!state || !state.over || state.turn !== G.MAX_TURNS || state.growthEligible !== true || !f ||
        !/^run-[a-zA-Z0-9-]{8,100}$/.test(state.runId) || f.runId !== state.runId || f.growthRep !== state.growthRep ||
        !Number.isSafeInteger(f.rep) || f.rep < 0 || f.rep !== state.rep || f.scenarioId !== state.scenarioId) return ledger;
    try {
      if (JSON.stringify(G.normalizeRunConfig(f.runConfig)) !== JSON.stringify(G.normalizeRunConfig(state.runConfig))) return ledger;
      if (Object.prototype.hasOwnProperty.call(ledger.settled, state.runId)) return ledger;
      ledger.settled[state.runId] = f.rep;
    } catch (e) {}
    return ledger;
  }
  return { key: key, load: load, record: record, loadGrowth: loadGrowth, totalRep: totalRep, creditGrowth: creditGrowth };
});
