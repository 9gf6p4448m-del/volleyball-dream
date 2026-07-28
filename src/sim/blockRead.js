// Phase 5 W1 §7 C2 — 攔網站位讀取（純函式、決定論；sim 核心，零 three/DOM）
//
// 07-28 Sawmah 拍板（A 案）：玩家在 OH／MB／OPP 前排攔網時是用**身體站位**在封線，
// 後排隊友沒有面板可看——真實排球裡隊友是「看你站哪」，不是「看你按了什麼」。
// 因此本檔把受控玩家的實際 x 座標翻譯成「他在封直線還是封斜線」，
// 由 ai.js 的後排 dig 分支消費（封直線→後排收斜線，語意沿用 liberoRead 的既有配對）。
//
// 零新面板（§10 明定球內不得新增決策面板）；零 rng。
import { TEAM_SIDE } from './rotation.js';

// 攻擊瞄準點幾何。原本只存在於 input/attackZones.js，C2 之後 sim 也要讀同一份
// （sim 不得 import input）——故上移到此當單一真相，input 端改為 import。
// **數值一格未動**（line/cross/middle/tip 與遷移前逐字相同）。
export function spikeAimsFor(game, attackerId) {
  const a = game.actors[attackerId];
  const side = TEAM_SIDE[game.players[attackerId].teamId]; // 對方場在 z 為 -side 方向
  const sign = a.x >= 0 ? 1 : -1;                          // 攻擊手所在半邊
  return {
    line: { x: sign * 4.15, z: -side * 5.2 },   // 直線（seamZ＝前後排之間的縫）
    cross: { x: -sign * 3.9, z: -side * 6.3 },  // 斜線
    middle: { x: 0, z: -side * 5.0 },           // 中路
    tip: { x: -sign * 1.2, z: -side * 1.9 },    // 吊球短區
  };
}

// 攻擊路線在網面（z=0）通過的 x（攻守兩端共用：讀攔網、攔網站位計算、C2 讀站位）
export function netCrossingX(from, aim) {
  const t = from.z / (from.z - aim.z);
  return from.x + (aim.x - from.x) * t;
}

// 遲滯門檻（無因次；1.0＝正好站在某條過網線的過網點上）。
// 為什麼取無因次：兩條過網線的間距會隨攻擊手位置變（前排兩翼半距約 0.70m、
// 後排 pipe 約 0.77m～1.5m）——用比例表達，「站得多堅決」的語意才在各種攻擊點一致。
// ENTER 0.45 / EXIT 0.20 ＝ 前排時約 0.32m 才算「明確封某條線」、
// 要掉回 0.14m 內才回中性；line↔cross 直接互翻需走 0.63m。
// 選這組數字的理由：AI 自己的封線偏移 BLOCK_SCHEME_SHIFT ＝ 0.9m，取其半略少作
// 「玩家有意識地站過去」的判準；網前 ±0.3m 的碎步微調落在死區內＝後排陣型不抖。
// MIN_M＝絕對地板（幾何退化、兩條線幾乎重疊時不讓比例放大雜訊）。
export const BLOCK_READ = { ENTER: 0.45, EXIT: 0.20, MIN_M: 0.15 };

// 從防守者的實際站位推論他在封哪條線：'line' | 'cross' | null（模稜兩可＝中性）。
// prev＝上一次的判定（遲滯用）；純函式，不寫回任何狀態。
export function blockLaneRead(game, defenderId, attackerId, prev = null, k = BLOCK_READ) {
  const atk = game.actors[attackerId];
  const def = game.actors[defenderId];
  if (!atk || !def) return null;
  const aims = spikeAimsFor(game, attackerId);
  const lineX = netCrossingX(atk, aims.line);
  const crossX = netCrossingX(atk, aims.cross);
  const half = (lineX - crossX) / 2;
  if (!Number.isFinite(half) || Math.abs(half) < 1e-6) return null;
  const mid = (lineX + crossX) / 2;
  // 正＝往「直線過網點」那側靠（封直線）；負＝往斜線過網點那側靠（封斜線）
  const lean = (def.x - mid) / half;
  const enter = Math.max(k.ENTER, k.MIN_M / Math.abs(half));
  const exit = Math.max(k.EXIT, (k.MIN_M * 0.5) / Math.abs(half));
  if (prev === 'line') {
    if (lean > exit) return 'line';
    return lean < -enter ? 'cross' : null;
  }
  if (prev === 'cross') {
    if (lean < -exit) return 'cross';
    return lean > enter ? 'line' : null;
  }
  if (lean > enter) return 'line';
  if (lean < -enter) return 'cross';
  return null;
}

// 封線 → 後排收縮方向。**唯一真相＝liberoRead 的 DIG_SCHEMES 配對**
// （封直線・收斜線／封斜線・收直線），此處只是 sim 側的同一張表（sim 不得 import input）
export function digForBlock(block) {
  if (block === 'line') return 'cross';
  if (block === 'cross') return 'line';
  return null;
}
