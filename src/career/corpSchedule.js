// 企業聯賽賽程（成人/企業章 批 1，2026-08-25）——八隊單循環 7 場、國際排球勝點制。
//
// ★ 為什麼另寫一支，而不是改 `uniSchedule.js` ★ 凍結驗收 A1-6：高中 `schedule.js`
// 與大學 `uniSchedule.js` 零改動——同大學卷對高中的隔離理由（範本不動，各章的
// 平衡治具互不推移）。代價是本檔與 `uniSchedule.js` 的三個私有 helper
//（hash32／simulateSetScore／pointsForSets）是**有意的複製**：
// ★ 收斂掛帳 ★ 待兩章都穩定後抽共同模組（記入卷宗 §五）；在那之前，改其中一份
// 演算法時 grep 另一份（`corp-schedule` 測試對勝點與局差有逐值斷言，漂移會紅）。
//
// 勝點規則本身**不複製**：`uniPointsFor` 是大學檔的公開 export，直接 import——
// 「2-0＝3／2-1＝2／1-2＝1／0-2＝0」只有一份事實來源。
//
// ★ 八隊是偶數 ⇒ 不需要 BYE ★ circle method 固定第一位、其餘 7 位輪轉＝7 輪、
// 每隊每輪都有比賽（大學那份是九隊奇數才補虛擬 BYE）。
//
// 驗收＝`docs/kickoffs/acceptance-corp-batch1.md`（A1-6）。
import { CORPORATIONS, corporationById } from './corporations.js';
import { uniPointsFor } from './uniSchedule.js';

// 玩家在積分表裡的佔位 id（沿高中 RR_PLAYER_ID／大學 UNI_PLAYER_ID 的語彙，同義不同表）
export const CORP_PLAYER_ID = '__player__';
export const CORP_MATCH_FORMAT = 3; // bo3（勝點制需要局數，同大學拍板）
export const CORP_ROUNDS = CORPORATIONS.length - 1; // 八隊單循環＝每隊 7 場

/** 勝點（同大學：單一事實來源，re-export 給企業側呼叫端）。 */
export const corpPointsFor = uniPointsFor;

// ── 決定論雜湊（與 `uniSchedule.js:29` 同式——有意複製，見檔頭）──
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
export function corpRounds(seed = 1) {
  const ring = CORPORATIONS.map((c) => c.id)
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
 * 玩家視角的一整年賽程：其餘七家各打一次。
 * ★ 玩家自己那一家不得出現在對手裡 ★（同大學版的經典 bug 防線）
 * 壓軸＝同 tier 中 level 最高的對手（沒有同 tier 的就用全場最強）——同大學版：
 * 讓賽季有個收尾的重量。`round: 'corp'` 是企業章賽程的**章節標記**
 *（`careerState.advanceSeason` 高中版靠它擋線，同 `'league'` 之於大學）。
 */
export function buildCorpSchedule({ corpId, seed = 1 }) {
  const me = corporationById(corpId);
  if (!me) return [];
  const rounds = corpRounds(seed);
  const mine = [];
  rounds.forEach((pairs, i) => {
    const pair = pairs.find(([a, b]) => a === me.id || b === me.id);
    if (pair) mine.push({ roundNo: i, opponentId: pair[0] === me.id ? pair[1] : pair[0] });
  });
  const oppOf = (x) => corporationById(x.opponentId);
  const sameTier = mine.filter((x) => oppOf(x).tier === me.tier);
  const finale = (sameTier.length ? sameTier : mine)
    .reduce((best, x) => (oppOf(x).level > oppOf(best).level ? x : best));
  const order = [...mine.filter((x) => x !== finale), finale];
  return order.map((x, i) => ({
    id: `corp-r${i + 1}`,
    stage: 'corp',
    round: 'corp',
    roundNo: x.roundNo,
    opponentId: x.opponentId,
    label: `第 ${i + 1} 輪`,
    format: CORP_MATCH_FORMAT,
  }));
}

// ── 對手互戰（玩家不在場的場次；與 `uniSchedule.js:118-137` 同式——有意複製，見檔頭）──
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
  row.points += corpPointsFor(sf, sa);
  row.setsFor += sf;
  row.setsAgainst += sa;
  row.ptsFor += pf;
  row.ptsAgainst += pa;
};

/**
 * 積分表。**純函式**（同一份 schedule/results 永遠得到同一張表 ⇒ 不必存進存檔）。
 * 名次＝積分 → 勝場 → 局差 → 分差（與大學同一套層級）。
 * ★ 只結算玩家打過的輪次 ★ 八隊偶數、玩家每輪都有比賽 ⇒ 沒有大學版「玩家輪空
 * 那一輪要補結算」的特例——那段特例照抄過來反而是死碼。
 */
export function corpTable({ corpId, seed = 1, schedule = [], results = [] }) {
  const me = corporationById(corpId);
  if (!me) return { table: [], playerRank: null, played: 0, complete: false };
  const rows = new Map();
  rows.set(CORP_PLAYER_ID, emptyRow(CORP_PLAYER_ID, me.name));
  for (const c of CORPORATIONS) {
    if (c.id !== me.id) rows.set(c.id, emptyRow(c.id, c.name));
  }
  const league = schedule.filter((m) => m?.round === 'corp');
  const resultOf = (id) => results.find((r) => r.matchId === id) ?? null;

  // ① 玩家打過的場次：真實結果（bo3 ⇒ scoreFor/scoreAgainst ＝ 局數；
  //    clamp 防線同 uniTable——髒資料不得成為改變名次的通道）
  const playedRounds = new Set();
  for (const m of league) {
    const r = resultOf(m.id);
    if (!r) continue;
    playedRounds.add(m.roundNo);
    const cap = [3, 5].includes(m.format) ? m.format : CORP_MATCH_FORMAT;
    const sf = Math.min(cap, Math.max(0, r.scoreFor | 0));
    const sa = Math.min(cap, Math.max(0, r.scoreAgainst | 0));
    const [pf, pa] = pointsForSets(sf, sa, seed, `player-${m.id}`);
    addMatch(rows.get(CORP_PLAYER_ID), sf, sa, pf, pa);
    const opp = rows.get(m.opponentId);
    if (opp) addMatch(opp, sa, sf, pa, pf);
  }

  // ② 同一輪裡對手之間的互戰——只結算玩家已打完的輪次（不劇透未來）
  const rounds = corpRounds(seed);
  for (const roundNo of playedRounds) {
    const pairs = rounds[roundNo] ?? [];
    for (const [a, b] of pairs) {
      if (a === me.id || b === me.id) continue; // 玩家那一場已在 ① 用真實結果記過
      const A = corporationById(a);
      const B = corporationById(b);
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
  const playerRank = table.findIndex((r) => r.id === CORP_PLAYER_ID) + 1;
  const played = rows.get(CORP_PLAYER_ID).played;
  return { table, playerRank, played, complete: played >= league.length && league.length > 0 };
}
