// 分步關卡卷（2026-08-13）——每一步開打前把場景擺好，沒做到就再擺一次。
// 卷宗＝`docs/kickoffs/tutorial-drill-stage-kickoff.md`；驗收 A1/A2/A3/A5 由
// `tools/tutorial-stage-probe.mjs` 跨 50 seed 實跑量測（那四條要真的打球才驗得到），
// 本檔負責 A4（重試不吃進度）、A6（零外溢）與純函式。
//
// ★ 鑑別力 ★ 每條「該發生」的斷言都配一條反向對照：重排配「不重排時位置不對」、
// 短路配「教學局時真的會動」。只驗單邊的話，一支什麼都不做的假實作也會全綠。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rotationWithPlayerAt, tutorialStageFor, TUTORIAL_DRILL_STAGE, TUTORIAL_DRILL_IDS,
  createTutorialState, advanceTutorial, tutorialCoachLine, DRILL_DEFS, coachMarkerTarget,
  MARKER_DRILLS, TUTORIAL_MARKER_OFF_ID,
} from '../src/career/practiceMatch.js';
import { restageRotation } from '../src/sim/game.js';
import { isBackRow, isFrontRow, positionOf } from '../src/sim/rotation.js';

const SIX = ['p1', 'p2', 'me', 'p4', 'p5', 'p6'];

// ════════════════════════════════════════════════════════════
// 一、旋轉純函式
// ════════════════════════════════════════════════════════════

test('rotationWithPlayerAt：玩家落在指定槽位，且六人相對次序不變（旋轉不是交換）', () => {
  for (let slot = 0; slot < 6; slot += 1) {
    const out = rotationWithPlayerAt(SIX, 'me', slot);
    assert.equal(out[slot], 'me', `slot ${slot} 沒把玩家放對`);
    // 相對次序＝把結果接成環之後，每個人的下一位與原序相同
    for (let i = 0; i < 6; i += 1) {
      const who = out[i];
      const nextInOut = out[(i + 1) % 6];
      const nextInSrc = SIX[(SIX.indexOf(who) + 1) % 6];
      assert.equal(nextInOut, nextInSrc, `slot ${slot}：${who} 的下一位被打亂了＝真的違序`);
    }
  }
});

test('★反向對照★ 不旋轉時玩家不在那些槽位（證明上面驗得到東西）', () => {
  assert.equal(SIX.indexOf('me'), 2);
  assert.notEqual(SIX[5], 'me');
  assert.notEqual(SIX[0], 'me');
});

test('認不得的玩家／壞 slot／空序：回 null＝不動', () => {
  assert.equal(rotationWithPlayerAt(SIX, 'nobody', 0), null);
  assert.equal(rotationWithPlayerAt(SIX, 'me', 6), null);
  assert.equal(rotationWithPlayerAt(SIX, 'me', -1), null);
  assert.equal(rotationWithPlayerAt([], 'me', 0), null);
});

// ════════════════════════════════════════════════════════════
// 二、場景表：每一步要的前/後排與發球方，語意上要對得起科目
// ════════════════════════════════════════════════════════════

test('六步都有場景，且前後排與該步要練的事一致', () => {
  for (const id of TUTORIAL_DRILL_IDS) {
    assert.ok(TUTORIAL_DRILL_STAGE[id], `${id} 沒有場景`);
  }
  const rot = (id) => tutorialStageFor(id, { A: SIX, B: [...SIX] }, 'me', 'A').rotations.A;
  // 接發＝後排（前排的接發責任區在網前，指名發過去會變成短發球）
  assert.ok(isBackRow(rot('tut-receive'), 'me'), '接發那步要後排');
  // 扣球／三擊／得分＝前排（後排攻擊需 techniques.pipe，第一屆恆為 0）
  for (const id of ['tut-handle', 'tut-three', 'tut-point']) {
    assert.ok(isFrontRow(rot(id), 'me'), `${id} 要前排`);
  }
  // 攔網＝前排；發球＝位置 1
  assert.ok(isFrontRow(rot('tut-block'), 'me'), '攔網那步要前排');
  assert.equal(positionOf(rot('tut-serve'), 'me'), 1, '發球那步要站 1 號位');
});

test('★語意★ 攔網要對面發動進攻 ⇒ 發球權必須在我方（否則沒球可攔）', () => {
  const st = tutorialStageFor('tut-block', { A: SIX, B: [...SIX] }, 'me', 'A');
  assert.equal(st.servingTeam, 'A');
  const serve = tutorialStageFor('tut-serve', { A: SIX, B: [...SIX] }, 'me', 'A');
  assert.equal(serve.servingTeam, 'A', '發球那步當然是我方發');
  const recv = tutorialStageFor('tut-receive', { A: SIX, B: [...SIX] }, 'me', 'A');
  assert.equal(recv.servingTeam, 'B', '接發要對面發過來');
});

