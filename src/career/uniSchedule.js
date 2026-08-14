// 大學長循環賽程（大學卷 批 6，2026-08-14）——九隊單循環 8 場、國際排球勝點制。
//
// ★ 為什麼另寫一支，而不是改 `schedule.js` ★ 卷宗 §三-4 拍板：高中那份**一行不動**
// ⇒ 高中的平衡治具不必重跑、`sim-hash` 不被推移。而且高中那份的名次表數學**寫死
// 假設恰好 4 隊**（`schedule.js:174` 的 mini-league），九隊套不進去——這不是巧合，
// 是兩種賽制本來就不同：高中是「小組＋淘汰」，大學是「一整年的長循環」。
//
// ★ 兩者的名次規則也不同 ★ 高中：勝場 → 互勝 → 淨得分 → seed（`schedule.js:193`）。
// 大學：**積分（勝點制）** → 勝場 → 局差 → 分差。勝點制的重點是「輸得漂亮也有分」，
// 拿勝場數當積分就等於沒有這個制度。
//
// ★ 賽制＝bo3（2026-08-14 Sawmah 拍板）★ 勝點制需要局數，而 bo1 場次連局數欄位都
// 沒有（`app/matchCareer.js:93-97`：只有 series 存在時 scoreFor 才是局數、sets 才有
// 逐局比分）。賽程項自帶 `format: 3`，由 `matchConfig` 優先採用——這樣不必去改
// `schedule.js` 的 `matchFormatOf`。
//
// 驗收＝`docs/kickoffs/acceptance-uni-batch6.md`（動手前凍結）。
import { UNIVERSITIES, universityById } from './universities.js';

// 玩家在積分表裡的佔位 id（沿用高中的語彙 `RR_PLAYER_ID`，同義不同表）
export const UNI_PLAYER_ID = '__player__';
export const UNI_MATCH_FORMAT = 3; // bo3
export const UNI_ROUNDS = UNIVERSITIES.length - 1; // 九隊單循環＝每隊 8 場

// ── 決定論雜湊（同 `schedule.js` 的精神：全程零亂數，同 seed 同結果）──
function hash32(...parts) {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return (h >>> 0) / 4294967296;
}

/**
 * 勝點（國際排球規則的三局版）。★ 這是本批最容易寫錯的一行 ★
 * 2-0 勝＝3 分／2-1 勝＝2 分／1-2 敗＝1 分／0-2 敗＝0 分。
 * 「輸掉但搶下一局」與「被橫掃」不同分，這正是勝點制存在的理由。
 */
export function uniPointsFor(setsFor, setsAgainst) {
  const f = Number.isFinite(setsFor) ? setsFor : 0;
  const a = Number.isFinite(setsAgainst) ? setsAgainst : 0;
  if (f > a) return a === 0 ? 3 : 2; // 2-0 ⇒ 3；2-1 ⇒ 2
  if (f < a) return f === 0 ? 0 : 1; // 0-2 ⇒ 0；1-2 ⇒ 1
  return 0; // bo3 不會平手；壞資料照 0 給（不猜）
}

const BYE = '__bye__';

/**
 * 九隊單循環的**完整**對戰表（circle method）。
 * ★ 九隊是奇數 ⇒ 每一輪一定有一隊輪空 ★ 補一個虛擬的 BYE 湊成十隊、固定第一個位置、
 * 其餘輪轉——這是標準做法，保證每隊恰好與其他八隊各打一次、共 9 輪。
 * 第一版寫成「每輪把剩下的隊兩兩配對」，7 隊配不成整數對、每隊也湊不滿 8 場
 *（測試抓到：有隊伍只打了 6 場）。這不是小 bug，是賽程生成器的根本形狀錯了。
 *
 * @returns `rounds[]`，每項是 `[[idA, idB], ...]`（已剔除輪空的那一對）
 */
export function uniRounds(seed = 1) {
  const ids = UNIVERSITIES.map((u) => u.id);
  // 決定論打散起始排列（同 seed 同賽程）
  const ring = [...ids, BYE].sort((a, b) => hash32(seed, 'ring', a) - hash32(seed, 'ring', b));
  const n = ring.length; // 10
  const fixed = ring[0];
  let rot = ring.slice(1); // 9 個輪轉位
  const rounds = [];
  for (let r = 0; r < n - 1; r += 1) { // 9 輪
    const pairs = [[fixed, rot[rot.length - 1]]];
    for (let i = 0; i < (n - 2) / 2; i += 1) pairs.push([rot[i], rot[rot.length - 2 - i]]);
    rounds.push(pairs.filter(([a, b]) => a !== BYE && b !== BYE));
    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)];
  }
  return rounds;
}

