// 夠球視覺補償（表現層純函式；零 three.js／DOM 依賴，node 可直測）
//
// 為什麼有這一層（07-28 Sawmah 試玩：「舉球跟接球會還沒碰到手上就接起來，扣球也是」）：
// sim 的觸球判定半徑 TUNING.REACH_RADIUS = 1.3m 很寬鬆——實測觸球瞬間球離球員中心的
// 水平距離 receive p50 0.59m／set p50 0.95m／spike p50 1.05m，球在快一公尺外就轉向，
// 看起來就是「沒碰到就接起來」。判定半徑是平衡命脈（本輪明令不校準），所以走表現層：
// **讓人去夠球**——軀幹傾／轉＋手臂朝球延伸＋小幅根位移，三者疊加把手與球的落差縮小。
// 範式沿用魚躍飛撲（matchView 的 DIVE_LUNGE：sim 只有原地觸球，撲出去的距離全在表現層
// 補、不寫回 sim）。魚躍本身已有自己的位移，不套本層（matchView 端以 divedUntil 擋掉）。
//
// 座標約定（與 geoCharacter.js 檔頭一致）：模型面向 +Z、頭 +Y、**角色右手側＝−X**。
// 本檔對外一律講「本地偏移」：right＝球在角色右手側為正、fwd＝球在角色正前方為正。
// 輸出則一律講「關節軸」：欄位名就是要寫進哪個關節的哪一軸（applyReachBias 直接套）。
import { smoothstep } from './facing.js';

export const REACH = {
  // ---- 時間包絡（用「球離球員多遠」當時鐘：球飛近→漸入、觸球後球飛離→漸出）----
  WINDOW_FULL: 1.3,   // 這距離內＝窗全開（＝sim TUNING.REACH_RADIUS：判定半徑改了要同步）
  WINDOW_FADE: 1.9,   // 這距離外＝完全關閉（中間 smoothstep 連續，無硬門檻）
  // 高度閘只為了濾掉「明顯不干我事」的高球（例如頭上 4m 飛過的傳球）——**不是**在模擬
  // 可及高度。它必須寬過 sim 真正會判觸球的高度（spike 的 maxY＝跳躍摸高，實測擊球點
  // p50 3.09m），否則正在扣的球會被自己的閘門關掉補償
  TOP_MUL: 1.8,       // 垂直上限＝身高×此（相對腳底）
  TOP_FADE: 0.9,      // 超過後再淡出這麼多 m
  SMOOTH_K: 14,       // 包絡的指數平滑（1/秒，τ≈71ms）——閘門翻面不得逐幀跳動
  // ---- 死區：球已經在手上（偏移小於此）＝零偏置，既有觀感一格不動 ----
  DEAD_ZONE: 0.12,
  // ---- 手段一：小幅根位移（標籤／影子／鏡頭都吃 sim 位置，位移只給身體，故上限最緊）----
  ROOT_GAIN: 0.42,
  ROOT_MAX: 0.28,     // m（工單上限 0.35；取 0.28 留餘裕，屬可調口味值）
  // 垂直伸展（＝root 位移的 y 分量）：實測觸球瞬間球心高出手掌 set 0.80m／spike 0.73m，
  // 這一段任何「傾／轉／伸手」都補不到（前傾反而把手往下帶）。唯一的手段是整個人往上
  // 伸——真實排球本來就有 jump set／墊步伸展。只在「球高過手」時開，低手接球恆 0。
  // ★ 這是口味值：0＝完全關閉（只留水平補償）／0.30＝明顯踮腳伸展。見報告的取捨說明
  LIFT_GAIN: 0.42,
  LIFT_MAX: 0.18,
  // ---- 手段二：軀幹傾／轉向球 ----
  LEAN_GAIN: 0.34,
  LEAN_MAX: 0.30,     // rad（前傾／側倒）
  LEAN_BACK_MAX: 0.12,// 球在身後時的後仰上限——後仰大了很醜，只給前傾的四成
  TWIST_GAIN: 0.34,
  TWIST_MAX: 0.28,    // rad（胸椎轉向球）
  PELVIS_SHARE: 0.4,  // 骨盆跟轉的比例（髖肩分離：胸多、骨盆少）
  // ---- 手段三：手臂朝球延伸 ----
  ARM_GAIN: 0.45,     // 橫向（肩 z）
  ARM_SPAN: 0.9,      // 指向球的滿檔距離（m）——手離球越遠，越往球的方向轉
  ARM_FWD_K: 0.45,    // 指向強度＝往「對準球」的角度補這個比例（見 armAimX）
  ARM_FWD_TARGET: -Math.PI / 2, // 肩 x＝−π/2＝手臂水平前指（0＝垂下、−π＝直上）
  ARM_MAX: 0.55,      // rad（肩偏置上限，兩軸各自）
  LEAN_UP_SPAN: 0.3,  // 球高出手掌這麼多 m 以上＝前傾完全收掉（前傾會把手往下帶）
  // ---- 手在哪的粗估骨架（見 handPos）：身體只需要補「手還差的那一段」----
  SPINE_Y: 1.08,      // root→腰關節高度（geoCharacter：pelvis 0.96 ＋ spine 0.12）
  SHOULDER_UP: 0.54,  // 腰關節→肩的等效高度
  UPPER_ARM: 0.32,    // 肩→肘（geoCharacter：Elbow joint 掛在 −0.32）
  FOREARM: 0.34,      // 肘→腕（Wrist joint 掛在 −0.34）——手掌槽就掛在腕原點
  ARM_LEN: 0.66,      // 肩→腕伸直時的總長（＝上臂＋前臂；指向球的滿檔判斷用）
};

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function clampMag(v, m) { return v > m ? m : v < -m ? -m : v; }

