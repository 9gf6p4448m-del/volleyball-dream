// 職業聯賽賽程（職業章 批 1，2026-08-26）——八隊單循環 7 場＋四強單淘汰季後賽。
//
// ★ 為什麼另寫一支，而不是改 `corpSchedule.js` ★ 凍結驗收 A5：高中 `schedule.js`／
// 大學 `uniSchedule.js`／企業 `corpSchedule.js` 零改動——同企業章對大學的隔離理由
// （範本不動，各章的平衡治具互不推移）。代價是本檔與 `corpSchedule.js` 的三個
// 私有 helper（hash32／simulateSetScore／pointsForSets）是**有意的複製**：
// ★ 收斂掛帳 ★ 待各章都穩定後抽共同模組（記入卷宗§五）；在那之前，改其中一份
// 演算法時 grep 其餘份（測試對勝點與局差有逐值斷言，漂移會紅）。
//
// 勝點規則本身**不複製**：`uniPointsFor` 是大學檔的公開 export，直接 import——
// 「2-0＝3／2-1＝2／1-2＝1／0-2＝0」只有一份事實來源。
//
// ★ 八隊是偶數 ⇒ 不需要 BYE ★ 同企業章：circle method 固定第一位、其餘 7 位輪轉
// ＝7 輪、每隊每輪都有比賽。
//
// ★ 季後賽 bracket（本批新增，企業章沒有這段）★ 循環賽打完前四名晉級四強單淘汰
// bo3（拍板題 3「季後賽首開」）。三顆純函式各司其職、互不相依於 UI：
//   ① playoffSeedsFrom(table)：名次表前四名 → 種子序（1~4 名的 id）
//   ② buildPlayoffBracket(seeds)：種子序 → 準決賽對戰組（1v4、2v3）
//   ③ advancePlayoffToFinal(bracket, results)：準決賽結果 → 決賽對戰組
//   ④ playoffChampionOf(finalBracket, results)：決賽結果 → 冠軍 id
// 只做產生器與推進純函式——出戰入口/UI 顯示/推進接線是批 3 的事。
//
// 驗收＝`docs/kickoffs/acceptance-pro-batch1.md`（A5）。
//
// ★ 國外聯賽卷 批 1（2026-08-27）對稱守衛 ★ `proTeams.js` 併 BY_ID 後，`proTeamById`
// 對海外 id 也回得出定義（不再是 null）——`buildProSchedule`／`proTable` 兩處純國內
// 假設因此要各補一道守衛：`buildProSchedule` 拿海外 id 找不到任何一輪對戰（海外隊不在
// `PRO_TEAMS` 的循環賽對戰表裡），`mine` 會是空陣列，原本壓軸重排那行 `.reduce` 無初值
// 對空陣列會 throw；`proTable` 拿海外 id 會把玩家隊名塞進國內 8 隊的積分表，名次表變
// 9 列、語意錯亂。兩處都改成「非本聯賽 id ⇒ 回空，不猜」，其餘國內路徑零改動。
// 驗收＝`docs/kickoffs/acceptance-foreign-batch1.md`（F1-10）。
import { PRO_TEAMS, proTeamById } from './proTeams.js';
import { uniPointsFor } from './uniSchedule.js';

// 玩家在積分表裡的佔位 id（沿高中 RR_PLAYER_ID／大學 UNI_PLAYER_ID／企業 CORP_PLAYER_ID
// 的語彙，同義不同表）
export const PRO_PLAYER_ID = '__player__';
export const PRO_MATCH_FORMAT = 3; // bo3（勝點制需要局數，同大學/企業拍板）
export const PRO_ROUNDS = PRO_TEAMS.length - 1; // 八隊單循環＝每隊 7 場

/** 勝點（同大學/企業：單一事實來源，re-export 給職業側呼叫端）。 */
export const proPointsFor = uniPointsFor;

// ── 決定論雜湊（與 `corpSchedule.js:29` 同式——有意複製，見檔頭）──
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
 * 八隊單循環的**完整**對戰表（circle method）。
 * @returns `rounds[]`，每項是 `[[idA, idB], ...]`（八隊偶數 ⇒ 每輪恰 4 場、無輪空）
 */
