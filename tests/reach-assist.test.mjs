// 夠球視覺補償 — 純函式驗收（07-29；07-30 補窗門動作別校準）
// 起因：Sawmah 試玩「舉球跟接球現在會還沒碰到手上就接起來，扣球也是」。
// sim 觸球判定半徑不由本層校準（平衡命脈），改在表現層讓人去夠球；07-30 起
// 窗門全開半徑改吃 reachRadiusFor（依動作別＋當前身高），不再是脫鉤的flat 常數。
// 驗收五件事：①單調 ②有上限 ③球就在手上時零偏置 ④左右對稱 ⑤時間包絡連續且窗外為 0，
// 外加骨架估算（handPos）與座標轉換的回歸——手的位置估錯過一次（忽略肘彎高估 0.26m，
// 導致接球被誤判成「手已經到球了」而完全不補償），故單獨立測。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REACH, reachBias, reachWindow, applyReachBias, handPos, armAimX,
  localBallOffset, worldReachOffset,
} from '../src/render/reachAssist.js';
import { reachRadiusFor, REACH_ACTION } from '../src/sim/reach.js';
import { TUNING } from '../src/sim/game.js';

const H = 1.85; // 基準身高
// 「手臂完全垂下、軀幹直立」的基準姿勢——手正好在身體中線上，fwd 直接就是手到球的落差，
// 單調性/對稱性測試用它才不會被手已伸出的長度干擾
const REST = { armXR: 0, armXL: 0, elbowXR: 0, elbowXL: 0, trunkX: 0, scale: 1 };
const REST_HAND = handPos(0, 0, 0, 1);

// ---- ① 單調：偏移越大、偏置越大 ----

test('單調：正前方落差越大，根位移／前傾／手臂指向的偏置越大', () => {
  let prevRoot = -1;
  let prevLean = -1;
  let prevArm = -1;
  for (const fwd of [0.2, 0.3, 0.4, 0.5, 0.6]) {
    const b = reachBias({ ...REST, fwd, up: REST_HAND.up, w: 1 });
    assert.ok(b.rootFwd > prevRoot, `fwd=${fwd} 根位移 ${b.rootFwd} 應大於 ${prevRoot}`);
    assert.ok(b.spineX > prevLean, `fwd=${fwd} 前傾 ${b.spineX} 應大於 ${prevLean}`);
    assert.ok(Math.abs(b.rShX) > prevArm, `fwd=${fwd} 手臂指向偏置 ${b.rShX} 應更大`);
    prevRoot = b.rootFwd;
    prevLean = b.spineX;
    prevArm = Math.abs(b.rShX);
  }
});

test('單調：側向落差越大，側倒／轉體／手臂橫移越大', () => {
  let prevZ = -1;
  let prevTwist = -1;
  let prevArm = -1;
  for (const right of [0.2, 0.3, 0.4, 0.5, 0.6]) {
    const b = reachBias({ ...REST, right, fwd: REST_HAND.fwd, up: REST_HAND.up, w: 1 });
    assert.ok(b.spineZ > prevZ, `right=${right} 側倒 ${b.spineZ} 應更大`);
    assert.ok(-b.chestY > prevTwist, `right=${right} 轉體 ${b.chestY} 應更大`);
    assert.ok(b.rShZ > prevArm, `right=${right} 肩橫移 ${b.rShZ} 應更大`);
    prevZ = b.spineZ;
    prevTwist = -b.chestY;
    prevArm = b.rShZ;
  }
});

test('單調：球高過手越多，垂直伸展越大（球在手下方＝零伸展，不得把腳插進地板）', () => {
  let prev = -1;
  for (const extra of [0.05, 0.1, 0.2, 0.3]) {
    const b = reachBias({ ...REST, fwd: 0.6, up: REST_HAND.up + extra, w: 1 });
    assert.ok(b.rootUp > prev, `高出 ${extra} 的伸展 ${b.rootUp} 應更大`);
    prev = b.rootUp;
  }
  for (const below of [0.1, 0.5, 2]) {
    const b = reachBias({ ...REST, fwd: 0.6, up: REST_HAND.up - below, w: 1 });
    assert.equal(b.rootUp, 0, '球在手下方不得往上伸展');
  }
});

