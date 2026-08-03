// 「立即攔網」按鈕的**時機上限**量測 —— 抓對時機按，能不能贏過從不按？
//
// 用法：
//   node tools/block-timing-oracle-probe.mjs [局數=60]
//   BT_OUT=<dir> node tools/block-timing-oracle-probe.mjs 60   # 逐波原始資料落檔
//   BT_ARMS=noPress,early,oracle24 node tools/block-timing-oracle-probe.mjs 8  # 只跑指定臂（除錯用）
//
// ★ 零 `src/` 改動 ★ 本檔對 `src/`、`tests/` 一個位元組都不寫，也不裝任何模組鉤子。
//
// ── 為什麼有這一支（前作的範圍限制）──────────────────────────────
// `tools/block-rejump-probe.mjs` 量到：noPress 18.4%±1.21 vs early 13.9%±1.10
// ——「面板一出現就按」比不按還差 4.5pp。但那支的 early 臂**固定按在最早可按的那一 tick**，
// 沒有覆蓋「玩家刻意抓時機、晚一點才按」。面板條件是 `r.touches === 2`
// （matchControls.js:38 `mbMomentFor`），該狀態一路持續到攻擊發生 ⇒ 那 ~80 tick 全程都按得到。
// 本支就是把那條**時機軸**掃出來。
//
// ── 證據取得路徑（本檔的核心宣稱）──────────────────────────────
// 玩家那一份 intent **走真實 `createMatchControls`**（`src/input/matchControls.js:64`），
// 按鈕走 `controls.chooseMbTiming(true)`（matchControls.js:629 → blockTap → 同一條 intent）。
// **沒有重建輸入端、沒有自己組 createIntent。** 建置段（window 替身／makeControls／
// wantKeys 走位／setupMatch）逐字沿用 `tools/block-rejump-probe.mjs`，兩支的數字可直接對照。
//
// ── 臂 ────────────────────────────────────────────────────────
//   noPress   ：從不按（基準；沿用前作實作）
//   early     ：面板一出現就按（對照；沿用前作實作）
//   oracle-K  ：**在對方擊球前 K tick 按**，K ∈ {6,12,24,36,48}
//               ⚠⚠ 這是**開天眼**的打法 ⚠⚠ 觸球時點由 `predictContactPoint(ball,
//               AI.SPIKE_APPROACH_Y)`（src/sim/flight.js:82）逐 tick 回推——那是 sim 自己
//               用來排攻擊時序的同一支純函式（ai.js:482 的 `aiState.hitPoint` 同源），
//               **不另建一套時序判定**。玩家在畫面上看不到「還剩幾 tick」這個數字，
//               所以 oracle 量的是**上限**，不是任何真人做得到的打法。
//   cue       ：在**玩家看得見的線索**上按＝`blockCommitRead` 的**下降沿**
//               （src/sim/blockRead.js:236）——「先看到有人在往網推進，然後他不推進了」
//               ＝那個人拔起來了。
//               為什麼這是玩家看得見的：該函式的簽章只吃 `game` 與**攻方隊伍代號**
//               （反作弊保證線，blockRead.js:222），內部只讀對方球員的**站位與這一 tick 的
//               位移**（`a.z`／`a.pz`／`a.x`，blockRead.js:260-268）——全都是螢幕上正在演的
//               身體動作，沒有任何未來值（該檔 123 行明寫「刻意不讀 route 表，route 帶著
//               startTick／takeoffTick 等未來值，玩家在面板上看不到」）。
//               這也正是 AI 的 commit 人格自己在用的起跳訊號（ai.js:1967-1983）。
//               呼叫參數取 `{ passTier: null, outerLag: 0 }`＝blockRead.js:239-243 明載的
//               「不降級」對照臂用法（passTier 傳 null＝不擋，實測該值恆 'perfect'）。
//
// ── 攔網窗的機制（量測位置的依據，game.js:486-503）──────────────
//   block intent → 若 `blockUntil < tick` 才**開新窗**；否則只把 `blockUntil` 續期到 tick+48。
//   攔網接觸在球過網那一 tick 結算（game.js:1024 tryBlock），一波攻擊只結算一次。
//   TUNING.BLOCK_WINDOW = 48 tick ＝手動窗全長。
//
// tick↔秒：SIM_HZ = 60 ⇒ 1 tick = 1/60 s。
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETS = Number.parseInt(process.argv[2] ?? process.env.BT_SETS ?? '60', 10);
const OUTDIR = process.env.BT_OUT ?? null;
const ME = 'A2';       // 主控球員槽位（careerState.js:411 的硬性契約）
const MY_TEAM = 'A';
const OPP_TEAM = 'B';

