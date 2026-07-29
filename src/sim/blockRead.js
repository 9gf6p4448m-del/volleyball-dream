// Phase 5 W1 §7 C2 — 攔網站位讀取（純函式、決定論；sim 核心，零 three/DOM）
//
// 07-28 Sawmah 拍板（A 案）：玩家在 OH／MB／OPP 前排攔網時是用**身體站位**在封線，
// 後排隊友沒有面板可看——真實排球裡隊友是「看你站哪」，不是「看你按了什麼」。
// 因此本檔把受控玩家的實際 x 座標翻譯成「他在封直線還是封斜線」，
// 由 ai.js 的後排 dig 分支消費（封直線→後排收斜線，語意沿用 liberoRead 的既有配對）。
//
// 零新面板（§10 明定球內不得新增決策面板）；零 rng。
//
// 07-29 追記：本檔同時是 §6 B1「攔網 read／commit 人格」＋ B2「close 時間預算」
// 的純函式家（見檔案下半的 B1／B2 段）——同屬「攔網手在讀什麼」，不另開新檔。
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

// ==================== §6 B1 攔網人格 ／ B2 close 時間預算 ====================
// ==== B1-SCAN-BEGIN（工單 §6 反作弊掃描區：本區內不得出現 attackerId）====
//
// 玩家版的 read／commit 早就存在——`src/input/matchControls.js:578-584` 的 MB 面板
// 就是一場**時機賭局**：early＝搶快攻＝立即起跳；不按＝等高球＝就位後自動跳攔，
// 賭錯高球＝48-tick 攔網窗過期、落地球才來。B1 就是把**同一個賭局**鏡像給 AI
// 當隊伍人格，語意一格不改、不發明第二套定義：
//
//   read   ＝「不按」：守住既有的追球軸、等球離手才反應。
//            ——這正是本檔改動前 ai.js 攔網分支的行為（逐 tick 追 game.ball.x），
//              所以 read 人格在 sim 裡**一行程式碼都沒動**。代價：追不到邊線。
//   commit ＝「按」：不等二傳出手就跟死快攻（見 blockCommitRead）。
//            代價＝球離手後還要等自己的反應時間才解鎖，判錯就是真的來不及。
//
// ★★★ 反作弊保證（工單 §6 硬性要求：攔網 AI 不得直接讀取 attackerId）★★★
//   保證的那一行＝下方 `export function blockCommitRead(game, atkTeam, opts = {})`
//   ——參數只有 game、攻方**隊伍代號**與可觀察線索，**沒有任何管道拿到
//   「二傳最後選了誰」**。本檔全檔零 `attackerId` 字樣，ai.js 的判讀路徑也以
//   `B1-SCAN-BEGIN/END` 圍起來，由 tests/block-persona.test.mjs 靜態掃描把關
//   （有人偷讀就轉紅）。
//
// 三組線索與玩家面板（src/input/blockRead.js `mbReadFor`）讀的是**同一組**：
//   ① 一傳品質 passTier —— 決定快攻在不在池裡（attackPointsOf 的同一條分支）。
//      ★誠實記錄：實測目前恆為 'perfect'（101 次進攻組織／8 seeds，見
//        docs/kickoffs/phase5-w2-discussion-brief.md D-3）＝這條線索**目前無變化**。
//        照接不照改——一傳品質是平衡命脈，工單 §11 禁動。
//   ② 二傳朝向 —— sim 沒有身體朝向這個量、跳舉是 §5 A3 本輪未做，
//      能拿到的只有二傳的**實際站位**，故以「相對名目舉球點的橫向偏移」為代理。
//      ★誠實記錄：二傳絕大多數時候就站在名目點上＝這條線索的變異量也極小。
//   ③ 各攻擊手的起步時機與路線 —— 只看 actor 這一 tick 的**實際位移**
//      （與 mbReadFor 的 APPROACH_EPS 同一把尺）。
//      **刻意不讀 §4 的 route 表**：route 帶著 startTick／takeoffTick／setTick 等
//      未來值，玩家在面板上看不到；AI 讀了就是資訊不對等——「AI 與玩家必須讀同一組」
//      的要求比「不讀 attackerId」更嚴，本檔取嚴的那一邊。

export const BLOCK_PERSONA = { READ: 'read', COMMIT: 'commit' };

export const BLOCK_COMMIT = {
  // 朝網位移門檻（m／tick）：與 src/input/blockRead.js 的 APPROACH_EPS 同值同語意
  //（玩家面板判「這個人正在助跑」用的就是這把尺）
  APPROACH_EPS: 0.005,
  // 助跑判定深度（隊伍視角 lz）：前排職責站位 lz＝3.0（rotation.js POSITION_TEMPLATE）。
  // 比職責線**更進去**且還在往網走＝這個人已經在跑快攻，不是站著等或走回位。
  // 2.9 是「職責線再進去一點點」——站著微抖的人跨不過，快攻手起步後 1-2 tick 就跨過。
  DEPTH_LZ: 2.9,
  // 同深度視為「兩個人一起在跑」的帶寬（m）——線索②只在這種模稜情境才有事做
  TIE_M: 0.5,
  // 二傳站位偏移到這麼多（m）才算「朝向讀得出來」；以下一律當成沒有資訊
  LEAN_M: 0.35,
  // close 預算的寬容（tick）：估算誤差內寧可去追（寧可追空，不可該追不追）
  CLOSE_SLACK: 2,
};

