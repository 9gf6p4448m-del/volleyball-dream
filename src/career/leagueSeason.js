// 池底卷 批1 P3：聯盟全員數據埋點（純函式、決定論；榜 UI 明列下卷不做，這裡只負責
// 累積寫入）。勘查確認：AI 隊伍沒有真正的 box score——sim 的 buildTeamBox 只在玩家
// 自己那一場記帳（matchCareer.js 只傳 myTeam），連玩家實際交手過的對手隊伍也一樣
// 沒有留下逐人數據；小組互戰（roundRobinTable 對手互打的 3 場）玩家根本不在場、
// 連分數都沒有。因此 AI 隊伍逐人數據只能用「隊伍評分/位置推導＋種子偽亂數」決定論
// 生成賽季風味數據——欄位 estimated:true 明確標註，不是真實模擬結果；玩家自隊改用
// archiveSeasonSummary 已經算好的真實 totals（estimated:false），不重新估算（P3 驗收④）。
//
// 資料源固定用 opponents.js 的 OPPONENTS（全聯盟基準池）——不因升學/轉職章節換池。
// 驗收條件只要求「決定論可重現」「玩家自隊真實」「舊檔回落不炸」「兩季獨立」，不要求
// 跟該屆實際賽程對手一致，見凍結檔 P3 段（「遊戲風味數據非真實模擬」）。
import { OPPONENTS } from './opponents.js';

// 【試玩必調】風味數據常數：模擬球季場數／各位置基準產量（每場均值）／整體強度縮放。
// base 依位置設基準：S 主攻分配、OH/OPP 主要得分點、MB 攔網為主攻分居次、L 專司防守。
export const LEAGUE_SEASON = {
  games: 14,
  base: {
    setter: { kills: 1, digs: 3, aces: 0.6, blocks: 0.3 },
    outside: { kills: 9, digs: 4, aces: 0.7, blocks: 0.8 },
    middle: { kills: 6, digs: 1, aces: 0.3, blocks: 2.4 },
    opposite: { kills: 8.5, digs: 2, aces: 0.6, blocks: 1.1 },
    libero: { kills: 0, digs: 9, aces: 0, blocks: 0 },
  },
};

// squad 槽序固定 S/OH/MB/OPP/OH/MB（opponents.js 檔頭註解的既有慣例，這裡沿用不重猜）
const SQUAD_ROLES = ['setter', 'outside', 'middle', 'opposite', 'outside', 'middle'];

// FNV-1a（與 schedule.js/careerState.js 同慣例；各檔各自持有一份是既有規範，不共用）
function hash32(seed, str) {
  let h = ((seed >>> 0) ^ 0x811c9dc5) >>> 0;
  for (const ch of String(str)) {
    h = (h ^ ch.codePointAt(0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// 0..1 決定論偽亂數（同一 seed+key 恆同值——同 seed 逐值可重現的來源）
function rand01(seed, key) {
  return (hash32(seed, key) % 100000) / 100000;
}

function estimatePlayer(seed, teamId, name, role) {
  const b = LEAGUE_SEASON.base[role] ?? LEAGUE_SEASON.base.outside;
  const games = LEAGUE_SEASON.games;
  const jitter = (key) => 0.8 + rand01(seed, `${teamId}:${name}:${key}`) * 0.4; // 0.8..1.2
  const stat = (key) => Math.round(b[key] * games * jitter(key));
  return {
    name,
    role,
    kills: stat('kills'),
    digs: stat('digs'),
    aces: stat('aces'),
    blocks: stat('blocks'),
    estimated: true,
  };
}

function estimateRecord(seed, teamId, level, avgLevel) {
  const games = LEAGUE_SEASON.games;
  // level 相對聯盟均值決定基準勝率（線性近似、夾在 [0.15, 0.85] 避免極端 level 打出
  // 全勝/全敗——聯盟風味資料要有起伏，不是難度模擬，不必精準）
  const edge = (level - avgLevel) / 20; // 20＝經驗縮放常數（opponents.js level 分佈跨度）
  const winP = Math.max(0.15, Math.min(0.85, 0.5 + edge * 0.5));
  let wins = 0;
  for (let g = 0; g < games; g += 1) {
    if (rand01(seed, `${teamId}:g${g}`) < winP) wins += 1;
  }
  return { wins, losses: games - wins };
}

// season＝archiveSeasonSummary 的 season 參數（seed 混決定論；缺 seed 時退回 index，
// 兩者皆無退回 1——與該函式既有防呆一致）；playerTotals＝archiveSeasonSummary 已算好
// 的真實 totals（玩家自隊沿用真值，不重新估算，見檔頭）
export function buildLeagueSeason(season, playerTotals) {
  const seed = ((season?.seed ?? season?.index ?? 1) >>> 0) || 1;
  const avgLevel = OPPONENTS.reduce((sum, o) => sum + o.level, 0) / OPPONENTS.length;
  const teams = OPPONENTS.map((o) => {
    const players = [
      ...o.squad.map((name, i) => estimatePlayer(seed, o.id, name, SQUAD_ROLES[i])),
      estimatePlayer(seed, o.id, o.libero, 'libero'),
    ];
    const { wins, losses } = estimateRecord(seed, o.id, o.level, avgLevel);
    return { id: o.id, name: o.name, wins, losses, players };
  });
  const results = season?.results ?? [];
  const playerWins = results.filter((r) => r.won).length;
  teams.unshift({
    id: '__player__',
    name: '我隊',
    wins: playerWins,
    losses: results.length - playerWins,
    // 玩家自隊只有主角本人的真實逐季總和可用（sim 從不記帳隊友個人數據——同一份
    // archiveSeasonSummary.totals，P3 驗收④指定不得重新估算）
    players: [{ name: '（主角）', role: 'player', ...playerTotals, estimated: false }],
  });
  return { seed, teams };
}

// 讀取端回退（P3 規格「走 schema 逐鍵回退慣例」）：舊封存沒有 leagueSeason 欄位——
// 回空殼，呼叫端不必逐處判斷 undefined
export function leagueSeasonOf(entry) {
  return entry?.leagueSeason ?? { seed: null, teams: [] };
}
