// 即時 highlight 重播 批3（acceptance-netduel-batch3.md，2026-08-27）
// 判定層純函式直測（零 DOM／three）＋導播腳本時間軸反函式＋跳過路徑的假 stage 直測。
//
// HR-7 突變實測紀錄（**真的做過**，2026-08-27，各只改一行、跑完還原）：
//   ①拿掉關鍵分限定：`highlightReplay.js` 的
//     `} else if (keyPoint && isHeavySpikeKill({ reason, winner, lastTouch })) {`
//     改成 `} else if (isHeavySpikeKill({ reason, winner, lastTouch })) {`
//     → 單跑本檔 **2 條紅**：
//       ·「重扣直接得分＋非關鍵分＝不播（HR-2b 的關鍵分限定）」（普通重扣冒出全版）
//       ·「重扣得分：吊球（低力度）不算重扣，關鍵分也不播」的非關鍵分那條連帶
//     還原後全綠。（等價形式 `} else if (false || isHeavySpikeKill(...))` 另跑一次，同樣 2 紅）
//   ②對面得分改播全版：同檔 `const mode = mine ? 'full' : 'short';`
//     改成 `const mode = 'full';`
//     → 單跑本檔 **2 條紅**：
//       ·「HR-3 全短版：我方得分＝全版尾段、對面得分＝短版尾段」
//       ·「HR-3 短版真的比全版短、且兩者皆 >0」（對面那顆 tailMs 變成 FULL）
//     還原後全綠。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planHighlightReplay, isHeavySpikeKill,
  HIGHLIGHT_FULL_MS, HIGHLIGHT_SHORT_MS, HIGHLIGHT_CAPTION, HIGHLIGHT_ICON,
} from '../src/ui/highlightReplay.js';
import { HEAVY_SPIKE_POWER_MIN } from '../src/ui/receiveJuice.js';
import { SIG_FULL_MS } from '../src/ui/signatureBeats.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { createRallyRecorder, createRallyPlayer, isPlayableTape } from '../src/app/rallyTape.js';
import {
  buildDirectorScript, stepAt, stepAtExact, tAtStep, SLOW_SPEED,
} from '../src/render/replayDirector.js';
import {
  endHighlightReplay, startHighlightReplay, runHighlightFrame,
} from '../src/app/matchLoop.js';
import { readFileSync } from 'node:fs';

const MY = 'A';
const heavySpike = (team) => ({ team, playerId: `${team}4`, kind: 'spike', power: 0.95 });
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
// 註解不是程式碼：斷言「原始碼裡不得出現某字串」時要先剝掉註解，否則本檔自己的
// 說明文字（例如「不得另抄 0.7」這句話本身）會把斷言變成恆假
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
// 取一個頂層函式的原文（結尾＝欄 0 的右大括號）——按名字切，不靠下一個註解橫幅
function fnBody(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, `找不到 ${header}`);
  const end = src.indexOf('\n}\n', i);
  assert.ok(end > i, `${header} 沒有找到函式結尾`);
  return src.slice(i, end + 3);
}

// ---- HR-2 觸發限定 ----

test('HR-2a 網口對決：qualify 出 tool／stuff 的 SCORE 一律重播（不限關鍵分）', () => {
  for (const outcome of ['tool', 'stuff']) {
    const plan = planHighlightReplay({
      duelOutcome: outcome, winner: MY, myTeam: MY, keyPoint: false,
    });
    assert.ok(plan, `${outcome} 應觸發重播`);
    assert.equal(plan.kind, 'netduel');
    assert.equal(plan.outcome, outcome);
  }
});

test('HR-2a 網口對決：未 qualify（outcome 缺）＝不播——普通得分不得冒領重播', () => {
  assert.equal(planHighlightReplay({ duelOutcome: null, winner: MY, myTeam: MY }), null);
  assert.equal(planHighlightReplay({ duelOutcome: 'whatever', winner: MY, myTeam: MY }), null);
});