const ZERO = Object.freeze({
  rootRight: 0, rootFwd: 0, rootUp: 0, spineX: 0, spineZ: 0, chestY: 0, pelvisY: 0,
  rShX: 0, rShZ: 0, lShX: 0, lShZ: 0,
});

/**
 * 球的世界水平偏移 → 角色本地偏移。
 * @param {number} dx 球 x − 球員 x（世界）
 * @param {number} dz 球 z − 球員 z（世界）
 * @param {number} yaw 角色朝向（root.rotation.y）
 * @returns {{right:number, fwd:number}} right＝球在角色右手側為正、fwd＝正前方為正
 */
export function localBallOffset(dx, dz, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // 本地 +X＝世界 (cos, −sin)、本地 +Z＝世界 (sin, cos)；角色右手側＝−X（見檔頭）
  return { right: -(dx * c - dz * s), fwd: dx * s + dz * c };
}

/** 本地位移 → 世界位移（localBallOffset 的逆運算；根位移要寫回世界座標） */
export function worldReachOffset(right, fwd, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const lx = -right;
  return { dx: lx * c + fwd * s, dz: -lx * s + fwd * c };
}

/**
 * 時間包絡（0..1）：球在觸球窗內才夠球。距離用 smoothstep 淡入淡出＝沒有硬門檻，
 * 且球飛近時單調上升、觸球後球飛離時單調下降——peak 自然落在觸球那一瞬間。
 * @param {number} dist 球到球員的水平距離（m）
 * @param {number} up 球心相對腳底的高度（m）——含跳躍（腳底＝root.position.y）
 * @param {number} height 球員身高（m）
 */
export function reachWindow(dist, up, height) {
  const wDist = 1 - smoothstep(REACH.WINDOW_FULL, REACH.WINDOW_FADE, dist);
  const top = height * REACH.TOP_MUL;
  const wUp = 1 - smoothstep(top, top + REACH.TOP_FADE, up);
  return wDist * wUp;
}

/**
 * 觸球姿勢下「手已經往前伸出多少」（m，角色本地前方）。
 * 為什麼需要它：量測顯示低手接球在觸球幀手掌其實已經到球那裡甚至超過（球心離身體中心
 * p50 只有 0.56m，而墊球平台本身就往前伸出 0.6m 以上）——這時再把身體往前推只會**穿過
 * 球**，落差反而變大（第一版實測 receive 修後 +0.09m 變差）。所以身體只補「手還差的
 * 那一段」＝ fwd − handLead。
 * @param {number} armX 肩 x（0＝垂下、−π/2＝水平前指、−π＝直上）
 * @param {number} trunkX 軀幹前傾總量（spine.x ＋ spineUpper.x）
 * @param {number} [scale] 身高縮放（height / BASE_H）
 */
