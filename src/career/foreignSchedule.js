// 海外聯賽賽程（國外聯賽卷 批 1，2026-08-27）——四隊雙循環 6 場＋四隊全晉級單淘汰季後賽。
//
// ★ 為什麼另寫一支，而不是改 `proSchedule.js` ★ 凍結驗收 F1-1：高中 `schedule.js`／
// 大學 `uniSchedule.js`／企業 `corpSchedule.js`／職業 `proSchedule.js` 零改動——同
// 職業章對前三章的隔離理由（範本不動，各章的平衡治具互不推移）。代價是本檔與
// `proSchedule.js` 的三個私有 helper（hash32／simulateSetScore／pointsForSets）及
// 積分表兩個私有 helper（emptyRow／addMatch）是**有意的複製**：
// ★ 收斂掛帳 ★ 待各章都穩定後抽共同模組（記入卷宗§三）；在那之前，改其中一份
// 演算法時 grep 其餘份（測試對勝點與局差有逐值斷言，漂移會紅）。
//
// 勝點規則本身**不複製**：`uniPointsFor` 是大學檔的公開 export，直接 import——
// 「2-0＝3／2-1＝2／1-2＝1／0-2＝0」只有一份事實來源。
//
// 季後賽 `PLAYOFF_ROUND`（'semi'/'final'）**不另造**，直接 import `proSchedule.js`
// 的同一份 export（本檔→proSchedule.js 單向依賴；proSchedule.js 不 import 本檔，
// 不會成環）——match id 用 `foreign-` 前綴，字串值不與 `pro-` 撞名。`playoffSeedsFrom`
// 同理直接 import（純函式、不吃 PRO_TEAMS，通用於任何 ≥4 列的名次表）。
//
// ★ 四隊是偶數 ⇒ 不需要 BYE ★ 同職業章：circle method 固定第一位、其餘 3 位輪轉
// ＝3 輪、每隊每輪都有比賽（單循環）。
//
// ★ 雙循環（拍板題 2：精簡聯賽 4 隊，賽制沿用既有引擎不加新機制）★ 4 隊只打單循環
// 太短（每隊僅 3 場），`foreignRounds` 把單循環 3 輪 **concat 自身**成 6 輪——下半循環
// roundNo 3..5，`simulateSetScore` 的 tag 帶 roundNo，天然與上半循環不同結果（不是
// 同一場比賽重播兩次，是同一組對手第二次交手）。
//
// ★ buildForeignSchedule 不做壓軸重排 ★ 職業版（`proSchedule.js`）把「同 tier 中
// level 最高的對手」挪到最後一場當壓軸；海外版**刻意不做**——雙循環最後一輪本身
// 就是收尾（第二次交手打的都是熟悉的對手），加一層重排反而讓「雙循環」的敘事被
// 打散。此為刻意差異，非遺漏。
//
// 驗收＝`docs/kickoffs/acceptance-foreign-batch1.md`（F1-6～F1-8）。
import { FOREIGN_TEAMS, foreignTeamById } from './foreignTeams.js';
import { uniPointsFor } from './uniSchedule.js';
import { PLAYOFF_ROUND, playoffSeedsFrom } from './proSchedule.js';

// 玩家在積分表裡的佔位 id（沿高中 RR_PLAYER_ID／大學 UNI_PLAYER_ID／企業 CORP_PLAYER_ID／
// 職業 PRO_PLAYER_ID 的語彙，同義不同表）
export const FOREIGN_PLAYER_ID = '__player__';
export const FOREIGN_MATCH_FORMAT = 3; // bo3（勝點制需要局數，同其餘三章拍板）

/** 勝點（同其餘三章：單一事實來源，re-export 給海外側呼叫端）。 */
export const foreignPointsFor = uniPointsFor;

// ── 決定論雜湊（與 `proSchedule.js:38` 同式——有意複製，見檔頭）──
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
 * 四隊單循環 3 輪 → concat 自身成雙循環 6 輪（見檔頭「雙循環」段）。
 * @returns `rounds[]`，每項是 `[[idA, idB], ...]`（四隊偶數 ⇒ 每輪恰 2 場、無輪空）
 */
