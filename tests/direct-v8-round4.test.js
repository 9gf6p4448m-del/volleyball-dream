// direct-v8 stage 1, round 4 (2026-09-27): the third review's findings after
// the user's rulings U1–U4 (acceptance file 修訂紀錄, criteria V1–V4).
//   V1 (N1 / U2): a dive pressed at a ball that is judged inside a receive
//       circle is a pressed spray — ball on the hands/forearms, no tier, not a
//       dive, reason 「這球要按接球」 — never 「沒按」.
//   V2 (N2): on the practice page's control path (auto-face heading while the
//       button says 接球, stick heading otherwise) the sim records the same
//       judgement stage the label predicted, and never a null dive target.
//   V3 (N3 / U4): the receive reach toward the judged ball is picture only:
//       the outstretched arms never intercept a ball (the reviewer's cases,
//       whose first touch must equal the no-reach outcome). The full-grid
//       comparison of two trees is tools/receive-reach-diff.mjs.
//   V4 (N4): an unpressed spray lands on the part whose surface is nearest.
// The file runs on the archived old code (0e72fd4) too: it imports only what
// exists there, so a red there comes from behaviour, not from a missing import.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectGame, stepDirectGame } from '../src/sim/directGame.js';
import { resolveHitAction } from '../src/sim/directReceiveRules.js';
import { DIRECT_PHYSICS as C } from '../src/sim/directConstants.js';
import { diveInCircle, aimFlip, nearestSurface, outcomeOf } from '../tools/direct-v8-round4-probes.mjs';

test('V1 練習指定＝魚躍、球直落低手圈內（d 0.1–0.49、8 方位、兩個時窗 × 3 偏差）：按下在判定前的每一例都是有按的噴球——無 timing none、無「沒按」、含「這球要按接球」、球貼手掌／前臂 ≤ 0.05 m、無等級、非魚躍', () => {
  const { rows } = diveInCircle();
  assert.equal(rows.length, 240, `網格例數 ${rows.length}`);
  const before = rows.filter((r) => r.pressedBefore), after = rows.filter((r) => !r.pressedBefore);
  assert.ok(before.length >= 200, `按下在判定前的例數 ${before.length}`);
  const bad = (label, pred) => {
    const hits = before.filter(pred);
    assert.equal(hits.length, 0, `${label}：${hits.length}/${before.length}，例：${hits.slice(0, 3).map((r) => `d=${r.d} ang=${r.ang} ${r.win} off${r.off}: ${r.outcome} 「${r.text}」 armGap ${r.gap?.arm?.toFixed(3)}`).join('；')}`);
  };
  bad('沒有觸球事件', (r) => !r.contact);
  bad('timing 為 none', (r) => r.contact?.timing === 'none');
  bad('原因字串出現「沒按」', (r) => r.text.includes('沒按'));
  bad('原因字串缺「這球要按接球」', (r) => !r.text.includes('這球要按接球'));
  bad('不是噴球', (r) => !r.contact?.spray);
  bad('球面到手掌／前臂 > 0.05 m', (r) => !r.gap || r.gap.arm > 0.05);
  bad('判了等級', (r) => !!r.contact?.tier);
  bad('算成魚躍', (r) => r.contact?.technique === 'dive');
  // The rest were judged (at the forehead) before the press: no press is the truth there.
  for (const r of after) assert.ok(r.contact && r.contact.tick < r.rt, `判定後才按的例子應在按下前就有觸球：d=${r.d} ang=${r.ang} ${r.win} off${r.off} rt${r.rt} contact tick ${r.contact?.tick}`);
});

test('V2 練習頁控制路徑（接球時送自動朝向、魚躍時送搖桿朝向）：按鈕顯示魚躍時 sim 記的 stage 一律 dive、diveTarget 一律非 null（chase 變體：修前 39／28；first 變體亦 0）', () => {
  for (const variant of ['chase', 'first']) {
    const { rows } = aimFlip(variant);
    assert.ok(rows.length >= 2000, `${variant}: 魚躍按鍵例數 ${rows.length}`);
    const nullTarget = rows.filter((r) => r.stage === null), mismatch = rows.filter((r) => r.stage !== 'dive');
    const show = (r) => `feed vx${r.feed[0]} vy${r.feed[1]} vz${r.feed[2]} start(${r.start}) err(${r.err}) off${r.off}: aim jump ${r.aimGap.toFixed(1)}° label ${r.labelStage} -> sim ${r.stage} -> ${r.outcome}`;
    assert.equal(nullTarget.length, 0, `${variant}: 顯示魚躍而 diveTarget 為 null ${nullTarget.length}/${rows.length}，例：${nullTarget.slice(0, 3).map(show).join('；')}`);
    assert.equal(mismatch.length, 0, `${variant}: 顯示魚躍而 sim stage ≠ dive ${mismatch.length}/${rows.length}，例：${mismatch.slice(0, 3).map(show).join('；')}`);
    assert.ok(rows.every((r) => r.labelStage === 'dive'), `${variant}: 標籤預測與 nextJudgement 不一致`);
  }
});

