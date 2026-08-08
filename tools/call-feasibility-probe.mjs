// 叫戰術可行性全面檢視 —— 快速比賽・玩家＝舉球員（S）・遠段面板
//
// ★★★ 2026-08-08 警告：本探針的治具有偏差，數字不得直接引用 ★★★
// 受控玩家治具在 **S 位是壞的**：實測受控 S 打成 **0:25**（同建隊的純 AI 是 23:25）。
// 我方一分不得 ⇒ **永遠不輪轉** ⇒ 只量得到單一輪次的攻擊池。
// 而本探針要量的 `hasQuick` 之類的條件**正是隨輪轉變動的量** ⇒ 系統性偏誤，
// 不是雜訊，加樣本也修不掉（`02 §6.1` 條 5：量測位置錯的話，樣本數本身沒有意義）。
// ⇒ 要量「一波排不排得出某戰術」，改在**純 AI vs AI 生涯局**取樣
//   （同一支 `callFeasibilityOf`、同一個第二觸規劃窗，只是不經 UI 層）——
//   可抄 `tools/camp-bquick-baseline-probe.mjs` 的做法。
// ⇒ 本檔保留是因為它仍能回答「UI 層在 S 位會列出什麼」這類**不依賴輪轉**的問題；
//   凡結論會隨輪轉改變的（可行率、reason 分佈、分層），**一律不得用本檔的輸出**。
//
// 用法：
//   node tools/call-feasibility-probe.mjs [局數=60]
//
// ★ 零 `src/` 改動 ★ 本檔對 `src/`、`tests/` 一個位元組都不寫。
//
// ── 要回答的四題（Sawmah 2026-08-03「幫我檢視所有的戰術」）──────────
// Q1 每一種戰術的**可行率**（波為單位，取該波第一次查詢的結果）
// Q2 不可行時 `reason` 的分佈（逐 reason、逐戰術）
// Q3 「至少列得出一個選項」的波比率（＝裁定乙落地後玩家還剩多少機會叫得到）
// Q4 Q1／Q3 再按 `aiState.passTier` 分層
//
// ── 證據取得路徑（不重寫任何判定）──────────────────────────
// · 可行性一律呼叫 `callFeasibilityOf`（`src/sim/ai.js:917`）——與 UI
//   （`matchLoop.js:1059`）**同一支函式、同一個取樣點**。不自己重建池。
// · 戰術清單一律 `offeredCallTypes()`（`src/sim/approach.js:943`），開場印出。
// · 玩家那一份走**真實 `createMatchControls`**（`src/input/matchControls.js`）：
//   假 domElement／真 THREE.PerspectiveCamera／no-op rig（建置段照抄
//   `tools/set-preview-gate-probe.mjs`）。`setZones` 取 `controls.setOptions(game)`。
//
// ── 取樣位置（★ 已避開 set-preview-gate-probe 第四段記過的那個坑 ★）────
// matchLoop 的面板段（:844-865、:1052-1091）跑在 `controls.collect` 與
// `aiCollectIntents` **之前**，讀的是**上一 tick 收尾後**的 aiState。
// 本探針的主口徑（位置①）逐字對齊它——因為要量的是「玩家實際看到的面板」，
// 就必須用玩家實際看到的那一份 aiState，不是「理論上比較新的」那一份。
// 那個坑（拿到上一段 flight 的計畫）之所以在舊探針會咬人，是因為它量的是
// **窗剛開那一刻**的 eta；本探針的波起點是「遠段面板**真的**開著的第一個 tick」，
// 而 `callFeasibilityOf` 內部的 `replanContextOf`（ai.js:890-904）自己就擋掉了
// 跨 flight 的殘留（`aiState.approach?.team !== team` ⇒ 回 null，計為 null 而非誤判）。
// 為了證明不是自說自話，另同時取**位置③'**（`aiCollectIntents` 之後、`stepGame`
// 之前）的第二份樣本並列印對照；兩者若一致，代表這一格不受該坑影響。
//
// 每 tick 的呼叫順序：
//   ① 面板判定＋callFeasibilityOf（matchLoop.js:844-865, 1052-1091）
//   ② controls.collect(game, aiState)      （matchLoop.js:1136 對應位）
//   ③ aiCollectIntents(game, aiState,[ME]) （matchLoop.js:1153 對應位）
//   ③' 對照用的第二次 callFeasibilityOf
//   ④ stepGame
//
// ── 受控者 ──────────────────────────────────────────────────
// `buildQuickSetup('setter')`（`src/app/matchConfig.js:18`），受控槽位 'A2'。
// 玩家全程**不按任何鍵、不點任何選項**（只代發球，否則卡死在 serve 相）。
// 快速比賽的 `gates.canCallPlay` 恆為 true（matchConfig.js:187，tech===null ＋
// comboScale ?? 1 > 0）⇒ 面板一定會走到 `callFeasibilityOf` 那一行。

