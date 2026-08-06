// 位置體檢探針 —— 五個可玩位置（OH/OPP/MB/S/L）的「參與度」量測。
//
// 目的：內容盤點另有人做，這裡只量「機會」——玩這個位置的人每一局實際上有多少次
// 球到手／要下決定的時刻。走真實 createGame + aiCollectIntents + stepGame 路徑，
// 受控玩家（AI 代打，量的是機會不是操作品質）依序頂替五個位置，同一組 seed 對照
// （否則位置間差異會混進運氣），零 src 改動。
//
// 設位方式：
//   - OH/OPP/MB/S：createCareerPlayer 後改 player.currentRole，lineup 傳 null 讓
//     careerMatchSetup 內部用 defaultLineup(members, player.id, player.currentRole)
//     自動把玩家排進對應槽位（見 careerState.js:521-524）。
//   - L（自由人）：currentRole==='libero' 不夠——careerMatchSetup 認的是「外部傳入
//     的 lineup.libero === player.id」這個原始參數（careerState.js:504），不是它
//     內部重算的 lu。傳 null 會導致小守頂替、玩家沒有真的上場。必須顯式算好
//     defaultLineup(..., 'libero') 當作 lineup 參數傳入。
//
// 驗證真的生效（不假設成功）：
//   - 逐位置逐局檢查 game.players[meId].currentRole 是否等於要求角色
//   - L 額外檢查 game.liberos.A.liberoId === meId（異色球衣真的是玩家在穿）
//   - 非 L 額外檢查玩家 id 真的出現在該局先發序（lineup.starters）裡
//
// 跑法：node tools/position-load-probe.mjs [每位置局數=20]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';
import { isFrontRow } from '../src/sim/rotation.js';

const SETS = Number.parseInt(process.argv[2] ?? '20', 10);
const OPPONENT_ID = 'obsidian'; // 中立基準對手，與既有 block-card-career-probe 同隊
const SEED_BASE = 900000;
const SEED_STRIDE = 7919; // 五個位置逐 run 用同一顆種子（run 索引相同→種子相同）

const POSITIONS = [
  { role: 'outside', label: 'OH 主攻' },
  { role: 'opposite', label: 'OPP 副攻(接應)' },
  { role: 'middle', label: 'MB 中攻' },
  { role: 'setter', label: 'S 舉球' },
  { role: 'libero', label: 'L 自由人' },
];

function freshTally() {
  return {
    setsPlayed: 0,
    spikes: 0,       // 進攻出手數
    receives: 0,     // 一傳/接發觸球數（kind='receive'：serve receive + 站姿墊球一律同一 action）
    dives: 0,        // 魚躍救球（另一種防守參與，獨立列出不併入 receives）
    sets: 0,         // 舉球/二傳觸球數
    touchEvents: 0,  // 總觸球數＝直接統計 TOUCH 事件（=spikes+receives+dives+sets，engine 保證同義）
    blockWindows: 0, // 攔網參與數：進入攔網窗次數（非「摸到球」，那是 BLOCK_TOUCH，語意不同）
    calls: 0,        // 叫戰術/要球資格觸發次數（CALL_BALL）
    teamASpikes: 0,  // A 隊全隊扣球總數（球權占比分母）
    rallies: 0,
    ralliesWithOpportunity: 0, // proxy：本回合玩家有 TOUCH 或攔網窗或叫戰術任一發生
    notMeasurable: null,
    startersSampled: null, // 第一局先發槽位快照，供人工核對
    // ---- 追加量測（08-06 對抗式覆核追加）：在場輪轉比例，拆解「板凳太久」vs「在場沒球來」----
    onCourtTicks: 0,
    totalTicks: 0,
    rallyOnCourtCount: 0,
    rallyOffCourtCount: 0,
    touchesOnCourt: 0,
    touchesOffCourt: 0, // 若此值 >0＝發現「不在場也觸球」的異常，需另外交代
    // fingerprint：以 game.match.rotations.A[0] 的球員 id 當「這是六個輪轉狀態中的哪一個」
    // 的身分證——同一組先發序在整場中循環位移，idx0 恆不是自由人（規則見 game.js:1550-1551），
    // 故每個非自由人先發球員恰對應其中一個輪轉狀態，可逐狀態判定自由人在不在場。
    rotationFingerprints: new Map(), // fingerprintId -> { ticks, onCourtTicks }
  };
}

