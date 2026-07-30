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
 * ★★ 2026-07-30 階段五：**已由退化圓柱遷移為球體** ★★
 * 授權＝`docs/kickoffs/phase5-section10-stage5-handpoint-ruling.md`（採選項乙）
 * ＋裁定書 v3 §一 白名單補列三項（`volume.kind`／`cy` 啟用／手點 y 相位化）。
 *
 * 現在回傳**球體**：`{ cx, cy, cz }` 為**手點**、`r` 為可及半徑（已含球半徑膨脹）。
 *   觸球成立 ⟺ `|球心 − 手點| ≤ 該動作可及半徑 + BALL.RADIUS`（憲法補充 §1.2 原文）
 *
 * **手點 y 由動作相位決定；x/z 維持 `actor.x`／`actor.z`。**
 * 白名單第 3 項原寫「手點 x/z 由動作相位決定」，經手點裁定**回正為 y**——
 * 依據是憲法補充 §1.2 的自帶註解本身就只講垂直（「起跳中的手點隨跳躍曲線上移」），
 * v3 補列時寫成 x/z 屬擴寫。**文字校正，非實質翻案。**
 * 水平手點若日後要做，是未來裁定書的新白名單項，走完整週期，**不視為本輪遺留**。
 *
 * **零新常數**：手點 y 的三個取值就是遷移前圓柱天花板 `top` 的同一組式子，逐值沿用。
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
  // 可及半徑：魚躍是一次性大延伸（倍率階段五須重新導出——基底一縮，1.8 會把魚躍砍到 1.28m）
  const r = reachRadiusFor(action, tuning) + inflate;
  // ★ 手點 y（＝球心的垂直位置）：四種動作四個答案。
  // 這三個式子就是遷移前圓柱的天花板 `top`，**逐值沿用、零新常數**——
  // 差別只在它從「垂直帶的上緣」變成「球心的高度」。
  const handY = action === REACH_ACTION.SPIKE
    ? spikeReach(player, jumpMul)
    : isDive
      ? tuning.DIVE_MAX_Y
      : (action === REACH_ACTION.SET && jump)
        ? spikeReach(player, jumpMul)
        : standingReach(player) + SET_CEILING_BONUS;
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
 * **球體判定**：`|球心 − 手點| ≤ r`（`r` 已含 `inflate` ＝ 球半徑膨脹）。
 * 圓柱時代的「水平 ≤ r **且** 垂直 ≤ 天花板」是兩條各自為政的閘；
 * 球體只有一條，而且**垂直與水平會互相吃**——離手點越高，水平能構的就越少。
 * 那正是這次遷移要拿回來的東西。
 *
 * `inflate` 的位置在 `reachVolumeFor` 不在這裡：觸球條件是「球**面**碰到手」
 * 而非球心碰到手 ⇒ 是可及體長大，不是距離變短。
 * 這兩種寫法在圓柱上等價，**換成球體後只有前者還對**（階段一的註解已預告）。
 *
 * `dist` 回傳的仍是**水平**距離——下游 `receiveQualityMul` 用它算到位程度
 * （走到球正下方＝穩、勉強搆＝飄）。**本輪不動品質模型**，故不改成 3D 距離。
 *
 * @returns {{ ok: boolean, dist: number }} dist ＝**水平**距離（未膨脹，供品質計算用）
 */
export function ballInReach(ball, vol) {
  const dist = Math.hypot(ball.x - vol.cx, ball.z - vol.cz);
  const toHand = Math.hypot(dist, ball.y - vol.cy); // 球心到手點的 3D 距離
  const ok = toHand <= vol.r && ball.y >= vol.yMin;
  return { ok, dist };
}
