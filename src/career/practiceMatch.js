// 練習賽卷（2026-08-12 拍板；依據 docs/kickoffs/practice-match-kickoff.md）——
// **純函式地基**：紅白拆隊／訓練科目／賽末結算／教學局科目。
// 零 DOM、零 three.js、零 sim 改動、零存檔 IO（store 寫入方法留給接線批）。
//
// ════════════════════════════════════════════════════════════════
// ★ 本檔最重要的一條規則：台詞是規格 ★（kickoff §二-1）
// ════════════════════════════════════════════════════════════════
// 教練喊出來的每一句目標，必須是**這個檔真的在判定的東西**。因此：
//   ① 每個科目的 `label`（喊的話）與 `count`（判的法）**在同一個物件裡**
//      （`DRILL_DEFS`）——不得一份寫在 UI、一份寫在判定端。
//   ② `drillGainFor` 一律**以 id 回查 `DRILL_DEFS`**，不吃呼叫端自己帶的判定函式：
//      呼叫端手捏一個 `{ id:'foo', target:1 }` 只會拿到 0，不會靜默通過。
//   ③ 事件流裡**判不到**的科目，寧可不喊——見下方「無素材而拿掉的科目」。
//
// ════════════════════════════════════════════════════════════════
// ★ 無素材而拿掉的科目（2026-08-12 實查 sim 事件流；不是忘了寫）★
// ════════════════════════════════════════════════════════════════
// kickoff 題 2 舉例的候選裡，有四項在**現行事件流上判不到**，因此不入候選池。
// 判準＝`src/sim/game.js` 實際 push 出去的欄位（不是推論、不是 game 執行期狀態——
// 結算吃的是 `game.events`，執行期狀態賽末早就沒了）：
//
//   ✗「成功叫成 N 次戰術」：叫戰術走 `aiState.replanCall` →`approach.resolveCalledPlay`，
//     **全程沒有任何事件進 `game.events`**（sim 事件型別實查一輪，沒有 CALL_PLAY 這種東西；
//     `CALL_BALL` 是 OPP 要球，不是叫戰術）。要開這個科目得先讓 sim 發一顆事件——
//     那是 sim 改動、不在本批範圍（且會動 sim-hash）。
//   ✗「跳發拿 N 個 ACE」「飄浮發球得 N 分」：`SERVE` 事件只有
//     `{type,tick,team,playerId}`，**發球式樣 `rally.serveStyle` 沒有寫進事件**
//     ⇒ 賽末分不出這一顆 ACE 是站發、飄浮還是跳發。
//   ✗「後排攻擊（pipe）得 N 分」：扣球的 `TOUCH` 沒有 `routeKind`／沒有場上座標
//     （`intent.routeKind` 只進 `game.tallies.routes`，不進事件流）⇒ 分不出前後排。
//
// 這四項要復活，最小改動都是「sim 多發一個欄位／一顆事件」，屆時把 `DRILL_DEFS`
// 補回來即可（本檔其餘結構不必動）。**在那之前不得把它們寫進台詞**。
import { matchStatsFor } from './growth.js';
import { countSetAssistKills } from './boxScore.js';
import { boxScoreLFor } from './boxScoreL.js';
import { buildDeficitFillIns } from './graduation.js';
import { defaultLineup, validateLineup, checkRoleStructure } from './lineup.js';

// ════════════════════════════════════════════════════════════════
// 一、事件流掃描器（只補既有計數器沒有的那幾種；其餘一律重用）
// ════════════════════════════════════════════════════════════════
// 重用清單（★不重抄★）：
//   殺球／吊球／ACE／攔網得分 → `growth.matchStatsFor`
//   助攻                      → `boxScore.countSetAssistKills`
//   起球（一傳＋防守）        → `boxScoreL.boxScoreLFor().digs`
// 以下三支是既有計數器沒有的：魚躍（digs 把 receive 與 dive 併在一起算，分不出來）、
// 攔網觸球（既有的是攔網**得分**）、三擊組織（隊層級，沒有人數過）。

// 魚躍救起：`TOUCH kind='dive'`＝真的碰到球（撲空不產生 TOUCH，這正是「救起」的語意）
export function countDiveSaves(events, playerId, myTeam) {
  let n = 0;
  for (const e of events ?? []) {
    if (e.type === 'TOUCH' && e.kind === 'dive'
      && e.playerId === playerId && e.team === myTeam) n += 1;
  }
  return n;
}

