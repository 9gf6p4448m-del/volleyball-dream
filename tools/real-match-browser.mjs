// 進賽場卷 2A 驗收治具（docs/kickoffs/real-player-stage2-match.md B1–B10、B12）。
// 用法：先起 dev server（npm run dev -- --host 127.0.0.1 --port 5185 --strictPort），再
//   node tools/real-match-browser.mjs
// 環境變數：REALMATCH_BASE_URL（預設 http://127.0.0.1:5185）、PLAYWRIGHT_MODULE（既有
//   Playwright 安裝路徑）、REPORT_NAME（預設 report.json）、SKIP_SHOTS=1（跳過 B12 截圖）、
//   SEEDS（逗號分隔，預設 1,2,3）、SKIP_B8B=1（跳過 CPU 降速久跑）、SKIP_B9=1。
// 方法說明：量測走「生涯比賽」而非快速比賽——快速比賽沒有板凳（`game.bench` 恆空），
// B2 的 SUBSTITUTION 測不到。治具直接呼叫 resolveMatchConfig→buildMatchStage→
// startMatchLoop（main.js runMatch 的同一組函式），跳過「新生涯精靈」與「出戰」按鈕的
// UI 點擊——那幾層純粹是選單導航，換人本身仍走 stage.handlers.requestSub 這唯一正式
// 路徑（sim 端 applySubstitution），未走的只是「怎麼點到這場比賽」。開賽的入場運鏡／
// 情蒐帶／學招字幕（純表現層演出，非量測目標）以既有的 hide()/null 出場方式提前收掉，
// 讓 sim 立刻開始 tick——與是否寫實無關，兩模式一視同仁。
// 牆鐘：用 Playwright page.clock 虛擬時間 + no-op 渲染（CPU 側量測直讀
// mesh.getVertexPosition／skeleton，不依賴 render() 真的跑過）大幅縮短 ≥3 分鐘 sim
// 時間所需的真實等待。
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.REALMATCH_BASE_URL || 'http://127.0.0.1:5185';
const output = resolve('docs/experiments/real-match-evidence');
await mkdir(output, { recursive: true });
const reportName = process.env.REPORT_NAME || 'report.json';
const skipShots = process.env.SKIP_SHOTS === '1';
const skipB8b = process.env.SKIP_B8B === '1';
const skipB9 = process.env.SKIP_B9 === '1';

const SEEDS = (process.env.SEEDS || '1,2,3').split(',').map((s) => Number(s.trim()));
const SAMPLE_EVERY = 10;       // ticks（B2–B7 主要取樣間隔）
const TARGET_TICKS = Number(process.env.TARGET_TICKS) || 10800;    // ≥3 分鐘 sim 時間
const SUB_AT_TICK = Number(process.env.SUB_AT_TICK) || 3000;      // 觸發賽中換人的 tick 下限（兩模式取同一個實際 tick）
const RUNFOR_CHUNK_MS = 20000; // 粗推進的分段虛擬毫秒
const MAX_CHUNKS = 90;         // 安全閥：20s*90=1800s 虛擬時間上限，防跑不到目標卡死

const sh = (cmd, opts = {}) => execSync(cmd, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024, ...opts,
});

const report = {
  createdAt: new Date().toISOString(),
  base,
  head: sh('git rev-parse HEAD').trim(),
  dirty: sh('git status --porcelain').trim().split('\n').filter(Boolean),
  method: '生涯比賽（直接呼叫 resolveMatchConfig/buildMatchStage/startMatchLoop，跳過新生涯精靈與出戰按鈕的選單導航；換人走 stage.handlers.requestSub 正式路徑）＋ page.clock 虛擬時間 ＋ no-op 渲染（CPU 側量測不依賴實際 render()）',
  device: 'Desktop headless Chromium（SwiftShader/WebGL）；非真機 FPS（B11 由使用者手機另測）',
  seeds: SEEDS, sampleEvery: SAMPLE_EVERY, targetTicks: TARGET_TICKS, subAtTick: SUB_AT_TICK,
  sessions: {}, // key: `${seed}:${appearance}`
  pass: {},
};

const browser = await chromium.launch({
  headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});

// ---- 建一場生涯比賽並讓開賽演出（入場運鏡/情蒐帶/學招字幕）立即讓位給 sim ----
async function bootstrapCareerMatch(page, {
  seed, appearance, faces = null, interceptGlbFail = false, noOpRender = true,
}) {
  await page.addInitScript(({ appearance }) => {
    try { localStorage.setItem('vd-player-appearance', appearance); } catch { /* noop */ }
  }, { appearance });
  // install() 本身不會凍結時間——沒有 pauseAt() 的話，時鐘仍以真實速度在背景跑（只是
  // 起點改到 0），runFor()／fastForward() 只是在那個背景基準上再疊加推進量；寫實模式
  // 每次 page.evaluate 往返較慢，背景漂移量不同，會讓兩模式在「未呼叫 runFor 期間」
  // 各自多跑掉不同數量的 tick（實測：無 pauseAt 時，同一組操作 geo/real 的 tick 對不齊，
  // 對不齊之後的 sim 事件當然分岔——這是治具的時鐘控制沒鎖死，不是渲染影響了 sim）。
  // pauseAt(0) 才是真正「不呼叫就不動」的凍結時鐘。
  await page.clock.install({ time: 0 });
  // pauseAt(0) 在系統負載重（多個 agent 併發跑）時可能因為 install→pauseAt 之間的
  // IPC 往返已經讓時鐘漂到 >0（沒 pauseAt 前它仍以真實速度跑），導致
  // 「Cannot fast-forward to the past」。改成用當下（可能已經漂移過的）時間點
  // pauseAt，語意仍是「立刻凍結」，只是凍結的基準時間點不保證剛好是 0。
  const nowMs = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(nowMs);
  if (interceptGlbFail) {
    await page.route('**/models/real/*.glb', (route) => route.fulfill({ status: 404, body: 'not found' }));
  }
  const facesQ = faces ? `&faces=${faces}` : '';
  await page.goto(`${base}/?autopilot=1&seed=${seed}${facesQ}`, { timeout: 120000 });
  await page.waitForFunction(() => Boolean(window.__ctx), null, { timeout: 30000 });

  const info = await page.evaluate(async ({ seed, noOpRender }) => {
    const ctx = window.__ctx;
    const { createSlotStoreProxy } = await import('/src/career/careerStore.js');
    const { createCareer, createCareerPlayer, nextMatch } = await import('/src/career/careerState.js');
    const { ensureStarterRoster } = await import('/src/career/roster.js');
    const { createGame } = await import('/src/sim/game.js');
    const { createAiState } = await import('/src/sim/ai.js');
    const { resolveMatchConfig, resolveTechGates } = await import('/src/app/matchConfig.js');
    const { buildMatchStage } = await import('/src/app/matchStage.js');
    const { startMatchLoop } = await import('/src/app/matchLoop.js');
    const store = createSlotStoreProxy();
    store.useSlot(1);
    const career = createCareer({ seed: 4242 + seed, playerName: '治具' });
    const player = createCareerPlayer('治具', { seed: 4242 + seed });
    store.saveCareer(career);
    store.savePlayer(player);
    const roster = ensureStarterRoster(store);
    const matchEntry = nextMatch(career);
    const careerCtx = {
      store, career, player, matchEntry, roster, lineup: store.loadLineup(), seasonIndex: 1,
    };
    const config = resolveMatchConfig({ params: ctx.params, careerCtx, randomSeed: 777 });
    const game = createGame(config.gameOptions);
    const aiState = createAiState();
    const gates = resolveTechGates(game, 'A2', true, false);
    const stage = await buildMatchStage({ ctx, config, gates, playerId: 'A2', game });
    startMatchLoop({ ctx, config, gates, stage, careerCtx, playerId: 'A2', game, aiState });
    const s = window.__phase1.loop();
    // 開賽演出（純表現層）提前收場——與外觀無關，兩模式一視同仁，讓 sim 立刻開始 tick
    s.openingShow = null; s.lineupIntro = null; s.replay = null;
    stage.teachDialog?.hide();
    stage.coachOptionDialog?.hide?.();
    // no-op 渲染：CPU 側量測不靠實際畫面跑過。B12 截圖需要真的畫面，noOpRender=false 跳過。
    if (noOpRender) s.ctx.postFx.render = () => {};
    return {
      benchA: game.bench?.A ?? [], benchB: game.bench?.B ?? [],
      rotationsA: game.match.rotations.A, rotationsB: game.match.rotations.B,
      matchEntryId: matchEntry?.id ?? null,
    };
  }, { seed, noOpRender });
  return info;
}