// ── 瀏覽器全域替身（createMatchControls 在建構時掛 window 監聽）──
// ★ 不是 no-op ★ 監聽器真的收下來，走位靠**派送真的 keydown/keyup**（WASD）。
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
const { createGame, stepGame, TUNING } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents, AI } = await import('../src/sim/ai.js');
const { isFrontRow } = await import('../src/sim/rotation.js');
const { createMatchControls, NEAR_NET_Z } = await import('../src/input/matchControls.js');
const { serverId } = await import('../src/sim/match.js');
const { predictContactPoint } = await import('../src/sim/flight.js');
const { blockCommitRead } = await import('../src/sim/blockRead.js');
const { createCareer, createCareerPlayer, careerMatchSetup } =
  await import('../src/career/careerState.js');
const { buildStarterMembers } = await import('../src/career/roster.js');

const MAX_TICKS = 400000;
const OPP_ID = 'obsidian';

// 6/12/24/36/48 是工單指定的五檔；1 與 3 是**加測的地板**——用來看「時機軸最晚那一端」
// 長什麼樣（面板在對方擊球那一 tick 就關閉，見 mbMomentFor 的 touches===2，
// 所以 lead 不可能真的到 0，K=1 就是玩家在物理上能按的最晚時機）。
const ORACLE_KS = [1, 3, 6, 12, 24, 36, 48];
const ALL_ARMS = ['noPress', 'early', ...ORACLE_KS.map((k) => `oracle${k}`), 'cue'];
const ARMS = (process.env.BT_ARMS ? process.env.BT_ARMS.split(',') : ALL_ARMS)
  .map((s) => s.trim()).filter(Boolean);
const oracleKOf = (arm) => (arm.startsWith('oracle') ? Number.parseInt(arm.slice(6), 10) : null);