function runPosition(role) {
  const tally = freshTally();
  for (let run = 0; run < SETS; run += 1) {
    const seed = SEED_BASE + run * SEED_STRIDE;
    const career = createCareer({ seed, playerName: '探針' });
    const player = createCareerPlayer('探針');
    player.currentRole = role;
    player.naturalRole = role; // 量負載不量轉位敘事，兩欄一致避免混淆
    const roster = { capacity: 12, members: buildStarterMembers() };
    const entry = { id: 'group-3', stage: 'group', opponentId: OPPONENT_ID, label: '' };
    const lineup = role === 'libero'
      ? defaultLineup(roster.members, player.id, 'libero')
      : null;
    const effectiveLineup = lineup ?? defaultLineup(roster.members, player.id, role);
    const setup = careerMatchSetup(career, player, entry, roster, lineup);
    const game = createGame({
      seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
      liberos: setup.liberos, setTarget: 25, comboScale: setup.comboScale,
      ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
      ...(setup.benches ? { benches: setup.benches } : {}),
    });
    const meId = Object.keys(game.players)
      .find((pid) => game.players[pid]?.name === '探針')
      ?? Object.keys(game.players).find((pid) => game.players[pid]?.isPlayer);
    if (!meId) {
      tally.notMeasurable = `找不到玩家角色（role=${role}）`;
      break;
    }
    // ---- 驗證真的生效 ----
    const actualRole = game.players[meId]?.currentRole;
    if (actualRole !== role) {
      tally.notMeasurable = `設定失敗：要求 ${role}，玩家物件實際 currentRole=${actualRole}`;
      break;
    }
    if (role === 'libero') {
      const liberoAId = game.liberos?.A?.liberoId;
      if (liberoAId !== meId) {
        tally.notMeasurable = `L 設定失敗：game.liberos.A.liberoId=${liberoAId}，非玩家 ${meId}`;
        break;
      }
    } else if (!effectiveLineup.starters.includes(meId)) {
      tally.notMeasurable = `設定失敗：玩家 ${meId} 不在該局先發序 ${JSON.stringify(effectiveLineup.starters)}`;
      break;
    }
    if (tally.startersSampled === null) {
      tally.startersSampled = role === 'libero'
        ? `libero=${meId}（異色球衣）`
        : `starters=${JSON.stringify(effectiveLineup.starters)}（玩家=${meId} 排 index ${effectiveLineup.starters.indexOf(meId)}）`;
    }

    const ai = createAiState();
    let lastBlockStartTick = game.actors[meId].blockStartTick;
    let flag = { touch: false, block: false, call: false };
    let guard = 0;
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
      guard += 1;
      // 在場判定：走真實 game.match.rotations.A（比賽當下實際輪轉陣列，applyLiberoSwaps
      // 直接寫這個陣列——game.js:1553-1592），在呼叫本 tick 的 stepGame 之前取樣，
      // 確保讀到的是「這個即將模擬的 tick」的輪轉狀態（換人只在 setupServePhase／死球後
      // 執行，同一 rally 內恆定，見 game.js:1640-1641）。
      const rotA = game.match.rotations.A;
      const onCourtNow = rotA.includes(meId);
      const fingerprint = rotA[0];
      tally.totalTicks += 1;
      if (onCourtNow) tally.onCourtTicks += 1;
      const fp = tally.rotationFingerprints.get(fingerprint) ?? { ticks: 0, onCourtTicks: 0 };
      fp.ticks += 1;
      if (onCourtNow) fp.onCourtTicks += 1;
      tally.rotationFingerprints.set(fingerprint, fp);

      const intents = aiCollectIntents(game, ai, []);
      const events = stepGame(game, intents);
      for (const e of events) {
        if (e.type === 'TOUCH') {
          if (e.playerId === meId) {
            tally.touchEvents += 1;
            flag.touch = true;
            if (onCourtNow) tally.touchesOnCourt += 1; else tally.touchesOffCourt += 1;
            if (e.kind === 'spike') tally.spikes += 1;
            else if (e.kind === 'receive') tally.receives += 1;
            else if (e.kind === 'dive') tally.dives += 1;
            else if (e.kind === 'set') tally.sets += 1;
          }
          if (e.kind === 'spike' && e.team === 'A') tally.teamASpikes += 1;
        } else if (e.type === 'CALL_BALL' && e.playerId === meId) {
          tally.calls += 1;
          flag.call = true;
        } else if (e.type === 'DEAD_BALL') {
          tally.rallies += 1;
          if (onCourtNow) tally.rallyOnCourtCount += 1; else tally.rallyOffCourtCount += 1;
          if (flag.touch || flag.block || flag.call) tally.ralliesWithOpportunity += 1;
          flag = { touch: false, block: false, call: false };
        }
      }
      const curBlockStart = game.actors[meId].blockStartTick;
      if (curBlockStart !== lastBlockStartTick) {
        tally.blockWindows += 1;
        flag.block = true;
        lastBlockStartTick = curBlockStart;
      }
    }
    if (tally.notMeasurable) break;
    tally.setsPlayed += 1;
  }
  return tally;
}