test('HR-2b 重扣直接得分＋關鍵分＝播；★非關鍵分＝不播★（關鍵分限定）', () => {
  const base = {
    reason: 'BALL_IN', lastTouch: heavySpike(MY), winner: MY, myTeam: MY,
  };
  const clutch = planHighlightReplay({ ...base, keyPoint: true });
  assert.ok(clutch, '關鍵分重扣得分應重播');
  assert.equal(clutch.kind, 'spike');
  assert.equal(planHighlightReplay({ ...base, keyPoint: false }), null,
    '普通重扣得分不重播——一場太多次（HR-2b）');
});

test('HR-2b 重扣得分：吊球（低力度）不算重扣，關鍵分也不播；門檻吃 receiveJuice 單一來源', () => {
  const mk = (power, keyPoint) => planHighlightReplay({
    reason: 'BALL_IN', winner: MY, myTeam: MY, keyPoint,
    lastTouch: { team: MY, playerId: 'A4', kind: 'spike', power },
  });
  assert.equal(mk(HEAVY_SPIKE_POWER_MIN - 0.01, true), null, '低於重扣門檻＝吊球，不播');
  assert.ok(mk(HEAVY_SPIKE_POWER_MIN, true), '恰達門檻＝重扣');
  assert.equal(mk(HEAVY_SPIKE_POWER_MIN, false), null, '非關鍵分照樣不播');
  // 單一來源：不得在 highlightReplay.js 內另抄一份 0.7 字面
  const src = read('../src/ui/highlightReplay.js');
  assert.match(src, /import \{ HEAVY_SPIKE_POWER_MIN \} from '\.\/receiveJuice\.js'/,
    '重扣門檻必須 import 既有單一來源');
  assert.doesNotMatch(codeOnly(src), /0\.7\b/, '不得另抄 0.7 字面');
});

test('HR-2b 非扣殺得分一律不播（發球直得／處理失誤／出界／犯規）', () => {
  const key = { winner: MY, myTeam: MY, keyPoint: true };
  assert.equal(planHighlightReplay({
    ...key, reason: 'BALL_IN', lastTouch: { team: MY, playerId: 'A1', kind: 'serve' },
  }), null, 'ACE 不走這道');
  assert.equal(planHighlightReplay({
    ...key, reason: 'BALL_IN', lastTouch: heavySpike('B'),
  }), null, '對手把球處理進自家半場＝處理失誤，不是扣死');
  assert.equal(planHighlightReplay({
    ...key, reason: 'OUT', lastTouch: heavySpike('B'),
  }), null, '對方扣出界＝我方得分但沒有那一下可看');
  assert.equal(planHighlightReplay({
    ...key, reason: 'FOUR_HITS', lastTouch: heavySpike(MY),
  }), null, '犯規得分不播');
});

test('演出全關（pref=off）：兩種觸發都不播——省演出，真值字卡另有通道', () => {
  assert.equal(planHighlightReplay({
    duelOutcome: 'stuff', winner: MY, myTeam: MY, pref: 'off',
  }), null);
  assert.equal(planHighlightReplay({
    reason: 'BALL_IN', lastTouch: heavySpike(MY), winner: MY, myTeam: MY,
    keyPoint: true, pref: 'off',
  }), null);
});

test('isHeavySpikeKill：定性本身可單獨直測（壞資料不炸）', () => {
  assert.equal(isHeavySpikeKill(), false);
  assert.equal(isHeavySpikeKill({ reason: 'BALL_IN', winner: MY, lastTouch: null }), false);
  assert.equal(isHeavySpikeKill({
    reason: 'BALL_IN', winner: MY, lastTouch: { team: MY, kind: 'spike' },
  }), true, 'power 缺席＝視為全力（沿既有 pointBanner 慣例）');
});

// ---- HR-3 全短版 ----

