// 職業章批 4c「二段時間差（案 C，地基級）」— sim 層／生涯層（2026-08-26）
// 驗收＝docs/kickoffs/acceptance-pro-batch4c.md（F1-F5，動手前凍結）。
// ★同日 Sawmah 拍板丙（純幾何降級）★：機率騙牆層（lane 申報＋retargetP 擲骰）
// 整層刪除——F4 系列改寫為純幾何斷言（球飛新線＋牆按真實站位結算＋機率層刪乾淨），
// F2 折損/體力斷言逐值改新提案值（timeMul 1.1／COST_SPIKE_TWIST 0.011）。
// 輸入層接線（第二段拖曳→intent.retargetAim）另見 tests/pro-batch4c-wiring.test.mjs。
//
// ★ 改前紅紀律（壞版自證防 import 旁枝）★
// 本檔**只 import 改制前就存在的符號**——在 fcc3a38（改制前）上跑，紅的是
// 行為斷言（「變向沒生效：球仍飛第一段的線」「攔網沒被騙」），不是 import 錯誤。
// 新增的具名匯出（computeRetarget／retargetEligible）的測試住 wiring 檔，
// 且該檔以 namespace import 取用（缺符號＝undefined＝行為紅，不炸整檔）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';
import { createPlayer } from '../src/sim/player.js';
import { STAMINA, attrCostMul } from '../src/sim/stamina.js';
import { TECH_DEFS, unlockTechnique } from '../src/career/growth.js';
import { EVENT_DEFS, dueEvents, isOnceEvent } from '../src/career/events.js';
import { createCareerPlayer, normalizeCareerPlayer } from '../src/career/careerState.js';
import { resolveTechGates } from '../src/app/matchConfig.js';

// §十-4b 慣例（同 deception.test.mjs）：釘死 tool 關閉，隔離量測目標
TUNING.TOOL_CHANCE = 0;

// ════════════════════════════════════════════════════════════════
// 治具：A 隊第三擊扣球情境（範式抄 tests/deception.test.mjs 的 rigSpike）
//   aim＝第一段承諾的線；retargetAim＝滯空第二段改選的新落點（null＝不變向）
//   blockX＝B2 攔網站位 x（null＝無攔網）；blockWhen＝'before'（扣球前開窗＝已起跳）
//   ／'after'（扣球後 1 tick 才開窗＝晚跳，讀真實球路）
// ════════════════════════════════════════════════════════════════
const AIM_FIRST = { x: 4.5, z: -5 };   // 第一段：右側斜線
const AIM_NEW = { x: -4.5, z: -5 };    // 變向後：左側斜線（夾角 ~72° > θmax 60 ⇒ 封頂）
// 兩條線各自的過網 x（from z=1.2 → z=-5，f=1.2/6.2）——拍板丙後這是**治具的
// 站位座標**：把牆的身體放在哪條線的過網點上（幾何蓋不蓋得到，bandContact 判）
const CROSS_X_NEW = AIM_NEW.x * (1.2 / 6.2); // ≈ -0.871（變向後新線）
const CROSS_X_FIRST = AIM_FIRST.x * (1.2 / 6.2); // ≈ +0.871（第一段承諾的線）