/**
 * 玩家視角的一整年賽程：其餘八所各打一次（從完整對戰表裡挑出有玩家的那 8 輪）。
 * ★ 玩家自己那一所不得出現在對手裡 ★（把自己排進賽程是這種生成器的經典 bug）
 * **最後一場固定是同 tier 裡最強的那一所**——讓賽季有個收尾的重量
 *（強豪路線的「決定冠軍的一戰」、弱校路線的「校史一戰」）。
 * `roundNo` 帶著原始輪次，積分表要靠它把同一輪的對手互戰一起結算。
 */
export function buildUniSchedule({ schoolId, seed = 1 }) {
  const me = universityById(schoolId);
  if (!me) return [];
  const rounds = uniRounds(seed);
  const mine = [];
  rounds.forEach((pairs, i) => {
    const pair = pairs.find(([a, b]) => a === me.id || b === me.id);
    if (pair) mine.push({ roundNo: i, opponentId: pair[0] === me.id ? pair[1] : pair[0] });
  });
  // 壓軸＝同 tier 中 level 最高的對手；沒有同 tier 的就用全場最強
  const oppOf = (x) => universityById(x.opponentId);
  const sameTier = mine.filter((x) => oppOf(x).tier === me.tier);
  const finale = (sameTier.length ? sameTier : mine)
    .reduce((best, x) => (oppOf(x).level > oppOf(best).level ? x : best));
  const order = [...mine.filter((x) => x !== finale), finale];
  return order.map((x, i) => ({
    id: `uni-r${i + 1}`,
    stage: 'uni',
    round: 'league',
    roundNo: x.roundNo,
    opponentId: x.opponentId,
    label: `第 ${i + 1} 輪`,
    format: UNI_MATCH_FORMAT,
  }));
}

// ── 對手互戰（玩家不在場的那些場次）──
// ★ 為什麼要算 ★ 沒有它，積分表上只有玩家一隊有分，名次毫無意義。
// 高中那份用「level 高者勝、淨得分記 0」（`schedule.js:139-144`）——那對小組賽夠用，
// 但勝點制吃局數與局差，全記 0 會讓所有對手同分、名次退化成 seed 排序。
// 這裡用同一個精神（level 差＋決定論雜湊）產出**局比**：差距大→2-0，接近→2-1。
function simulateSetScore(a, b, seed, tag) {
  const gap = (a.level - b.level) / 20; // ±1 約等於 20 級差
  const roll = hash32(seed, tag, a.id, b.id) - 0.5; // −0.5～0.5
  const edge = gap + roll * 0.9; // 實力為主、運氣為輔
  if (edge > 0.35) return [2, 0];
  if (edge > 0) return [2, 1];
  if (edge > -0.35) return [1, 2];
  return [0, 2];
}

// 每局的比分（只為了讓「分差」這一層 tiebreak 有東西可比；勝局 25、敗局 18–23）
function pointsForSets(setsFor, setsAgainst, seed, tag) {
  let f = 0;
  let a = 0;
  for (let i = 0; i < setsFor + setsAgainst; i += 1) {
    const won = i < setsFor; // 順序不影響總分
    const loserPoints = 18 + Math.floor(hash32(seed, tag, 'pt', i) * 6); // 18–23
    if (won) { f += 25; a += loserPoints; } else { f += loserPoints; a += 25; }
  }
  return [f, a];
}

const emptyRow = (id, name) => ({
  id, name, played: 0, wins: 0, losses: 0, points: 0, setsFor: 0, setsAgainst: 0, ptsFor: 0, ptsAgainst: 0,
});

const addMatch = (row, sf, sa, pf, pa) => {
  row.played += 1;
  if (sf > sa) row.wins += 1; else row.losses += 1;
  row.points += uniPointsFor(sf, sa);
  row.setsFor += sf;
  row.setsAgainst += sa;
  row.ptsFor += pf;
  row.ptsAgainst += pa;
};

/**
 * 積分表。**純函式**（同一份 schedule/results 永遠得到同一張表 ⇒ 不必存進存檔）。
 * 名次＝積分 → 勝場 → 局差 → 分差（逐層，前一層同分才看下一層）。
 *
 * @param schoolId 玩家的學校
 * @param seed     決定論來源（對手互戰）
 * @param schedule `career.schedule`（只吃 `round === 'league'` 的項）
 * @param results  `career.results`（bo3 ⇒ scoreFor/scoreAgainst 就是局數）
 * @returns { table, playerRank, played, complete }
 */
