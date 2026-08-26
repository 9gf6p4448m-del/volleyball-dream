// 大學建隊（大學卷 批 6，2026-08-14）——你到了新學校，隊友換成那所大學的人。
//
// ★ 拍板（2026-08-14 Sawmah）★
//   ① 名冊＝該校現有陣容（資料表的 6 先發＋自由人）；高中名冊**封存**、不隨行。
//   ② 強弱校的球權用「各校起始信任值」兌現——沿用既有的二傳信任機制，零新機制。
//
// ★ 屬性走既有座標系 ★ `level + attrBias + roleBias`——與 `buildOpponentTeam`
//（`careerState.js:295-319`）同一條公式。另造一套換算等於同名不同義，日後平衡治具
// 量到的數字會對不上（`02 §6.1` 第 2 條）。
// ⚠ **兩處刻意的差異**（對抗覆審 F5 要求寫明，免得日後拿治具對兩邊時以為量錯）：
//   ① 這裡 clamp 到 `ROSTER_GROWTH.ATTR_CAP`（85）與地板 30——那是**隊友**的天花板
//      （主角 90＝主角感護欄）；對手側不 clamp，所以同一所大學當對手時上限更高。
//   ② 王牌 +4 是本檔自訂；對手側走 `aceAttrBonus ?? 0`（大學表沒這個欄位＝0）。
//   ⇒ 同一所學校當隊友與當對手，數值**本來就不同**，這不是 bug。
//
// 驗收＝`docs/kickoffs/acceptance-uni-batch6.md`（B6-3 建隊、B6-4 起始信任）。
import { ATTRIBUTE_KEYS } from '../sim/player.js';
import { PLAYER_TRUST_FLOOR, ROLE_ORDER } from './careerState.js';
import { ROSTER_GROWTH } from './roster.js';
import { universityById } from './universities.js';
import { TIER } from './admission.js';

// 槽序＝careerState 的 ROLE_ORDER（大學資料表的 squad 照同一個序）。
// 大二卷批 1 起 export：uniTurnover 的新生身高 fallback 要用它對照 school.heights；
// 債清批 2026-08-26 收斂＝直接 re-export careerState 同一參照，別再抄一份
// （同名不同義的溫床）。uniTeam 本就 import careerState，無新循環。
export { ROLE_ORDER as UNI_ROLE_ORDER } from './careerState.js';

/**
 * 各校的玩家起始信任（＝球權四軸裡的「球權」那一軸）。
 * ★ 強豪＝地板值本身 ★ `PLAYER_TRUST_FLOOR` 是「玩家不得淪為觀眾」的保底
 *（`careerState.js:248`）——強豪隊已經有王牌，你從**保底**開始拿球，正是卷宗
 * §三之二寫的「這裡的球先給三年級」。中段與弱校往上加。
 * ★ 不要另抄 0.27 這個數字 ★ 從常數導出，改一處就同步。
 */
export const UNI_START_TRUST = {
  [TIER.POWERHOUSE]: Math.round(PLAYER_TRUST_FLOOR * 100), // 27
  [TIER.MID]: 40,
  [TIER.WEAK]: 55,
};

/** 這所學校給玩家多少球權（認不得的 tier 照中段給——保守，不會意外送出王牌待遇）。 */
export function uniStartTrustFor(school) {
  return UNI_START_TRUST[school?.tier] ?? UNI_START_TRUST[TIER.MID];
}

// 大二卷批 3（拍板題 2 甲）：聯賽名次→下一年球權微調——「名次帶著走」的兌現。
// ★數值屬提案★（acceptance-uni-y2-batch3.md，試玩後可調）：搭配賽季內自然成長
// （約每年 +16），冠軍年強豪線 27→~49，四年可到王牌線；墊底＝0 不倒扣
// （failed season 的懲罰是戰績本身，不再剝球權——與高中「止步不加難」同哲學）。
export function uniRankTrustBonus(rank) {
  if (!Number.isInteger(rank) || rank < 1) return 0;
  if (rank === 1) return 6;
  if (rank <= 3) return 4;
  if (rank <= 6) return 2;
  return 0;
}

function attributesFor(school, role, i) {
  const attrs = {};
  const isAce = school.ace?.slot === i;
  for (const k of ATTRIBUTE_KEYS) {
    const raw = school.level + (school.attrBias?.[k] ?? 0) + (school.roleBias?.[role]?.[k] ?? 0)
      + (isAce ? 4 : 0); // 王牌略高於全隊基準（同 opponents 的 aceAttrBonus 精神）
    // 隊友上限沿用 `ROSTER_GROWTH.ATTR_CAP`（85，低於主角的 90——主角感護欄）
    attrs[k] = Math.max(30, Math.min(ROSTER_GROWTH.ATTR_CAP, raw));
  }
  return attrs;
}

const personaOf = (school, role, isAce) => (isAce
  ? `${school.name}的王牌——${school.ace.title}`
  : `${school.name}・${{ setter: '二傳', outside: '主攻', middle: '攔中', opposite: '對角', libero: '自由人' }[role]}`);

/**
 * 該校的名冊成員（6 先發＋自由人，共 7 人）。**純函式、決定論**。
 * 玩家不在裡面（玩家存 `save.player`）——他會由 `defaultLineup` 排進自己的位置，
 * 同角色排不下的那一位自動落板凳（B6-3 要求「被擠掉的那一位不得消失」）。
 */
export function buildUniMembers(schoolId) {
  const school = universityById(schoolId);
  if (!school) return [];
  const members = school.squad.map((fullName, i) => {
    const role = ROLE_ORDER[i];
    const isAce = school.ace?.slot === i;
    return {
      id: `U${i + 1}`,
      name: fullName,
      fullName,
      origin: `uni:${school.id}`,
      role,
      height: school.heights[i],
      ...(isAce ? { title: school.ace.title } : {}),
      attributes: attributesFor(school, role, i),
      growth: { grade: school.grades[i], xp: {}, log: [] },
      dna: { teamId: school.id, style: school.style, tag: school.name },
      persona: personaOf(school, role, isAce),
    };
  });
  const liberoAce = school.ace?.slot === 'L';
  members.push({
    id: 'UL',
    name: school.libero,
    fullName: school.libero,
    origin: `uni:${school.id}`,
    role: 'libero',
    height: Math.min(...school.heights) - 0.08,
    ...(liberoAce ? { title: school.ace.title } : {}),
    attributes: attributesFor(school, 'libero', 'L'),
    growth: { grade: school.liberoGrade, xp: {}, log: [] },
    dna: { teamId: school.id, style: school.style, tag: school.name },
    persona: personaOf(school, 'libero', liberoAce),
  });
  return members;
}
