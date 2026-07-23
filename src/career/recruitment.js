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
// 生成屬性夾限：上限與隊友成長天花板一致（roster.js ROSTER_GROWTH.ATTR_CAP＝85）
const ATTR_MIN = 30;
const ATTR_MAX = 85;

// ---- 條件模板（任務書 §1 拍板表；三軸缺項＝不檢查）----
// wins＝對該隊累計勝場；feat＝個人壯舉（可計數，跨場累積）；stage＝須在此場次擊敗。
// 壯舉三軸的事件層定義（替代定義的歸因見結案快照偏差表）：
//   digMatch：單場「dig」（敵方扣球後的第一時間 receive/dive）達 perMatch 次＝1 場達標
//   blockKill：攔網得分（BLOCK_TOUCH 後我隊直接得分）——事件流無「快攻」標記，
//     以「攔死其攻擊」近似「攔死其快攻」（曜石＝快攻隊，其攻擊以快攻為主體）
//   strongReceive：高品質接發（敵方發球後第一觸為玩家 receive/dive 且品質 ≥ quality）
//     ——SERVE 事件無式樣欄位，以「接發品質」近似「接起強發」（頂住鐵霧發球輪＝壯舉本意）
export const RECRUIT_CONDS = {
  'north-tech': { role: 'setter', wins: 3 },
  'white-wave': {
    role: 'libero', wins: 2,
    feat: { type: 'digMatch', perMatch: 3, count: 3, label: '單場救起 3 記重扣' },
  },
  obsidian: {
    role: 'middle', wins: 2,
    feat: { type: 'blockKill', count: 5, label: '攔死其攻擊' },
  },
  'iron-mist': {
    role: 'opposite', wins: 2,
    feat: { type: 'strongReceive', quality: 0.8, count: 8, label: '穩穩接起其發球' },
  },
  'sky-hawk': { role: 'outside', wins: 1, stage: 'national-final' },
};

// 招牌球員預設稿（名字/人設＝佔位，命名工程 Phase 3 收尾統一做——與 STARTER_DEFS 同約定）
const RECRUIT_DEFS = {
  'north-tech': { name: '阿澄', persona: '北原的節拍器——不起眼的一傳一舉，把整隊的亂流理成直線' },
  'white-wave': { name: '小浪', persona: '白浪最黏的那道浪——球不落地，是他唯一的信仰' },
  obsidian: { name: '阿曜', persona: '曜石的快攻箭頭——起跳永遠比你的判斷快半拍' },
  'iron-mist': { name: '阿鐵', persona: '鐵霧的重砲右翼——發球跟扣球一樣，都往死裡打' },
  'sky-hawk': { name: '阿鷹', persona: '天鷹的王牌翼手——全國決賽的舞台，是他的日常' },
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
  return 0;
}

// ---- 進度資料層（save.recruitment：progress 跨賽季累積、永不重置）----

// 逐鍵正規化（不是整條回退）：手改/匯入的半殘條目（如 {wins:2} 缺 feat）缺鍵補 0——
// 否則 `undefined + n` 產生 NaN，該員的 conditionMet 恆 false（對抗審查 LOW-1）
export function progressOf(recruitment, opponentId) {
  const p = recruitment?.progress?.[opponentId];
  return {
    wins: p?.wins ?? 0,
    feat: p?.feat ?? 0,
    stageCleared: !!p?.stageCleared,
  };
}

// 賽末累加（不可變）：勝場＋壯舉＋stage 軸（僅在指定場次擊敗才記）。
// 非招募對象（無條件定義）原樣返回。
export function accrueRecruitProgress(recruitment, {
  opponentId, matchId, won, events = null, playerId = null, myTeam = null,
}) {
  const cond = RECRUIT_CONDS[opponentId];
  if (!cond) return recruitment;
  const prev = progressOf(recruitment, opponentId);
  const entry = {
    wins: prev.wins + (won ? 1 : 0),
    feat: prev.feat + featGainFor(events, playerId, myTeam, cond),
    stageCleared: prev.stageCleared || !!(cond.stage && won && matchId === cond.stage),
  };
  return {
    ...recruitment,
    progress: { ...(recruitment.progress ?? {}), [opponentId]: entry },
  };
}