test('單調：包絡權重越大、偏置越大（同一落差下線性於 w）', () => {
  let prev = -1;
  for (const w of [0, 0.25, 0.5, 0.75, 1]) {
    const b = reachBias({ ...REST, fwd: 0.9, up: REST_HAND.up, w });
    assert.ok(b.rootFwd >= prev, `w=${w} 應不小於前一檔`);
    if (w > 0) assert.ok(b.rootFwd > prev, `w=${w} 應嚴格大於前一檔`);
    prev = b.rootFwd;
  }
});

// ---- ② 上限：餵極端值不得爆走 ----

test('上限：極端落差下全部偏置仍在宣告上限內（含斜向不得偷跑到 √2 倍）', () => {
  const cases = [
    { right: 50, fwd: 50, up: 50 },
    { right: -999, fwd: 999, up: -999 },
    { right: 1e6, fwd: 0, up: 1e6 },
    { right: 0, fwd: -1e6, up: 0 },
    { right: 3, fwd: 4, up: 9 },
  ];
  for (const c of cases) {
    const b = reachBias({ ...c, w: 1, armXR: -2.72, armXL: -2.72, elbowXR: -0.25, elbowXL: -0.25 });
    for (const [k, val] of Object.entries(b)) {
      assert.ok(Number.isFinite(val), `${k} 應為有限值，得到 ${val}`);
    }
    const rootMag = Math.hypot(b.rootRight, b.rootFwd);
    assert.ok(rootMag <= REACH.ROOT_MAX + 1e-9, `水平根位移 ${rootMag} 超過上限`);
    assert.ok(Math.hypot(rootMag, b.rootUp) <= 0.35, '根位移總量硬上限 0.35m（工單限制）');
    assert.ok(b.rootUp >= 0 && b.rootUp <= REACH.LIFT_MAX + 1e-9, `垂直伸展 ${b.rootUp} 越界`);
    assert.ok(b.spineX <= REACH.LEAN_MAX + 1e-9 && b.spineX >= -REACH.LEAN_BACK_MAX - 1e-9);
    assert.ok(Math.abs(b.spineZ) <= REACH.LEAN_MAX + 1e-9);
    assert.ok(Math.abs(b.chestY) <= REACH.TWIST_MAX + 1e-9);
    assert.ok(Math.abs(b.pelvisY) <= REACH.TWIST_MAX + 1e-9);
    for (const k of ['rShX', 'rShZ', 'lShX', 'lShZ']) {
      assert.ok(Math.abs(b[k]) <= REACH.ARM_MAX + 1e-9, `${k}=${b[k]} 超過肩偏置上限`);
    }
  }
});

test('上限：w 超出 0..1 會被夾住（負 w 不得反向拉、>1 不得放大）', () => {
  assert.equal(reachBias({ ...REST, fwd: 1, w: -5 }).rootFwd, 0);
  const at1 = reachBias({ ...REST, fwd: 1, up: REST_HAND.up, w: 1 });
  const over = reachBias({ ...REST, fwd: 1, up: REST_HAND.up, w: 99 });
  assert.equal(over.rootFwd, at1.rootFwd);
});

test('上限：後仰上限比前傾嚴（球在身後不得整個人往後倒）', () => {
  const back = reachBias({ ...REST, fwd: -5, up: REST_HAND.up, w: 1 });
  assert.equal(back.spineX, -REACH.LEAN_BACK_MAX);
  assert.ok(REACH.LEAN_BACK_MAX < REACH.LEAN_MAX);
});

// ---- ③ 球就在手上（落差≈0）＝零偏置（既有觀感一格不動）----

test('零落差／死區內：全部偏置為 0——球已經在手上時既有動作完全不受影響', () => {
  const at = { fwd: REST_HAND.fwd, up: REST_HAND.up };
  for (const d of [{ right: 0, fwd: 0 }, { right: 0.05, fwd: 0.05 },
    { right: 0, fwd: REACH.DEAD_ZONE }, { right: -0.08, fwd: 0.08 }]) {
    const b = reachBias({ ...REST, ...at, right: d.right, fwd: at.fwd + d.fwd, w: 1 });
    for (const [k, val] of Object.entries(b)) assert.equal(val, 0, `${k} 應為 0（落差在死區內）`);
  }
});

