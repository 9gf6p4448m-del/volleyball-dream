// Phase 3 W3 — 先發編排（lineup）純函式層：預設陣容／結構驗證／FIVB 7.7 輪轉序預檢／
// 建隊順序展開／信任跟人映射。零 three.js/DOM，node 可測。
// 場上 6 人＝玩家（A2）＋5 名非自由人隊友；自由人（AL）為第 7 人（sim applyLiberoSwaps 換入）。
import { isRotationOrderLegal } from '../sim/rotationRules.js';

export const LINEUP_SIZE = 6;
export const DEFAULT_LIBERO_ID = 'AL';
// 預設輪轉序＝W2 固定槽位對映的同序（A1..A6、玩家 A2 在 index 1）——
// 保證預設路徑與舊固定槽位建隊逐位等價（W3 驗收閘 2）。W4 名冊變動後再一般化。
export const DEFAULT_STARTERS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
// 信任跟人（拍板）：隊友 trust 以 member id 為鍵、換位不繼承他人信任。
// 玩家（A2）trust 恆取 save.player（唯一權威），刻意不入本映射——避免雙真相。
// 預設值承 W2 隊友槽位 trust＝全 20（見 careerState 舊 BASE_TRUST）。
export const DEFAULT_TEAMMATE_TRUST = 20;

// 名冊 → 可排入先發的隊友 id（非自由人；不含玩家、不含自由人 AL）
function fieldMemberIds(members) {
  return (members ?? []).filter((m) => m.role !== 'libero').map((m) => m.id);
}

// 預設先發陣容：starters＝玩家＋5 隊友的預設序、libero＝AL、rotationStart=0、
// trust＝隊友全 20 映射（玩家不入映射）。ensureStarterRoster 首次補齊即落此形狀。
export function defaultLineup(members) {
  const trust = {};
  for (const id of fieldMemberIds(members)) trust[id] = DEFAULT_TEAMMATE_TRUST;
  return { starters: [...DEFAULT_STARTERS], libero: DEFAULT_LIBERO_ID, rotationStart: 0, trust };
}

// 結構驗證（schema 匯入路徑＋UI 排陣即時用）：長度 6、無重複、id 為合法場上球員
// （非自由人隊友 ∪ 玩家）、自由人不排入先發、rotationStart 為 0-5 整數。
// 回傳 { valid, errors:[] }（starters 須非 null——null＝建檔中間態，呼叫端自行跳過）。
export function validateLineup(lineup, members, playerId = null) {
  const errors = [];
  const { starters, libero, rotationStart } = lineup ?? {};
  const fieldIds = new Set(fieldMemberIds(members));
  if (playerId) fieldIds.add(playerId);
  const liberoIds = new Set((members ?? []).filter((m) => m.role === 'libero').map((m) => m.id));

  if (!Array.isArray(starters) || starters.length !== LINEUP_SIZE) {
    errors.push(`先發須為 ${LINEUP_SIZE} 人`);
  } else {
    if (new Set(starters).size !== starters.length) errors.push('先發名單有重複球員');
    for (const id of starters) {
      if (!fieldIds.has(id)) errors.push(`先發含非法球員：${id}`);
    }
    // 主控球員必在先發（排球鐵律：玩家恆在場上）——W3 場上恰 6 人必含 A2，此檢查為
    // W4 fieldIds>6 時的防線，擋下「6 名隊友、無主控」的非法排列
    if (playerId && !starters.includes(playerId)) errors.push('先發須含主控球員');
    if (libero != null && starters.includes(libero)) errors.push('自由人不可排入先發');
  }
  if (libero != null && !liberoIds.has(libero)) errors.push(`${libero} 非名冊自由人`);
  if (!Number.isInteger(rotationStart) || rotationStart < 0 || rotationStart > 5) {
    errors.push('起始輪轉須為 0-5 整數');
  }
  return { valid: errors.length === 0, errors };
}

// 5-1 對位結構（Sawmah 拍板 07-23：強制對角，杜絕同角色職責位衝突）：
// 輪轉序對角三組（1-4／2-5／3-6 號位）必須恰為 {S,OPP}／{OH,OH}／{MB,MB} 各一組。
// 如此任何輪轉的前排恆為「舉球線＋OH＋MB」各一人，換位職責位（OH 左翼/MB 中/
// OPP·S 右翼，見 sim dutyPosition）永不相撞；亂序（如兩 MB 相鄰）會讓同排兩人
// 搶同一職責位。強制層＝UI 互換限制＋ensureLineup 重置；schema 匯入不擋（防 brick 舊檔）。
export function checkRoleStructure(starters, members, playerId = null, playerRole = 'outside') {
  if (!Array.isArray(starters) || starters.length !== LINEUP_SIZE) {
    return { legal: false, reason: `先發須為 ${LINEUP_SIZE} 人` };
  }
  const roleOf = (id) => (id === playerId ? playerRole : members?.find((m) => m.id === id)?.role);
  const PAIR_KEYS = new Set(['opposite|setter', 'outside|outside', 'middle|middle']);
  const found = [];
  for (let i = 0; i < 3; i += 1) {
    const key = [roleOf(starters[i]), roleOf(starters[i + 3])].sort().join('|');
    if (!PAIR_KEYS.has(key)) {
      return {
        legal: false,
        reason: `${i + 1} 與 ${i + 4} 號位須為對角配對（S–OPP／OH–OH／MB–MB）——否則換位職責相撞`,
      };
    }
    found.push(key);
  }
  if (new Set(found).size !== 3) {
    return { legal: false, reason: '對角三組須為 S–OPP、OH–OH、MB–MB 各一（5-1 對位）' };
  }
  return { legal: true, reason: null };
}

// 依 rotationStart 旋轉先發序＝該局實際輪轉序（index 0＝起始 1 號位＝首發球者）。
export function effectiveOrder(starters, rotationStart = 0) {
  const n = starters.length;
  if (n === 0) return [];
  const k = ((rotationStart % n) + n) % n;
  return [...starters.slice(k), ...starters.slice(0, k)];
}

// FIVB 7.7 輪轉序預檢（排陣確認時呼叫；擋下必犯規陣並給具體理由）：
// 以實際輪轉序走完整一輪發球，逐棒用 isRotationOrderLegal 驗證發球者依序輪替。
// W3 內發球者由輪轉序決定論導出＝此檢查對合法排列恆真——作用為結構防護＋供 UI 具體 7.7
// 理由字串；真正可被玩家排錯的發球序來源（W4 中途換人／輪轉替補）出現後此預檢才會真正擋人。
export function checkRotationOrder(starters, rotationStart = 0) {
  if (!Array.isArray(starters) || starters.length !== LINEUP_SIZE) {
    return { legal: false, reason: `輪轉序須 ${LINEUP_SIZE} 人` };
  }
  if (new Set(starters).size !== starters.length) {
    return { legal: false, reason: '輪轉序有重複球員（違反 7.7 輪轉錯誤）' };
  }
  const order = effectiveOrder(starters, rotationStart);
  for (let served = 0; served < order.length; served += 1) {
    const server = order[served % order.length];
    if (!isRotationOrderLegal(server, order, served)) {
      return { legal: false, reason: `第 ${served + 1} 棒發球者違反輪轉序（7.7）` };
    }
  }
  return { legal: true, reason: null };
}

// 建隊時取某隊友的 trust（跟人：以 member id 查映射；缺鍵回退預設 20）。
// 玩家不走此路（trust 由 save.player 供給）。
export function trustOf(lineup, memberId) {
  return lineup?.trust?.[memberId] ?? DEFAULT_TEAMMATE_TRUST;
}
