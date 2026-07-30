// Phase 4 W1 — 畢業與新生（時間系統資料流；純函式，零 three.js/DOM，node 可測）
// 憲法依據：Q1（年級回填/畢業）、Q2（混合制新生：手寫＋程序生成補位員）。
// 流程掛點：careerStore.advanceSeason（單次 RMW：畢業→年級推進→新生入學→重排預設陣）；
// 儀式/播報的台詞層在 events.js（graduationCeremonyLines / freshmenIntroLines）。
// 決定論：新生名字與屬性由「下一屆種子 × 固定字串」FNV-1a 導出——同存檔重演逐值一致。
// 2026-07-30 試玩回饋 P2：屆末換血鏈擴為「畢業 → 等候名單遞補（P2②）→ 來投保底（P2①）
// → 新生入學」；等候者與來投者的屬性水位補正沿用招募生同一條公式（rosterUplift）。
import { rosterUplift } from './recruitment.js';

// ---- 年級推進與畢業判定 ----

// 三年級季末畢業（member.growth.grade＝現行年級；賽季推進時由本檔 +1）。
// 功能核心保護不在此硬編——由 STARTER_DEFS 年級拍板保證（阿哲/小守=1 年級）。
export function splitGraduates(members) {
  const graduates = [];
  const remaining = [];
  for (const m of members ?? []) {
    ((m.growth?.grade ?? 2) >= 3 ? graduates : remaining).push(m);
  }
  return { graduates, remaining };
}

// 倖存者全員年級 +1（不可變；上限 3——資料流保證下屆季末必畢業，不產生四年級）
export function promoteMembers(members) {
  return (members ?? []).map((m) => ({
    ...m,
    growth: { ...m.growth, grade: Math.min(3, (m.growth?.grade ?? 2) + 1) },
  }));
}

// ---- 手寫新生（Q2：每屆 1 名具名，位置呼應該屆畢業者）----

// 第 2 屆：MB——接班大山（「前輩的影子」）。人設 2026-07-26 Sawmah 拍板＝B 案叛逆型
// 「拆牆的人」雷紹齊（三案見 phase4-w1-status §4；id N1 不變＝存檔穩定）。
// 支線鉤子（W2+ 展開）：用整個賽季對抗前輩的影子，最後發現「反著學」也是被影子
// 定義的一種——真正的自由是承認自己學過他。
// 第 3 屆：L（自由人）——核心題「不能得分的人怎麼證明自己」。人設 2026-07-27
// Sawmah 拍板＝B 案「不落地教」紀慕白（三案全文與落選案 A 溫以恆/C 高承嶽存
// phase4-w3-status.md §7 備查；C 案兄弟對決概念移植入 W4「世界觀大戲軸」）。
// 支線劇情接線＝另輪（甲3② 拍板：本輪只落資料）。
export const FRESHMAN_HANDWRITTEN = {
  2: {
    id: 'N1', name: '小雷', fullName: '雷紹齊', role: 'middle', height: 1.93,
    persona: '拒絕當第二個大山——嘴上說老派攔網過時了，置物櫃裡卻收著大山那屆的比賽剪報',
    attributes: { jump: 61, power: 57, reaction: 56, stamina: 59, speed: 54, control: 58, serve: 51, block: 63 },
  },
  3: {
    id: 'N2', name: '小白', fullName: '紀慕白', role: 'libero', height: 1.60,
    persona: '球不落地就還沒輸——這不是戰術是信仰；膝蓋常年瘀青但從不提，連敗更衣室裡最響的一句話是他說的',
    attributes: { jump: 40, power: 40, reaction: 64, stamina: 74, speed: 62, control: 62, serve: 30, block: 30 },
  },
};

// ---- 程序生成補位員（Q2：每屆 1-2 名；字族抽名＝從策劃名池決定論抽取）----

