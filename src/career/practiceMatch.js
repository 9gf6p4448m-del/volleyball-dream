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