test('★HR-3★ 全短版：我方得分＝全版尾段、對面得分＝短版尾段（只由我方/對面決定）', () => {
  const mineDuel = planHighlightReplay({ duelOutcome: 'stuff', winner: MY, myTeam: MY });
  const theirDuel = planHighlightReplay({ duelOutcome: 'stuff', winner: 'B', myTeam: MY });
  assert.equal(mineDuel.mode, 'full');
  assert.equal(mineDuel.tailMs, HIGHLIGHT_FULL_MS);
  assert.equal(theirDuel.mode, 'short');
  assert.equal(theirDuel.tailMs, HIGHLIGHT_SHORT_MS);
  // 對面得分逢關鍵分也不放大（kickoff 拍板 1：看見自己怎麼輸的，但不逗留）
  const theirClutch = planHighlightReplay({
    duelOutcome: 'tool', winner: 'B', myTeam: MY, keyPoint: true,
  });
  assert.equal(theirClutch.mode, 'short', '對面得手就算逢關鍵分也是短版');
  // 對面的關鍵分重扣（HR-2b 也涵蓋對面）同樣短版
  const theirSpike = planHighlightReplay({
    reason: 'BALL_IN', lastTouch: heavySpike('B'), winner: 'B', myTeam: MY, keyPoint: true,
  });
  assert.equal(theirSpike.mode, 'short');
});

test('★HR-3★ 短版真的比全版短、且兩者皆 >0', () => {
  assert.ok(HIGHLIGHT_SHORT_MS > 0, '短版時長必須 >0');
  assert.ok(HIGHLIGHT_FULL_MS > 0, '全版時長必須 >0');
  assert.ok(HIGHLIGHT_SHORT_MS < HIGHLIGHT_FULL_MS, '短版必須真的比全版短');
  const mine = planHighlightReplay({ duelOutcome: 'tool', winner: MY, myTeam: MY });
  const theirs = planHighlightReplay({ duelOutcome: 'tool', winner: 'B', myTeam: MY });
  assert.ok(theirs.tailMs < mine.tailMs, '實際發出的計畫也要短版短於全版');
  assert.ok(theirs.tailMs > 0);
});

test('HR-3：批1 的 seenSignature 頻率經濟對重播不適用（同一種得分連播兩次不縮水）', () => {
  const a = planHighlightReplay({ duelOutcome: 'stuff', winner: MY, myTeam: MY });
  const b = planHighlightReplay({ duelOutcome: 'stuff', winner: MY, myTeam: MY });
  assert.deepEqual(a, b, '重播不吃「看過了」——每次是不同的一顆球');
});

// ---- HR-4 字卡 ----

test('★HR-4★ 字卡標明得分方式：打手出界／攔網蓋死／關鍵分（繁中）', () => {
  assert.equal(
    planHighlightReplay({ duelOutcome: 'tool', winner: MY, myTeam: MY }).caption,
    '打手出界！',
  );
  assert.equal(
    planHighlightReplay({ duelOutcome: 'stuff', winner: MY, myTeam: MY }).caption,
    '攔網蓋死！',
  );
  assert.equal(
    planHighlightReplay({
      reason: 'BALL_IN', lastTouch: heavySpike(MY), winner: MY, myTeam: MY, keyPoint: true,
    }).caption,
    '關鍵分！',
  );
  // 網口對決逢關鍵分＝兩件事都講（前綴組合，不另開文案）
  assert.equal(
    planHighlightReplay({
      duelOutcome: 'stuff', winner: MY, myTeam: MY, keyPoint: true,
    }).caption,
    '關鍵分！攔網蓋死！',
  );
  for (const v of Object.values(HIGHLIGHT_CAPTION)) {
    assert.match(v, /[一-鿿]/, `字卡必須是中文：${v}`);
    assert.doesNotMatch(v, /[A-Za-z]/, `字卡不得夾英文：${v}`);
  }
  for (const plan of [
    planHighlightReplay({ duelOutcome: 'tool', winner: MY, myTeam: MY }),
    planHighlightReplay({ duelOutcome: 'stuff', winner: MY, myTeam: MY }),
    planHighlightReplay({
      reason: 'BALL_IN', lastTouch: heavySpike(MY), winner: MY, myTeam: MY, keyPoint: true,
    }),
  ]) {
    assert.ok(plan.caption.length > 0, '每個會播的計畫都要有字卡');
    assert.ok(Object.values(HIGHLIGHT_ICON).includes(plan.icon), '字卡圖示必須有值');
  }
});