function makeControls() {
  resetListeners();   // 每局一組乾淨監聽
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

// ── 走位策略（全臂完全相同，是共同基底不是自變數）────────────
// 逐字沿用 block-rejump-probe.mjs:104-118 —— 不走位＝面板永不出現（|z| ≥ NEAR_NET_Z）。
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
  const K = oracleKOf(arm);
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
    pressTick: null,          // 按下「立即攔網」的 tick
    pressPc: null,            // 按下那一 tick 的 predictContactPoint().ticks（oracle 的瞄準量）
    pressBlocked: false,      // 想按但面板當下不可按（oracle 打不到目標／cue 訊號落在窗外）
    pressOpened: null,        // 按下那一 tick 是否真的開了新窗（完整性檢查：按鈕路徑真的通）
    lastPanelTick: null,      // 本波面板**最後**一次可按的 tick（＝時機軸的最晚端）
    cueSeen: false,           // cue 臂：曾經看見有人在往網推進（下降沿的前半）
    spikeTick: null,          // 對手扣球出手 tick
    crossTick: null,          // 球過網（進我方半場）tick
    touchTick: null,          // A2 的 BLOCK_TOUCH tick
    front: false,
    nearNet: false,
    eligible: false,          // 面板可用性（isMbMoment 曾成立）
    panelTicks: 0,            // 本波面板可按的 tick 數（時機軸有多長）
    out: null,
  });

  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const r = game.rally;
    const A = game.actors[ME];
    const tick = game.tick;

    // 代發：A2 輪到發球時沒人代勞會卡死在 serve 相
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

    // ════ 按鈕決策（全臂共用同一個「面板可按」判準與同一個投遞入口）════
    if (cur) {
      // 面板可按＝matchLoop.js:861-863 的 `mbDeciding`（逐字同前作 early 臂）
      const mbRead = controls.mbOptions(game, ai);
      const mbDeciding = !!mbRead && !controls.mbPending() &&
        !(game.ball.vy < 0 && game.ball.y < 2.3);
      // 「時機軸有多長」要用**與是否已按無關**的條件數（mbPending 是按過才變 true）
      if (mbRead && !(game.ball.vy < 0 && game.ball.y < 2.3)) {
        cur.panelTicks += 1;
        cur.lastPanelTick = tick;   // 面板最後可按的那一 tick ＝ 玩家能按的**最晚**時機
      }
    }
    if (cur && arm !== 'noPress') {
      const mbRead = controls.mbOptions(game, ai);
      const mbDeciding = !!mbRead && !controls.mbPending() &&
        !(game.ball.vy < 0 && game.ball.y < 2.3);

      // 這一 tick「想不想按」——各臂唯一的差異就在這個布林
      let want2 = false;
      let pc = null;
      if (arm === 'early') {
        want2 = true;
      } else if (K != null) {
        // ★開天眼★ 距對方擊球還有幾 tick：sim 自己排攻擊時序用的同一支純函式
        pc = predictContactPoint(game.ball, AI.SPIKE_APPROACH_Y);
        want2 = !!pc && pc.ticks != null && pc.ticks <= K;
      } else if (arm === 'cue') {
        // 玩家看得見的線索：有人在往網推進（seen）→ 他不推進了（read == null）＝拔起來了
        const liveRead = blockCommitRead(game, OPP_TEAM, { passTier: null, outerLag: 0 });
        if (liveRead) cur.cueSeen = true;
        want2 = cur.cueSeen && liveRead == null;
      }

      if (want2 && cur.pressTick == null) {
        if (mbDeciding) {
          controls.chooseMbTiming(true);   // ★ 真實路徑：面板回呼同一入口（matchLoop.js:953）★
          cur.pressTick = tick;
          cur.pressPc = pc ? pc.ticks : null;
        } else {
          cur.pressBlocked = true;         // 想按的那一刻面板不給按（記帳，不補按）
        }
      }
    }
    if (cur && controls.isMbMoment(game)) cur.eligible = true;

    const beforeStart = A.blockStartTick;

    // ── 真實 matchControls 產出的玩家 intent ──
    const playerIntents = controls.collect(game, ai);

    const b0z = game.ball.z;
    const ev = stepGame(game, [...playerIntents, ...aiCollectIntents(game, ai, [ME])]);
    controls.onEvents(ev);

    // ★ 完整性檢查：按下那一 tick，`blockStartTick` 有沒有真的改變（＝真的開了新窗）★
    if (cur && cur.pressTick === tick) cur.pressOpened = A.blockStartTick !== beforeStart;

    if (cur && cur.crossTick == null && b0z <= 0 && game.ball.z > 0) {
      cur.crossTick = tick;
      cur.crossDx = Math.abs(A.x - game.ball.x);
      cur.crossOpen = A.blockUntil >= tick;
      cur.crossAirT = A.blockUntil >= tick ? tick - A.blockStartTick : null;
      cur.crossManual = A.blockUntil >= tick ? A.blockManual === true : null;
    }

    for (const e of ev) {
      if (!cur) break;
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === OPP_TEAM && cur.spikeTick == null) {
        cur.spikeTick = e.tick ?? tick;
      }
      if (e.type === 'BLOCK_TOUCH' && e.playerId === ME && cur.touchTick == null) {
        cur.touchTick = e.tick ?? tick;
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
const f = (v, d = 1) => (v == null || Number.isNaN(v) ? '-' : v.toFixed(d));

function runArm(arm) {
  const sets = [];
  for (let s = 0; s < SETS; s += 1) sets.push(runSet(s, arm));
  return sets;
}

const armData = {};
const t0 = Date.now();
for (const arm of ARMS) {
  armData[arm] = runArm(arm);
  process.stderr.write(`  [${arm}] 完成（${((Date.now() - t0) / 1000).toFixed(0)}s）\n`);
}

// 每臂逐局統計（配對比較用）
function summarize(arm) {
  const sets = armData[arm];
  const perSet = sets.map((s) => {
    const elig = s.eps.filter((e) => e.eligible);
    return { n: elig.length, k: elig.filter((e) => e.touchTick != null).length };
  });
  const eps = sets.flatMap((s) => s.eps);
  const elig = eps.filter((e) => e.eligible);
  const pressed = elig.filter((e) => e.pressTick != null);
  const blocked = elig.filter((e) => e.pressTick == null && e.pressBlocked);
  // lead ＝ 對方擊球 tick − 按下 tick（正值＝擊球前幾 tick 按的）
  const leads = pressed.filter((e) => e.spikeTick != null).map((e) => e.spikeTick - e.pressTick);
  const pcs = pressed.filter((e) => e.pressPc != null).map((e) => e.pressPc);
  const panel = elig.map((e) => e.panelTicks).filter((v) => v > 0);
  return {
    arm,
    perSet,
    waves: eps.length,
    n: elig.length,
    k: elig.filter((e) => e.touchTick != null).length,
    pressed: pressed.length,
    blocked: blocked.length,
    leads,
    pcs,
    panel,
    crossOpen: elig.filter((e) => e.crossOpen).length,
    crossN: elig.filter((e) => e.crossTick != null).length,
    // 結算那一刻手在多高：airT ＝ tick − blockStartTick。blockTopEdge 是 sin 半波、
    // 頂點在 airT=12、AIR_TICKS=24 之後回站立摸高（src/sim/player.js:130 附近）
    airTs: elig.filter((e) => e.crossAirT != null).map((e) => e.crossAirT),
    // 對方擊球 → 球過網的間隔（＝「按下時機」與「結算時機」之間無法壓縮的距離）
    gaps: elig.filter((e) => e.crossTick != null && e.spikeTick != null)
      .map((e) => e.crossTick - e.spikeTick),
    dxs: elig.filter((e) => e.crossDx != null).map((e) => e.crossDx),
    manualAtCross: elig.filter((e) => e.crossManual === true).length,
    pressOpened: pressed.filter((e) => e.pressOpened === true).length,
    // 玩家能按的**最晚**時機（面板最後一 tick 距對方擊球還有幾 tick）——時機軸的地板
    maxLeads: elig.filter((e) => e.lastPanelTick != null && e.spikeTick != null)
      .map((e) => e.spikeTick - e.lastPanelTick),
  };
}

const S = {};
for (const arm of ARMS) S[arm] = summarize(arm);
const base = S.noPress ?? null;

console.log(`\n=== 「立即攔網」時機上限量測（${SETS} 局／臂，受控者 ${ME}，對手 ${OPP_ID}）===`);
console.log('證據取得路徑：**真實 createMatchControls**（src/input/matchControls.js:64）；');
console.log('按鈕一律走 controls.chooseMbTiming(true)（matchControls.js:629 → blockTap），未自組 createIntent。');
console.log('⚠ oracle-K 是**開天眼**臂：按下時點由 predictContactPoint(ball, 2.9)（flight.js:82）逐 tick 回推，');
console.log('  玩家在畫面上看不到這個倒數 ⇒ 它量的是**上限**，不是任何真人做得到的打法。');
console.log(`⚠ TUNING.BLOCK_WINDOW = ${TUNING.BLOCK_WINDOW} tick（手動窗全長）。`);

console.log('\n臂          面板可按波  有按   打不到  | A2 攔網接觸        | vs noPress');
console.log('─────────────────────────────────────────────────────────────────────────────');
for (const arm of ARMS) {
  const s = S[arm];
  const r = pct(s.k, s.n);
  const se = seP(s.k, s.n);
  let cmp = '（基準）';
  if (base && arm !== 'noPress') {
    const rb = pct(base.k, base.n);
    const seb = seP(base.k, base.n);
    const d = r - rb;
    const sed = Math.sqrt(se * se + seb * seb);
    cmp = `${d >= 0 ? '+' : ''}${f(d, 2)}pp（${f(Math.abs(d) / sed, 2)}×SE）`;
  }
  console.log(`${arm.padEnd(11)} ${String(s.n).padStart(9)} ${String(s.pressed).padStart(6)} `
    + `${String(s.blocked).padStart(7)}  | ${String(s.k).padStart(4)}/${String(s.n).padStart(4)} = `
    + `${f(r, 2).padStart(5)}%±${f(se, 2)} | ${cmp}`);
}

console.log('\n[實際按下時點分佈：lead ＝ 對方擊球 tick − 按下 tick（正值＝擊球前幾 tick 按的）]');
console.log('臂          n     p10    p50    p90   mean | oracle 瞄準的 pc.ticks p50 | 面板可按窗長 p50/p90');
console.log('────────────────────────────────────────────────────────────────────────────────────────────');
for (const arm of ARMS) {
  const s = S[arm];
  if (arm === 'noPress') {
    console.log(`${arm.padEnd(11)} （從不按，無按下時點）                        `
      + `                          | ${f(qtl(s.panel, 0.5), 0)}/${f(qtl(s.panel, 0.9), 0)}`);
    continue;
  }
  console.log(`${arm.padEnd(11)} ${String(s.leads.length).padStart(4)} `
    + `${f(qtl(s.leads, 0.1), 0).padStart(6)} ${f(qtl(s.leads, 0.5), 0).padStart(6)} `
    + `${f(qtl(s.leads, 0.9), 0).padStart(6)} ${f(mean(s.leads), 1).padStart(6)} | `
    + `${s.pcs.length ? f(qtl(s.pcs, 0.5), 0) : '（不適用）'}`.padEnd(28)
    + `| ${f(qtl(s.panel, 0.5), 0)}/${f(qtl(s.panel, 0.9), 0)}`);
}
console.log('完整性檢查（按下那一 tick 真的開了新窗 blockStartTick 變動）：');
for (const arm of ARMS) {
  if (arm === 'noPress') continue;
  const s = S[arm];
  console.log(`  ${arm.padEnd(11)} ${s.pressOpened}/${s.pressed}`
    + ` = ${f(pct(s.pressOpened, s.pressed), 1)}%`);
}
console.log('時機軸的**最晚端**（面板最後可按的那一 tick 距對方擊球還有幾 tick，noPress 臂量）：');
{
  const s = S.noPress ?? S[ARMS[0]];
  console.log(`  p10=${f(qtl(s.maxLeads, 0.1), 0)} p50=${f(qtl(s.maxLeads, 0.5), 0)}`
    + ` p90=${f(qtl(s.maxLeads, 0.9), 0)} n=${s.maxLeads.length}`
    + '  ⇒ 面板在對方擊球前這麼多 tick 就關了，比這更晚按**按不到**');
}

// ── 同 seed 配對（逐局 Δ）：把「這 60 個 seed 抽到的球路難度」當區組固定住 ──
if (base) {
  console.log('\n[同 seed 配對：逐局攔網接觸率差（arm − noPress），n=局數]');
  console.log('臂          局數  Δ mean(pp)   SE     t=Δ/SE');
  console.log('──────────────────────────────────────────────');
  for (const arm of ARMS) {
    if (arm === 'noPress') continue;
    const s = S[arm];
    const ds = [];
    for (let i = 0; i < s.perSet.length; i += 1) {
      const a = s.perSet[i];
      const b = base.perSet[i];
      if (!a.n || !b.n) continue;
      ds.push((a.k / a.n - b.k / b.n) * 100);
    }
    const m = mean(ds);
    const sd = Math.sqrt(ds.reduce((acc, v) => acc + (v - m) ** 2, 0) / Math.max(1, ds.length - 1));
    const se = sd / Math.sqrt(ds.length);
    console.log(`${arm.padEnd(11)} ${String(ds.length).padStart(4)} ${f(m, 2).padStart(11)} `
      + `${f(se, 2).padStart(6)} ${f(m / se, 2).padStart(8)}`);
  }
}

console.log('\n[過網結算那一刻（tryBlock 的量測位置，game.js:1024）]');
console.log('  ★ blockTopEdge 是 sin 半波：airT=0 站立摸高 → airT=12 頂點 → airT>24 回站立摸高');
console.log('    （src/sim/player.js:130 blockTopEdge、game.js:1042-1055）⇒ airT≈12 才是「手最高」');
console.log('臂          窗開著        manual 窗   airT p10/p50/p90  |dx| p50  擊球→過網 gap p10/p50/p90');
console.log('────────────────────────────────────────────────────────────────────────────────────────────');
for (const arm of ARMS) {
  const s = S[arm];
  console.log(`${arm.padEnd(11)} ${String(s.crossOpen).padStart(4)}/${String(s.crossN).padStart(4)}`
    + `=${f(pct(s.crossOpen, s.crossN), 1).padStart(5)}% `
    + `${String(s.manualAtCross).padStart(6)}    `
    + `${f(qtl(s.airTs, 0.1), 0).padStart(3)}/${f(qtl(s.airTs, 0.5), 0).padStart(3)}/${f(qtl(s.airTs, 0.9), 0).padStart(3)}`
    + `      ${f(qtl(s.dxs, 0.5), 2).padStart(5)}    `
    + `${f(qtl(s.gaps, 0.1), 0).padStart(3)}/${f(qtl(s.gaps, 0.5), 0).padStart(3)}/${f(qtl(s.gaps, 0.9), 0).padStart(3)}`);
}

if (OUTDIR) {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const out = path.join(OUTDIR, `block-timing-oracle-${SETS}.json`);
  fs.writeFileSync(out, JSON.stringify({ sets: SETS, arms: armData }, null, 2), 'utf8');
  console.log(`\n完整輸出：${out}`);
}
console.log(`\n（總耗時 ${((Date.now() - t0) / 1000).toFixed(0)}s；HERE=${HERE}）`);