const SETS = Number.parseInt(process.argv[2] ?? '60', 10);
const ME = 'A2';
const MY_TEAM = 'A';
const MAX_TICKS = 400000;

// ── 瀏覽器全域替身（createMatchControls 在建構時掛 window 監聽）──
const winListeners = {};
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  addEventListener(type, fn) { (winListeners[type] ??= []).push(fn); },
  removeEventListener(type, fn) {
    const a = winListeners[type];
    if (a) winListeners[type] = a.filter((f) => f !== fn);
  },
};
const resetListeners = () => { for (const k of Object.keys(winListeners)) delete winListeners[k]; };

const THREE = await import('three');
const { createGame, stepGame } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents, callFeasibilityOf } = await import('../src/sim/ai.js');
const { createMatchControls } = await import('../src/input/matchControls.js');
const { serverId } = await import('../src/sim/match.js');
const { buildQuickSetup } = await import('../src/app/matchConfig.js');
const { buildLibero } = await import('../src/career/careerState.js');
const { setEtaOf, setStageOf, SET_READY_TICKS } = await import('../src/input/setOptions.js');
const { offeredCallTypes } = await import('../src/sim/approach.js');
const { CALL_LABELS } = await import('../src/input/callPlay.js');

const TYPES = offeredCallTypes();

function makeControls() {
  resetListeners();
  const dom = { addEventListener() {} };
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
  camera.position.set(0, 6, 14);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const rig = {
    setLook() {}, resetLook() {}, setSetScan() {}, setAttackView() {}, setDefendView() {},
    gazePoint() { return null; },
    getMode() { return 'third'; },
  };
  return createMatchControls(dom, camera, ME, rig, true); // simpleMode=true＝決策模式
}

// ════════════════════════════════════════════════════════
// 取樣
// ════════════════════════════════════════════════════════
const waves = [];      // 每一波（遠段面板開著的一段）一筆
let roleSeen = null;
let remoteTicks = 0;   // 遠段面板為真的 tick 總數
let remoteNullTicks = 0; // 其中 callFeasibilityOf 回 null 的 tick 數

