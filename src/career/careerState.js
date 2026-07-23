// Phase 2 資料層 — 生涯狀態（純函式；零 three.js/DOM/存檔 IO）
// 存讀在 careerStore.js；本檔只管 career 物件的建立/推進/序列化。
// 生涯結構（phase2-decisions-RESOLVED.md 第 1 題）：
// 地區賽小組循環（保底 3 場，輸球不中斷）→ 全國賽單淘汰（輸球＝止步、全勝＝冠軍）
import { createPlayer, ATTRIBUTE_KEYS } from '../sim/player.js';
import { createDefaultTeams } from '../sim/game.js';
import { OPPONENTS, opponentById } from './opponents.js';
import { defaultLineup, effectiveOrder, trustOf, DEFAULT_LIBERO_ID } from './lineup.js';

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

// 開賽標記（拍板 07-22 堵中途退出）：pending 落檔＝這場開打了；
// 完賽由 recordResult 清除；沒完賽就回生涯畫面＝resolveForfeit 記棄賽敗
export function markPending(career, matchId) {
  return { ...career, pendingMatch: matchId };
}

// 棄賽裁決：pending 未完賽＝記 0:25 敗（無成長點）；已完賽＝只清標記
export function resolveForfeit(career) {
  const pid = career.pendingMatch;
  if (!pid) return career;
  if (career.results.some((r) => r.matchId === pid)) {
    const { pendingMatch, ...rest } = career; // 真移除鍵（undefined 鍵會壞 roundtrip 比對）
    return rest;
  }
  return recordResult(career, { matchId: pid, won: false, scoreFor: 0, scoreAgainst: 25 });
}

