/* Pure configuration-specific progress records. Browser storage stays in ui.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game.js'));
  else root.DSHProgress = factory(root.DSHGame);
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';
  function key(scenarioId, config) {
    if (!G.SCENARIOS.some(function (s) { return s.id === scenarioId; })) throw new Error('未知关卡');
    var c = G.normalizeRunConfig(config);
    return scenarioId + '|' + c.difficultyId + '|' + c.buffId;
  }
  function validRecord(r) {
    return r && r.cleared === true && typeof r.bestRep === 'number' && isFinite(r.bestRep) && r.bestRep >= 0;
  }
  function load(data, legacy) {
    var records = {};
    G.SCENARIOS.forEach(function (s) {
      G.DIFFICULTIES.forEach(function (d) {
        G.BUFFS.forEach(function (b) {
          var k = key(s.id, { difficultyId: d.id, buffId: b.id });
          var r = data && data[k];
          if (validRecord(r)) records[k] = { cleared: true, bestRep: r.bestRep };
        });
      });
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
      k = key(state.scenarioId, state.runConfig);
      if (key(f.scenarioId, f.runConfig) !== k) return records;
    } catch (e) { return records; }
    if (!records[k] || f.rep > records[k].bestRep) records[k] = { cleared: true, bestRep: f.rep };
    return records;
  }
  return { key: key, load: load, record: record };
});
