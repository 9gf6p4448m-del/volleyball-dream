// Phase 3 W4 — 招募判定（純函式層＋store 入隊流程；零 three.js/DOM，node 可測）
// 條件表集中在本檔（不掛 opponents.js）的理由：條件引用生涯層概念（壯舉事件掃描、
// 賽程 stage id、名冊空位），opponents.js 維持「純 sim 參數檔」的單一職責；
// 對手參數（level/attrBias/heights/style）仍由 opponents.js 供給、本檔只引用。
// 壯舉統計一律從賽末 state.events 掃描——sim 執行碼零改動、零新事件型別（硬性約束）。
import { opponentById } from './opponents.js';
import { buildLibero } from './careerState.js';
import { matchStatsFor } from './growth.js';
import { openSlots } from './roster.js';
import { ATTRIBUTE_KEYS } from '../sim/player.js';

// 新隊員 trust 初值（拍板）：10——低於既有隊友 20 是刻意設計，新人要重新贏得信任，
// 舉球分配真的會少。入隊時**顯式寫入 lineup.trust**（W3 §6b：勿依賴 trustOf 缺鍵回退
// 20——回退值會遮蔽漏寫）。
export const RECRUIT_TRUST = 10;
// W5 逐出機制（拍板）：逐出→全隊 lineup.trust −5（夾限≥0，主角另計不受影響）；
// 每屆上限 1 次；僅可逐招募生（origin≠'starter'）。常數集中此處與 RECRUIT_TRUST 同域。
export const EXPEL_TRUST_PENALTY = 5;
export const EXPEL_PER_SEASON_LIMIT = 1;
// 生成屬性夾限：上限與隊友成長天花板一致（roster.js ROSTER_GROWTH.ATTR_CAP＝85）
const ATTR_MIN = 30;
const ATTR_MAX = 85;

// ---- 條件模板（W4 任務書 §1 拍板表＋W6 擴池；三軸缺項＝不檢查）----
// W6 鍵結構：recruitKey → { opponentId, role, wins?, feat?, stage? }——
// 一隊可掛多名招募對象（A3 強隊第二人／A1 新隊雙招牌）。既有 5 隊 recruitKey 沿用
// opponentId 本身＝舊存檔 progress/recruited 鍵零遷移；新增鍵用 `{oppId}-2` 等。
// wins＝對該隊累計勝場（缺項＝不檢查——A3 第二人拍板走純壯舉軸，避開 wins 同質）；
// feat＝個人壯舉（跨場累積）；stage＝須在此場次擊敗。
// 壯舉軸的事件層定義（替代定義的歸因見 W4 結案快照偏差表）：
//   digMatch：單場「dig」（敵方扣球後的第一時間 receive/dive）達 perMatch 次＝1 場達標
//   blockKill：攔網得分（BLOCK_TOUCH 後我隊直接得分）——事件流無「快攻」標記，
//     以「攔死其攻擊」近似「攔死其快攻」（曜石＝快攻隊，其攻擊以快攻為主體）
//   strongReceive：高品質接發（敵方發球後第一觸為玩家 receive/dive 且品質 ≥ quality）
//     ——SERVE 事件無式樣欄位，以「接發品質」近似「接起強發」（頂住鐵霧發球輪＝壯舉本意）
//   W6 新增三型（單場統計 ≥ perMatch＝1 場達標，皆走 matchStatsFor 既有欄位）：
//   blockKillMatch＝單場攔網得分×N／aceMatch＝單場 ACE×N／killMatch＝單場殺球×N
export const RECRUIT_CONDS = {
  'north-tech': { opponentId: 'north-tech', role: 'setter', wins: 3 },
  'white-wave': {
    opponentId: 'white-wave', role: 'libero', wins: 2,
    feat: { type: 'digMatch', perMatch: 3, count: 3, label: '單場救起 3 記重扣' },
  },
  obsidian: {
    opponentId: 'obsidian', role: 'middle', wins: 2,
    feat: { type: 'blockKill', count: 5, label: '攔死其攻擊' },
  },
  'iron-mist': {
    opponentId: 'iron-mist', role: 'opposite', wins: 2,
    feat: { type: 'strongReceive', quality: 0.8, count: 8, label: '穩穩接起其發球' },
  },
  'sky-hawk': { opponentId: 'sky-hawk', role: 'outside', wins: 1, stage: 'national-final' },
  // W6 A3 強隊第二人（純壯舉軸；數值待 C2 治具複核）
  'obsidian-2': {
    opponentId: 'obsidian', role: 'middle',
    feat: { type: 'blockKillMatch', perMatch: 2, count: 1, label: '單場攔死其攻擊 2 次' },
  },
  'iron-mist-2': {
    opponentId: 'iron-mist', role: 'outside',
    feat: { type: 'aceMatch', perMatch: 2, count: 1, label: '單場對其 ACE 2 記' },
  },
  'sky-hawk-2': {
    opponentId: 'sky-hawk', role: 'opposite',
    feat: { type: 'killMatch', perMatch: 5, count: 1, label: '單場轟其 5 記殺球' },
  },
  // W6 A1/A5 新隊雙招牌（wins 1-2 低門檻＋壯舉軸——配指定邀請＝一屆內看得到進度）
  'gale-shore': { opponentId: 'gale-shore', role: 'setter', wins: 2 },
  'gale-shore-2': {
    opponentId: 'gale-shore', role: 'outside', wins: 1,
    feat: { type: 'killMatch', perMatch: 4, count: 1, label: '單場轟 4 記殺球' },
  },
  'black-pine': {
    opponentId: 'black-pine', role: 'middle', wins: 1,
    feat: { type: 'blockKill', count: 4, label: '攔死其攻擊' },
  },
  'black-pine-2': {
    opponentId: 'black-pine', role: 'opposite', wins: 2,
    feat: { type: 'strongReceive', quality: 0.8, count: 5, label: '穩穩接起其發球' },
  },
};