// ---- 頁內量測 sampler：監聽 matchView.sync，每 SAMPLE_EVERY tick 記一次 ----
// B2 換人觸發也掛在這個同一個 hook 裡（而不是治具端用牆鐘 polling 抓時機）——
// polling 受牆鐘排程細微差異影響，寫實模式每幀較重，實測會在 geo／real 兩模式
// 抓到不同的實際 tick（觸發時刻不同＝之後的 sim 歷史從那一刻起本來就該分岔，
// 不是 render 影響 sim，是治具自己的觸發時機不對齊）。改成 sim 自己的逐幀迴圈
// 內部判斷「這一幀 tick 是否已達門檻」，兩模式必然在同一個 tick 觸發。
async function installSampler(page, { subAtTick }) {
  await page.evaluate(async ({ SAMPLE_EVERY, subAtTick }) => {
    const gc = await import('/src/render/geoCharacter.js');
    const mv0 = window.__phase1.loop().stage.matchView;
    const THREE = mv0.debug.THREE;
    const V3 = THREE.Vector3;

    window.__samples = [];
    window.__lastSampledTick = -1;
    window.__refRigs = {};
    window.__vertexSets = {};

    const v = new V3(); const wp = new V3();
    function worldPos(o) { o.updateWorldMatrix(true, false); return o.getWorldPosition(wp).clone(); }

    function buildVertexSets(u) {
      const mesh = u.real.mesh;
      const pos = mesh.geometry.attributes.position;
      const n = pos.count;
      let maxR = 0; let maxL = 0;
      for (let i = 0; i < n; i += 1) {
        const x = pos.getX(i);
        if (x < 0) maxR = Math.max(maxR, -x); else maxL = Math.max(maxL, x);
      }
      const hand = { r: [], l: [] };
      const sole = [];
      for (let i = 0; i < n; i += 1) {
        const x = pos.getX(i); const y = pos.getY(i);
        if (x < 0 && -x >= maxR - 0.10) hand.r.push(i);
        if (x > 0 && x >= maxL - 0.10) hand.l.push(i);
        if (y <= 0.03) sole.push(i);
      }
      const idxs = Array.from({ length: n }, (_, i) => i);
      idxs.sort((a, b) => pos.getY(b) - pos.getY(a));
      const topCandidates = idxs.slice(0, Math.max(50, Math.floor(n * 0.02)));
      return { hand, sole, topCandidates, n };
    }

    // 背號面片附近的候選頂點（半徑 0.25m，取樣當下的目前姿勢量一次、之後沿用同一批索引）
    function buildPlateCandidates(u, slotNode) {
      const mesh = u.real.mesh;
      const pos = mesh.geometry.attributes.position;
      const n = pos.count;
      const center = worldPos(slotNode);
      const out = [];
      for (let i = 0; i < n; i += 1) {
        mesh.getVertexPosition(i, v);
        if (v.distanceTo(center) <= 0.25) out.push(i);
      }
      return out;
    }

    function centroidOf(mesh, idx) {
      const c = new V3();
      for (const i of idx) { mesh.getVertexPosition(i, v); c.add(v); }
      return idx.length ? c.divideScalar(idx.length) : c;
    }
    function minDist(mesh, idx, target) {
      let m = Infinity;
      for (const i of idx) { mesh.getVertexPosition(i, v); const d = v.distanceTo(target); if (d < m) m = d; }
      return idx.length ? m : null;
    }

    function ensureRefRig(playerId, teamId, height, isLibero) {
      if (window.__refRigs[playerId]) return window.__refRigs[playerId];
      const ref = gc.createGeoCharacter(
        { claim: (key) => ({ key, index: 0 }) }, playerId, teamId, height, isLibero, '', null, null,
      );
      window.__refRigs[playerId] = ref;
      return ref;
    }

    window.__sampleNow = function sampleNow(gameState) {
      const tick = gameState.tick;
      if (tick % SAMPLE_EVERY !== 0 || window.__lastSampledTick === tick) return;
      window.__lastSampledTick = tick;
      const mv = window.__phase1.loop().stage.matchView;
      const units = mv.debug.units;
      // B6：逐格輕量 sim 狀態簽章（分數＋球位置＋全員位置），供治具在「兩模式都採到
      // 的最後一個共同 tick」比對——不用賽末各自 runUntilTick 停下的那個 tick（粗
      // 推進的 20s 分段在 geo/real 兩邊落點可能差 1-2 tick，比對那個點的完整 game
      // 序列化只會比出「兩個不同時間點的狀態不同」，跟 render 有沒有影響 sim 無關）。
      const actorSig = Object.keys(gameState.actors).sort().map((id) => {
        const a = gameState.actors[id];
        return `${id}:${a.x.toFixed(4)},${a.z.toFixed(4)},${(a.divedUntil ?? 0)},${(a.blockUntil ?? 0)}`;
      }).join('|');
      const stateSig = JSON.stringify({
        score: gameState.match.score, tick,
        ball: [gameState.ball.x, gameState.ball.y, gameState.ball.z].map((v) => v.toFixed(4)),
        actorSig,
      });
      const sample = {
        tick, appearance: mv.debug.appearance, visibleCount: 0, players: [], stateSig,
      };
      for (const [id, u] of Object.entries(units)) {
        const p = gameState.players[id];
        const visible = u.rig.root.scale.x > 0.001;
        if (visible) sample.visibleCount += 1;
        const entry = { id, real: !!u.real, seq: u.animator.peek?.()?.type ?? null, visible };
        // H1（身高縮放修復驗證，2026-09-27）：直接量 u.rig（geoCharacter 骨架，真人/幾何
        // 兩模式共用同一份，見 realPlayer.js「rig＝createGeoCharacter 建出的關節 Object3D」）
        // 的頭部 slot 世界座標＋頭半徑（0.125，geometries().head 半徑）×根縮放——這條量測
        // 只吃 u.rig.root.scale，正是 matchView.js:384 那行縮放公式的直接下游，不像既有
        // headTopDiff（比對 real 網格 vs. ref rig，ref rig 的 scale 是從 u.rig 複製來的）
        // 會把 bug 本身也複製進參照值、失去鑑別力。
        if (visible) {
          const headPart = u.rig.parts.find((pt) => pt.key === 'head');
          if (headPart) {
            entry.headTopY = worldPos(headPart.node).y + 0.125 * u.rig.root.scale.y;
            entry.heightCur = p.height.current;
          }
        }
        if (u.real && visible) {
          if (!window.__vertexSets[id]) window.__vertexSets[id] = buildVertexSets(u);
          const vs = window.__vertexSets[id];
          const mesh = u.real.mesh;
          entry.handDist = {
            r: centroidOf(mesh, vs.hand.r).distanceTo(worldPos(u.rig.joints.rWrist)),
            l: centroidOf(mesh, vs.hand.l).distanceTo(worldPos(u.rig.joints.lWrist)),
          };
          let soleMin = Infinity;
          for (const i of vs.sole) { mesh.getVertexPosition(i, v); if (v.y < soleMin) soleMin = v.y; }
          entry.soleMin = vs.sole.length ? soleMin : null;

          const ref = ensureRefRig(id, p.teamId, p.height.current, p.currentRole === 'libero');
          ref.root.position.copy(u.rig.root.position);
          ref.root.quaternion.copy(u.rig.root.quaternion);
          ref.root.scale.copy(u.rig.root.scale);
          for (const jn of Object.keys(ref.joints)) {
            if (u.rig.joints[jn]) ref.joints[jn].quaternion.copy(u.rig.joints[jn].quaternion);
          }
          ref.root.updateMatrixWorld(true);
          const headPart = ref.parts.find((pt) => pt.key === 'head');
          const refHeadTopY = headPart ? worldPos(headPart.node).y + 0.125 * ref.root.scale.y : null;
          let topY = -Infinity;
          for (const i of vs.topCandidates) { mesh.getVertexPosition(i, v); if (v.y > topY) topY = v.y; }
          entry.headTopDiff = refHeadTopY != null ? Math.abs(topY - refHeadTopY) : null;

          if (u.numberBack && u.rig.numberSlots) {
            if (!vs.plateBack) vs.plateBack = buildPlateCandidates(u, u.rig.numberSlots.back.node);
            if (!vs.plateFront) vs.plateFront = buildPlateCandidates(u, u.rig.numberSlots.front.node);
            entry.plateDist = {
              back: minDist(mesh, vs.plateBack, worldPos(u.rig.numberSlots.back.node)),
              front: minDist(mesh, vs.plateFront, worldPos(u.rig.numberSlots.front.node)),
            };
          }
        }
        sample.players.push(entry);
      }
      window.__samples.push(sample);
    };

    // B12：受控球員（A2）逐幀序列轉換記錄（不是每 10 tick 一次——B12 要精確找 bump/
    // overhead 與 spike 擊球幀 ±2 tick，10-tick 網格太粗）。也順帶記全員的 SEQUENCES
    // 鍵名覆蓋（B3 涵蓋要求：≥8 個不同鍵名、6 組各至少 1 個）。
    window.__seqLog = [];      // [{tick, type}]（A2 序列變化）
    window.__seqCoverage = new Set(); // 全員曾出現過的 SEQUENCES 鍵名
    window.__lastA2Seq = null;
    window.__logSeq = function logSeq(gameState) {
      const mv = window.__phase1.loop().stage.matchView;
      const units = mv.debug.units;
      for (const u of Object.values(units)) {
        const t = u.animator.peek?.()?.type;
        if (t) window.__seqCoverage.add(t);
      }
      const a2 = units.A2;
      const cur = a2?.animator.peek?.()?.type ?? null;
      if (cur !== window.__lastA2Seq) {
        window.__seqLog.push({ tick: gameState.tick, type: cur });
        window.__lastA2Seq = cur;
      }
    };

    window.__subFired = null; // null＝尚未觸發；之後是 {tick, inId, outId, ok, reason}
    window.__trySubstitute = function trySubstitute(gameState) {
      if (window.__subFired) return;
      if (gameState.tick < subAtTick || gameState.phase !== 'serve') return;
      const loop = window.__phase1.loop();
      const inId = gameState.bench.A[0];
      // 排除受控球員（'A2'）本人被換下場——B12 需要在換人之後仍能對受控球員逼出
      // 接發／擊球動作截圖；換人本身測的是「SUBSTITUTION 事件之後渲染層正確」，
      // 換的是哪一位不影響這件事，選別人換下場更貼近真人不會把自己換掉的直覺
      const outId = gameState.match.rotations.A.find(
        (id) => id !== inId && id !== 'A2' && gameState.players[id].currentRole !== 'libero',
      );
      const r = loop.stage.handlers.requestSub(outId, inId);
      window.__subFired = { tick: gameState.tick, inId, outId, ok: r.ok, reason: r.reason };
    };

    const mv = window.__phase1.loop().stage.matchView;
    const origSync = mv.sync.bind(mv);
    mv.sync = (gameState, alpha, dt, frameEvents) => {
      origSync(gameState, alpha, dt, frameEvents);
      // 精華重演／回放（runReplayFrame）用「重播用的 player.state」（rallyTape 的複製狀態，
      // 不是 window.__phase1.game 本尊）呼叫同一個 matchView.sync——tick 會倒退／重複播放
      // 過去的片段。治具只認活體 game（window.__phase1.game 那個物件參考），否則 tick 會
      // 非單調、B12 的序列轉換記錄與逐格取樣都會混進「正在重播的過去那一刻」而非真正
      // 當下——這正是 B12 seqLog 長度只有 4、tick 還倒退的成因。
      if (gameState !== window.__phase1.game) return;
      window.__sampleNow(gameState);
      window.__trySubstitute(gameState);
      window.__logSeq(gameState);
    };
  }, { SAMPLE_EVERY, subAtTick });
}

