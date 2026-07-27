// Phase 3 W2 — 名冊系統（純函式＋store 介面卡；零 three.js/DOM，node 可測）
// save.roster.members[] 元素形狀（schema v2 註解定案）：
//   { id, name, origin, role, attributes, growth, dna }
//   ＋本週補充欄位：height（建隊用）、captain（隊長標記，D3：隊長必為 MB）
// capacity 語義（D1 拍板；W5 10→12）：12＝玩家 1＋自由人 1＋隊友 10；現有成員 7 →
//   招募空位 5（＝全招募池 5 隊，W5 剛好容納；逐出=為想要的人騰位的戰略選擇，非空位管理）
// DNA（D2/任務2）：描述性標記——記錄「原隊參數傾向」，只影響屬性生成與 UI 展示，
//   不得直接進 sim 決策（比賽行為一律走 member.attributes → createPlayer 既有參數路徑）
import { buildLibero } from './careerState.js';
import { GROWABLE_ATTRS, matchStatsFor } from './growth.js';
import { defaultLineup, validateLineup, checkRoleStructure } from './lineup.js';
import { recruitDefOf } from './recruitment.js';

// ---- 成長模型參數（D2 拍板：表現歸因驅動、新人快老將慢、上限 85）----
export const ROSTER_GROWTH = {
  ATTR_CAP: 85, // 隊友屬性天花板（低於主角的 90——主角感護欄）
  XP_PER_POINT: 2, // 每累積 2 xp 兌換 +1 屬性（餘數留存跨場）
  // 成長率分檔：依年級（資歷）——一年級新人吸收快、三年級老將已近成形
  RATE_BY_GRADE: { 1: 1.0, 2: 0.7, 3: 0.4 },
};

// 表現→xp 歸因表（吃 matchStatsFor 輸出；attr 僅限 GROWABLE_ATTRS——
// control/stamina 不開放，與主角成長同一條邊界）
const XP_RULES = [
  { stat: 'atk', attr: 'power', xp: 1.0 }, // atk＝kills+tipKills（殺球與吊球得分）
  { stat: 'atk', attr: 'jump', xp: 0.5 },
  { stat: 'aces', attr: 'serve', xp: 1.5 },
  { stat: 'blockPoints', attr: 'block', xp: 1.5 },
  { stat: 'blockPoints', attr: 'jump', xp: 0.5 },
  { stat: 'perfects', attr: 'reaction', xp: 0.75 },
  { stat: 'perfects', attr: 'speed', xp: 0.5 },
];