function runSet(seed) {
  const quick = buildQuickSetup('setter');
  if (!quick) throw new Error('buildQuickSetup("setter") 回 null');
  const game = createGame({
    seed,
    teams: quick.teams,
    setTarget: 25,
    liberos: { A: quick.liberoA ?? buildLibero('A', 'A隊自由人'), B: buildLibero('B', 'B隊自由人') },
    stamina: { A: {}, B: {} },
    momentum: true,
  });
  if (!game.players[ME]) throw new Error(`受控槽位 ${ME} 不存在`);
  roleSeen = game.players[ME].currentRole;
  const ai = createAiState();
  const controls = makeControls();

  let cur = null;
  let guard = 0;
  let servedThisTurn = false;

  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const r = game.rally;

    // ── ① 面板判定（逐字對齊 matchLoop.js:844-865）──
    const setZones = controls.setOptions(game);
    const setDeciding = !!setZones && setZones.length > 0
      && game.ball.y > 1.8 && !controls.setPending();
    const setEta = setEtaOf(ai, game.tick);
    const setReady = !setDeciding || setStageOf(setEta) === 'ready';
    const remote = setDeciding && !setReady; // ＝ matchLoop.js:1052 的 `!setReady` 分支
    // 面板段呼叫可行性（matchLoop.js:1059；快速比賽 canCallPlay 恆 true）
    const feas = remote ? callFeasibilityOf(game, ai) : null;

    if (remote) {
      remoteTicks += 1;
      if (!feas) remoteNullTicks += 1;
      // 一波＝同一個 flightId 的遠段面板期；波的代表值＝**第一次查詢**的結果
      if (!cur || cur.flightId !== r.flightId || cur.setSeed !== seed) {
        if (cur) waves.push(cur);
        cur = {
          setSeed: seed,
          flightId: r.flightId,
          tick: game.tick,
          eta: setEta,
          tier: ai.passTier ?? null,
          isSetter: game.players[ME].currentRole === 'setter',
          first: feas,        // 位置①（＝玩家看到的那一份）
          firstAlt: undefined, // 位置③'（對照）
          everFeasible: {},   // 整波內曾經可行過的型別（補充口徑）
          everInfeasible: {}, // 整波內曾經不可行過的型別（翻轉偵測用）
          lastReason: {},     // 波內最後一次查到的 reason（與 first 對照）
        };
      }
      if (feas) {
        for (const t of TYPES) {
          if (feas[t]?.feasible) cur.everFeasible[t] = true;
          else cur.everInfeasible[t] = true;
          cur.lastReason[t] = feas[t]?.reason ?? null;
        }
      }
    } else if (cur) {
      waves.push(cur);
      cur = null;
    }

    // ── ② 玩家 intent（真實 matchControls；不按任何鍵）──
    const playerIntents = [...controls.collect(game, ai)];

    // 代發：A2 輪到發球時沒人代勞會卡死在 serve 相
    if (game.phase !== 'serve') servedThisTurn = false;
    else if (serverId(game.match) === ME && game.tick >= game.serveReadyTick && !servedThisTurn) {
      const zs = controls.serveZones(game);
      if (zs && zs.length) { controls.serveNow(game, zs[0].aim, null); servedThisTurn = true; }
    }

    // ── ③ AI ──
    const intents = [...playerIntents, ...aiCollectIntents(game, ai, [ME])];
    // ── ③' 對照取樣（aiCollectIntents 之後、stepGame 之前）──
    if (remote && cur && cur.firstAlt === undefined) {
      cur.firstAlt = callFeasibilityOf(game, ai);
    }
    stepGame(game, intents);
  }
  if (cur) waves.push(cur);
}

for (let s = 1; s <= SETS; s += 1) runSet(s);

// ════════════════════════════════════════════════════════
// 統計
// ════════════════════════════════════════════════════════
const pct = (k, n) => `${(100 * k / (n || 1)).toFixed(1)}%`;
const sePct = (k, n) => (n ? 100 * Math.sqrt((k / n) * (1 - k / n) / n) : NaN);

console.log(`=== 叫戰術可行性檢視（${SETS} 局，快速比賽 role=setter）===\n`);
console.log(`受控者 ${ME} 的 currentRole 實際值：${roleSeen}`);
console.log(`offeredCallTypes() 實際回傳：[${TYPES.map((t) => `${t}(${CALL_LABELS[t] ?? '?'})`).join(', ')}]`);
console.log(`SET_READY_TICKS = ${SET_READY_TICKS}`);
console.log(`取樣位置：① matchLoop 面板段（collect／aiCollectIntents 之前）＝主口徑`);
console.log(`遠段面板為真的 tick：${remoteTicks}（其中 callFeasibilityOf 回 null：`
  + `${remoteNullTicks} = ${pct(remoteNullTicks, remoteTicks)}）`);

const all = waves.filter((w) => w.isSetter);
const nonNull = all.filter((w) => w.first !== null);
console.log(`遠段面板波數（S）：${all.length}`);
console.log(`其中第一次查詢就拿得到可行性表（非 null）：${nonNull.length}`
  + ` = ${pct(nonNull.length, all.length)}\n`);