// 遊隼新生名池（命名工程慣例：台灣自然名；我方不走單一字族——名池即我方的「字族」。
// 全名全域唯一由 tests/naming 靜態把關；暱稱=「小＋名末字」，末字經挑選不與現役撞）
export const FRESHMAN_NAME_POOL = [
  '賴以樂', '徐子謙', '陳冠廷', '張允誠', '黃立群', '蘇志偉', '林士堯', '游秉睿',
];

// 位置屬性模板（總和 ~450：新生比創隊班底 ~490 生澀；一年級成長率 1.0＝空間大）
const FRESHMAN_ATTRS = {
  setter: { jump: 54, power: 52, reaction: 58, stamina: 58, speed: 58, control: 66, serve: 55, block: 50 },
  outside: { jump: 58, power: 57, reaction: 57, stamina: 58, speed: 60, control: 59, serve: 54, block: 50 },
  middle: { jump: 60, power: 56, reaction: 54, stamina: 57, speed: 52, control: 57, serve: 50, block: 62 },
  opposite: { jump: 58, power: 62, reaction: 54, stamina: 57, speed: 55, control: 56, serve: 58, block: 52 },
  libero: { jump: 40, power: 40, reaction: 66, stamina: 70, speed: 64, control: 64, serve: 30, block: 30 },
};
const FRESHMAN_HEIGHTS = { setter: 1.80, outside: 1.84, middle: 1.92, opposite: 1.87, libero: 1.70 };