// B2：寫實模式下，場上不得有任何「殘留」幾何 InstancedMesh 實例（geoCharacter.js 的
// createGeoPool 12 池，每池 mesh.count 應收斂到實際 claim 數；useReal 時沒人 claim，
// count 應為 0——這裡直接讀 scene 而不是只看 units，才抓得到「units 都是 real 但幾何
// 池仍殘留可見實例」這種漏洞，見 geoCharacter.js finishColors 的 count 收斂修正）
// 診斷實測（2026-09-27）：scene 裡還有別的 InstancedMesh 跟球員外觀完全無關——
// 觀眾席（arena.js createArena，count=712，capacity=712，從開機就在，與外觀/match
// 狀態無關）。廣泛比對「任何 InstancedMesh」會把觀眾席也算進來，恆是假陽性。
// geoCharacter.js 的 12 池（PART_SLOTS）capacity 固定是 playerCount×1 或 ×2——
// 只挑這個範圍內的 InstancedMesh 才是「幾何球員部件池」，不比對其餘（觀眾席／未來
// 可能新增的其他裝飾用 InstancedMesh）。
async function checkGeoPoolEmpty(page) {
  return page.evaluate(() => {
    const scene = window.__phase1.scene;
    const playerCount = Object.keys(window.__phase1.loop().stage.matchView.debug.units).length;
    const candidates = [];
    const nonEmpty = [];
    scene.traverse((o) => {
      if (!o.isInstancedMesh) return;
      const capacity = o.instanceMatrix.count;
      if (capacity !== playerCount && capacity !== playerCount * 2) return; // 排除觀眾席等無關池
      candidates.push({ uuid: o.uuid, count: o.count, capacity });
      if (o.count > 0) nonEmpty.push({ uuid: o.uuid, count: o.count, capacity });
    });
    return {
      playerCount, candidateCount: candidates.length, nonEmptyPools: nonEmpty,
      allEmpty: nonEmpty.length === 0,
    };
  });
}

