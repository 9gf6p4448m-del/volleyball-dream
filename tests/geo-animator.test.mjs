// 幾何動畫 — 魚躍動作（修「按魚躍站著不動」bug 的回歸測試）
// geoAnimator 是純函式（rig 注入），node 可測；驗 dive 動作驅動撲救姿勢
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGeoAnimator } from '../src/render/geoAnimator.js';
import { isLeftHanded } from '../src/render/geoCharacter.js';

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