// blockLaneX＝隨 block intent 帶的 lane 申報。★拍板丙後 sim 已無任何消費者＝
// 死欄位★——僅 F4③ 壞版自證用：塞回機率騙牆層的壞版（4050d89）會消費它。
// blockWhen 僅控制起跳先後
function rigSpike(seed, { aim = AIM_FIRST, retargetAim = null, blockX = null,
  blockLaneX = null,
  blockWhen = 'before', stamina = false, lockTech = false, staminaValue = null } = {}) {
  const g = createGame({ seed, ...(stamina ? { stamina: true } : {}) });
  if (lockTech) g.players.A2.techniques.doubleSpike = 0; // 生涯未受教的形狀
  if (stamina && staminaValue !== null) g.stamina.A2 = staminaValue;
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'arc';
  r.possession = 'A';
  r.touches = 2;
  r.lastTouchTeam = 'A';
  r.lastToucherId = 'A1';
  g.actors.A2.x = 0; g.actors.A2.z = 1.2;
  if (blockX !== null) { g.actors.B2.x = blockX; g.actors.B2.z = -0.6; }
  const b = g.ball;
  b.x = 0; b.y = 3.0; b.z = 1.2;
  b.vx = 0; b.vy = -0.5; b.vz = 0;
  b.px = b.x; b.py = b.y + 0.05; b.pz = b.z;
  const blockIntent = (action = 'block') => {
    const bi = createIntent({ playerId: 'B2', tick: g.tick, action, aim: { x: 0, z: 0 } });
    // 拍板丙後 intent.laneX 是 sim 忽略的死欄位（F4③ 壞版自證治具用）；
    // null＝不帶
    if (blockLaneX !== null) bi.laneX = blockLaneX;
    return bi;
  };
  const evs = [];
  if (blockX !== null && blockWhen === 'before') {
    evs.push(...stepGame(g, [blockIntent()]));
  } else if (blockX !== null && blockWhen === 'after' && blockLaneX !== null) {
    // 晚跳治具：變向前先送一個無 action 的 intent（拍板丙後 laneX 無人消費，
    // 這一步只是保留與改制前相同的 tick 節奏）
    evs.push(...stepGame(g, [blockIntent(null)]));
  } else {
    evs.push(...stepGame(g, []));
  }
  const it = createIntent({ playerId: 'A2', tick: g.tick, action: 'spike', aim });
  if (retargetAim) it.retargetAim = { ...retargetAim }; // 同輸入層：建好 intent 再補屬性
  evs.push(...stepGame(g, [it]));
  if (blockX !== null && blockWhen === 'after') {
    evs.push(...stepGame(g, [blockIntent()]));
  }
  return { g, evs };
}

function runToDead(g, maxTicks = 900) {
  const out = [];
  for (let i = 0; i < maxTicks && g.phase === 'rally'; i += 1) out.push(...stepGame(g, []));
  return out;
}

// 逐 tick 全狀態快照（決定論／逐值無效果比對用；範式同 tools/sim-hash-probe.mjs）
function snapshot(g, evs) {
  const b = g.ball;
  return JSON.stringify({
    t: g.tick,
    ph: g.phase,
    ball: [b.x, b.y, b.z, b.vx, b.vy, b.vz],
    act: Object.keys(g.actors).sort().map((id) => {
      const a = g.actors[id];
      return [id, a.x, a.z, a.blockUntil, a.blockStartTick, a.lastTouchTick, a.divedUntil];
    }),
    rally: g.rally,
    score: [g.match.score.A, g.match.score.B],
    ev: evs,
  });
}

// ════════════════════════════════════════════════════════════════
// F2①（★指定改前紅主測★）：二段變向真的生效——球飛**新落點**那條線。
// 改制前（fcc3a38）retargetAim 被 sim 整個忽略 ⇒ 球仍飛第一段 AIM_FIRST（x>0），
// 本測的行為斷言（落點在左半場、離新落點比離舊落點近）當場紅。
// ════════════════════════════════════════════════════════════════
test('F2① 滯空變向生效：球飛向第二段的新落點，不是第一段承諾的線', () => {
  const { g, evs } = rigSpike(11, { retargetAim: AIM_NEW });
  // ★行為斷言排最前（§6.1-1：改前紅必須紅在「球飛哪」，不是紅在觀測旗標）★
  const dead = runToDead(g).find((e) => e.type === 'DEAD_BALL');
  assert.ok(dead && dead.at, '應有帶座標的 DEAD_BALL');
  const dNew = Math.hypot(dead.at.x - AIM_NEW.x, dead.at.z - AIM_NEW.z);
  const dOld = Math.hypot(dead.at.x - AIM_FIRST.x, dead.at.z - AIM_FIRST.z);
  assert.ok(dead.at.x < 0,
    `變向沒生效：球仍飛第一段的線（落點 x=${dead.at.x.toFixed(2)} 應在左半場 <0）`);
  assert.ok(dNew < dOld,
    `落點應靠新落點：離新 ${dNew.toFixed(2)}m、離舊 ${dOld.toFixed(2)}m`);
  // 觀測旗標（表現層/播報/成長統計的資料底）殿後
  assert.ok(evs.some((e) => e.type === 'TOUCH' && e.kind === 'spike' && e.retarget === true),
    'TOUCH 事件應帶 retarget 觀測旗標');
});

