// D1 資料層 v1 — Player 結構與序列化（純函式、零 three.js/DOM 依賴）
// 身高影響（攔網高度/扣球點/防守範圍）一律由 height.current 即時推導，不存衍生欄位

export const ROLES = ['outside', 'setter', 'libero', 'middle', 'opposite'];

export const ATTRIBUTE_KEYS = [
  'jump', 'power', 'reaction', 'stamina', 'speed', 'control', 'serve', 'block',
];

export function createPlayer({
  id,
  name,
  teamId,
  naturalRole = 'outside', // 依身高建議的位置
  currentRole = 'outside', // 玩家實選的位置
  height = 1.85,
  attributes = {},
  trust = 50, // 舉球員對此人的信任初值（攻擊分配權重來源）
  trustFloor = 0, // 保底球權地板（stage 4：生涯主角 0.27；一般球員無地板）
  techniques = {}, // 覆寫技術解鎖/熟練度（生涯新人鎖起步、預設全開）
} = {}) {
  const attrs = {};
  for (const k of ATTRIBUTE_KEYS) {
    attrs[k] = clampAttr(attributes[k] ?? 50);
  }
  return {
    id,
    name,
    teamId,
    naturalRole,
    currentRole,
    height: {
      current: height,
      timeline: [], // 成長曲線，Phase 3 用；Phase 1 留空
    },
    attributes: attrs,
    techniques: {
      // 熟練度（Phase 1 既有鉤子，未消費）
      spike: 1,
      jumpServe: 1,
      block: 1,
      receive: 1,
      emergencySet: 1,
      // Phase 2 決策選項解鎖（0＝未解鎖）：預設全開＝快速比賽/AI 行為不變；
      // 生涯新人由 createCareerPlayer 覆寫為 0 起步，經故事線傳授習得
      // （jumpServe 直接沿用上方既有欄位＝跳躍發球解鎖旗標）
      tip: 1,        // 攻擊面板「吊球」
      floatServe: 1, // 發球面板「飄浮」球路
      pipe: 1,       // 後排攻擊面板（手動 pipe）
      feint: 1,      // 按A滑B 假動作
      dive: 1,       // 魚躍救球（主動技）
      feintUses: 8,  // 假動作使用次數（熟練度）；8＝1.0 基準乘子
      ...techniques,
    },
    // fromSetter＝持久 baseline（劇情事件經 updateTrust 調整）；floorShare＝保底球權
    trust: { fromSetter: clampAttr(trust), floorShare: trustFloor },
  };
}

// 假動作熟練度：使用次數→騙敵成功率乘子。8 次＝1.0（既有平衡基準）、
// 新手 0.6 起步、上限 1.2；舊存檔缺欄位視同基準（不動舊行為）
export function feintMasteryMul(p) {
  const uses = p.techniques?.feintUses ?? 8;
  return Math.min(1.2, 0.6 + uses * 0.05);
}

function clampAttr(v) {
  return Math.max(0, Math.min(100, v));
}

// ---- 身高/屬性即時推導（不存回 Player）----

// 站立摸高 ≈ 身高 × 1.31（排球常用估式）
export function standingReach(p) {
  return p.height.current * 1.31;
}

// 垂直起跳高度（公尺）：jump 0–100 → 0.30–0.95m
// jumpMul：W7 體力劣化乘數（只折彈跳、不折身高；預設 1＝行為不變）
export function jumpHeight(p, jumpMul = 1) {
  return (0.3 + (p.attributes.jump / 100) * 0.65) * jumpMul;
}

// 扣球點高度
export function spikeReach(p, jumpMul = 1) {
  return standingReach(p) + jumpHeight(p, jumpMul);
}

// 攔網高度（攔網跳略保守於扣球跳）——**這次跳躍的頂點**，與時間無關
export function blockReach(p, jumpMul = 1) {
  return standingReach(p) + jumpHeight(p, jumpMul) * 0.85;
}

/**
 * 攔網頂邊：手在**這一 tick** 實際能碰到的最高點（m）。
 *
 * @param {object} p       球員
 * @param {number|null} t  起跳後經過的 tick 數（`state.tick − actor.blockStartTick`）；
 *                         `null` ＝這一刻根本沒在跳
 * @param {number} jumpMul W7 體力劣化乘數
 *
 * ★ §十 階段二 2-B 之前，這是刻意的退化實作：回傳跳躍頂點，完全不看 `t` ★
 *
 * 也就是「跳了即等於手在頂點」——這正是十-2 要消滅的假狀態：攔網手起跳再晚，
 * 手也瞬間在最高處，垂直維度在這個模型裡根本不存在，於是 read 人格既能等看清楚
 * 又追得到快攻。2-B 會把本體換成吃跳躍相位（太早已下墜、太晚還在上升）。
 *
 * 現在就把**介面**定出來（頂邊是 t 的函式），讓 sim 與量測探針都改吃它：
 * 2-B 只換這個函式的本體，呼叫端一行都不用動，量測指標也不必中途改定義。
 * 引入這一步刻意保持行為零變化，由 `tools/sim-hash-probe.mjs` 背書。
 */
export function blockTopEdge(p, t, jumpMul = 1) {
  void t; // 退化實作：頂邊尚未吃相位（見上方說明）
  return blockReach(p, jumpMul);
}

// 防守可及半徑（公尺）：身高越高踏步範圍越大、speed 補正
export function defenseRange(p) {
  return p.height.current * 0.55 + (p.attributes.speed / 100) * 0.8;
}

// 移動速度（m/s）
export function moveSpeed(p) {
  return 2.8 + (p.attributes.speed / 100) * 2.4;
}

// ---- 序列化（純函式；Phase 1 不做存檔 UI，但格式現在就定型）----

export function serializePlayer(p) {
  return JSON.stringify(p);
}

export function deserializePlayer(json) {
  const raw = JSON.parse(json);
  for (const field of ['id', 'teamId', 'naturalRole', 'currentRole', 'height', 'attributes']) {
    if (raw[field] === undefined) throw new Error(`Player 序列化資料缺欄位：${field}`);
  }
  for (const k of ATTRIBUTE_KEYS) {
    if (typeof raw.attributes[k] !== 'number') {
      throw new Error(`Player.attributes 缺數值欄位：${k}`);
    }
  }
  if (typeof raw.height.current !== 'number' || !Array.isArray(raw.height.timeline)) {
    throw new Error('Player.height 結構不合法（需 current:number 與 timeline:array）');
  }
  return raw;
}