// 一次性配色檢查（B5 前半）：頂點色不受動畫影響，量一次即可。期望色＝resolveKit
// 用這場比賽實際的 kit 覆寫算出來（同 matchView.js 建幾何人時餵的那一份，不是憑印象
// 猜 TEAM_KIT 常數——生涯對手可能帶自訂隊服色）。
async function checkColors(page) {
  return page.evaluate(async () => {
    const gc = await import('/src/render/geoCharacter.js');
    const mv = window.__phase1.loop().stage.matchView;
    const THREE = mv.debug.THREE;
    const units = mv.debug.units;
    const kits = window.__phase1.loop().config.kits ?? null;
    const chOf = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
    const near = (a, b) => a != null && b != null && chOf(a).every((v, k) => Math.abs(v - chOf(b)[k]) <= 2);
    const out = [];
    for (const [id, u] of Object.entries(units)) {
      if (!u.real) continue;
      const g = u.real.mesh.geometry;
      const pos = g.attributes.position; const col = g.attributes.color;
      const n = pos.count;
      // 軀幹範圍近似：綁定姿勢下 |x|<=0.16 且 y 在髖(≈0.97)~肩(≈1.47)之間（BASE_H 空間，
      // 與 realPlayer.js 的 WAIST_Y/TORSO 常數同量級，不重新讀那些非 export 常數）
      const torsoCols = new Map();
      let sampled = 0;
      for (let i = 0; i < n; i += 1) {
        const x = pos.getX(i); const y = pos.getY(i);
        if (Math.abs(x) <= 0.16 && y >= 0.95 && y <= 1.45) {
          sampled += 1;
          const h = new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)).getHex();
          torsoCols.set(h, (torsoCols.get(h) || 0) + 1);
        }
      }
      const mode = [...torsoCols.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const expected = gc.resolveKit(u.real.teamId, u.real.isLibero, kits?.[u.real.teamId] ?? null).jersey;
      out.push({
        id, teamId: u.real.teamId, isLibero: u.real.isLibero, sampled,
        torsoMode: mode, expected, ok: near(mode, expected),
      });
    }
    return out;
  });
}

// H1：在該 session 的取樣裡挑「場上可見球員身高分散度最大」的那個 tick（分散度不足
// 代表當下場上球員身高太接近，比不出縮放有沒有生效），量「頭頂世界高度」與
// 「該球員 height.current」是否成比例。回傳 ok=false 時 reason 說明卡在哪個子條件。
function computeH1(session) {
  let best = null;
  for (const s of session.samples) {
    const entries = s.players.filter((p) => p.headTopY != null && p.heightCur != null);
    if (entries.length < 2) continue;
    const heights = entries.map((e) => e.heightCur);
    const spread = Math.max(...heights) - Math.min(...heights);
    if (!best || spread > best.spread) best = { tick: s.tick, entries, spread };
  }
  if (!best) return { ok: false, reason: 'no-sample-with-headTopY' };
  const ratios = best.entries.map((e) => ({ id: e.id, ratio: e.headTopY / e.heightCur }));
  const ratioMax = Math.max(...ratios.map((r) => r.ratio));
  const ratioMin = Math.min(...ratios.map((r) => r.ratio));
  const ratioSpread = ratioMax / ratioMin;
  const tallest = best.entries.reduce((a, b) => (a.heightCur > b.heightCur ? a : b));
  const shortest = best.entries.reduce((a, b) => (a.heightCur < b.heightCur ? a : b));
  const headDiff = tallest.headTopY - shortest.headTopY;
  const heightDiff = tallest.heightCur - shortest.heightCur;
  const spreadOk = best.spread >= 0.05;
  const ratioOk = ratioSpread <= 1.03;
  const propOk = heightDiff > 0 ? headDiff >= 0.5 * heightDiff : false;
  return {
    ok: spreadOk && ratioOk && propOk,
    tick: best.tick, entryCount: best.entries.length, heightSpread: best.spread,
    ratioMax, ratioMin, ratioSpread,
    tallest: { id: tallest.id, height: tallest.heightCur, headTopY: tallest.headTopY },
    shortest: { id: shortest.id, height: shortest.heightCur, headTopY: shortest.headTopY },
    headDiff, heightDiff, spreadOk, ratioOk, propOk,
  };
}

