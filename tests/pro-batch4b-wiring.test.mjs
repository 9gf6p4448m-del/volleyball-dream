// 職業章批 4b「改叫」— UI 層（浮鈕＋子選單，2026-08-26）
// ★ 這一組守的是 UI 行為，sim 零改動（sim 那半在 tests/pro-batch4b.test.mjs）★
// 範式抄 tests/inside-cut-ui.test.mjs：直接呼叫 matchLoop.js 匯出的函式，餵一個
// 最小的 `s` 樁物件（真實 game/aiState + 假 stage），不搭整套 DOM。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, stepGame, createDefaultTeams } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, callFeasibilityOf } from '../src/sim/ai.js';
import { onAudibleTap } from '../src/app/matchLoop.js';
import { CALL_MODES, CALL_LABELS } from '../src/input/callPlay.js';

const SRC = readFileSync(new URL('../src/app/matchLoop.js', import.meta.url), 'utf8');
const STAGE_SRC = readFileSync(new URL('../src/app/matchStage.js', import.meta.url), 'utf8');

function stubStage() {
  const floatShown = [];
  const panelCalls = [];
  let hideCount = 0;
  return {
    floatShown,
    panelCalls,
    stage: {
      floatText: { show: (text, color) => floatShown.push({ text, color }) },
      audiblePanel: {
        show: (title, items, onChoose) => panelCalls.push({ title, items, onChoose }),
        hide: () => { hideCount += 1; },
      },
      get audiblePanelHideCount() { return hideCount; },
    },
  };
}

// 整場真實生涯路徑跑到「我方第二觸窗開著」的第一個 tick（同 pro-batch4b.test.mjs 的
// firstReplanWindow 範式）——不手刻假窗界，鑑別力來自真實 sim。
function firstReplanWindow(seed) {
  const g = createGame({ seed, teams: createDefaultTeams(), comboScale: 1, setTarget: 25 });
  const ai = createAiState();
  let ticks = 0;
  while (g.phase !== 'set_over' && ticks < 300000) {
    const feas = callFeasibilityOf(g, ai);
    if (feas && Object.values(feas).some((v) => v.feasible)) return { g, ai };
    stepGame(g, aiCollectIntents(g, ai));
    ticks += 1;
  }
  return null;
}

test('CALL_MODES.audible：icon/word/hint 存在，且與既有 command 不同（鈕面不能混淆兩種語意）', () => {
  const m = CALL_MODES.audible;
  assert.ok(m?.icon && m?.word && m?.hint);
  assert.notEqual(m.icon, CALL_MODES.command.icon);
  assert.notEqual(m.word, CALL_MODES.command.word);
  assert.doesNotMatch(m.word + m.hint, /[A-Za-z]{3,}/, '繁體中文，不得混英文代號');
});

test('onAudibleTap：窗關時點下去要說原因，不得靜默、不得寫 replanCall、不得開面板', () => {
  const { g, ai } = (() => {
    // 找一個窗還沒開的 tick（開局第一刻，S 尚未拿到球）幾乎必然窗關
    const game = createGame({ seed: 999, teams: createDefaultTeams(), comboScale: 1, setTarget: 25 });
    return { g: game, ai: createAiState() };
  })();
  const { floatShown, panelCalls, stage } = stubStage();
  onAudibleTap({ game: g, aiState: ai, playerId: 'A2', stage });
  assert.equal(floatShown.length, 1, '窗關時按下去沒有任何回饋＝玩家按了一顆看得見的鈕、畫面毫無反應');
  assert.equal(panelCalls.length, 0, '窗關不得開出選單');
  assert.equal(ai.replanCall, null, '窗外不得寫 replanCall（殘留會在下一波變成強制指令）');
});