test('死區連續性：跨過死區邊界不得跳變', () => {
  const base = { ...REST, up: REST_HAND.up, w: 1 };
  const a = reachBias({ ...base, fwd: REST_HAND.fwd + REACH.DEAD_ZONE - 1e-6 });
  const c = reachBias({ ...base, fwd: REST_HAND.fwd + REACH.DEAD_ZONE + 1e-6 });
  assert.ok(Math.abs(c.rootFwd - a.rootFwd) < 1e-5, '死區邊界應連續');
  assert.ok(Math.abs(c.spineX - a.spineX) < 1e-5);
});

test('w=0（窗外）：全部偏置為 0', () => {
  const b = reachBias({ right: 1.2, fwd: 1.2, up: 3, w: 0, armXR: -2.7, armXL: -2.7 });
  for (const [k, val] of Object.entries(b)) assert.equal(val, 0, `${k} 應為 0（包絡窗外）`);
});

// ---- ④ 左右對稱 ----

test('左右對稱：right 取負號，橫向欄位鏡像、縱向欄位不變', () => {
  const args = { ...REST, fwd: 0.7, up: REST_HAND.up, w: 0.8 };
  const r = reachBias({ ...args, right: 0.5 });
  const l = reachBias({ ...args, right: -0.5 });
  for (const k of ['rootRight', 'spineZ', 'chestY', 'pelvisY', 'rShZ', 'lShZ']) {
    assert.ok(Math.abs(r[k] + l[k]) < 1e-12, `${k} 應左右反號：${r[k]} vs ${l[k]}`);
    assert.ok(Math.abs(r[k]) > 0, `${k} 應非零（有側向落差）`);
  }
  for (const k of ['rootFwd', 'rootUp', 'spineX', 'rShX', 'lShX']) {
    assert.ok(Math.abs(r[k] - l[k]) < 1e-12, `${k} 不應受左右影響：${r[k]} vs ${l[k]}`);
  }
});

test('雙手／慣用手：舉球接球雙手同步、扣球只動慣用手（左肩零偏置）', () => {
  const args = {
    right: 0.4, fwd: 0.9, up: 2.2, w: 1, armXR: -2.5, armXL: -2.5, trunkX: 0, scale: 1,
  };
  const both = reachBias({ ...args, kind: 'both' });
  assert.ok(Math.abs(both.lShZ - both.rShZ) < 1e-12, '雙手橫向同號同量＝平墊/舉球形狀不變');
  assert.ok(Math.abs(both.lShX - both.rShX) < 1e-12);
  assert.ok(Math.abs(both.rShZ) > 0);
  const dom = reachBias({ ...args, kind: 'dominant' });
  assert.equal(dom.lShX, 0, '扣球：非慣用手不延伸');
  assert.equal(dom.lShZ, 0);
  assert.equal(dom.rShX, both.rShX, '慣用手偏置與雙手版相同');
});

// ---- 手臂指向球（高球舉更高、低球放更低）----

test('手臂指向球：手臂高舉但球在低處＝往下放；手臂低垂但球在高處＝往上舉', () => {
  // 肩角 x 越負＝越往上（0＝垂下、−π/2＝水平前指、−π＝直上）
  const high = reachBias({
    ...REST, armXR: -2.72, armXL: -2.72, fwd: 1.0, up: 1.0, w: 1,
  });
  assert.ok(high.rShX > 0, `雙臂高舉、球在低前方 → 應往下放（正值），得到 ${high.rShX}`);
  const low = reachBias({
    ...REST, armXR: -1.0, armXL: -1.0, fwd: 0.8, up: 2.6, w: 1,
  });
  assert.ok(low.rShX < 0, `雙臂低垂、球在高處 → 應往上舉（負值），得到 ${low.rShX}`);
});

test('armAimX：正前方＝水平前指、正上方＝直上、斜上 45°＝兩者之間', () => {
  assert.ok(Math.abs(armAimX(1, 0) - (-Math.PI / 2)) < 1e-12);
  assert.ok(Math.abs(armAimX(0, 1) - (-Math.PI)) < 1e-12);
  const diag = armAimX(1, 1);
  assert.ok(diag < -Math.PI / 2 && diag > -Math.PI);
  assert.ok(Math.abs(diag - (-3 * Math.PI / 4)) < 1e-12);
});

// ---- 骨架估算（回歸：忽略肘彎會高估手伸出去多少）----

