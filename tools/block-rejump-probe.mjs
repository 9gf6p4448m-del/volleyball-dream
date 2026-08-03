// 「起跳攔網」按鈕的取捨量測 —— 手動早跳賭錯之後，自動跳攔有沒有把代價補回來？
//
// 用法：
//   node tools/block-rejump-probe.mjs [局數=60]
//   BR_OUT=<dir> node tools/block-rejump-probe.mjs 60   # 逐波原始資料落檔
//
// ★ 零 `src/` 改動 ★ 本檔對 `src/`、`tests/` 一個位元組都不寫，也不裝任何模組鉤子。
//
// ── 證據取得路徑（本檔的核心宣稱）──────────────────────────────
// 玩家那一份 intent **走真實 `createMatchControls`**（`src/input/matchControls.js:64`）：
// 用假的 domElement／camera／rig 在 node 建起來，每 tick 呼叫 `controls.collect(game, ai)`，
// 拿到的就是玩家真正送出的那一份 intent（含 `manual` 旗標、自動跳攔分支、走位接管語意）。
// **沒有重建輸入端、沒有自己組 createIntent。**
//   假物件只替換三樣純表現層的東西：
//     domElement.addEventListener → no-op（探針不發 pointer 事件，一律走方法呼叫）
//     camera                      → 真的 THREE.PerspectiveCamera（groundPoint 用得到）
//     rig                         → setLook/resetLook no-op、gazePoint()→null、getMode()→'third'
//   這三樣都不參與攔網判定（攔網 intent 不吃 aim/gaze/視線）。
//
// ── 兩條臂（同 seed 配對；trajectory 會發散，只比率不比逐波）──────
//   noPress ：A2 從不按「起跳攔網」⇒ 只有自動跳攔（matchControls.js:476-484）
//   early   ：A2 每次面板一出現就按 ⇒ chooseMbTiming(true) → blockTap()
//             按的時機＝matchLoop.js:861-863 的 `mbDeciding` 首次成立那一 tick
//             （mbOptions 非 null ∧ ¬(ball.vy<0 ∧ ball.y<2.3) ∧ ¬mbPending）
//
// ── 攔網窗的機制（量測位置的依據，game.js:487-503）──────────────
//   block intent → 若 `blockUntil < tick` 才**開新窗**（記 blockStartTick、記 manual 旗標）；
//   否則只是把 `blockUntil` 續期到 tick+48。⇒「二次起跳」的機械定義＝
//   **blockStartTick 改變**。只有續期＝同一次跳，不是二次起跳。
//   攔網接觸在球過網那一 tick 結算（game.js:1024 tryBlock），一波攻擊只結算一次
//   ⇒ 攔到／沒攔到可以唯一歸屬給「當下開著的那個窗」。
//
// tick↔秒：SIM_HZ = 60 ⇒ 1 tick = 1/60 s。
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETS = Number.parseInt(process.argv[2] ?? process.env.BR_SETS ?? '60', 10);
const OUTDIR = process.env.BR_OUT ?? null;
const ME = 'A2';       // 主控球員槽位（careerState.js:411 的硬性契約）
const MY_TEAM = 'A';
const OPP_TEAM = 'B';

// ── 瀏覽器全域替身（createMatchControls 在建構時掛 window 監聽）──
// ★ 不是 no-op ★ 監聽器真的收下來，走位靠**派送真的 keydown/keyup**（WASD）——
// 走的是 matchControls 內部的 `keys` Set → `readMove()` → intent.move 這條真實路徑，
// 連帶吃到 `manualOwned`（碰過搖桿＝整球歸你）的真實語意。
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
const fireKey = (type, code) => {
  for (const fn of [...(winListeners[type] ?? [])]) fn({ code, repeat: false, preventDefault() {} });
};