// 攔網觸球（不是攔網得分）：`BLOCK_TOUCH.team`＝攔網者所屬隊（與 matchStatsFor 的
// 歸因慣例同源——它也是拿 e.team 跟 myTeam 比）
export function countBlockTouches(events, playerId, myTeam) {
  let n = 0;
  for (const e of events ?? []) {
    if (e.type === 'BLOCK_TOUCH' && e.playerId === playerId && e.team === myTeam) n += 1;
  }
  return n;
}

// 本場總得分（殺球＋吊球＋ACE＋攔網得分）——保底科目與教學局共用同一個定義
export function totalPointsFor(events, playerId, myTeam) {
  const s = matchStatsFor(events, playerId, myTeam);
  return s.kills + s.tipKills + s.aces + s.blockPoints;
}

// 我方完成一次「接—舉—攻」三擊組織（教學局用；隊層級，不看是不是玩家碰的）。
// `TOUCH.touches`＝該次持球權的第幾擊；死球歸零重算。
export function countTeamThreeTouch(events, myTeam) {
  let n = 0;
  let first = false;
  let second = false;
  for (const e of events ?? []) {
    if (e.type === 'TOUCH') {
      if (e.team !== myTeam) { first = false; second = false; continue; }
      if (e.touches === 1) { first = true; second = false; } else if (e.touches === 2 && first) {
        second = true;
      } else if (e.touches === 3 && second && e.kind === 'spike') {
        n += 1;
        first = false;
        second = false;
      }
    } else if (e.type === 'DEAD_BALL' || e.type === 'SCORE' || e.type === 'SERVE') {
      first = false;
      second = false;
    }
  }
  return n;
}

// ════════════════════════════════════════════════════════════════
// 二、科目定義表（★label 與判定同源＝同一個物件★）
// ════════════════════════════════════════════════════════════════
// 每項＝{ id, label, target, count }
//   `label` ＝教練喊的那句話，**必含目標數字**（守衛測試逐項檢查）
//   `target`＝達標門檻
//   `count` ＝(events, playerId, myTeam) → number，本場實際做到幾次
// ⚠ 命名注意：候選池裡的 `count` 是**判定函式**，結算輸出裡的 `count` 是**數字**
//   （結果物件形狀由卷書指定）。兩者不同層、不會同時出現在同一個物件上。
export const DRILL_DEFS = {
  // ---- 這屆新學的技術（只留判得到的兩項，理由見檔頭）----
  tip: {
    id: 'tip',
    label: '吊球拿下 1 分',
    target: 1,
    count: (ev, pid, team) => matchStatsFor(ev, pid, team).tipKills,
  },
  dive: {
    id: 'dive',
    label: '魚躍救起 2 球',
    target: 2,
    count: countDiveSaves,
  },
  // ---- 位置基本科目（轉位後首次集訓／沒有新東西時的保底）----
  'basic-setter': {
    id: 'basic-setter',
    label: '單場助攻 8 次',
    target: 8,
    count: (ev, pid, team) => countSetAssistKills(ev, pid, team),
  },
  'basic-middle': {
    id: 'basic-middle',
    label: '攔網觸球 2 次',
    target: 2,
    count: countBlockTouches,
  },
  'basic-libero': {
    id: 'basic-libero',
    label: '起球 6 次',
    target: 6,
    count: (ev, pid) => boxScoreLFor(ev, pid).digs,
  },
  'basic-attack': {
    id: 'basic-attack',
    label: '殺球 3 分',
    target: 3,
    // 與招募軸 `killMatch` 同語意（matchStatsFor.kills＝重扣得分，吊球另計）——
    // 兩邊講「殺球」要講同一件事
    count: (ev, pid, team) => matchStatsFor(ev, pid, team).kills,
  },
  // ---- 最後的保底（位置中立）：湊不到 2 個科目時才補 ----
  points: {
    id: 'points',
    label: '本場拿下 3 分',
    target: 3,
    count: totalPointsFor,
  },

  // ---- 教學局六步（第一屆開場；同一機制、不同科目集）----
  // 「走位」本身在事件流上判不到（沒有 MOVE 事件）⇒ 併進「接起 1 球」這一步：
  // 球接得起來就代表人走到了。**不另立一個判不到的走位科目**。
  'tut-receive': {
    id: 'tut-receive',
    label: '跑到位置，接起 1 球',
    target: 1,
    count: (ev, pid, team) => {
      let n = 0;
      for (const e of ev ?? []) {
        if (e.type === 'TOUCH' && e.playerId === pid && e.team === team
          && (e.kind === 'receive' || e.kind === 'dive')) n += 1;
      }
      return n;
    },
  },
  'tut-handle': {
    id: 'tut-handle',
    label: '把球送出去 1 次（舉球或扣球）',
    target: 1,
    count: (ev, pid, team) => {
      let n = 0;
      for (const e of ev ?? []) {
        if (e.type === 'TOUCH' && e.playerId === pid && e.team === team
          && (e.kind === 'set' || e.kind === 'spike')) n += 1;
      }
      return n;
    },
  },
  'tut-block': {
    id: 'tut-block',
    label: '攔網碰到球 1 次',
    target: 1,
    count: countBlockTouches,
  },
  'tut-serve': {
    id: 'tut-serve',
    label: '發出 1 球',
    target: 1,
    count: (ev, pid, team) => {
      let n = 0;
      for (const e of ev ?? []) {
        if (e.type === 'SERVE' && e.playerId === pid && e.team === team) n += 1;
      }
      return n;
    },
  },
  'tut-three': {
    id: 'tut-three',
    label: '我方完成 1 次三擊組織（接—舉—攻）',
    target: 1,
    count: (ev, pid, team) => countTeamThreeTouch(ev, team),
  },
  'tut-point': {
    id: 'tut-point',
    label: '拿下 1 分',
    target: 1,
    count: totalPointsFor,
  },
};

