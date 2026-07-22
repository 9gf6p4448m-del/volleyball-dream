// FIVB《Official Volleyball Rules 2025-2028》7.4/7.5/7.7 判定引擎（純函式、決定論）
// 條文逐字依據（2026-07-22 抽查 PDF 核實）：
//   7.4  發球方全隊豁免輪轉站位（"free to occupy any position"）；
//        雙方仍須位於己方場內（發球員除外）
//   7.4.3 齊平（level with）合法；「最後接觸地板固定位置」
//   7.4.3.2 側邊球員 vs 同排「其他球員們」（複數）——須全配對，相鄰鏈不足
//   7.5/7.7 位置錯誤與輪轉錯誤分立；7.7.2 輪轉錯誤有追溯扣分
// 座標約定（隊伍視角）：y＝距中線距離（0=網、越大越後）、x＝距左邊線距離（0..9）
// lineup：六人陣列 [{ zone: 1..6, feet: [{x, y, grounded}], isServer }]
//   一隻 foot＝一個著地點；現行 sim 是單點球員（配接層餵一隻虛擬腳），
//   介面支援多腳，未來上腳部模型只換配接層
// 「最後接觸固定位置」：跳起中的球員由呼叫端傳最後著地座標；
//   引擎取 grounded 腳，全離地時退回全部腳點（視為最後接觸快照）
import { COURT } from './constants.js';

export const LEVEL_EPS = 1e-4; // 齊平容許（7.4.3 允許 level with；防浮點誤判）

// 7.4.2 前後對應固定三組 [前, 後]；7.4.1 橫向序（自左而右）：前排 4-3-2、後排 5-6-1
const FB_PAIRS = [[4, 5], [3, 6], [2, 1]];
const ROWS = [[4, 3, 2], [5, 6, 1]];

// 位置判定用腳點（7.4.3 主文：最後接觸地板固定位置）
function positionPoints(entry) {
  const grounded = entry.feet.filter((f) => f.grounded);
  return grounded.length > 0 ? grounded : entry.feet;
}

const minX = (pts) => Math.min(...pts.map((p) => p.x));
const maxX = (pts) => Math.max(...pts.map((p) => p.x));
const minY = (pts) => Math.min(...pts.map((p) => p.y));
const maxY = (pts) => Math.max(...pts.map((p) => p.y));

// 7.4/7.5 站位合法性。isServingTeam=true → 豁免輪轉站位（僅檢場內包含）
// 回傳 { legal, faults: [{ type:'positional_fault', rule, zones, detail }] }
export function isRotationLegal(lineup, isServingTeam) {
  const faults = [];
  const byZone = {};
  for (const e of lineup) byZone[e.zone] = e;

  // 場內包含（7.4 首句，雙方適用；發球員站發球區除外）
  for (const e of lineup) {
    if (e.isServer) continue;
    const pts = positionPoints(e);
    const out = pts.every(
      (p) =>
        p.x < -LEVEL_EPS || p.x > COURT.WIDTH + LEVEL_EPS ||
        p.y < -LEVEL_EPS || p.y > COURT.LENGTH / 2 + LEVEL_EPS,
    );
    if (out) {
      faults.push({
        type: 'positional_fault', rule: '7.4', zones: [e.zone],
        detail: 'out_of_court',
      });
    }
  }

  // 發球方：輪轉站位全隊豁免（7.4 第三句），只留場內檢查
  if (isServingTeam) return { legal: faults.length === 0, faults };

  // 前後（7.4.3.1）：後排至少一腳點齊平或比對應前排的「前腳」更遠離中線
  // 前腳＝最靠近中線的著地腳（點模型＝最小 y）；齊平合法 → >= 帶 EPS
  for (const [f, b] of FB_PAIRS) {
    const front = positionPoints(byZone[f]);
    const back = positionPoints(byZone[b]);
    if (maxY(back) < minY(front) - LEVEL_EPS) {
      faults.push({
        type: 'positional_fault', rule: '7.4.3.1', zones: [f, b],
        detail: `back_${b}_fully_in_front_of_${f}`,
      });
    }
  }

  // 左右（7.4.3.2）：側邊球員 vs 同排「其他球員們」全配對——
  // 左側 vs {中, 右}、右側 vs {中, 左}；左右互比兩式等價、收斂為一次
  for (const [L, C, R] of ROWS) {
    const pl = positionPoints(byZone[L]);
    const pc = positionPoints(byZone[C]);
    const pr = positionPoints(byZone[R]);
    const lateral = (ok, a, b) => {
      if (!ok) {
        faults.push({
          type: 'positional_fault', rule: '7.4.3.2', zones: [a, b],
          detail: `lateral_order_${a}_${b}`,
        });
      }
    };
    lateral(minX(pl) <= maxX(pc) + LEVEL_EPS, L, C); // 左側須不整體越過中位
    lateral(maxX(pr) >= minX(pc) - LEVEL_EPS, R, C); // 右側須不整體越過中位
    lateral(minX(pl) <= maxX(pr) + LEVEL_EPS, L, R); // 跨位：左側 vs 右側（相鄰鏈推不出）
  }

  return { legal: faults.length === 0, faults };
}

// 7.7 輪轉錯誤（與站位判定完全分離）：發球者須依先發輪轉序輪流
// rotationOrder＝該局先發發球序（player id 陣列）；servedCount＝本局已完成的發球輪數
export function isRotationOrderLegal(server, rotationOrder, servedCount) {
  if (!rotationOrder.length) return false;
  return rotationOrder[servedCount % rotationOrder.length] === server;
}

// 7.7.2 追溯扣分（純函式，對事件流運算；Phase 2 手動排陣/換人接上前為驗證器）：
// 自犯規時刻起犯規隊所得分數全數取消、對隊得分保留；無法判定時刻（faultTick=null）不追溯
export function cancelFaultPoints(events, faultTick, faultTeam) {
  let cancelled = 0;
  const score = { A: 0, B: 0 };
  for (const e of events) {
    if (e.type !== 'SCORE') continue;
    if (faultTick !== null && e.team === faultTeam && e.tick >= faultTick) {
      cancelled += 1;
      continue;
    }
    score[e.team] += 1;
  }
  return { cancelled, score };
}