// 誰正要碰下一球（場上看得見）：他往網跑是去舉球、不是去扣球，不算助跑。
// 純幾何、決定論（平手取 id 序）
function nearestToBall(game, rot) {
  const b = game.ball;
  let id = null;
  let best = Infinity;
  for (const pid of rot) {
    const a = game.actors[pid];
    if (!a) continue;
    const d = (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
    if (id === null || d < best || (d === best && pid < id)) {
      best = d;
      id = pid;
    }
  }
  return id;
}

// 線索②的代理量：二傳實際站位相對名目舉球點的橫向偏移（隊伍視角，正＝往右手側）。
// 讀不到二傳（換人／資料缺）回 0＝沒有資訊
export function setterLeanOf(game, team, setterSpotLx = 0) {
  const rot = game.match.rotations?.[team] ?? [];
  for (const pid of rot) {
    if (game.players[pid]?.currentRole !== 'setter') continue;
    const a = game.actors[pid];
    return a ? TEAM_SIDE[team] * a.x - setterSpotLx : 0;
  }
  return 0;
}

// ★ 反作弊保證線 ★ —— 參數只有 game／攻方隊伍代號／可觀察線索，取不到 attackerId。
// 回傳「此刻該跟死的那個人在世界 x 的哪裡」（{ x, depth }）或 null（沒人在跑快攻）。
// 刻意**不回傳任何 playerId**：呼叫端就算想偷渡也拿不到人。
export function blockCommitRead(game, atkTeam, opts = {}) {
  const { passTier = null, setterSpotLx = 0, k = BLOCK_COMMIT } = opts;
  // 線索①：一傳沒到位＝快攻不在池裡，commit 沒有標的（目前恆 perfect，見檔頭）
  if (passTier != null && passTier !== 'perfect') return null;
  const rot = game.match.rotations?.[atkTeam];
  if (!rot?.length) return null;
  const side = TEAM_SIDE[atkTeam];
  const chaserId = nearestToBall(game, rot);
  // 線索③：誰已經越過職責線、而且這一 tick 還在往網走
  const cands = [];
  for (const pid of rot) {
    if (pid === chaserId) continue;
    const p = game.players[pid];
    const a = game.actors[pid];
    if (!p || !a) continue;
    // 角色是公開資訊（玩家面板 mbReadFor 也照 currentRole 分翼別）：
    // 二傳往網跑是去舉球、自由人不進攻擊池
    if (p.currentRole === 'setter' || p.currentRole === 'libero') continue;
    const lz = side * a.z;
    if (lz > k.DEPTH_LZ) continue;
    if ((side * a.pz) - lz <= k.APPROACH_EPS) continue;
    cands.push({ lz, x: a.x, lx: side * a.x });
  }
  if (!cands.length) return null;
  let best = cands[0];
  for (const c of cands) if (c.lz < best.lz) best = c;
  // 線索②：同深度還有第二個人在跑時，偏向二傳身體轉過去的那一側
  const tie = cands.filter((c) => c.lz - best.lz <= k.TIE_M);
  if (tie.length > 1) {
    const lean = setterLeanOf(game, atkTeam, setterSpotLx);
    if (Math.abs(lean) >= k.LEAN_M) {
      for (const c of tie) {
        if (lean > 0 ? c.lx > best.lx : c.lx < best.lx) best = c;
      }
    }
  }
  return { x: best.x, depth: best.lz };
}

// §6 B2 close 時間預算（純算術）：從現在的位置追到「球會被扣的那條線」要幾 tick，
// 對上「球飛到擊球窗上緣還剩幾 tick」。判錯或起步晚 → ticksNeeded > ticksLeft → 追不到。
// ★ 本函式只回答「來不來得及」，**不搬動任何人**——位移一律走 ai.js 的 moveIntent
//   （單 tick 位移受 moveSpeed×SIM_DT 上限約束），所以結構上不可能瞬移補位。
// ticksLeft 給 null（預測失效）＝沒有預算資訊，一律當作追得到（寧可去追）。
export function blockCloseBudget({ fromX, toX, stepM, ticksLeft = null, slack = 0 }) {
  const dist = Math.abs(toX - fromX);
  const ticksNeeded = stepM > 0 ? dist / stepM : Infinity;
  return {
    dist,
    ticksNeeded,
    ticksLeft,
    canClose: ticksLeft == null ? true : ticksNeeded <= ticksLeft + slack,
  };
}
// ==== B1-SCAN-END ====