// 技術 → 科目（只有這兩把技術在事件流上判得到；其餘見檔頭「無素材」清單）。
// 陣列而不是物件＝**生成順序決定論**（同一屆學到兩把時科目順序恆定）。
export const TECH_DRILL_ORDER = [
  { tech: 'tip', drill: 'tip' },
  { tech: 'dive', drill: 'dive' },
];

// 位置 → 基本科目
export const POSITION_DRILL = {
  setter: 'basic-setter',
  middle: 'basic-middle',
  libero: 'basic-libero',
  outside: 'basic-attack',
  opposite: 'basic-attack',
};

export const DRILLS_MIN = 2;
export const DRILLS_MAX = 3;

// 科目定義的唯一查詢入口（判定端與顯示端共用；未知 id＝null，呼叫端不得自行造一個）
export function drillDefOf(drill) {
  const id = typeof drill === 'string' ? drill : drill?.id;
  return DRILL_DEFS[id] ?? null;
}

// ════════════════════════════════════════════════════════════════
// 三、科目生成
// ════════════════════════════════════════════════════════════════
// @param player       主角（讀 currentRole）
// @param seasonIndex  這場練習賽屬於哪一屆。★≤1＝第一屆開場＝教學局★（kickoff 題 4：
//                     同一機制兩個掛點）——屆間集訓最早發生在 seasonIndex=2。
// @param techniques   **這屆新學到的**技術：陣列 ['tip'] 或物件 { tip: 1 } 皆可
//                     （呼叫端拿得到哪一種就給哪一種，不要為了本函式再轉一次）
// @param flags        { roleChanged: boolean } ——轉位後的第一次集訓
// @returns 1–3 個科目定義物件（就是 DRILL_DEFS 裡那幾個物件本身，不是複製品——
//          複製品會讓「label 與判定同源」變成兩份）
export function drillsFor({ player, seasonIndex = 2, techniques = [], flags = {} } = {}) {
  if ((seasonIndex ?? 0) <= 1) return tutorialDrills(); // 第一屆開場＝教學局
  const learned = Array.isArray(techniques)
    ? new Set(techniques)
    : new Set(Object.entries(techniques ?? {})
      .filter(([, v]) => (v ?? 0) >= 1)
      .map(([k]) => k));
  const role = player?.currentRole ?? 'outside';
  const out = [];
  const push = (id) => {
    const def = DRILL_DEFS[id];
    if (def && out.length < DRILLS_MAX && !out.includes(def)) out.push(def);
  };
  for (const { tech, drill } of TECH_DRILL_ORDER) {
    if (learned.has(tech)) push(drill);
  }
  // 轉位後首次集訓＝該位置的基本科目（新位置的第一次實際使用）；
  // 這屆沒學到任何判得到的新東西時，同一格科目改當保底
  if (flags?.roleChanged || out.length === 0) push(POSITION_DRILL[role] ?? 'basic-attack');
  // 湊不到 2 個就補位置中立的保底（教練不會只喊一句話就走）
  if (out.length < DRILLS_MIN) push(POSITION_DRILL[role] ?? 'basic-attack');
  if (out.length < DRILLS_MIN) push('points');
  return out;
}

// 教學局六步（第一屆開場；固定清單、順序即教學順序）。
// 這批**只做資料與判定**——「暫停等待玩家完成這一步」的流程控制不在本檔。
export const TUTORIAL_DRILL_IDS = [
  'tut-receive', 'tut-handle', 'tut-block', 'tut-serve', 'tut-three', 'tut-point',
];
export function tutorialDrills() {
  return TUTORIAL_DRILL_IDS.map((id) => DRILL_DEFS[id]);
}

