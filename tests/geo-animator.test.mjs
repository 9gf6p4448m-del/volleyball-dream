// 幾何動畫 — 魚躍動作（修「按魚躍站著不動」bug 的回歸測試）
// geoAnimator 是純函式（rig 注入），node 可測；驗 dive 動作驅動撲救姿勢
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGeoAnimator, hitLeadTicks, contactSeqFor, SEQ_HIT,
} from '../src/render/geoAnimator.js';
import { isLeftHanded } from '../src/render/geoCharacter.js';
import { createGame } from '../src/sim/game.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { OPPONENTS } from '../src/career/opponents.js';

// 4.7 動作重製新增三關節：pelvis（骨盆獨立轉）／spineUpper（胸椎）／r-lWrist（壓腕）
const JOINT_NAMES = ['rHip', 'lHip', 'rKnee', 'lKnee', 'spine', 'spineUpper', 'neck',
  'pelvis', 'rShoulder', 'lShoulder', 'rElbow', 'lElbow', 'rWrist', 'lWrist'];

// handed：Phase 5 W1 §1b 慣用手鏡像測試用——省略＝右手（既有測試零影響）
function mkRig(handed) {
  const joints = {};
  for (const n of JOINT_NAMES) joints[n] = { rotation: { x: 0, y: 0, z: 0 } };
  return { joints, handed, root: { rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 } } };
}

test('geoAnimator dive：驅動撲救姿勢（雙臂大幅前伸夠球）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('dive');
  anim.update(0.35, 0); // 播到撲出/觸球段
  // 身體前傾由 matchView 的 root.rotation.x 主導；geoAnimator 負責雙臂大幅前伸救球
  assert.ok(rig.joints.rShoulder.rotation.x < -0.8, `右臂 ${rig.joints.rShoulder.rotation.x} 應大幅前伸`);
  assert.ok(rig.joints.lShoulder.rotation.x < -0.8, '左臂應大幅前伸（雙臂平墊）');
});

test('geoAnimator dive：撲空也演完整套、dur≈倒地時長後回待命', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('dive');
  assert.ok(!anim.isIdle(), '觸發後應在播放中');
  anim.update(0.72, 0); // 播完整段（dur 0.72）
  anim.update(0.01, 0);
  assert.ok(anim.isIdle(), 'dur 後應回待命（不卡在趴地）');
});

test('發球分式動畫：serveJump 高跳、serveFloat 站立零跳、serveReady 可 hold', () => {
  // 跳發：擊球段有明顯騰空（jump 0.55）
  const r1 = mkRig();
  const a1 = createGeoAnimator(r1);
  a1.trigger('serveJump');
  let peak = 0;
  for (let i = 0; i < 17; i += 1) peak = Math.max(peak, a1.update(0.05, 0));
  assert.ok(peak > 0.3, `跳發應高跳（峰值 ${peak.toFixed(2)}）`);
  // 飄浮：站立推擊、全程零騰空
  const r2 = mkRig();
  const a2 = createGeoAnimator(r2);
  a2.trigger('serveFloat');
  let top = -1;
  for (let i = 0; i < 10; i += 1) top = Math.max(top, a2.update(0.05, 0));
  assert.ok(top <= 0.02, `飄浮發球不應騰空（峰值 ${top.toFixed(2)}）`);
  // serveReady：hold 姿勢可用（發球前捧球預備）
  const r3 = mkRig();
  const a3 = createGeoAnimator(r3);
  a3.setHold('serveReady');
  a3.update(0.05, 0);
  assert.ok(r3.joints.rShoulder.rotation.x < -0.5, '捧球預備＝雙臂前伸');
});

test('W7 A4③ 喘氣 idle：hold 姿勢＝深前傾＋撐膝（spine/crouch 明顯大於待命）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.setHold('gasp');
  anim.update(0.05, 0);
  assert.ok(rig.joints.spine.rotation.x > 0.5, `軀幹應深前傾（${rig.joints.spine.rotation.x}）`);
  assert.ok(rig.joints.rElbow.rotation.x < -0.3, '手肘應大彎（撐膝）');
});