// ════════════════════════════════════════════════════════════════
// F2② 代價之一：力量折損逐值＝DBL_SPIKE_POWER_MUL
// ★覆審修 2（Sawmah 拍板）★折損折在**飛行時間**（spikeVelocity timeMul＝
// 1/POWER_MUL，在 d/speed／minTime／過網淨空三個下限之後才乘）——球更慢、
// 弧更高、同落點。舊做法（速度×0.8 再進解算）會被淨空下限吞掉（覆審實測
// 61% 落點速度比恆 1.0000）；改後**任何落點**的水平速度比都逐值＝乘數。
// 直接打 T vs 變向到 T：同 seed 下散佈目標相同（rand 消費序一致），
// 水平速度＝水平距離/T ⇒ 速度比＝T_direct/T_twist＝POWER_MUL，與落點無關。
// 只嚴不鬆：深打點斷言原樣保留，另加「舊做法必被吞」的近網軟球點——
// 改回折 speed 的壞版，近網那組當場紅（壞版自證的方向釘）
// ════════════════════════════════════════════════════════════════
test('F2② 力量折損：任何落點（深殺球＋近網軟球）水平速度比都逐值＝DBL_SPIKE_POWER_MUL', () => {
  const hs = (g) => Math.hypot(g.ball.vx, g.ball.vz);
  const ratioAt = (aim) => {
    const direct = rigSpike(21, { aim });
    const twist = rigSpike(21, { aim: AIM_FIRST, retargetAim: aim });
    return hs(twist.g) / hs(direct.g);
  };
  // 深殺球：d/speed 主導（改制前後都該過）
  const DEEP = { x: -4, z: -8 };
  assert.ok(Math.abs(ratioAt(DEEP) - TUNING.DBL_SPIKE_POWER_MUL) < 1e-9,
    `深打點速度比 ${ratioAt(DEEP)} 應逐值＝${TUNING.DBL_SPIKE_POWER_MUL}`);
  // 近網軟球：T 由過網淨空下限主導——折 speed 的舊做法在這裡零效果（比恆 1.0），
  // 折 T 的新做法照折（覆審 probe-power 的 61% 死區就是這型）
  const SOFT = { x: 0.8, z: -1.6 };
  assert.ok(Math.abs(ratioAt(SOFT) - TUNING.DBL_SPIKE_POWER_MUL) < 1e-9,
    `近網軟球速度比 ${ratioAt(SOFT)} 應逐值＝${TUNING.DBL_SPIKE_POWER_MUL}（舊做法在此恆 1.0）`);
  // 折損是平打（F2-1 非時機軸的一半證據）：乘數本身 <1 且不讀任何時間量（純常數）
  assert.ok(TUNING.DBL_SPIKE_POWER_MUL < 1);
  // 拍板丙代價降輕：timeMul 1.25→1.1 ⇒ POWER_MUL＝1/1.1（提案值，未經真人校準）
  assert.ok(Math.abs(TUNING.DBL_SPIKE_POWER_MUL - 1 / 1.1) < 1e-12,
    `拍板丙：DBL_SPIKE_POWER_MUL 應＝1/1.1，實際 ${TUNING.DBL_SPIKE_POWER_MUL}`);
});