// ---- 具名化名單（D3：預設名單，Sawmah 試玩時逐個改名；隊長必為 MB）----
// 個性化原則（平衡近中性）：每人八屬性總和＝490（與舊「六人全同」基準相同），
// 只重分配不淨增——但 sim 對屬性槓桿非線性（二傳 control／MB block 產出遠高於
// 其 speed/serve），首版 ±8~16 偏移實測把首場勝率推高 11pp（86→97），故偏移
// 全面減半至 ±1~8。實際以 tools/balance-sim.mjs 前後對照驗收，勿只信總和守恆。
// 身高沿用既有基準 [1.83,1.88,1.96,1.90,1.86,1.94]；trust 槽位初值不動（careerTeams 管）。
// 命名工程定案（2026-07-25 kickoff 拍板）：我方＝遊隼高中（創隊雜牌軍，名字各有來歷、
// 不走字族）；name＝隊內暱稱（存檔鍵值＋玩家已熟，不改），fullName＝全名（隊友卡顯示）；
// title＝輕稱號（僅隊長；播報偶爾喊）。名字是預設稿——ensureStarterRoster 不覆蓋已改名
export const OUR_TEAM_NAME = '遊隼高中';
export const STARTER_DEFS = [
  // grade＝入學年級（P4 W1 起接畢業流程：賽季推進 +1、滿三年級季末畢業）。
  // 阿哲=1（2026-07-26 Sawmah 拍板）：三屆全程在隊——縫隙 1 師徒線（玩家轉 S 時
  // 阿哲讓出主舉轉導師，W3 實作）的時間窗不論何屆轉位都成立；成長率隨之 1.0
  { id: 'A1', name: '阿哲', fullName: '林承哲', role: 'setter', grade: 1, height: 1.83,
    persona: '冷靜的組織者——手感細膩，把球送到你最好打的位置',
    attributes: { jump: 58, power: 58, reaction: 63, stamina: 61, speed: 63, control: 72, serve: 61, block: 54 } },
  // A2＝玩家（主攻手槽）——不在 members 裡，計數時佔 1 席（見 rosterCount）
  { id: 'A3', name: '大山', fullName: '高崇山', role: 'middle', grade: 3, height: 1.96, captain: true,
    title: '沉默高牆',
    persona: '隊長。沉默的高牆——三年級最後一個夏天，全押在遊隼身上',
    attributes: { jump: 64, power: 63, reaction: 59, stamina: 60, speed: 58, control: 64, serve: 56, block: 66 } },
  // 阿烈=3（憲法 Q1 第二名畢業者，2026-07-26 Sawmah 拍板）：兩翼台詞量同為零句，
  // 判準落資料一致性——小飛 persona 鎖死一年級成長弧；畢業戰力洞=一中(大山)一翼(阿烈)
  { id: 'A4', name: '阿烈', fullName: '洪振烈', role: 'opposite', grade: 3, height: 1.90,
    persona: '右翼重砲——脾氣跟扣球一樣衝，準度差點但誰都不想正面擋他',
    attributes: { jump: 62, power: 67, reaction: 58, stamina: 61, speed: 60, control: 63, serve: 64, block: 55 } },
  { id: 'A5', name: '小飛', fullName: '葉翊飛', role: 'outside', grade: 1, height: 1.86,
    persona: '一年級的速度型主攻——還很生，但成長空間是全隊最大的',
    attributes: { jump: 62, power: 60, reaction: 63, stamina: 62, speed: 66, control: 65, serve: 59, block: 53 } },
  { id: 'A6', name: '阿岩', fullName: '陳定岩', role: 'middle', grade: 2, height: 1.94,
    persona: '第二中間手——不搶戲的耐力型攔網工兵，教練最信任的輪替',
    attributes: { jump: 62, power: 61, reaction: 60, stamina: 63, speed: 57, control: 65, serve: 57, block: 65 } },
  // A7 替補 OH（W3 07-27 Sawmah 拍板：①第 1 屆就有板凳可換＝主角能下場休息
  // （RECOV_BENCH 快回閉環）＋新玩家第一屆體驗換人 ②grade 2＝第 2 屆末與阿岩同屆
  // 畢業（「替補學長」的告別）③capacity 維持 12＝招募空位 5→4，取捨更緊）。
  // 屬性＝替補級但體力全隊最高——他的職業就是隨時能上
  { id: 'A7', name: '阿遠', fullName: '莊明遠', role: 'outside', grade: 2, height: 1.85,
    persona: '替補主攻——把板凳坐成專業的人：誰累了、誰慌了，他都第一個看見',
    attributes: { jump: 60, power: 59, reaction: 63, stamina: 72, speed: 62, control: 64, serve: 58, block: 52 } },
  { id: 'AL', name: '小守', fullName: '魏守恆', role: 'libero', grade: 1, height: 1.72, libero: true,
    persona: '自由人——個子最小、嗓門最大，球落地前絕不放棄' },
];

// starter 的 DNA＝A 隊基準風格（W4 招募時改填來源隊：teamId=對手 id、
// style/tag 承 opponents.js 的 style/name、bias 承其 level+attrBias 傾向）
const A_TEAM_DNA = { teamId: 'A', style: 'balanced', tag: '創隊班底' };