test('W7 B4④ 氣勢 dejected idle：垂肩低頭、無下蹲（區別於 gasp 撐膝）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.setHold('dejected');
  anim.update(0.05, 0);
  assert.ok(rig.joints.spine.rotation.x > 0.15 && rig.joints.spine.rotation.x < 0.5,
    `軀幹應輕微前垂但不到喘氣深度（${rig.joints.spine.rotation.x}）`);
  assert.ok(rig.joints.rElbow.rotation.x > -0.3, '手肘不應大彎（非撐膝，鬆垮下垂即可）');
});

test('W7 B4④ highfive：時長明顯長於一般 cheer', () => {
  const rNorm = mkRig();
  const aNorm = createGeoAnimator(rNorm);
  aNorm.trigger('cheer');
  aNorm.update(0.9, 0);
  aNorm.update(0.01, 0);
  assert.ok(aNorm.isIdle(), '一般 cheer 應在 0.9s 後結束');

  const rBoost = mkRig();
  const aBoost = createGeoAnimator(rBoost);
  aBoost.trigger('highfive');
  aBoost.update(0.9, 0);
  assert.ok(!aBoost.isIdle(), 'highfive 在 0.9s 時應仍在播放（時長拉長）');
  aBoost.update(0.5, 0);
  assert.ok(aBoost.isIdle(), 'highfive 在 dur 1.3s 後應結束');
});

test('geoAnimator：未知動作不崩（trigger 防呆）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('nonexistent');
  assert.ok(anim.isIdle());
  anim.update(0.1, 0); // 不應丟例外
});

// 4.7 動作重製（工單 §7「動作正確性」）：鞭打順序與落地緩衝
test('鞭打順序：肩→肘→腕的角速度峰值嚴格遞增（不得同幀一起轉）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('spike');
  const dt = 1 / 60;
  const prev = { sh: 0, el: 0, wr: 0 };
  const peak = { sh: { v: -1, t: -1 }, el: { v: -1, t: -1 }, wr: { v: -1, t: -1 } };
  for (let i = 0; i < 40; i += 1) {
    anim.update(dt, 0);
    const cur = {
      sh: rig.joints.rShoulder.rotation.x,
      el: rig.joints.rElbow.rotation.x,
      wr: rig.joints.rWrist.rotation.x,
    };
    for (const k of ['sh', 'el', 'wr']) {
      const v = Math.abs(cur[k] - prev[k]);
      if (i > 0 && v > peak[k].v) peak[k] = { v, t: i };
      prev[k] = cur[k];
    }
  }
  assert.ok(peak.sh.t >= 0 && peak.el.t >= 0 && peak.wr.t >= 0, '三關節都要有動作');
  assert.ok(peak.sh.t <= peak.el.t, `肩(${peak.sh.t}) 不得晚於肘(${peak.el.t})`);
  assert.ok(peak.el.t <= peak.wr.t, `肘(${peak.el.t}) 不得晚於腕(${peak.wr.t})`);
  assert.ok(peak.wr.t > peak.sh.t, '腕的峰值必須嚴格晚於肩＝鞭打不是同幀一起轉');
});

test('落地緩衝：扣球落地後膝角持續低於站立值（不得瞬間回站姿）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  const dt = 1 / 60;
  anim.update(dt, 0);
  const standKnee = rig.joints.rKnee.rotation.x;
  anim.trigger('spike');
  const knees = [];
  for (let i = 0; i < 48; i += 1) { // spike 0.6s ＋ 自動接的落地緩衝 0.26s
    anim.update(dt, 0);
    knees.push(rig.joints.rKnee.rotation.x);
  }
  // 落地段（spike 尾 + landSoft）：屈膝吸收＝膝角明顯大於站立，且持續 ≥10 tick
  const tail = knees.slice(36, 48);
  assert.ok(tail.filter((k) => k > standKnee + 0.05).length >= 10,
    `落地段應有連續屈膝吸收（實際 ${tail.map((k) => k.toFixed(2)).join(',')}）`);
});

