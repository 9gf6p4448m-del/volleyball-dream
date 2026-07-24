// Phase 3 W6 A2 — 賽程輪抽（屆間輪換＋指定邀請；純函式、決定論）
// 拍板（w6-kickoff 拍板結果）：小組 3 場自對手池決定論輪抽；玩家每屆可指定 1 隊必入
// （指定計入出現）；保底＝每隊至少每兩屆出現一次；國賽維持固定強度階梯。
// 設計偏差（記 phase3-w6-status 偏差表）：第 1 屆固定用故事模板（北原→白浪→曜石）——
// 技術傳授鏈（events.js teach-*）綁定這三隊的場次與對手，隨機化會讓吊球/魚躍/pipe
// 永無傳授點；輪抽自第 2 屆（advanceSeason）起生效。
// 保底的結構保證：國賽階梯三隊每屆必現於賽程；「僅小組可見」隊伍靠兩條規則兜住——
// ①保底債：上屆小組缺席的僅小組隊，本屆必入 ②每屆小組至少 min(2, 池內僅小組隊數)
// 席留給僅小組隊（=下屆債 ≤ 可用席）。兩者合成「每隊 ≤2 屆必現」的決定論不變式。
import { OPPONENTS, opponentById } from './opponents.js';

// 國賽固定強度階梯（W2 定案敘事：八強鐵霧/準決宿敵曜石/決賽天鷹——輪抽不動這裡）
export const NATIONAL_LADDER = [
  { id: 'national-qf', stage: 'national', opponentId: 'iron-mist', label: '八強' },
  { id: 'national-sf', stage: 'national', opponentId: 'obsidian', label: '準決賽' },
  { id: 'national-final', stage: 'national', opponentId: 'sky-hawk', label: '決賽' },
];
const NATIONAL_IDS = new Set(NATIONAL_LADDER.map((m) => m.opponentId));

// 小組輪抽池＝全對手（強隊也可被邀/被抽進小組——復仇之戰、壯舉刷點都靠這）
export function groupPool() {
  return OPPONENTS.map((o) => o.id);
}

// FNV-1a（與 careerState.matchSeed 同慣例）：seed × 字串 → 決定論排序鍵
function hash32(seed, str) {
  let h = ((seed >>> 0) ^ 0x811c9dc5) >>> 0;
  for (const ch of String(str)) {
    h = (h ^ ch.codePointAt(0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// 小組對手輪抽（決定論）：seed＝該屆生涯種子（advanceSeason 已逐屆衍生）；
// invitedId＝玩家指定邀請（null＝不指定）；prevGroupIds＝上屆小組對手（null＝首屆抽，無債）
export function drawGroupOpponents({ seed, invitedId = null, prevGroupIds = null }) {
  const pool = groupPool();
  const groupOnly = pool.filter((id) => !NATIONAL_IDS.has(id));
  const minWeak = Math.min(2, groupOnly.length);
  const rank = (id) => hash32(seed, `draw:${id}`);
  const picks = [];
  if (invitedId && pool.includes(invitedId)) picks.push(invitedId);
  // 保底債：上屆小組缺席的僅小組隊本屆必入（不變式下 debt ≤ 剩餘席）
  if (prevGroupIds) {
    const debt = groupOnly
      .filter((id) => !prevGroupIds.includes(id) && !picks.includes(id))
      .sort((a, b) => rank(a) - rank(b));
    for (const id of debt) if (picks.length < 3) picks.push(id);
  }
  // 輪抽補位：決定論排序；剩餘席只夠補足僅小組隊下限時，跳過國賽階梯隊
  const rest = pool.filter((id) => !picks.includes(id)).sort((a, b) => rank(a) - rank(b));
  for (const id of rest) {
    if (picks.length >= 3) break;
    const weakCount = picks.filter((p) => groupOnly.includes(p)).length;
    const weakNeeded = minWeak - weakCount;
    if (weakNeeded >= 3 - picks.length && !groupOnly.includes(id)) continue;
    picks.push(id);
  }
  // 小組場序依 level 升冪（維持「由淺入深」強度體感）
  picks.sort((a, b) => (opponentById(a)?.level ?? 0) - (opponentById(b)?.level ?? 0));
  return picks;
}

// 整份賽程（輪抽小組＋固定國賽）；invited 旗標落在賽程項上（UI 顯邀請徽章、存檔即公開）
export function buildSchedule({ seed, invitedId = null, prevGroupIds = null }) {
  const group = drawGroupOpponents({ seed, invitedId, prevGroupIds });
  return [
    ...group.map((oppId, i) => ({
      id: `group-${i + 1}`,
      stage: 'group',
      opponentId: oppId,
      label: '',
      ...(invitedId && oppId === invitedId ? { invited: true } : {}),
    })),
    ...NATIONAL_LADDER.map((m) => ({ ...m })),
  ];
}
