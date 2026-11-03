/* Pure BUFF presets and scenario guidance. Storage and rendering stay in ui.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game.js'));
  else root.DSHLoadouts = factory(root.DSHGame);
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';
  var SLOT_COUNT = 3;
  var NAME_LIMIT = 16;
  function slotIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= SLOT_COUNT) throw new Error('未知方案槽位');
  }
  function nameFor(name, index) {
    var text = typeof name === 'string' ? Array.from(name.replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, NAME_LIMIT).join('') : '';
    return text || '方案 ' + (index + 1);
  }
  function load(data) {
    var result = { version: 1, slots: [null, null, null] };
    if (!data || data.version !== 1 || !Array.isArray(data.slots)) return result;
    result.slots = result.slots.map(function (_, index) {
      var slot = data.slots[index];
      if (!slot || typeof slot !== 'object' || !Array.isArray(slot.buffIds)) return null;
      try { return { name: nameFor(slot.name, index), buffIds: G.normalizeRunConfig({ buffIds: slot.buffIds }).buffIds }; }
      catch (e) { return null; }
    });
    return result;
  }
  function save(data, index, name, buffIds) {
    slotIndex(index);
    if (!Array.isArray(buffIds)) throw new Error('BUFF 组合格式无效');
    var config = G.normalizeRunConfig({ buffIds: buffIds }), result = load(data);
    result.slots[index] = { name: nameFor(name, index), buffIds: config.buffIds };
    return result;
  }
  function status(slot, difficultyId, totalRep, legacyUnlockRep) {
    if (!slot) return { ok: false, error: '尚未保存方案' };
    if (!Array.isArray(slot.buffIds)) return { ok: false, error: 'BUFF 组合格式无效' };
    return G.runConfigStatus({ difficultyId: difficultyId, buffIds: slot.buffIds }, totalRep, legacyUnlockRep);
  }
  function apply(slot, difficultyId, totalRep, legacyUnlockRep) {
    var check = status(slot, difficultyId, totalRep, legacyUnlockRep);
    if (!check.ok) throw new Error(check.error);
    return G.normalizeRunConfig({ difficultyId: difficultyId, buffIds: slot.buffIds });
  }
  var FOCUS = {
    town: '先补齐基础供给，再接纳人口；人口增加也会增加需求。',
    agriculture: '食物要在城市和任务需求之外留足余量，扩张前先增加供给。',
    education: '教育生产需要电力和水，先配好基础投入，再扩大学校产出。',
    industry: '原料和电力分别验收，某项富余不能抵消另一项缺口。',
    health: '药品余量与满意度都要达标，制药投入和其他民生也需要配套。',
    metropolis: '扩大人口前补齐基础供给，避免人口需求挤掉四项基础余量。',
    logistics: '食物和原料要同时留有余量，可用供给援助减少前期配套压力。',
    manufacturing: '衣服和家具双产业都耗基础资源，先补原料、电力与水。',
    research: '教育和电力同时验收，教育扩产后仍需保留足够电力。',
    resilience: '八项资源分别验收，后期及时减少任务占用并调配建筑劳力。',
    care: '四项高级民生都需余量，优先配套基础投入，人口达标后避免盲目扩张。',
    capital: '在 24 座内平衡人口、基础余量和医教，混合蓝图有助节省劳力与建筑位。'
  };
  var COMMON = [['blueprint_pack','civic_support'],
    ['blueprint_pack','material_aid','water_saving'], ['blueprint_pack','preparation'], ['preparation','water_saving'], ['food_aid'], []];
  var SUPPLY = [['civic_support','food_aid','material_aid'], ['food_aid','material_aid','power_aid'],
    ['food_aid','material_aid'], ['food_aid'], []];
  var CANDIDATES = {
    agriculture: SUPPLY, logistics: SUPPLY,
    manufacturing: COMMON, research: COMMON, resilience: SUPPLY,
    care: [['civic_support','food_aid','material_aid'], ['civic_support','power_aid','water_saving'],
      ['food_aid','material_aid','preparation','water_saving'], ['material_aid','food_aid'], ['food_aid'], []],
    capital: [['settlers','food_aid','material_aid'], ['blueprint_pack','power_aid','water_saving'],
      ['blueprint_pack','preparation'], ['preparation','water_saving'], []]
  };
  function recommendation(scenarioId, difficultyId, totalRep, legacyUnlockRep) {
    if (!Object.prototype.hasOwnProperty.call(FOCUS, scenarioId)) throw new Error('未知关卡');
    var growth = G.growthStatus(totalRep, legacyUnlockRep);
    if (growth.scenarioIds.indexOf(scenarioId) < 0) return null;
    var choices = CANDIDATES[scenarioId] || COMMON;
    if (difficultyId === 'hard') {
      if (scenarioId === 'resilience') choices = [['civic_support','material_aid','power_aid'], ['civic_support','material_aid','preparation'], ['blueprint_pack','settlers','preparation']].concat(choices);
      if (scenarioId === 'care') choices = [['civic_support','material_aid','power_aid'], ['civic_support','blueprint_pack'], ['food_aid','material_aid','preparation','water_saving']].concat(choices);
      if (scenarioId === 'capital') choices = [['civic_support','material_aid','power_aid'], ['civic_support','material_aid','water_saving'], ['food_aid','material_aid','preparation','water_saving']].concat(choices);
    }
    var buffs = choices.filter(function (ids) { return G.runConfigStatus({ difficultyId: difficultyId, buffIds: ids }, totalRep, legacyUnlockRep).ok; })[0];
    if (!buffs) throw new Error('未知难度');
    var config = G.normalizeRunConfig({ difficultyId: difficultyId, buffIds: buffs });
    return { focus: FOCUS[scenarioId], buffIds: config.buffIds,
      cost: G.runConfigStatus(config, totalRep, legacyUnlockRep).cost };
  }
  return { SLOT_COUNT: SLOT_COUNT, NAME_LIMIT: NAME_LIMIT, load: load, save: save, status: status,
    apply: apply, recommendation: recommendation };
});
