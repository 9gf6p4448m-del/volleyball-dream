// 遠段（preview）分配面板到底開不開得出來 —— 快速比賽・玩家＝舉球員（S）
//
// 用法：
//   node tools/set-preview-gate-probe.mjs [局數=20]
//
// ★ 零 `src/` 改動 ★ 本檔對 `src/`、`tests/` 一個位元組都不寫。
//
// ── 要回答的三題 ────────────────────────────────────────────
// Q1 `setDeciding`（matchLoop.js:844-846）由 false 轉 true 的那一 tick，
//    `setEtaOf(aiState, game.tick)`（setOptions.js:166）是多少？> SET_READY_TICKS(55)
//    的比率＝遠段本來就開得出來的比率。
// Q2 整個 `setDeciding` 為真的期間，`setStageOf(eta)==='preview'` 的 tick 佔比；
//    以及**每一波有沒有出現過至少一個 preview tick**（＝玩家看不看得到遠段）。
// Q3 `setDeciding` 的各條件裡，是哪一個最後才成立（＝把時點拖到 55 以內的那一個）。
//
// ── 證據取得路徑 ────────────────────────────────────────────
// 玩家那一份走**真實 `createMatchControls`**（`src/input/matchControls.js:64`）：
// 假 domElement／真 THREE.PerspectiveCamera／no-op rig（照抄 tools/block-rejump-probe.mjs
// 的建置段），每 tick 呼叫 `controls.collect(game, ai)`。
// `setZones` 一律取 `controls.setOptions(game)`（matchControls.js:585）——不自己重寫判定。
// `setEtaOf`／`setStageOf`／`SET_READY_TICKS` 一律 import 自 `src/input/setOptions.js`。
//
// ── 每 tick 的呼叫順序＝逐字對齊 matchLoop ──────────────────
//   ① 面板判定（matchLoop.js:843-852，用「這一 tick 的 game」＋「上一 tick collect 存下的
//      lastAiState」——面板段在 matchLoop 裡跑在 collect 之前）
//   ② stage.controls.collect(game, aiState)      （matchLoop.js:1136）
//   ③ aiCollectIntents(game, aiState, [受控者])   （matchLoop.js:1153）
//   ④ stepGame                                    （matchLoop.js:1155）
// 順序若倒過來，`setEta` 會差一整個 tick 的 planTick 基準，Q1 就不可比。
//
// ── 受控者 ──────────────────────────────────────────────────
// `buildQuickSetup('setter')`（`src/app/matchConfig.js:18`，＝網址 `?quick=1&role=setter`
// 走的同一支）產 teams，受控槽位 'A2'。開局印出 `game.players.A2.currentRole` 存證。
// 玩家全程**不按任何鍵、不點任何選項**（＝使用者回報的情境：面板沒出現所以沒得點）；
// 走位靠簡化模式的自動帶位。
//
// tick↔秒：SIM_HZ = 60 ⇒ 1 tick = 1/60 s。

const SETS = Number.parseInt(process.argv[2] ?? process.env.SP_SETS ?? '20', 10);
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
const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
const { createMatchControls } = await import('../src/input/matchControls.js');
const { serverId } = await import('../src/sim/match.js');
const { buildQuickSetup } = await import('../src/app/matchConfig.js');
const { buildLibero } = await import('../src/career/careerState.js');
const { setEtaOf, setStageOf, SET_READY_TICKS } = await import('../src/input/setOptions.js');

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
// 單局
// ════════════════════════════════════════════════════════
const waves = [];        // 每一波（我方第二觸窗）一筆
let roleSeen = null;

