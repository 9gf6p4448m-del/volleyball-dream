// Phase 5 §十-1「觸球判定＝幾何，不是一堆各自為政的閾值」
//
// ★ 病根（本模組要解掉的東西）★
// 改制前，「這顆球構不構得到」散在四條互不知情的規則裡：
//   ① 水平：`hypot(ball.x−actor.x, ball.z−actor.z) > REACH_RADIUS` ——**垂直完全不管**
//   ② 舉球垂直上限：`standingReach + 0.35` ——憑空另立一條規則
//   ③ 扣球／跳舉垂直上限：`spikeReach`
//   ④ 魚躍：水平乘 `DIVE_REACH_MUL`、垂直改吃 `DIVE_MAX_Y`
// 於是同一個問題有四個答案，二速也卡死在「球必須下墜穿過某個平面」上。
//
// ★ 目標模型（憲法 §一.2）★
//   觸球成立 ⟺ |球心 − 手點| ≤ 該動作可及半徑 + BALL.RADIUS
//   手點由動作相位決定（起跳中的手點隨跳躍曲線上移）
//
// ★ 本階段（§十 階段一）刻意只做到哪裡 ★
// 階段一的驗收是**行為與 fa7e3f4 逐值相同**（hash 證明），所以這裡交付的是
// **接縫**不是新幾何：`ReachVolume` 這個抽象、以及「全 sim 只有一處決定構不構得到」
// 這件事。它現在被**實例化成退化的圓柱**（水平圓 × 垂直帶），逐值重現上面四條舊規則——
// 真正的球體要等階段五「統一收斂」連同目標值（接球 身高×0.38／舉球 0.45／扣球 0.55／
// 魚躍 ≈2.0m）一起換上，那時 `volume.kind` 從 'cylinder' 變 'sphere'、`cy` 開始有意義。
//
// **不要因為現在看起來只是把舊程式碼搬個家就把它折疊回去**——接縫本身就是這階段的產物。
import { BALL } from './constants.js';
import { standingReach, spikeReach } from './player.js';

// 會嘗試觸球的四個動作（block 不走這條：攔網是隔網結算，見 blockBand.js）
export const REACH_ACTION = {
  RECEIVE: 'receive',
  SET: 'set',
  SPIKE: 'spike',
  DIVE: 'dive',
};

// 舉球的站立加成：手舉過頭頂，可及頂端高於站立摸高。
//
// ⚠ **2026-07-30 起與手點解除關聯**（手點裁定 v4 §2.1 明文）：
// 本式的**語意是天花板（上界）**，不是手點（中心）。
// 「拿上界當球心」是本卷實測抓到的錯（可及體整體上移近半個直徑，接球 n −97%）
// ⇒ **本常數自此不得再作為任何動作的手點 y。**
// 依 v4 §七「不重命名或搬移既有幾何量以順便整理」保留匯出；
// ⚠ **如實登記：解除關聯後它在 `src/` 已零消費者**（僅 `tests/reach-volume.test.mjs` 引用）。
export const SET_CEILING_BONUS = 0.35;

// ==== 手點（球心）的人體幾何量 —— 手點裁定 v4 §二 拍板 ====
//
// ★ 申報三要素（附錄條款 A-7：僅寫「沿用既有量、零新常數」不構成 ✅）★
//
//   RECEIVE_HANDPOINT_H_RATIO
//     語意：**接觸點**（前臂平台碰到球的那一點），不是上界、不是半徑
//     原點：**地面**（絕對高度 ＝ 比例 × 當前身高）
//     單位：**身高比例**（無因次）
//     導出：屈膝受身姿勢下的前臂平台高度——站姿腰高約 0.60H、受身下沉約 0.15 m
//
//   SET_HANDPOINT_H_RATIO
//     語意：**接觸點**（額前上方雙手觸球點）
//     原點：**地面**
//     單位：**身高比例**（無因次）
//     導出：站姿額高約 0.95H，觸球點高於額前約 0.10–0.15 m
//
// ★ 不得快取（v4 §2.1 明文）★ 身高是**時變**屬性（`height.timeline` 的成長曲線，
// `height.current` 是其末項）。手點必須**每次呼叫時由當前身高算**——
// 創角時算一次等於成長期身高失效。本檔的作法是在 `reachVolumeFor` 內即時乘算，
// 不存任何衍生欄位到 player／actor 上。
//
// ★ 繼承（v4 §4.2）★ 通過基準 A 後，這兩個量登記為**人體幾何量**
// （與 `spikeReach`／`standingReach` 同層），「身高的誠實化」一卷**繼承、不重導**。
export const RECEIVE_HANDPOINT_H_RATIO = 0.48;
export const SET_HANDPOINT_H_RATIO = 1.03;

