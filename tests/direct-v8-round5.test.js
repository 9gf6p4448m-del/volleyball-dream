// direct-v8 stage 1, round 5 (2026-09-28): the fourth review's findings after
// the user's rulings (acceptance file 修訂紀錄, criteria W1–W3).
//   W1 (NEW-1 甲): the drawn receive reach comes back when no judgement is
//       predicted any more, and does not reach for a ball at the circle's
//       edge — a ball never passes through a drawn forearm untouched (chase
//       grid, 5292 runs: ≤ 5 such runs, the old-code 0e72fd4 count, and no
//       deeper than its 0.168 m).
//   W2 (NEW-2 丙): 魚躍 pressed at a ball headed into a receive circle (U2) is
//       judged on the standing pose — the body is not thrown — so the
//       judgement-frame snap stays ≤ 1.2 m (the picture smoothing's reach).
//   W3 (NEW-3 甲): the ball is put on the un-reached (collision) pose and the
//       reach is zeroed on the touch: nothing after the touch depends on the
//       reach (the full two-tree comparison is tools/receive-reach-diff.mjs),
//       and no second bounce happens off an arm the picture does not show.
//   X3 (round 6, 2026-09-28): the W3 arm-gap assertion measures the reach the
//       practice page draws (its own easing from the pre-judgement value),
//       not the sim's zeroed one: the drawn reach never moves more than its
//       per-frame step, is back on the sim's within the frames the reach limit
//       allows, and the ball then sits on the arms so drawn. Mutating the
//       page's easing to an instant zero or to holding the reach turns it red.
// The round-5 evidence ran this file on the archived old code (c6a5c67), which
// it imported nothing new from; the X3 assertions need src/app/directPicture.js
// (new in round 6), so their mutation reds run on copies of the current tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRECT_PHYSICS as C } from '../src/sim/directConstants.js';
import { REACH_EASE_STEP } from '../src/app/directPicture.js';
import { drawnArmPenetration, snapDistances, secondContacts } from '../tools/direct-v8-round5-probes.mjs';

test('W1 追球網格 5292 局：球與畫面上可見前臂／手掌重疊、之後無觸球落地的局數 ≤ 5（舊碼 0e72fd4 基準），最大重疊深度 ≤ 0.168 m（舊碼最大值）', () => {
  const { runs, rows, maxDepth } = drawnArmPenetration();
  assert.equal(runs, 5292, `網格局數 ${runs}`);
  const show = (r) => `feed(${r.feed}) start(${r.start}) err(${r.err}) off${r.off} ${r.mode}: tick ${r.tick} ${r.id} 深 ${r.depth} m reach ${r.reach.toFixed(2)}/${r.ahead.toFixed(2)} h`;
  assert.ok(rows.length <= 5, `球穿過畫面上的前臂後沒被接到：${rows.length}/${runs}，例：${rows.slice(0, 3).map(show).join('；')}`);
  assert.ok(maxDepth <= 0.168, `最大重疊深度 ${maxDepth} m > 0.168`);
});

test('W2 判定格瞬移：按魚躍而球在高手／低手圈內（U2）的每一例 snapFrom→position ≤ 1.2 m；其餘類別也 ≤ 1.2 m', () => {
  const classes = snapDistances();
  for (const k of ['overhand/dive', 'underhand/dive']) assert.ok(classes[k] && classes[k].n >= 20, `${k}: ${classes[k]?.n ?? 0} 例（需 ≥ 20）`);
  for (const [k, v] of Object.entries(classes)) assert.equal(v.over12, 0, `${k}: ${v.over12}/${v.n} 例瞬移 > 1.2 m（最大 ${v.max.toFixed(3)} m）`);
});

test('W3 判定後不撞看不見的手臂：追球網格有按 2646 局，第二次身體碰撞時球離畫面姿勢任一表面 ≤ 2 cm 的例外 = 0；判定那一格 sim 迎球為 0、球貼在無迎球姿勢的手臂上（≤ 0.05 m）；X3：畫面自己緩回的迎球每幀變化 ≤ 步長、在迎球上限／步長的幀數內回到 sim 值，回到那一幀球貼在畫面手臂上（≤ 0.05 m）', () => {
  const r = secondContacts();
  assert.equal(r.runs, 2646, `局數 ${r.runs}`);
  assert.ok(r.judged >= 1500, `規則判定的觸球 ${r.judged}`);
  assert.equal(r.invisible.length, 0, `判定後撞到畫面上沒有的手臂 ${r.invisible.length}/${r.second}，例：${JSON.stringify(r.invisible.slice(0, 3))}`);
  assert.equal(r.judgement.reachNonZero, 0, `判定那一格迎球仍非 0：${r.judgement.reachNonZero}/${r.judged}`);
  assert.ok(r.judgement.maxBaseArmGap <= 0.05, `判定那一格球離無迎球姿勢手臂最大 ${r.judgement.maxBaseArmGap.toFixed(3)} m`);
  // X3: the picture's reach (easeReach from the pre-judgement value), not the sim's zeroed one.
  const j = r.judgement;
  assert.ok(j.reachedBefore >= 100, `判定前一 tick 迎球非 0 的觸球只有 ${j.reachedBefore}/${r.judged}（緩回要有東西可量）`);
  assert.ok(j.maxReachStepPerFrame <= REACH_EASE_STEP + 1e-12, `畫面迎球單幀變化最大 ${j.maxReachStepPerFrame.toFixed(3)} h > 步長 ${REACH_EASE_STEP.toFixed(3)}（判定那一格直接歸零）`);
  const settleBound = Math.ceil(C.receiveReachLimit / REACH_EASE_STEP - 1e-9);
  assert.ok(Number.isInteger(j.maxFramesToSettle) && j.maxFramesToSettle <= settleBound, `畫面迎球 ${j.maxFramesToSettle ?? '20+'} 幀仍未回到 sim 值（上限 ${settleBound} 幀；保持伸出）`);
  assert.ok(j.maxDrawnArmGap <= 0.05, `畫面迎球回到 sim 值那一幀，球離畫面手臂最大 ${j.maxDrawnArmGap.toFixed(3)} m`);
});
