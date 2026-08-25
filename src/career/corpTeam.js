// 企業建隊（成人/企業章 批 1，2026-08-25）——你簽了那家公司，隊友換成那支企業隊的人。
//
// ★ 與 `uniTeam.js` 同形（A1-5 凍結：輸出欄位鍵集合逐一相同）★
// 屬性走既有座標系 `level + attrBias + roleBias`（與 `buildOpponentTeam`、
// `buildUniMembers` 同一條公式）——另造一套換算等於同名不同義（`02 §6.1` 第 2 條）。
// 兩處刻意差異也照抄大學版（`uniTeam.js:11-17` 的說明原封適用）：
//   ① 隊友 clamp 到 `ROSTER_GROWTH.ATTR_CAP`（85）與地板 30；對手側不 clamp。
//   ② 王牌 +4 是建隊側自訂；對手側走 `aceAttrBonus ?? 0`。
//
// ★ growth.grade 在企業章＝在隊年資 ★（`corporations.js` 檔頭）。階段一只有一年，
// 不跑任何畢業/換血邏輯——uniTurnover 的 grade 判準不會碰到這批成員。
//
// 驗收＝`docs/kickoffs/acceptance-corp-batch1.md`（A1-5）。
import { ATTRIBUTE_KEYS } from '../sim/player.js';
import { ROSTER_GROWTH } from './roster.js';
import { corporationById } from './corporations.js';
import { UNI_ROLE_ORDER, UNI_START_TRUST } from './uniTeam.js';
import { TIER } from './admission.js';

// 槽序＝大學同一份（`uniTeam.js` export 的單一事實來源）——別再抄一份。
const ROLE_ORDER = UNI_ROLE_ORDER;

// 各隊階的玩家起始球權：沿用大學的表（tier 鍵相同、機制相同——強豪從保底 27 起、
// 保底隊你就是王牌）。★同一份常數，不另抄數字★ 要分岔（企業起點該不該更低）
// 是試玩後的平衡題，到時再在這裡換表。
export function corpStartTrustFor(corp) {
  return UNI_START_TRUST[corp?.tier] ?? UNI_START_TRUST[TIER.MID];
}

function attributesFor(corp, role, i) {
  const attrs = {};
  const isAce = corp.ace?.slot === i;
  for (const k of ATTRIBUTE_KEYS) {
    const raw = corp.level + (corp.attrBias?.[k] ?? 0) + (corp.roleBias?.[role]?.[k] ?? 0)
      + (isAce ? 4 : 0);
    attrs[k] = Math.max(30, Math.min(ROSTER_GROWTH.ATTR_CAP, raw));
  }
  return attrs;
}

const personaOf = (corp, role, isAce) => (isAce
  ? `${corp.name}的王牌——${corp.ace.title}`
  : `${corp.name}・${{ setter: '二傳', outside: '主攻', middle: '攔中', opposite: '對角', libero: '自由人' }[role]}`);

/**
 * 該企業隊的名冊成員（6 先發＋自由人，共 7 人）。**純函式、決定論**。
 * 玩家不在裡面（玩家存 `save.player`）——批 2 的 enterCorporate RMW 會由
 * `defaultLineup` 把他排進自己的位置。
 */
export function buildCorpMembers(corpId) {
  const corp = corporationById(corpId);
  if (!corp) return [];
  const members = corp.squad.map((fullName, i) => {
    const role = ROLE_ORDER[i];
    const isAce = corp.ace?.slot === i;
    return {
      id: `C${i + 1}`,
      name: fullName,
      fullName,
      origin: `corp:${corp.id}`,
      role,
      height: corp.heights[i],
      ...(isAce ? { title: corp.ace.title } : {}),
      attributes: attributesFor(corp, role, i),
      growth: { grade: corp.grades[i], xp: {}, log: [] },
      dna: { teamId: corp.id, style: corp.style, tag: corp.name },
      persona: personaOf(corp, role, isAce),
    };
  });
  const liberoAce = corp.ace?.slot === 'L';
  members.push({
    id: 'CL',
    name: corp.libero,
    fullName: corp.libero,
    origin: `corp:${corp.id}`,
    role: 'libero',
    height: Math.min(...corp.heights) - 0.08,
    ...(liberoAce ? { title: corp.ace.title } : {}),
    attributes: attributesFor(corp, 'libero', 'L'),
    growth: { grade: corp.liberoGrade, xp: {}, log: [] },
    dna: { teamId: corp.id, style: corp.style, tag: corp.name },
    persona: personaOf(corp, 'libero', liberoAce),
  });
  return members;
}