export function buildStarterMembers() {
  return STARTER_DEFS.map((d) => ({
    id: d.id,
    name: d.name,
    fullName: d.fullName,
    origin: 'starter',
    role: d.role,
    height: d.height,
    ...(d.captain ? { captain: true } : {}),
    ...(d.title ? { title: d.title } : {}),
    // 小守維持 buildLibero 防守專才公式（D3）：初始屬性直接取公式輸出，
    // 之後成長寫回 member.attributes（結構欄位仍由 buildLibero 供給，見 careerState）
    attributes: d.libero
      ? { ...buildLibero('A', d.name).attributes }
      : { ...d.attributes },
    growth: { grade: d.grade, xp: {}, log: [] },
    dna: { ...A_TEAM_DNA },
    persona: d.persona,
  }));
}

// ---- capacity 語義（D1）----

// 名冊現員數＝members（含自由人）＋玩家 1 席（玩家本體存 save.player，不進 members）
export function rosterCount(roster) {
  return (roster?.members?.length ?? 0) + 1;
}

export function openSlots(roster) {
  return Math.max(0, (roster?.capacity ?? 12) - rosterCount(roster));
}

// ---- 空名冊升級路徑（任務4：一次性補齊，不動 player/season）----

// W1 期建立的 v2 存檔 members 是空的——第一次讀到就補具名 starter 隊伍。
// members 非空＝已補齊，永不重建（玩家改過名/已成長的資料不得被蓋掉）。
// 無存檔（快速比賽/未開生涯）→ null，不落任何東西。
// W3：同一段升級邏輯一併補齊/遷移 lineup（starters:null 舊存檔→預設輪轉序＋trust 映射），
// 冪等＝starters 非 null（玩家已排或已補齊）即不覆蓋。
export function ensureStarterRoster(store) {
  const roster = store.loadRoster();
  if (!roster) return null;
  const base = roster.members.length > 0 ? roster.members : buildStarterMembers();
  const members = backfillNames(base); // 命名工程 07-25：舊存檔補 fullName/title
  if (members !== roster.members) store.saveRoster({ ...roster, members });
  ensureLineup(store, members);
  return store.loadRoster();
}

// 命名工程 07-25：既有存檔成員回填 fullName（＋隊長稱號）——顯示層欄位、可安全補。
// 僅在暱稱仍是預設稿時補/刷新（玩家改過名＝尊重不動）；暱稱未動但 fullName 與定稿
// 不符＝v1 命名殘留（同日 v2 台灣自然化改過全名），一併刷新到現行定稿。冪等。
function backfillNames(members) {
  let changed = false;
  const out = members.map((m) => {
    const def = m.origin === 'starter'
      ? STARTER_DEFS.find((d) => d.id === m.id)
      : recruitDefOf(m.recruitKey ?? m.origin);
    if (!def?.fullName || def.name !== m.name) return m;
    if (m.fullName === def.fullName && (!def.title || m.title)) return m;
    changed = true;
    return {
      ...m,
      fullName: def.fullName,
      ...(def.title && !m.title ? { title: def.title } : {}),
    };
  });
  return changed ? out : members;
}

// lineup 補齊/遷移（冪等）：starters 為 null（W1/W2 存檔或建檔中間態）→ 落預設陣容
// （依 members 建 trust 映射）；starters 已存在且合法＝玩家編排或前次補齊，原樣不動。
// 對位防護（拍板 07-23）：對位規則上線前存的衝突陣（或匯入的壞序）→ 重置 starters/
// libero/rotationStart 為預設、保留 trust 映射——治壞陣不 brick 整包存檔。
function ensureLineup(store, members) {
  const lineup = store.loadLineup();
  if (!lineup) return;
  // W3(P4) 轉位：預設陣與對位檢查一律吃玩家現任位置（轉位後舊陣被判非法→重置新對位）
  const playerRole = store.loadPlayer()?.currentRole ?? 'outside';
  if (lineup.starters == null) {
    store.saveLineup(defaultLineup(members, 'A2', playerRole));
    return;
  }
  const ok = validateLineup(lineup, members, 'A2', playerRole).valid // 主角恆 A2（main.js PLAYER_ID）
    && checkRoleStructure(lineup.starters, members, 'A2', playerRole).legal;
  if (!ok) {
    const fresh = defaultLineup(members, 'A2', playerRole);
    const keepTrust = lineup.trust && typeof lineup.trust === 'object' ? lineup.trust : fresh.trust;
    store.saveLineup({ ...fresh, trust: keepTrust });
  }
}