export function proRounds(seed = 1) {
  const ring = PRO_TEAMS.map((t) => t.id)
    .sort((a, b) => hash32(seed, 'ring', a) - hash32(seed, 'ring', b));
  const n = ring.length; // 8
  const fixed = ring[0];
  let rot = ring.slice(1); // 7 個輪轉位
  const rounds = [];
  for (let r = 0; r < n - 1; r += 1) { // 7 輪
    const pairs = [[fixed, rot[rot.length - 1]]];
    for (let i = 0; i < (n - 2) / 2; i += 1) pairs.push([rot[i], rot[rot.length - 2 - i]]);
    rounds.push(pairs);
    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)];
  }
  return rounds;
}

/**
 * 玩家視角的一整年賽程：其餘七隊各打一次。
 * ★ 玩家自己那一隊不得出現在對手裡 ★（同大學/企業版的經典 bug 防線）
 * 壓軸＝同 tier 中 level 最高的對手——同大學/企業版：讓賽季有個收尾的重量。
 * `round: 'pro'` 是職業章賽程的**章節標記**（`careerState.advanceSeason` 高中版
 * 靠它擋線，同 `'league'`／`'corp'` 之於大學/企業）。
 */
export function buildProSchedule({ teamId, seed = 1 }) {
  const me = proTeamById(teamId);
  if (!me) return [];
  const rounds = proRounds(seed);
  const mine = [];
  rounds.forEach((pairs, i) => {
    const pair = pairs.find(([a, b]) => a === me.id || b === me.id);
    if (pair) mine.push({ roundNo: i, opponentId: pair[0] === me.id ? pair[1] : pair[0] });
  });
  // 對稱守衛（F1-10）：海外 id 併表後 proTeamById 認得，但不在國內循環賽對戰表裡
  // ⇒ mine 是空陣列，不擋住的話下面的 .reduce 無初值會 throw。
  if (!mine.length) return [];
  const oppOf = (x) => proTeamById(x.opponentId);
  const sameTier = mine.filter((x) => oppOf(x).tier === me.tier);
  const finale = (sameTier.length ? sameTier : mine)
    .reduce((best, x) => (oppOf(x).level > oppOf(best).level ? x : best));
  const order = [...mine.filter((x) => x !== finale), finale];
  return order.map((x, i) => ({
    id: `pro-r${i + 1}`,
    stage: 'pro',
    round: 'pro',
    roundNo: x.roundNo,
    opponentId: x.opponentId,
    label: `第 ${i + 1} 輪`,
    format: PRO_MATCH_FORMAT,
  }));
}

// ── 對手互戰（玩家不在場的場次；與 `corpSchedule.js:94-113` 同式——有意複製，見檔頭）──
function simulateSetScore(a, b, seed, tag) {
  const gap = (a.level - b.level) / 20;
  const roll = hash32(seed, tag, a.id, b.id) - 0.5;
  const edge = gap + roll * 0.9;
  if (edge > 0.35) return [2, 0];
  if (edge > 0) return [2, 1];
  if (edge > -0.35) return [1, 2];
  return [0, 2];
}