// 粗推進到 targetTicks（每次 RUNFOR_CHUNK_MS 虛擬毫秒），回報實際到達的 tick
async function runUntilTick(page, targetTicks) {
  for (let i = 0; i < MAX_CHUNKS; i += 1) {
    const tick = await page.evaluate(() => window.__phase1.game.tick);
    if (tick >= targetTicks) return tick;
    await page.clock.runFor(RUNFOR_CHUNK_MS);
  }
  return page.evaluate(() => window.__phase1.game.tick);
}

async function pullFinalState(page) {
  return page.evaluate(() => {
    const g = window.__phase1.game;
    let snapshot = null; let snapshotError = null;
    try { snapshot = JSON.stringify(g); } catch (e) { snapshotError = String(e); }
    return {
      tick: g.tick, events: JSON.parse(JSON.stringify(g.events)), snapshot, snapshotError,
    };
  });
}

// ---- 主流程：每個 seed 各跑 geo／real 兩個 session ----
async function runSession(seed, appearance) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  const boot = await bootstrapCareerMatch(page, { seed, appearance });
  await installSampler(page, { subAtTick: SUB_AT_TICK });
  const finalTick = await runUntilTick(page, TARGET_TICKS);
  const subResult = await page.evaluate(() => window.__subFired);
  const colors = appearance === 'real' ? await checkColors(page) : null;
  const geoPoolCheck = appearance === 'real' ? await checkGeoPoolEmpty(page) : null;
  const samples = await page.evaluate(() => window.__samples);
  const seqLog = await page.evaluate(() => window.__seqLog);
  const seqCoverage = await page.evaluate(() => [...window.__seqCoverage]);
  const final = await pullFinalState(page);
  // B5 N4：背號 Mesh 總數（numberBack 有值＝back+front 各一片）
  const plateMeshCount = await page.evaluate(() => Object.values(
    window.__phase1.loop().stage.matchView.debug.units,
  ).filter((u) => u.numberBack).length * 2);

  await context.close();
  return {
    seed, appearance, boot, subResult, finalTick, colors, geoPoolCheck, samples, seqLog, seqCoverage, final,
    plateMeshCount, errors,
  };
}

// ---- B8(b)：CPU 降速 60 秒（3600 sim tick）不改外觀／面數／可見寫實球員數 ----
async function runB8b(seed) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await bootstrapCareerMatch(page, { seed, appearance: 'real' });
  await installSampler(page, { subAtTick: Infinity });
  const client = await context.newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const finalTick = await runUntilTick(page, 3600);
  const samples = await page.evaluate(() => window.__samples);
  const debugNow = await page.evaluate(() => {
    const d = window.__phase1.loop().stage.matchView.debug;
    return { appearance: d.appearance, faces: d.faces };
  });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await context.close();
  return { seed, finalTick, samples, debug: debugNow, errors };
}

// ---- B9：寫實 glb 404 → 幾何 fallback＋可見提示，pageerror 恆 0 ----
async function runB9(seed) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageerrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageerrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await bootstrapCareerMatch(page, { seed, appearance: 'real', interceptGlbFail: true });
  // toast 有 6 秒真.(虛擬)壽命——先在還沒推進虛擬時鐘前檢查（此刻虛擬時間仍是 0）
  await page.waitForTimeout(200); // 讓載入失敗的 catch/then 鏈跑完（真實牆鐘，載入本身走瀏覽器網路堆疊不受 fake clock 影響）
  const toastText = await page.evaluate(() => document.getElementById('real-load-fail-toast')?.textContent ?? null);
  const debugNow = await page.evaluate(() => {
    const d = window.__phase1.loop().stage.matchView.debug;
    return { appearance: d.appearance, realLoadFailed: d.realLoadFailed, unitsAllGeo: Object.values(d.units).every((u) => !u.real) };
  });
  await installSampler(page, { subAtTick: Infinity });
  const finalTick = await runUntilTick(page, 3600); // ≥1 分鐘 sim 時間
  const stillPlaying = await page.evaluate(() => window.__phase1.game.phase != null);
  await context.close();
  return { seed, toastText, debugNow, finalTick, stillPlaying, pageerrors, consoleErrors };
}

// ---- B7：受保護畫面不動、realPlayer.js 只允許指定檔案 import（純 git/grep，無瀏覽器）----
function checkB7() {
  const baseline = 'ac41969';
  const protectedFiles = [
    'src/render/kitPreview.js', 'src/render/ritualStage.js', 'src/render/recruitPortrait.js',
    'src/render/beatStage.js', 'src/app/freeballSandbox.js', 'src/render/directPlayerView.js',
  ];
  const protectedDiff = sh(`git diff ${baseline} -- ${protectedFiles.join(' ')}`);
  let importers = [];
  try {
    importers = sh("grep -rl \"realPlayer.js'\" src --include=*.js").trim().split('\n').filter(Boolean);
  } catch (e) {
    // grep 找不到任何符合時 exit code 1，非錯誤
    importers = [];
  }
  const allowed = new Set(['src/app/realPreview.js', 'src/render/matchView.js', 'src/render/playerAppearance.js']);
  const importersNorm = importers.map((p) => p.replace(/\\/g, '/'));
  const extraImporters = importersNorm.filter((p) => !allowed.has(p));
  return {
    protectedDiff, protectedDiffEmpty: protectedDiff.trim() === '',
    importers: importersNorm, extraImporters, importersOk: extraImporters.length === 0,
    pass: protectedDiff.trim() === '' && extraImporters.length === 0,
  };
}

// ---- B12：桌機/直式，接發（bump/overhead）與扣球擊球瞬間（±2 tick）並排截圖 ----
async function findB12Ticks(seqLog, hitLeadTicksMap) {
  // seqLog：[{tick, type}]（A2 序列變化記錄）。回傳 { receiveTick, spikeTick }｜null 缺項
  let receiveTick = null;
  let spikeTick = null;
  for (let i = 0; i < seqLog.length; i += 1) {
    const { tick, type } = seqLog[i];
    if (receiveTick == null && (type === 'bump' || type === 'overhead')) {
      // 取該序列播放中段，避免剛觸發那一幀姿勢還沒展開
      const nextTick = seqLog[i + 1]?.tick ?? tick + 30;
      receiveTick = Math.round((tick + nextTick) / 2);
    }
    if (spikeTick == null && type === 'spike') {
      spikeTick = tick + (hitLeadTicksMap.spike ?? 0);
    }
  }
  return { receiveTick, spikeTick };
}

