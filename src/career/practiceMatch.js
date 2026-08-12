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
// ★ 曾經無素材、2026-08-12 由 sim 觀測欄位復活的四項 ★
// ════════════════════════════════════════════════════════════════
// 這四項原本在事件流上判不到（見 git 歷史的本段舊文），使用者裁定「sim 加觀測欄位補
// 素材」後復活。**sim 那三個欄位全是純觀測**：沒有任何判定讀它們，行為零位移已由
// 「剝掉新欄位後同 seed 事件流逐位元相同」實測過（1526 個情境）。
//
//   ✓「成功叫成 N 次戰術」→ `CALL_PLAY` 事件（`sim/ai.js` 的 `pushCallPlay`）：
//     叫戰術的四個入口（S 的 ⚡ 指令面板／OH ↘ 內切／OPP 🤝 夾塞／MB 🖐 要 B 快，
//     全都由 `TECH_DEFS.callPlay` 這一把技術解鎖）指令真的生效時各發一顆。
//   ✓「跳發拿 N 個 ACE」「飄浮發球得 N 分」→ `SERVE.style`（'power'|'float'|null）。
//   ✓「後排攻擊（pipe）得 N 分」→ 扣球 `TOUCH.routeKind`（'pipe'／'left'／'quick'…）。
//
// ★ 這一條紀律不變 ★ 判不到的科目仍然寧可不喊（例如「走位」沒有 MOVE 事件，
// 見下方 `tut-receive` 的處理）——復活的判準是**事件流真的有那個欄位**，不是想要。
import { createPlayer } from '../sim/player.js';
import { matchStatsFor } from './growth.js';
import { countSetAssistKills } from './boxScore.js';
import { boxScoreLFor } from './boxScoreL.js';
import { buildDeficitFillIns } from './graduation.js';
import {
  defaultLineup, validateLineup, checkRoleStructure, effectiveOrder, trustOf,
} from './lineup.js';
import { buildLibero, normalizeCareerPlayer, alliedAiProfileOf } from './careerState.js';

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

// ---- 以下三支吃 2026-08-12 新增的 sim 觀測欄位 ----

// 某一式發球的直接得分（ACE）次數。歸因法與 `matchStatsFor.aces` 同源——「得分之前
// 最後一次觸球是我這一發」，任何人碰到球就不算 ⇒ 這裡一樣是「發完到得分之間零觸球」。
// 差別只有多讀一格 `SERVE.style`（'power'＝跳發／'float'＝飄浮／null＝站發），
// 把三式分開數。★ style 只在 SERVE 事件上，別去別的事件找 ★
export function countServeAces(events, playerId, myTeam, style) {
  let n = 0;
  let pending = false; // 「我這一發還活著、且還沒有人碰到球」
  for (const e of events ?? []) {
    if (e.type === 'SERVE') {
      pending = e.playerId === playerId && e.team === myTeam && (e.style ?? null) === style;
    } else if (e.type === 'TOUCH' || e.type === 'BLOCK_TOUCH') {
      pending = false; // 有人碰到＝不是直接得分
    } else if (e.type === 'SCORE') {
      if (pending && e.team === myTeam) n += 1;
      pending = false;
    }
  }
  return n;
}

// 後排 pipe 攻擊的得分次數。同一套歸因（得分前最後一次觸球是我的扣球），
// 額外要求那一扣的 `routeKind === 'pipe'`——**前後排靠這個欄位分，不靠座標猜**。
export function countPipeKills(events, playerId, myTeam) {
  let n = 0;
  let pending = false;
  for (const e of events ?? []) {
    if (e.type === 'TOUCH') {
      pending = e.kind === 'spike' && e.playerId === playerId && e.team === myTeam
        && e.routeKind === 'pipe';
    } else if (e.type === 'SERVE' || e.type === 'BLOCK_TOUCH') {
      pending = false;
    } else if (e.type === 'SCORE') {
      if (pending && e.team === myTeam) n += 1;
      pending = false;
    }
  }
  return n;
}