function runSet(seed) {
  const quick = buildQuickSetup('setter');
  if (!quick) throw new Error('buildQuickSetup("setter") 回 null');
  // gameOptions 逐項對齊 `resolveMatchConfig` 的快速比賽分支（matchConfig.js:101-113,120-130）：
  // teams=quick.teams、雙方自由人、stamina 空物件、momentum:true、bestOf 1（不傳 series）
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

  const newWave = (flightId) => ({
    flightId,
    // 條件的最近一次 false→true 轉換 tick（求「最後成立的是哪一個」用）
    on: { A: false, B: false, C: false, D: false, E: false },
    turned: { A: null, B: null, C: null, D: null, E: null },
    etaAt: { A: null, B: null, C: null, D: null, E: null },
    decidingFirstTick: null,
    decidingFirstEta: null,
    blocker: null,        // setDeciding 首次成立時，最晚才轉真的那個條件
    decidingTicks: 0,
    previewTicks: 0,
    anyPreview: false,
    everDeciding: false,
    winOpenEta: null,     // 窗（sim 層第二觸窗）開啟那一刻的 eta（與舊探針口徑對照）
    tier: null,           // 一傳品質（分層檢查：確認樣本不是單一情境）
    isSetter: game.players[ME].currentRole === 'setter',
  });

  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const r = game.rally;

    // ── ① 面板判定（逐字對齊 matchLoop.js:843-852）──
    const setZones = controls.setOptions(game);
    const condA = setZones !== null;                 // isSetMoment（我方第二觸＋claim 給我＋我是 S）
    const condB = condA && setZones.length > 0;      // 選項池非空
    const condC = game.ball.vy < 0;                  // 球在下墜
    const condD = game.ball.y > 1.8;                 // 球高於 1.8m
    const condE = !controls.setPending();            // 尚未分配
    const setDeciding = condA && condB && condC && condD && condE;
    const setEta = setEtaOf(ai, game.tick);
    const stage = setStageOf(setEta);

    // ── 波的開闔：sim 層第二觸窗（與舊探針同口徑）──
    const inWindow = game.phase === 'rally' && r.possession === MY_TEAM && r.touches === 1;
    if (inWindow) {
      if (!cur || cur.flightId !== r.flightId) {
        if (cur) waves.push(cur);
        cur = newWave(r.flightId);
        cur.winOpenEta = setEta;
      }
      // 一傳品質（分層檢查用；窗內可能延後才定案，取最後一次見到的值）
      if (ai.passTier) cur.tier = ai.passTier;
      const now = { A: condA, B: condB, C: condC, D: condD, E: condE };
      for (const k of ['A', 'B', 'C', 'D', 'E']) {
        if (now[k] && !cur.on[k]) { cur.turned[k] = game.tick; cur.etaAt[k] = setEta; }
        cur.on[k] = now[k];
      }
      if (setDeciding) {
        if (cur.decidingFirstTick == null) {
          cur.decidingFirstTick = game.tick;
          cur.decidingFirstEta = setEta;
          cur.everDeciding = true;
          // 最後才轉真的條件＝把窗擋到這一刻的那一個
          let best = null;
          for (const k of ['A', 'B', 'C', 'D', 'E']) {
            if (cur.turned[k] == null) continue;
            if (best == null || cur.turned[k] > cur.turned[best]) best = k;
          }
          cur.blocker = best;
        }
        cur.decidingTicks += 1;
        if (stage === 'preview') { cur.previewTicks += 1; cur.anyPreview = true; }
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

    // ── ③④ AI ＋ 前進 ──
    const intents = [...playerIntents, ...aiCollectIntents(game, ai, [ME])];
    // ★ 舊探針 tools/set-window-eta-probe.mjs:31-44 的取樣點**逐字複製**：
    //   它在 `aiCollectIntents` 之後、`stepGame` 之前判 inWindow，且 openEta 取
    //   `ai.setContactPoint?.ticks` **原始值（不扣 planTick）**。兩個差別都會改結果，
    //   所以這裡照它的位置與公式再取一份，才有資格拿來對照它的舊數字。
    if (inWindow && cur && cur.oldStyleOpenEta === undefined) {
      cur.oldStyleOpenEta = ai.setContactPoint?.ticks ?? null;
    }
    stepGame(game, intents);
  }
  if (cur) waves.push(cur);
}

for (let s = 1; s <= SETS; s += 1) runSet(s);

// ════════════════════════════════════════════════════════
// 統計
// ════════════════════════════════════════════════════════
const q = (arr, p) => {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p * a.length))];
};
const fmt = (v, d = 1) => (v == null ? '  n/a' : v.toFixed(d).padStart(6));
const sePct = (k, n) => (n ? 100 * Math.sqrt((k / n) * (1 - k / n) / n) : NaN);
const pct = (k, n) => `${(100 * k / (n || 1)).toFixed(1)}%`;

