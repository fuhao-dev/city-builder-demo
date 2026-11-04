/* An isolated practice city. No storage, campaign records or growth rewards. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DSHOnboarding = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var STORY = [
    { id: 'arrival', chapter: '抵达 · 周目小镇', title: '小镇，等你开工',
      text: '新任镇长，欢迎！大家攒下了一块空地和一份建设计划，等你把这里变成能安稳生活的小镇。' },
    { id: 'commission', chapter: '委托 · 建设计划', title: '交出你的建设答卷',
      text: '每个关卡都有自己的建设目标。用 {turns} 回合安排建设、补足供给；终局验收时全部达标，才算通关。' },
    { id: 'practice', chapter: '启程 · 上岗练习', title: '这次，我们一起开工',
      text: '先跟我练一遍：选蓝图、建农场、做任务，再为小镇迎来新居民。练习独立进行，放心试试吧！' }
  ];
  function shouldShowStory(prefs, hasProgress) {
    prefs = prefs || {};
    return prefs.intro !== 'seen' && prefs.tutorial !== 'done' && prefs.tutorial !== 'skipped' && !hasProgress;
  }
  var STEPS = [
    { id: 'welcome', title: '先看建设目标', text: '安居小镇需要人口 9、满意度 20。正式对局在第 30 回合验收；这次只练习基本操作。', target: 'goal' },
    { id: 'blueprint', title: '选择一张蓝图', text: '选你喜欢的一张。蓝图解锁建筑类型，之后仍需花钱建造。', target: 'modal' },
    { id: 'build', title: '建造第一座农场', text: '点击农场查看预览，再确认建造。每回合可建造或升级一次；建好后食物余量会增加。', target: 'build' },
    { id: 'accept', title: '接取「开垦」任务', text: '先看占用后的余量和预计满意度，再点击接取。任务会临时占用资源，不会直接扣金钱。', target: 'tasks' },
    { id: 'turn', title: '让任务推进', text: '连续推进 3 个回合，观察「开垦」的进度。正式游玩时，每回合先考虑建设，再结束回合。', target: 'tasks' },
    { id: 'reward', title: '选择人口奖励', text: '这次选择「人口 +3」。人口提供劳力，也增加需求；资源奖励则永久增加供给。两种奖励都有金钱与声望。', target: 'modal' },
    { id: 'upgrade', title: '升级城镇，获得蓝图', text: '人口已达到 6，可以免费升级城镇。升级使用本回合的建造行动，获得一次 5 选 2 蓝图。', target: 'build' },
    { id: 'town-blueprints', title: '选两张新蓝图', text: '勾选任意两张，再确认选择。正式对局中，继续补足供给、完成任务，保持目标直到终局。', target: 'modal' },
    { id: 'done', title: '准备好建设自己的城市了', text: '你已完成基本操作。优先补足基础供给，接任务前看预测；完成 30 回合后，声望将积累到局外成长。', target: 'goal' }
  ];
  function create(mainGame) {
    var game = mainGame.createInstance(), acknowledged = false;
    game.newGame(3160, 'town', { difficultyId: 'normal', buffIds: [] }, 0, 0);
    function index() {
      var s = game.getState();
      if (!acknowledged) return 0;
      if (!s.unlocked.length) return 1;
      if (!s.buildings.some(function (b) { return b.defId === 'farm'; })) return 2;
      if (!s.active.length && !s.stats.tasksDone) return 3;
      if (!s.stats.tasksDone) return 4;
      if (s.rewardQueue.length) return 5;
      if (!s.townLevel) return 6;
      return s.pendingDraw ? 7 : 8;
    }
    return {
      game: game,
      step: function () { var i = index(); return Object.assign({ index: i, total: 8 }, STEPS[i]); },
      acknowledge: function () { acknowledged = true; },
      allows: function (action, value) {
        var i = index(), s = game.getState();
        if (action === 'pick') return i === 1 || i === 7;
        if (action === 'build') return i === 2 && value === 'farm';
        if (action === 'accept') return i === 3 && s.board.some(function (t) { return t.uid === value && t.defId === 'reclaim'; });
        if (action === 'next') return i === 4;
        if (action === 'reward') return i === 5 && value === 'pop';
        if (action === 'upgrade') return i === 6;
        return false;
      }
    };
  }
  return { create: create, story: function () { return STORY.map(function (s) { return Object.assign({}, s); }); }, shouldShowStory: shouldShowStory };
});