export function handPos(armX, elbowX, trunkX, scale = 1) {
  // 兩節手臂：忽略肘會高估手伸出去多少（實測 setReach 的肘彎 57°，只算上臂會多算 0.26m，
  // 導致「手已經到球了」的誤判、接球完全不補償）。角度一律「負＝往前」，故取負號累加
  const theta = -armX + trunkX;            // 上臂在世界的仰角（軀幹前傾一起帶）
  const phi = theta - elbowX;              // 前臂仰角（肘角相對上臂）
  const shFwd = REACH.SHOULDER_UP * Math.sin(trunkX);
  const shUp = REACH.SPINE_Y + REACH.SHOULDER_UP * Math.cos(trunkX);
  return {
    fwd: scale * (shFwd + REACH.UPPER_ARM * Math.sin(theta) + REACH.FOREARM * Math.sin(phi)),
    up: scale * (shUp - REACH.UPPER_ARM * Math.cos(theta) - REACH.FOREARM * Math.cos(phi)),
    shFwd: scale * shFwd,
    shUp: scale * shUp,
  };
}

/**
 * 手臂該指向哪：讓手臂方向對準「肩→球」的向量。
 * 為什麼不是固定往「水平前指」補：同一個加號在不同動作是相反的意思——舉球雙臂已高舉
 * （x≈−2.7＝快垂直向上），球在斜上方時要**再舉高**；接球雙臂低垂（x≈−1.2），球在
 * 前下方時要**放低**。指向球是唯一同時涵蓋兩者的規則。
 * @param {number} fwdFromSh 球相對肩的前方距離
 * @param {number} upFromSh 球相對肩的高度差（正＝球在肩上方）
 */
export function armAimX(fwdFromSh, upFromSh) {
  if (Math.abs(fwdFromSh) < 1e-9 && Math.abs(upFromSh) < 1e-9) return REACH.ARM_FWD_TARGET;
  return -Math.atan2(fwdFromSh, -upFromSh);
}

/**
 * 由本地偏移算出各關節偏置。回傳欄位＝關節軸（applyReachBias 直接套）：
 * rootRight/rootFwd＝根位移（本地，m）｜spineX＝腰前傾(+)／後仰(−)｜spineZ＝上身倒向
 * 角色右側(+)｜chestY/pelvisY＝轉體（負＝轉向角色右側）｜r/lShX＝肩前後、r/lShZ＝肩左右。
 * @param {object} o
 * @param {number} [o.right] 球在角色右手側的偏移（m，相對 root）
 * @param {number} [o.fwd] 球在角色正前方的偏移（m，相對 root）
 * @param {number} [o.up] 球高於腳底的高度（m，＝ball.y − root.position.y）
 * @param {number} [o.w] 包絡權重 0..1（reachWindow 的平滑後值）
 * @param {'both'|'dominant'} [o.kind] 雙手（舉球／接球平墊）或慣用手（扣球／發球）
 * @param {number} [o.armXR] 本幀右肩 x（由 geoAnimator 寫好後讀出）
 * @param {number} [o.armXL] 本幀左肩 x
 * @param {number} [o.elbowXR] 本幀右肘 x（手臂是兩節，忽略肘會高估手的位置）
 * @param {number} [o.elbowXL] 本幀左肘 x
 * @param {number} [o.trunkX] 本幀軀幹前傾（spine.x ＋ spineUpper.x）
 * @param {number} [o.scale] 身高縮放（height / BASE_H）
 */