// ---- 位置①／③' 一致性（證明沒踩到「讀到上一段 flight」的坑）----
let agree = 0; let disagree = 0; let cmpN = 0;
for (const w of all) {
  if (w.first === undefined || w.firstAlt === undefined) continue;
  cmpN += 1;
  const a = w.first; const b = w.firstAlt;
  if ((a === null) !== (b === null)) { disagree += 1; continue; }
  if (a === null) { agree += 1; continue; }
  const same = TYPES.every((t) => a[t]?.feasible === b[t]?.feasible && a[t]?.reason === b[t]?.reason);
  if (same) agree += 1; else disagree += 1;
}
console.log(`---- 取樣位置對照（① vs ③'，逐波逐型比對 feasible＋reason）----`);
console.log(`一致 ${agree}/${cmpN} = ${pct(agree, cmpN)}；不一致 ${disagree}`);
console.log(`（不一致＝這一格會受「面板段讀到上一 tick aiState」影響；一致＝不受影響）\n`);

// ---- Q1 可行率 ----
console.log('---- Q1：每一種戰術的可行率（波＝第一次查詢，分母＝拿得到可行性表的波）----');
console.log('戰術                    可行/分母        比率      ±SE');
const feasibleCount = {};
for (const t of TYPES) {
  const k = nonNull.filter((w) => w.first[t]?.feasible).length;
  feasibleCount[t] = k;
  console.log(`${`${t}（${CALL_LABELS[t] ?? '?'}）`.padEnd(22)}${String(k).padStart(5)}/${String(nonNull.length).padEnd(6)}`
    + `  ${pct(k, nonNull.length).padStart(7)}   ±${sePct(k, nonNull.length).toFixed(1)}pp`);
}
console.log('\n（補充口徑）整波內「曾經」可行過的波比率——面板每 tick 重算，玩家有整段時間可按：');
for (const t of TYPES) {
  const k = nonNull.filter((w) => w.everFeasible[t]).length;
  console.log(`  ${`${t}`.padEnd(10)}${String(k).padStart(5)}/${nonNull.length} = ${pct(k, nonNull.length)}`);
}

// ---- Q2 失敗原因分佈 ----
console.log('\n---- Q2：不可行時的 reason 分佈（逐戰術；分母＝該型不可行的波數）----');
for (const t of TYPES) {
  const bad = nonNull.filter((w) => !w.first[t]?.feasible);
  console.log(`\n■ ${t}（${CALL_LABELS[t] ?? '?'}）不可行 ${bad.length}/${nonNull.length} = ${pct(bad.length, nonNull.length)}`);
  const cnt = new Map();
  for (const w of bad) {
    const rs = w.first[t]?.reason ?? '(null)';
    cnt.set(rs, (cnt.get(rs) ?? 0) + 1);
  }
  const rows = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
  for (const [rs, n] of rows) {
    console.log(`    ${String(rs).padEnd(14)}${String(n).padStart(5)}  ${pct(n, bad.length).padStart(7)}`
      + `  （佔全體遠段波 ${pct(n, nonNull.length)}）`);
  }
}

// ---- Q3 至少一種可用 ----
console.log('\n---- Q3：面板至少列得出一個選項的波比率 ----');
const anyOk = nonNull.filter((w) => TYPES.some((t) => w.first[t]?.feasible)).length;
console.log(`第一次查詢即有 ≥1 可行：${anyOk}/${nonNull.length} = ${pct(anyOk, nonNull.length)}`
  + ` ± ${sePct(anyOk, nonNull.length).toFixed(1)}pp`);
const anyOkEver = nonNull.filter((w) => TYPES.some((t) => w.everFeasible[t])).length;
console.log(`整波內曾有 ≥1 可行：      ${anyOkEver}/${nonNull.length} = ${pct(anyOkEver, nonNull.length)}`);
// 以「所有遠段面板波」為分母（含 callFeasibilityOf 回 null 那些＝面板一樣是空的）
console.log(`以全體遠段面板波為分母（null 波＝面板同樣空的）：${anyOk}/${all.length} = ${pct(anyOk, all.length)}`);
// 可行型別數的分佈
console.log('\n每一波可行型別數的分佈：');
const distN = new Map();
for (const w of nonNull) {
  const c = TYPES.filter((t) => w.first[t]?.feasible).length;
  distN.set(c, (distN.get(c) ?? 0) + 1);
}
for (const c of [...distN.keys()].sort((a, b) => a - b)) {
  console.log(`  可行 ${c} 種：${String(distN.get(c)).padStart(5)}/${nonNull.length} = ${pct(distN.get(c), nonNull.length)}`);
}