// FNV-1a（與 careerState.matchSeed 同慣例）
function hash32(seed, str) {
  let h = ((seed >>> 0) ^ 0x811c9dc5) >>> 0;
  for (const ch of String(str)) {
    h = (h ^ ch.codePointAt(0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// 名冊＋玩家的位置覆蓋需求（合法 5-1 先發＋自由人；玩家佔一席 OH）。
// 回傳各角色缺額——程序補位員按缺額生成（「補位員」顧名思義：先補到能排出合法陣）
const FIELD_NEED = { setter: 1, outside: 2, middle: 2, opposite: 1, libero: 1 };
export function roleDeficits(members, playerRole = 'outside') {
  const have = { setter: 0, outside: 0, middle: 0, opposite: 0, libero: 0 };
  have[playerRole] += 1;
  for (const m of members ?? []) if (have[m.role] !== undefined) have[m.role] += 1;
  const out = {};
  for (const [role, need] of Object.entries(FIELD_NEED)) {
    if (have[role] < need) out[role] = need - have[role];
  }
  return out;
}

// G 前綴 id 序號（比照 nextRecruitId：掃現役∪校友取最大號＋1；id 不回收）
function nextFreshmanId(members, alumni) {
  const ids = [
    ...(members ?? []).map((m) => m.id),
    ...(alumni ?? []).map((a) => a.member?.id),
  ];
  let max = 0;
  for (const id of ids) {
    const m = /^G(\d+)$/.exec(id ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

// 名池決定論抽名：依 hash(seed, 名字) 排序、取未用者；池竭＝「新生N」退化名（防呆）
function drawName(seed, usedNames, n) {
  const ranked = [...FRESHMAN_NAME_POOL]
    .filter((name) => !usedNames.has(name))
    .sort((a, b) => hash32(seed, `frosh:${a}`) - hash32(seed, `frosh:${b}`));
  return ranked[0] ?? `新生${n}`;
}

const jitter = (seed, key) => (hash32(seed, key) % 5) - 2;

// 程序生成一名補位員（種子決定論：同種子同新生）
function buildGeneratedFreshman({ seed, role, id, fullName }) {
  const attributes = {};
  for (const [k, v] of Object.entries(FRESHMAN_ATTRS[role] ?? FRESHMAN_ATTRS.outside)) {
    attributes[k] = v + jitter(seed, `frosh:${id}:${k}`);
  }
  return {
    id,
    name: `小${fullName.at(-1)}`,
    fullName,
    origin: 'generated',
    role,
    height: (FRESHMAN_HEIGHTS[role] ?? 1.84) + jitter(seed, `frosh:${id}:h`) / 100,
    attributes,
    growth: { grade: 1, xp: {}, log: [] },
    dna: { teamId: 'A', style: 'balanced', tag: '新生' },
    persona: '補位的新生——還沒有故事，故事要自己打出來',
  };
}

// 依 wanted 角色清單逐名生成補位員（buildFreshmen／buildDeficitFillIns 共用核心；
// gn 序與抽名節奏維持 W1 原樣＝既有存檔決定論不動）
function generateFillIns({ seed, wanted, members, alumni, used }) {
  let gn = nextFreshmanId(members, alumni);
  const out = [];
  for (const role of wanted) {
    const id = `G${gn}`;
    gn += 1;
    const fullName = drawName(seed + gn, used, gn);
    used.add(fullName);
    out.push(buildGeneratedFreshman({ seed, role, id, fullName }));
  }
  return out;
}

// 該屆新生名單（手寫＋程序補位員）。seasonIndex＝新的一屆；members＝畢業移除＋
// 年級推進後的現役名冊；usedNames＝現役＋校友全名（避免撞名；跨隊唯一由名池策劃保證）；
// alumni＝校友清單（G id 不回收掃描＋手寫新生防重入——畢業過的具名新生不再入隊）
export function buildFreshmen({ seasonIndex, seed, members, usedNames, alumni = [], playerRole = 'outside' }) {
  const used = new Set(usedNames ?? []);
  const freshmen = [];
  const hand = FRESHMAN_HANDWRITTEN[seasonIndex];
  const idTaken = (id) => (members ?? []).some((m) => m.id === id)
    || (alumni ?? []).some((a) => a.member?.id === id);
  if (hand && !idTaken(hand.id)) {
    freshmen.push({
      ...hand,
      origin: 'handwritten',
      attributes: { ...hand.attributes },
      growth: { grade: 1, xp: {}, log: [] },
      dna: { teamId: 'A', style: 'balanced', tag: '新生' },
    });
  }
  // 補位員按缺額生成（含手寫新生後重算）；無缺額也補 1 名（Q2「每屆 1-2 名」的下限
  // ——新血是時間流動的體感，不是只有缺人才招生）
  const deficits = roleDeficits([...(members ?? []), ...freshmen], playerRole);
  const wanted = [];
  for (const [role, n] of Object.entries(deficits)) {
    for (let i = 0; i < n; i += 1) wanted.push(role);
  }
  if (wanted.length === 0 && freshmen.length === 0) wanted.push('outside');
  freshmen.push(...generateFillIns({ seed, wanted, members, alumni, used }));
  return freshmen;
}

// W3(P4) 轉位補位員：玩家屆間轉位後名冊出現角色缺額（如轉 S 後 OH 只剩一人）——
// 按缺額程序生成補位入隊（憲法縫隙 1「被取代者=補位員或招募生」／甲3① MB 洞先例）。
// 與 buildFreshmen 同素材同決定論；差異＝無手寫新生、無「至少 1 名」下限（無缺額＝空陣列）。
export function buildDeficitFillIns({ seed, members, usedNames, alumni = [], playerRole = 'outside' }) {
  const used = new Set(usedNames ?? []);
  const deficits = roleDeficits(members, playerRole);
  const wanted = [];
  for (const [role, n] of Object.entries(deficits)) {
    for (let i = 0; i < n; i += 1) wanted.push(role);
  }
  return generateFillIns({ seed, wanted, members, alumni, used });
}

// ---- P2① 來投保底（試玩回饋 0730 §三 P2 二次拍板）----
// 本屆零招募入隊＝屆末補一名「主動來投」的球員。敘事口徑＝**看了你們的比賽慕名而來**，
// 不是挖角成功——挖角條件表與勝場門檻一行未動（沒達標就是沒挖到，誠實維持）。
// 素材沿用本檔既有的新生生成管線（同名池、同屬性模板、同 hash 決定論），差異三處：
//   ①origin='walkon'（隊友卡與台詞層可辨；不進 recruitment.recruited）
//   ②位置＝名冊最薄的一格（來投者補你最缺的洞——第三屆板凳歸零的病根，見 P1）
//   ③屬性以「隊伍平均」為底線（uplift 只補不砍，沿用招募生入隊補正 W6 同一條公式）
//     ——否則第 3 屆來投的人一進來就是棄子，保底變安慰獎
export const WALKON_PERSONA = '看了你們的比賽自己找上門的——把袋子放下就問「還缺人嗎」';

// 名冊最薄的一格：以 FIELD_NEED 為基準取 (have − need) 最小者；同值取 FIELD_NEED
// 表序（決定論）。自由人不列入（自由人體系走 lineup.libero，來投補場上位置）
export function thinnestRole(members, playerRole = 'outside') {
  const have = { setter: 0, outside: 0, middle: 0, opposite: 0, libero: 0 };
  if (have[playerRole] !== undefined) have[playerRole] += 1;
  for (const m of members ?? []) if (have[m.role] !== undefined) have[m.role] += 1;
  let best = null;
  for (const [role, need] of Object.entries(FIELD_NEED)) {
    if (role === 'libero') continue;
    const slack = have[role] - need;
    if (best === null || slack < best.slack) best = { role, slack };
  }
  return best?.role ?? 'outside';
}

// W 前綴 id（比照 nextRecruitId／nextFreshmanId：掃現役∪校友最大號＋1，id 不回收）
function nextWalkOnId(members, alumni) {
  const ids = [
    ...(members ?? []).map((m) => m.id),
    ...(alumni ?? []).map((a) => a.member?.id),
  ];
  let max = 0;
  for (const id of ids) {
    const m = /^W(\d+)$/.exec(id ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `W${max + 1}`;
}

// 生成來投者（決定論：同種子＋同名冊＝同一個人）
export function buildWalkOn({
  seed, members, usedNames, alumni = [], playerRole = 'outside',
}) {
  const used = new Set(usedNames ?? []);
  const role = thinnestRole(members, playerRole);
  const id = nextWalkOnId(members, alumni);
  const fullName = drawName(seed + hash32(seed, `walkon:${id}`) % 97, used, id);
  const base = FRESHMAN_ATTRS[role] ?? FRESHMAN_ATTRS.outside;
  const uplift = rosterUplift(members, base); // 只補不砍（W6 招募入隊補正同一條公式）
  const attributes = {};
  for (const [k, v] of Object.entries(base)) {
    attributes[k] = v + uplift + jitter(seed, `walkon:${id}:${k}`);
  }
  return {
    id,
    name: `小${fullName.at(-1)}`,
    fullName,
    origin: 'walkon',
    role,
    height: (FRESHMAN_HEIGHTS[role] ?? 1.84) + jitter(seed, `walkon:${id}:h`) / 100,
    attributes,
    growth: { grade: 1, xp: {}, log: [] },
    dna: { teamId: 'A', style: 'balanced', tag: '來投' },
    persona: WALKON_PERSONA,
  };
}

// ---- 賽季換血（畢業 → 等候遞補 → 來投保底 → 年級推進 → 新生入學；單一純函式供 store RMW 消費）----

// seasonIndex＝剛結束的屆；seed＝下一屆種子（advanceSeason 已決定論衍生）。
// 校友（alumni）：畢業者完整快照＋屆數——①擋還魂（careerMatchSetup 除名清單）
// ②W4 生涯結算素材 ③id 不回收掃描。capacity 不變（12）。
// W2(P4) 隊長交接（拍板：阿哲正式接任）：換血後名冊無人帶 captain 旗標（大山 A3
// 第 1 屆末畢業）→ 落給阿哲（A1）；A1 缺席（理論上不會——創隊班底不可逐）＝首位
// 非自由人遞補防呆。交接台詞在畢業儀式鏈（events.js graduationCeremonyLines）。
function ensureCaptain(members) {
  if (members.some((m) => m.captain)) return members;
  const heirId = members.some((m) => m.id === 'A1')
    ? 'A1'
    : members.find((m) => m.role !== 'libero')?.id;
  return members.map((m) => (m.id === heirId ? { ...m, captain: true } : m));
}

// waiting／buildWaitingMember（P2②）：等候名單鍵序＋逐鍵生成器（由 store 注入——
//   本檔不 import store 也不碰 recruitKey 語意）；回 null＝該線已作廢（目標畢業）。
// walkOn（P2①）：本屆零招募入隊＝true，屆末補一名來投者；**等候名單這次有人遞補
//   進來就不補**（挖角的人到了，只是慢了一屆——保底是「一個都沒來」的兜底）。
// 順序拍板（等候者在新生之前）：畢業騰出的空位先給達標的等候者，補位新生按「剩餘缺額」
//   生成——反過來的話程序新血會先把空位吃掉、等候者又被擠到下一屆（P2② 修的正是這件事）。
//   手寫新生（故事角色）另留一席，不被等候者/來投者擠掉。
export function applySeasonTurnover({
  roster, seasonIndex, seed, playerRole = 'outside',
  waiting = [], buildWaitingMember = null, walkOn = false,
}) {
  const { graduates, remaining } = splitGraduates(roster.members);
  const promoted = promoteMembers(remaining);
  const alumni = [
    ...(roster.alumni ?? []),
    ...graduates.map((member) => ({ member, seasonIndex })),
  ];
  const nextIndex = seasonIndex + 1;
  const capacity = roster.capacity ?? 12;
  const hand = FRESHMAN_HANDWRITTEN[nextIndex];
  const handTaken = !!hand && [...promoted, ...alumni.map((a) => a.member)]
    .some((m) => m?.id === hand.id);
  const reserved = hand && !handTaken ? 1 : 0; // 手寫新生保留席
  const members = [...promoted];
  // 名冊現員＝members＋玩家 1 席（roster.rosterCount 同語意；本檔不 import roster 避免循環）
  const freeSlots = () => capacity - (members.length + 1) - reserved;
  // ① 等候名單遞補（優先於新生）
  const admitted = [];
  const admittedKeys = [];
  if (buildWaitingMember) {
    for (const key of waiting) {
      if (freeSlots() <= 0) break;
      const m = buildWaitingMember(key, members, alumni);
      if (!m) continue; // 目標已畢業＝這條線關閉（作廢時點由呼叫端的 recruitTargetGone 判）
      members.push(m);
      admitted.push(m);
      admittedKeys.push(key);
    }
  }
  // ② 來投保底（零招募且無人遞補時）
  let walkOnMember = null;
  if (walkOn && admitted.length === 0 && freeSlots() > 0) {
    walkOnMember = buildWalkOn({
      seed,
      members,
      usedNames: [...members, ...alumni.map((a) => a.member)]
        .map((m) => m?.fullName).filter(Boolean),
      alumni,
      playerRole,
    });
    members.push(walkOnMember);
  }
  // ③ 新生入學（缺額由 ①② 之後的名冊重算——等候者補上的洞不會再生一個補位員）
  const usedNames = [
    ...members.map((m) => m.fullName),
    ...alumni.map((a) => a.member?.fullName),
  ].filter(Boolean);
  const freshmen = buildFreshmen({
    seasonIndex: nextIndex,
    seed,
    members,
    usedNames,
    alumni,
    playerRole,
  });
  return {
    roster: { ...roster, members: ensureCaptain([...members, ...freshmen]), alumni },
    graduates,
    freshmen,
    admitted,
    admittedKeys,
    walkOn: walkOnMember,
  };
}