const THREE = await import('three');
const { createGame, stepGame } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
const { isFrontRow } = await import('../src/sim/rotation.js');
const { createMatchControls, NEAR_NET_Z } = await import('../src/input/matchControls.js');
const { serverId } = await import('../src/sim/match.js');
const { predictLanding } = await import('../src/sim/flight.js');
const { createCareer, createCareerPlayer, careerMatchSetup } =
  await import('../src/career/careerState.js');
const { buildStarterMembers } = await import('../src/career/roster.js');

const MAX_TICKS = 400000;
const OPP_ID = 'obsidian';

function makeControls() {
  resetListeners();   // 每局一組乾淨監聽（不讓上一局的 controls 也收到按鍵）
  const dom = { addEventListener() {} };
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
  camera.position.set(0, 6, 14);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const rig = {
    setLook() {}, resetLook() {}, setSetScan() {}, setAttackView() {},
    gazePoint() { return null; },
    getMode() { return 'third'; },
  };
  // simpleMode=true ＝決策模式（自動跳攔分支只在 simpleMode 下存在）
  return createMatchControls(dom, camera, ME, rig, true);
}

// ── 走位策略（兩臂完全相同，是共同基底不是自變數）────────────
// 為什麼需要：`matchControls.js:326-331` 明訂「前排防守不自動帶位」——玩家不推搖桿
// 就會停在職責位 z≈3.0（實測 p50=3.00），|z| ≥ NEAR_NET_Z(2.2) ⇒ 面板永不出現、
// 自動跳攔也永不成立。不走位＝兩臂都量不到東西。
// 站位目標**不是我重建的幾何**：x 讀 `controls.blockOptions(game, aiState)` 的「封斜線」
// 過網點（matchControls.js:705-717 → attackZones.js 的 crossingXOf）——那是遊戲自己
// 端給玩家看的攔網選項，不是我另外算的一份；z 用 0.6（AI 攔網手的網前深度，
// tools/block-divergence-probe.mjs:247 的 atNet 判準同值）。
// ⚠ 已知替代方案不可用：`aiState.blockPlan.byPid.A2` 在 A2 由玩家操控時**不存在**
//   （槽位由 `blockPlanFor` 在 AI 逐人決策時惰性建立，A2 被排除在 aiCollectIntents 外）。
const BLOCK_Z = 0.6;
const DEADBAND = 0.15;
function wantKeys(game, ai, front, defending, controls) {
  if (!front || !defending) return [];
  const A = game.actors[ME];
  const opts = controls.blockOptions(game, ai);
  const opt = opts ? (opts.find((o) => o.key === 'cross') ?? opts.find((o) => o.key === 'line')) : null;
  const tx = opt && opt.x != null ? opt.x : A.x;
  const out = [];
  if (A.z - BLOCK_Z > DEADBAND) out.push('KeyW');        // W＝朝網（A 隊 side=+1，z 減少）
  else if (BLOCK_Z - A.z > DEADBAND) out.push('KeyS');
  if (tx - A.x > DEADBAND) out.push('KeyD');
  else if (A.x - tx > DEADBAND) out.push('KeyA');
  return out;
}

function setupMatch(run) {
  const career = createCareer({ seed: 900000 + run * 7919, playerName: '探針' });
  const player = createCareerPlayer('探針');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const entry = { id: 'group-3', stage: 'group', opponentId: OPP_ID, label: '' };
  return careerMatchSetup(career, player, entry, roster, null);
}