// B12 診斷實測（2026-09-27）：受控球員（A2，autopilot 下的「人類」欄位）在
// ?autopilot=1 只代發球，其餘動作走「零輸入自動保底路徑」——這條路徑不會像隊友
// （AI 全額決策）一樣觸發完整的 bump/overhead/spike 動作序列（實測：A2 在整場
// 11614 tick 的比賽中，除了兩次發球，animator.peek() 恆為 null；同一份資料裡其他
// 隊友正常出現 bump/spike 等 14–18 種鍵名——見 seqCoverage）。這不是本卷的渲染
// 缺陷，是 autopilot 這個治具慣例本身對「受控但零輸入」欄位的既有限制。改用
// matchView 既有公開介面 triggerPose/triggerContact（純渲染層——只呼叫
// animator.trigger，不寫 sim，兩模式同一 tick 呼叫同一個指令，可比對）在兩模式
// 的同一 tick 做確定性觸發，取得「接發」與「擊球瞬間」的並排畫面。
async function captureShot(page, { appearance, seed, targetTick, viewport, poseKind }) {
  await page.setViewportSize(viewport);
  // 推進到目標 tick 前先維持 no-op 渲染（跟其餘 session 一樣快）——真實渲染只在
  // 抵達目標 tick、擺好姿勢、要拍照的那一刻才需要；整段推進都開真實渲染會慢到
  // 以分鐘計（實測：真實渲染跑到 tick 4000 卡了 28 分鐘還沒到，換成 no-op 推進
  // 後 8 個鏡頭全部跑完不到 5 分鐘）。
  await bootstrapCareerMatch(page, { seed, appearance, noOpRender: true });
  // 粗推進留邊界（20s 分段的過衝量因場次/系統負載而異，geo/real 兩邊不保證衝到
  // 同一個 tick），剩下用單幀細推進逼近同一個確定的目標 tick——細推進每步 ~1
  // tick，兩邊各自收斂到同一個 targetTick 的機率遠高於粗推進。
  await runUntilTick(page, Math.max(0, targetTick - 400));
  // 逐 1ms 細推進（而非 17ms 粗步）：17ms 步幅跨越了單一 tick（60Hz≈16.67ms/tick），
  // 停止判斷發生在整步跑完之後，若該步剛好把 accumulator 餘量一次沖過 1 個以上
  // tick，geo/real 兩邊各自累積的餘量不保證相同，會停在 targetTick±1（實測：
  // portrait 視角兩次都停在 real 比 geo 少 1 tick）。改成每步只推進 1ms 並在每步
  // 後立刻檢查，讓两邊都在 tick 剛好等於 targetTick 的那一步停下，不給 accumulator
  // 機會多沖一個 tick。
  for (let i = 0; i < 2000 && (await page.evaluate(() => window.__phase1.game.tick)) < targetTick; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await page.clock.runFor(1);
  }
  if (poseKind === 'receive') {
    await page.evaluate(() => window.__phase1.loop().stage.matchView.triggerPose('A2', 'bump'));
    await page.clock.runFor(250); // 播到動作中段（bump dur=0.5s），姿勢已展開
  } else if (poseKind === 'spike') {
    await page.evaluate(() => window.__phase1.loop().stage.matchView.triggerContact('A2', 'spike'));
    // spike 本身無 windup 前置（直接觸發擊球弧），hitLeadTicks('spike') 一般 <15 tick
    await page.clock.runFor(184); // ≈11 tick（60Hz）：落在其擊球幀附近
  }
  const seqNow = await page.evaluate(() => window.__phase1.loop().stage.matchView.debug.units.A2.animator.peek?.()?.type ?? null);
  const tickAt = await page.evaluate(() => window.__phase1.game.tick);
  // 只在真的要拍照這一刻才換回真實渲染（重新建一份乾淨的 postFx，取代先前 no-op 的那份）
  await page.evaluate(async () => {
    const { createPostFx } = await import('/src/render/postFx.js');
    const s = window.__phase1.loop();
    const fresh = createPostFx(s.ctx.renderer, s.ctx.scene, s.ctx.camera, s.ctx.quality);
    fresh.render(s.ctx.scene, s.ctx.camera);
  });
  return { tickAt, seqNow };
}

const sessions = {};
for (const seed of SEEDS) {
  for (const appearance of ['geo', 'real']) {
    const key = `${seed}:${appearance}`;
    process.stderr.write(`[real-match-browser] running ${key}...\n`);
    const t0 = Date.now();
    // eslint-disable-next-line no-await-in-loop
    sessions[key] = await runSession(seed, appearance);
    process.stderr.write(`[real-match-browser] ${key} done in ${Math.round((Date.now() - t0) / 1000)}s (tick=${sessions[key].finalTick}, errors=${sessions[key].errors.length})\n`);
  }
}

await writeFile(resolve(output, 'sessions-raw.json'), JSON.stringify(sessions, null, 1));

// ---- 跨模式比對（同一 seed geo vs real）----
const SEQ_GROUPS = {
  bump: ['bump'],
  overhead: ['overhead', 'overheadJump'],
  spike: ['windup', 'spikeHold', 'spike'],
  block: ['block', 'blockJump', 'blockJumpGraze'],
  serve: ['serve', 'serveJump', 'serveFloat', 'serveReady'],
  approach: ['approach3', 'approach4'],
};