export function reachBias(o = {}) {
  const w = clamp01(o.w ?? 0);
  if (w <= 0) return { ...ZERO };
  const armXR = o.armXR ?? 0;
  const armXL = o.armXL ?? 0;
  const trunkX = o.trunkX ?? 0;
  const scale = o.scale ?? 1;
  const both = o.kind !== 'dominant';
  // 目標不是「球離身體中心多遠」而是「球離**手**多遠」——量測顯示低手接球在觸球幀
  // 手掌其實已經到球那裡甚至超過（第一版用身體中心當基準，把人往前推穿過球，
  // receive 反而變差 +0.09m）。所以先估手在哪（handPos），再算手還差多少。
  const elXR = o.elbowXR ?? 0;
  const elXL = o.elbowXL ?? 0;
  const hand = both
    ? handPos((armXR + armXL) / 2, (elXR + elXL) / 2, trunkX, scale)
    : handPos(armXR, elXR, trunkX, scale);
  const right0 = o.right ?? 0;
  const fwd0 = (o.fwd ?? 0) - hand.fwd;
  const upGap = (o.up ?? hand.up) - hand.up; // 正＝球在手的上方
  // 死區用 3D 落差判（球正好在手正上方時水平落差是 0，但那顯然還沒碰到手）；
  // 水平各手段仍只吃水平落差
  const mag = Math.hypot(right0, fwd0);
  if (!(Math.hypot(mag, upGap) > REACH.DEAD_ZONE)) return { ...ZERO }; // 球已在手上（NaN 也走這條）
  const k = mag > REACH.DEAD_ZONE ? (mag - REACH.DEAD_ZONE) / mag : 0;
  const right = right0 * k;
  const fwd = fwd0 * k;

  // 根位移：整條向量夾上限（不逐軸夾——逐軸夾會讓斜向偷跑到 √2 倍）。
  // 這是唯一「純水平、不動手的高度」的手段，所以不受下面的高度閘限制
  let rr = right * REACH.ROOT_GAIN;
  let rf = fwd * REACH.ROOT_GAIN;
  const rm = Math.hypot(rr, rf);
  if (rm > REACH.ROOT_MAX) {
    const s = REACH.ROOT_MAX / rm;
    rr *= s;
    rf *= s;
  }

  // 高度閘：前傾會把手**往下帶**。球在手的上方時（舉球／扣球實測球心高出手掌
  // 0.5–0.7m）前傾只會讓落差變大，所以球越高於手、前傾越收——收到零為止。
  // 球與手同高或更低（低手接球）＝前傾正是把手送過去的動作，全開。
  const leanGate = 1 - clamp01(upGap / REACH.LEAN_UP_SPAN);
  const lean = fwd * REACH.LEAN_GAIN * leanGate;
  const spineX = lean > REACH.LEAN_MAX ? REACH.LEAN_MAX
    : lean < -REACH.LEAN_BACK_MAX ? -REACH.LEAN_BACK_MAX : lean;
  const spineZ = clampMag(right * REACH.LEAN_GAIN, REACH.LEAN_MAX);
  const rootUp = Math.min(Math.max(0, upGap) * REACH.LIFT_GAIN, REACH.LIFT_MAX);
  // 轉體：球在右（right>0）要把胸口轉向 −X ⇒ 繞 y 負角（+y 會轉向左側）
  const chestY = -clampMag(right * REACH.TWIST_GAIN, REACH.TWIST_MAX);

  // 手臂：橫向兩肩同號（維持平墊/舉球的雙手相對形狀，整組往球那側移）；
  // 前後則是把手臂**指向球**（armAimX），高球舉更高、低球放更低
  const armZ = clampMag(right * REACH.ARM_GAIN, REACH.ARM_MAX);
  const reachT = clamp01(Math.hypot(fwd, upGap) / REACH.ARM_SPAN);
  const aim = armAimX((o.fwd ?? 0) - hand.shFwd, (o.up ?? hand.up) - hand.shUp);
  const rShX = clampMag((aim - armXR) * REACH.ARM_FWD_K * reachT, REACH.ARM_MAX);
  const lShX = both ? clampMag((aim - armXL) * REACH.ARM_FWD_K * reachT, REACH.ARM_MAX) : 0;

  return {
    rootRight: rr * w,
    rootFwd: rf * w,
    rootUp: rootUp * w,
    spineX: spineX * w,
    spineZ: spineZ * w,
    chestY: chestY * w,
    pelvisY: chestY * REACH.PELVIS_SHARE * w,
    rShX: rShX * w,
    rShZ: armZ * w,
    lShX: lShX * w,
    lShZ: both ? armZ * w : 0,
  };
}

/**
 * 把偏置套上關節（在 geoAnimator.update() 之後呼叫——它每幀絕對指派，這裡疊加）。
 * 注意 spine.rotation.z：geoAnimator **不寫**這一軸，所以必須絕對指派而非 +=，
 * 否則每幀累加會把人捲成陀螺。
 */
export function applyReachBias(joints, b) {
  joints.spine.rotation.x += b.spineX;
  joints.spine.rotation.z = b.spineZ;
  joints.spineUpper.rotation.y += b.chestY;
  joints.pelvis.rotation.y += b.pelvisY;
  joints.rShoulder.rotation.x += b.rShX;
  joints.rShoulder.rotation.z += b.rShZ;
  joints.lShoulder.rotation.x += b.lShX;
  joints.lShoulder.rotation.z += b.lShZ;
}