test('handPos：肘彎會縮短手伸出的距離（忽略肘的舊版高估 0.2m 以上）', () => {
  const straight = handPos(-2.3, 0, -0.22, 1);
  const bent = handPos(-2.3, -1.0, -0.22, 1); // setReach 的實際肘角
  assert.ok(bent.fwd < straight.fwd - 0.2, `肘彎應明顯縮短前伸：${bent.fwd} vs ${straight.fwd}`);
  assert.ok(bent.up > straight.up, '肘彎（前臂折回）會把手收高一點');
});

test('handPos：手臂垂下＝手在身體中線、約在髖高；手臂直上＝手在頭頂之上', () => {
  const down = handPos(0, 0, 0, 1);
  assert.ok(Math.abs(down.fwd) < 1e-12, '垂下時手不該在身體前方');
  assert.ok(down.up > 0.8 && down.up < 1.1, `垂手高度 ${down.up} 應在髖附近`);
  const up = handPos(-Math.PI, 0, 0, 1);
  assert.ok(Math.abs(up.fwd) < 1e-9);
  assert.ok(up.up > 2.2, `舉直手高度 ${up.up} 應高過頭頂`);
  // 水平前指：手完全在身體前方、與肩同高
  const flat = handPos(-Math.PI / 2, 0, 0, 1);
  assert.ok(Math.abs(flat.fwd - REACH.ARM_LEN) < 1e-9);
  assert.ok(Math.abs(flat.up - (REACH.SPINE_Y + REACH.SHOULDER_UP)) < 1e-9);
});

test('handPos：身高縮放同比例縮放手的位置', () => {
  const a = handPos(-1.2, -0.3, 0.4, 1);
  const b = handPos(-1.2, -0.3, 0.4, 0.5);
  assert.ok(Math.abs(b.fwd - a.fwd * 0.5) < 1e-12);
  assert.ok(Math.abs(b.up - a.up * 0.5) < 1e-12);
});

// ---- 前傾的高度閘（前傾會把手往下帶）----

test('高度閘：球高過手時前傾收掉（不然只會讓落差更大），球與手同高時全開', () => {
  const base = { ...REST, fwd: 1.0, w: 1 };
  const level = reachBias({ ...base, up: REST_HAND.up });
  const above = reachBias({ ...base, up: REST_HAND.up + REACH.LEAN_UP_SPAN });
  const wayAbove = reachBias({ ...base, up: REST_HAND.up + 2 });
  assert.ok(level.spineX > 0, '球與手同高：前傾正是把手送過去的動作，應照做');
  assert.equal(above.spineX, 0, '球高過閘門寬度＝前傾完全收掉');
  assert.equal(wayAbove.spineX, 0);
  assert.ok(level.rootFwd > 0 && Math.abs(wayAbove.rootFwd - level.rootFwd) < 1e-12,
    '根位移是純水平手段，不受高度閘影響');
});

// ---- ⑤ 時間包絡 ----

test('包絡：窗內為 1、窗外為 0、中間單調下降', () => {
  // 07-30：水平全開半徑改吃 reachRadiusFor（動作別＋當前身高）單一真相，不再是
  // REACH.WINDOW_FULL 這種脫鉤常數——這裡用同一份函式重算期望值，而非另立magic number
  const full = reachRadiusFor(REACH_ACTION.SPIKE, TUNING, H); // reachWindow 預設動作＝SPIKE
  assert.equal(reachWindow(0, 1.2, H), 1, '球在身上＝窗全開');
  assert.equal(reachWindow(full, 1.2, H), 1, '可及半徑處仍全開');
  assert.equal(reachWindow(full + REACH.WINDOW_FADE_PAD, 1.2, H), 0, '淡出距離外＝關閉');
  assert.equal(reachWindow(50, 1.2, H), 0);
  let prev = 1.0000001;
  for (let d = 0; d <= 3; d += 0.05) {
    const w = reachWindow(d, 1.2, H);
    assert.ok(w <= prev + 1e-12, `d=${d.toFixed(2)} 包絡應單調不增`);
    assert.ok(w >= 0 && w <= 1);
    prev = w;
  }
});