// ════════════════════════════════════════════════════════════════
// F2③ 代價之二：體力大耗（COST_SPIKE_TWIST 疊在 COST_SPIKE 之上）
// ════════════════════════════════════════════════════════════════
test('F2③ 體力消耗：變向扣球比普通扣球多扣、量＝COST_SPIKE_TWIST 比例', () => {
  const plain = rigSpike(31, { aim: AIM_NEW, stamina: true });
  const twist = rigSpike(31, { aim: AIM_FIRST, retargetAim: AIM_NEW, stamina: true });
  const drainPlain = 1 - plain.g.stamina.A2;
  const drainTwist = 1 - twist.g.stamina.A2;
  assert.ok(drainTwist > drainPlain, '變向應多耗體力');
  // 差額＝COST_SPIKE_TWIST ×（隊伍 costMul=1 × attrCostMul——A2 的 stamina 屬性抗性）
  const extra = drainTwist - drainPlain;
  const expected = STAMINA.COST_SPIKE_TWIST * attrCostMul(plain.g.players.A2);
  assert.ok(Math.abs(extra - expected) < 1e-9,
    `額外消耗 ${extra} 應＝COST_SPIKE_TWIST×attrCostMul＝${expected}`);
  // 拍板丙代價降輕：0.022 減半為 0.011（提案值，未經真人校準）
  assert.ok(Math.abs(STAMINA.COST_SPIKE_TWIST - 0.011) < 1e-12,
    `拍板丙：COST_SPIKE_TWIST 應＝0.011，實際 ${STAMINA.COST_SPIKE_TWIST}`);
});

// ════════════════════════════════════════════════════════════════
// F2④ 重度疲勞檔不可用：tier 2 帶 retargetAim ⇒ 旗標整個無效、球照第一段 aim 飛
// ════════════════════════════════════════════════════════════════
test('F2④ 重度疲勞檔（<25%）使不出來：球退回第一段的線、事件無 retarget 旗標、不另扣體力', () => {
  const { g, evs } = rigSpike(41, {
    aim: AIM_FIRST, retargetAim: AIM_NEW, stamina: true, staminaValue: 0.1,
  });
  const dead = runToDead(g).find((e) => e.type === 'DEAD_BALL');
  assert.ok(dead && dead.at.x > 0,
    `重度檔應照第一段的線飛（右半場），實際 x=${dead?.at?.x?.toFixed(2)}`);
  assert.ok(!evs.some((e) => e.type === 'TOUCH' && e.retarget === true),
    '重度檔的 TOUCH 不得帶 retarget');
  assert.equal(g.rally.retargetP, undefined,
    '機率騙牆層已刪（拍板丙）——rally 不得再有武裝欄位');
});

// ════════════════════════════════════════════════════════════════
// F3 未解鎖＝逐值無效果：doubleSpike=0 時帶 retargetAim 的整場逐 tick 狀態
// 與完全不帶 retargetAim **逐值相同**（含事件流與 rng 序）
// ════════════════════════════════════════════════════════════════
test('F3 未解鎖逐值無效果：鎖技術後帶 retargetAim 與不帶，逐 tick 全狀態相同', () => {
  const run = (withFlag) => {
    const { g, evs } = rigSpike(51, {
      aim: AIM_FIRST, retargetAim: withFlag ? AIM_NEW : null,
      blockX: 0, lockTech: true,
    });
    const snaps = [snapshot(g, evs)];
    for (let i = 0; i < 900 && g.phase === 'rally'; i += 1) {
      snaps.push(snapshot(g, stepGame(g, [])));
    }
    return snaps;
  };
  assert.deepEqual(run(true), run(false), '未解鎖時 retargetAim 必須零效果（含 rng 序）');
});

// ════════════════════════════════════════════════════════════════
// F4（拍板丙改寫＝純幾何）：機率騙牆層已刪，變向的收益回歸幾何——球飛新線，
// 牆的**真實站位**沒蓋到就攔不到；蓋到就照樣被攔（tryBlock bandContact 用真實
// 球路結算，零特殊判定）。原 F4①-④（lane 申報＋機率騙牆判準＋角度單調 deceiveP）
// 隨該層一併刪除；F2-1 非時機軸的 sim 半邊由 wiring 檔 W6（computeRetarget
// 無時間參數）與 F2②（折損純常數）看守。
// ════════════════════════════════════════════════════════════════
test('F4① 純幾何收益：變向到牆真實站位沒蓋到的空檔＝攔不到；直打牆蓋著的線＝攔得到', () => {
  let blockedGap = 0;   // 變向到空檔（牆的身體在第一段的線上）
  let blockedHeld = 0;  // 對照：直打牆蓋著的線（幾何帶真的在作用）
  for (let seed = 1; seed <= 300; seed += 1) {
    const gap = rigSpike(seed, { aim: AIM_FIRST, retargetAim: AIM_NEW, blockX: CROSS_X_FIRST });
    if (runToDead(gap.g).some((e) => e.type === 'BLOCK_TOUCH')) blockedGap += 1;
    const held = rigSpike(seed, { aim: AIM_FIRST, blockX: CROSS_X_FIRST });
    if (runToDead(held.g).some((e) => e.type === 'BLOCK_TOUCH')) blockedHeld += 1;
  }
  assert.ok(blockedHeld > 0, '對照組：牆蓋著的線應存在成功攔網（幾何帶真的在作用）');
  assert.ok(blockedGap < blockedHeld * 0.2,
    `變向到空檔應幾乎攔不到：空檔被攔 ${blockedGap}、蓋著被攔 ${blockedHeld}`);
});