export function foreignRounds(seed = 1) {
  const ring = FOREIGN_TEAMS.map((t) => t.id)
    .sort((a, b) => hash32(seed, 'ring', a) - hash32(seed, 'ring', b));
  const n = ring.length; // 4
  const fixed = ring[0];
  let rot = ring.slice(1); // 3 個輪轉位
  const single = [];
  for (let r = 0; r < n - 1; r += 1) { // 3 輪
    const pairs = [[fixed, rot[rot.length - 1]]];
    for (let i = 0; i < (n - 2) / 2; i += 1) pairs.push([rot[i], rot[rot.length - 2 - i]]);
    single.push(pairs);
    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)];
  }
  return [...single, ...single]; // 雙循環：下半循環 roundNo 3..5，同一批 pairs 物件
}

/**
 * 玩家視角的一整季賽程：其餘三隊各打兩次（共 6 場）。
 * ★ 玩家自己那一隊不得出現在對手裡 ★（同其餘三章的經典 bug 防線）
 * ★ 不做壓軸重排 ★（見檔頭，刻意差異）——依 `foreignRounds` 的自然順序輸出。
 * `round: 'foreign'` 是海外賽程的**章節標記**（同 `'pro'`/`'league'`/`'corp'`）。
 * `me` 解不到（含國內 id、或查無此隊）⇒ 回 []（不猜）。
 */
export function buildForeignSchedule({ teamId, seed = 1 }) {
  const me = foreignTeamById(teamId);
  if (!me) return [];
  const rounds = foreignRounds(seed);
  const mine = [];
  rounds.forEach((pairs, i) => {
    const pair = pairs.find(([a, b]) => a === me.id || b === me.id);
    if (pair) mine.push({ roundNo: i, opponentId: pair[0] === me.id ? pair[1] : pair[0] });
  });
  return mine.map((x, i) => ({
    id: `foreign-r${i + 1}`,
    stage: 'foreign',
    round: 'foreign',
    roundNo: x.roundNo,
    opponentId: x.opponentId,
    label: `第 ${i + 1} 輪`,
    format: FOREIGN_MATCH_FORMAT,
  }));
}

// ── 對手互戰（玩家不在場的場次；與 `proSchedule.js:103-122` 同式——有意複製，見檔頭）──
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
  row.points += foreignPointsFor(sf, sa);
  row.setsFor += sf;
  row.setsAgainst += sa;
  row.ptsFor += pf;
  row.ptsAgainst += pa;
};

/**
 * 積分表。**純函式**（同一份 schedule/results 永遠得到同一張表 ⇒ 不必存進存檔）。
 * 名次＝積分 → 勝場 → 局差 → 分差（與其餘三章同一套層級）。
 * `me` 解不到（含國內 id）⇒ 回空結果物件（不猜）。
 */