// 招牌球員預設稿（名字/人設＝佔位，命名工程 Phase 3 收尾統一做——與 STARTER_DEFS 同約定）
// TODO(naming)：以下 name/persona 為佔位，命名工程統一潤稿
const RECRUIT_DEFS = {
  'north-tech': { name: '阿澄', persona: '北原的節拍器——不起眼的一傳一舉，把整隊的亂流理成直線' },
  'white-wave': { name: '小浪', persona: '白浪最黏的那道浪——球不落地，是他唯一的信仰' },
  obsidian: { name: '阿曜', persona: '曜石的快攻箭頭——起跳永遠比你的判斷快半拍' },
  'iron-mist': { name: '阿鐵', persona: '鐵霧的重砲右翼——發球跟扣球一樣，都往死裡打' },
  'sky-hawk': { name: '阿鷹', persona: '天鷹的王牌翼手——全國決賽的舞台，是他的日常' },
  'obsidian-2': { name: '小磐', persona: '曜石的第二座山——不如阿曜快，但攔下來的球一顆都不還' },
  'iron-mist-2': { name: '阿霜', persona: '鐵霧的左翼冷刃——安靜，準，出手不帶感情' },
  'sky-hawk-2': { name: '大隼', persona: '天鷹的右翼重錘——王牌的影子，也想當一次主角' },
  'gale-shore': { name: '小嵐', persona: '青嵐的球路設計師——每一顆二次球都是預謀' },
  'gale-shore-2': { name: '阿汐', persona: '青嵐的斜線快手——潮水退了才知道他打的是哪條線' },
  'black-pine': { name: '老松', persona: '黑松高牆的基石——三年級最後一屆，牆不想再輸' },
  'black-pine-2': { name: '大柏', persona: '黑松的右翼砲台——牆後面，藏著一門重砲' },
};

// ---- 壯舉事件掃描（賽末 state.events；純函式）----

// 敵方扣球後的第一時間救球（receive/dive）＝dig；掃描器與 matchStatsFor 同一套
// 事件語彙（TOUCH kind/power、BLOCK_TOUCH、SCORE），不新增事件型別
function countDigs(events, playerId, myTeam) {
  let digs = 0;
  let enemySpikeLive = false;
  for (const e of events) {
    if (e.type === 'TOUCH') {
      if (e.team !== myTeam && e.kind === 'spike') {
        enemySpikeLive = true;
      } else {
        if (
          enemySpikeLive && e.playerId === playerId &&
          (e.kind === 'receive' || e.kind === 'dive')
        ) digs += 1;
        enemySpikeLive = false;
      }
    } else if (e.type === 'BLOCK_TOUCH' || e.type === 'SCORE') {
      enemySpikeLive = false;
    }
  }
  return digs;
}