// ════════════════════════════════════════════════════════════════
// 四、賽末判定與結算
// ════════════════════════════════════════════════════════════════
// 本場某科目做到幾次。★以 id 回查定義表★——呼叫端手捏的科目物件（或打錯的 id）
// 一律回 0，不會拿著自帶的判定函式繞過單一真相源。
export function drillGainFor(events, playerId, myTeam, drill) {
  const def = drillDefOf(drill);
  if (!def) return 0;
  return def.count(events ?? [], playerId, myTeam) ?? 0;
}

// 賽末結算。`unlockControl`＝全數完成 ⇒ 集訓「控球」格開放的**資料面訊號**
// （UI／存檔寫入是接線批的事，本檔只給答案）。
// 空科目清單不解鎖（`results.length > 0`）——沒有喊過任何一句話就不算做到。
export function settlePractice({ events, playerId, myTeam, drills } = {}) {
  const results = (drills ?? []).map((d) => {
    const def = drillDefOf(d);
    const count = drillGainFor(events, playerId, myTeam, d);
    const target = def?.target ?? 0;
    return {
      id: def?.id ?? (typeof d === 'string' ? d : d?.id) ?? null,
      label: def?.label ?? '',
      achieved: !!def && count >= target,
      count,
      target,
    };
  });
  const completedCount = results.filter((r) => r.achieved).length;
  return {
    results,
    completedCount,
    unlockControl: results.length > 0 && completedCount === results.length,
  };
}

// ════════════════════════════════════════════════════════════════
// 五、存檔欄位（save.practice）——缺鍵回退，舊存檔零遷移
// ════════════════════════════════════════════════════════════════
// 沿 `recruitment.progressOf` 慣例：**逐鍵**正規化而不是整條回退——手改／半殘的
// 條目（例如只有 completed）缺鍵補預設，不會讓 `undefined >= n` 靜默變成 false。
// ★store 寫入方法先不做★（那要動 careerStore，等接線批）。
export function normalizePractice(practice) {
  const p = practice ?? null;
  return {
    seasonIndex: Number.isInteger(p?.seasonIndex) ? p.seasonIndex : 0,
    completed: Number.isFinite(p?.completed) ? p.completed : 0,
    total: Number.isFinite(p?.total) ? p.total : 0,
    unlockControl: !!p?.unlockControl,
  };
}

// 結算 → 存檔欄位（單一真相源：欄位怎麼填只有這一支說了算）
export function practiceRecordOf(seasonIndex, settled) {
  return normalizePractice({
    seasonIndex,
    completed: settled?.completedCount ?? 0,
    total: settled?.results?.length ?? 0,
    unlockControl: !!settled?.unlockControl,
  });
}

// ════════════════════════════════════════════════════════════════
// 六、紅白拆隊
// ════════════════════════════════════════════════════════════════
// 名冊 9–12 人拆不出兩隊（一隊就要 6 名場上＋1 自由人＝14 人）⇒ 缺額補臨時球員，
// 走既有的 `buildDeficitFillIns`（同名池、同屬性模板、同決定論），**不另寫一套生成器**。
//
// ★ 兩個 sim 硬需求 ★
//   ① 每隊要排得出合法 5-1 先發（`checkRoleStructure`：對角三組 S–OPP／OH–OH／MB–MB）
//      ⇒ 每隊至少 S1／OH2／MB2／OPP1，這正是 `roleDeficits` 的 FIELD_NEED。
//   ② `defaultLineup`／`validateLineup` 的簽名假設「名冊裡沒有主控者，主控者另外傳」
//      ⇒ 白隊沒有玩家，就指定一名成員當**錨**（anchor）走同一條路：同一組函式、
//      同一套驗證，不為白隊另立一份鬆一點的規則。
export const SQUAD_LABELS = { red: '紅隊', white: '白隊' };

const ROLE_SPLIT_ORDER = ['setter', 'outside', 'middle', 'opposite', 'libero'];

function strengthOf(person) {
  let sum = 0;
  for (const v of Object.values(person?.attributes ?? {})) {
    if (Number.isFinite(v)) sum += v;
  }
  return sum;
}