test('HR-4 字卡壽命＝重播長度：pointBanner 吃 holdMs（跳過時另行 hide）', () => {
  const banner = readFileSync(new URL('../src/ui/pointBanner.js', import.meta.url), 'utf8');
  assert.match(banner, /show\(info, \{ holdMs = DEFAULT_HOLD_MS \} = \{\}\)/,
    'pointBanner 必須支援 holdMs（沿既有通道，不新造 DOM 系統）');
  const loop = readFileSync(new URL('../src/app/matchLoop.js', import.meta.url), 'utf8');
  assert.match(loop, /holdMs: Math\.round\(\(1 - t0\) \* script\.totalMs\)/,
    '字卡壽命必須綁重播實際長度，不得寫死');
});

// ---- HR-5 可跳過＋安全 ----

function fakeStage() {
  const calls = [];
  const rig = {};
  for (const k of ['setSigBeat', 'setSetScan', 'setPlayerId', 'setBenchMode', 'setDiveCam',
    'setAttackView', 'setDefendView', 'setHuddleView', 'setSpikeMine']) {
    rig[k] = (v) => calls.push([k, v ?? null]);
  }
  return {
    calls,
    rig,
    pointBanner: { show: () => calls.push(['show']), hide: () => calls.push(['hide']) },
  };
}

test('★HR-5★ 跳過：一鍵立即回現場（s.replay 清空、字卡收掉、鏡頭錨還給受控者）', () => {
  const stage = fakeStage();
  const s = { stage, controlledId: 'A4', replay: { player: {}, acc: 0, highlight: { plan: {} } } };
  assert.equal(endHighlightReplay(s), true, '有 highlight 在播＝這次跳過由它接手');
  assert.equal(s.replay, null, '回現場：sim 只是被凍結，清掉 replay 就繼續跑發球流程');
  assert.ok(stage.calls.some(([k]) => k === 'hide'), '字卡必須跟著收（HR-4「重播結束消失」）');
  assert.deepEqual(stage.calls.find(([k]) => k === 'setPlayerId'), ['setPlayerId', 'A4']);
  assert.deepEqual(stage.calls.find(([k]) => k === 'setSigBeat'), ['setSigBeat', null]);
});

test('★HR-5★ 互斥：沒有 highlight 在播時 endHighlightReplay 不作為（手動 🎬／情蒐帶不被吃掉）', () => {
  const stage = fakeStage();
  const manual = { player: {}, acc: 0 };
  const s = { stage, controlledId: 'A4', replay: manual };
  assert.equal(endHighlightReplay(s), false, '手動回放不歸這條路管');
  assert.equal(s.replay, manual, '手動回放不得被跳過通道清掉');
  const tape = { player: {}, acc: 0, tape: true };
  const s2 = { stage, controlledId: 'A4', replay: tape };
  assert.equal(endHighlightReplay(s2), false);
  assert.equal(s2.replay, tape, '情蒐帶不得被吃掉');
  const s3 = { stage, controlledId: 'A4', replay: null };
  assert.equal(endHighlightReplay(s3), false);
  assert.equal(stage.calls.length, 0, '沒得收就什麼都不做（不誤收現場鏡頭）');
});

test('★HR-5★ 安全：tape 不可播／已在播＝靜默跳過（起播端兩道守門）', () => {
  const loop = readFileSync(new URL('../src/app/matchLoop.js', import.meta.url), 'utf8');
  const fn = loop.slice(loop.indexOf('function startHighlightReplay'));
  assert.match(fn.slice(0, 900), /if \(!isPlayableTape\(rec\) \|\| s\.replay\) return;/,
    '不可播的卷與「已經在播」都必須在建重演器之前就擋掉');
  // isPlayableTape 對三種壞卷都回 false（起播端據此靜默跳過）
  assert.equal(isPlayableTape(null), false);
  assert.equal(isPlayableTape({ snapshot: null, steps: [] }), false);
  assert.equal(isPlayableTape({ snapshot: {}, steps: [] }), false);
});

test('HR-5 重播結束必回發球流程：收尾只清 s.replay，不碰 sim（凍結期間 game 沒被推進）', () => {
  const loop = readFileSync(new URL('../src/app/matchLoop.js', import.meta.url), 'utf8');
  const fn = loop.slice(loop.indexOf('export function endHighlightReplay'),
    loop.indexOf('function runHighlightFrame'));
  assert.doesNotMatch(fn, /stepGame|s\.game\s*=|s\.accumulator/,
    '收尾不得動 sim——凍結解除後比賽自然接回發球相位');
  assert.match(fn, /s\.replay = null/);
});