const perSeed = {};
const allRealSeqCoverage = new Set();
for (const seed of SEEDS) {
  const g = sessions[`${seed}:geo`];
  const r = sessions[`${seed}:real`];
  for (const t of r.seqCoverage) allRealSeqCoverage.add(t);

  const gMap = new Map(g.samples.map((x) => [x.tick, x]));
  const rMap = new Map(r.samples.map((x) => [x.tick, x]));
  const commonTicks = [...gMap.keys()].filter((t) => rMap.has(t));
  const visibleCountMismatches = commonTicks.filter((t) => gMap.get(t).visibleCount !== rMap.get(t).visibleCount);
  const realEntries = r.samples.flatMap((s) => s.players.filter((p) => p.real && p.visible));
  const b3HandOk = realEntries.every((p) => p.handDist && p.handDist.r <= 0.15 && p.handDist.l <= 0.15);
  const b3SoleOk = realEntries.every((p) => p.soleMin == null || p.soleMin >= -0.03);
  const b4Ok = realEntries.every((p) => p.headTopDiff == null || p.headTopDiff <= 0.05);
  const b5PlateOk = realEntries.every((p) => !p.plateDist
    || ((p.plateDist.back == null || p.plateDist.back <= 0.06) && (p.plateDist.front == null || p.plateDist.front <= 0.06)));
  // B6：兩模式各自跑到「≥TARGET_TICKS」就停（粗推進 20s 分段，geo/real 落點可能差
  // 1-2 tick），比對整場 events／收尾 snapshot 前，先算「兩邊取樣都採到的最後一個
  // 共同 tick」，用逐格輕量狀態簽章（stateSig：分數＋球位置＋全員位置）在那個確定
  // 共同的時間點比對，並把 events 裁到那個 tick 為止再比——避免把「兩邊各自多跑了
  // 1-2 tick、状態自然不同」誤判成「render 影響了 sim」。
  const commonStateTick = commonTicks.length ? Math.max(...commonTicks) : null;
  const stateSigEqual = commonStateTick != null
    && gMap.get(commonStateTick).stateSig === rMap.get(commonStateTick).stateSig;
  const trimEvents = (events) => events.filter((e) => commonStateTick == null || e.tick <= commonStateTick);
  const eventsEqual = JSON.stringify(trimEvents(g.final.events)) === JSON.stringify(trimEvents(r.final.events));
  // 完整 game 序列化只在兩邊剛好落在同一個最終 tick 時才具鑑別力（否則本來就該不同）；
  // 落點不同時這裡只記錄「不適用」，不當作失敗依據——見上面 stateSig 才是主要證據。
  const finalTickAligned = g.finalTick === r.finalTick;
  const snapshotEqual = !finalTickAligned ? null
    : (g.final.snapshotError == null && r.final.snapshotError == null
      && g.final.snapshot === r.final.snapshot);
  const activityOk = g.final.events.length > 0 && realEntries.length > 0;
  const eventTypes = new Set(r.final.events.map((e) => e.type));
  const hasLiberoSwap = eventTypes.has('LIBERO_SWAP') || g.final.events.some((e) => e.type === 'LIBERO_SWAP');
  const hasSubstitution = r.subResult?.ok === true && g.subResult?.ok === true
    && r.subResult.tick === g.subResult.tick;
  const h1Geo = computeH1(g);
  const h1Real = computeH1(r);

  perSeed[seed] = {
    matchEntryId: g.boot.matchEntryId,
    finalTickGeo: g.finalTick, finalTickReal: r.finalTick,
    commonTickCount: commonTicks.length, visibleCountMismatches: visibleCountMismatches.length,
    b2Pass: visibleCountMismatches.length === 0 && r.geoPoolCheck?.allEmpty === true
      && r.geoPoolCheck?.candidateCount === 12, // geoCharacter.js PART_SLOTS 剛好 12 種部件池
    geoPoolCheck: r.geoPoolCheck,
    b3HandOk, b3SoleOk, b3SampleCount: realEntries.length,
    b4Ok, b4SampleCount: realEntries.filter((p) => p.headTopDiff != null).length,
    b5PlateOk, b5PlateSampleCount: realEntries.filter((p) => p.plateDist).length,
    b6EventsEqual: eventsEqual, b6SnapshotEqual: snapshotEqual, b6ActivityOk: activityOk,
    b6StateSigEqual: stateSigEqual, b6CommonStateTick: commonStateTick, b6FinalTickAligned: finalTickAligned,
    hasLiberoSwap, hasSubstitution, subTick: r.subResult?.tick ?? null,
    h1Geo, h1Real,
    colorCheck: r.colors,
    seqCoverage: r.seqCoverage,
    errors: [...g.errors, ...r.errors],
  };
}

const seqGroupsCovered = Object.fromEntries(Object.entries(SEQ_GROUPS).map(([grp, keys]) => [grp, keys.some((k) => allRealSeqCoverage.has(k))]));
const b3Coverage = {
  distinctKeys: [...allRealSeqCoverage], count: allRealSeqCoverage.size,
  groupsCovered: seqGroupsCovered, allGroupsOk: Object.values(seqGroupsCovered).every(Boolean),
  countOk: allRealSeqCoverage.size >= 8,
};

// N4 上限（B5）：任一 real session 收尾時的背號 Mesh 數 ≤ 30（numberBack 有值即代表
// back+front 各一片；plateCount 由 runSession 收尾時直接數 units，見下方 sessions 迴圈）
const n4Ok = SEEDS.every((seed) => (sessions[`${seed}:real`].plateMeshCount ?? 0) <= 30);

const colorAllOk = SEEDS.every((seed) => {
  const r = sessions[`${seed}:real`];
  return (r.colors || []).length > 0 && (r.colors || []).every((c) => c.ok === true);
});

// ---- B7（純 git/grep）----
const b7 = checkB7();

// ---- B8(b)：CPU 6x 降速，與同 seed 未降速 real session 在共同 tick 對照 ----
let b8b = null;
if (!skipB8b) {
  process.stderr.write('[real-match-browser] running B8(b) CPU throttle...\n');
  const seed = SEEDS[0];
  const throttled = await runB8b(seed);
  const baseline = sessions[`${seed}:real`];
  const tMap = new Map(throttled.samples.map((x) => [x.tick, x]));
  const bMap = new Map(baseline.samples.map((x) => [x.tick, x]));
  const common = [...tMap.keys()].filter((t) => bMap.has(t));
  const mismatches = common.filter((t) => tMap.get(t).visibleCount !== bMap.get(t).visibleCount);
  b8b = {
    seed, finalTick: throttled.finalTick, debug: throttled.debug, errors: throttled.errors,
    commonTickCount: common.length, visibleCountMismatches: mismatches.length,
    appearanceStayedReal: throttled.debug.appearance === 'real',
    facesStayed20k: throttled.debug.faces === 20000,
    pass: throttled.errors.length === 0 && throttled.debug.appearance === 'real'
      && throttled.debug.faces === 20000 && common.length > 0 && mismatches.length === 0,
  };
}

// ---- B9：載入失敗 fallback ----
let b9 = null;
if (!skipB9) {
  process.stderr.write('[real-match-browser] running B9 load-fail...\n');
  const seed = SEEDS[0];
  const res = await runB9(seed);
  b9 = {
    ...res,
    toastHasSubstring: (res.toastText || '').includes('寫實模型載入失敗'),
    pass: res.pageerrors.length === 0 && (res.toastText || '').includes('寫實模型載入失敗')
      && res.debugNow.unitsAllGeo === true && res.finalTick >= 3600 && res.stillPlaying === true,
  };
}