// 敵方發球後的第一觸＝接發；power（觸球品質）≥ quality 才算「接起」
function countStrongReceives(events, playerId, myTeam, quality) {
  let n = 0;
  let awaitingReception = false;
  for (const e of events) {
    if (e.type === 'SERVE') {
      awaitingReception = e.team !== myTeam;
    } else if (e.type === 'TOUCH') {
      if (
        awaitingReception && e.playerId === playerId &&
        (e.kind === 'receive' || e.kind === 'dive') && (e.power ?? 0) >= quality
      ) n += 1;
      awaitingReception = false;
    } else if (e.type === 'BLOCK_TOUCH' || e.type === 'SCORE') {
      awaitingReception = false;
    }
  }
  return n;
}

// 本場壯舉進度增量（依對手條件的 feat 軸；無 feat 軸＝0）
export function featGainFor(events, playerId, myTeam, cond) {
  const f = cond?.feat;
  if (!f || !events) return 0;
  if (f.type === 'blockKill') return matchStatsFor(events, playerId, myTeam).blockPoints;
  if (f.type === 'strongReceive') return countStrongReceives(events, playerId, myTeam, f.quality);
  if (f.type === 'digMatch') return countDigs(events, playerId, myTeam) >= f.perMatch ? 1 : 0;
  // W6 單場統計軸（matchStatsFor 既有欄位 ≥ perMatch＝1 場達標）
  if (f.type === 'blockKillMatch') {
    return matchStatsFor(events, playerId, myTeam).blockPoints >= f.perMatch ? 1 : 0;
  }
  if (f.type === 'aceMatch') return matchStatsFor(events, playerId, myTeam).aces >= f.perMatch ? 1 : 0;
  if (f.type === 'killMatch') return matchStatsFor(events, playerId, myTeam).kills >= f.perMatch ? 1 : 0;
  return 0;
}

// ---- 進度資料層（save.recruitment：progress 跨賽季累積、永不重置）----

// 逐鍵正規化（不是整條回退）：手改/匯入的半殘條目（如 {wins:2} 缺 feat）缺鍵補 0——
// 否則 `undefined + n` 產生 NaN，該員的 conditionMet 恆 false（對抗審查 LOW-1）。
// W6：progress 鍵＝recruitKey（既有 5 隊鍵值同 opponentId，舊存檔零遷移）
export function progressOf(recruitment, recruitKey) {
  const p = recruitment?.progress?.[recruitKey];
  return {
    wins: p?.wins ?? 0,
    feat: p?.feat ?? 0,
    stageCleared: !!p?.stageCleared,
  };
}

// 賽末累加（不可變）：勝場＋壯舉＋stage 軸（僅在指定場次擊敗才記）。
// W6：同隊多招募對象＝逐鍵各自累加（wins 軸同步、feat 軸各算各的）；
// 非招募對象（無條件定義）原樣返回。
export function accrueRecruitProgress(recruitment, {
  opponentId, matchId, won, events = null, playerId = null, myTeam = null,
}) {
  let rec = recruitment;
  for (const [key, cond] of Object.entries(RECRUIT_CONDS)) {
    if (cond.opponentId !== opponentId) continue;
    const prev = progressOf(rec, key);
    const entry = {
      wins: prev.wins + (won ? 1 : 0),
      feat: prev.feat + featGainFor(events, playerId, myTeam, cond),
      stageCleared: prev.stageCleared || !!(cond.stage && won && matchId === cond.stage),
    };
    rec = { ...rec, progress: { ...(rec.progress ?? {}), [key]: entry } };
  }
  return rec;
}

// 條件是否全數達成（三軸缺項＝不檢查；W6 起 wins 亦可缺——A3 第二人純壯舉軸）
export function conditionMet(recruitment, recruitKey) {
  const cond = RECRUIT_CONDS[recruitKey];
  if (!cond) return false;
  const p = progressOf(recruitment, recruitKey);
  return (cond.wins == null || p.wins >= cond.wins)
    && (!cond.feat || p.feat >= cond.feat.count)
    && (!cond.stage || !!p.stageCleared);
}

// ---- 招牌球員 DNA 生成（決定論：種子＝career seed × opponentId，同存檔重演逐值一致）----