/**
 * 某球員在此刻的可及體。
 *
 * ★★ 2026-07-30 階段五**基準 A**：已由退化圓柱**遷移為球體** ★★
 * 授權＝`docs/kickoffs/phase5-section10-stage5-handpoint-ruling-v4.md`（取代 v3 的手點部分）
 * ＋裁定書 v3 §一 白名單補列三項（`volume.kind`／`cy` 啟用／手點 y 相位化）。
 *
 * 回傳**球體**：`{ cx, cy, cz }` 為**手點**、`r` 為可及半徑（已含球半徑膨脹）。
 *   觸球成立 ⟺ `|球心 − 手點| ≤ 該動作可及半徑 + BALL.RADIUS`（憲法補充 §1.2 原文）
 *
 * **手點 y 由動作相位決定；x/z 維持 `actor.x`／`actor.z`**（v4 §七：x/z 作法不動）。
 * ⚠ v3 曾判「手點 y 沿用圓柱天花板」＝**錯**：天花板是上界、球心是中心，
 * 拿上界當中心會把可及體整體上移近半個直徑（實測接球 n −97%、rally 長度 −77%）。
 * v4 因此補了兩個**接觸點**語意的人體幾何量，見下方常數的申報三要素。
 *
 * @param {object} a
 * @param {object} a.player   球員（吃 height／jump 屬性）
 * @param {object} a.actor    場上實體（吃 x／z）
 * @param {string} a.action   REACH_ACTION 之一
 * @param {boolean} a.jump    §5 A3 跳舉：唯一吃 intent.jump 的地方
 * @param {number} a.jumpMul  體力對彈跳的折損（staminaPerfMul）
 * @param {object} a.tuning   game.js 的 TUNING（讀 REACH_RADIUS／DIVE_REACH_MUL／DIVE_MAX_Y）
 * @param {number} a.inflate  可及體的整體膨脹量（球半徑；見 ballInReach 的說明）
 */
/**
 * 某動作的**水平可及半徑**——單一真相來源。
 *
 * 現在四個動作（魚躍除外）退化成同一個 `REACH_RADIUS`，逐值重現階段一之前的行為；
 * 階段五換上目標值時只改這裡：接球 身高×0.38／**舉球 0.45**／扣球 0.55／魚躍 ≈2.0m。
 *
 * ★ 為什麼要單獨抽出來（§4 階段四）★
 * `passTierOf` 的一傳品質門檻（原本寫死 1.2m）要相對化成「**二傳的可及半徑**」的倍數
 * ——perfect 的語意就是「二傳不用移動就能舉」。門檻掛在這個函式上，
 * 階段五把舉球可及縮到 0.45 時，門檻會**自己跟著縮**，不必記得回頭改第二個地方。
 */
export function reachRadiusFor(action, tuning) {
  return tuning.REACH_RADIUS * (action === REACH_ACTION.DIVE ? tuning.DIVE_REACH_MUL : 1);
}

export function reachVolumeFor({
  player, actor, action, jump = false, jumpMul = 1, tuning, inflate = 0,
}) {
  const isDive = action === REACH_ACTION.DIVE;
  // 水平半徑：魚躍是一次性大延伸（倍率階段五須重新導出——基底一縮，1.8 會把魚躍砍到 1.28m）
  const r = reachRadiusFor(action, tuning) + inflate;
  // ★ 手點 y ＝ 球心的垂直位置（手點裁定 v4 §二 的表，逐列對應）★
  // **原點一律為地面。** 每次呼叫即時由當前身高算，**不快取**（v4 §2.1）。
  //   扣球／跳舉 → `spikeReach`（語意本來就是**擊球點**、非上界 ⇒ 沿用成立）
  //   接球（含防守低球）→ 0.48 × H（前臂平台接觸點）
  //   舉球 → 1.03 × H（額前上方觸球點）
  //   魚躍 → `DIVE_MAX_Y`　⚠ **標記未驗證**：其語意是「低球上限」不是接觸點；
  //          v4 §2.3 要求以強制魚躍情境重測到 n ≥ 30 才判，**重測前不得計入閘門通過**，
  //          且**不得自行給魚躍新的 y 值**。
  const H = player.height.current;
  const handY = action === REACH_ACTION.SPIKE
    ? spikeReach(player, jumpMul)
    : isDive
      ? tuning.DIVE_MAX_Y
      : (action === REACH_ACTION.SET && jump)
        ? spikeReach(player, jumpMul)
        : action === REACH_ACTION.SET
          ? SET_HANDPOINT_H_RATIO * H
          : RECEIVE_HANDPOINT_H_RATIO * H;
  return {
    kind: 'sphere',
    cx: actor.x,
    cy: handY, // ★ `cy` 啟用（白名單第 2 項）：垂直軸心從此有意義
    cz: actor.z,
    r,
    yMin: BALL.RADIUS, // 地板閘：球心低於球半徑＝球已在地上，與可及無關（非圓柱殘留）
  };
}

/**
 * 球在不在可及體內。
 *
 * `dist` 一併回傳——下游的 `receiveQualityMul` 要用它算到位程度
 * （走到球正下方＝穩、勉強搆＝飄），不能只回布林。
 *
 * `inflate`（＝ BALL.RADIUS）的位置在 `reachVolumeFor`，不在這裡：
 * 觸球條件是「球**面**碰到手」而非「球**心**碰到手」，所以是可及體長大，
 * 不是距離變短——這兩種寫法在圓柱上等價，換成球體後只有前者還對。
 *
 * @returns {{ ok: boolean, dist: number }} dist ＝水平距離（未膨脹，供品質計算用）
 */
export function ballInReach(ball, vol) {
  const dist = Math.hypot(ball.x - vol.cx, ball.z - vol.cz);
  const toHand = Math.hypot(dist, ball.y - vol.cy); // 球心到手點的 3D 距離
  const ok = toHand <= vol.r && ball.y >= vol.yMin;
  return { ok, dist };
}