// ---- B12：截圖證據（桌機/直式 × 幾何/寫實，接發 bump/overhead ＋ 扣球擊球瞬間）----
let b12 = null;
if (!skipShots) {
  process.stderr.write('[real-match-browser] running B12 screenshots...\n');
  const seed = SEEDS[0];
  // 受控球員（A2）在 autopilot 的零輸入保底路徑下不會自然觸發 bump/overhead/spike
  // （見上方 captureShot 的診斷註解）——固定一個「換人已完成、rally 穩定進行中」的
  // tick（4000，晚於全部 seed 的 SUBSTITUTION tick 3000-3276），兩模式同一 tick
  // 用 triggerPose/triggerContact 做確定性觸發，取得可比對的畫面。
  const BASE_TICK = 4000;
  b12 = { seed, baseTick: BASE_TICK, shots: [], manifest: [] };
  for (const [name, poseKind] of [['receive', 'receive'], ['spike-hit', 'spike']]) {
    for (const [vpName, viewport] of [['desktop', { width: 1280, height: 720 }], ['portrait', { width: 390, height: 844 }]]) {
      for (const appearance of ['geo', 'real']) {
        const shotT0 = Date.now();
        process.stderr.write(`[real-match-browser]   B12 shot ${name}/${vpName}/${appearance}...\n`);
        // eslint-disable-next-line no-await-in-loop
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
        // eslint-disable-next-line no-await-in-loop
        const page = await context.newPage();
        const errs = [];
        page.on('pageerror', (e) => errs.push(String(e)));
        // eslint-disable-next-line no-await-in-loop
        const res = await captureShot(page, { appearance, seed, targetTick: BASE_TICK, viewport, poseKind });
        const fileName = `${vpName}-${name}-${appearance}.png`;
        const path = resolve(output, fileName);
        // eslint-disable-next-line no-await-in-loop
        await page.screenshot({ path });
        // eslint-disable-next-line no-await-in-loop
        await context.close();
        process.stderr.write(`[real-match-browser]   B12 shot ${name}/${vpName}/${appearance} done in ${Math.round((Date.now() - shotT0) / 1000)}s (tick=${res.tickAt}, seq=${res.seqNow})\n`);
        b12.shots.push({ file: fileName, appearance, viewport: vpName, poseKind, ...res, errors: errs });
        b12.manifest.push({
          file: fileName, seed, tick: res.tickAt, seq: res.seqNow, appearance, viewport: vpName,
        });
      }
    }
  }
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(b12.manifest, null, 2));
  // 「同一 seed 同一 tick」比對的是同一組（同一 viewport、同一 pose）內 geo vs real
  // 兩張是否同 tick——桌機那組跟直式那組本來就是兩組獨立畫面，不要求彼此同 tick
  // （B12 條文：「桌機…與直式…，同一 seed 同一 tick 的『接發』…各一組」，
  // 「同一 tick」修飾的是同一組內的幾何/寫實並排，不是跨兩種 viewport）。
  const sameTickWithinGroup = (name, vpName) => {
    const rows = b12.shots.filter((s) => s.file.includes(name) && s.viewport === vpName);
    const ticks = new Set(rows.map((s) => s.tickAt));
    return ticks.size <= 1 && rows.length === 2;
  };
  const allGroupsAligned = ['receive', 'spike-hit'].every(
    (name) => ['desktop', 'portrait'].every((vp) => sameTickWithinGroup(name, vp)),
  );
  b12.pass = b12.shots.length === 8 && b12.shots.every((s) => s.errors.length === 0)
    && allGroupsAligned
    && b12.shots.filter((s) => s.file.includes('receive')).every((s) => s.seqNow === 'bump' || s.seqNow === 'overhead')
    && b12.shots.filter((s) => s.file.includes('spike-hit')).every((s) => s.seqNow === 'spike');
}

report.perSeed = perSeed;
report.b3Coverage = b3Coverage;
report.colorAllOk = colorAllOk;
report.n4Ok = n4Ok;
report.plateMeshCounts = Object.fromEntries(SEEDS.map((seed) => [seed, sessions[`${seed}:real`].plateMeshCount]));
report.b7 = b7;
report.b8b = b8b;
report.b9 = b9;
report.b12 = b12;
report.sessionsSummary = Object.fromEntries(Object.entries(sessions).map(([k, s]) => [k, {
  finalTick: s.finalTick, sampleCount: s.samples.length, errors: s.errors,
  subResult: s.subResult, eventsLen: s.final.events.length,
  eventCounts: s.final.events.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {}),
}]));

// 零鑑別力防呆：realEntries／取樣為空時 .every() 對空陣列恆真——這裡額外要求樣本數
// > 0，不讓「其實什麼都沒量到」偽裝成通過（含 B5 的 plate 樣本，見下方 b5PlateSampleCount）。
const b3SamplesOk = Object.values(perSeed).every((p) => p.b3SampleCount > 0);
const b4SamplesOk = Object.values(perSeed).every((p) => p.b4SampleCount > 0);
const b5PlateSamplesOk = Object.values(perSeed).every((p) => p.b5PlateSampleCount > 0);

report.pass = {
  B2: Object.values(perSeed).every((p) => p.b2Pass) && SEEDS.every((s) => perSeed[s].errors.length === 0)
    && SEEDS.some((s) => perSeed[s].hasLiberoSwap) && SEEDS.some((s) => perSeed[s].hasSubstitution),
  B3: Object.values(perSeed).every((p) => p.b3HandOk && p.b3SoleOk) && b3SamplesOk
    && b3Coverage.countOk && b3Coverage.allGroupsOk,
  B4: Object.values(perSeed).every((p) => p.b4Ok) && b4SamplesOk,
  B5: Object.values(perSeed).every((p) => p.b5PlateOk) && b5PlateSamplesOk && colorAllOk && n4Ok,
  // B6 主要證據＝b6StateSigEqual（兩邊都採到的最後共同 tick，分數/球/全員位置逐值同）
  // ＋裁到共同 tick 為止的 events 逐值同；b6SnapshotEqual 只在兩邊剛好落在同一個
  // 最終 tick 時才有意義（null＝不適用，不當失敗）。
  B6: Object.values(perSeed).every((p) => p.b6EventsEqual && p.b6StateSigEqual && p.b6ActivityOk
    && (p.b6SnapshotEqual === null || p.b6SnapshotEqual === true)),
  B7: b7.pass,
  B8b: b8b ? b8b.pass : null,
  B9: b9 ? b9.pass : null,
  B12: b12 ? b12.pass : null,
  H1: Object.values(perSeed).every((p) => p.h1Geo.ok && p.h1Real.ok),
};
report.vacuousGuard = { b3SamplesOk, b4SamplesOk, b5PlateSamplesOk };

await writeFile(resolve(output, reportName), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, perSeed: Object.fromEntries(Object.entries(perSeed).map(([k, v]) => [k, {
  b2Pass: v.b2Pass, b3HandOk: v.b3HandOk, b3SoleOk: v.b3SoleOk, b4Ok: v.b4Ok, b5PlateOk: v.b5PlateOk,
  b6EventsEqual: v.b6EventsEqual, b6SnapshotEqual: v.b6SnapshotEqual, hasLiberoSwap: v.hasLiberoSwap,
  hasSubstitution: v.hasSubstitution, subTick: v.subTick,
  h1Geo: v.h1Geo, h1Real: v.h1Real,
}])), b3Coverage, colorAllOk, b7: { pass: b7.pass, protectedDiffEmpty: b7.protectedDiffEmpty, importersOk: b7.importersOk }, b8b, b9 }, null, 1));
await browser.close();
