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
// 階段五會被 `舉球可及半徑 0.45 ＋ 手點＝額前上方` 取代（屆時本常數消失）。
export const SET_CEILING_BONUS = 0.35;

/**
 * 某球員在此刻的可及體。
 *
 * 回傳的是**退化圓柱**：`{ cx, cz }` 為軸心（腳下），`r` 為水平半徑，
 * `[yMin, yMax]` 為垂直帶。階段五換成球體時 `kind` 改 'sphere'、改用 `cy` ＋ 單一 `r`。
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
export function reachVolumeFor({
  player, actor, action, jump = false, jumpMul = 1, tuning, inflate = 0,
}) {
  const isDive = action === REACH_ACTION.DIVE;
  // 水平半徑：魚躍是一次性大延伸（倍率階段五須重新導出——基底一縮，1.8 會把魚躍砍到 1.28m）
  const r = tuning.REACH_RADIUS * (isDive ? tuning.DIVE_REACH_MUL : 1) + inflate;
  // 垂直頂端：四種動作四個答案（這正是本卷要收掉的不一致，階段一先照抄）
  const top = action === REACH_ACTION.SPIKE
    ? spikeReach(player, jumpMul)
    : isDive
      ? tuning.DIVE_MAX_Y
      : (action === REACH_ACTION.SET && jump)
        ? spikeReach(player, jumpMul)
        : standingReach(player) + SET_CEILING_BONUS;
  return {
    kind: 'cylinder',
    cx: actor.x,
    cz: actor.z,
    r,
    yMin: BALL.RADIUS, // 地板閘：球心低於半徑＝球已在地上，不是「構不到」
    yMax: top + inflate,
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
  const ok = dist <= vol.r && ball.y <= vol.yMax && ball.y >= vol.yMin;
  return { ok, dist };
}
