// 大學屆間換血（大二卷 批 1，2026-08-25）——季末：大四離隊、其餘升一級、
// 每個離隊者補一名同位置的決定論新生。
//
// ★ 為什麼不重用 graduation.js 的 applySeasonTurnover ★ 高中版綁死三件事：
// 畢業判準 grade===3、FRESHMAN_HANDWRITTEN 手寫新生表（按全域屆數）、隊長交接
// （A1 阿哲）＋招募等候/來投保底整條鏈。大學拍板（uni-year2-kickoff 題 4/5）＝
// 沒有招募系統、新生全決定論生成 ⇒ 另寫專用模組，高中那份一行不動（卷宗慣例）。
//
// ★ 拍板（2026-08-25 題 4 乙）★ 只有玩家隊換血；他校名冊靜態（顯示層換年級標示）。
// 大二季末原高三舊識（大四）的畢業**送別演出**是批 4——本檔只管名冊機制。
//
// 驗收＝`docs/kickoffs/acceptance-uni-y2-batch1.md`（B1-3）。
import { ATTRIBUTE_KEYS } from '../sim/player.js';
import { ROSTER_GROWTH } from './roster.js';
import { universityById } from './universities.js';
import { UNI_ROLE_ORDER } from './uniTeam.js';

export const UNI_GRADUATE_GRADE = 4; // 大學四年制：季末 grade 4 離隊

// 決定論新生名字池（純內容，與高中池不重疊；夠四年輪替 3×4=12 人上下，
// 池 24 人＋雜湊起點，重名由 usedNames 過濾兜底）
const FRESHMAN_NAMES = [
  '林昱棠', '陳冠宇', '張哲瑋', '黃士恩', '李承曄', '吳定謙', '劉育丞', '蔡明軒',
  '許博硯', '鄭宇翔', '謝沛橙', '洪振嘉', '郭曜輔', '曾繁光', '賴俊毅', '周天磊',
  '葉家豪', '蘇之勤', '呂紹齊', '江秉澤', '何啟光', '沈駿一', '范植鈞', '施敦皓',
];