// ════════════════════════════════════════════════════════
// 單局
// ════════════════════════════════════════════════════════
function runSet(run, arm) {
  const setup = setupMatch(run);
  const game = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
    liberos: setup.liberos, setTarget: 25,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
    ...(setup.benches ? { benches: setup.benches } : {}),
  });
  if (!game.players[ME]) throw new Error(`主控槽位 ${ME} 不存在`);
  const ai = createAiState();
  const controls = makeControls();

  const eps = [];       // 每一波對手攻擊
  let cur = null;
  let guard = 0;
  let servedThisTurn = false;   // 代發治具（照抄 matchLoop.js:1126-1132 的 ?autopilot=1 路徑）
  const held = new Set();       // 目前按住的走位鍵

  const openEp = (tick) => ({
    tick,
    pressTick: null,          // 按下「起跳攔網」的 tick
    pressOpened: null,        // 按下那一 tick 是否真的開了窗（可能被舊窗吃掉）
    manualWinTick: null,      // 手動窗的 blockStartTick
    windows: [],              // 本波內開啟的所有窗 {tick, manual, ballZ, dSpike, landTicks, airTAtCross}
    autoIntent: 0,            // 自動跳攔分支送出 block intent 的 tick 數
    autoIntentFirst: null,
    manualIntent: 0,
    spikeTick: null,          // 對手扣球出手 tick
    crossTick: null,          // 球過網（進我方半場）tick
    crossWin: null,           // 過網那一刻開著的窗（tick）
    crossAirT: null,          // 過網時的 airT（tick − blockStartTick）
    crossManual: null,        // 過網時窗的 manual 旗標
    touchTick: null,          // A2 的 BLOCK_TOUCH tick
    touchWin: null,           // 攔到時歸屬的窗
    front: false,             // 本波 A2 是否前排（波啟時）
    nearNet: false,           // 本波 A2 是否貼網（波啟時）
    eligible: false,          // 面板可用性（isMbMoment 曾成立）
    out: null,
  });

  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const r = game.rally;
    const A = game.actors[ME];
    const tick = game.tick;

    // 代發：A2 輪到發球時沒人代勞會卡死在 serve 相（matchLoop 的 autopilot 治具同路徑）
    if (game.phase !== 'serve') servedThisTurn = false;
    else if (serverId(game.match) === ME && game.tick >= game.serveReadyTick && !servedThisTurn) {
      controls.serveNow(game, controls.serveZones(game)[0].aim, null);
      servedThisTurn = true;
    }

    // ── 走位：前排＋對手持球（非發球飛行）＝走去牆位（真 keydown/keyup）──
    const front = game.phase === 'rally' && isFrontRow(game.match.rotations[MY_TEAM], ME);
    const defending = game.phase === 'rally' && r.possession && r.possession !== MY_TEAM &&
      r.profile !== 'serve';
    const want = new Set(wantKeys(game, ai, front, defending, controls));
    for (const k of held) if (!want.has(k)) { fireKey('keyup', k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { fireKey('keydown', k); held.add(k); }

    // ── 波的開闔（對手第二擊完成＝要攻擊了）──
    const inOppSet = game.phase === 'rally' && r.possession === OPP_TEAM && r.touches === 2;
    if (inOppSet && !cur) {
      cur = openEp(tick);
      cur.front = isFrontRow(game.match.rotations[MY_TEAM], ME);
      cur.nearNet = Math.abs(A.z) < NEAR_NET_Z;
    }

    // ── early 臂：面板一出現就按（＝最早可按的時機）──
    if (cur && arm === 'early') {
      const mbRead = controls.mbOptions(game, ai);
      const mbDeciding = !!mbRead && !controls.mbPending() &&
        !(game.ball.vy < 0 && game.ball.y < 2.3);
      if (mbDeciding && cur.pressTick == null) {
        controls.chooseMbTiming(true);   // ★ 真實路徑：面板回呼同一入口（matchLoop.js:953）★
        cur.pressTick = tick;
      }
    }
    if (cur && controls.isMbMoment(game)) cur.eligible = true;

    const beforeStart = A.blockStartTick;
    const beforeUntil = A.blockUntil;

    // ── 真實 matchControls 產出的玩家 intent ──
    const playerIntents = controls.collect(game, ai);
    const mine = playerIntents.find((it) => it.playerId === ME) ?? null;
    const isBlock = mine?.action === 'block';
    const isManual = mine?.manual === true;

    const b0z = game.ball.z;
    const ev = stepGame(game, [...playerIntents, ...aiCollectIntents(game, ai, [ME])]);
    controls.onEvents(ev);

    if (cur) {
      if (isBlock) {
        if (isManual) cur.manualIntent += 1;
        else {
          cur.autoIntent += 1;
          if (cur.autoIntentFirst == null) cur.autoIntentFirst = tick;
        }
      }
      // ★ 二次起跳的機械判準：blockStartTick 改變＝開了新窗（非續期）★
      if (A.blockStartTick !== beforeStart) {
        const L = predictLanding(game.ball);
        cur.windows.push({
          tick,
          manual: A.blockManual === true,
          prevUntil: beforeUntil,
          ballZ: Number(game.ball.z.toFixed(3)),
          ballY: Number(game.ball.y.toFixed(3)),
          crossedNet: game.ball.z > 0,           // A 隊半場＝z>0（ai.js:333 同源）
          dSpike: cur.spikeTick == null ? null : tick - cur.spikeTick,
          landTicks: L ? L.ticks : null,
        });
        if (cur.pressTick === tick) cur.pressOpened = true;
        if (A.blockManual === true && cur.manualWinTick == null) cur.manualWinTick = A.blockStartTick;
      } else if (cur.pressTick === tick) {
        cur.pressOpened = false;
      }
      // 過網瞬間（tryBlock 結算位置）
      if (cur.crossTick == null && b0z <= 0 && game.ball.z > 0) {
        cur.crossTick = tick;
        cur.crossWin = A.blockUntil >= tick ? A.blockStartTick : null;
        cur.crossAirT = A.blockUntil >= tick ? tick - A.blockStartTick : null;
        cur.crossManual = A.blockUntil >= tick ? A.blockManual === true : null;
        cur.crossDx = Math.abs(A.x - game.ball.x);
        cur.crossBallY = game.ball.y;
        cur.crossAz = A.z;
        // W7 A1：一新窗＝一跳，`drainStamina(COST_JUMP_BLOCK)`（game.js:499）——
        // 早跳＋二次起跳＝一波付兩次；體力低會壓低 blockTopEdge（game.js:1055）
        const st = game.stamina?.[ME];
        cur.crossStam = typeof st === 'number' ? st : (st?.value ?? st?.cur ?? null);
      }
    }

    for (const e of ev) {
      if (!cur) break;
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === OPP_TEAM && cur.spikeTick == null) {
        cur.spikeTick = e.tick ?? tick;
      }
      if (e.type === 'BLOCK_TOUCH' && e.team === MY_TEAM) {
        cur.teamTouch = (cur.teamTouch ?? 0) + 1;
        cur.teamTouchBy = e.playerId;
      }
      if (e.type === 'BLOCK_TOUCH' && e.playerId === ME && cur.touchTick == null) {
        cur.touchTick = e.tick ?? tick;
        cur.touchWin = A.blockStartTick;
      }
      if (e.type === 'SCORE') {
        cur.out = `score:${e.team}`;
        eps.push(cur); cur = null;
      } else if (e.type === 'TOUCH' && e.team === MY_TEAM) {
        cur.out = 'defended';
        eps.push(cur); cur = null;
      }
    }
    // ★ 波的終點＝球過網那一 tick（tryBlock 的結算位置，game.js:1024）★
    // 不closing 在這裡的話，長多回合（攔回去→對方再組織→再攻）會被併進同一波，
    // Q1／Q3 的 dSpike 會被下一次攻擊污染（實測 p90 曾到 226 tick）。
    if (cur && cur.crossTick != null) { cur.out = cur.out ?? 'crossed'; eps.push(cur); cur = null; }
    if (cur && game.phase !== 'rally') { cur.out = 'phase'; eps.push(cur); cur = null; }
  }
  if (cur) { cur.out = 'eos'; eps.push(cur); }
  return { run, ticks: game.tick, eps };
}