// V3: the reviewer's chase cases (events-diff, reach on vs receiveReachLimit 0)
// where the reached-out forearm intercepted a ball the rules had not judged:
// with the reach picture-only their first touch is the no-reach outcome (no
// touch at all; the ball lands at tick 54, a stance miss at the underhand
// judgement) even though the arms still reach (receiveReach ≠ 0 is seen).
const REACH_CASES = [
  { feed: { x: 0, y: 2.8, z: 0.8, vx: -1.5, vy: 1.5, vz: 4 }, start: [-1, 6], err: [0.5, 0.3], off: -9 },
  { feed: { x: 0, y: 2.8, z: 0.8, vx: -1.5, vy: 1.5, vz: 4 }, start: [-1, 6], err: [0.5, 0.3], off: -6 },
  { feed: { x: 0, y: 2.8, z: 0.8, vx: -1.5, vy: 1.5, vz: 4 }, start: [-1, 6], err: [0.5, 0.3], off: -3 },
  { feed: { x: 0, y: 2.8, z: 0.8, vx: -1.5, vy: 1.5, vz: 4 }, start: [-1, 6], err: [0.5, 0.3], off: 0 },
  { feed: { x: 0, y: 2.8, z: 0.8, vx: -1.5, vy: 1.5, vz: 4 }, start: [-1, 6], err: [0.5, 0.3], off: 3 },
  { feed: { x: 0, y: 2.8, z: 0.8, vx: -1.5, vy: 1.5, vz: 4 }, start: [-1, 6], err: [-0.5, -0.3], off: -9 },
  { feed: { x: 0, y: 2.8, z: 0.8, vx: -1.5, vy: 1.5, vz: 4 }, start: [-1, 6], err: [-0.5, -0.3], off: -6 },
  { feed: { x: 0, y: 2.8, z: 0.8, vx: -1.5, vy: 1.5, vz: 4 }, start: [-1, 6], err: [-0.5, -0.3], off: -3 },
];
function chaseCase({ feed: f, start: [px, pz], err: [ex, ez], off }) {
  const H = 1.75, G = C.gravity;
  const a = -G / 2, b = f.vy, c = f.y - 0.44 * H, t = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  const goal = { x: f.x + f.vx * t + ex, z: f.z + f.vz * t + 0.3 * H + ez }, press = Math.round(t * 60) - 13 + off;
  const s = createDirectGame(); s.player.x = px; s.player.z = pz;
  Object.assign(s.ball, f, { px: f.x, py: f.y, pz: f.z, active: true });
  let contact = null, end = null, reach = 0;
  for (let k = 0; k < 240; k++) {
    const dx = goal.x - s.player.x, dz = goal.z - s.player.z, d = Math.hypot(dx, dz);
    const move = k < 12 || d < 0.08 ? { x: 0, z: 0 } : { x: dx / Math.max(d, 0.4), z: dz / Math.max(d, 0.4) };
    const action = k === Math.max(0, press) ? resolveHitAction(s) : null;
    stepDirectGame(s, [{ tick: s.tick, sequence: 0, move, aim: { x: 0, z: -1 }, action }]);
    reach = Math.max(reach, Math.abs(s.player.receiveReach ?? 0), Math.abs(s.player.receiveAhead ?? 0));
    for (const e of s.events) { if (e.type === 'contact' && !contact) contact = { ...e, tick: k }; if (['ground', 'net', 'out'].includes(e.type)) end = { ...e, tick: k }; }
    if (end) break;
  }
  return { contact, end, reach, outcome: outcomeOf(contact, end) };
}

test('V3 迎球只改姿勢：伸出的前臂不攔球——覆審抓到的 8 例（修前第一觸＝前臂彈開 body）第一觸與不迎球版相同（無觸球、tick 54 落地、站位失誤），且迎球確實有伸出', () => {
  const runs = REACH_CASES.map((c) => ({ ...c, ...chaseCase(c) }));
  assert.ok(runs.some((r) => r.reach > 0.05), `迎球沒有伸出（最大 reach ${Math.max(...runs.map((r) => r.reach)).toFixed(3)} h）`);
  for (const r of runs) {
    const tag = `start(${r.start}) err(${r.err}) off${r.off}`;
    assert.equal(r.contact, null, `${tag}: 伸出的前臂攔到球 → ${r.outcome}（tick ${r.contact?.tick}, ${r.contact?.part}）`);
    assert.equal(r.end?.type, 'ground', `${tag}: 終止 ${r.end?.type}`);
    assert.equal(r.end.tick, 54, `${tag}: 落地 tick ${r.end.tick}`);
    assert.equal(r.end.miss?.stage, 'under', `${tag}: 失誤類別 ${r.end.miss?.stage}`);
  }
});

test('V4 沒按的噴球貼到「表面最近」的部位：追球網格全不按的每一例，選中部位的表面距離 ≤ 其他所有部位 + 1e-6 m', () => {
  const rows = nearestSurface();
  assert.ok(rows.length >= 1000, `沒按的噴球 ${rows.length}`);
  const worse = rows.filter((r) => r.excess > 1e-6);
  assert.equal(worse.length, 0, `${worse.length}/${rows.length} 例貼到的不是表面最近的部位，例：${worse.slice(0, 4).map((r) => `${r.chosen} 表面距 ${r.chosenSurface.toFixed(3)} vs ${r.nearest} ${r.nearestSurface.toFixed(3)}`).join('；')}`);
  // The rule is real: some of them land on a part that is not an arm.
  assert.ok(rows.some((r) => r.part !== 'forearm' && r.part !== 'hand'), '沒按的噴球全部貼在手臂上');
});