function pointsForSets(setsFor, setsAgainst, seed, tag) {
  let f = 0;
  let a = 0;
  for (let i = 0; i < setsFor + setsAgainst; i += 1) {
    const won = i < setsFor;
    const loserPoints = 18 + Math.floor(hash32(seed, tag, 'pt', i) * 6);
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
  row.points += proPointsFor(sf, sa);
  row.setsFor += sf;
  row.setsAgainst += sa;
  row.ptsFor += pf;
  row.ptsAgainst += pa;
};

/**
 * 積分表。**純函式**（同一份 schedule/results 永遠得到同一張表 ⇒ 不必存進存檔）。
 * 名次＝積分 → 勝場 → 局差 → 分差（與大學/企業同一套層級）。
 * ★ 只結算玩家打過的輪次 ★ 八隊偶數、玩家每輪都有比賽 ⇒ 沒有大學版「玩家輪空
 * 那一輪要補結算」的特例。
 */
export function proTable({ teamId, seed = 1, schedule = [], results = [] }) {
  const me = proTeamById(teamId);
  // 對稱守衛（F1-10）：me.league==='foreign' ＝海外 id（併表後 proTeamById 認得，
  // 但不屬於這張國內 8 隊積分表）⇒ 回空，不把玩家塞進錯的聯賽。
  if (!me || me.league === 'foreign') return { table: [], playerRank: null, played: 0, complete: false };
  const rows = new Map();
  rows.set(PRO_PLAYER_ID, emptyRow(PRO_PLAYER_ID, me.name));
  for (const t of PRO_TEAMS) {
    if (t.id !== me.id) rows.set(t.id, emptyRow(t.id, t.name));
  }
  const league = schedule.filter((m) => m?.round === 'pro');
  const resultOf = (id) => results.find((r) => r.matchId === id) ?? null;

  // ① 玩家打過的場次：真實結果（bo3 ⇒ scoreFor/scoreAgainst ＝ 局數；
  //    clamp 防線同 corpTable——髒資料不得成為改變名次的通道）
  const playedRounds = new Set();
  for (const m of league) {
    const r = resultOf(m.id);
    if (!r) continue;
    playedRounds.add(m.roundNo);
    const cap = [3, 5].includes(m.format) ? m.format : PRO_MATCH_FORMAT;
    const sf = Math.min(cap, Math.max(0, r.scoreFor | 0));
    const sa = Math.min(cap, Math.max(0, r.scoreAgainst | 0));
    const [pf, pa] = pointsForSets(sf, sa, seed, `player-${m.id}`);
    addMatch(rows.get(PRO_PLAYER_ID), sf, sa, pf, pa);
    const opp = rows.get(m.opponentId);
    if (opp) addMatch(opp, sa, sf, pa, pf);
  }

  // ② 同一輪裡對手之間的互戰——只結算玩家已打完的輪次（不劇透未來）
  const rounds = proRounds(seed);
  for (const roundNo of playedRounds) {
    const pairs = rounds[roundNo] ?? [];
    for (const [a, b] of pairs) {
      if (a === me.id || b === me.id) continue; // 玩家那一場已在 ① 用真實結果記過
      const A = proTeamById(a);
      const B = proTeamById(b);
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
  const playerRank = table.findIndex((r) => r.id === PRO_PLAYER_ID) + 1;
  const played = rows.get(PRO_PLAYER_ID).played;
  return { table, playerRank, played, complete: played >= league.length && league.length > 0 };
}

// ════════════════════════════════════════════════════════════════
// 季後賽（循環前四 → 四強單淘汰 bo3）——批 1 新增，企業章沒有這段
// ════════════════════════════════════════════════════════════════
export const PLAYOFF_ROUND = { SEMI: 'semi', FINAL: 'final' };
export const PRO_PLAYOFF_MATCH_IDS = { SEMI_1: 'pro-semi-1', SEMI_2: 'pro-semi-2', FINAL: 'pro-final' };

/**
 * 名次表前四名 → 種子序（1~4 名的 id，順序＝種子順序）。
 * 名次表（`proTable().table`）不足 4 隊或非陣列＝資料還沒打完，回 null（不猜）。
 */
export function playoffSeedsFrom(table) {
  if (!Array.isArray(table) || table.length < 4) return null;
  return table.slice(0, 4).map((r) => r.id);
}

/**
 * 種子序 → 準決賽對戰組：1 種子 vs 4 種子、2 種子 vs 3 種子（標準種子制）。
 * **純函式**，不含任何 UI/存檔副作用——出戰入口接線是批 3 的事。
 */
export function buildPlayoffBracket(seeds) {
  if (!Array.isArray(seeds) || seeds.length !== 4) return null;
  const [s1, s2, s3, s4] = seeds;
  return {
    round: PLAYOFF_ROUND.SEMI,
    matches: [
      {
        id: PRO_PLAYOFF_MATCH_IDS.SEMI_1, seedHome: 1, seedAway: 4, home: s1, away: s4,
        format: PRO_MATCH_FORMAT,
      },
      {
        id: PRO_PLAYOFF_MATCH_IDS.SEMI_2, seedHome: 2, seedAway: 3, home: s2, away: s3,
        format: PRO_MATCH_FORMAT,
      },
    ],
  };
}

/**
 * 準決賽結果 → 決賽對戰組（純函式、推進）。
 * @param results  `[{ matchId, winnerId }, ...]`——對應 `buildPlayoffBracket` 產出的兩場 id。
 * @returns 兩場都有勝方才產生決賽物件；任一場缺勝方（未打/資料不全）回 null（不猜）。
 */
export function advancePlayoffToFinal(bracket, results = []) {
  if (!bracket || bracket.round !== PLAYOFF_ROUND.SEMI) return null;
  const winnerOf = (matchId) => results.find((r) => r.matchId === matchId)?.winnerId ?? null;
  const w1 = winnerOf(PRO_PLAYOFF_MATCH_IDS.SEMI_1);
  const w2 = winnerOf(PRO_PLAYOFF_MATCH_IDS.SEMI_2);
  if (!w1 || !w2) return null;
  return {
    round: PLAYOFF_ROUND.FINAL,
    matches: [{ id: PRO_PLAYOFF_MATCH_IDS.FINAL, home: w1, away: w2, format: PRO_MATCH_FORMAT }],
  };
}

/**
 * 決賽結果 → 冠軍 id（純函式）。決賽未打完（缺勝方）回 null（不猜）。
 */
export function playoffChampionOf(finalBracket, results = []) {
  if (!finalBracket || finalBracket.round !== PLAYOFF_ROUND.FINAL) return null;
  const m = finalBracket.matches[0];
  return results.find((r) => r.matchId === m.id)?.winnerId ?? null;
}

// ════════════════════════════════════════════════════════════════
// 賽季迴圈接線（批 3，2026-08-26）——把批 1 的 bracket 純函式「長」進賽程
// ════════════════════════════════════════════════════════════════
// 驗收＝`docs/kickoffs/acceptance-pro-batch3.md`（C2）。
//
// ★ 為什麼是「長」出來，不是像高中/大學/企業那樣一開局就排好 ★ 準決賽的對手
// （種子 1~4）要看循環賽真正打出來的名次表才知道是誰——不是賽制固定的敘事錨。
// 唯一的接線點＝`careerStore.saveCareer`（每個會動 career.results 的路徑都經它：
// 正常結算／棄賽／devSeed 治具），本檔只負責「給定 schedule/results，該不該長、
// 長什麼」的純函式判斷，不碰任何 IO。
//
// ★ C2c：NPC 側另一組準決不需要玩家打 ★ 決定論直接算勝方（比照 devSeed/enterPro
// 慣例用 seed 合成，**不呼叫 sim 引擎**），只有「含玩家那一場」的準決賽／決賽會
// 長進 schedule，讓玩家用既有的「▶ 出戰」入口打；NPC 那一場永遠不進 schedule，
// 也不佔用 career.results 的一格。
const PLAYOFF_LABEL = { [PLAYOFF_ROUND.SEMI]: '準決賽', [PLAYOFF_ROUND.FINAL]: '冠軍戰' };

/**
 * NPC 對 NPC 的季後賽場次勝方（決定論；同 seed 同結果，不佔 schedule/results 任何一格）。
 * 重用 league 對手互戰同一顆 `simulateSetScore`（level+hash 的既有慣例，不新造演算法）。
 */
export function npcPlayoffWinner(aId, bId, seed, tag) {
  const A = proTeamById(aId);
  const B = proTeamById(bId);
  if (!A || !B) return null;
  const [sa, sb] = simulateSetScore(A, B, seed, tag);
  return sa > sb ? aId : bId;
}

/**
 * 賽季迴圈接線：循環賽打滿後依名次表把季後賽場次長進 `schedule`；玩家勝出準決賽後
 * 再長決賽（準決敗＝單淘汰止步，C2a，不長決賽）。**純函式、冪等**——已經長過的
 * 場次、或還不夠格長的情況，一律回傳原 `schedule` **參考**（呼叫端用 `!==` 判斷
 * 要不要落檔）。
 * @param schedule  career.schedule（含循環賽場次，round==='pro'）
 * @param results   career.results
 * @param teamId    玩家所屬職業隊 id（用來在 `proTable` 認出玩家那一列）
 * @param seed      生涯種子（NPC 準決定論用）
 * @returns 新賽程陣列；沒有變化則回傳原 `schedule` 參考
 */
export function growProSchedule(schedule, results, teamId, seed = 1) {
  const league = (schedule ?? []).filter((m) => m?.round === 'pro');
  if (!league.length) return schedule; // 不是職業賽程（防呆：非 pro 章節呼叫端零影響）
  const leagueDone = league.every((m) => (results ?? []).some((r) => r.matchId === m.id));
  if (!leagueDone) return schedule; // 循環還沒打完

  const hasResult = (id) => (results ?? []).some((r) => r.matchId === id);
  const semiEntry = schedule.find((m) => m.round === PLAYOFF_ROUND.SEMI);

  if (!semiEntry) {
    // ① 循環剛打完：依名次表決定準決賽對手（C2a 對位正確／C2b 未進前四不長場次）
    const { table } = proTable({ teamId, seed, schedule, results });
    const seeds = playoffSeedsFrom(table);
    if (!seeds || !seeds.includes(PRO_PLAYER_ID)) return schedule; // C2b：未進前四
    const bracket = buildPlayoffBracket(seeds);
    const mine = bracket.matches.find((m) => m.home === PRO_PLAYER_ID || m.away === PRO_PLAYER_ID);
    const oppId = mine.home === PRO_PLAYER_ID ? mine.away : mine.home;
    return [...schedule, {
      id: mine.id, stage: 'pro', round: PLAYOFF_ROUND.SEMI, opponentId: oppId,
      label: PLAYOFF_LABEL[PLAYOFF_ROUND.SEMI], format: mine.format,
    }];
  }

  if (schedule.some((m) => m.round === PLAYOFF_ROUND.FINAL)) return schedule; // 決賽已長過，冪等
  if (!hasResult(semiEntry.id)) return schedule; // 準決賽還沒打完
  const semiResult = results.find((r) => r.matchId === semiEntry.id);
  if (!semiResult.won) return schedule; // C2a：準決敗＝單淘汰止步，不長決賽

  // ② 準決賽勝出：重建種子序＋bracket（proTable 只認 round==='pro' 的循環結果，
  //    加了準決賽結果不影響名次表——同一份名次表、同一份 bracket，找得回 semiEntry）
  const { table } = proTable({ teamId, seed, schedule, results });
  const seeds = playoffSeedsFrom(table);
  if (!seeds) return schedule; // 防呆：理論上循環已打完不會發生
  const bracket = buildPlayoffBracket(seeds);
  const mine = bracket.matches.find((m) => m.id === semiEntry.id);
  const other = bracket.matches.find((m) => m.id !== semiEntry.id);
  if (!mine || !other) return schedule; // 防呆：重建的 bracket 對不上落地的 semiEntry
  const npcWinner = npcPlayoffWinner(other.home, other.away, seed, 'npc-semi');
  const finalBracket = advancePlayoffToFinal(bracket, [
    { matchId: mine.id, winnerId: PRO_PLAYER_ID },
    { matchId: other.id, winnerId: npcWinner },
  ]);
  if (!finalBracket) return schedule; // 防呆
  const finalMatch = finalBracket.matches[0];
  const oppId = finalMatch.home === PRO_PLAYER_ID ? finalMatch.away : finalMatch.home;
  return [...schedule, {
    id: finalMatch.id, stage: 'pro', round: PLAYOFF_ROUND.FINAL, opponentId: oppId,
    label: PLAYOFF_LABEL[PLAYOFF_ROUND.FINAL], format: finalMatch.format,
  }];
}
