// 職業建隊（職業章 批 1，2026-08-26）——你被挖去那支職業隊，隊友換成那支隊的人。
//
// ★ 與 `corpTeam.js` 同形（同構驗收：輸出欄位鍵集合逐一相同）★ 屬性走既有座標系
// `level + attrBias + roleBias`——與 `buildOpponentTeam`、`buildUniMembers`、
// `buildCorpMembers` 同一條公式。另造一套換算等於同名不同義（`02 §6.1` 第 2 條）。
// 兩處刻意差異也照抄企業版（`corpTeam.js` 檔頭原封適用）：
//   ① 隊友 clamp 到 `ROSTER_GROWTH.ATTR_CAP`（85）與地板 30；對手側不 clamp。
//   ② 王牌 +4 是建隊側自訂；對手側走 `aceAttrBonus ?? 0`。
//
// ★ growth.grade 在職業章＝在隊年資 ★（同 corporations.js／proTeams.js 檔頭語意）。
// 批 1 只有一年、不跑任何畢業/換血邏輯。
//
// 驗收＝`docs/kickoffs/acceptance-pro-batch1.md`（A4）。
import { ATTRIBUTE_KEYS } from '../sim/player.js';
import { ROSTER_GROWTH } from './roster.js';
import { proTeamById } from './proTeams.js';
import { UNI_ROLE_ORDER, UNI_START_TRUST } from './uniTeam.js';
import { TIER } from './admission.js';

// 槽序＝大學/企業共用的同一份（`uniTeam.js` export 的單一事實來源）——別再抄一份。
const ROLE_ORDER = UNI_ROLE_ORDER;

/**
 * 隊階起點球權（沿大學／企業同一張表——不另抄數字）。要分岔（職業起點該不該更低，
 * 挖角來的資深球員該不該不同）是試玩後的平衡題，到時再在這裡換表。
 */
export function proStartTrustFor(team) {
  return UNI_START_TRUST[team?.tier] ?? UNI_START_TRUST[TIER.MID];
}

function attributesFor(team, role, i) {
  const attrs = {};
  const isAce = team.ace?.slot === i;
  for (const k of ATTRIBUTE_KEYS) {
    const raw = team.level + (team.attrBias?.[k] ?? 0) + (team.roleBias?.[role]?.[k] ?? 0)
      + (isAce ? 4 : 0);
    attrs[k] = Math.max(30, Math.min(ROSTER_GROWTH.ATTR_CAP, raw));
  }
  return attrs;
}

const personaOf = (team, role, isAce) => (isAce
  ? `${team.name}的王牌——${team.ace.title}`
  : `${team.name}・${{ setter: '二傳', outside: '主攻', middle: '攔中', opposite: '對角', libero: '自由人' }[role]}`);

/**
 * 該職業隊的名冊成員（6 先發＋自由人，共 7 人）。**純函式、決定論**。
 * 玩家不在裡面（玩家存 `save.player`）——批 2 的 enterPro RMW 會由
 * `defaultLineup` 把他排進自己的位置。
 */
export function buildProMembers(teamId) {
  const team = proTeamById(teamId);
  if (!team) return [];
  const members = team.squad.map((fullName, i) => {
    const role = ROLE_ORDER[i];
    const isAce = team.ace?.slot === i;
    return {
      id: `P${i + 1}`,
      name: fullName,
      fullName,
      origin: `pro:${team.id}`,
      role,
      height: team.heights[i],
      ...(isAce ? { title: team.ace.title } : {}),
      attributes: attributesFor(team, role, i),
      growth: { grade: team.grades[i], xp: {}, log: [] },
      dna: { teamId: team.id, style: team.style, tag: team.name },
      persona: personaOf(team, role, isAce),
    };
  });
  const liberoAce = team.ace?.slot === 'L';
  members.push({
    id: 'PL',
    name: team.libero,
    fullName: team.libero,
    origin: `pro:${team.id}`,
    role: 'libero',
    height: Math.min(...team.heights) - 0.08,
    ...(liberoAce ? { title: team.ace.title } : {}),
    attributes: attributesFor(team, 'libero', 'L'),
    growth: { grade: team.liberoGrade, xp: {}, log: [] },
    dna: { teamId: team.id, style: team.style, tag: team.name },
    persona: personaOf(team, 'libero', liberoAce),
  });
  return members;
}