test('步幅匹配：擺腿振幅隨移速上升（滑冰的成因是步幅不匹配）', () => {
  const sample = (speed) => {
    const rig = mkRig();
    const anim = createGeoAnimator(rig);
    let max = 0;
    for (let i = 0; i < 120; i += 1) {
      anim.update(1 / 60, speed);
      max = Math.max(max, Math.abs(rig.joints.rHip.rotation.x));
    }
    return max;
  };
  const slow = sample(1.2);
  const fast = sample(4.2);
  assert.ok(fast > slow, `快跑的擺腿幅度要大於慢走（slow=${slow.toFixed(2)} fast=${fast.toFixed(2)}）`);
});

test('側併步：橫移時髖關節側開、前後擺腿明顯減弱（沿網移動不是前跑）', () => {
  const sample = (lateral) => {
    const rig = mkRig();
    const anim = createGeoAnimator(rig);
    let maxX = 0;
    let maxZ = 0;
    for (let i = 0; i < 120; i += 1) {
      anim.update(1 / 60, 3.5, lateral);
      maxX = Math.max(maxX, Math.abs(rig.joints.rHip.rotation.x));
      maxZ = Math.max(maxZ, Math.abs(rig.joints.rHip.rotation.z));
    }
    return { maxX, maxZ };
  };
  const fwd = sample(0);
  const side = sample(1);
  assert.ok(side.maxZ > 0.1, `純橫移要有側開動作（實際 ${side.maxZ.toFixed(3)}）`);
  assert.ok(fwd.maxZ < 0.01, `純前進不得有側開（實際 ${fwd.maxZ.toFixed(3)}）`);
  assert.ok(side.maxX < fwd.maxX, `橫移的前後擺腿要比前進小（側 ${side.maxX.toFixed(2)} vs 前 ${fwd.maxX.toFixed(2)}）`);
});

// Phase 5 W1 §3「二傳兩次抬手」回歸（07-28 Sawmah 試玩回報）
// 成因＝預備序列（setReady）走進自己的 RELEASE 尾段、權重掉到 ~0.25 手臂鬆回大半，
// 正式動作（overhead）再從 0 漸入抬第二次。修法＝sustain 撐住 ＋ trigger 權重接棒。
// setReach 姿勢的 rSh[0] = -2.3；完全鬆手的待命臂約 -0.12——中間值即「鬆了一半」
const TICK = 1 / 60;

test('§3 二傳預備：撐住不自己鬆手（觸球前手臂不得掉權重）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('setReady');
  // 實測觸發到觸球約 24 tick（matchLoop SET_READY_LEAD=34，球比預測早到）——
  // 修前此時 setReady 已播完 27 tick 中的 24 tick、權重僅剩 (27-24)/12 ≈ 0.25
  for (let i = 0; i < 24; i += 1) anim.update(TICK, 0);
  const arm = rig.joints.rShoulder.rotation.x;
  assert.ok(arm < -2.2, `觸球前一刻手臂應仍完全舉起（setReach -2.3），實際 ${arm.toFixed(2)}`);
});

test('§3 二傳交棒：overhead 接手不得掉權重（這就是第二次抬手）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('setReady');
  for (let i = 0; i < 24; i += 1) anim.update(TICK, 0);
  const before = rig.joints.rShoulder.rotation.x;
  // 觸球：正式舉球接手。overhead 的 at:0 就是 setReach＝同一個姿勢，
  // 接手應無縫；修前這裡會掉到 0 權重再漸入＝畫面上手臂放下又抬起
  anim.trigger('overhead');
  let worst = before;
  for (let i = 0; i < 5; i += 1) { // ATTACK_MS 0.08s ≈ 5 tick＝修前的漸入窗
    anim.update(TICK, 0);
    worst = Math.max(worst, rig.joints.rShoulder.rotation.x); // 越接近 0 越是鬆手
  }
  assert.ok(worst < -2.2, `交棒期間手臂不得放下，最鬆 ${worst.toFixed(2)}（應保持 ≈-2.3）`);
});

test('§3 sustain 有界：預備撐完仍會鬆手回待命（不得永遠卡住舉手）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('setReady');
  anim.update(0.45 + 0.6, 0); // dur + sustain
  anim.update(0.21, 0); // 再走完 RELEASE_MS
  assert.ok(anim.isIdle(), '沒等到球的二傳應在撐住期滿後回待命');
});

