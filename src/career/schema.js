// Phase 3 W1 — 存檔 Schema v2（結構定型＋版本遷移機制；純函式，零 DOM/IO）
// 單一存檔物件取代 Phase 2 的雙 key（vd-career-v1 / vd-career-player-v1）。
// 頂層鍵一次補齊：Phase 3 四系統（roster/recruitment/lineup/season）欄位結構定實、
// 內容留空（W2–W5 逐週填入）；Phase 4 預留鍵（career/story）只留空物件、不猜內容。
//
// 欄位設計依據（Phase 3 kickoff 第 1–4 題拍板結論）：
// 每隊 1 名招牌球員、招募條件跨賽季累積、隊友自動成長（玩家點數只管自己）、
// 名冊上限 12（W5：10→12，容納全招募池＋逐出騰位）、線性多賽季（對手升級、宿敵記憶延續）。
import { deserializePlayer, ATTRIBUTE_KEYS } from '../sim/player.js';
import { CAREER_VERSION, deserializeCareer } from './careerState.js';
import { validateLineup } from './lineup.js';

export const SCHEMA_VERSION = 2;

// v2 完整骨架。career（現行 careerState 物件）與 player 可為 null（建檔中間態）。
export function createSaveV2({ career = null, player = null, prev = null } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    // 主角——沿用既有 serializePlayer 格式（sim/player.js 定義；不在此擴充）
    player,
    // 名冊（W2 填入）：members[] 元素形狀＝{ id, name, origin(來源隊 id|'starter'),
    //   role, attributes, growth(成長曲線參數), dna(原隊參數 DNA 標記) }
    //   capacity 12（W5，10→12）：玩家 1＋自由人 1＋隊友 10（現員 7→招募空位 5＝全招募池）
    roster: prev?.roster ?? { capacity: 12, members: [] },
    // 招募（W4 填入）：progress[opponentId]＝條件進度（跨賽季累積——拍板結論）；
    //   recruited[]＝已達成入隊的球員 id；expelled[]（W5）＝已逐出者條目
    //   { member(完整快照), seasonIndex, titlesAtExpel }（不可逆、防重招、id 不回收）
    recruitment: prev?.recruitment ?? { progress: {}, recruited: [], expelled: [] },
    // 先發編排（W3 填入，啟用 FIVB 7.7 驗證器）：starters＝6 人輪轉序（null＝未排，
    //   沿用預設陣容）；libero＝自由人 id；rotationStart＝輪轉起點（0-5）
    lineup: prev?.lineup ?? { starters: null, libero: null, rotationStart: 0 },
    // 賽季（W5 接輪迴）：index＝賽季序號（線性多賽季遞增）；其餘＝現行生涯資料歸戶。
    // careerStage 一律由 results 衍生（careerState.careerStage()）——Phase 2 拍板
    // 「不存衍生狀態防不同步」，schema 不設此欄位
    season: career ? seasonFromCareer(career, prev) : emptySeason(),
    // Phase 4 預留：內容本週不定型，保持空物件（不要猜）
    career: prev?.career ?? {},
    story: prev?.story ?? {},
  };
}

function emptySeason() {
  return {
    index: 1,
    seed: null, playerName: null,
    schedule: [], results: [],
    growthPoints: 0,
    scouting: {}, // 宿敵記憶（per 對手 id；跨賽季累積）
    events: [], // 已觸發劇情事件 id 清單（防賽後對話重複觸發——不存會無限重跳）
    titles: 0, // 奪冠次數（W5：難度綁成就——衛冕屆對手升級；止步不升級）
  };
}

// 現行 career 物件（careerState v3 形狀）→ season 欄位；index 等 v2 專屬欄位
// 從既有存檔（prev）沿用
export function seasonFromCareer(career, prev = null) {
  return {
    index: prev?.season?.index ?? 1,
    seed: career.seed,
    playerName: career.playerName,
    schedule: career.schedule,
    results: career.results,
    growthPoints: career.growthPoints ?? 0,
    scouting: career.scouting ?? {},
    events: career.events ?? [], // 已觸發劇情事件 id（W1 漏存→賽後對話無限重跳，見 lessons）
    titles: career.titles ?? 0, // W5 奪冠次數（投影欄位讀寫成對——events 漏存教訓）
    ...(career.pendingMatch !== undefined ? { pendingMatch: career.pendingMatch } : {}),
  };
}

// season → 現行 career 物件視圖（W1 過渡期：runtime 邏輯仍吃 careerState v3 形狀，
// W2–W5 逐步把邏輯搬到 v2 鍵上後此視圖退役）。鍵集合與原物件一致（roundtrip 恆等）
export function careerViewOf(save) {
  const s = save.season;
  if (!s || s.seed === null || s.seed === undefined) return null;
  return {
    version: CAREER_VERSION,
    seed: s.seed,
    playerName: s.playerName,
    schedule: s.schedule,
    results: s.results,
    growthPoints: s.growthPoints ?? 0,
    ...(Object.keys(s.scouting ?? {}).length > 0 ? { scouting: s.scouting } : {}),
    ...(Array.isArray(s.events) && s.events.length > 0 ? { events: s.events } : {}),
    ...((s.titles ?? 0) > 0 ? { titles: s.titles } : {}), // 非零才回讀（比照 scouting 慣例）
    ...(s.pendingMatch !== undefined ? { pendingMatch: s.pendingMatch } : {}),
  };
}