test('onAudibleTap：窗開時列出的選項與 callFeasibilityOf 的可行型一致，且用 CALL_MODES.audible 的 icon', () => {
  const found = firstReplanWindow(23);
  assert.ok(found, 'fixture 前提：整場跑不到一次可行的改判窗');
  const { g, ai } = found;
  const team = ai.landingTeam;
  const nonSetterId = team === 'A' ? 'A2' : 'B2';
  const feas = callFeasibilityOf(g, ai);
  const feasibleTypes = Object.keys(feas).filter((t) => feas[t]?.feasible);
  assert.ok(feasibleTypes.length > 0, 'fixture 前提：這一刻至少有一型可叫');

  const { panelCalls, stage } = stubStage();
  onAudibleTap({ game: g, aiState: ai, playerId: nonSetterId, stage });
  assert.equal(panelCalls.length, 1, '窗開時應該開出一個選單');
  const { items } = panelCalls[0];
  assert.deepEqual(items.map((it) => it.callType).sort(), feasibleTypes.sort());
  for (const it of items) {
    assert.equal(it.label, `${CALL_MODES.audible.icon}${CALL_LABELS[it.callType]}`);
  }
});

test('onAudibleTap：選定選項後直接寫 aiState.replanCall（callerId=呼叫者本人），重用既有指令通道', () => {
  const found = firstReplanWindow(23);
  assert.ok(found);
  const { g, ai } = found;
  const team = ai.landingTeam;
  const nonSetterId = team === 'A' ? 'A2' : 'B2';
  const { panelCalls, stage } = stubStage();
  onAudibleTap({ game: g, aiState: ai, playerId: nonSetterId, stage });
  const { items, onChoose } = panelCalls[0];
  onChoose(items[0]);
  assert.deepEqual(ai.replanCall, { type: items[0].callType, callerId: nonSetterId });
});

// ════════ 結構性佈線守衛（同 inside-cut-ui.test.mjs 的 MEDIUM-3 範式）════════

test('matchStage.js：audibleButton／audiblePanel 建了就必須進 return（bquickButton 上線時漏過一次的教訓）', () => {
  assert.match(STAGE_SRC, /const audibleButton = createCallButton/);
  assert.match(STAGE_SRC, /const audiblePanel = createZonePanel/);
  const retStart = STAGE_SRC.indexOf('return {', STAGE_SRC.indexOf('const audiblePanel'));
  const retBlock = STAGE_SRC.slice(retStart, STAGE_SRC.indexOf('};', retStart));
  assert.match(retBlock, /audibleButton/, 'audibleButton 沒進 return＝鈕永遠是 undefined');
  assert.match(retBlock, /audiblePanel/, 'audiblePanel 沒進 return＝子選單永遠是 undefined');
});

test('matchLoop.js：回放分支必須在 return 之前收掉改叫鈕與子選單（同內切鈕的 MEDIUM-3 教訓）', () => {
  const i = SRC.indexOf('if (s.replay) {');
  assert.ok(i > 0);
  const branch = SRC.slice(i, SRC.indexOf('runReplayFrame(s, now, delta);', i));
  assert.match(branch, /stage\.audibleButton\??\.hide\(\)/,
    '回放分支沒有收掉改叫鈕——窗內按 🎬 之後鈕會留在畫面上而且按得到');
  assert.match(branch, /stage\.audiblePanel\??\.hide\(\)/,
    '回放分支沒有收掉改叫子選單');
});

test('matchLoop.js：改叫鈕的可見性判準吃 canAudible（不是 canCallPlay）＋排除 S 本人', () => {
  const i = SRC.indexOf('if (stage.audibleButton && !s.replay) {');
  assert.ok(i > 0, '改叫鈕的可見性管理區塊不見了');
  const block = SRC.slice(i, SRC.indexOf('\n  }', SRC.indexOf('audibleStateOf(game, s.aiState, s.playerId)', i)));
  assert.match(block, /s\.gates\.canAudible/, '改叫鈕沒有吃 canAudible 這道專屬技術閘');
  assert.doesNotMatch(block, /s\.gates\.canCallPlay/, '改叫鈕不該吃既有三入口共用的 canCallPlay');
  assert.match(block, /currentRole !== 'setter'/, '改叫鈕沒有排除 S 本人');
  assert.match(block, /audibleStateOf\(game, s\.aiState, s\.playerId\)/);
});