test('§3 無 sustain 的序列行為完全不變（既有動作零影響）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('bump'); // dur 0.5、無 sustain
  anim.update(0.5, 0);
  anim.update(0.01, 0);
  assert.ok(anim.isIdle(), 'bump 應仍在 dur 0.5s 後結束（total===dur）');
});

// Phase 5 W1 §2 助跑三步節奏 ＋ §1b 慣用手（07-28 kickoff：表現層＋步序，戰術層不做）
// TICK（1/60）沿用檔案前段 §3 測試已宣告的常數
const APPROACH3_DUR = 0.75;
// 助跑取樣速度（07-28 修「原地跳舞」後必填）：步相擺幅綁 runW＝位移權重，
// 餵 speed=0 等於量「站著卻在助跑」——那是 bug 態，不是真實引擎產得出的狀態。
// 4.2 沿用本檔「步幅匹配」測試的快跑取樣值
const APPROACH_SPEED = 4.2;

test('§2-2 助跑三步節奏：三等分時段可見三次明確步相，第二步（制動步）擺幅與下沉都是三步之最', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('approach3');
  const totalTicks = Math.round(APPROACH3_DUR * 60);
  const thirds = [[], [], []];
  for (let i = 0; i < totalTicks; i += 1) {
    anim.update(TICK, APPROACH_SPEED);
    const stride = Math.max(
      Math.abs(rig.joints.rHip.rotation.x),
      Math.abs(rig.joints.lHip.rotation.x),
    );
    const crouchDepth = Math.max(rig.joints.rKnee.rotation.x, rig.joints.lKnee.rotation.x);
    const third = Math.min(Math.floor((i / totalTicks) * 3), 2);
    thirds[third].push({ stride, crouchDepth });
  }
  const peakStride = thirds.map((arr) => Math.max(...arr.map((x) => x.stride)));
  const peakCrouch = thirds.map((arr) => Math.max(...arr.map((x) => x.crouchDepth)));
  assert.ok(peakStride[1] > peakStride[0] && peakStride[1] > peakStride[2],
    `第二步（制動步）擺幅應是三步之最：${peakStride.map((v) => v.toFixed(3))}`);
  assert.ok(peakCrouch[1] > peakCrouch[0] && peakCrouch[1] > peakCrouch[2],
    `第二步（制動步）下沉應是三步之最（膝角代表壓低）：${peakCrouch.map((v) => v.toFixed(3))}`);
});

test('§1b 慣用手：左手選手助跑步序鏡像（右手＝左-右-左，左手＝右-左-右）', () => {
  // 各步窗中點抓一次「哪隻腳擺幅較大」，重建整段步序
  const leadAt = (handed, midFraction) => {
    const rig = mkRig(handed);
    const anim = createGeoAnimator(rig);
    anim.trigger('approach3');
    const ticks = Math.round(midFraction * APPROACH3_DUR * 60);
    for (let i = 0; i < ticks; i += 1) anim.update(TICK, APPROACH_SPEED);
    return Math.abs(rig.joints.rHip.rotation.x) > Math.abs(rig.joints.lHip.rotation.x) ? 'r' : 'l';
  };
  const midpoints = [1 / 6, 3 / 6, 5 / 6]; // 三步窗（各 1/3）各自的中點
  const rightOrder = midpoints.map((f) => leadAt('r', f));
  const leftOrder = midpoints.map((f) => leadAt('l', f));
  assert.deepEqual(rightOrder, ['l', 'r', 'l'], `右手步序應為左-右-左，實際 ${rightOrder}`);
  assert.deepEqual(leftOrder, ['r', 'l', 'r'], `左手步序應鏡像為右-左-右，實際 ${leftOrder}`);
});

test('§1b 慣用手分佈：決定論（同 id 兩次求值相同）＋ 抽樣比例接近 15%（非 Math.random）', () => {
  let left = 0;
  const N = 4000;
  for (let i = 0; i < N; i += 1) {
    const pid = `w1-handed-sample-${i}`;
    const first = isLeftHanded(pid);
    const second = isLeftHanded(pid);
    assert.equal(first, second, `同一 playerId 兩次求值應相同（${pid}）`);
    if (first) left += 1;
  }
  const ratio = left / N;
  assert.ok(ratio > 0.1 && ratio < 0.2, `左手比例應接近 15%，實際 ${(ratio * 100).toFixed(1)}%`);
});