// ---- HR-6 運鏡＝重用 replayDirector 腳本 ----

test('★HR-6★ 重播運鏡吃導播腳本，不用固定俯視；固定俯視只留給手動🎬/情蒐帶', () => {
  const loop = read('../src/app/matchLoop.js');
  const hl = fnBody(loop, 'function runHighlightFrame');
  assert.doesNotMatch(hl, /camera\.position\.set\(0, 12, 12\.5\)/,
    'highlight 幀不得用既有固定俯視');
  assert.match(hl, /shotAt\(hl\.script, player\.index\)/, '構圖切換必須由腳本決定');
  assert.match(hl, /stage\.rig\.setSigBeat\(shot\.cam\.mode === 'sig' \? shot\.cam\.sig : null\)/);
  assert.match(hl, /stage\.rig\.update\(st, alpha, delta\)/, '沿 rig 使用慣例，不自己算鏡位');
  // 手動回放那條路一格不動
  assert.match(fnBody(loop, 'function runReplayFrame'),
    /ctx\.camera\.position\.set\(0, 12, 12\.5\)/, '手動🎬/情蒐帶的固定俯視保留');
});

test('★HR-6 追記之二★ 只重用運鏡，不帶結算頁的回憶感後製（濾鏡/暗場/霧/地板換色）', () => {
  // ① 導播腳本回傳的是純鏡頭宣告：逐欄位檢查，沒有任何色彩/光影/材質欄位——
  //    所以「重用腳本」在建構上就帶不進後製（拿真球的腳本驗，不是看原始碼字串）
  const game = createGame({ seed: 3, setTarget: 25 });
  const ai = createAiState();
  const tape = playOneRally(game, ai);
  assert.ok(isPlayableTape(tape));
  const script = buildDirectorScript(tape);
  assert.deepEqual(Object.keys(script).sort(),
    ['dead', 'segments', 'shots', 'skipTo', 'totalMs', 'totalSteps', 'touches'].sort());
  const CAM_FIELDS = ['mode', 'anchorId', 'sig', 'pullback', 'slow'];
  for (const sh of script.shots) {
    for (const k of Object.keys(sh.cam)) {
      assert.ok(CAM_FIELDS.includes(k), `腳本鏡頭欄位只能是運鏡，出現 ${k}`);
    }
    for (const k of Object.keys(sh.cam.sig ?? {})) {
      assert.ok(['kind', 'focusId', 'mateId', 'at'].includes(k), `sig 欄位只能是構圖，出現 ${k}`);
    }
  }
  // ② 後製確實住在 replayStage 自己的舞台層（比賽內不共用那條路）
  const stageSrc = read('../src/render/replayStage.js');
  for (const fx of ['scene.fog', 'setFloorPalette', 'HemisphereLight', 'SpotLight']) {
    assert.ok(stageSrc.includes(fx), `${fx} 應在 replayStage 的舞台層`);
  }
  // ③ 比賽內重播不 import replayStage、highlight 幀不碰場景/光影/材質
  const loop = read('../src/app/matchLoop.js');
  assert.doesNotMatch(codeOnly(loop), /replayStage|createReplayStage/,
    'matchLoop 不得把主賽場切去結算頁那套舞台（註解可以提它，程式碼不行）');
  const hl = fnBody(loop, 'function runHighlightFrame');
  assert.doesNotMatch(hl, /fog|SpotLight|HemisphereLight|setFloorPalette|scene\.background|material/,
    'highlight 幀不得動場地/顏色/光影——現場原樣渲染');
});