// ════════════════════════════════════════════════════════════════
// F4② 純幾何代價面：牆的真實站位蓋著新線＝變向過去照樣被攔——沒有任何機率免死
//（所見即所得；「不得完全無反應」與「不得 100% 得利」在純幾何下同一件事）
// ════════════════════════════════════════════════════════════════
test('F4② 純幾何代價：變向到牆蓋著的區＝照樣被攔（無機率免死）、零 BLOCK_DECEIVED', () => {
  let blocked = 0;
  let deceived = 0;
  for (let seed = 1; seed <= 300; seed += 1) {
    const d = rigSpike(seed, { aim: AIM_FIRST, retargetAim: AIM_NEW, blockX: CROSS_X_NEW });
    const evs = runToDead(d.g);
    if (evs.some((e) => e.type === 'BLOCK_TOUCH')) blocked += 1;
    deceived += evs.filter((e) => e.type === 'BLOCK_DECEIVED').length;
  }
  assert.ok(blocked > 0, '牆站在新線上＝變向過去照樣被攔（所見即所得）');
  assert.equal(deceived, 0,
    '變向不得觸發任何 BLOCK_DECEIVED（機率騙牆層已刪；gaze 又與變向互斥＝deceiveP 恆 0）');
});

// ════════════════════════════════════════════════════════════════
// F4③ ★壞版自證錨★機率騙牆層刪乾淨：治具刻意帶 laneX 申報（押第一段的線）＝
// 壞版分支的完整觸發前提。把機率騙牆層塞回去（rally.retargetP 武裝＋tryBlock 的
// retarget BLOCK_DECEIVED 分支＋stepGame laneX 鏡射，即 4050d89 版）：
// retarget BLOCK_DECEIVED 會以 ~DBL_SPIKE_DECEIVE_GAIN 機率出現、rally.retargetP
// ＝0.6、actor.blockLaneX＝申報值——三條斷言當場紅。改造後 intent.laneX 是被
// 忽略的死欄位，sim 不長出任何新判定。
// ════════════════════════════════════════════════════════════════
test('F4③ 機率騙牆層刪乾淨：laneX 申報＋押錯邊也無 retarget BLOCK_DECEIVED、rally 無武裝欄位', () => {
  let deceivedRetarget = 0;
  let contacts = 0;
  let lastRig = null; // 結構斷言殿後用（§6.1-1：壞版要紅在行為斷言，不是結構探針）
  for (let seed = 1; seed <= 300; seed += 1) {
    const d = rigSpike(seed, {
      aim: AIM_FIRST, retargetAim: AIM_NEW, blockX: CROSS_X_NEW, blockLaneX: CROSS_X_FIRST,
    });
    lastRig = d.g;
    const evs = runToDead(d.g);
    if (evs.some((e) => e.type === 'BLOCK_TOUCH')) contacts += 1;
    deceivedRetarget += evs.filter((e) => e.type === 'BLOCK_DECEIVED' && e.retarget === true).length;
  }
  // ★行為斷言先行★（壞版＝塞回機率騙牆分支時，紅的是這一條）
  assert.equal(deceivedRetarget, 0,
    'retarget BLOCK_DECEIVED 恆 0——出現＝機率騙牆分支又被塞回來了（拍板丙已刪）');
  assert.ok(contacts > 0, '治具前提：牆真的構得到球（否則零事件是空轉，不構成證據）');
  // 結構斷言殿後：機率層的狀態欄位也要刪乾淨（半刪＝耦合債）
  assert.equal(lastRig.rally.retargetP, undefined, '機率層欄位不得存在（rally.retargetP）');
  assert.equal(lastRig.actors.B2.blockLaneX, undefined, 'lane 申報鏡射不得存在（actor.blockLaneX）');
});