// ---- §1b 慣用手：**真實引擎產得出來的球員**（07-29 W1 驗收第 7 項的缺口）----
// 上面那條用的是合成 id `w1-handed-sample-${i}`——遊戲裡不存在這種 id，
// 它只證明「這個純函式的值域分佈是 15%」，證明不了「場上看得到左手」。
// 這一組全部從 createGame()／careerMatchSetup() 實際建出來的球員取樣。
const handedOf = (p) => (isLeftHanded(p.id, p.name) ? 'l' : 'r');

// 快速比賽的全部球員（createDefaultTeams → createGame）
function quickPlayers(seed = 1) {
  return Object.values(createGame({ seed }).players);
}

// 生涯建隊路徑的全部球員（我方名冊＋自由人＋七隊對手＋各隊板凳）
function careerPlayers(seed = 7, gameSeed = 3) {
  const career = createCareer({ seed, playerName: '小夢' });
  const player = createCareerPlayer('小夢');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const out = [];
  for (const opp of OPPONENTS) {
    const setup = careerMatchSetup(
      career, player, { opponentId: opp.id, stage: 'group-1' }, roster, null,
    );
    out.push(...Object.values(createGame({ seed: gameSeed, ...setup }).players));
  }
  return out;
}

test('§1b 慣用手（真實球員）：快速比賽的 12 人不得全部同一手', () => {
  const players = quickPlayers();
  assert.equal(players.length, 12, '快速比賽應為雙方各六人');
  const left = players.filter((p) => handedOf(p) === 'l');
  assert.ok(left.length >= 1,
    `快速比賽場上必須看得到左手選手（修前是 0/12），實際 ${left.length}/12`);
  assert.ok(left.length < players.length, '不得全部判成左手');
});

test('§1b 慣用手（真實球員）：生涯建隊母體的左手比例落在 15% 量級', () => {
  // 同一個人可能在多場出現，先去重成「人」的母體
  const byKey = new Map();
  for (const p of careerPlayers()) byKey.set(`${p.id}|${p.name}`, p);
  const people = [...byKey.values()];
  assert.ok(people.length >= 50, `母體太小無法談比例（${people.length}）`);
  const left = people.filter((p) => handedOf(p) === 'l');
  const ratio = left.length / people.length;
  assert.ok(ratio > 0.05 && ratio < 0.3,
    `生涯球員左手比例應在 15% 量級，實際 ${(ratio * 100).toFixed(1)}%（${left.length}/${people.length}）`);
});

test('§1b 慣用手（真實球員）：跨場次／跨種子穩定——同一名球員永遠同一手', () => {
  // ① 快速比賽：換 seed 不換手
  const base = new Map(quickPlayers(1).map((p) => [p.id, handedOf(p)]));
  for (const seed of [2, 7, 99, 12345]) {
    for (const p of quickPlayers(seed)) {
      assert.equal(handedOf(p), base.get(p.id), `${p.id} 在 seed=${seed} 換了手`);
    }
  }
  // ② 生涯：同一名球員在不同對手場次／不同 game seed 下同一手
  const seen = new Map();
  for (const gameSeed of [3, 11, 808]) {
    for (const p of careerPlayers(7, gameSeed)) {
      const key = `${p.id}|${p.name}`;
      const h = handedOf(p);
      if (seen.has(key)) {
        assert.equal(h, seen.get(key), `生涯球員 ${key} 在不同場次／種子下換了手`);
      } else seen.set(key, h);
    }
  }
  assert.ok(seen.size >= 50, `生涯樣本數不足（${seen.size}）`);
  // ③ 主角本人（生涯路徑的 A2）必須有一隻穩定的手
  assert.ok(['l', 'r'].includes(seen.get('A2|小夢')), '主角 A2 未取到慣用手');
});

test('§2-3 等待姿勢：transitionWait 明顯不同於單純待命（前傾＋壓低，且可 hold 住）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('transitionWait');
  anim.update(0.05, 0);
  assert.ok(rig.joints.spine.rotation.x > 0.1, `應有前傾（${rig.joints.spine.rotation.x.toFixed(2)}）`);
  anim.update(1.2, 0); // 尚未到 sustain 上限（dur 0.3 + sustain 1.5）
  assert.ok(!anim.isIdle(), '在 sustain 期間應持續 hold 住等待姿勢');
});

