// Phase 2 資料層 — 生涯狀態（純函式；零 three.js/DOM/存檔 IO）
// 存讀在 careerStore.js；本檔只管 career 物件的建立/推進/序列化。
// 生涯結構（phase2-decisions-RESOLVED.md 第 1 題）：
// 地區賽小組循環（保底 3 場，輸球不中斷）→ 全國賽單淘汰（stage 2 接）
import { createPlayer } from '../sim/player.js';
import { createDefaultTeams } from '../sim/game.js';

export const CAREER_VERSION = 1;

// 地區賽小組對手（玩家隊＋3 隊單循環＝保底 3 場）。
// stage 2 擴充為完整參數檔（trust 初值/TIP_RATE/攻擊點權重/能力值/識別特徵）
export const GROUP_OPPONENTS = [
  { id: 'north-tech', name: '北原工商' },
  { id: 'white-wave', name: '白浪高中' },
  { id: 'obsidian', name: '曜石體中' },
];

export function opponentName(opponentId) {
  return GROUP_OPPONENTS.find((o) => o.id === opponentId)?.name ?? opponentId;
}

// seed＝生涯種子：每場比賽種子由 matchSeed 決定論導出（同生涯同場次可重現）
export function createCareer({ seed, playerName = '小夢' } = {}) {
  if (!Number.isFinite(seed)) throw new Error('createCareer 需要數值 seed');
  return {
    version: CAREER_VERSION,
    seed: seed >>> 0,
    playerName,
    stage: 'group', // 'group' → 'national'（stage 2 錦標賽流程接手推進）
    schedule: GROUP_OPPONENTS.map((opp, i) => ({
      id: `group-${i + 1}`,
      stage: 'group',
      opponentId: opp.id,
    })),
    results: [], // { matchId, opponentId, won, scoreFor, scoreAgainst }
  };
}

// 下一場未打的比賽；小組賽全打完＝null（全國賽由 stage 2 開放）
export function nextMatch(career) {
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
export function recordResult(career, { matchId, won, scoreFor, scoreAgainst }) {
  const entry = career.schedule.find((m) => m.id === matchId);
  if (!entry) throw new Error(`recordResult：賽程裡沒有比賽 ${matchId}`);
  if (career.results.some((r) => r.matchId === matchId)) return career;
  return {
    ...career,
    results: [
      ...career.results,
      {
        matchId,
        opponentId: entry.opponentId,
        won: !!won,
        scoreFor: scoreFor | 0,
        scoreAgainst: scoreAgainst | 0,
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
  });
}

// 生涯比賽建隊：預設隊伍＋玩家 Player 塞回主攻手槽（生涯數值「餵進」sim 的唯一通道）
export function careerTeams(player) {
  if (player?.id !== 'A2' || player?.teamId !== 'A') {
    throw new Error('careerTeams：生涯主角必須是 A 隊 A2（主攻手槽）');
  }
  const teams = createDefaultTeams();
  teams.A[1] = player;
  return teams;
}

// ---- 序列化（careerStore 用；與 Player 分開存 key，sim 改版不連坐生涯進度）----

export function serializeCareer(career) {
  return JSON.stringify(career);
}

export function deserializeCareer(json) {
  const raw = JSON.parse(json);
  if (raw.version !== CAREER_VERSION) {
    throw new Error(`生涯存檔版本不符：${raw.version}（需 ${CAREER_VERSION}）`);
  }
  for (const field of ['seed', 'playerName', 'stage', 'schedule', 'results']) {
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
