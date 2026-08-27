// 海外建隊（國外聯賽卷 批 1，2026-08-27）——你被挖去那支海外隊，隊友換成那支隊的人。
//
// ★ 與 `proTeam.js` 同形（同構驗收：輸出欄位鍵集合逐一相同）★ 屬性走既有座標系
// `level + attrBias + roleBias`——與 `buildOpponentTeam`、`buildUniMembers`、
// `buildCorpMembers`、`buildProMembers` 同一條公式。另造一套換算等於同名不同義
// （`02 §6.1` 第 2 條）。
//
// ★ 隊友 clamp 上限與國內不同（`FOREIGN_TEAMMATE_CAP = 90`，國內 85）★ 卷宗§一地基
// 盤點：對手側資料流不套 `applySeasonRoster`，併 BY_ID 後海外對手 level 直接生效
// （92-95）；對手側屬性不 clamp，隊友側若沿用國內 85 的上限，玩家轉入海外隊後隊友
// 85 對上對手 94+ 是結構性挨打——不是平衡題，是護欄設定錯座標。放寬到 90 仍低於
// 主角傳奇上限 100（`ROSTER_GROWTH.ATTR_CAP` 檔頭 2026-08-27 註記的例外），主角感
// 護欄仍在，只是海外章節的地板抬高。
//
// 兩處刻意差異也照抄職業版（`proTeam.js` 檔頭原封適用）：
//   ① 隊友 clamp 到 `FOREIGN_TEAMMATE_CAP`（90）與地板 30；對手側不 clamp。
//   ② 王牌 +4 是建隊側自訂；對手側走 `aceAttrBonus ?? 0`。
//
// ★ growth.grade 在海外章＝在隊年資 ★（同 proTeams.js／corporations.js 檔頭語意）。
// 批 1 只有一年、不跑任何畢業/換血邏輯。
//
// ★ `proStartTrustFor` 不複製 ★（卷宗§一）：tier 重用讓國內那顆 `proStartTrustFor`
// （`proTeam.js`）天然可用——批 2 呼叫端直接沿用，不必另建一份海外版。
//
// 驗收＝`docs/kickoffs/acceptance-foreign-batch1.md`（F1-9）。
import { ATTRIBUTE_KEYS } from '../sim/player.js';
import { foreignTeamById } from './foreignTeams.js';
import { UNI_ROLE_ORDER } from './uniTeam.js';

// 槽序＝大學/企業/職業共用的同一份（`uniTeam.js` export 的單一事實來源）——別再抄一份。
const ROLE_ORDER = UNI_ROLE_ORDER;

// 隊友「自然成長」天花板——見檔頭：對手側不 clamp、海外對手 level 94+，隊友不放寬
// 會結構性挨打。仍低於主角傳奇上限（100），主角感護欄不破。
export const FOREIGN_TEAMMATE_CAP = 90;

function attributesFor(team, role, i) {
  const attrs = {};
  const isAce = team.ace?.slot === i;
  for (const k of ATTRIBUTE_KEYS) {
    const raw = team.level + (team.attrBias?.[k] ?? 0) + (team.roleBias?.[role]?.[k] ?? 0)
      + (isAce ? 4 : 0);
    attrs[k] = Math.max(30, Math.min(FOREIGN_TEAMMATE_CAP, raw));
  }
  return attrs;
}

const personaOf = (team, role, isAce) => (isAce
  ? `${team.name}的王牌——${team.ace.title}`
  : `${team.name}・${{ setter: '二傳', outside: '主攻', middle: '攔中', opposite: '對角', libero: '自由人' }[role]}`);

/**
 * 該海外隊的名冊成員（6 先發＋自由人，共 7 人）。**純函式、決定論**。
 * 玩家不在裡面（玩家存 `save.player`）——批 2 的 enterForeign RMW 會由
 * `defaultLineup` 把他排進自己的位置。
 */
export function buildForeignMembers(teamId) {
  const team = foreignTeamById(teamId);
  if (!team) return [];
  const members = team.squad.map((fullName, i) => {
    const role = ROLE_ORDER[i];
    const isAce = team.ace?.slot === i;
    return {
      id: `F${i + 1}`,
      name: fullName,
      fullName,
      origin: `foreign:${team.id}`,
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
    id: 'FL',
    name: team.libero,
    fullName: team.libero,
    origin: `foreign:${team.id}`,
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
