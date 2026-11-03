/* Real practice actions, deterministic progression, and isolation from the player's city. */
const assert = require('node:assert/strict');
const Main = require('./game.js');
const O = require('./onboarding.js');
let passed = 0;
function eq(a,b) { assert.deepEqual(a,b); passed++; }
function ok(value) { assert.ok(value); passed++; }
for (const mode of ['empty','normal','hard','over']) {
  const main = Main.createInstance();
  if (mode !== 'empty') {
    main.newGame(27, 'town', mode === 'hard' ? {difficultyId:'hard',affixIds:['idle','rations']} : undefined, 2500);
    main.chooseBlueprint(main.getState().pendingDraw.options[0]);
    if (mode === 'over') { for (let i=0; i<30; i++) ok(main.endTurn().ok); }
    else { ok(main.build('farm').ok); ok(main.endTurn().ok); }
  }
  const before = main.exportState();
  const t = O.create(main), g = t.game;
  eq(t.step().id,'welcome'); eq(t.allows('next'),false); eq(t.allows('build','farm'),false);
  t.acknowledge(); eq(t.step().id,'blueprint'); eq(t.allows('pick'),true); eq(t.allows('accept','t1'),false);
  ok(g.chooseBlueprint(g.getState().pendingDraw.options[0]).ok);
  eq(t.step().id,'build'); eq(t.allows('build','farm'),true); eq(t.allows('build','school'),false);
  ok(g.build('farm').ok); eq(t.step().id,'accept');
  const reclaim = g.getState().board.find(t=>t.defId==='reclaim');
  eq(t.allows('accept',reclaim.uid),true); eq(t.allows('accept','t3'),false);
  ok(g.acceptTask(reclaim.uid).ok); eq(t.step().id,'turn');
  eq(t.allows('build','farm'),false); eq(t.allows('upgrade'),false);
  for (let i=0;i<3;i++) { eq(t.allows('next'),true); ok(g.endTurn().ok); }
  eq(t.step().id,'reward'); eq(t.allows('next'),false); eq(t.allows('reward','pop'),true); eq(t.allows('reward','sup'),false);
  ok(g.chooseReward('pop').ok); eq(t.step().id,'upgrade'); eq(g.getState().pop,8);
  eq(t.allows('upgrade'),true); ok(g.upgradeTown().ok); eq(t.step().id,'town-blueprints');
  eq(g.getState().pendingDraw.count,2); ok(g.chooseBlueprints(g.getState().pendingDraw.options.slice(0,2)).ok);
  eq(t.step().id,'done'); eq(t.step().index,t.step().total); eq(t.allows('next'),false);
  eq(main.exportState(),before);
  // A replay starts fresh and cannot affect either the original city or a previous practice city.
  const practiceBefore=g.exportState(), again=O.create(main);
  eq(again.step().id,'welcome'); eq(again.game.getState().turn,1);
  eq(g.exportState(),practiceBefore); eq(main.exportState(),before);
  // A city saved after a tutorial must still round-trip without changed RNG, config or receipts.
  if (before) { const restored=Main.createInstance(); ok(restored.importState(main.exportState()).ok); eq(restored.exportState(),before); }
}
console.log('PASS '+passed+' onboarding assertions: full practice, replay and main-city isolation');