// FNV-1a 混雜（與 careerState.matchSeed 同慣例）：careerSeed × 字串 → 32-bit hash
function hash32(seed, str) {
  let h = ((seed >>> 0) ^ 0x811c9dc5) >>> 0;
  for (const ch of String(str)) {
    h = (h ^ ch.codePointAt(0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

const clampAttr = (v) => Math.max(ATTR_MIN, Math.min(ATTR_MAX, Math.round(v)));

// W6 入隊補正（新增採納 1）：招募生以「當前隊伍平均能力」為底線生成——解「後期招募
// 貶值」（隊友成長到 80+ 時，新人還從來源隊出廠值起跳＝進來就是棄子）。
// 只補不砍：來源隊公式值已高於隊伍水位＝照舊（早期招強隊招牌仍然是即戰力）；
// 由入隊當下名冊決定論導出（成員屬性是存檔狀態，同存檔重演一致）
function rosterUplift(members, baseAttrs) {
  if (!members?.length) return 0;
  const avgOf = (attrs) => ATTRIBUTE_KEYS
    .reduce((s, k) => s + (attrs[k] ?? 0), 0) / ATTRIBUTE_KEYS.length;
  const teamAvg = members.reduce((s, m) => s + avgOf(m.attributes), 0) / members.length;
  return Math.max(0, Math.round(teamAvg - avgOf(baseAttrs)));
}

// 屬性槽位身高（opponents.js heights 槽序＝S/OH/MB/OPP/OH/MB）
const ROLE_HEIGHT_SLOT = { setter: 0, outside: 1, middle: 2, opposite: 3 };

// 依來源隊 level＋attrBias（＋該角色 roleBias）決定論生成成員；每屬性帶 −2..+2
// 決定論抖動（hash(careerSeed, recruitKey:attr)）讓同角色轉學生不是複製人。
// 年級固定二年級轉學生（拍板：不做年級×成長分檔）；自由人走 buildLibero 防守專才
// 公式為基底（與小守同一條屬性哲學）再抖動。
// W6：第一參數改 recruitKey（既有 5 隊鍵值＝opponentId，抖動 hash 輸入不變＝
// 舊存檔重演逐值一致）；origin 維持「來源隊 id」語義（cond.opponentId），
// recruitKey 另立欄位（同隊第二人與招牌的 UI/防重招對映靠它；舊成員缺欄回退 origin）
// 第 4 參數 rosterMembers（W6）：給了就做入隊補正（settleRecruitJoins 傳現役名冊）；
// 省略＝無補正（治具基準臂/舊呼叫端行為不變）
export function buildRecruitMember(recruitKey, careerSeed, id, rosterMembers = null) {
  const cond = RECRUIT_CONDS[recruitKey];
  const def = cond ? opponentById(cond.opponentId) : null;
  const meta = RECRUIT_DEFS[recruitKey];
  if (!def || !cond || !meta) throw new Error(`buildRecruitMember：未知招募對象 ${recruitKey}`);
  const role = cond.role;
  const jitter = (key) => (hash32(careerSeed, `${recruitKey}:${key}`) % 5) - 2;
  const attributes = {};
  const base = role === 'libero'
    ? buildLibero('A', meta.name, def.level).attributes
    : null;
  const baseAttrs = {};
  for (const k of ATTRIBUTE_KEYS) {
    baseAttrs[k] = base
      ? base[k]
      : def.level + (def.attrBias?.[k] ?? 0) + (def.roleBias?.[role]?.[k] ?? 0);
  }
  const uplift = rosterUplift(rosterMembers, baseAttrs); // W6 入隊補正（只補不砍）
  for (const k of ATTRIBUTE_KEYS) {
    attributes[k] = clampAttr(baseAttrs[k] + uplift + jitter(k));
  }
  return {
    id,
    name: meta.name,
    origin: def.id, // schema：origin＝來源隊 id（starter 以外皆招募生）
    recruitKey, // W6：招募槽對映（同隊多人時 origin 不再唯一）
    role,
    height: role === 'libero' ? 1.72 : (def.heights?.[ROLE_HEIGHT_SLOT[role]] ?? 1.86),
    attributes,
    growth: { grade: 2, xp: {}, log: [] }, // 二年級：成長率 0.7（RATE_BY_GRADE 既有分檔）
    dna: { teamId: def.id, style: def.style, tag: def.name },
    persona: meta.persona,
  };
}

// 新成員 id：R 前綴避免與 A1..A6/AL 碰撞；序號＝歷來 R 成員（現役 members ∪ 已逐出
// expelled 快照）最大號＋1——逐出移除現役成員後 id 絕不回收（否則新招募與現役撞號，
// 亦違「R id 不回收」）。expelled 屬存檔狀態一部分，同存檔重演一致。
export function nextRecruitId(members, expelled = []) {
  const ids = [
    ...(members ?? []).map((m) => m.id),
    ...(expelled ?? []).map((e) => e.member?.id),
  ];
  let max = 0;
  for (const id of ids) {
    const m = /^R(\d+)$/.exec(id ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `R${max + 1}`;
}

// ---- 入隊流程（store 層）----

// 條件達成→入隊：逐招募槽檢查（表序），滿足且有空位＝生成成員、單次 RMW 原子寫入
// 三處（roster.members push＋lineup.trust 顯式 10＋recruitment.recruited push——
// store.applyRecruit 一筆寫完，不留「入了名冊沒記 recruited」的中間態）。
// 無空位：不入隊、條件保持已達成、progress 不清——W6 池 12 vs slots 5 起這是常態：
// 逐出騰位後下次結算自動入隊（「組建你的五人」的取捨迴圈）。
// 冪等：recruited 已含該槽＝跳過；重複呼叫返回空陣列。
// W6：recruited 存 recruitKey（既有 5 隊鍵值＝opponentId，舊存檔零遷移）；
// applyRecruit 的 opponentId 參數自 W6 起承載 recruitKey（store 只作 recruited push 用）
export function settleRecruitJoins(store, careerSeed) {
  const joined = [];
  for (const recruitKey of Object.keys(RECRUIT_CONDS)) {
    const rec = store.loadRecruitment();
    const roster = store.loadRoster();
    // members 空＝名冊尚未 ensureStarterRoster 補齊——先入隊會讓補齊判定（members
    // 非空＝已補）誤判而永遠缺創隊班底；實務上 progress>0 必經開賽（已補齊），此為防線
    if (!rec || !roster || roster.members.length === 0) return joined;
    if (rec.recruited.includes(recruitKey) || !conditionMet(rec, recruitKey)) continue;
    if (openSlots(roster) <= 0) continue;
    const id = nextRecruitId(roster.members, rec.expelled ?? []); // 含 expelled：id 不回收
    // W6：傳現役名冊＝入隊補正生效（晚招的人跟上隊伍成長水位）
    const member = buildRecruitMember(recruitKey, careerSeed, id, roster.members);
    if (!store.applyRecruit({ member, opponentId: recruitKey, trust: RECRUIT_TRUST })) return joined;
    joined.push(member);
  }
  return joined;
}

// ---- W5 逐出資格判定（純函式：UI 閘門與 store 最後防線共用同一套規則）----

// 本屆已逐出人數（每屆上限判定用）：以 expelled 條目的 seasonIndex 過濾當屆
export function expelCountThisSeason(recruitment, seasonIndex) {
  return (recruitment?.expelled ?? []).filter((e) => e.seasonIndex === seasonIndex).length;
}

// 可否逐出某成員（拍板邊界，回傳 { ok, reason }——reason 供 UI 對應提示）：
//   僅招募生（創隊班底 origin='starter' 不可逐）、不在現役先發或自由人位（先發保護；
//   libero 一併擋——避免逐掉現役自由人孤兒化 lineup.libero）、每屆上限 1。
export function canExpel(save, memberId) {
  const member = save?.roster?.members?.find((m) => m.id === memberId);
  if (!member) return { ok: false, reason: 'not-found' };
  if (member.origin === 'starter') return { ok: false, reason: 'starter-origin' };
  const lineup = save.lineup ?? {};
  if ((lineup.starters ?? []).includes(memberId) || lineup.libero === memberId) {
    return { ok: false, reason: 'in-lineup' };
  }
  const seasonIndex = save.season?.index ?? 1;
  if (expelCountThisSeason(save.recruitment, seasonIndex) >= EXPEL_PER_SEASON_LIMIT) {
    return { ok: false, reason: 'season-limit' };
  }
  return { ok: true, reason: '' };
}