// 記錄一場結果（不可變更新）；同場重複記錄＝原樣返回（局終畫面重入保護）
// gp＝本場獲得的成長點數（累加進 growthPoints）；stats＝表現摘要（成長畫面顯示用）
export function recordResult(career, { matchId, won, scoreFor, scoreAgainst, gp = 0, stats = null }) {
  const entry = career.schedule.find((m) => m.id === matchId);
  if (!entry) throw new Error(`recordResult：賽程裡沒有比賽 ${matchId}`);
  if (career.results.some((r) => r.matchId === matchId)) return career;
  const { pendingMatch, ...base } = career; // 完賽即清開賽標記（真移除鍵）
  return {
    ...base,
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
    trust: 40, // 拍板 07-22：60→40——「打好球→球權變多」的成長弧要看得見（地板 0.27 保底）
    attributes: {
      jump: 60, power: 62, reaction: 60, stamina: 60,
      speed: 62, control: 68, serve: 60, block: 58,
    },
    trustFloor: 0.27, // 保底 25–30% 球權（決策第 3 題：玩家不得淪為觀眾）
    // 生涯新人技術層全鎖起步，經故事線傳授習得（每場賽後對手/隊長教一招）
    // v:2＝技術欄位語意版本（normalizeCareerPlayer 的一次性遷移標記）
    techniques: {
      tip: 0, pipe: 0, feint: 0, feintUses: 0,
      jumpServe: 0, floatServe: 0, dive: 0, v: 2,
    },
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

// 跨版本存檔補正（就地修正；開賽與生涯畫面渲染都會跑，下次存檔即固定）：
// ①主角保底球權地板 ②powerServe→jumpServe 正名（發球體系改版）
// ③stage 3 前存檔的 jumpServe:1 是舊熟練度語意→歸零 ④新技術缺欄＝未解鎖
export function normalizeCareerPlayer(player) {
  if (player.trust.floorShare === undefined) player.trust.floorShare = 0.27;
  const t = player.techniques ?? (player.techniques = {});
  // 一次性遷移（t.v 標記）：改版前的 jumpServe 一律是舊熟練度語意——
  // 只有買過強力發球（powerServe:1）者換得跳發；標記後永不再動（傳授所得不受影響）
  if (!t.v) {
    t.jumpServe = t.powerServe ?? 0;
    delete t.powerServe;
    t.v = 2;
  }
  for (const k of ['tip', 'pipe', 'feint', 'floatServe', 'dive']) t[k] = t[k] ?? 0;
  t.feintUses = t.feintUses ?? 0;
  return player;
}

// 生涯比賽建隊：我隊＝依先發輪轉序（lineup）展開名冊為 A 隊；對手隊＝參數檔建隊
// （未給 def＝預設 B 隊，維持 stage 1 相容）。
// W3 單一建隊路徑：給 rosterMembers 時一律依 lineup.starters 順序建 teams.A、
// trust 跟人（trustOf 以 member id 查映射，換位不繼承他人信任），玩家（A2）擺在其
// 於 starters 的位置、trust 恆取 save.player。未給 lineup＝取 defaultLineup（預設序
// ＝W2 固定槽位同序，逐位等價——見 tests/lineup 等價閘）。未給名冊＝快速比賽相容
// （主角塞主攻手槽、其餘預設隊員）。
export function careerTeams(player, opponentDef = null, rosterMembers = null, lineup = null) {
  if (player?.id !== 'A2' || player?.teamId !== 'A') {
    throw new Error('careerTeams：生涯主角必須是 A 隊 A2（主攻手槽）');
  }
  normalizeCareerPlayer(player);
  const teams = createDefaultTeams();
  if (rosterMembers) {
    // starters 為 null（建檔中間態，schema 放行）亦回退預設——防未經 ensureStarterRoster
    // 的呼叫端把 null 序餵進 effectiveOrder 崩比賽
    const lu = (lineup?.starters == null) ? defaultLineup(rosterMembers) : lineup;
    const order = effectiveOrder(lu.starters, lu.rotationStart);
    teams.A = order.map((id) => {
      if (id === player.id) return player;
      const m = rosterMembers.find((x) => x.id === id);
      if (!m) throw new Error(`careerTeams：先發 ${id} 不在名冊`);
      return createPlayer({
        id: m.id,
        name: m.name,
        teamId: 'A',
        naturalRole: m.role,
        currentRole: m.role,
        height: m.height ?? 1.85,
        trust: trustOf(lu, m.id),
        attributes: { ...m.attributes },
      });
    });
    // 主控球員必在先發（排球鐵律：玩家恆在場上）——缺 A2 會建出無主控的隊，
    // sim 以 PLAYER_ID='A2' 找不到人（操控/trustFloor/鏡頭全失據）。W4 fieldIds>6 才可能觸發
    if (!teams.A.some((p) => p.id === player.id)) {
      throw new Error('careerTeams：先發未含主控球員 A2');
    }
  } else {
    teams.A[1] = player;
  }
  if (opponentDef) teams.B = buildOpponentTeam(opponentDef);
  return teams;
}

// stage 5 情蒐：把單場 scoutTally 併入生涯（per 對手——「這隊看過我什麼」；
// 宿敵＝同隊 id 跨賽段自然沿用同一份記憶）
export function mergeScouting(career, opponentId, tally) {
  if (!tally) return career;
  const prev = career.scouting?.[opponentId] ?? {
    zones: { line: 0, cross: 0, middle: 0, tip: 0 },
    feints: 0, spikes: 0,
  };
  const merged = {
    zones: {
      line: prev.zones.line + (tally.zones?.line ?? 0),
      cross: prev.zones.cross + (tally.zones?.cross ?? 0),
      middle: prev.zones.middle + (tally.zones?.middle ?? 0),
      tip: prev.zones.tip + (tally.zones?.tip ?? 0),
    },
    feints: prev.feints + (tally.feints ?? 0),
    spikes: prev.spikes + (tally.spikes ?? 0),
  };
  return { ...career, scouting: { ...(career.scouting ?? {}), [opponentId]: merged } };
}

// stage 6 自由人（第 7 人）：防守專精數值——高反應/速度/控制、低攻擊系
export function buildLibero(team, name, level = 60) {
  const d = Math.min(100, level + 14);
  return createPlayer({
    id: `${team}L`,
    name,
    teamId: team,
    naturalRole: 'libero',
    currentRole: 'libero',
    height: 1.72,
    trust: 5, // 自由人不進攻擊池；留極低值防呆
    attributes: {
      jump: 40, power: 40, reaction: d, stamina: 70,
      speed: d - 2, control: d - 2, serve: 30, block: 30,
    },
  });
}

// 生涯單場開賽包：種子＋兩隊 roster＋對手 AI 風格＋情蒐讀取——main.js 一次拿齊餵 createGame
// W2 起第 4 參數 roster（save.roster 或 null）：A 隊五槽與自由人吃名冊具名/個性化/成長後屬性。
// W3 起第 5 參數 lineup（save.lineup 或 null）：A 隊依先發輪轉序建隊、自由人由 lineup.libero 選。
export function careerMatchSetup(career, player, matchEntry, roster = null, lineup = null) {
  const def = opponentById(matchEntry.opponentId);
  if (!def) throw new Error(`careerMatchSetup：未知對手 ${matchEntry.opponentId}`);
  // 對手讀我：這隊過去看過的我的攻擊分佈 × 其讀取強度（弱隊 scoutRead 0＝不讀）
  const seen = career.scouting?.[matchEntry.opponentId];
  const scoutRead = seen && (def.scoutRead ?? 0) > 0
    ? { B: { targetId: 'A2', read: def.scoutRead, zones: seen.zones } }
    : undefined;
  const members = roster?.members ?? null;
  // 我方自由人：結構欄位（id/身高/trust/role）恆由 buildLibero 公式供給（D3 不動），
  // lineup.libero 指定的名冊成員存在時只覆寫 name＋attributes（承接自動成長後的數值）
  const liberoA = buildLibero('A', '小守');
  const al = members?.find((m) => m.id === (lineup?.libero ?? DEFAULT_LIBERO_ID));
  if (al) {
    liberoA.name = al.name;
    liberoA.attributes = { ...liberoA.attributes, ...al.attributes };
  }
  return {
    seed: matchSeed(career, matchEntry.id),
    teams: careerTeams(player, def, members, lineup),
    aiProfiles: { B: { ...def.ai } },
    ...(scoutRead ? { scoutRead } : {}),
    // stage 6 自由人：雙方都有（我方固定隊友、對方吃參數檔強度）
    liberos: {
      A: liberoA,
      B: buildLibero('B', `${def.name}·自由人`, def.level),
    },
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
    // 語意驗證：對手必須存在於參數檔——擋掉匯入壞資料在「出戰」當下才炸頁
    if (!opponentById(m.opponentId)) throw new Error(`生涯存檔含未知對手：${m.opponentId}`);
  }
  return raw;
}

export { OPPONENTS, opponentById };
