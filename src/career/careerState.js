// Phase 2 資料層 — 生涯狀態（純函式；零 three.js/DOM/存檔 IO）
// 存讀在 careerStore.js；本檔只管 career 物件的建立/推進/序列化。
// 生涯結構（phase2-decisions-RESOLVED.md 第 1 題）：
// 地區賽小組循環（保底 3 場，輸球不中斷）→ 全國賽單淘汰（輸球＝止步、全勝＝冠軍）
import { createPlayer, ATTRIBUTE_KEYS } from '../sim/player.js';
import { createDefaultTeams } from '../sim/game.js';
import { OPPONENTS, opponentById } from './opponents.js';

// v1（僅小組 3 場）→ v2（全國賽入賽程）→ v3（成長點數 growthPoints）；deserialize 自動遷移
export const CAREER_VERSION = 3;

// 完整賽程模板：小組單循環 3 場（輸球照樣打下一場）＋全國賽三輪（單淘汰）。
// 準決賽刻意再遇小組對手曜石體中——宿敵種子（stage 5 scouting 記憶）掛這裡
const SCHEDULE_TEMPLATE = [
  { id: 'group-1', stage: 'group', opponentId: 'north-tech', label: '' },
  { id: 'group-2', stage: 'group', opponentId: 'white-wave', label: '' },
  { id: 'group-3', stage: 'group', opponentId: 'obsidian', label: '' },
  { id: 'national-qf', stage: 'national', opponentId: 'iron-mist', label: '八強' },
  { id: 'national-sf', stage: 'national', opponentId: 'obsidian', label: '準決賽' },
  { id: 'national-final', stage: 'national', opponentId: 'sky-hawk', label: '決賽' },
];

export function opponentName(opponentId) {
  return opponentById(opponentId)?.name ?? opponentId;
}

// seed＝生涯種子：每場比賽種子由 matchSeed 決定論導出（同生涯同場次可重現）
export function createCareer({ seed, playerName = '小夢' } = {}) {
  if (!Number.isFinite(seed)) throw new Error('createCareer 需要數值 seed');
  return {
    version: CAREER_VERSION,
    seed: seed >>> 0,
    playerName,
    schedule: SCHEDULE_TEMPLATE.map((m) => ({ ...m })),
    results: [], // { matchId, opponentId, won, scoreFor, scoreAgainst, gp?, stats? }
    growthPoints: 0, // 未分配的成長點數（stage 3；花點結果落在 Player 上）
  };
}

// 生涯階段（由結果衍生，不存欄位——避免狀態不同步）：
// group＝小組賽進行中；national＝小組完賽、全國賽進行中；
// eliminated＝全國賽落敗止步；champion＝決賽勝
export function careerStage(career) {
  const stageOf = (matchId) => career.schedule.find((m) => m.id === matchId)?.stage;
  if (career.results.some((r) => !r.won && stageOf(r.matchId) === 'national')) return 'eliminated';
  if (career.results.some((r) => r.matchId === 'national-final' && r.won)) return 'champion';
  const groupDone = career.schedule
    .filter((m) => m.stage === 'group')
    .every((m) => career.results.some((r) => r.matchId === m.id));
  return groupDone ? 'national' : 'group';
}

// 下一場：小組賽依序保底 3 場；全國賽逐輪推進、落敗或奪冠＝null（生涯弧線收束）
export function nextMatch(career) {
  const stage = careerStage(career);
  if (stage === 'eliminated' || stage === 'champion') return null;
  return (
    career.schedule.find((m) => !career.results.some((r) => r.matchId === m.id)) ?? null
  );
}

export function careerRecord(career) {
  let wins = 0;
  for (const r of career.results) if (r.won) wins += 1;
  return { wins, losses: career.results.length - wins, played: career.results.length };
}