// ════════════════════════════════════════════════════════
// 統計
// ════════════════════════════════════════════════════════
const qtl = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const pct = (k, n) => (n ? (k / n) * 100 : null);
const seP = (k, n) => (n ? Math.sqrt(((k / n) * (1 - k / n)) / n) * 100 : null);
const f = (v, d = 1) => (v == null || Number.isNaN(v) ? '  -  ' : v.toFixed(d));
const rate = (k, n, d = 1) => (n ? `${String(k).padStart(4)}/${String(n).padStart(4)} = ${f(pct(k, n), d).padStart(5)}%±${f(seP(k, n), 2)}` : `   0/   0 =   -  `);

function run(arm) {
  const sets = [];
  for (let s = 0; s < SETS; s += 1) sets.push(runSet(s, arm));
  return sets;
}

const armData = {};
for (const arm of ['noPress', 'early']) {
  const sets = run(arm);
  armData[arm] = sets;
}

console.log(`\n=== 「起跳攔網」按鈕取捨量測（${SETS} 局／臂，受控者 ${ME}，對手 ${OPP_ID}）===`);
console.log('證據取得路徑：**真實 createMatchControls**（src/input/matchControls.js:64），'
  + '玩家 intent 由 controls.collect() 產出，未重建輸入端。');

for (const arm of ['noPress', 'early']) {
  const eps = armData[arm].flatMap((s) => s.eps);
  // 「這一波按鈕本來就不可能按」的波（非前排／退防）排除在按鈕相關母體外
  const elig = eps.filter((e) => e.eligible);
  const pressed = elig.filter((e) => e.pressTick != null);
  const anyWin = elig.filter((e) => e.windows.length > 0);
  const touched = elig.filter((e) => e.touchTick != null);

  console.log(`\n──────── 臂：${arm} ────────`);
  console.log(`對手攻擊波 ${eps.length}｜面板曾可按（前排＋貼網）${elig.length}`
    + `｜有按 ${pressed.length}｜本波曾開過攔網窗 ${anyWin.length}｜A2 攔網接觸 ${touched.length}`);

  // 窗數分佈
  const hist = {};
  for (const e of elig) hist[e.windows.length] = (hist[e.windows.length] ?? 0) + 1;
  console.log(`每波開窗數分佈：${JSON.stringify(hist)}`);

  if (arm === 'early') {
    // ── Q1 ──
    const withManualWin = pressed.filter((e) => e.pressOpened === true);
    // 「第一次跳（手動窗）沒攔到」＝該波攔網接觸沒有歸屬給手動窗
    const missedFirst = withManualWin.filter((e) => e.touchWin == null || e.touchWin !== e.manualWinTick);
    const reCond = missedFirst.filter((e) => e.autoIntentFirst != null && e.autoIntentFirst > e.pressTick);
    const reJump = missedFirst.filter((e) => e.windows.some((w) => w.tick > e.pressTick));
    console.log('\n[Q1 再觸發率]');
    console.log(`  按下且真的開了手動窗                     ${rate(withManualWin.length, pressed.length)}`);
    console.log(`  └ 其中「手動窗沒攔到」（跳空）＝分母      ${rate(missedFirst.length, withManualWin.length)}`);
    console.log(`  Q1a 自動跳攔分支再度送出 block intent    ${rate(reCond.length, missedFirst.length)}`);
    console.log(`  Q1b **真的開了第二個窗**（blockStartTick 變）${rate(reJump.length, missedFirst.length)}`);

    // ── Q2 ──
    const firstHit = withManualWin.filter((e) => e.touchWin != null && e.touchWin === e.manualWinTick);
    const secondHit = reJump.filter((e) => e.touchTick != null &&
      e.windows.some((w) => w.tick > e.pressTick && w.tick === e.touchWin));
    console.log('\n[Q2 攔到率]');
    console.log(`  第一次跳（手動窗）攔到                   ${rate(firstHit.length, withManualWin.length)}`);
    console.log(`  二次起跳攔到                             ${rate(secondHit.length, reJump.length)}`);
    console.log(`  整波至少攔到一次（early 臂）             ${rate(touched.length, elig.length)}`);

    // ── Q3 ──
    const w2 = missedFirst.flatMap((e) => e.windows.filter((w) => w.tick > e.pressTick));
    const crossed = w2.filter((w) => w.crossedNet).length;
    const dS = w2.filter((w) => w.dSpike != null).map((w) => w.dSpike);
    const lt = w2.filter((w) => w.landTicks != null).map((w) => w.landTicks);
    console.log('\n[Q3 二次起跳那一刻的球在哪]');
    console.log(`  樣本（二次窗數）n=${w2.length}`);
    console.log(`  球已過網（z>0，我方半場）                ${rate(crossed, w2.length)}`);
    console.log(`  距對方擊球 tick   p50=${f(qtl(dS, 0.5), 0)} p90=${f(qtl(dS, 0.9), 0)} mean=${f(mean(dS), 1)} n=${dS.length}`);
    console.log(`  距球落地 tick     p50=${f(qtl(lt, 0.5), 0)} p90=${f(qtl(lt, 0.9), 0)} mean=${f(mean(lt), 1)} n=${lt.length}`);
    // 對照：手動早跳那一刻離對方擊球還有多久（負值＝擊球前，＝賭注的「早」有多早）
    const pd = pressed.filter((e) => e.spikeTick != null).map((e) => e.pressTick - e.spikeTick);
    console.log(`  【對照】手動早跳距對方擊球 tick p50=${f(qtl(pd, 0.5), 0)} p10=${f(qtl(pd, 0.1), 0)}`
      + ` p90=${f(qtl(pd, 0.9), 0)} n=${pd.length}（負值＝擊球前幾 tick 就按了）`);

    // ★ 誘因結構：手動窗只有 48 tick，按下到對方擊球的間隔決定它有沒有過期 ★
    console.log('\n[按下 → 對方擊球的間隔（lead）決定一切；手動窗長＝TUNING.BLOCK_WINDOW 48]');
    console.log('lead 區間      波數 | 開了二次窗       | 攔到');
    const buckets = [[0, 24], [24, 48], [48, 72], [72, 96], [96, Infinity]];
    for (const [lo, hi] of buckets) {
      const rows = pressed.filter((e) => e.spikeTick != null &&
        e.spikeTick - e.pressTick >= lo && e.spikeTick - e.pressTick < hi);
      const rj = rows.filter((e) => e.windows.some((w) => w.tick > e.pressTick));
      const hit = rows.filter((e) => e.touchTick != null);
      const label = hi === Infinity ? `≥${lo}` : `${lo}–${hi}`;
      console.log(`${label.padEnd(12)} ${String(rows.length).padStart(5)} | ${rate(rj.length, rows.length)} | ${rate(hit.length, rows.length)}`);
    }
  } else {
    const autoWin = elig.filter((e) => e.windows.length > 0);
    const autoHit = autoWin.filter((e) => e.touchTick != null);
    console.log('\n[基準：只有自動跳攔]');
    console.log(`  本波開了窗（＝自動跳攔起跳）             ${rate(autoWin.length, elig.length)}`);
    console.log(`  開了窗 → 攔到                           ${rate(autoHit.length, autoWin.length)}`);
    const w = autoWin.flatMap((e) => e.windows);
    const dS = w.filter((x) => x.dSpike != null).map((x) => x.dSpike);
    const lt = w.filter((x) => x.landTicks != null).map((x) => x.landTicks);
    console.log(`  起跳時距對方擊球 tick p50=${f(qtl(dS, 0.5), 0)} p90=${f(qtl(dS, 0.9), 0)} n=${dS.length}`);
    console.log(`  起跳時距球落地   tick p50=${f(qtl(lt, 0.5), 0)} p90=${f(qtl(lt, 0.9), 0)} n=${lt.length}`);
    console.log(`  起跳時球已過網                          ${rate(w.filter((x) => x.crossedNet).length, w.length)}`);
  }

  // 過網結算那一刻的窗狀態（tryBlock 的量測位置）
  const cw = elig.filter((e) => e.crossTick != null);
  const open = cw.filter((e) => e.crossWin != null);
  const openManual = open.filter((e) => e.crossManual === true);
  const airTs = open.map((e) => e.crossAirT);
  console.log('\n[過網結算那一刻（tryBlock）]');
  console.log(`  有過網的波 ${cw.length}｜窗開著 ${rate(open.length, cw.length)}`
    + `｜其中 manual 旗標 ${rate(openManual.length, open.length)}`);
  console.log(`  airT（tick−blockStartTick）p50=${f(qtl(airTs, 0.5), 0)} p90=${f(qtl(airTs, 0.9), 0)}`
    + `｜>24（AIR_TICKS，非 manual 會被 game.js:1052 擋掉）${rate(airTs.filter((t) => t > 24).length, airTs.length)}`);
  const dxs = cw.map((e) => e.crossDx).filter((v) => v != null);
  const bys = cw.map((e) => e.crossBallY).filter((v) => v != null);
  console.log(`  |A2.x − ball.x| p50=${f(qtl(dxs, 0.5), 2)} p90=${f(qtl(dxs, 0.9), 2)}`
    + `｜≤BLOCK_REACH_X(1.1) ${rate(dxs.filter((v) => v <= 1.1).length, dxs.length)}`
    + `｜過網球高 y p50=${f(qtl(bys, 0.5), 2)} p90=${f(qtl(bys, 0.9), 2)}`);
  // 站位是否為兩臂差距的來源：把「站對位」這個變因固定住再比一次
  const near = cw.filter((e) => e.crossDx != null && e.crossDx <= 1.1);
  console.log(`  控制站位後（|dx|≤1.1）攔到率 ${rate(near.filter((e) => e.touchTick != null).length, near.length)}`);
  console.log(`  全隊(A) 攔網接觸波數 ${eps.filter((e) => e.teamTouch).length}`
    + `（A2 ${touched.length}）`);
  const byManual = open.filter((e) => e.crossManual === true);
  // 續期證據：手動窗只有 48 tick（TUNING.BLOCK_WINDOW）；結算時 airT>48 還開著
  // ⇒ 一定是被自動跳攔的 block intent 續期（game.js:501），而不是開了新窗
  const renewed = byManual.filter((e) => e.crossAirT > 48).length;
  if (byManual.length) {
    console.log(`  手動窗撐到結算者 airT>48（＝被自動跳攔續期，非新窗）${rate(renewed, byManual.length)}`);
  }
  const byAuto = open.filter((e) => e.crossManual === false);
  console.log(`  結算窗＝手動窗 → 攔到 ${rate(byManual.filter((e) => e.touchTick != null).length, byManual.length)}`
    + `｜結算窗＝自動窗 → 攔到 ${rate(byAuto.filter((e) => e.touchTick != null).length, byAuto.length)}`);
  const stams = cw.map((e) => e.crossStam).filter((v) => v != null);
  console.log(stams.length
    ? `  結算時 A2 體力 mean=${f(mean(stams), 3)} p50=${f(qtl(stams, 0.5), 3)} n=${stams.length}`
    : '  結算時 A2 體力：**量不出來** —— careerMatchSetup 不回傳 stamina 欄位 ⇒ '
      + 'game.stamina===null ⇒ W7 體力系統在本治具下全程短路（drainStamina 無效果）。'
      + '⇒「早跳多付一次跳躍體力」這條機制在本次量測中**不成立**，不得用來解釋兩臂差距。');
  console.log(`  ★臂總結：A2 攔網接觸／面板可按波 ${rate(touched.length, elig.length)}`);
}

if (OUTDIR) {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const out = path.join(OUTDIR, `block-rejump-${SETS}.json`);
  fs.writeFileSync(out, JSON.stringify({ sets: SETS, arms: armData }, null, 2), 'utf8');
  console.log(`\n完整輸出：${out}`);
}