// ════════════════════════════════════════════════════════════════
// 覆審修 3（滑鼠誤觸護欄）：第二段落點與第一段逐值相同（或 ε 內）＝整個不算變向
// ——不折力量、不扣 TWIST 體力、無 retarget 旗標，行為與純扣球逐 tick 逐值相同
//（與「新落點與擊球點重合回 null」同層護欄）。θ=0 但不同落點（同方向改深度）
// 仍收費的既有語意由 F2-1 的 sameLine 斷言看守，本測不重驗。
// ════════════════════════════════════════════════════════════════
test('修3 誤觸護欄：retargetAim 與第一段 aim 相同（ε 內）＝逐值等同沒變向、零收費', () => {
  const run = (retargetAim) => {
    const { g, evs } = rigSpike(91, { aim: AIM_FIRST, retargetAim, stamina: true });
    const snaps = [snapshot(g, evs)];
    for (let i = 0; i < 900 && g.phase === 'rally'; i += 1) {
      snaps.push(snapshot(g, stepGame(g, [])));
    }
    return { snaps, stamina: g.stamina.A2 };
  };
  const plain = run(null);
  const same = run({ ...AIM_FIRST });                            // 逐值相同
  const jitter = run({ x: AIM_FIRST.x + 1e-8, z: AIM_FIRST.z }); // ε 內（浮點抖動）
  assert.deepEqual(same.snaps, plain.snaps, '同落點誤觸必須逐值等同沒變向（含 rng 序）');
  assert.deepEqual(jitter.snaps, plain.snaps, 'ε 內抖動同樣不算變向');
  assert.equal(same.stamina, plain.stamina, '誤觸不得收 COST_SPIKE_TWIST（零收費）');
});

// ════════════════════════════════════════════════════════════════
// F5 決定論：同 seed＋同 intent 腳本（含變向與攔網）兩次執行，逐 tick 全狀態相同
// ════════════════════════════════════════════════════════════════
test('F5 決定論：同 seed 同輸入（含 retarget 與已起跳攔網）兩次執行逐 tick 相同', () => {
  const run = () => {
    const { g, evs } = rigSpike(71, {
      aim: AIM_FIRST, retargetAim: AIM_NEW, blockX: CROSS_X_NEW,
    });
    const snaps = [snapshot(g, evs)];
    for (let i = 0; i < 900 && g.phase === 'rally'; i += 1) {
      snaps.push(snapshot(g, stepGame(g, [])));
    }
    return snaps;
  };
  const a = run();
  const b = run();
  assert.equal(a.length, b.length);
  assert.deepEqual(a, b, '同 seed 同輸入必須逐 tick 逐值相同');
});

// ════════════════════════════════════════════════════════════════
// F1：TECH_DEFS／傳授事件／解鎖預設（範式抄 pro-batch4b E1 系列）
// ════════════════════════════════════════════════════════════════
test('F1① TECH_DEFS 含 doubleSpike，有 name／desc', () => {
  const def = TECH_DEFS.find((t) => t.key === 'doubleSpike');
  assert.ok(def, 'doubleSpike 不在 TECH_DEFS 裡');
  assert.equal(def.name, '二段時間差');
  assert.ok(typeof def.desc === 'string' && def.desc.length > 0);
});

test('F1② 生涯新人預設 0、unlockTechnique 可解鎖；快速比賽 createPlayer 預設全開', () => {
  const p = createCareerPlayer('測試員', { seed: 1 });
  assert.equal(p.techniques.doubleSpike, 0, '生涯新人：顯式 0（sim 端 ?? 1 閘的前提）');
  const unlocked = unlockTechnique(p, 'doubleSpike');
  assert.equal(unlocked.techniques.doubleSpike, 1);
  const quick = createPlayer({ id: 'X1', teamId: 'A' });
  assert.equal(quick.techniques.doubleSpike, 1, '快速比賽預設全開（同 dive 慣例）');
});