// ---- 自動成長（任務3：賽末結算接線，settleCareerMatch 呼叫）----

// 表現歸因成長：復用主角的 matchStatsFor 管線，逐隊友統計本場事件→xp→屬性。
// 決定論：同事件流＋同名冊→同輸出（無隨機、純算術）；同 matchId 重入＝原樣返回（冪等）。
// W6 修：冪等鍵須含屆數——W5 賽季輪迴後 matchId 每屆重複（group-1…），只認 matchId
// 會讓第二屆起全部隊友成長被誤判「已長過」而靜默跳過（跨屆治具抓到的 W5 潛伏 bug）。
// 舊 log 條目無 season 欄＝第 1 屆（?? 1 回退），season===1 的新條目不寫欄位——
// 第 1 屆行為與序列化逐位不變。
export function applyRosterGrowth(members, events, myTeam, matchId, season = 1) {
  return members.map((m) => {
    if (m.growth.log.some((l) => l.matchId === matchId && (l.season ?? 1) === season)) return m; // 冪等：一屆內一場只長一次
    const s = matchStatsFor(events, m.id, myTeam);
    const rate = ROSTER_GROWTH.RATE_BY_GRADE[m.growth.grade] ?? ROSTER_GROWTH.RATE_BY_GRADE[2];
    const source = { ...s, atk: s.kills + s.tipKills };
    const xp = { ...m.growth.xp };
    for (const r of XP_RULES) {
      const n = source[r.stat] ?? 0;
      if (n > 0) xp[r.attr] = (xp[r.attr] ?? 0) + n * r.xp * rate;
    }
    // xp → 屬性：每 XP_PER_POINT 兌 +1（餘數留存）；達 85 上限後該屬性 xp 歸零不再累積
    const attributes = { ...m.attributes };
    const gains = {};
    for (const { key } of GROWABLE_ATTRS) {
      const have = xp[key] ?? 0;
      const pts = Math.floor(have / ROSTER_GROWTH.XP_PER_POINT);
      if (pts <= 0) continue;
      const applied = Math.min(pts, ROSTER_GROWTH.ATTR_CAP - attributes[key]);
      if (applied > 0) {
        attributes[key] += applied;
        gains[key] = applied;
      }
      xp[key] = attributes[key] >= ROSTER_GROWTH.ATTR_CAP
        ? 0
        : have - pts * ROSTER_GROWTH.XP_PER_POINT;
    }
    return {
      ...m,
      attributes,
      growth: {
        ...m.growth,
        xp,
        log: [...m.growth.log, { matchId, ...(season > 1 ? { season } : {}), gains }],
      },
    };
  });
}

// 成長歷程彙總（隊友卡顯示用）：log 內逐場 gains 累加 → { attr: 總增量 }
export function totalGains(member) {
  const sum = {};
  for (const entry of member.growth.log) {
    for (const [k, v] of Object.entries(entry.gains)) sum[k] = (sum[k] ?? 0) + v;
  }
  return sum;
}

// 角色縮寫（與場上頭頂標籤同一套語彙：S/OH/MB/OPP/L）
export const ROLE_ABBR = {
  setter: 'S', outside: 'OH', middle: 'MB', opposite: 'OPP', libero: 'L',
};