const results = POSITIONS.map(({ role, label }) => ({ role, label, tally: runPosition(role) }));

console.log(`位置體檢：五位置各 ${SETS} 局，同一組 seed 對照，對手=${OPPONENT_ID}\n`);

for (const { role, label, tally: t } of results) {
  console.log(`---- ${label}（${role}）----`);
  if (t.notMeasurable) {
    console.log(`  無法量測：${t.notMeasurable}（已完成 ${t.setsPlayed} 局後中止）`);
    continue;
  }
  console.log(`  先發驗證樣本：${t.startersSampled}`);
}

const header = ['位置', 'n(局)', '進攻出手', '一傳/接發', '魚躍', '舉球觸球', '總觸球', '攔網參與', '有機會回合%', '球權占比%'];
const rows = results.map(({ label, tally: t }) => {
  if (t.notMeasurable) return [label, '無法量測', '-', '-', '-', '-', '-', '-', '-', '-'];
  const perGame = (n) => (n / t.setsPlayed).toFixed(1);
  const oppPct = t.rallies > 0 ? ((t.ralliesWithOpportunity / t.rallies) * 100).toFixed(1) : 'N/A';
  const sharePct = t.teamASpikes > 0 ? ((t.spikes / t.teamASpikes) * 100).toFixed(1) : '0.0';
  return [
    label, String(t.setsPlayed), perGame(t.spikes), perGame(t.receives), perGame(t.dives),
    perGame(t.sets), perGame(t.touchEvents), perGame(t.blockWindows), `${oppPct}`, `${sharePct}`,
  ];
});

console.log('\n=== 每局平均（含 n）===');
console.log(header.join('\t'));
for (const r of rows) console.log(r.join('\t'));

console.log('\n=== 定義備忘 ===');
console.log('進攻出手/一傳接發/魚躍/舉球觸球：TOUCH 事件依 kind 分類（spike/receive/dive/set）逐局平均。');
console.log('總觸球＝TOUCH 事件直接計數（＝上四項之和，engine 保證同義，非另行推算）。');
console.log('攔網參與＝進入攔網窗次數（actor.blockStartTick 變化偵測），非「摸到球」（那是 BLOCK_TOUCH，語意不同，未列入本表）。');
console.log('有機會回合%＝代理指標：該回合玩家有 TOUCH 或攔網窗或 CALL_BALL 任一發生的回合，占全部回合(以 DEAD_BALL 計數)的比例。');
console.log('  這只量「有沒有真的動手」，不量「理論上有沒有資格」——沒被分配到球但站在該位置本該有攻擊/攔網資格的回合不算在內，屬於保守低估。');
console.log('球權占比%＝該位置扣球數 ÷ A 隊全隊扣球總數。');