// ════════════════════════════════════════════════════════════════
// ★「成功叫成一次戰術」的定義（寫死在這裡，不得在別處另立第二份）★
// ════════════════════════════════════════════════════════════════
// 成功 ＝ ①我下的戰術指令**真的生效**（sim 發出 `CALL_PLAY`＝線已經寫回 approach）
//        ＋ ②**這一波我方的下一次扣球**就是被指定的那個人、跑的就是那條線
//          （`TOUCH.kind==='spike'` 且 `playerId===mainId` 且 `routeKind===kind`）。
//
// 為什麼要第②條：光有①只證明「面板受理了」。教練喊的是「叫成一次戰術」，
// 玩家看到的成立畫面是那顆球真的照那條線打出來——只判①的話，按了鈕但球給了別人
// （內切／夾塞實測有相當比例是白跑）也會算過，那就是「喊了一件事、判了另一件事」。
//
// 為什麼只認「下一次」扣球：叫戰術的窗開在 `touches===1`（一傳已起、二傳還沒出手），
// 這一波的攻擊必然是接下來那一顆扣球。再往後的扣球屬於對方救回來之後的**另一波**，
// 拿它來算會把「碰巧同一條線」誤記成叫成功。
// 掃描在以下任一情況中止（＝這一波結束了，沒跑成）：
//   死球／得分／新發球／**對方觸球**（球過網了）／我方先出現不符的扣球。
export function countCalledPlays(events, playerId, myTeam) {
  const ev = events ?? [];
  let n = 0;
  for (let i = 0; i < ev.length; i += 1) {
    const call = ev[i];
    if (call.type !== 'CALL_PLAY' || call.playerId !== playerId || call.team !== myTeam) continue;
    if (!call.mainId || !call.kind) continue; // 線是 null＝連要跑什麼都說不出來，不算
    for (let j = i + 1; j < ev.length; j += 1) {
      const e = ev[j];
      if (e.type === 'SERVE' || e.type === 'SCORE' || e.type === 'DEAD_BALL') break;
      if (e.type === 'TOUCH' && e.team !== myTeam) break;
      if (e.type !== 'TOUCH' || e.kind !== 'spike') continue;
      if (e.playerId === call.mainId && e.routeKind === call.kind) n += 1;
      break; // 我方這一波的下一顆扣球只認這一次，不是它就是沒跑成
    }
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
  // ---- 這屆新學的技術 ----
  // ★ target 一律 1（除了魚躍）★ kickoff 題 2 的定位是「**新東西的第一次實際使用**」，
  // 不是熟練度考試；而其中三項（跳發 ACE／飄浮 ACE／叫成戰術跑出來）都帶對手與球運，
  // 目標訂高會變成「想練練不到」——那正是 kickoff 題 8 餵球式偏置要治的病。
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
  'pipe-kill': {
    id: 'pipe-kill',
    label: '後排 pipe 拿下 1 分',
    target: 1,
    count: countPipeKills,
  },
  'float-ace': {
    id: 'float-ace',
    label: '飄浮發球直接得 1 分',
    target: 1,
    // 「直接得分」＝ACE（沒人碰到球）。台詞不寫「得分」兩個字就好——飄浮發球造成
    // 對方一傳崩掉、我方之後打死，那不是這一發直接拿的分，判定也不會算。
    count: (ev, pid, team) => countServeAces(ev, pid, team, 'float'),
  },
  'jump-ace': {
    id: 'jump-ace',
    label: '跳發拿下 1 個 ACE',
    target: 1,
    count: (ev, pid, team) => countServeAces(ev, pid, team, 'power'),
  },
  'call-play': {
    id: 'call-play',
    label: '成功叫成 1 次戰術（球照那條線打出來）',
    target: 1,
    // 台詞括號裡那句就是判定：`countCalledPlays` 的第②條。不寫的話玩家會以為
    // 「按了鈕就算」，那是喊一件事判另一件事。
    count: countCalledPlays,
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
  //
  // ★ `hints` ＝教練喊的「怎麼做」，與 label／count 放在同一個物件裡（同一條紀律：
  //   台詞是規格）。每一句都必須與**現行操作**逐字對準——依據標在該句上方的
  //   `檔案:行號`，改操作的人請一併改這裡。對不上的句子就是下一次「文案說謊」事故。
  'tut-receive': {
    id: 'tut-receive',
    label: '跑到位置，接起 1 球',
    target: 1,
    hints: [
      // matchControls.js:824-841 readMove（鍵盤→世界座標）；:212-217 觸控只認左 40% 螢幕
      '左半邊螢幕推方向（電腦 WASD），走到球落下來的地方',
      // matchControls.js:153-209 蓄力/放開；:177-199 Perfect＝球下墜且進可及範圍那一刻放開
      '球到手邊、正在往下掉的那一刻放開右邊大鈕——那是 Perfect 一傳',
      // ★ 魚躍是自動的：matchStage.js:606-608 已撤掉常駐手動鈕，matchControls.js:488-518 自動觸發
      // 這句刻意不提任何按鈕（`hintViolations` 守衛在測試裡逐句檢查）
      '搆不到的球會自動魚躍撲救——這件事不用你動手',
    ],
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
    hints: [
      // actionButtons.js:3-5,41-44 鈕面標籤隨情境變（發球／扣球／舉球／墊球）
      '球起來之後輪到你出手時，右邊那顆鈕會自己變成「舉球」或「扣球」',
      // matchControls.js:153-209 按住蓄力→拖曳瞄準→放開出手；:177-199 甜蜜區
      '一樣是按住蓄力、拖曳瞄準、放開——蓄力別壓到底，過頭球會飄掉',
    ],
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
    hints: [
      // matchControls.js:280-290 貼網 |z| < 2.2 才算攔網
      '先貼著網站好——離網太遠就不算攔網',
      '沿著網橫移，卡在他要打的那條線上',
      // matchControls.js:120,141-148,577 K 鍵/攔網鈕一點即出（不蓄力）；手機站到位自動起跳
      'K 鍵或攔網鈕一點就跳，不用蓄力；手機版站到位會自動起跳',
    ],
    count: countBlockTouches,
  },
  'tut-serve': {
    id: 'tut-serve',
    label: '發出 1 球',
    target: 1,
    hints: [
      // matchControls.js:739-747 serveZones 四落點；matchLoop.js:1218-1241
      '輪到你發球時，先從面板挑落點：深左／深中／深右／短球',
      // matchControls.js:153-209 按住蓄力→放開出手；:177-199 甜蜜區（超蓄品質劣化）
      // ★ 刻意不提發球三式 ★ 飄浮／跳發要先學會（growth.TECH_DEFS 的 floatServe／
      // jumpServe），第一屆開場的新人只有普通發球——講一個他面板上沒有的選擇＝說謊
      '再按住右邊大鈕蓄力、放開出手——蓄力有甜蜜區，壓到底反而會飄',
    ],
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
    hints: [
      // countTeamThreeTouch：TOUCH.touches 1→2→3 且第三擊是 spike，中途對方碰到就重算
      '一傳、二傳、扣球——這一波三擊都由我方接手才算數',
      // matchControls.js:320-346 沒碰搖桿時系統會把你帶到該站的位置
      '你只要把自己那一擊做好；沒碰搖桿時系統會把你帶回該站的位置',
    ],
    count: (ev, pid, team) => countTeamThreeTouch(ev, team),
  },
  'tut-point': {
    id: 'tut-point',
    label: '拿下 1 分',
    target: 1,
    hints: [
      // totalPointsFor＝kills＋tipKills＋aces＋blockPoints（歸屬到你身上的那一分）
      '殺球、吊球、發球直接得分、攔網得分——你親手拿下的那一分才算',
      // DRILL_BIAS['tut-point'] = ['feedPlayer'] ⇒ practiceBiasFor 把你的 trust 拉到
      // PRACTICE_FEED_TRUST、隊友壓到 PRACTICE_MATE_TRUST。這句話是那條偏置的台詞面
      '今天教練讓二傳優先餵球給你——球會一直來，把握機會打下來',
    ],
    count: totalPointsFor,
  },
};

// 技術 → 科目。陣列而不是物件＝**生成順序決定論**（同一屆學到好幾把時科目順序恆定）；
// 順序沿 `growth.TECH_DEFS` 的宣告序，唯一沒有科目的是 `feint`（假動作沒有專屬事件，
// 它是「越用越純熟」的被動量，硬喊會變成判不到的台詞）。
export const TECH_DRILL_ORDER = [
  { tech: 'tip', drill: 'tip' },
  { tech: 'dive', drill: 'dive' },
  { tech: 'pipe', drill: 'pipe-kill' },
  { tech: 'floatServe', drill: 'float-ace' },
  { tech: 'jumpServe', drill: 'jump-ace' },
  { tech: 'callPlay', drill: 'call-play' },
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

// 「這屆新學到的技術」的近似（呼叫端＝集訓面板；2026-08-12 練習賽卷）。
//
// ★ 誠實紀錄：存檔裡沒有「哪一屆學會的」這個欄位 ★
// 技術解鎖只寫 `player.techniques[key] = 1`，教學事件只記「觸發過沒」（`career.events`），
// 兩邊都沒有屆數戳記。真的要精確，得新增一個 per-屆快照欄位——那是存檔 schema 的改動，
// 不在本批範圍。
// 近似法：取 `TECH_DRILL_ORDER`（＝`growth.TECH_DEFS` 宣告序）**末端**的 n 項已解鎖技術。
// 依據：教學鏈的時程本身由淺入深（吊球最早、飄浮＝八強後、跳發＝決賽前、叫戰術＝
// 第 2 屆集訓），宣告序末端≒最近學的。失準的後果是「科目喊到一項舊技術」，
// 不會喊到沒學過的東西（來源恆為已解鎖集合）。
export function recentTechniquesOf(player, n = DRILLS_MAX) {
  const t = player?.techniques ?? {};
  return TECH_DRILL_ORDER
    .filter(({ tech }) => (t[tech] ?? 0) >= 1)
    .slice(-n)
    .map(({ tech }) => tech);
}

// 教學局六步（第一屆開場；固定清單、順序即教學順序）。
export const TUTORIAL_DRILL_IDS = [
  'tut-receive', 'tut-handle', 'tut-block', 'tut-serve', 'tut-three', 'tut-point',
];
export function tutorialDrills() {
  return TUTORIAL_DRILL_IDS.map((id) => DRILL_DEFS[id]);
}

// ════════════════════════════════════════════════════════════════
// 三之二、教學局的步進機（純函式；2026-08-12 教學局批）
// ════════════════════════════════════════════════════════════════
// 與「屆間紅白賽」的差別只有一件事：**六個科目不是同時開放的**，一次只練一步、
// 完成才走下一步。判定仍是同一批 `DRILL_DEFS[tut-*].count`——本檔不重刻一份。
//
// ★ 每一步只看「這一步開始之後」的事件 ★（`startEvent` 切片）
// 理由：`count` 全是**整場累計**。若不切片，教練喊「現在練攔網」的那一刻，前面
// 隨手打進的一分早就讓 `tut-point` 滿足了 ⇒ 玩家什麼都沒做，六步會在兩秒內自己跑完。
// 切片之後語意才對得上教練那句話：「**現在**做給我看一次」。
//
// ★ 卡太久自動放行的存在理由 ★（不是為了省事）
// 六步裡有兩步不是玩家單方面決定得了的：`tut-block` 要對面真的扣過來、`tut-serve`
// 要輪轉輪到你發球。新手站錯位、或球運不好連續幾輪都沒輪到，這一步會**永遠**不完成——
// 而教學局的收局條件就是六步走完 ⇒ 卡死在教學局出不去（他的第一場正式賽還沒開始）。
// 放行不算完成（`cleared:false`，結算面板照實顯示 ⏭），只是把課帶著往下走。
export const TUTORIAL_STALL_TICKS = 60 * 180; // 3 分鐘（sim 固定 60Hz，見 sim/constants.js）

export function createTutorialState(tick = 0) {
  return {
    index: 0,          // 現在練第幾步（＝TUTORIAL_DRILL_IDS 的索引）
    startEvent: 0,     // 這一步開始時 events 的長度（切片起點）
    startTick: tick,   // 這一步開始時的 game.tick（卡太久的計時基準）
    log: [],           // 已走完的步：{ id, label, count, target, cleared }
    done: false,       // 六步都走完了（＝教學局該收局）
  };
}

// 現在這一步的科目定義（done 之後回 null）
export function currentTutorialDrill(state) {
  const i = state?.index ?? 0;
  if (state?.done || i >= TUTORIAL_DRILL_IDS.length) return null;
  return DRILL_DEFS[TUTORIAL_DRILL_IDS[i]];
}

// 這一步目前做到幾次（切片後；上限夾在 target，HUD 不顯示 3/1 這種數字）
function currentCount(state, { events = [], playerId, myTeam }) {
  const def = currentTutorialDrill(state);
  if (!def) return 0;
  const slice = events.slice(state.startEvent ?? 0);
  return def.count(slice, playerId, myTeam) ?? 0;
}

/**
 * 步進一次。**純函式**：不改傳入的 state，回傳新的。
 * @returns { state, change, drill, cleared }
 *   change：null＝這一步還在進行／'advance'＝做到了，換下一步／'release'＝卡太久放行
 *   drill ：剛剛結束的那一步（change 非 null 時才有意義）
 *   cleared：那一步是真的做到（true）還是被放行（false）
 *   收局訊號＝回傳的 `state.done`（六步都離開了）
 */
export function advanceTutorial(state, { events = [], playerId, myTeam, tick = 0 } = {}) {
  const st = state ?? createTutorialState();
  const def = currentTutorialDrill(st);
  if (!def) return { state: st, change: null, drill: null, cleared: false };
  const count = currentCount(st, { events, playerId, myTeam });
  const cleared = count >= def.target;
  // ★ 先判完成再判逾時 ★ 兩者同一幀成立時算「做到了」——同一顆球既完成了科目又
  // 剛好壓線超時，記成放行會把玩家真的做到的事寫成沒做到
  if (!cleared && (tick - (st.startTick ?? 0)) < TUTORIAL_STALL_TICKS) {
    return { state: st, change: null, drill: def, cleared: false };
  }
  const nextIndex = st.index + 1;
  return {
    state: {
      index: nextIndex,
      startEvent: events.length,
      startTick: tick,
      log: [...st.log, {
        id: def.id, label: def.label, count: Math.min(count, def.target), target: def.target, cleared,
      }],
      done: nextIndex >= TUTORIAL_DRILL_IDS.length,
    },
    change: cleared ? 'advance' : 'release',
    drill: def,
    cleared,
  };
}

// HUD 用的逐步狀態（六列固定；`practiceHud.update` 吃這個形狀）。
//   phase：'done'＝做到了／'passed'＝卡太久被帶過／'current'＝現在練這步／'todo'＝還沒到
export function tutorialRows(state, { events = [], playerId, myTeam } = {}) {
  const st = state ?? createTutorialState();
  const cur = currentTutorialDrill(st);
  return TUTORIAL_DRILL_IDS.map((id, i) => {
    const def = DRILL_DEFS[id];
    const past = st.log[i];
    if (past) {
      return {
        id,
        label: def.label,
        count: past.count,
        target: def.target,
        achieved: past.cleared,
        phase: past.cleared ? 'done' : 'passed',
      };
    }
    if (cur && cur.id === id) {
      return {
        id,
        label: def.label,
        count: Math.min(currentCount(st, { events, playerId, myTeam }), def.target),
        target: def.target,
        achieved: false,
        phase: 'current',
        hints: def.hints ?? [],
      };
    }
    return { id, label: def.label, count: 0, target: def.target, achieved: false, phase: 'todo' };
  });
}

// 教學局結算（不給任何獎勵——第一屆沒有集訓格可聯動，純學操作）。
// 形狀刻意與 `settlePractice` 對齊（results／completedCount），但**不含 unlockControl**：
// 那個欄位的語意是「集訓控球格開放」，教學局沒有那回事，給了就是喊一件事做另一件事。
export function tutorialSettle(state) {
  const st = state ?? createTutorialState();
  const results = TUTORIAL_DRILL_IDS.map((id, i) => {
    const def = DRILL_DEFS[id];
    const past = st.log[i];
    return {
      id,
      label: def.label,
      count: past?.count ?? 0,
      target: def.target,
      achieved: !!past?.cleared,
    };
  });
  return {
    results,
    completedCount: results.filter((r) => r.achieved).length,
    total: results.length,
  };
}

// ---- 教練喊話（台詞是規格：每句都由科目定義本身組出來）----
export function tutorialCoachLine(drill) {
  const def = drillDefOf(drill);
  if (!def) return '';
  const hint = def.hints?.[0] ?? '';
  return `教練：現在練——${def.label}${hint ? `。${hint}` : ''}`;
}
export const TUTORIAL_RELEASE_LINE = '教練：這個急不來，等等再說——先往下走。';
export const TUTORIAL_FINISH_LINE = '教練：好，今天到這裡——收工！';

// 賽末的一句評語（結算面板用；門檻與 `tutorialSettle` 的 completedCount 同源）
export function tutorialVerdictLine(settled) {
  const done = settled?.completedCount ?? 0;
  const total = settled?.total ?? TUTORIAL_DRILL_IDS.length;
  if (done >= total) return '教練：基本動作全摸過一遍了——正式比賽見。';
  if (done >= total / 2) return '教練：夠了，剩下的上場慢慢練——真正的比賽從下一場開始。';
  return '教練：先這樣。場上會逼你學會的——下一場就是正式的了。';
}

// ---- 文案守衛（可測的純函式，不是只寫在測試裡的斷言）----
// 本專案兩次踩過「文案承諾程式做不到的事」。魚躍是**自動觸發**的（matchStage.js:606-608
// 撤掉了常駐手動鈕），任何提到魚躍卻教人去按東西的句子都是錯的。
// ★ 判準寫成「提到魚躍的句子必須說它是自動的、且不得提到鈕」★ 而不是「不准出現按字」
// ——「不用按任何東西」是對的，單看關鍵字會誤殺。
export function hintViolations(text) {
  const s = String(text ?? '');
  if (!s.includes('魚躍')) return [];
  const out = [];
  if (!s.includes('自動')) out.push('提到魚躍卻沒說它是自動的');
  if (s.includes('鈕')) out.push('提到魚躍卻指向某顆鈕（魚躍沒有鈕）');
  return out;
}

// ---- 教學局的掛點旗標（創角後、group-1 前，只邀請一次）----
// ★ 走 `career.events` 這條既有管道 ★（同 `coach-height-guidance` 的去重法）——
// 存檔 schema 零改動、舊檔零遷移。
// ★ 旗標在「做決定的那一刻」落檔，不是在打完的那一刻 ★
// 沿 `campPending` 的精神（旗標與那一次決定同一筆寫檔），但**結論相反**：集訓有成果
// 要保護所以做完才清旗標；教學局零獎勵、什麼都不會丟，所以按下去就記。
// 這樣打到一半殺 app 重開＝旗標已在 ⇒ 不會再邀請一次（也不會卡住 group-1）。
export const TUTORIAL_INVITE_EVENT_ID = 'rookie-tutorial';
// 該不該出邀請卡：第一屆、一場都還沒打、沒邀請過。
export function tutorialInviteDue(career, seasonIndex = 1) {
  if ((seasonIndex ?? 1) !== 1) return false;
  if (!career) return false;
  if ((career.results ?? []).length > 0) return false;
  return !(career.events ?? []).includes(TUTORIAL_INVITE_EVENT_ID);
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

// ════════════════════════════════════════════════════════════════
// 七、餵球式情境偏置（kickoff 題 8）——★全部在建隊參數層，零 sim 改動★
// ════════════════════════════════════════════════════════════════
// 科目制的隱藏弱點：喊「成功叫 2 次戰術」，但球運不好時窗口根本沒開幾次 ⇒ 想練練不到。
// 真實訓練的本質是**教練餵球**——把要練的情境高頻製造出來。
//
// ★ 每條偏置底下都寫「為了哪類科目、機制依據哪一行」★ 只有兩種東西可以動：
//   ① 建隊時每個人的 `trust`（`sim/player.js:61` 的 `trust.fromSetter`）
//   ② `aiProfiles`（`createGame({ aiProfiles })`，讀取端 `sim/ai.js` 的 `aiProfileOf`）
// 這兩樣都是 sim 出廠就吃的注入參數，與 `careerMatchSetup` 走同一條路。
//
// ────────────────────────────────────────────────────────────────
// ★★ 誠實紀錄：「指名發給玩家」與「二傳優先舉給玩家」是**同一根槓桿** ★★
// ────────────────────────────────────────────────────────────────
// kickoff 題 8 把這兩條寫成兩件事，實作上它們共用 `trust`：
//   · 舉球分配：`sim/ai.js` 的 `attackPointsOf` 以 `effectiveTrust` 當權重。
//   · 針對性發球：`sim/ai.js` 的 `serveTargetPidOf`（D2-SERVE 區塊）挑的是
//     「對方**後排**攻擊手裡 effectiveTrust 最高的那一個」——**沒有 targetId 注入介面**
//     （`scoutRead` 是攔網讀線用的，跟發球目標無關）。所以要白隊發給玩家，唯一的
//     參數層做法就是讓玩家成為紅隊後排 trust 最高的攻擊手。
// 兩個旗標仍分開留著（`serveToPlayer`／`feedPlayer`），因為它們**回答的是不同的問題**
// ——日後 sim 真的開了發球目標注入介面，只要改 `serveToPlayer` 那一條的實作即可。
// ⚠ 已知限制：`AI.SERVE_TARGET_RATE` 只有一半的發球會指名（另一半走四區循環），
// 且玩家在前排輪次時不是候選——這是 sim 的既有規則，偏置不改它。
//
// ────────────────────────────────────────────────────────────────
// ★★ 實測（2026-08-12，6 局／同一組 seed，紅隊扣球歸屬）★★
// ────────────────────────────────────────────────────────────────
//   對照（無偏置）            玩家扣球佔比 31.6%（65/206）
//   只把玩家 trust 拉到 85    33.3%（63/189）  ← **幾乎沒動**
//   ＋紅隊隊友 trust 壓到 10  37.1%（73/197）  ← 現行設定
//   ＋紅隊隊友 trust 壓到 5   42.1%（82/195）
// 為什麼只拉玩家沒用：出廠名冊裡隊友 trust 全是 20、玩家 40 ＋還有 0.27 的球權地板
// （`PLAYER_TRUST_FLOOR`）——他**本來就已經是**分配的第一順位，把 40 換成 85 只是把
// 「已經很大」變成「更大一點」。餵球要有感，得動的是**差距**，不是他自己的絕對值。
// 這就是為什麼 `mateTrust` 存在：不是為了讓隊友變爛，是為了讓「今天球先給要練的人」
// 這件事在分配權重上真的成立。
//
// ★★ 同一次實測的誠實結果：`serveToPlayer` 在出廠名冊上是**零位移** ★★
//   玩家接球數 49 → 49（逐值相同）。原因同上——`serveTargetPidOf` 挑的是「對方後排
//   攻擊手裡 trust 最高的那個」，而玩家出廠就是。所以這條偏置的實際身分是**保證**
//   而不是改變：它保的是「就算某個隊友的 trust 靠 `换人信任事件` 一路長到超過玩家
//   （lineup.trust 每場可 +2，三屆下來過 40 完全可能），紅白賽這一場也一定發給你」。
//   ⚠ 不得因為它現在量不出差別就宣稱它有效——這一行就是留給下一個人看的。
export const PRACTICE_FEED_TRUST = 85;
// 紅隊隊友在餵球場的 trust 上限。值＝`lineup.FRESHMAN_TRUST`（10）的同一個量級：
// 「今天大家先當新生，球優先給要練的那個人」。★ 只壓紅隊 ★ 白隊是對手，
// 把對手調笨不是訓練、是放水。★ 只是這一場的建隊參數 ★ 不寫回 lineup.trust。
export const PRACTICE_MATE_TRUST = 10;

// 科目 id → 偏置旗標。★ 以 id 對表，不靠字串猜 ★ 與 `drillGainFor` 同一條紀律：
// 認不得的科目一律拿不到偏置，不會有人手捏一個 id 就把白隊調弱。
export const DRILL_BIAS = {
  // 接發／魚躍類 ⇒ 白隊發球指名發給玩家（機制見上方 serveTargetPidOf 那段）
  dive: ['serveToPlayer'],
  'basic-libero': ['serveToPlayer'],
  'tut-receive': ['serveToPlayer'],
  // 殺球／吊球／pipe 類 ⇒ 紅隊二傳優先舉給玩家（`attackPointsOf` 的 trust 權重）
  tip: ['feedPlayer'],
  'pipe-kill': ['feedPlayer'],
  'basic-attack': ['feedPlayer'],
  'tut-handle': ['feedPlayer'],
  'tut-point': ['feedPlayer'],
  points: ['feedPlayer'],
  // 叫戰術／B 快類 ⇒ 白隊全站發（`aiProfileOf` 的 jumpServeRate／floatServeRate）
  // ⇒ 紅隊一傳品質高 ⇒ perfect 窗口高頻開 ⇒ 叫戰術／組合攻擊真的排得出來
  'call-play': ['standServe'],
  // 攔網類 ⇒ 白隊不吊球（`aiProfileOf` 的 tipRate；讀取端 `sim/ai.js:2908`）
  // ⇒ 少吊多扣 ⇒ 攔網手真的有球可以碰
  'basic-middle': ['noTip'],
  'tut-block': ['noTip'],
};

// 科目清單 → 建隊參數配置（純函式，可測）。無科目＝零偏置（每個旗標都 false／null）。
export function practiceBiasFor(drills = []) {
  const on = new Set();
  for (const d of drills ?? []) {
    const def = drillDefOf(d); // 認不得的科目不得偷偷開偏置（同 drillGainFor 的紀律）
    if (!def) continue;
    for (const k of DRILL_BIAS[def.id] ?? []) on.add(k);
  }
  const serveToPlayer = on.has('serveToPlayer');
  const feedPlayer = on.has('feedPlayer');
  const feedOn = serveToPlayer || feedPlayer;
  return {
    serveToPlayer,
    feedPlayer,
    standServe: on.has('standServe'),
    noTip: on.has('noTip'),
    // 兩條偏置共用的那根槓桿（見上方誠實紀錄）：null＝不動 trust
    playerTrust: feedOn ? PRACTICE_FEED_TRUST : null,
    mateTrust: feedOn ? PRACTICE_MATE_TRUST : null, // 紅隊隊友的上限（差距才是有感的來源）
  };
}

// ════════════════════════════════════════════════════════════════
// 八、練習賽建隊（career 層；形狀與 careerMatchSetup 對齊，供 resolveMatchConfig 吃）
// ════════════════════════════════════════════════════════════════
// ★ 練習賽固定 bo1 ★（kickoff 題 7「不做重打」的同一個理由：一屆一場、打完就過）——
// bo1 由 `matchFormatOf` 對練習賽 entry 自然回 1（無 label 「決賽/準決賽」、opponentId 非天鷹）。
export const PRACTICE_STAGE = 'practice';
export const PRACTICE_LABEL = '紅白對抗賽';

export function practiceMatchId(seasonIndex) {
  return `practice-${seasonIndex}`;
}

// 練習賽的 matchEntry（形狀比照 schedule 的賽程項）。
// ★ opponentId 恆為 null ★ 對手是自家白隊、不在 `opponents.js` 裡——任何以
// opponentId 為鍵的路徑（招募進度、情蒐、宿敵、典藏牆）因此天然全部落空，
// 這是設計而不是疏漏：練習賽不記戰績、不推招募（kickoff §三 題 3）。
// ★ 這個 entry **不進 career.schedule** ★ 所以 `recordResult` 對它會 throw
// （「賽程裡沒有比賽」）——那正是我們要的保險絲：練習賽走 settlePractice，
// 任何一條誤把它當正式賽記帳的路徑都會當場炸，不會靜默污染戰績。
export function practiceMatchEntry(seasonIndex) {
  return {
    id: practiceMatchId(seasonIndex),
    stage: PRACTICE_STAGE,
    opponentId: null,
    label: PRACTICE_LABEL,
  };
}

// 一隊的 sim Player 陣列＋自由人＋板凳。
// @param squad        splitSquads 的單邊產物（members **不含** anchor）
// @param teamId       'A'（紅）／'B'（白）
// @param anchorPerson 錨本人（紅＝玩家物件；白＝該名成員）
// @param playerObj    玩家的 sim Player（紅隊才給；白隊 null）——身分要保住 A2 那個物件
// @param lineup       存檔的先發編排（只取 trust 映射：練習賽沿用你平常的信任值）
// @param teamDive     隊友魚躍鏡像（同 careerTeams：主角學會＝全隊跟著會）
function buildSquadSide({
  squad, teamId, anchorPerson, playerObj, lineup, teamDive, mateTrustCap = null,
}) {
  const index = new Map(squad.members.map((m) => [m.id, m]));
  if (anchorPerson) index.set(anchorPerson.id, anchorPerson);
  // 餵球場的隊友 trust 上限（只有紅隊會拿到 mateTrustCap）——取 min 而不是直接指派，
  // 本來就比它低的人不得被「調高」（那是往反方向餵球）
  const trustFor = (id) => {
    const t = trustOf(lineup, id);
    return mateTrustCap == null ? t : Math.min(t, mateTrustCap);
  };
  const makeOne = (m) => createPlayer({
    id: m.id,
    name: m.name,
    teamId,
    naturalRole: m.role,
    currentRole: m.role,
    height: m.height ?? 1.85,
    trust: trustFor(m.id),
    attributes: { ...m.attributes },
    techniques: { dive: teamDive },
  });
  const order = effectiveOrder(squad.lineup.starters, squad.lineup.rotationStart);
  const six = order.map((id) => {
    if (playerObj && id === playerObj.id) return playerObj;
    const m = index.get(id);
    if (!m) throw new Error(`practiceMatchSetup：${squad.label} 先發 ${id} 不在名冊`);
    return makeOne(m);
  });
  // 自由人：結構欄位一律由 buildLibero 公式供給（同 careerMatchSetup 的 D3 慣例），
  // 名冊成員存在時只覆寫 name＋attributes。玩家＝自由人時直接用玩家本人。
  const liberoId = squad.lineup.libero;
  let libero;
  if (playerObj && liberoId === playerObj.id) {
    libero = playerObj;
  } else {
    libero = buildLibero(teamId, `${squad.label}·自由人`);
    const lm = index.get(liberoId);
    if (lm) {
      libero.name = lm.name;
      libero.attributes = { ...libero.attributes, ...lm.attributes };
    }
    // 自由人豁免魚躍鏡像（07-27 Sawmah 拍板 B：防守專精者天生會撲）
    libero.techniques.dive = 1;
  }
  // 板凳＝非先發、非現任自由人、非 libero 角色（濾法逐項比照 careerMatchSetup）
  const starterSet = new Set(order);
  const bench = squad.members
    .filter((m) => !starterSet.has(m.id) && m.id !== liberoId && m.role !== 'libero')
    .map(makeOne);
  return { six, libero, bench };
}

/**
 * 練習賽開賽包（紅白對抗）。回傳形狀與 `careerMatchSetup` 對齊，
 * `resolveMatchConfig` 可以直接把它當 careerSetup 用。
 *
 * @param o.player       主角（save.player；本函式不寫它）
 * @param o.members      `roster.members`（不含玩家）
 * @param o.lineup       `save.lineup`（只取 trust 映射）
 * @param o.drills       本場科目清單（`drillsFor` 的輸出）——偏置由它反推
 * @param o.seasonIndex  這場練習賽屬於哪一屆（comboScale 的屆數閘同正式賽）
 * @param o.seed         決定論種子（＝matchSeed(career, practiceMatchId)）
 * @param o.tutorial     教學局旗標（第一屆開場的隊內測試）——只往下游傳，不改建隊
 */
export function practiceMatchSetup({
  player, members = [], lineup = null, drills = [], seasonIndex = 2, seed = 1, tutorial = false,
} = {}) {
  if (!player?.id) throw new Error('practiceMatchSetup：需要主角');
  normalizeCareerPlayer(player); // 跨版本補正（同 careerTeams 的第一件事）
  const bias = practiceBiasFor(drills);
  const squads = splitSquads({
    members, playerId: player.id, playerRole: player.currentRole ?? 'outside', player, seed,
  });
  // ★ 玩家 trust 拉高＝淺拷貝一個新物件，不動存檔裡的那一個 ★
  // 練習賽的餵球偏置是**這一場的**訓練安排，不是永久的球權改變；就地改 `player.trust`
  // 會被賽末的 savePlayer 固化進存檔（正式賽從此都餵他）。
  const me = bias.playerTrust == null ? player : {
    ...player,
    trust: {
      ...player.trust,
      fromSetter: Math.max(player.trust?.fromSetter ?? 0, bias.playerTrust),
    },
  };
  const anchorWhite = members.find((m) => m.id === squads.white.anchorId) ?? null;
  if (!anchorWhite) throw new Error('practiceMatchSetup：白隊錨不在名冊');
  const teamDive = player.techniques?.dive ?? 0;
  const red = buildSquadSide({
    squad: squads.red,
    teamId: 'A',
    anchorPerson: null,
    playerObj: me,
    lineup,
    teamDive,
    mateTrustCap: bias.mateTrust, // ★ 只有紅隊 ★ 白隊是對手，調笨它不是訓練是放水
  });
  const white = buildSquadSide({
    squad: squads.white, teamId: 'B', anchorPerson: anchorWhite, playerObj: null, lineup, teamDive,
  });
  // 兩隊都是我隊 ⇒ 兩邊都吃同一份我方 profile（單一真相源＝careerState.alliedAiProfileOf），
  // 白隊再疊上本場偏置。★ 偏置只加在白隊 ★ 紅隊要練的是自己，不是被放水。
  const allied = alliedAiProfileOf(player);
  return {
    seed,
    teams: { A: red.six, B: white.six },
    benches: { A: red.bench, B: white.bench },
    liberos: { A: red.libero, B: white.libero },
    aiProfiles: {
      A: { ...allied },
      B: {
        ...allied,
        // 全站發（叫戰術／B 快科目）：把我方 profile 的跳發／飄浮率壓回 0
        ...(bias.standServe ? { jumpServeRate: 0, floatServeRate: 0 } : {}),
        // 不吊球（攔網科目）：aiProfileOf 的預設是 AI.TIP_RATE，這裡顯式歸零
        ...(bias.noTip ? { tipRate: 0 } : {}),
      },
    },
    // 組合攻擊屆數閘：與正式賽同一條規則（第 1 屆 0／第 2 屆起 1）——練習賽不是特例場
    comboScale: seasonIndex >= 2 ? 1 : 0,
    // 播報用的「對手」：白隊不是 opponents.js 裡的隊伍（無 ace／無 style）
    opponent: { id: 'practice-white', name: SQUAD_LABELS.white },
    // 以下是練習賽專屬的隨附資料（sim 不看；app／ui 層消費）
    practice: { drills, seasonIndex, bias, squads, tutorial: !!tutorial },
  };
}