test('包絡：全開半徑依動作別而不同（接 0.38H ＜ 舉 0.45H ＜ 扣 0.55H），且隨身高縮放', () => {
  const fullRecv = reachRadiusFor(REACH_ACTION.RECEIVE, TUNING, H);
  const fullSet = reachRadiusFor(REACH_ACTION.SET, TUNING, H);
  const fullSpike = reachRadiusFor(REACH_ACTION.SPIKE, TUNING, H);
  assert.ok(fullRecv < fullSet && fullSet < fullSpike, '三動作可及半徑應嚴格遞增');
  // 剛好卡在 receive 全開半徑之外、但仍在 spike 全開半徑內的距離：
  // 用 receive 動作呼叫應已開始淡出，用 spike 動作呼叫仍應全開
  const d = (fullRecv + fullSpike) / 2;
  assert.ok(d > fullRecv && d < fullSpike, '測試點應介於兩個半徑之間（前提自查）');
  assert.ok(reachWindow(d, 1.2, H, REACH_ACTION.RECEIVE) < 1, 'receive 半徑較窄，這裡不該仍全開');
  assert.equal(reachWindow(d, 1.2, H, REACH_ACTION.SPIKE), 1, 'spike 半徑夠寬，這裡仍應全開');
  // 未指定動作＝預設 SPIKE（三動作中最寬，寧可窗開早也不要漏接）
  assert.equal(reachWindow(d, 1.2, H), reachWindow(d, 1.2, H, REACH_ACTION.SPIKE));
  // 隨身高縮放：高個子的全開半徑不應更小
  assert.ok(reachRadiusFor(REACH_ACTION.SPIKE, TUNING, 1.95) >= reachRadiusFor(REACH_ACTION.SPIKE, TUNING, 1.7));
});

test('包絡：距離掃描無跳變（相鄰 1cm 的變化量 < 0.05）', () => {
  let prev = reachWindow(0, 1.2, H);
  for (let d = 0; d <= 3; d += 0.01) {
    const w = reachWindow(d, 1.2, H);
    assert.ok(Math.abs(w - prev) < 0.05, `d=${d.toFixed(2)} 出現跳變 ${prev}→${w}`);
    prev = w;
  }
});

test('包絡：高度閘——頭上過高的球不得讓人歪身子，但正在扣的球必須全開', () => {
  const top = H * REACH.TOP_MUL;
  assert.equal(reachWindow(0.8, top, H), 1, '可及高度內＝全開');
  assert.equal(reachWindow(0.8, top + REACH.TOP_FADE, H), 0, '遠高於可及＝關閉');
  // 實測擊球高度：舉球 p50 2.79m、扣球 p50 3.09m（腳底起算，扣球另有跳躍抵銷）
  assert.equal(reachWindow(0.9, 2.79, H), 1, '舉球擊球點必須在窗內');
  assert.equal(reachWindow(1.0, 3.09, H), 1, '扣球擊球點必須在窗內');
  let prev = reachWindow(0.8, 0, H);
  for (let up = 0; up <= 5; up += 0.01) {
    const w = reachWindow(0.8, up, H);
    assert.ok(Math.abs(w - prev) < 0.05, `up=${up.toFixed(2)} 出現跳變`);
    prev = w;
  }
  assert.ok(reachWindow(0.8, 3.4, 1.95) >= reachWindow(0.8, 3.4, 1.7), '高個子的可及窗不應更小');
});

test('包絡：時間平滑（matchView 用的指數收斂）從 0 漸入、無單幀跳變', () => {
  const dt = 1 / 60;
  let w = 0;
  const steps = [];
  for (let i = 0; i < 60; i += 1) {
    w += (1 - w) * (1 - Math.exp(-REACH.SMOOTH_K * dt));
    steps.push(w);
  }
  assert.ok(steps[0] < 0.25, '第一幀不得直接跳到滿檔');
  for (let i = 1; i < steps.length; i += 1) {
    assert.ok(steps[i] > steps[i - 1], '應單調漸入');
    assert.ok(steps[i] - steps[i - 1] < 0.25, '單幀增量不得過大');
  }
  assert.ok(steps.at(-1) > 0.99, '1 秒內應收斂到滿檔');
  let d = 1;
  for (let i = 0; i < 60; i += 1) d += (0 - d) * (1 - Math.exp(-REACH.SMOOTH_K * dt));
  assert.ok(d < 0.01, '漸出應收斂回 0');
});

// ---- 座標轉換 ----