// FNV-1a：seed 混字串——與 careerState.matchSeed 同款手法（決定論、同輸入同輸出）
function hashWith(seed, s) {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (const ch of String(s)) {
    h = (h ^ ch.codePointAt(0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// 新生屬性：走 uniTeam 同一條座標系（level + biases，clamp 30..ATTR_CAP），
// 但新生未成熟＝基準 −3（別另造換算——02 §6.1 第 2 條「同名不同義」）
function freshmanAttributes(school, role, seed, name) {
  const attrs = {};
  for (const k of ATTRIBUTE_KEYS) {
    const jitter = hashWith(seed, `${name}:${k}`) % 3; // 0..2 決定論擾動
    const raw = school.level - 3 + (school.attrBias?.[k] ?? 0)
      + (school.roleBias?.[role]?.[k] ?? 0) + jitter - 1;
    attrs[k] = Math.max(30, Math.min(ROSTER_GROWTH.ATTR_CAP, raw));
  }
  return attrs;
}

// 該校資料表上這個位置的身高（校格座標系）：先發槽照 UNI_ROLE_ORDER 對照
// school.heights；自由人＝min(heights)−0.08（與 buildUniMembers 同一條式，別分岔）
function schoolRoleHeights(school, role) {
  if (role === 'libero') return [Math.min(...school.heights) - 0.08];
  return UNI_ROLE_ORDER
    .map((r, i) => (r === role ? school.heights[i] : null))
    .filter((h) => Number.isFinite(h));
}

// 新生身高：同校同位置在隊者的平均 −0.02（學弟略生嫩）＋決定論 ±0.02 擾動。
// ★同位置無人是**常態路徑**，不是邊界★（批 1 覆審 MEDIUM 實測）：每校自由人
// 只有一人，畢業即空；hanchi-sport/haiyan/chengguang 第 3 年也各有位置整組畢業
// ⇒ fallback 退到**該校資料表**的同位置身高（校格座標系），不是通用 1.80——
// 否則北陵（1.84–2.00）補進來的新生會跟弱校一樣高。
function freshmanHeight(school, members, role, seed, name) {
  const peers = members
    .filter((m) => m.role === role && Number.isFinite(m.height))
    .map((m) => m.height);
  const pool = peers.length ? peers : schoolRoleHeights(school, role);
  const base = pool.length
    ? pool.reduce((a, h) => a + h, 0) / pool.length - 0.02
    : 1.8; // 資料表本身壞掉的最後兜底（正常資料到不了）
  const jitter = ((hashWith(seed, `h:${name}`) % 5) - 2) / 100; // −0.02..+0.02
  return Math.round((base + jitter) * 100) / 100;
}

const ROLE_LABEL = {
  setter: '二傳', outside: '主攻', middle: '攔中', opposite: '對角', libero: '自由人',
};

/**
 * 大學屆間換血。純函式、決定論（同 seed 同輸出）。
 * @param roster      `save.roster`（大學名冊：buildUniMembers 產物＋可能的歷屆新生）
 * @param schoolId    就讀學校 id（新生屬性/身高吃該校座標系）
 * @param seasonIndex 結束的這一屆全域屆數（alumni 記錄用）
 * @param seed        下一屆種子（呼叫端先 deriveSeasonSeed 再傳入——與賽程同一顆）
 * @returns { roster, graduates, freshmen }；學校解不開＝原 roster 原樣回（不猜）
 */
export function uniSeasonTurnover({ roster, schoolId, seasonIndex, seed }) {
  const school = universityById(schoolId);
  const members = roster?.members ?? [];
  if (!school) return { roster, graduates: [], freshmen: [] };
  const graduates = members.filter((m) => (m.growth?.grade ?? 1) >= UNI_GRADUATE_GRADE);
  const promoted = members
    .filter((m) => (m.growth?.grade ?? 1) < UNI_GRADUATE_GRADE)
    .map((m) => ({ ...m, growth: { ...m.growth, grade: (m.growth?.grade ?? 1) + 1 } }));
  const alumni = [
    ...(roster.alumni ?? []),
    ...graduates.map((member) => ({ member, seasonIndex })),
  ];
  const usedNames = new Set(
    [...promoted, ...alumni.map((a) => a.member)].map((m) => m?.fullName).filter(Boolean),
  );
  const freshmen = graduates.map((gone, i) => {
    const role = gone.role;
    // 名字：雜湊起點起輪詢，跳過重名（池 24 人、在隊+校友有限 ⇒ 必有可用名）
    let pick = null;
    const start = hashWith(seed, `f:${seasonIndex}:${i}:${role}`) % FRESHMAN_NAMES.length;
    for (let step = 0; step < FRESHMAN_NAMES.length; step += 1) {
      const cand = FRESHMAN_NAMES[(start + step) % FRESHMAN_NAMES.length];
      if (!usedNames.has(cand)) { pick = cand; break; }
    }
    pick = pick ?? `新生${seasonIndex}-${i + 1}`; // 池整個用盡的兜底（理論上到不了）
    usedNames.add(pick);
    return {
      id: `UF${seasonIndex}-${i + 1}`, // 離隊者 id 不回收（高中 R id 同慣例）
      name: pick,
      fullName: pick,
      origin: `uni:${school.id}:freshman`,
      role,
      height: freshmanHeight(school, promoted, role, seed, pick),
      attributes: freshmanAttributes(school, role, seed, pick),
      growth: { grade: 1, xp: {}, log: [] },
      joinedSeason: seasonIndex + 1,
      dna: { teamId: school.id, style: school.style, tag: school.name },
      persona: `${school.name}・新生${ROLE_LABEL[role] ?? role}`,
    };
  });
  return {
    roster: { ...roster, members: [...promoted, ...freshmen], alumni },
    graduates,
    freshmen,
  };
}