// 07-28 Sawmah 試玩：「扣球前會左右左右跳動，但其實沒有移動位置，像在跳舞」
// 成因＝助跑步相照序列時間硬播、不看速度；4.7「到位即停＝原地拔起」讓人在
// 動畫播完前就站住 → 腿繼續踩。修法＝步相擺幅乘上 runW（平滑後的位移權重）。
// 量法：同一段助跑動畫，分別餵「有在跑」與「站著不動」，比較大腿擺幅的變化量
// （變化量而非絕對值——站定時允許有固定的預備屈膝，不允許的是「持續擺動」）
function hipSwingRange(speed) {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('approach3');
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 30; i += 1) { // approach3 全長內取樣
    anim.update(1 / 60, speed);
    const d = rig.joints.rHip.rotation.x - rig.joints.lHip.rotation.x; // 兩腿相對擺幅
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return hi - lo;
}

// 07-28 Sawmah 試玩：「人物移動的跳舞，主要是在**橫移**的時候，雙腿的移動變得很不自然」
// 成因＝舊版兩髖 rotation.z 同號（`* shuffleDir` 且幅度恆正）＝兩腿一起倒向同一邊，
// 不是併步的開合。geoCharacter.js:161-162 兩髖同向建立、角色右側在 −X ⇒
// 右腿外展＝負 z、左腿外展＝正 z，站距＝lHip.z − rHip.z。
test('側併步：兩腿必須相對開合（站距一寬一窄），不得一起倒向同一邊', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  let sameSign = 0;
  let widthMin = Infinity;
  let widthMax = -Infinity;
  for (let i = 0; i < 120; i += 1) {
    anim.update(1 / 60, 3.5, 1); // 純橫移
    const r = rig.joints.rHip.rotation.z;
    const l = rig.joints.lHip.rotation.z;
    if (i > 30 && Math.abs(r) > 0.01 && Math.abs(l) > 0.01 && Math.sign(r) === Math.sign(l)) sameSign += 1;
    const width = l - r; // 站距（正＝張開）
    if (i > 30) { widthMin = Math.min(widthMin, width); widthMax = Math.max(widthMax, width); }
  }
  assert.equal(sameSign, 0, `兩腿不得同時倒向同一邊（實測 ${sameSign} 幀同號）`);
  assert.ok(widthMin >= -0.01, `站距不得為負（腿交叉）：最小 ${widthMin.toFixed(3)}`);
  assert.ok(widthMax - widthMin > 0.15,
    `站距要有明顯開合（跨開→收攏）：實測 ${widthMin.toFixed(3)}~${widthMax.toFixed(3)}`);
});

// 瀏覽器逐幀實測（07-28）：玩家 A↔D 換向時 lateral 由 −1 單幀翻到 +1（幅值恆為 1、
// 只有正負號變），舊版雙腿因此**單幀鏡像 32°**。lateral 必須先平滑再驅動腿。
test('側併步：lateral 單幀翻號不得讓雙腿瞬間鏡像（玩家左右換向）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  for (let i = 0; i < 60; i += 1) anim.update(1 / 60, 3.5, -1); // 先穩定在往一邊
  const before = rig.joints.rHip.rotation.z;
  anim.update(1 / 60, 3.5, +1);                                 // 單幀翻到另一邊
  const jump = Math.abs(rig.joints.rHip.rotation.z - before);
  assert.ok(jump < 0.08, `單幀翻號造成的髖角跳變須受平滑限制（實測 ${jump.toFixed(3)} rad）`);
});

test('側併步：膝蓋不得同時跑前進步態（髖在併步、膝在走路＝兩套動作疊著）', () => {
  const sampleKneeAlternation = (lateral) => {
    const rig = mkRig();
    const anim = createGeoAnimator(rig);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 120; i += 1) {
      anim.update(1 / 60, 3.5, lateral);
      if (i > 30) {
        const d = rig.joints.rKnee.rotation.x - rig.joints.lKnee.rotation.x; // 左右膝差＝交替量
        lo = Math.min(lo, d); hi = Math.max(hi, d);
      }
    }
    return hi - lo;
  };
  const fwd = sampleKneeAlternation(0);
  const side = sampleKneeAlternation(1);
  assert.ok(side < fwd * 0.4,
    `橫移時膝的交替抬腿要明顯收掉（前進 ${fwd.toFixed(3)} vs 橫移 ${side.toFixed(3)}）`);
});

