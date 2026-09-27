// direct-v8 stage 1, round 6 (2026-09-28): the fifth review's finding NEW-A
// after the user's ruling 甲 (acceptance file 修訂紀錄, criterion X1).
//   X1 (NEW-A 甲): 魚躍 pressed at a ball headed into a receive circle (U2)
//       runs as long as a receive (32 ticks, DIRECT_ACTIONS.receive) instead of
//       the thrown dive's 63, the stick moves the body within 2 ticks of its
//       end, and the body visibly whiffs meanwhile (pelvis ≥ 0.10 m lower or
//       torso ≥ 20° forward) instead of standing frozen; the judgement is
//       unchanged (a pressed spray, 「這球要按接球」, never 「沒按」); the U2
//       judgement-frame snap stays ≤ 0.74 m; R11 restore / replay stay
//       bit-identical. The grids are the reviewer's u2 / u2chase / u2restore
//       probes (tools/direct-v8-round6-probes.mjs).
// The file runs on the archived old code (ff6e868) too: it imports only what
// exists there, so a red there comes from behaviour, not from a missing import.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRECT_ACTIONS } from '../src/sim/directConstants.js';
import { u2Scenario, u2Chase, u2Restore } from '../tools/direct-v8-round6-probes.mjs';
import { snapDistances } from '../tools/direct-v8-round5-probes.mjs';

const RECEIVE_TICKS = DIRECT_ACTIONS.receive.windup + DIRECT_ACTIONS.receive.active + DIRECT_ACTIONS.receive.recovery;

for (const circle of ['under', 'over']) {
  test(`X1 U2（練習指定＝魚躍、球落${circle === 'over' ? '高手' : '低手'}圈內）：動作 ${RECEIVE_TICKS} tick 即結束、結束後 ≤ 2 tick 推搖桿即移動、動作中有可見的撲空姿勢、判定仍是有按的噴球「這球要按接球」`, () => {
    const r = u2Scenario({ circle });
    assert.equal(r.stage, circle, `按下時預測的判定 stage ${r.stage}（要是 U2 才算數）`);
    assert.equal(r.actionTicks, RECEIVE_TICKS, `動作總長 ${r.actionTicks} tick（接球動作 ${RECEIVE_TICKS}）`);
    assert.ok(r.firstMoveTick !== null && r.firstMoveTick - r.endTick <= 2, `動作在 tick ${r.endTick} 結束，身體到 tick ${r.firstMoveTick} 才動（> 2 tick）`);
    assert.ok(r.vxAfterEnd > 0, `動作結束後第一個 tick 的速度 ${r.vxAfterEnd}（搖桿仍被忽略）`);
    assert.ok(r.firstMoveTick - r.pressTick <= RECEIVE_TICKS + 2, `按下（tick ${r.pressTick}）後 ${r.firstMoveTick - r.pressTick} tick 身體才動（> ${RECEIVE_TICKS + 2}：像輸入卡住）`);
    assert.ok(r.maxPelvisDrop >= 0.10 || r.maxTorsoLean >= 20, `動作期間沒有可見的撲空姿勢：骨盆最多低 ${r.maxPelvisDrop.toFixed(3)} m、軀幹最多前傾 ${r.maxTorsoLean.toFixed(1)}°（站姿 ${r.standingTorsoLean.toFixed(1)}°）`);
    const c = r.contact && { timing: r.contact.timing, tier: r.contact.tier ?? null, technique: r.contact.technique, spray: !!r.contact.spray };
    assert.ok(c && c.spray && c.timing === 'dive' && !c.tier && c.technique !== 'dive', `判定 ${JSON.stringify(c)}（要是 timing dive 的噴球、無等級、非魚躍）`);
    assert.ok(r.text.includes('這球要按接球') && !r.text.includes('沒按'), `原因字串「${r.text}」`);
  });
}

test('X1 U2 判定格瞬移：snapDistances 的 overhand/dive、underhand/dive 與練習指定魚躍的 chase 網格（5 起點）最大值都 ≤ 0.74 m（不得比第 5 輪的 0.736 m 明顯變差）', () => {
  const classes = snapDistances();
  for (const k of ['overhand/dive', 'underhand/dive']) {
    assert.ok(classes[k] && classes[k].n >= 20, `${k}: ${classes[k]?.n ?? 0} 例（需 ≥ 20）`);
    assert.ok(classes[k].max <= 0.74, `${k}: 最大瞬移 ${classes[k].max.toFixed(3)} m > 0.74`);
  }
  const c = u2Chase();
  assert.ok(c.n >= 1000, `chase 網格的 U2 觸球 ${c.n}/${c.runs} 局（需 ≥ 1000）`);
  assert.equal(c.over074, 0, `chase 網格 U2 瞬移 > 0.74 m 的例數 ${c.over074}/${c.n}（最大 ${c.max?.toFixed(3)} m）`);
});

test('X1 R11：U2 錄影（魚躍按在落圈內的球、之後推搖桿）每 3 tick 還原續跑與整卷重播逐位元相同', () => {
  const r = u2Restore();
  assert.ok(r.checks >= 1000, `比對次數 ${r.checks}`);
  assert.equal(r.bad, 0, `還原／重播與錄影不同 ${r.bad}/${r.checks}`);
  for (const stage of ['under', 'over']) assert.ok(r.stages.includes(stage), `錄影裡沒有 stage ${stage} 的 U2（${r.stages.join(',')}）`);
});
