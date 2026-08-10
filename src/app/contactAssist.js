// 二次球相遇點輔助（app 層純函式；zero DOM／zero three.js，可 node 單測）
//
// ★ 病灶 ★ 操作輔助的落點圈畫的是 `predictLanding()`——球**落地**那一刻的水平位置。
// 但二次球攻擊（二傳自舉自扣）必須在球還高於幾何可及下限時擊出，球墜到那個高度
// 的水平位置與最終落地點差了整整一段（實測中位數 0.72m）——玩家瞄落地圈站，人到了
// 落地點時球早就已經穿過可及區、沒東西可打了。實測「人到了卻搆不到」13.4%；
// 把移動目標換成本檔算出的相遇點後降到 0.0%（scratchpad `set-h5-probe.mjs`）。
//
// ★ 範圍 ★ 使用者裁定「本批只做二次球情境，其餘情境（一傳接球／防守）先量再說」——
// 不擴大到別的觸球情境，回傳 null 時呼叫端要維持原本的落地圈邏輯不動。
//
// ★ 手點與半徑的單一真相 ★ 三檔一律呼叫 `src/sim/reach.js` 已匯出的真實函式與比例
// 常數，不在本檔重抄任何數字——那些數字若哪天在 reach.js 調整（例如基準 B 收斂進度
// CONVERGE_T），本檔要自動跟著變，不能有第二份抄本各自維護、其中一份忘了改。
import { predictContactPoint } from '../sim/flight.js';
import {
  reachRadiusFor, REACH_ACTION, SET_HANDPOINT_H_RATIO, RECEIVE_HANDPOINT_H_RATIO,
} from '../sim/reach.js';
import { spikeReach } from '../sim/player.js';
import { staminaPerfMul } from '../sim/stamina.js';
import { isBackRow } from '../sim/rotation.js';

/**
 * @param {object} a
 * @param {object} a.game     sim state（讀 phase／rally／ball／match.rotations）
 * @param {object} a.player   候選球員（`game.players[id]`；讀 height／currentRole／teamId）
 * @param {object} a.tuning   `game.js` 的 TUNING（reachRadiusFor 需要）
 * @param {string|null|undefined} a.claimId AI 協調層本波指定觸球者（`aiState.claimId`）——
 *   傳純值不傳整個 aiState：本檔不該知道 aiState 的內部結構，那是 sim/ai 的事。
 * @param {string|null|undefined} a.passTier 一傳品質分檔（`aiState.passTier`，同樣傳純值）——
 *   'perfect'/'ok'/'poor'。規劃當下（`ai.js:443`）與 claim 同一次寫入，圈開始顯示時
 *   已經定案，不吃「規劃完成後才變」那類時序問題。
 * @returns {{ point: {x:number,z:number}, tier: 'spike'|'set'|'receive' }|null}
 */
export function contactAssistFor({
  game, player, tuning, claimId, passTier,
}) {
  if (game.phase !== 'rally') return null;
  // 我方的第二觸：`touches===1`＝一次觸球已消耗，下一觸就是第二次——與 matchLoop 既有
  // 「舉球預備段」判準（matchLoop.js `game.rally.touches === 1 ? SET_READY_LEAD : ...`）
  // 同一把尺，不另立新語意。
  if (!(game.rally.possession === player.teamId && game.rally.touches === 1)) return null;
  // claimId 未傳（undefined/null）＝安全預設：不得當成「沒人 claim 所以放行」。
  if (claimId == null || claimId !== player.id) return null;
  if (player.currentRole !== 'setter') return null;

  const H = player.height.current;
  const ball = game.ball;
  // 與 sim 實際判定觸球成立的同一支 jumpMul 來源（`game.js` 的 `attemptTouch` 逐值同款：
  // `staminaPerfMul(state, player)`），確保這裡量的門檻跟真的能不能碰到球是同一把尺。
  const jumpMul = staminaPerfMul(game, player);

  // ★ 綠圈（spike 檔）的語意＝「`setOptions.js:93` 的🎯二次球鈕真的會出現」（2026-08-10
  // 覆審修，兩輪修完）★ 那顆鈕的條件是 `tier === 'perfect' && !isBackRow`——**兩個
  // 條件都要守**，少守一個，圈就在承諾一個玩家手上根本按不到的動作（畫面謊言）。
  // 下次有人改 `setOptions.js` 那顆鈕的門檻，這裡也要跟著改。
  // 後排／非 perfect 皆同一種降級：跳過 spike、從 set 檔開始判——二傳仍要知道該站
  // 哪去舉球，不是整個不顯示。
  const backRow = isBackRow(game.match.rotations[player.teamId], player.id);
  // passTier 安全預設：讀不到／undefined／任何非 'perfect' 值一律當「不能攻擊」，
  // 跟 claimId 同一個方向——不確定時往「不承諾」倒，不往「放行」倒。
  const canSpike = !backRow && passTier === 'perfect';
  if (canSpike) {
    const spikeHandY = spikeReach(player, jumpMul);
    const spikeR = reachRadiusFor(REACH_ACTION.SPIKE, tuning, H);
    if (ball.y > spikeHandY - spikeR) {
      return { point: pointAt(ball, spikeHandY), tier: 'spike' };
    }
  }

  const setHandY = SET_HANDPOINT_H_RATIO * H;
  const setR = reachRadiusFor(REACH_ACTION.SET, tuning, H);
  if (ball.y > setHandY - setR) {
    return { point: pointAt(ball, setHandY), tier: 'set' };
  }

  const receiveHandY = RECEIVE_HANDPOINT_H_RATIO * H;
  return { point: pointAt(ball, receiveHandY), tier: 'receive' };
}

// 圈的位置＝球墜到「該檔手點高度」那一刻的水平位置（不是下限、不是落地點）——
// 球墜到手點高度時人站在那裡，水平距離為 0，容錯最大（見檔頭病灶說明）。
function pointAt(ball, handY) {
  const p = predictContactPoint(ball, handY);
  return { x: p.x, z: p.z };
}