test('HR-6 tAtStep：stepAtExact 的反函式（分段速率換算，round-trip 對得回去）', () => {
  const script = {
    totalSteps: 300,
    segments: [
      { from: 0, to: 20, speed: 2.5 },
      { from: 20, to: 190, speed: 1 },
      { from: 190, to: 300, speed: SLOW_SPEED },
    ],
  };
  script.totalMs = script.segments.reduce(
    (ms, s) => ms + ((s.to - s.from) * (1 / 60) * 1000) / s.speed, 0,
  );
  assert.equal(tAtStep(script, 0), 0);
  assert.ok(Math.abs(tAtStep(script, 300) - 1) < 1e-9);
  for (const step of [20, 100, 190, 240]) {
    // 浮點：stepAtExact 逐段累減會落在 step−1e-13，取整前先比實數
    assert.ok(Math.abs(stepAtExact(script, tAtStep(script, step)) - step) < 1e-6,
      `step ${step} 應 round-trip，實得 ${stepAtExact(script, tAtStep(script, step))}`);
  }
  // 慢動作段吃掉大半演出時間——拿 step/totalSteps 當 t 會差很遠（本函式存在的理由）
  assert.ok(tAtStep(script, 190) < 190 / 300,
    '190/300＝0.633，但演出時間軸上決定性一拍其實更早');
  assert.equal(tAtStep({ totalMs: 0, segments: [] }, 5), 0, '空腳本不炸');
});

// ---- HR-6 端到端：真的用真球的卷跑導播腳本，起點含得到決定性一拍 ----

function playOneRally(game, ai) {
  const rec = createRallyRecorder();
  for (let guard = 0; guard < 20000; guard += 1) {
    if (game.phase === 'serve') rec.begin(game, ai);
    rec.step(game, ai, null, []);
    const events = stepGame(game, [...aiCollectIntents(game, ai, [])]);
    if (events.some((e) => e.type === 'DEAD_BALL')) break;
  }
  return rec.end();
}

test('★HR-6 端到端★ 真球的卷：全版起點＝決定性一拍（含得到那一下），短版更晚起、更短', () => {
  const game = createGame({ seed: 7, setTarget: 25 });
  const ai = createAiState();
  let checked = 0;
  for (let r = 0; r < 5; r += 1) {
    const tape = playOneRally(game, ai);
    if (!isPlayableTape(tape)) continue;
    const script = buildDirectorScript(tape);
    const decisive = script.shots.find((sh) => sh.cam.slow);
    assert.ok(decisive, '真球的腳本必須標得出決定性一拍');
    const startOf = (tailMs) => {
      const t0 = Math.max(0, Math.min(1,
        Math.max(tAtStep(script, decisive.step), 1 - tailMs / script.totalMs)));
      return { t0, step: stepAt(script, t0) };
    };
    const full = startOf(HIGHLIGHT_FULL_MS);
    const short = startOf(HIGHLIGHT_SHORT_MS);
    assert.ok(full.step >= decisive.step,
      '全版不得早於決定性一拍（前面的組織過程不是 highlight）');
    assert.ok(short.t0 >= full.t0, '短版起點必須晚於或等於全版');
    assert.ok((1 - full.t0) * script.totalMs <= HIGHLIGHT_FULL_MS + 1e-6,
      '全版長度不得超過尾段上限');
    assert.ok((1 - short.t0) * script.totalMs <= HIGHLIGHT_SHORT_MS + 1e-6,
      '短版長度不得超過尾段上限');
    // 起點之後仍播得到落地那顆收尾鏡（腳本最後一顆 shot）
    const last = script.shots[script.shots.length - 1];
    assert.ok(last.step >= full.step, '落地收尾鏡必須落在重播窗內');
    // 重演器真的走得到起點（不可播/越界＝卡死的形狀）
    const player = createRallyPlayer(tape);
    player.fastForward(full.step);
    assert.equal(player.index, full.step);
    assert.equal(player.done, false, '起點不得已經是終點——那會是零幀重播');
    checked += 1;
  }
  assert.ok(checked >= 3, `應驗到至少 3 顆真球，實得 ${checked}`);
});

// ---- HR-2 現場鏡頭演出路徑廢止 ----