// ---- 版本遷移機制 ----
// 骨架本週定型、實際遷移一條都不提供：v1（Phase 2 雙 key 舊制）拍板不相容——
// 存取層偵測到舊 key 走「清空＋提示重置」，不進 migrate。
// Phase 4 之後要真遷移時：在 MIGRATIONS 註冊 fromVersion→fn，鏈式走到現版。

export class IncompatibleSaveError extends Error {
  constructor(fromVersion) {
    super(`存檔版本 ${fromVersion} 不相容（無遷移路徑）`);
    this.name = 'IncompatibleSaveError';
    this.fromVersion = fromVersion;
  }
}

// fromVersion → (save) => save'（升一版）。v1 刻意缺席＝不相容。
export const MIGRATIONS = {};

// 版本分派：從 fromVersion 逐級升到 SCHEMA_VERSION；缺遷移步驟即擲 Incompatible。
// table 可注入（測試用）；正式路徑吃模組層 MIGRATIONS
export function migrate(save, fromVersion, table = MIGRATIONS) {
  let version = fromVersion;
  let current = save;
  while (version < SCHEMA_VERSION) {
    const step = table[version];
    if (!step) throw new IncompatibleSaveError(fromVersion);
    current = step(current);
    version += 1;
  }
  return current;
}

// ---- 序列化與驗證 ----

export function serializeSave(save) {
  return JSON.stringify(save);
}

const TOP_KEYS = ['player', 'roster', 'recruitment', 'lineup', 'season', 'career', 'story'];

// 嚴格驗證（匯入用；讀檔的優雅降級由存取層 try/catch 包）：
// 結構壞、版本無路徑、season/player 內容不合法一律 throw
export function deserializeSave(json) {
  let raw = JSON.parse(json);
  if (typeof raw !== 'object' || raw === null) throw new Error('存檔不是物件');
  if ((raw.schemaVersion ?? 1) > SCHEMA_VERSION) {
    throw new Error(`存檔版本 ${raw.schemaVersion} 較新（本版支援至 ${SCHEMA_VERSION}）`);
  }
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    raw = migrate(raw, raw.schemaVersion ?? 1);
  }
  for (const k of TOP_KEYS) {
    if (raw[k] === undefined) throw new Error(`存檔缺頂層鍵：${k}`);
  }
  if (typeof raw.roster.capacity !== 'number' || !Array.isArray(raw.roster.members)) {
    throw new Error('roster 結構不合法（需 capacity:number 與 members:array）');
  }
  // W2 名冊成員驗證（匯入壞資料在建隊當下才炸畫面——這裡先擋）
  for (const m of raw.roster.members) {
    for (const f of ['id', 'name', 'origin', 'role']) {
      if (typeof m[f] !== 'string') throw new Error(`名冊成員缺字串欄位：${f}`);
    }
    for (const k of ATTRIBUTE_KEYS) {
      if (typeof m.attributes?.[k] !== 'number') {
        throw new Error(`名冊成員 ${m.id} attributes 缺數值欄位：${k}`);
      }
    }
    if (typeof m.growth !== 'object' || m.growth === null || !Array.isArray(m.growth.log)) {
      throw new Error(`名冊成員 ${m.id} growth 結構不合法（需含 log:array）`);
    }
    if (typeof m.dna !== 'object' || m.dna === null) {
      throw new Error(`名冊成員 ${m.id} 缺 dna 標記`);
    }
  }
  // W4 招募驗證（輕量形狀檢查——progress 內容由 recruitment.js 讀取時以預設值容錯，
  // 這裡只擋結構性壞資料；recruited 成員的存在性由名冊成員驗證涵蓋——origin 對映）
  if (
    typeof raw.recruitment !== 'object' || raw.recruitment === null
    || typeof raw.recruitment.progress !== 'object' || raw.recruitment.progress === null
    || !Array.isArray(raw.recruitment.recruited)
    // W5 expelled：舊檔可無此鍵（讀取端 ?? [] 容錯，冪等升級不 brick）；若存在必為陣列
    || (raw.recruitment.expelled !== undefined && !Array.isArray(raw.recruitment.expelled))
  ) {
    throw new Error('recruitment 結構不合法（需 progress:object 與 recruited:array；expelled 若存在須為 array）');
  }
  // W3 先發編排驗證（starters 非 null＝已排；null＝建檔中間態，容許不驗內容）：
  // 長度 6/無重複/id 合法/自由人不入先發/rotationStart 0-5
  if (typeof raw.lineup !== 'object' || raw.lineup === null) {
    throw new Error('lineup 結構不合法（需物件）');
  }
  if (raw.lineup.starters != null) {
    const { valid, errors } = validateLineup(raw.lineup, raw.roster.members, raw.player?.id);
    if (!valid) throw new Error(`先發陣容不合法：${errors.join('；')}`);
  }
  // season 內容沿用 careerState 的完整語意驗證（含賽程對手 id 存在性）
  const view = careerViewOf(raw);
  if (view) deserializeCareer(JSON.stringify(view));
  // player 沿用 sim/player 的欄位驗證（null＝建檔中間態，容許）
  if (raw.player !== null) deserializePlayer(JSON.stringify(raw.player));
  return raw;
}