console.log(`=== 遠段分配面板閘門探針（${SETS} 局，快速比賽 role=setter）===\n`);
console.log(`受控者 ${ME} 的 currentRole 實際值：${roleSeen}`);
console.log(`SET_READY_TICKS = ${SET_READY_TICKS}`);
console.log(`sim 層第二觸窗總波數：${waves.length}`);
const setterWaves = waves.filter((w) => w.isSetter);
const dec = setterWaves.filter((w) => w.everDeciding);
console.log(`其中受控者為 S 的：${setterWaves.length}`);
console.log(`其中 setDeciding 曾成立（面板真的彈過）的：${dec.length}`
  + `（${pct(dec.length, setterWaves.length)}）\n`);

// ---- Q1 ----
console.log('---- Q1：setDeciding 由 false→true 那一 tick 的 setEta ----');
const q1 = dec.filter((w) => Number.isFinite(w.decidingFirstEta)).map((w) => w.decidingFirstEta);
const q1null = dec.length - q1.length;
console.log(`分母（面板開窗次數）n = ${q1.length}` + (q1null ? `（另有 ${q1null} 波 eta 算不出＝null）` : ''));
if (q1.length) {
  const mean = q1.reduce((a, b) => a + b, 0) / q1.length;
  console.log(`min ${fmt(Math.min(...q1), 0)}  p10 ${fmt(q(q1, 0.1), 0)}  p50 ${fmt(q(q1, 0.5), 0)}`
    + `  p90 ${fmt(q(q1, 0.9), 0)}  max ${fmt(Math.max(...q1), 0)}  平均 ${fmt(mean)}`);
  const gt = q1.filter((v) => v > SET_READY_TICKS).length;
  console.log(`> ${SET_READY_TICKS}（＝開窗當下就判為遠段）：${gt}/${q1.length}`
    + ` = ${pct(gt, q1.length)} ± ${sePct(gt, q1.length).toFixed(1)}pp`);
}
// 分層檢查：樣本不是單一情境（三個一傳品質檔都要有量，且各自的 >55 比率都要看）
console.log('\n  按一傳品質分層（確認 44 這個值不是單一情境的產物）：');
console.log('  tier         n     min   p50   max    >55');
for (const t of ['perfect', 'ok', 'poor', null]) {
  const sub = dec.filter((w) => w.tier === t && Number.isFinite(w.decidingFirstEta));
  if (!sub.length) continue;
  const v = sub.map((w) => w.decidingFirstEta);
  const gt = v.filter((x) => x > SET_READY_TICKS).length;
  console.log(`  ${String(t ?? '(無)').padEnd(10)}${String(sub.length).padStart(4)}`
    + `  ${fmt(Math.min(...v), 0)} ${fmt(q(v, 0.5), 0)} ${fmt(Math.max(...v), 0)}   ${pct(gt, v.length)}`);
}
// null 的意思：setStageOf(null)==='ready' ⇒ 一樣不開遠段
if (q1null) {
  console.log(`  ⚠ eta=null 的 ${q1null} 波：setStageOf(null) 回 'ready'（setOptions.js:178）⇒ 也不開遠段`);
}

// ---- Q2 ----
console.log('\n---- Q2：分配窗期間 preview 的佔比 ----');
const totDec = dec.reduce((a, w) => a + w.decidingTicks, 0);
const totPrev = dec.reduce((a, w) => a + w.previewTicks, 0);
console.log(`tick 口徑：preview tick / setDeciding tick = ${totPrev}/${totDec} = ${pct(totPrev, totDec)}`);
const anyPrev = dec.filter((w) => w.anyPreview).length;
console.log(`波口徑（玩家看不看得到）：至少一個 preview tick 的波 = ${anyPrev}/${dec.length}`
  + ` = ${pct(anyPrev, dec.length)} ± ${sePct(anyPrev, dec.length).toFixed(1)}pp`);