test('本地偏移：朝向 +Z（yaw=0）時，世界 −X 的球＝角色右手側（geoCharacter 檔頭約定）', () => {
  const o = localBallOffset(-1, 0, 0);
  assert.ok(Math.abs(o.right - 1) < 1e-12, '角色右手側＝−X');
  assert.ok(Math.abs(o.fwd) < 1e-12);
  const f = localBallOffset(0, 1, 0);
  assert.ok(Math.abs(f.fwd - 1) < 1e-12, '面向 +Z 時，世界 +Z 的球在正前方');
  const back = localBallOffset(0, 1, Math.PI);
  assert.ok(Math.abs(back.fwd + 1) < 1e-12, '轉身 180°：世界 +Z 的球變成在背後');
});

test('世界⇄本地往返：任意 yaw 下 localBallOffset ∘ worldReachOffset ＝ 恆等', () => {
  for (const yaw of [0, 0.7, -1.3, Math.PI, 2.9, -3.05]) {
    for (const [right, fwd] of [[0.3, 0.9], [-0.4, -0.2], [1, 0]]) {
      const wOff = worldReachOffset(right, fwd, yaw);
      const back = localBallOffset(wOff.dx, wOff.dz, yaw);
      assert.ok(Math.abs(back.right - right) < 1e-12, `yaw=${yaw} right 往返失真`);
      assert.ok(Math.abs(back.fwd - fwd) < 1e-12, `yaw=${yaw} fwd 往返失真`);
    }
  }
});

// ---- 套用層（matchView 逐幀呼叫的那一步）----

function mkJoints() {
  const j = {};
  for (const n of ['spine', 'spineUpper', 'pelvis', 'rShoulder', 'lShoulder']) {
    j[n] = { rotation: { x: 0, y: 0, z: 0 } };
  }
  return j;
}

test('applyReachBias：疊加在動畫值之上，且 spine.z 是絕對指派（逐幀呼叫不得累加）', () => {
  const j = mkJoints();
  const b = reachBias({ ...REST, right: 0.4, fwd: 0.8, up: REST_HAND.up, w: 1 });
  assert.ok(b.spineZ !== 0);
  j.spine.rotation.x = 0.5; // 假裝 geoAnimator 這幀寫的值
  applyReachBias(j, b);
  assert.ok(Math.abs(j.spine.rotation.x - (0.5 + b.spineX)) < 1e-12, 'spine.x 應疊加');
  assert.equal(j.spine.rotation.z, b.spineZ);
  // 連跑 100 幀（geoAnimator 每幀絕對指派 x，z 它不寫）——z 不得累加成陀螺
  for (let i = 0; i < 100; i += 1) {
    j.spine.rotation.x = 0.5;
    j.spineUpper.rotation.y = 0;
    j.pelvis.rotation.y = 0;
    j.rShoulder.rotation.x = -1.2;
    j.rShoulder.rotation.z = -0.24;
    j.lShoulder.rotation.x = -1.2;
    j.lShoulder.rotation.z = 0.24;
    applyReachBias(j, b);
  }
  assert.ok(Math.abs(j.spine.rotation.z - b.spineZ) < 1e-12, 'spine.z 不得逐幀累加');
  assert.ok(Math.abs(j.rShoulder.rotation.z - (-0.24 + b.rShZ)) < 1e-12);
});

test('applyReachBias：零偏置＝關節值與動畫輸出完全相同（補償關閉時零影響）', () => {
  const j = mkJoints();
  j.spine.rotation.x = 0.5;
  j.spineUpper.rotation.y = 0.16;
  j.rShoulder.rotation.x = -2.72;
  applyReachBias(j, reachBias({ right: 2, fwd: 2, up: 2, w: 0 }));
  assert.equal(j.spine.rotation.x, 0.5);
  assert.equal(j.spine.rotation.z, 0);
  assert.equal(j.spineUpper.rotation.y, 0.16);
  assert.equal(j.rShoulder.rotation.x, -2.72);
});

test('決定論／純度：同輸入同輸出，且模組零 three.js／DOM／亂數來源（node 可直測的前提）', () => {
  const args = {
    right: 0.31, fwd: 0.77, up: 2.1, w: 0.62, armXR: -2.1, armXL: -1.9, trunkX: 0.2, scale: 0.95,
  };
  assert.deepEqual(reachBias(args), reachBias(args));
  const src = readFileSync(new URL('../src/render/reachAssist.js', import.meta.url), 'utf8');
  for (const bad of ["from 'three", 'Math.random(', 'document.', 'window.', 'Date.now(']) {
    assert.ok(!src.includes(bad), `reachAssist.js 不得含 ${bad}`);
  }
});