// ---- 08-06 對抗式覆核追加：在場輪轉比例／六輪轉槽位分布／在場觸球密度 ----
// 動機：先前回報「L 只在 2/6 輪轉上場」是讀 game.js applyLiberoSwaps 的規則描述推論出來的，
// 不是量出來的——這裡補上真量測，拆解「板凳太久」vs「在場也沒球來」兩種成因各占多少。
console.log('\n=== 追加量測：在場輪轉比例／六輪轉槽位分布／在場觸球密度 ===');
console.log('（沿用同一組 20 局 seed；on-court 判定走 game.match.rotations.A.includes(meId)，逐 tick 取樣）\n');
for (const { role, label, tally: t } of results) {
  if (t.notMeasurable) { console.log(`${label}：無法量測`); continue; }
  const onCourtPct = ((t.onCourtTicks / t.totalTicks) * 100).toFixed(1);
  const onCourtSlots = [...t.rotationFingerprints.entries()]
    .map(([fp, v]) => ({ fp, ratio: v.onCourtTicks / v.ticks, ticks: v.ticks }))
    .sort((a, b) => b.ticks - a.ticks);
  const onCount = onCourtSlots.filter((s) => s.ratio > 0.5).length;
  const totalSlots = onCourtSlots.length;
  const rallyOnPct = t.rallies > 0 ? ((t.rallyOnCourtCount / t.rallies) * 100).toFixed(1) : 'N/A';
  const density = t.rallyOnCourtCount > 0 ? (t.touchesOnCourt / t.rallyOnCourtCount).toFixed(2) : 'N/A';
  console.log(`${label}（${role}）`);
  console.log(`  在場輪轉比例（tick 計）：${onCourtPct}%（onCourtTicks=${t.onCourtTicks} / totalTicks=${t.totalTicks}）`);
  console.log(`  在場輪轉比例（rally 計）：${rallyOnPct}%（在場時結束的 rally ${t.rallyOnCourtCount} / 總 rally ${t.rallies}）`);
  console.log(`  六輪轉槽位分布：${totalSlots} 個相異槽位中，${onCount} 個在場（各槽位 on-court ratio：`
    + `${onCourtSlots.map((s) => `${s.fp}=${(s.ratio * 100).toFixed(0)}%`).join('、')}）`);
  console.log(`  在場時觸球密度＝在場 rally 期間觸球數 ÷ 在場 rally 數：${t.touchesOnCourt} / ${t.rallyOnCourtCount} = ${density} 次/回合`);
  console.log(`  在場時觸球 ${t.touchesOnCourt}　不在場時觸球 ${t.touchesOffCourt}${t.touchesOffCourt > 0 ? '　⚠異常：不在場仍記到觸球，需交代' : ''}`);
  console.log('');
}