// ---- Q4 依一傳品質分層 ----
console.log('\n---- Q4：依 aiState.passTier 分層 ----');
const tiers = ['perfect', 'ok', 'poor', null];
console.log(`tier        n(波)    ${TYPES.map((t) => t.padEnd(9)).join('')}≥1 可行`);
for (const tier of tiers) {
  const sub = nonNull.filter((w) => w.tier === tier);
  if (!sub.length) continue;
  const cells = TYPES.map((t) => {
    const k = sub.filter((w) => w.first[t]?.feasible).length;
    return `${pct(k, sub.length)}`.padEnd(9);
  }).join('');
  const k1 = sub.filter((w) => TYPES.some((t) => w.first[t]?.feasible)).length;
  console.log(`${String(tier ?? '(無)').padEnd(10)}${String(sub.length).padStart(6)}   ${cells}${pct(k1, sub.length)}`);
}
console.log('\n（Q4 分子/分母原始值）');
for (const tier of tiers) {
  const sub = nonNull.filter((w) => w.tier === tier);
  if (!sub.length) continue;
  const parts = TYPES.map((t) => `${t}=${sub.filter((w) => w.first[t]?.feasible).length}/${sub.length}`);
  const k1 = sub.filter((w) => TYPES.some((t) => w.first[t]?.feasible)).length;
  console.log(`  ${String(tier ?? '(無)').padEnd(9)} ${parts.join('  ')}  ≥1=${k1}/${sub.length}`);
}

// ---- 文案可達性：裁定乙之後，失敗字卡還看得到嗎 ----
// 面板每一 tick 重算並濾掉不可行的；玩家只按得到「當下可行」的那些。
// ⇒ 失敗字卡（callFeedbackOf）只在「按下去那一刻可行、sim 執行那一刻不可行」時才出得來。
// 波內是否曾翻轉＝這個縫隙存不存在的直接量測。
console.log('\n---- 文案可達性：同一波內 feasible 有沒有翻轉過（真↔假）----');
for (const t of TYPES) {
  const flip = nonNull.filter((w) => w.everFeasible[t] && w.everInfeasible[t]).length;
  console.log(`  ${String(t).padEnd(10)}翻轉波 ${String(flip).padStart(5)}/${nonNull.length} = ${pct(flip, nonNull.length)}`);
}
const reasonChanged = nonNull.filter((w) => TYPES.some((t) => (w.first[t]?.reason ?? null) !== (w.lastReason[t] ?? null))).length;
console.log(`  波內 reason 變過（任一型）：${reasonChanged}/${nonNull.length} = ${pct(reasonChanged, nonNull.length)}`);

// ---- Q2 補充：分層看 reason（文案檢視要用）----
console.log('\n---- 補充：reason × passTier 交叉（判斷文案講的原因對不對得上）----');
for (const t of TYPES) {
  console.log(`\n■ ${t}`);
  for (const tier of tiers) {
    const sub = nonNull.filter((w) => w.tier === tier && !w.first[t]?.feasible);
    if (!sub.length) continue;
    const cnt = new Map();
    for (const w of sub) {
      const rs = w.first[t]?.reason ?? '(null)';
      cnt.set(rs, (cnt.get(rs) ?? 0) + 1);
    }
    const rows = [...cnt.entries()].sort((a, b) => b[1] - a[1])
      .map(([rs, n]) => `${rs}=${n}(${pct(n, sub.length)})`);
    console.log(`  ${String(tier ?? '(無)').padEnd(9)} n=${String(sub.length).padStart(4)}  ${rows.join('  ')}`);
  }
}