export function foreignTable({ teamId, seed = 1, schedule = [], results = [] }) {
  const me = foreignTeamById(teamId);
  if (!me) return { table: [], playerRank: null, played: 0, complete: false };
  const rows = new Map();
  rows.set(FOREIGN_PLAYER_ID, emptyRow(FOREIGN_PLAYER_ID, me.name));
  for (const t of FOREIGN_TEAMS) {
    if (t.id !== me.id) rows.set(t.id, emptyRow(t.id, t.name));
  }
  const league = schedule.filter((m) => m?.round === 'foreign');
  const resultOf = (id) => results.find((r) => r.matchId === id) ?? null;

  // ① 玩家打過的場次：真實結果（bo3 ⇒ scoreFor/scoreAgainst ＝ 局數；clamp 防線同
  //    proTable——髒資料不得成為改變名次的通道）
  const playedRounds = new Set();
  for (const m of league) {
    const r = resultOf(m.id);
    if (!r) continue;
    playedRounds.add(m.roundNo);
    const cap = [3, 5].includes(m.format) ? m.format : FOREIGN_MATCH_FORMAT;
    const sf = Math.min(cap, Math.max(0, r.scoreFor | 0));
    const sa = Math.min(cap, Math.max(0, r.scoreAgainst | 0));
    const [pf, pa] = pointsForSets(sf, sa, seed, `player-${m.id}`);
    addMatch(rows.get(FOREIGN_PLAYER_ID), sf, sa, pf, pa);
    const opp = rows.get(m.opponentId);
    if (opp) addMatch(opp, sa, sf, pa, pf);
  }

  // ② 同一輪裡對手之間的互戰——只結算玩家已打完的輪次（不劇透未來）
  const rounds = foreignRounds(seed);
  for (const roundNo of playedRounds) {
    const pairs = rounds[roundNo] ?? [];
    for (const [a, b] of pairs) {
      if (a === me.id || b === me.id) continue; // 玩家那一場已在 ① 用真實結果記過
      const A = foreignTeamById(a);
      const B = foreignTeamById(b);
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
  const playerRank = table.findIndex((r) => r.id === FOREIGN_PLAYER_ID) + 1;
  const played = rows.get(FOREIGN_PLAYER_ID).played;
  return { table, playerRank, played, complete: played >= league.length && league.length > 0 };
}

// ════════════════════════════════════════════════════════════════
// 季後賽（雙循環前四 ＝ 全部 4 隊全晉級 → 四強單淘汰 bo3）
// ════════════════════════════════════════════════════════════════
// ★ 四隊聯賽只有四隊 ⇒ playoffSeedsFrom 前 4 名相當於整張表 ★（不是巧合，是規模
// 太小的自然結果——種子恆含玩家，因為玩家一定在自己聯賽的 4 列名次表裡）。
export const FOREIGN_PLAYOFF_MATCH_IDS = {
  SEMI_1: 'foreign-semi-1', SEMI_2: 'foreign-semi-2', FINAL: 'foreign-final',
};
const FOREIGN_PLAYOFF_LABEL = { [PLAYOFF_ROUND.SEMI]: '準決賽', [PLAYOFF_ROUND.FINAL]: '冠軍戰' };

// 種子序 → 準決賽對戰組：1v4、2v3（同 proSchedule.js buildPlayoffBracket 的規則，
// 但 match id 換成 foreign- 前綴——不直接 import 職業版是因為它的 id 定死 pro-*）。
function buildForeignBracket(seeds) {
  if (!Array.isArray(seeds) || seeds.length !== 4) return null;
  const [s1, s2, s3, s4] = seeds;
  return {
    round: PLAYOFF_ROUND.SEMI,
    matches: [
      {
        id: FOREIGN_PLAYOFF_MATCH_IDS.SEMI_1, seedHome: 1, seedAway: 4, home: s1, away: s4,
        format: FOREIGN_MATCH_FORMAT,
      },
      {
        id: FOREIGN_PLAYOFF_MATCH_IDS.SEMI_2, seedHome: 2, seedAway: 3, home: s2, away: s3,
        format: FOREIGN_MATCH_FORMAT,
      },
    ],
  };
}

// 準決賽結果 → 決賽對戰組（同 proSchedule.js advancePlayoffToFinal 的規則，同理不
// 直接 import——它認的 SEMI_1/SEMI_2 是 pro-* 常數）。
function advanceForeignToFinal(bracket, results = []) {
  if (!bracket || bracket.round !== PLAYOFF_ROUND.SEMI) return null;
  const winnerOf = (matchId) => results.find((r) => r.matchId === matchId)?.winnerId ?? null;
  const w1 = winnerOf(FOREIGN_PLAYOFF_MATCH_IDS.SEMI_1);
  const w2 = winnerOf(FOREIGN_PLAYOFF_MATCH_IDS.SEMI_2);
  if (!w1 || !w2) return null;
  return {
    round: PLAYOFF_ROUND.FINAL,
    matches: [{ id: FOREIGN_PLAYOFF_MATCH_IDS.FINAL, home: w1, away: w2, format: FOREIGN_MATCH_FORMAT }],
  };
}

/**
 * NPC 對 NPC 的海外季後賽場次勝方（決定論；同 seed 同結果，不佔 schedule/results
 * 任何一格）。重用 league 對手互戰同一顆 `simulateSetScore`（既有慣例，不新造演算法）。
 * 同 `proSchedule.js npcPlayoffWinner` 的海外版（卷宗§一）。
 */
export function npcForeignPlayoffWinner(aId, bId, seed, tag) {
  const A = foreignTeamById(aId);
  const B = foreignTeamById(bId);
  if (!A || !B) return null;
  const [sa, sb] = simulateSetScore(A, B, seed, tag);
  return sa > sb ? aId : bId;
}

/**
 * 海外賽季迴圈接線：雙循環打滿後依名次表把季後賽場次長進 `schedule`；玩家勝出準決賽後
 * 再長決賽（準決敗＝單淘汰止步，不長決賽）。**純函式、冪等**——已經長過的場次、或還不
 * 夠格長的情況，一律回傳原 `schedule` **參考**（呼叫端用 `!==` 判斷要不要落檔）。
 * 同 `proSchedule.js growProSchedule` 的邏輯（含 NPC 側另一場準決不需要玩家打）；
 * 差異只在四隊全晉級（不必先篩前四，見上方 F1-8 註記）與 id 用 `foreign-` 前綴。
 * @param schedule  career.schedule（含雙循環場次，round==='foreign'）
 * @param results   career.results
 * @param teamId    玩家所屬海外隊 id（用來在 `foreignTable` 認出玩家那一列）
 * @param seed      生涯種子（NPC 準決定論用）
 * @returns 新賽程陣列；沒有變化則回傳原 `schedule` 參考
 */
export function growForeignSchedule(schedule, results, teamId, seed = 1) {
  const league = (schedule ?? []).filter((m) => m?.round === 'foreign');
  if (!league.length) return schedule; // 不是海外賽程（防呆：非 foreign 章節呼叫端零影響）
  const leagueDone = league.every((m) => (results ?? []).some((r) => r.matchId === m.id));
  if (!leagueDone) return schedule; // 雙循環還沒打完

  const hasResult = (id) => (results ?? []).some((r) => r.matchId === id);
  const semiEntry = schedule.find((m) => m.round === PLAYOFF_ROUND.SEMI && m.id?.startsWith('foreign-semi'));

  if (!semiEntry) {
    // ① 雙循環剛打完：依名次表決定準決賽對手（四隊全晉級）
    const { table } = foreignTable({ teamId, seed, schedule, results });
    const seeds = playoffSeedsFrom(table);
    if (!seeds || !seeds.includes(FOREIGN_PLAYER_ID)) return schedule; // 防呆：理論上必含玩家
    const bracket = buildForeignBracket(seeds);
    const mine = bracket.matches.find((m) => m.home === FOREIGN_PLAYER_ID || m.away === FOREIGN_PLAYER_ID);
    const oppId = mine.home === FOREIGN_PLAYER_ID ? mine.away : mine.home;
    return [...schedule, {
      id: mine.id, stage: 'foreign', round: PLAYOFF_ROUND.SEMI, opponentId: oppId,
      label: FOREIGN_PLAYOFF_LABEL[PLAYOFF_ROUND.SEMI], format: mine.format,
    }];
  }

  if (schedule.some((m) => m.round === PLAYOFF_ROUND.FINAL && m.id?.startsWith('foreign-final'))) return schedule; // 決賽已長過，冪等
  if (!hasResult(semiEntry.id)) return schedule; // 準決賽還沒打完
  const semiResult = results.find((r) => r.matchId === semiEntry.id);
  if (!semiResult.won) return schedule; // 準決敗＝單淘汰止步，不長決賽

  // ② 準決賽勝出：重建種子序＋bracket（foreignTable 只認 round==='foreign' 的雙循環
  //    結果，加了準決賽結果不影響名次表——同一份名次表、同一份 bracket，找得回 semiEntry）
  const { table } = foreignTable({ teamId, seed, schedule, results });
  const seeds = playoffSeedsFrom(table);
  if (!seeds) return schedule; // 防呆：理論上雙循環已打完不會發生
  const bracket = buildForeignBracket(seeds);
  const mine = bracket.matches.find((m) => m.id === semiEntry.id);
  const other = bracket.matches.find((m) => m.id !== semiEntry.id);
  if (!mine || !other) return schedule; // 防呆：重建的 bracket 對不上落地的 semiEntry
  const npcWinner = npcForeignPlayoffWinner(other.home, other.away, seed, 'npc-semi');
  const finalBracket = advanceForeignToFinal(bracket, [
    { matchId: mine.id, winnerId: FOREIGN_PLAYER_ID },
    { matchId: other.id, winnerId: npcWinner },
  ]);
  if (!finalBracket) return schedule; // 防呆
  const finalMatch = finalBracket.matches[0];
  const oppId = finalMatch.home === FOREIGN_PLAYER_ID ? finalMatch.away : finalMatch.home;
  return [...schedule, {
    id: finalMatch.id, stage: 'foreign', round: PLAYOFF_ROUND.FINAL, opponentId: oppId,
    label: FOREIGN_PLAYOFF_LABEL[PLAYOFF_ROUND.FINAL], format: finalMatch.format,
  }];
}
