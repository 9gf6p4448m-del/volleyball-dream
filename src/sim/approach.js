// Phase 5 W1 §2-2「Transition 拉開」——助跑起點（純函式、決定論、零 rng）
//
// 真實排球：一擊完成的瞬間，場上每個合法攻擊手都轉身背對網、跑向**自己那條線的
// 助跑起點**站定等二傳。攔網手要讀的第一組線索就是「誰跑去哪、離網多遠」。
//
// 4.7 之前全隊共用 `dutyPosition`（前排一律 lz=3.0、後排一律 lz=7.0），三名前排
// 站成一直排、後排完全不動（探針實測 Δ=0.00m）＝攔網手看不到任何線索。
//
// 本檔只負責「起點在哪」的純幾何：吃 (隊伍, 這球跑哪條線)，吐世界座標。
// **刻意不從 ai.js import**——攻擊池（attackPointsOf）由呼叫端供給，
// 避免 sim 內循環相依，也讓 §4「全員各跑各的線」直接對整個池 map 一次即可。
import { COURT } from './constants.js';
import { localToWorld } from './rotation.js';

// 助跑起點（隊伍視角）：lz＝離網距離、lx＝面向網時的右手向。
// 對照 setAimFor 的舉球落點：quick(0,1.0) left(-3,1.3) right(3,1.3)
// pipe(-1,3.6) dball(2.6,3.6)——起點一律比落點更遠離網、且往外側讓開，
// 讓助跑方向是「由外往內、由後往前」進球（真實助跑路線，不是原地站著等）。
//
// steps＝助跑步數（§2-4 位置例外的規格值，供表現層挑步序節奏；sim 不消費）
export const APPROACH = {
  // MB 快攻：兩步——**離網最近**（3.0 < 兩翼 3.6），二傳觸球前就要起跳。
  // ★ lz 不得小於「起跳點 lz」＋助跑距離：起跳點＝hitPoint.z + TAKEOFF_FRONT_M
  // 實測 p50 ≈ 1.99，再扣 TAKEOFF_SETTLE_M 0.25（到位即停）＝可跑的助跑段。
  // 初版寫 1.5（比起跳點還貼網）→ 助跑被吃光、退回 07-23 拍板禁止的「提早到網前
  // 罰站」：attack-flow-probe §2 從 0 筆樣本暴增到 537 筆、罰站 p50 31 tick、
  // 站超過 0.5s 佔 100%。3.0 是改動前 dutyPosition 的等效值（該版罰站 0 筆），
  // 留約 1m 助跑＝MB 的兩步。（07-28 Sawmah 拍板；§4 A1 把 MB 起跳提前後可再議）
  quick: { lx: 0, lz: 3.0, steps: 2 },
  // OH 4 號位：約四步距離離網，從邊線外側切進來
  left: { lx: -3.6, lz: 3.6, steps: 4 },
  // OPP 2 號位：沿用 OH 架構鏡像
  right: { lx: 3.6, lz: 3.6, steps: 4 },
  // 後排 pipe：四步、**離網最遠**（4.7 量到的 0.86m 空中前飄即此成因，屬正確行為）
  pipe: { lx: -1, lz: 5.6, steps: 4 },
  // 後排 D 球：pipe 的右路版（同屬後排攻擊，深度一致）
  dball: { lx: 2.6, lz: 5.6, steps: 4 },
};

// 助跑起點（世界座標）；kind 不在表上（非攻擊手）回 null——呼叫端據此回落職責位
export function approachStartFor(team, kind) {
  const a = APPROACH[kind];
  if (!a) return null;
  // 場內夾制：起點不得跑到邊線外或端線外（六人制助跑起點都在場內）
  const lim = COURT.WIDTH / 2 - 0.4;
  const lx = Math.max(-lim, Math.min(lim, a.lx));
  const lz = Math.min(a.lz, COURT.LENGTH / 2 - 0.4);
  const w = localToWorld(team, lx, lz);
  return { x: w.x, z: w.z, lz, steps: a.steps, kind };
}

// 整個攻擊池的 route（§4 要的「全員各跑各的線」直接吃這個）：
// points＝attackPointsOf(game, team, setterId, passTier) 的輸出
export function approachRoutesFor(team, points) {
  const routes = [];
  for (const pt of points) {
    const start = approachStartFor(team, pt.kind);
    if (start) routes.push({ pid: pt.pid, kind: pt.kind, start });
  }
  return routes;
}

// 查表：這名球員本球的助跑起點（不是合法攻擊手＝null）
export function approachStartOf(routes, playerId) {
  if (!routes) return null;
  for (const r of routes) if (r.pid === playerId) return r.start;
  return null;
}