test('玩家在 B 隊時 A/B 語意跟著換邊（表裡的 A＝我方，不是寫死隊名）', () => {
  const st = tutorialStageFor('tut-block', { A: [...SIX], B: SIX }, 'me', 'B');
  assert.equal(st.servingTeam, 'B', '我方＝B 時，攔網那步該由 B 發球');
});

test('認不得的科目／缺隊伍：回 null＝不重排', () => {
  assert.equal(tutorialStageFor('nope', { A: SIX, B: SIX }, 'me', 'A'), null);
  assert.equal(tutorialStageFor('tut-block', null, 'me', 'A'), null);
  assert.equal(tutorialStageFor('tut-block', { A: SIX }, 'me', 'B'), null);
});

// ════════════════════════════════════════════════════════════
// 三、restageRotation：合法重排的手續要做齊
// ════════════════════════════════════════════════════════════

function fakeGame(phase = 'serve') {
  return {
    phase,
    match: { rotations: { A: [...SIX], B: [...SIX] }, servingTeam: 'A' },
    serveSeq: { A: { order: [...SIX], nextIdx: 3 }, B: { order: [...SIX], nextIdx: 2 } },
    rotationFault: { A: 12, B: null },
    liberos: null,
  };
}

test('★三件一起改★ rotations／serveSeq／servingTeam 同步，違序監看歸零', () => {
  const g = fakeGame();
  const next = rotationWithPlayerAt(SIX, 'me', 0);
  assert.equal(restageRotation(g, { rotations: { A: next, B: [...SIX] }, servingTeam: 'B' }), true);
  assert.deepEqual(g.match.rotations.A, next);
  assert.equal(g.match.servingTeam, 'B');
  assert.deepEqual(g.serveSeq.A, { order: next, nextIdx: 0 },
    'serveSeq 沒跟著改＝performServe 會記成 ROTATION_FAULT');
  assert.equal(g.rotationFault.A, null);
});

test('★反向對照★ rally 中／set_over 不重排（球在半空換站位會讓 actors 脫節）', () => {
  for (const phase of ['rally', 'set_over']) {
    const g = fakeGame(phase);
    const before = [...g.match.rotations.A];
    assert.equal(restageRotation(g, {
      rotations: { A: rotationWithPlayerAt(SIX, 'me', 0), B: [...SIX] }, servingTeam: 'B',
    }), false, `${phase} 時不該重排`);
    assert.deepEqual(g.match.rotations.A, before);
  }
});

test('參數不全就不做事（回 false，狀態零改動）', () => {
  const g = fakeGame();
  const before = JSON.stringify(g.match);
  assert.equal(restageRotation(g, {}), false);
  assert.equal(restageRotation(g, { rotations: { A: SIX } }), false);
  assert.equal(restageRotation(null, { rotations: { A: SIX, B: SIX }, servingTeam: 'A' }), false);
  assert.equal(JSON.stringify(g.match), before);
});

test('★自由人★ 場上是自由人佔位時，先換回原對位再登記發球序', () => {
  const g = fakeGame();
  // p5 被自由人 LA 換下（rotations 裡是 LA 佔著 p5 的格子）
  g.match.rotations.A = ['p1', 'p2', 'me', 'p4', 'LA', 'p6'];
  g.liberos = { A: { liberoId: 'LA', replacedId: 'p5', hold: true }, B: null };
  assert.equal(restageRotation(g, {
    rotations: { A: [...g.match.rotations.A], B: [...SIX] }, servingTeam: 'A',
  }), true);
  assert.ok(!g.match.rotations.A.includes('LA'), '自由人還留在輪轉裡＝setupServePhase 會查不到 actor');
  assert.ok(g.match.rotations.A.includes('p5'), '原對位沒被換回來');
  assert.ok(!g.serveSeq.A.order.includes('LA'), '把自由人登記成發球棒次＝下一棒必定對不上');
  assert.equal(g.liberos.A.replacedId, null);
  assert.equal(g.liberos.A.hold, false);
});

// ════════════════════════════════════════════════════════════
// 四、A4：重試不吃掉進度
// ════════════════════════════════════════════════════════════

test('★A4★ 重試：不推進步數、不寫 log、只加 attempts 並重設切片起點', () => {
  const st = { ...createTutorialState(0), index: 2, log: [{ id: 'x' }] };
  const out = advanceTutorial(st, {
    events: [{}, {}, {}], playerId: 'me', myTeam: 'A', tick: 100, rallyEnded: true,
  });
  assert.equal(out.change, 'retry');
  assert.equal(out.state.index, 2, '重試不該推進步數');
  assert.deepEqual(out.state.log, [{ id: 'x' }], '重試不該寫 log');
  assert.equal(out.state.attempts, 1);
  assert.equal(out.state.startEvent, 3, '切片起點要重設，否則上一球的事件會算進這一次');
  assert.equal(out.state.done, false);
});