test('§2 助跑步相：站著不動時不得原地踏步（跳舞 bug 回歸）', () => {
  const still = hipSwingRange(0);
  assert.ok(still < 0.1, `站定時兩腿不得持續擺動（實測擺幅 ${still.toFixed(3)}）`);
});

test('§2 助跑步相：真的在跑時三步節奏仍在（修法不得把助跑一起關掉）', () => {
  const moving = hipSwingRange(4.2);
  const still = hipSwingRange(0);
  assert.ok(moving > 0.5, `助跑中應有明顯步相擺動（實測 ${moving.toFixed(3)}）`);
  assert.ok(moving > still * 5, `跑動與站定的擺幅要有量級差（跑 ${moving.toFixed(3)} vs 站 ${still.toFixed(3)}）`);
});

// 07-29 Sawmah 試玩：「舉球跟接球會還沒碰到手上就接起來或舉起來了，扣球也是」
// 根因＝**觸球那一幀播的是預備姿勢**：原本只在 sim 的 TOUCH 事件當下才 trigger 擊球
// 動作，擊球關鍵幀（bump 0.45／overhead 0.56／spike 0.42）要 0.2–0.3s 後才到
// （tools/contact-frame-probe.mjs 修前實測：接球落後 12.5 tick、舉球 17.5 tick）。
// 修法＝擊球動作也走提前量（matchLoop 依 contactPoint 倒數 hitLeadTicks 個 tick 觸發）。
// 本節守的是動畫端的三件事：①提前量算得對 ②觸球那一幀確實是擊球姿勢
// ③預備段的交棒（§3 兩次抬手）在新時序下仍然無縫
test('§4 提前量：hitLeadTicks＝序列起點到擊球關鍵幀的 tick 數（序列調時長會自動跟著調）', () => {
  assert.equal(hitLeadTicks('bump'), 14);      // 0.45 × 0.5s × 60
  assert.equal(hitLeadTicks('overhead'), 18);  // 0.56 × 0.55s × 60
  assert.equal(hitLeadTicks('spike'), 15);     // 0.42 × 0.6s × 60
  assert.equal(hitLeadTicks('dive'), 0, '沒有擊球關鍵幀的序列回 0＝不提前觸發');
  assert.equal(hitLeadTicks('nonexistent'), 0);
});

test('§4 接球：提前 hitLeadTicks 觸發後，觸球那一幀正好是擊球姿勢（bumpHit）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('receiveReady');
  for (let i = 0; i < 26 - hitLeadTicks('bump'); i += 1) anim.update(TICK, 0); // 預備段先撐著
  anim.trigger('bump');
  for (let i = 0; i < hitLeadTicks('bump'); i += 1) anim.update(TICK, 0);      // 倒數到觸球
  const p = anim.peek();
  assert.equal(p.type, 'bump');
  assert.ok(Math.abs(p.tNorm - SEQ_HIT.bump) < 0.04,
    `觸球幀應落在擊球關鍵幀 ${SEQ_HIT.bump}，實際 ${p.tNorm.toFixed(3)}`);
  // 姿勢驗證：bumpHit 的 rSh[0]=-1.2、bumpReady=-0.95——修前觸球幀停在 -0.95
  assert.ok(rig.joints.rShoulder.rotation.x < -1.15,
    `觸球幀的手臂應已伸到墊球位（bumpHit -1.2），實際 ${rig.joints.rShoulder.rotation.x.toFixed(2)}`);
});