test('F1③ 舊存檔補正：缺 doubleSpike 欄 ⇒ normalizeCareerPlayer 補 0（不是 undefined、不是 1）', () => {
  const p = createCareerPlayer('舊檔', { seed: 2 });
  delete p.techniques.doubleSpike; // 批 4c 之前的存檔形狀
  normalizeCareerPlayer(p);
  assert.equal(p.techniques.doubleSpike, 0,
    '舊存檔缺欄必須補 0——sim 端 ?? 1 閘下，undefined 等於未受教就解鎖');
});

test('F1④ teach-doublespike 事件：解鎖 doubleSpike、proLeaguePlayed 判準、一次性、同 4a/4b 門檻', () => {
  const ev = EVENT_DEFS.find((e) => e.id === 'teach-doublespike');
  assert.ok(ev, 'teach-doublespike 事件不存在');
  assert.equal(ev.effect?.unlock, 'doubleSpike');
  assert.ok('proLeaguePlayed' in (ev.when ?? {}), '未用職業聯賽場次計數當判準');
  assert.equal(ev.when.lastMatchId, undefined);
  assert.equal(ev.when.stage, undefined);
  assert.ok(isOnceEvent('teach-doublespike'), '教過就不再教');
  const baitline = EVENT_DEFS.find((e) => e.id === 'teach-baitline');
  assert.equal(ev.when.proLeaguePlayed, baitline.when.proLeaguePlayed,
    '同 4a/4b 的安全門檻（proLeaguePlayed 只數本季，單循環滿貫＝7，再高本季恆不到期）');
  assert.ok(Array.isArray(ev.lines) && ev.lines.length > 0
    && ev.lines.every((l) => typeof l.speaker === 'string' && typeof l.text === 'string'
      && l.text.length > 0),
    'dialogPlay 契約：每句有 speaker 與非空 text');
});

function proSchedule(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, opponentId: 'x', round: 'pro' }));
}

test('F1⑤ 高中/大學章恆不觸發；pro-batch3-wiring「覆審H修」治具窗口（6 完賽）不到期', () => {
  const hs = {
    schedule: [{ id: 'group-1', opponentId: 'x', round: 'rr' }],
    results: [{ matchId: 'group-1', won: true }],
    events: [],
  };
  assert.ok(!dueEvents(hs, 'post', 1).some((e) => e.id === 'teach-doublespike'));
  const window = {
    schedule: proSchedule(7),
    results: [
      { matchId: 'p1', won: true }, { matchId: 'p2', won: true },
      { matchId: 'p3', won: true }, { matchId: 'p4', won: true },
      { matchId: 'p5', won: true }, { matchId: 'p6', won: true },
    ],
    events: ['first-loss'],
  };
  assert.ok(!dueEvents(window, 'post', 1).some((e) => e.id === 'teach-doublespike'),
    '打完 6 場不得到期（門檻 7；避開 pro-batch3 覆審 H 修治具的窗口）');
  const due = {
    schedule: proSchedule(7),
    results: proSchedule(7).map((m) => ({ matchId: m.id, won: true })),
    events: [],
  };
  assert.ok(dueEvents(due, 'post', 1).some((e) => e.id === 'teach-doublespike'),
    '打完 7 場應到期');
});

test('F1⑥ resolveTechGates.canDoubleSpike：生涯未受教＝false、受教＝true、快速比賽恆 true', () => {
  const p = createCareerPlayer('閘測', { seed: 3 });
  const g = { players: { A2: p }, comboScale: 1 };
  assert.equal(resolveTechGates(g, 'A2', true).canDoubleSpike, false, '未受教不得露提示');
  g.players.A2 = unlockTechnique(p, 'doubleSpike');
  assert.equal(resolveTechGates(g, 'A2', true).canDoubleSpike, true);
  assert.equal(resolveTechGates(g, 'A2', false).canDoubleSpike, true, '快速比賽恆開');
});