test('★反向對照★ 沒打完一球（rallyEnded=false）不算失敗——否則每一幀都會重試一次', () => {
  const st = createTutorialState(0);
  const out = advanceTutorial(st, {
    events: [], playerId: 'me', myTeam: 'A', tick: 100, rallyEnded: false,
  });
  assert.equal(out.change, null);
  assert.equal(out.state, st, '沒事發生時要原樣回傳（純函式不製造新物件）');
});

test('★A4★ 做到了就推進，attempts 歸零（下一步的提示從第一級重新開始）', () => {
  const st = { ...createTutorialState(0), attempts: 5 };
  const events = [{ type: 'TOUCH', playerId: 'me', team: 'A', kind: 'receive' }];
  const out = advanceTutorial(st, {
    events, playerId: 'me', myTeam: 'A', tick: 10, rallyEnded: true,
  });
  assert.equal(out.change, 'advance', '做到了要優先於重試');
  assert.equal(out.state.index, 1);
  assert.equal(out.state.attempts, 0);
  assert.equal(out.state.log[0].cleared, true);
});

// ════════════════════════════════════════════════════════════
// 五、教練提示逐次變詳細
// ════════════════════════════════════════════════════════════

test('提示三級：第一球／再來一次／全部攤開，三句真的不一樣', () => {
  const def = DRILL_DEFS['tut-handle'];
  const a = tutorialCoachLine(def, 0);
  const b = tutorialCoachLine(def, 1);
  const c = tutorialCoachLine(def, 2);
  assert.equal(new Set([a, b, c]).size, 3, '三級要分得出來');
  assert.ok(b.includes('再來一次'));
  // 第三級要包含**所有**提示（不是只換一句）
  for (const h of def.hints) assert.ok(c.includes(h), `第三級漏了：${h}`);
});

// ════════════════════════════════════════════════════════════
// 六、教練光圈：只有攔網那一步有
// ════════════════════════════════════════════════════════════

const blockCtx = (over = {}) => ({
  attackerId: 'B3',
  actors: { B3: { x: 2.4, z: -1.1 } },
  myTeam: 'A',
  blockLz: 0.6,
  possession: 'B',
  phase: 'rally',
  ...over,
});

test('攔網（預判階段）：球還在對方手上時，圈指攻擊手的 x', () => {
  const p = coachMarkerTarget('tut-block', blockCtx());
  assert.deepEqual(p, { x: 2.4, z: 0.6 });
});

test('★攔網（修正階段）★ 球一出手就改指真正的過網 x，不再指攻擊手站的位置', () => {
  // 量測（tools/coach-marker-block-probe.mjs，897 次真實扣球）：攻擊手的 x 與球實際
  // 過網的 x 中位數差 0.98m，而攔網可及半寬只有 0.5m ⇒ 指攻擊手只有 37% 攔得到。
  const p = coachMarkerTarget('tut-block', blockCtx({ netCrossX: -0.7 }));
  assert.deepEqual(p, { x: -0.7, z: 0.6 }, '有過網點時必須優先用它');
  assert.notEqual(p.x, 2.4, '還在指攻擊手＝修正階段沒生效');
});

test('★反向對照★ 算不出過網點時退回指攻擊手（不是整個消失）', () => {
  const p = coachMarkerTarget('tut-block', blockCtx({ netCrossX: null }));
  assert.deepEqual(p, { x: 2.4, z: 0.6 });
});

test('★台詞與行為同源★ 攔網台詞要講「圈會跳」，不得再教「卡在他那條線」', () => {
  const hints = DRILL_DEFS['tut-block'].hints ?? [];
  const joined = hints.join('｜');
  assert.ok(joined.includes('圈'), '兩段式的圈沒有任何一句台詞講出來');
  assert.ok(!joined.includes('卡在他要打的那條線'),
    '這句已被量測否證（照它站只有 37% 攔得到），不得復活');
});

test('有圈的步畫在引擎的職責位（不是另算一份預測）', () => {
  const duty = { x: -1.8, z: 3.2 };
  for (const id of ['tut-handle', 'tut-three']) {
    const p = coachMarkerTarget(id, blockCtx({ dutyPos: duty }));
    assert.deepEqual(p, duty, `${id} 沒吃引擎的職責位`);
  }
});