test('§4 舉球：提前 hitLeadTicks 觸發後，觸球那一幀正好是推出姿勢（setPush）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('setReady');
  for (let i = 0; i < 11; i += 1) anim.update(TICK, 0); // 預備段（SET_READY_LEAD 34 → 提前量 29）
  anim.trigger('overhead');
  for (let i = 0; i < hitLeadTicks('overhead'); i += 1) anim.update(TICK, 0);
  const p = anim.peek();
  assert.ok(Math.abs(p.tNorm - SEQ_HIT.overhead) < 0.04,
    `觸球幀應落在擊球關鍵幀 ${SEQ_HIT.overhead}，實際 ${p.tNorm.toFixed(3)}`);
  // setReach 的 wrist=-0.42（後倒等球）、setPush=+0.4（推出去）——正負號就是「有沒有出手」
  assert.ok(rig.joints.rWrist.rotation.x > 0.25,
    `觸球幀應已壓腕推出（setPush wrist 0.4），實際 ${rig.joints.rWrist.rotation.x.toFixed(2)}`);
});

test('§4 交棒不得回退：提前觸發後的新時序下，setReady→overhead 仍然無縫（兩次抬手回歸）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('setReady');
  for (let i = 0; i < 11; i += 1) anim.update(TICK, 0); // 修後的交棒點比修前早 ~13 tick
  const before = rig.joints.rShoulder.rotation.x;
  assert.ok(before < -2.2, `交棒前手臂應完全舉起，實際 ${before.toFixed(2)}`);
  anim.trigger('overhead');
  let worst = before;
  for (let i = 0; i < 5; i += 1) { // ATTACK_MS 0.08s ≈ 5 tick＝沒有交棒時的漸入窗
    anim.update(TICK, 0);
    worst = Math.max(worst, rig.joints.rShoulder.rotation.x);
  }
  assert.ok(worst < -2.2, `交棒期間手臂不得放下，最鬆 ${worst.toFixed(2)}（應保持 ≈-2.3）`);
});

test('§4 扣球：windup→spike 的空中接續截在擊球關鍵幀（修前截在 0.5＝已在收臂）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('windup');
  let bodyY = 0;
  for (let i = 0; i < 24; i += 1) bodyY = anim.update(TICK, 0); // TAKEOFF_LEAD_TICKS＝24
  anim.trigger('spike');                                        // TOUCH 事件當下接手
  const after = anim.update(TICK, 0);
  const p = anim.peek();
  assert.ok(p.tNorm >= SEQ_HIT.spike && p.tNorm < 0.5,
    `接手後應落在擊球關鍵幀 ${SEQ_HIT.spike}（修前 0.528＝已越過），實際 ${p.tNorm.toFixed(3)}`);
  // 壓腕 snap：spikeHit wrist=+0.55、spikeUnlock=-0.62——正號＝手掌已蓋下去
  assert.ok(rig.joints.rWrist.rotation.x > 0.4,
    `觸球幀應正在壓腕擊球，實際 ${rig.joints.rWrist.rotation.x.toFixed(2)}`);
  assert.ok(Math.abs(after - bodyY) < 0.06,
    `跳躍弧不得因為接續點改變而跳動（windup ${bodyY.toFixed(3)} → spike ${after.toFixed(3)}）`);
});

// TOUCH 事件 → 該播哪一支（含「提前觸發已經在播就不重播」）——matchView 的唯一判準
test('§4 不重播：同一次接觸不得播兩次擊球動畫，型別不同才改播', () => {
  assert.equal(contactSeqFor('receive', 1.2, 'bump'), null, '已提前播 bump＝不重播');
  assert.equal(contactSeqFor('set', 2.7, 'overhead'), null, '已提前播 overhead＝不重播');
  assert.equal(contactSeqFor('spike', 3.1, 'spike'), null);
  // 事前判低手、實際球高過門檻 ⇒ 當場改播高手（＝修前行為，不會變差）
  assert.equal(contactSeqFor('receive', 1.9, 'bump'), 'overhead');
  // 沒有提前觸發（玩家操控、被距離閘擋下、逾時作廢）＝照舊由 TOUCH 播
  assert.equal(contactSeqFor('receive', 1.2, null), 'bump');
  assert.equal(contactSeqFor('receive', 1.6, null), 'overhead', '門檻 1.6 含等於');
  assert.equal(contactSeqFor('set', 2.7, null), 'overhead');
  assert.equal(contactSeqFor('spike', 3.1, null), 'spike');
  assert.equal(contactSeqFor('dive', 0.4, null), null, '魚躍觸球由 divedUntil 偵測負責');
});