// 蛇形分配（決定論、零 RNG）：先固定順序（角色表序 → 屬性總和降冪 → id 升冪），
// 逐人挑「該角色人數較少」的那隊；同數則挑「總戰力較低」的那隊；再同＝紅隊。
// 夠平衡就好，不追求最佳解（kickoff §二：不要過度工程）。
function snakeSplit(people, playerId) {
  const red = [];
  const white = [];
  const player = people.find((p) => p.id === playerId);
  if (player) red.push(player); // 玩家恆在紅隊
  const rest = people
    .filter((p) => p !== player)
    .sort((a, b) => {
      const ra = ROLE_SPLIT_ORDER.indexOf(a.role);
      const rb = ROLE_SPLIT_ORDER.indexOf(b.role);
      if (ra !== rb) return ra - rb;
      const sa = strengthOf(b) - strengthOf(a);
      if (sa !== 0) return sa;
      return a.id < b.id ? -1 : 1;
    });
  const countRole = (team, role) => team.filter((p) => p.role === role).length;
  const total = (team) => team.reduce((n, p) => n + strengthOf(p), 0);
  for (const p of rest) {
    const cr = countRole(red, p.role);
    const cw = countRole(white, p.role);
    if (cr < cw) red.push(p);
    else if (cw < cr) white.push(p);
    else if (total(red) <= total(white)) red.push(p);
    else white.push(p);
  }
  return { red, white };
}

// 白隊的錨：優先非自由人（自由人當錨會走 `playerRole==='libero'` 那條特例路徑，
// 那是為「玩家是自由人」設計的，白隊沒必要）。名單全是自由人才退而求其次。
function anchorOf(squad) {
  return squad.find((p) => p.role !== 'libero') ?? squad[0] ?? null;
}

// 一隊的建置：補缺額 → 排預設陣 → 驗合法性
function buildSquad({ id, squad, anchor, seed, usedNames }) {
  const roster = squad.filter((p) => p.id !== anchor.id);
  const raw = buildDeficitFillIns({
    seed,
    members: roster,
    usedNames: [...usedNames],
    alumni: [],
    playerRole: anchor.role,
  });
  // 臨時球員（賽後不入名冊）：`practice:true`＋自己的 id 命名空間——
  // 兩隊各叫一次 `buildDeficitFillIns` 會拿到同一批 G 編號，這裡重新編號避免撞號
  const fillIns = raw.map((m, i) => ({
    ...m,
    id: `P${id === 'red' ? '' : 'W'}${i + 1}`,
    practice: true,
    origin: 'practice',
    dna: { ...(m.dna ?? {}), tag: '練習賽臨時球員' },
    persona: '今天來湊人數的——練習賽打完就回自己的訓練組',
  }));
  for (const m of raw) {
    if (m.fullName) usedNames.add(m.fullName);
  }
  const members = [...roster, ...fillIns];
  const lineup = defaultLineup(members, anchor.id, anchor.role);
  const check = validateLineup(lineup, members, anchor.id, anchor.role);
  const struct = checkRoleStructure(lineup.starters, members, anchor.id, anchor.role);
  return {
    id,
    label: SQUAD_LABELS[id],
    anchorId: anchor.id,
    anchorRole: anchor.role,
    members,
    fillIns,
    lineup,
    legal: check.valid && struct.legal,
    errors: [...check.errors, ...(struct.legal ? [] : [struct.reason])],
  };
}

// 紅白拆隊。
// @param members    `roster.members`（不含玩家；含自由人）
// @param playerId   主角 id（恆在紅隊）
// @param playerRole 主角現任位置（`player.currentRole`）
// @param player     主角本體（可省；給了才算得進戰力平衡）
// @param seed       決定論種子（只餵臨時球員生成；拆法本身零 RNG）
// @returns { red, white }，各含 { members, fillIns, lineup, anchorId, anchorRole, legal }
export function splitSquads({
  members = [], playerId = 'A2', playerRole = 'outside', player = null, seed = 1,
} = {}) {
  const me = {
    ...(player ?? {}),
    id: playerId,
    role: player?.currentRole ?? playerRole,
  };
  const people = [me, ...members.filter((m) => m.id !== playerId)];
  const { red, white } = snakeSplit(people, playerId);
  const usedNames = new Set(people.map((p) => p.fullName).filter(Boolean));
  const whiteAnchor = anchorOf(white);
  if (!whiteAnchor) throw new Error('splitSquads：白隊一個人都分不到（名冊太小）');
  return {
    red: buildSquad({
      id: 'red',
      squad: red.filter((p) => p.id !== playerId),
      anchor: { id: playerId, role: me.role },
      seed,
      usedNames,
    }),
    white: buildSquad({
      id: 'white', squad: white, anchor: whiteAnchor, seed: seed + 1, usedNames,
    }),
  };
}