test('★接發不得有圈★ 真人試玩：站在圈內還被 ACE 兩次（dutyPos 是陣型槽位，與球無關）', () => {
  // 這條守的是「圈指錯東西」——比沒有圈更糟，因為玩家會相信它。
  // 接發要看的是球會落在哪，那個圈由 landingMarker（matchStage.js:110）畫，本檔不重造。
  assert.ok(!MARKER_DRILLS.has('tut-receive'), '接發那步不得有職責位的圈');
  assert.equal(coachMarkerTarget('tut-receive', blockCtx({ dutyPos: { x: 0, z: 7 } })), null);
});

test('★反向對照★ 沒有職責位可用時不硬畫（寧可沒有圈，不要畫錯的圈）', () => {
  assert.equal(coachMarkerTarget('tut-receive', blockCtx({ dutyPos: null })), null);
});

test('發球那步不畫圈——發球員是定點發球，搖桿在發球前不生效', () => {
  assert.equal(coachMarkerTarget('tut-serve', blockCtx({ dutyPos: { x: 0, z: 7 } })), null);
});

test('★台詞與行為同源★ 收掉輔助輪那一步：真的沒有圈，而且台詞真的有講', () => {
  // 這條守的是 2026-08-13 事故的同型錯誤：文案宣稱一件事、程式做另一件事。
  // 把 tut-point 加進 MARKER_DRILLS 而沒改台詞（或反過來）＝這條紅。
  assert.ok(!MARKER_DRILLS.has(TUTORIAL_MARKER_OFF_ID),
    '宣稱要收掉圈的那一步卻在 MARKER_DRILLS 裡＝台詞說謊');
  assert.equal(coachMarkerTarget(TUTORIAL_MARKER_OFF_ID, blockCtx({ dutyPos: { x: 1, z: 1 } })),
    null, '收掉輔助輪的那一步不得有圈');
  const hints = DRILL_DEFS[TUTORIAL_MARKER_OFF_ID].hints ?? [];
  assert.ok(hints.some((h) => h.includes('圈')),
    '圈收起來了這件事沒有任何一句台詞講出來＝玩家會以為是 bug');
});

test('★反向對照★ 有圈的那幾步，台詞不得宣稱圈不見了', () => {
  for (const id of MARKER_DRILLS) {
    for (const h of DRILL_DEFS[id].hints ?? []) {
      assert.ok(!h.includes('圈收起來'), `${id} 有圈卻說圈收起來了：${h}`);
    }
  }
});

test('★反向對照★ 不在 MARKER_DRILLS 的步一律沒有圈', () => {
  for (const id of TUTORIAL_DRILL_IDS) {
    if (MARKER_DRILLS.has(id)) continue;
    assert.equal(coachMarkerTarget(id, blockCtx({ dutyPos: { x: 1, z: 1 } })), null,
      `${id} 不該有圈`);
  }
});

test('條件不成立就不畫：非 rally／我方持球／還沒認出攻擊手／查不到那個人', () => {
  assert.equal(coachMarkerTarget('tut-block', blockCtx({ phase: 'serve' })), null);
  assert.equal(coachMarkerTarget('tut-block', blockCtx({ possession: 'A' })), null);
  assert.equal(coachMarkerTarget('tut-block', blockCtx({ possession: null })), null);
  assert.equal(coachMarkerTarget('tut-block', blockCtx({ attackerId: null })), null);
  assert.equal(coachMarkerTarget('tut-block', blockCtx({ actors: {} })), null);
});

test('我方是 B 隊時圈畫在另一側（z 換號，不是寫死正值）', () => {
  const p = coachMarkerTarget('tut-block', blockCtx({
    myTeam: 'B', possession: 'A', attackerId: 'A3', actors: { A3: { x: -1.5, z: 1.2 } },
  }));
  assert.deepEqual(p, { x: -1.5, z: -0.6 });
});

test('★同源★ blockLz 由呼叫端從 sim 的 AI.BLOCK_LZ 餵進來，不是這裡寫死', () => {
  const p = coachMarkerTarget('tut-block', blockCtx({ blockLz: 1.9 }));
  assert.equal(p.z, 1.9, '沒吃呼叫端給的值＝這裡自己藏了一份常數');
});

test('★同源★ 三級台詞全部由 def.hints 組出來，不得憑空多出一份文案', () => {
  const def = DRILL_DEFS['tut-receive'];
  for (const n of [0, 1, 2, 7]) {
    const line = tutorialCoachLine(def, n);
    const body = line.replace(/^教練：[^—]*——/, '');
    const known = [def.label, ...def.hints];
    // 去掉所有已知片段與標點後，不該剩下任何實質內容
    let rest = body;
    for (const k of known) rest = rest.split(k).join('');
    assert.equal(rest.replace(/[。；、，\s]/g, ''), '', `attempts=${n} 出現了不在 hints 裡的句子：${rest}`);
  }
});