// ---- 08-06 第二輪追加：接發球／防守起球依角色分佈（固定陣容，全隊歸戶）----
// 動機：缺口 100% 在「在場也沒球來」——下一題是「球為什麼不來」。真排球自由人是接發主力，
// 若引擎裡他吃不到球，要分清是①仲裁邏輯結構性排除他 ②他只在 4/6 輪轉、責任區覆蓋面本來
// 就比雙 OH／雙 MB 小 ③兩者都有。不換受控玩家，跑一組固定陣容（role='outside' 基準先發，
// 與最早的 OH 局一致：starters=[A1,A2,A3,A4,A5,A6]、libero=AL），統計「全隊」逐位置觸球歸戶。
//
// 接發球 vs 防守起球的判定：engine 本身在 executeTouch 用 `rally.profile === 'serve'`
// 判斷是否為發球接發懲罰對象（src/sim/game.js:596-601，`isReceiveLike && profile==='serve'`
// 才吃 serveRecvMul）——這是 engine 自己的判準，不是本探針發明的。但 executeTouch 在同一次
// 呼叫裡會把 rally.profile 覆寫成 'arc'（src/sim/game.js:714）才 push TOUCH 事件
// （src/sim/game.js:719-730），所以事件本身不帶這個資訊——必須在呼叫 stepGame 之前，
// 於「這一 tick 即將發生的觸球」發生前先取樣 `game.rally.profile`，同一手法已用於
// on-court 取樣（見上一段）。取樣值='serve' 且本 tick 產生 kind='receive' 的 TOUCH ⇒
// 判定接發球；否則（'arc'／'spike'）⇒ 判定防守起球（dig／free-ball pass，engine 不分這兩種，
// 一律 action='receive'，如實合併統計，不可拆得更細）。
function runRoleBreakdown() {
  const ROLE_KEYS = ['setter', 'outside', 'middle', 'opposite', 'libero'];
  const roleTally = Object.fromEntries(ROLE_KEYS.map((r) => [r, { serveRecv: 0, dig: 0 }]));
  // 結構排除的實測驗證（對照 ai.js arbitrate 的 formationExempt）：
  // 前排 MB／二傳 在「接發球」桶裡各自的計數（規則稱應被排除在候選外，量出來看是不是真的趨近 0）
  let frontMbServeRecv = 0;
  let setterServeRecv = 0;
  let setsPlayed = 0;
  let totalTicks = 0;

  for (let run = 0; run < SETS; run += 1) {
    const seed = SEED_BASE + run * SEED_STRIDE;
    const career = createCareer({ seed, playerName: '探針' });
    const player = createCareerPlayer('探針');
    player.currentRole = 'outside';
    player.naturalRole = 'outside';
    const roster = { capacity: 12, members: buildStarterMembers() };
    const entry = { id: 'group-3', stage: 'group', opponentId: OPPONENT_ID, label: '' };
    const setup = careerMatchSetup(career, player, entry, roster, null);
    const game = createGame({
      seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
      liberos: setup.liberos, setTarget: 25, comboScale: setup.comboScale,
      ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
      ...(setup.benches ? { benches: setup.benches } : {}),
    });
    const ai = createAiState();
    let guard = 0;
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
      guard += 1;
      totalTicks += 1;
      const profileBefore = game.rally.profile; // 取樣在這一 tick 的觸球「發生前」
      const intents = aiCollectIntents(game, ai, []);
      const events = stepGame(game, intents);
      for (const e of events) {
        if (e.type !== 'TOUCH' || e.kind !== 'receive' || e.team !== 'A') continue;
        const toucher = game.players[e.playerId];
        const role = toucher?.currentRole;
        if (!roleTally[role]) continue; // 防呆：非五格角色（不應發生）
        const wasServe = profileBefore === 'serve';
        if (wasServe) {
          roleTally[role].serveRecv += 1;
          const frontMb = role === 'middle' && isFrontRow(game.match.rotations.A, e.playerId);
          if (frontMb) frontMbServeRecv += 1;
          if (role === 'setter') setterServeRecv += 1;
        } else {
          roleTally[role].dig += 1;
        }
      }
    }
    setsPlayed += 1;
  }

  const totalServeRecv = ROLE_KEYS.reduce((s, r) => s + roleTally[r].serveRecv, 0);
  const totalDig = ROLE_KEYS.reduce((s, r) => s + roleTally[r].dig, 0);

  console.log('\n=== 追加量測 2：接發球／防守起球依角色分佈（固定陣容，全隊歸戶）===');
  console.log(`固定陣容＝role='outside' 基準先發（starters=[A1,A2,A3,A4,A5,A6]，libero=AL），同一組 ${setsPlayed} 局 seed，全隊逐 tick 取樣（totalTicks=${totalTicks}）\n`);
  console.log('位置\t接發球次數\t接發球%\t防守起球次數\t防守起球%');
  for (const role of ROLE_KEYS) {
    const t = roleTally[role];
    const srPct = totalServeRecv > 0 ? ((t.serveRecv / totalServeRecv) * 100).toFixed(1) : '0.0';
    const digPct = totalDig > 0 ? ((t.dig / totalDig) * 100).toFixed(1) : '0.0';
    console.log(`${role}\t${t.serveRecv}\t${srPct}%\t${t.dig}\t${digPct}%`);
  }
  console.log(`合計\t${totalServeRecv}\t100.0%\t${totalDig}\t100.0%`);

  console.log('\n--- 結構排除的實測驗證（對照 src/sim/ai.js:616-645 arbitrate）---');
  console.log(`前排 MB 拿到「接發球」次數：${frontMbServeRecv}（規則：formationExempt 時 role==='middle' 且前排 ⇒ 候選排除，見 ai.js:612-614,627）`);
  console.log(`二傳 拿到「接發球」次數：${setterServeRecv}（規則：formationExempt 時 role==='setter' ⇒ 一律候選排除，見 ai.js:627）`);
  console.log('（注意：candidate 排除只影響 AI 的走位/仲裁目標，不是觸球執行的硬性門檻——若這裡量到非零值，代表排除是「軟性」而非「硬性」，需如實報告，不得假設為 0）');

  return { roleTally, totalServeRecv, totalDig, frontMbServeRecv, setterServeRecv, setsPlayed };
}

runRoleBreakdown();