test('★HR-2★ netduel 的現場鏡頭演出路徑已廢止（cameraRig 構圖／SIG_FULL_MS 鍵／mine 參數全清）', () => {
  const rig = readFileSync(new URL('../src/render/cameraRig.js', import.meta.url), 'utf8');
  assert.doesNotMatch(rig, /netduel/, 'cameraRig 不得再有 netduel 構圖分支');
  assert.equal(SIG_FULL_MS.netduel, undefined, 'netduel 不再吃現場演出窗時長');
  const sig = readFileSync(new URL('../src/ui/signatureBeats.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sig, /mine = true|mine \?/, 'planSignatureBeat 的 mine 死參數已移除');
  const loop = readFileSync(new URL('../src/app/matchLoop.js', import.meta.url), 'utf8');
  assert.doesNotMatch(loop, /fireSignatureBeat\(s, duel/,
    'netduel 不得再走 fireSignatureBeat');
  assert.match(loop, /const fired = isDuel \? null : signatureFire/,
    'netduel 起鏡改餵 highlight，不進現場演出窗');
  assert.doesNotMatch(loop, /lastSpikerId/, '只服務 netduel 構圖的欄位不留死碼');
});

test('★HR-2★ oh/mb/opp/line 四道現場演出零改動（構圖分支與全版時長都在）', () => {
  const rig = readFileSync(new URL('../src/render/cameraRig.js', import.meta.url), 'utf8');
  for (const kind of ['oh', 'mb', 'opp', 'line']) {
    assert.match(rig, new RegExp(`sigBeat\\.kind === '${kind}'`), `${kind} 構圖必須還在`);
    assert.ok(SIG_FULL_MS[kind] > 0, `${kind} 全版時長必須還在`);
  }
});

test('★HR-8★ sim 零 diff：判定層不碰 sim、零 DOM／three（node 直測前提）', () => {
  const src = read('../src/ui/highlightReplay.js');
  const imports = src.match(/^import .*$/gm) ?? [];
  assert.deepEqual(imports, ["import { HEAVY_SPIKE_POWER_MIN } from './receiveJuice.js';"],
    '判定層只吃既有 UI 純函式的單一來源，不 import sim／three／DOM');
  assert.doesNotMatch(codeOnly(src), /document|window|THREE/, '程式碼裡不得出現 DOM／three');
});

// ---- HR-5／HR-6 端到端：真卷＋假 stage 跑完整條播放路徑 ----
// 為什麼要這一條：HR-5 的「不得卡死比賽」與 HR-6 的「構圖真的會切」都不是讀原始碼
// 讀得出來的——要真的把迴圈跑起來看它自己收尾、看鏡位宣告換過幾次。
function fakeCtx() {
  const rendered = [];
  const camera = {
    position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
    updateMatrixWorld() { rendered.push('matrix'); },
  };
  return {
    rendered,
    ctx: {
      camera,
      scene: {},
      renderer: { render: () => rendered.push('render') },
      hud: { frame: () => {} },
      ballView: { sync: () => {} },
    },
  };
}

function fakeFullStage() {
  const rigCalls = [];
  const rig = { update: () => rigCalls.push(['update']) };
  for (const k of ['setSigBeat', 'setSetScan', 'setPlayerId', 'setBenchMode', 'setDiveCam',
    'setAttackView', 'setDefendView', 'setHuddleView', 'setSpikeMine']) {
    rig[k] = (v) => rigCalls.push([k, v ?? null]);
  }
  const banner = [];
  return {
    rigCalls,
    banner,
    stage: {
      rig,
      matchView: { sync: () => {} },
      aimMarker: { hide: () => {} },
      landingMarker: { hide: () => {} },
      pointBanner: {
        show: (info, opts) => banner.push(['show', info, opts]),
        hide: () => banner.push(['hide']),
      },
      panel: null,
    },
  };
}

test('★HR-5／HR-6 端到端★ 真卷播到底：自己收尾回現場、字卡收掉、期間鏡位真的切過', () => {
  const game = createGame({ seed: 11, setTarget: 25 });
  const ai = createAiState();
  const tape = playOneRally(game, ai);
  assert.ok(isPlayableTape(tape));
  const { stage, rigCalls, banner } = fakeFullStage();
  const { ctx, rendered } = fakeCtx();
  const s = { stage, ctx, controlledId: 'A4', replay: null, vcrLast: tape };
  const plan = planHighlightReplay({ duelOutcome: 'stuff', winner: MY, myTeam: MY });
  startHighlightReplay(s, plan, { sub: '我方得分　10 : 8' });
  assert.ok(s.replay?.highlight, '起播：s.replay 帶 highlight');
  assert.deepEqual(banner[0][0], 'show', '字卡開播即出');
  assert.equal(banner[0][1].title, '攔網蓋死！');
  assert.ok(banner[0][2].holdMs > 0, '字卡壽命必須 >0');
  // 60fps 跑到收尾；上限＝尾段長度換算幀數再加一大截餘裕（跑不完＝卡死）
  const maxFrames = Math.ceil((plan.tailMs / 1000) * 60) + 60;
  let frames = 0;
  while (s.replay && frames < maxFrames) {
    runHighlightFrame(s, 1000 + frames * 16.7, 1 / 60);
    frames += 1;
  }
  assert.equal(s.replay, null, `重播必須自己收尾回現場，跑了 ${frames} 幀仍在播＝卡死`);
  assert.ok(frames > 5, `不得零幀閃過（實得 ${frames} 幀）`);
  assert.ok(Math.abs(frames / 60 - plan.tailMs / 1000) < 0.4,
    `實際播出長度應接近尾段常數：${(frames / 60).toFixed(2)}s vs ${plan.tailMs / 1000}s`);
  assert.deepEqual(banner[banner.length - 1], ['hide'], '收尾必須把字卡收掉（HR-4）');
  // 期間真的在渲染、真的用 rig 運鏡（不是固定俯視）
  assert.ok(rigCalls.filter(([k]) => k === 'update').length >= frames - 1);
  assert.ok(rendered.filter((r) => r === 'render').length >= frames - 1);
  // 構圖宣告切過（sig 構圖至少出現一次，且期間換過鏡位或鏡頭錨）
  const sigSet = rigCalls.filter(([k]) => k === 'setSigBeat').map(([, v]) => v);
  assert.ok(sigSet.some((v) => v && v.kind), '重播期間至少要有一次 sig 構圖（決定性一拍/落點）');
  const distinct = new Set(sigSet.map((v) => JSON.stringify(v)));
  assert.ok(distinct.size >= 2, `鏡位必須切換（事件驅動運鏡），實得 ${distinct.size} 種`);
  // 收尾把鏡頭錨還給受控者
  const lastAnchor = rigCalls.filter(([k]) => k === 'setPlayerId').pop();
  assert.deepEqual(lastAnchor, ['setPlayerId', 'A4']);
});

test('★HR-5★ 起播守門（真呼叫、不是讀原始碼）：卷不可播／已在播＝靜默跳過', () => {
  const plan = planHighlightReplay({ duelOutcome: 'tool', winner: MY, myTeam: MY });
  const { stage, banner } = fakeFullStage();
  // ① 卷不可播
  const s1 = { stage, controlledId: 'A4', replay: null, vcrLast: null };
  startHighlightReplay(s1, plan, null);
  assert.equal(s1.replay, null, '不可播的卷＝靜默跳過，不得留下半個 replay');
  // ② 已經在播（手動 🎬）＝不重入
  const manual = { player: {}, acc: 0 };
  const game = createGame({ seed: 5, setTarget: 25 });
  const s2 = {
    stage, controlledId: 'A4', replay: manual,
    vcrLast: playOneRally(game, createAiState()),
  };
  startHighlightReplay(s2, plan, null);
  assert.equal(s2.replay, manual, '已在播＝不重入，手動回放不被踢掉');
  assert.equal(banner.length, 0, '兩種靜默跳過都不得留下字卡');
});

test('★HR-5★ 局末那一分：跳過重播的點擊不得同時被 set_over 通道吃掉（重開一局/跳結算）', () => {
  const loop = read('../src/app/matchLoop.js');
  const i = loop.indexOf("if (s.game.phase !== 'set_over') return;");
  assert.ok(i > 0, '找不到 set_over 點擊通道');
  const head = loop.slice(i, i + 400);
  assert.match(head, /if \(s\.replay\) return;/,
    'set_over 通道必須讓位給重播中的點擊——否則局末重播一點就重開局');
});