// 每場比賽的 sim 種子：FNV-1a 混生涯種子與場次 id——場場不同、同生涯可重現
export function matchSeed(career, matchId) {
  let h = (career.seed ^ 0x811c9dc5) >>> 0;
  for (const ch of String(matchId)) {
    h = (h ^ ch.codePointAt(0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 1000000007) || 1;
}

// 記錄一場結果（不可變更新）；同場重複記錄＝原樣返回（局終畫面重入保護）
// gp＝本場獲得的成長點數（累加進 growthPoints）；stats＝表現摘要（成長畫面顯示用）
export function recordResult(career, { matchId, won, scoreFor, scoreAgainst, gp = 0, stats = null }) {
  const entry = career.schedule.find((m) => m.id === matchId);
  if (!entry) throw new Error(`recordResult：賽程裡沒有比賽 ${matchId}`);
  if (career.results.some((r) => r.matchId === matchId)) return career;
  return {
    ...career,
    growthPoints: (career.growthPoints ?? 0) + (gp | 0),
    results: [
      ...career.results,
      {
        matchId,
        opponentId: entry.opponentId,
        won: !!won,
        scoreFor: scoreFor | 0,
        scoreAgainst: scoreAgainst | 0,
        gp: gp | 0,
        ...(stats ? { stats } : {}),
      },
    ],
  };
}

// 生涯主角：固定佔 A 隊主攻手槽（main.js PLAYER_ID＝'A2'，index 1＝2 號位）。
// 初值與預設隊友同基準——成長差異由 stage 3 的雙層成長系統拉開
export function createCareerPlayer(name) {
  return createPlayer({
    id: 'A2',
    name,
    teamId: 'A',
    naturalRole: 'outside',
    currentRole: 'outside',
    height: 1.88,
    trust: 60,
    attributes: {
      jump: 60, power: 62, reaction: 60, stamina: 60,
      speed: 62, control: 68, serve: 60, block: 58,
    },
    // 生涯新人技術層全鎖起步（成長體感＝「我能做新的事」）；快速比賽維持全開
    techniques: { tip: 0, powerServe: 0, pipe: 0, feint: 0, feintUses: 0 },
  });
}

// ---- 對手建隊（參數檔→6 個 Player）----

// 槽序與基準 trust 同 game.js DEFAULT_LINEUP（index 1＝隊上主攻核心）
const ROLE_ORDER = ['setter', 'outside', 'middle', 'opposite', 'outside', 'middle'];
const BASE_TRUST = [20, 60, 20, 20, 20, 20];
const FALLBACK_HEIGHTS = [1.83, 1.88, 1.96, 1.9, 1.86, 1.94];

export function buildOpponentTeam(def) {
  return ROLE_ORDER.map((role, i) => {
    const attrs = {};
    for (const k of ATTRIBUTE_KEYS) {
      attrs[k] = def.level + (def.attrBias?.[k] ?? 0) + (def.roleBias?.[role]?.[k] ?? 0);
    }
    return createPlayer({
      id: `B${i + 1}`,
      name: `${def.name}${i + 1}號`,
      teamId: 'B',
      naturalRole: role,
      currentRole: role,
      height: def.heights?.[i] ?? FALLBACK_HEIGHTS[i],
      trust: BASE_TRUST[i] + (def.trustBias?.[role] ?? 0),
      attributes: attrs,
    });
  });
}

// 生涯比賽建隊：我隊＝預設隊伍＋玩家 Player 塞回主攻手槽；
// 對手隊＝參數檔建隊（未給 def＝預設 B 隊，維持 stage 1 相容）
export function careerTeams(player, opponentDef = null) {
  if (player?.id !== 'A2' || player?.teamId !== 'A') {
    throw new Error('careerTeams：生涯主角必須是 A 隊 A2（主攻手槽）');
  }
  const teams = createDefaultTeams();
  teams.A[1] = player;
  if (opponentDef) teams.B = buildOpponentTeam(opponentDef);
  return teams;
}

// 生涯單場開賽包：種子＋兩隊 roster＋對手 AI 風格——main.js 一次拿齊餵 createGame
export function careerMatchSetup(career, player, matchEntry) {
  const def = opponentById(matchEntry.opponentId);
  if (!def) throw new Error(`careerMatchSetup：未知對手 ${matchEntry.opponentId}`);
  return {
    seed: matchSeed(career, matchEntry.id),
    teams: careerTeams(player, def),
    aiProfiles: { B: { ...def.ai } },
    opponent: def,
  };
}

// ---- 序列化（careerStore 用；與 Player 分開存 key，sim 改版不連坐生涯進度）----

export function serializeCareer(career) {
  return JSON.stringify(career);
}

export function deserializeCareer(json) {
  let raw = JSON.parse(json);
  // v1（stage 1：僅小組 3 場、帶固定 stage 欄位）→ v2 形狀：換完整賽程模板，戰績保留
  if (raw.version === 1) {
    raw = {
      version: 2,
      seed: raw.seed,
      playerName: raw.playerName,
      schedule: SCHEDULE_TEMPLATE.map((m) => ({ ...m })),
      results: raw.results,
    };
  }
  // v2 → v3：補 growthPoints；既往場次追認每場 4 點（stage 3 前打的比賽不白打）
  if (raw.version === 2) {
    raw = {
      ...raw,
      version: CAREER_VERSION,
      growthPoints: (raw.results?.length ?? 0) * 4,
    };
  }
  if (raw.version !== CAREER_VERSION) {
    throw new Error(`生涯存檔版本不符：${raw.version}（需 ${CAREER_VERSION}）`);
  }
  for (const field of ['seed', 'playerName', 'schedule', 'results', 'growthPoints']) {
    if (raw[field] === undefined) throw new Error(`生涯存檔缺欄位：${field}`);
  }
  if (!Array.isArray(raw.schedule) || !Array.isArray(raw.results)) {
    throw new Error('生涯存檔 schedule/results 必須是陣列');
  }
  for (const m of raw.schedule) {
    if (!m.id || !m.opponentId) throw new Error('生涯存檔賽程項缺 id/opponentId');
  }
  return raw;
}

export { OPPONENTS, opponentById };
