// D1 資料層 v1 — Player 結構與序列化（純函式、零 three.js/DOM 依賴）
// 身高影響（攔網高度/扣球點/防守範圍）一律由 height.current 即時推導，不存衍生欄位
//
// AIR_TICKS＝sim 既有的滯空窗定義（＝ TUNING.TAKEOFF_LOOKBACK_TICKS）。
// 這裡只讀它、不另立第二個滯空常數（§十 工單 §2.4-c）。approach.js 的相依鏈
// （constants／rotation／rng／actionPhase）不回頭指向本檔，不會成環。
import { AIR_TICKS } from './approach.js';

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
 * @returns {number} 頂邊的**絕對高度**（公尺），不是任何歸一化乘數
 *
 * ★ §十 階段二 2-B：時機從乘數變成幾何 ★
 *
 * 改制前這裡是退化實作——回傳跳躍頂點、完全不看 `t`，也就是「跳了即等於手在頂點」。
 * 於是攔網手起跳再晚，手也瞬間在最高處，垂直維度在模型裡根本不存在，
 * read 人格才能既等看清楚又追得到快攻（十-2 的病定義）。
 * 「時機」被塞在別的地方：一顆叫 `blockTimingMul` 的乘數直接折攔網成功率——
 * 誠實的補償不是「手臂有 1.3 公尺長」，攔網版即「不是跳起來瞬間手就在頂點」。
 *
 * 現在時機是幾何的：**太早已下墜、太晚還在上升**，兩者都表現為球到的那一刻手不夠高。
 *
 * ★ 零新常數（工單 §2.4-c）★ 曲線與窗長都是沿用的，不是為這件事發明的：
 *   - 形狀＝ `Math.sin(t·π)` 半波，沿用 `src/render/geoAnimator.js` 既有的跳躍動畫曲線
 *     （同檔 `jumpY = seq.jump * Math.sin(t * Math.PI)`）——畫面上看到的手，
 *     從此就是 sim 判定用的那隻手，不再是兩套標準
 *   - 窗長＝ `AIR_TICKS`（24，同 `TUNING.TAKEOFF_LOOKBACK_TICKS`，sim 既有的滯空窗定義）
 *   - 兩端＝ `standingReach`（腳在地上）與 `blockReach`（跳躍頂點），都是既有推導函式
 *
 * 順帶對上既有事實：apex 落在 `AIR_TICKS / 2 = 12`，而被拆掉的 `blockTimingMul`
 * 的甜蜜值取樣點正好是 12（`blockTimingMul(12) === 1.0`）。曲線不是重新校準出來的。
 */
export function blockTopEdge(p, t, jumpMul = 1) {
  const stand = standingReach(p);
  // 沒在跳、或這次跳躍已經結束＝腳在地上，手就是站立摸高
  if (t == null || t < 0 || t > AIR_TICKS) return stand;
  return stand + (blockReach(p, jumpMul) - stand) * Math.sin(Math.PI * (t / AIR_TICKS));
}

// 防守可及半徑（公尺）：身高越高踏步範圍越大、speed 補正。
// ⚠ B-2 裁定回報（2026-07-30，表 D）＝選「改文件」不接線：本函式自 Phase 1 定義
// 以來無任何消費者（speed 屬性未兌現於防守範圍——convergence §5.12 難度曲線候選
// 機制 7 已登記）；補償階段剛以 ±15 雙主判收單且 R4 款 3 快攻 margin 僅 1.9pp，
// 此時接線＝對已驗證平衡的重擾動。接線與否併入「身高的誠實化」獨立卷（B-3，
// docs/kickoffs/height-honesty-case.md）一起評估；函式保留供案卷引用。
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