// 條件是否全數達成（三軸缺項＝不檢查）
export function conditionMet(recruitment, opponentId) {
  const cond = RECRUIT_CONDS[opponentId];
  if (!cond) return false;
  const p = progressOf(recruitment, opponentId);
  return p.wins >= cond.wins
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

// 屬性槽位身高（opponents.js heights 槽序＝S/OH/MB/OPP/OH/MB）
const ROLE_HEIGHT_SLOT = { setter: 0, outside: 1, middle: 2, opposite: 3 };

// 依來源隊 level＋attrBias（＋該角色 roleBias）決定論生成成員；每屬性帶 −2..+2
// 決定論抖動（hash(careerSeed, opponentId:attr)）讓同角色轉學生不是複製人。
// 年級固定二年級轉學生（拍板：不做年級×成長分檔）；自由人走 buildLibero 防守專才
// 公式為基底（與小守同一條屬性哲學）再抖動。
export function buildRecruitMember(opponentId, careerSeed, id) {
  const def = opponentById(opponentId);
  const cond = RECRUIT_CONDS[opponentId];
  const meta = RECRUIT_DEFS[opponentId];
  if (!def || !cond || !meta) throw new Error(`buildRecruitMember：未知招募對象 ${opponentId}`);
  const role = cond.role;
  const jitter = (key) => (hash32(careerSeed, `${opponentId}:${key}`) % 5) - 2;
  const attributes = {};
  const base = role === 'libero'
    ? buildLibero('A', meta.name, def.level).attributes
    : null;
  for (const k of ATTRIBUTE_KEYS) {
    const raw = base
      ? base[k]
      : def.level + (def.attrBias?.[k] ?? 0) + (def.roleBias?.[role]?.[k] ?? 0);
    attributes[k] = clampAttr(raw + jitter(k));
  }
  return {
    id,
    name: meta.name,
    origin: opponentId, // schema：origin＝來源隊 id（starter 以外的唯一來源）
    role,
    height: role === 'libero' ? 1.72 : (def.heights?.[ROLE_HEIGHT_SLOT[role]] ?? 1.86),
    attributes,
    growth: { grade: 2, xp: {}, log: [] }, // 二年級：成長率 0.7（RATE_BY_GRADE 既有分檔）
    dna: { teamId: def.id, style: def.style, tag: def.name },
    persona: meta.persona,
  };
}

// 新成員 id：R 前綴避免與 A1..A6/AL 碰撞；序號＝現有 R 成員數＋1（同存檔重演
// 入隊順序一致 → id 一致）
export function nextRecruitId(members) {
  return `R${(members ?? []).filter((m) => /^R\d+$/.test(m.id)).length + 1}`;
}

// ---- 入隊流程（store 層）----

// 條件達成→入隊：逐對手檢查（表序），滿足且有空位＝生成成員、單次 RMW 原子寫入
// 三處（roster.members push＋lineup.trust 顯式 10＋recruitment.recruited push——
// store.applyRecruit 一筆寫完，不留「入了名冊沒記 recruited」的中間態）。
// 無空位：不入隊、條件保持已達成、progress 不清（W5 若做釋出機制再接）。
// 冪等：recruited 已含該隊＝跳過；重複呼叫返回空陣列。
export function settleRecruitJoins(store, careerSeed) {
  const joined = [];
  for (const opponentId of Object.keys(RECRUIT_CONDS)) {
    const rec = store.loadRecruitment();
    const roster = store.loadRoster();
    // members 空＝名冊尚未 ensureStarterRoster 補齊——先入隊會讓補齊判定（members
    // 非空＝已補）誤判而永遠缺創隊班底；實務上 progress>0 必經開賽（已補齊），此為防線
    if (!rec || !roster || roster.members.length === 0) return joined;
    if (rec.recruited.includes(opponentId) || !conditionMet(rec, opponentId)) continue;
    if (openSlots(roster) <= 0) continue;
    const member = buildRecruitMember(opponentId, careerSeed, nextRecruitId(roster.members));
    if (!store.applyRecruit({ member, opponentId, trust: RECRUIT_TRUST })) return joined;
    joined.push(member);
  }
  return joined;
}
