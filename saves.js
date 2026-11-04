/* Portable whole-progress saves. Audio preferences and cloud quota stay on this device. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game.js'), require('./progress.js'), require('./loadouts.js'));
  else root.DSHSaves = factory(root.DSHGame, root.DSHProgress, root.DSHLoadouts);
})(typeof self !== 'undefined' ? self : this, function (G, P, L) {
  'use strict';
  var MAX_BYTES = 10000000, VERSION = '3.19.0';
  var KEYS = { city: 'dsh_city_save_v34', growth: 'dsh_city_growth_v1', campaign: 'dsh_city_campaign_v2',
    legacy: 'dsh_city_campaign_v1', best: 'dsh_city_best_rep_v33', loadouts: 'dsh_city_loadouts_v1', prefs: 'dsh_city_ui_v1' };
  var META = 'dsh_city_save_meta_v1', BACKUP = 'dsh_city_manual_backup_v1', RECOVERY = 'dsh_city_restore_backup_v1', JOURNAL = 'dsh_city_restore_journal_v1';
  function fail(message) { throw new Error(message); }
  function plain(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function number(n) { return typeof n === 'number' && isFinite(n); }
  function integer(n, min, max) { return Number.isSafeInteger(n) && n >= min && n <= max; }
  function knownBuilding(id) { var d = G.buildingDef(id); return typeof id === 'string' && d && d.id === id; }
  function knownTask(id) { var d = G.taskDef(id); return typeof id === 'string' && d && d.id === id; }
  function bytes(text) {
    var size = 0;
    for (var i = 0; i < text.length; i++) { var c = text.codePointAt(i); size += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4; if (c > 65535) i++; }
    return size;
  }
  function hash(text) {
    var result = 2166136261;
    for (var i = 0; i < text.length; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619);
    return 'fnv1a32:' + ('00000000' + (result >>> 0).toString(16)).slice(-8);
  }
  function jsonSafe(value, depth) {
    if (depth > 45) fail('存档层级过深');
    if (typeof value === 'number' && !number(value)) fail('存档包含无效数值');
    if (value && typeof value === 'object') Object.keys(value).forEach(function (key) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') fail('存档包含非法字段');
      jsonSafe(value[key], depth + 1);
    });
  }
  function read(storage, key, fallback) {
    var raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  }
  function write(storage, key, text, now) {
    if (storage.getItem(key) === text) return false;
    storage.setItem(key, text);
    storage.setItem(META, JSON.stringify({ changedAt: now === undefined ? Date.now() : now }));
    return true;
  }
  function cityData(raw) {
    if (raw === null) return null;
    if (!plain(raw) || !integer(raw.turn, 1, G.MAX_TURNS) || !integer(raw.pop, 0, Number.MAX_SAFE_INTEGER) ||
        !integer(raw.money, 0, Number.MAX_SAFE_INTEGER) || !integer(raw.rep, 0, Number.MAX_SAFE_INTEGER) ||
        !integer(raw.rngState, 0, 4294967295) || !integer(raw.seed, 0, 4294967295) || !number(raw.sat) || typeof raw.hasBuilt !== 'boolean' || typeof raw.over !== 'boolean') fail('城市字段或数值无效');
    ['buildings','board','active','unlocked'].forEach(function (key) { if (!Array.isArray(raw[key])) fail('城市字段不完整'); });
    if (raw.buildings.length > G.CAP || raw.board.length > 200 || raw.active.length > 200) fail('城市数据超出合理范围');
    var ids = {};
    raw.buildings.concat(raw.board, raw.active).forEach(function (item) {
      if (!plain(item) || typeof item.uid !== 'string' || !/^[bt][1-9][0-9]*$/.test(item.uid) || ids[item.uid]) fail('城市对象标识无效');
      ids[item.uid] = true;
    });
    raw.buildings.forEach(function (b) { if (!knownBuilding(b.defId) || typeof b.active !== 'boolean') fail('建筑数据无效'); });
    raw.board.concat(raw.active).forEach(function (t) { if (!knownTask(t.defId) || !number(t.progress) || t.progress < 0 || !integer(t.spawnTurn, 1, G.MAX_TURNS) ||
      (t.acceptBy !== undefined && !integer(t.acceptBy, 1, Number.MAX_SAFE_INTEGER))) fail('任务数据无效'); });
    raw.unlocked.forEach(function (id) { if (!knownBuilding(id)) fail('蓝图数据无效'); });
    var engine = G.createInstance(), result = engine.importState(raw);
    if (!result.ok) fail(result.error);
    var city = engine.exportState();
    if (!raw.runId) city.runId = 'run-import-' + hash(JSON.stringify(raw)).slice(-8);
    if (!integer(city.townLevel, 0, G.TOWN_LEVELS.length) || !integer(city.nextUid, 1, Number.MAX_SAFE_INTEGER) ||
        !Array.isArray(city.log) || !plain(city.stats) || !plain(city.taskSupply)) fail('城市字段不完整');
    G.RES.forEach(function (r) { if (!number(city.taskSupply[r.key]) || city.taskSupply[r.key] < 0) fail('城市永久供给无效'); });
    ['tasksDone','built','popLost','townUpgrades'].forEach(function (key) { if (!integer(city.stats[key], 0, Number.MAX_SAFE_INTEGER)) fail('城市统计数据无效'); });
    if (city.log.some(function (row) { return !plain(row) || !integer(row.turn, 1, G.MAX_TURNS) || typeof row.text !== 'string' || typeof row.kind !== 'string' || !/^[a-z-]{1,24}$/.test(row.kind); })) fail('城市日志无效');
    if (!plain(city.spawnedNormals) || [1,2,3].some(function (block) { return !Array.isArray(city.spawnedNormals[block]) ||
      city.spawnedNormals[block].some(function (id) { return !knownTask(id); }); })) fail('任务刷新记录无效');
    if (!Array.isArray(city.rewardQueue) || city.rewardQueue.some(function (r) { return !plain(r) || !knownTask(r.defId) || typeof r.name !== 'string' ||
      !integer(r.money, 0, Number.MAX_SAFE_INTEGER) || !integer(r.rep, 0, Number.MAX_SAFE_INTEGER) || !integer(r.pop, 0, Number.MAX_SAFE_INTEGER) || !plain(r.sup) ||
      Object.keys(r.sup).some(function (key) { return !G.RES.some(function (res) { return res.key === key; }) || !number(r.sup[key]) || r.sup[key] < 0; }); })) fail('待领奖励数据无效');
    if (city.over) {
      var f = city.final;
      if (!plain(f) || city.turn !== G.MAX_TURNS || f.rep !== city.rep || !number(f.sat) ||
          ['pop','buildings','tasksDone','money'].some(function (key) { return !integer(f[key], 0, Number.MAX_SAFE_INTEGER); }) ||
          (f.level !== undefined && !integer(f.level, 0, G.TOWN_LEVELS.length))) fail('城市结算数据无效');
      if (city.scenarioId && (!plain(f.goal) || typeof f.goal.name !== 'string' || typeof f.goal.cleared !== 'boolean' || f.goal.cleared !== f.cleared ||
          !Array.isArray(f.goal.conditions) || f.goal.conditions.some(function (r) { return !plain(r) || typeof r.label !== 'string' || typeof r.key !== 'string' ||
            typeof r.met !== 'boolean' || !number(r.current) || !number(r.target) || !number(r.shortfall) ||
            (r.resource != null && !G.RES.some(function (res) { return res.key === r.resource; })); }))) fail('城市验收数据无效');
    }
    if (city.pendingDraw && (!Array.isArray(city.pendingDraw.options) || !integer(city.pendingDraw.count, 1, 2) ||
        city.pendingDraw.options.length < city.pendingDraw.count || city.pendingDraw.options.some(function (id) { return !knownBuilding(id); }) ||
        (city.pendingDraw.level != null && !integer(city.pendingDraw.level, 0, G.TOWN_LEVELS.length)))) fail('待选蓝图无效');
    engine.compute(); engine.forecast(); engine.goalStatus();
    return city;
  }
  function normalize(data) {
    if (!plain(data) || !plain(data.growth) || !plain(data.campaign) || !plain(data.loadouts) || !plain(data.prefs)) fail('进度字段不完整');
    if (!integer(data.best, 0, Number.MAX_SAFE_INTEGER)) fail('最佳声望无效');
    var growth = P.loadGrowth(data.growth), campaign = P.load(data.campaign), loadouts = L.load(data.loadouts), prefs = {};
    if ((data.growth.version !== 1 && data.growth.version !== 2) || !plain(data.growth.settled) ||
        Object.keys(growth.settled).length !== Object.keys(data.growth.settled).length ||
        Object.keys(campaign).length !== Object.keys(data.campaign).length) fail('成长或通关记录损坏');
    if (data.growth.legacyClears && Object.keys(growth.legacyClears).length !== Object.keys(data.growth.legacyClears).length) fail('首通记录损坏');
    if (data.loadouts.version !== 1 || !Array.isArray(data.loadouts.slots) || data.loadouts.slots.length !== 3 ||
        data.loadouts.slots.some(function (slot, i) { return slot && !loadouts.slots[i]; })) fail('BUFF 方案损坏');
    if (data.prefs.intro === 'seen') prefs.intro = 'seen';
    if (data.prefs.tutorial === 'done' || data.prefs.tutorial === 'skipped') prefs.tutorial = data.prefs.tutorial;
    var city = cityData(data.city);
    if (city && city.growthRep > P.totalRep(growth)) fail('城市成长快照与累计声望不一致');
    return { city: city, growth: growth, campaign: campaign, best: data.best, loadouts: loadouts, prefs: prefs };
  }
  function make(data, time) {
    jsonSafe(data, 0);
    var payload = { gameVersion: VERSION, savedAt: time === undefined ? Date.now() : time, data: normalize(data) };
    var result = { format: 'loop-town-save', version: 1, payload: payload, checksum: hash(JSON.stringify(payload)) };
    if (bytes(JSON.stringify(result)) > MAX_BYTES) fail('存档超过 10 MB，无法保存或上传');
    return result;
  }
  function parse(input) {
    var text = typeof input === 'string' ? input : JSON.stringify(input);
    if (!text || bytes(text) > MAX_BYTES) fail('文件为空或超过 10 MB');
    var raw;
    try { raw = JSON.parse(text); } catch (e) { fail('文件不是有效的 JSON 存档'); }
    jsonSafe(raw, 0);
    if (!plain(raw) || raw.format !== 'loop-town-save' || raw.version !== 1 || !plain(raw.payload) ||
        !integer(raw.payload.savedAt, 0, Number.MAX_SAFE_INTEGER)) fail('不是兼容的周目小镇完整存档');
    if (hash(JSON.stringify(raw.payload)) !== raw.checksum) fail('存档校验失败，文件可能已损坏');
    return make(raw.payload.data, raw.payload.savedAt);
  }
  function capture(storage, city, now) {
    var campaign = P.load(read(storage, KEYS.campaign, {}), read(storage, KEYS.legacy, {}));
    var meta = read(storage, META, {});
    return make({ city: city === undefined ? read(storage, KEYS.city, null) : city,
      growth: P.loadGrowth(read(storage, KEYS.growth, {}), campaign), campaign: campaign,
      best: Number(storage.getItem(KEYS.best) || 0), loadouts: L.load(read(storage, KEYS.loadouts, null)), prefs: read(storage, KEYS.prefs, {}) },
      meta.changedAt || (now === undefined ? Date.now() : now));
  }
  function summary(bundle) {
    var payload = bundle.payload, data = payload.data, city = data.city;
    var scenario = city && G.SCENARIOS.filter(function (s) { return s.id === city.scenarioId; })[0];
    return { savedAt: payload.savedAt, totalRep: P.totalRep(data.growth), best: data.best,
      cleared: G.SCENARIOS.filter(function (s) { return Object.keys(data.campaign).some(function (key) { return key.indexOf(s.id + '|') === 0; }); }).length,
      city: city ? (scenario ? scenario.name : '自由经营') + ' · T' + city.turn + (city.over ? ' · 已结束' : ' / ' + G.MAX_TURNS) : '暂无城市',
      pop: city ? city.pop : 0, money: city ? city.money : 0 };
  }
  function rawValues(storage) {
    var result = {};
    Object.keys(KEYS).forEach(function (key) { result[KEYS[key]] = storage.getItem(KEYS[key]); });
    result[META] = storage.getItem(META);
    return result;
  }
  function restoreRaw(storage, values) {
    var allowed = Object.keys(KEYS).map(function (key) { return KEYS[key]; }).concat(META);
    if (!plain(values) || Object.keys(values).length !== allowed.length || allowed.some(function (key) { return values[key] !== null && typeof values[key] !== 'string'; })) fail('恢复日志损坏，请保留本机备份');
    allowed.forEach(function (key) { if (values[key] === null) storage.removeItem(key); else storage.setItem(key, values[key]); });
  }
  function recover(storage) {
    var text = storage.getItem(JOURNAL);
    if (!text) return false;
    restoreRaw(storage, JSON.parse(text)); storage.removeItem(JOURNAL); return true;
  }
  function apply(storage, incoming, expectedFingerprint) {
    var bundle = parse(incoming), old = rawValues(storage), before, token;
    try { before = capture(storage); token = hash(JSON.stringify(before.payload.data)); }
    catch (e) { before = rawBackup(storage); token = 'raw:' + hash(JSON.stringify(old)); }
    if (expectedFingerprint && token !== expectedFingerprint) fail('本机进度已在其他窗口变化，请重新打开存档管理');
    storage.setItem(RECOVERY, JSON.stringify(before));
    storage.setItem(JOURNAL, JSON.stringify(old));
    try {
      var data = bundle.payload.data;
      Object.keys(KEYS).forEach(function (key) {
        if (key === 'legacy' || (key === 'city' && data.city === null)) storage.removeItem(KEYS[key]);
        else storage.setItem(KEYS[key], JSON.stringify(data[key]));
      });
      storage.setItem(META, JSON.stringify({ changedAt: bundle.payload.savedAt }));
      storage.removeItem(JOURNAL);
    } catch (e) {
      try { restoreRaw(storage, old); storage.removeItem(JOURNAL); } catch (rollbackError) {}
      fail('恢复未完成，本机原进度和恢复备份已保留；请检查存储空间后重试');
    }
    return bundle;
  }
  function rawBackup(storage) { return { format: 'loop-town-raw-backup', version: 1, createdAt: Date.now(), values: rawValues(storage) }; }
  return { capture: capture, parse: parse, make: make, summary: summary, apply: apply, recover: recover, write: write,
    bytes: bytes, rawBackup: rawBackup, rawFingerprint: function (storage) { return 'raw:' + hash(JSON.stringify(rawValues(storage))); },
    fingerprint: function (bundle) { return hash(JSON.stringify(bundle.payload.data)); },
    maxBytes: MAX_BYTES, keys: KEYS, metaKey: META, backupKey: BACKUP, recoveryKey: RECOVERY, journalKey: JOURNAL };
});