export function uniTable({ schoolId, seed = 1, schedule = [], results = [] }) {
  const me = universityById(schoolId);
  if (!me) return { table: [], playerRank: null, played: 0, complete: false };
  const rows = new Map();
  rows.set(UNI_PLAYER_ID, emptyRow(UNI_PLAYER_ID, me.name));
  for (const u of UNIVERSITIES) {
    if (u.id !== me.id) rows.set(u.id, emptyRow(u.id, u.name));
  }
  const league = schedule.filter((m) => m?.round === 'league');
  const resultOf = (id) => results.find((r) => r.matchId === id) ?? null;

  // ① 玩家打過的場次：真實結果（bo3 ⇒ scoreFor/scoreAgainst ＝ 局數）
  const playedRounds = new Set();
  for (const m of league) {
    const r = resultOf(m.id);
    if (!r) continue;
    playedRounds.add(m.id);
    // ★ 第二層防線：局數不可能超過賽制上限 ★ 源頭（`resolveForfeit`）已按賽制記局數，
    // 但這張表也讀得到舊存檔與手改過的資料——bo3 卻寫著 25 的話，勝點那一層算得出
    // 合理的 0 分（所以不會報錯），局差卻被灌成 ±25，一筆髒資料就能決定整季名次。
    // clamp 到 0..bestOf：讓「讀進來的值超出賽制」不再是一個能改變名次的通道。
    const cap = [3, 5].includes(m.format) ? m.format : UNI_MATCH_FORMAT;
    const sf = Math.min(cap, Math.max(0, r.scoreFor | 0));
    const sa = Math.min(cap, Math.max(0, r.scoreAgainst | 0));
    const [pf, pa] = pointsForSets(sf, sa, seed, `player-${m.id}`);
    addMatch(rows.get(UNI_PLAYER_ID), sf, sa, pf, pa);
    const opp = rows.get(m.opponentId);
    if (opp) addMatch(opp, sa, sf, pa, pf);
  }

  // ② 同一輪裡對手之間的互戰——★只結算玩家已經打完的輪次★
  //    否則積分表會提前劇透還沒發生的比賽（而且玩家一場沒打，別人已經打完整季）。
  //    配對直接取自完整對戰表（`uniRounds`），不另外湊——湊出來的配對會讓每隊
  //    打的場次數對不上（第一版就是這樣壞的）。
  const rounds = uniRounds(seed);
  // 要結算哪幾輪：玩家打過的那幾輪 ＋（賽季全部打完時）玩家**輪空**的那一輪。
  // ★ 沒有後半句，聯賽最後會有隊伍只打 7 場 ★ 九隊循環有 9 輪、玩家只上場 8 輪，
  // 那一輪的四場比賽沒人結算——測試抓到「瀚崎體育大學只打了 7 場」。
  const settle = new Set(league.filter((m) => playedRounds.has(m.id)).map((m) => m.roundNo));
  const seasonDone = league.length > 0 && playedRounds.size === league.length;
  if (seasonDone) rounds.forEach((_, i) => settle.add(i));
  for (const roundNo of settle) {
    const pairs = rounds[roundNo] ?? [];
    for (const [a, b] of pairs) {
      if (a === me.id || b === me.id) continue; // 玩家那一場已在 ① 用真實結果記過
      const A = universityById(a);
      const B = universityById(b);
      if (!A || !B) continue;
      const [sa, sb] = simulateSetScore(A, B, seed, `r${roundNo}`);
      const [pa, pb] = pointsForSets(sa, sb, seed, `r${roundNo}-${A.id}`);
      addMatch(rows.get(A.id), sa, sb, pa, pb);
      addMatch(rows.get(B.id), sb, sa, pb, pa);
    }
  }

  const table = [...rows.values()].sort((a, b) => (
    b.points - a.points
    || b.wins - a.wins
    || (b.setsFor - b.setsAgainst) - (a.setsFor - a.setsAgainst)
    || (b.ptsFor - b.ptsAgainst) - (a.ptsFor - a.ptsAgainst)
    || hash32(seed, 'tie', a.id) - hash32(seed, 'tie', b.id)
  ));
  const playerRank = table.findIndex((r) => r.id === UNI_PLAYER_ID) + 1;
  const played = rows.get(UNI_PLAYER_ID).played;
  return { table, playerRank, played, complete: played >= league.length && league.length > 0 };
}