const durs = dec.map((w) => w.decidingTicks);
console.log(`（附）分配窗長度 tick：p10 ${fmt(q(durs, 0.1), 0)}  p50 ${fmt(q(durs, 0.5), 0)}`
  + `  p90 ${fmt(q(durs, 0.9), 0)}  max ${fmt(Math.max(...durs), 0)}`);

// ---- Q3 ----
console.log('\n---- Q3：setDeciding 的哪一個條件最後才成立 ----');
const LABEL = {
  A: 'A isSetMoment（我方第二觸＋claim 給我＋我是 S）',
  B: 'B setZones.length > 0',
  C: 'C game.ball.vy < 0（球在下墜）',
  D: 'D game.ball.y > 1.8',
  E: 'E !controls.setPending()',
};
for (const k of ['A', 'B', 'C', 'D', 'E']) {
  const n = dec.filter((w) => w.blocker === k).length;
  console.log(`${LABEL[k].padEnd(46)} 最後成立：${String(n).padStart(4)}/${dec.length} = ${pct(n, dec.length)}`);
}
console.log('\n各條件首次成立時的 setEta（分佈；n＝該條件在窗內有轉真紀錄的波數）：');
console.log('條件   n      p10    p50    p90');
for (const k of ['A', 'B', 'C', 'D', 'E']) {
  const v = dec.map((w) => w.etaAt[k]).filter((x) => Number.isFinite(x));
  if (!v.length) { console.log(`${k}      0        —      —      —`); continue; }
  console.log(`${k}   ${String(v.length).padStart(4)}  ${fmt(q(v, 0.1), 0)} ${fmt(q(v, 0.5), 0)} ${fmt(q(v, 0.9), 0)}`);
}

// ---- 與舊探針口徑對照 ----
console.log('\n---- 對照：舊探針 tools/set-window-eta-probe.mjs 的口徑 ----');
const oldOpen = setterWaves.map((w) => w.oldStyleOpenEta).filter((x) => Number.isFinite(x));
console.log(`【舊探針口徑複製】sim 窗開啟時的 setContactPoint.ticks（aiCollectIntents 之後取樣、`
  + `**不扣 planTick**）：p10 ${fmt(q(oldOpen, 0.1), 0)} p50 ${fmt(q(oldOpen, 0.5), 0)}`
  + ` p90 ${fmt(q(oldOpen, 0.9), 0)}（n=${oldOpen.length}）`);
const oldPrev = oldOpen.filter((v) => setStageOf(v) === 'preview').length;
console.log(`  → setStageOf 判 preview 的比率：${pct(oldPrev, oldOpen.length)}`
  + `  ← 舊探針那個「100.0%」量的就是這一格`);
console.log('  ⚠ 它量的是「sim 第二觸窗一開，理論上剩餘時間 > 55」，**不是**「面板真的開得出遠段」——');
console.log('     面板還要再等 setDeciding 的四個條件全成立（見 Q3），那時 eta 已掉到 44。');
const decOpen = setterWaves.map((w) => w.winOpenEta).filter((x) => Number.isFinite(x));
console.log(`（附）同一時刻但走 setEtaOf（已扣 planTick、面板判定點取樣）：`
  + `p50 ${fmt(q(decOpen, 0.5), 0)}（n=${decOpen.length}）`
  + ` → preview 比率 ${pct(decOpen.filter((v) => setStageOf(v) === 'preview').length, decOpen.length)}`);
console.log('  ↑ 這一格低是因為窗剛開時 aiState 還握著**上一段 flight** 的計畫（面板段跑在'
  + ' aiCollectIntents 之前，matchLoop.js:843 vs :1153），不是遠段閘門的證據。');
