#!/usr/bin/env node
// 跳躍前飄卷量測治具（docs/kickoffs/jump-drift-acceptance.md J2–J7）。
//
// 用法：先起 dev server（npm run dev -- --host 127.0.0.1 --port 5231 --strictPort），再
//   node tools/jump-drift-measure.mjs --label before|after [--out <json>]
// 環境變數：JD_BASE_URL（預設 http://127.0.0.1:5231）、PLAYWRIGHT_MODULE、
//   SEEDS（逗號分隔，預設 1,2,3）、TARGET_TICKS（預設 36000＝10 分鐘 sim；局終提早停）。
//
// ★ 走真實鏈路，不重抄前飄公式 ★ 開一場正式（生涯）比賽：resolveMatchConfig→
// buildMatchStage→startMatchLoop（同 tools/real-match-browser.mjs 的開賽法），matchLoop
// 的觸發、matchView.sync、geoAnimator 全部是遊戲本尊。治具只包一層 sync 讀結果：
//   root  ＝u.rig.root.position（畫面上的人在哪）
//   sim   ＝a.px+(a.x−a.px)·alpha（sync 自己用的插值；alpha 取自 sync 的引數）
//   滯空  ＝animator.probe().jumpY>0（改前就有的唯讀窺視，兩版同一把尺）
//   擊球點＝TOUCH 事件那一幀 sim 球的 x/z（game.js 觸球時 ball.px=ball.x=觸球點）
//   手    ＝慣用手腕關節世界座標（rig.handed）
// 改後版本另讀 matchView 的除錯欄位 u.jumpDrift（本卷的前飄位移）與 u.reachOff
// （reachAssist 根位移，改前就有的量、只是改後才外露）；改前沒有這兩欄＝記 null。
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const LABEL = getArg('--label', 'run');
const OUT = resolve(getArg('--out', `docs/experiments/jump-drift-evidence/measure-${LABEL}.json`));
const base = process.env.JD_BASE_URL || 'http://127.0.0.1:5231';
// 場次：「種子」或「種子@對手 id」。預設對手＝新生涯第一場（該隊 jumpServeRate＝0，整場沒有跳發），
// 所以預設另加三場對 iron-mist（src/career/opponents.js：jumpServeRate 0.45）收跳發樣本
const SEEDS = (process.env.SEEDS || '1,2,3,1@iron-mist,2@iron-mist,3@iron-mist').split(',').map((s) => {
  const [head, j8] = s.trim().split('#');
  const [seed, opp] = head.split('@');
  return { seed: Number(seed), opp: opp || null, j8: j8 === 'J8' };
});
const TARGET_TICKS = Number(process.env.TARGET_TICKS) || 36000;
const CHUNK_MS = 20000;
const sh = (c) => execSync(c, { encoding: 'utf8' }).trim();

const RAW_IN = getArg('--analyze-raw', null); // 只重跑分析（讀先前 --raw 存下的原始 episode），不開瀏覽器
const browser = RAW_IN ? null : await chromium.launch({
  headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});

async function bootstrap(page, seed, opp) {
  await page.addInitScript(() => { try { localStorage.setItem('vd-player-appearance', 'geo'); } catch { /* noop */ } });
  await page.clock.install({ time: 0 });
  const nowMs = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(nowMs);
  await page.goto(`${base}/?autopilot=1&seed=${seed}`, { timeout: 120000 });
  await page.waitForFunction(() => Boolean(window.__ctx), null, { timeout: 30000 });
  await page.evaluate(async ({ seed, opp }) => {
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
    const matchEntry0 = nextMatch(career);
    const matchEntry = opp ? { ...matchEntry0, opponentId: opp } : matchEntry0;
    const careerCtx = { store, career, player, matchEntry, roster, lineup: store.loadLineup(), seasonIndex: 1 };
    const config = resolveMatchConfig({ params: ctx.params, careerCtx, randomSeed: 777 });
    const game = createGame(config.gameOptions);
    const aiState = createAiState();
    const gates = resolveTechGates(game, 'A2', true, false);
    const stage = await buildMatchStage({ ctx, config, gates, playerId: 'A2', game });
    startMatchLoop({ ctx, config, gates, stage, careerCtx, playerId: 'A2', game, aiState });
    const s = window.__phase1.loop();
    s.openingShow = null; s.lineupIntro = null; s.replay = null;
    stage.teachDialog?.hide();
    stage.coachOptionDialog?.hide?.();
    s.ctx.postFx.render = () => {};
  }, { seed, opp });
}

async function installRecorder(page, j8) {
  await page.evaluate(async ({ j8 }) => {
    const { isBackRow, TEAM_SIDE } = await import('/src/sim/rotation.js');
    const mv = window.__phase1.loop().stage.matchView;
    const THREE = mv.debug.THREE;
    const wp = new THREE.Vector3();
    const POST_LAND_TICKS = 42; // 落地後再記 0.7 s（J7 看 0.5 s）
    const live = {};            // id → 進行中的 episode
    window.__episodes = [];
    window.__frameDts = [];
    const origSync = mv.sync.bind(mv);
    mv.sync = (g, alpha, dt, frameEvents = []) => {
      origSync(g, alpha, dt, frameEvents);
      if (g !== window.__phase1.game) return; // 精華重演用的是複製狀態，不算
      // J8（修訂 R2）：玩家本人（A2）扣球。代打＝走遊戲本身的出手入口 controls.chooseAttack
      // （就是面板按鈕的 handler，matchLoop.js 攻擊面板那段），時機取「距 AI 擊球點 ≤26 tick」——玩家的出手在球一進手點就判定、比 AI 的 hitPoint 早約 8 tick，這樣起跳→擊球約 18 tick，接近 AI 攻擊手的 23 tick；決策窗 0.4× 下起跳→擊球 ≈0.75 s 真實時間，仍在 JUMP_WINDOW_MS 900 內
      // ——比照真人在決策窗內按下；選第一個攻擊區。其餘（起跳訊號→windup、sim 扣球）全走原路
      // 走位同樣代打：舉球給 A2 後（claimId＝A2、第二觸已完成）用 WASD（真的鍵盤事件，
      // matchControls 的 keydown/keyup 監聽）跑向「擊球點往自家後場退 0.68 m」的起跳點——
      // 與 AI 攻擊手的走位目標同一個定義（ai.js 起跳點分支＋approach.js TAKEOFF.FRONT）；
      // 不跑位的話 A2 站在原地、球到不了手點，出手全被降級成接球（實測 24 次代打只成 1 球）
      if (j8) {
        const s = window.__phase1.loop();
        const ctl = s.stage.controls; const ai = s.aiState;
        const want = new Set();
        if (g.phase === 'rally' && g.rally.touches === 2 && g.rally.possession === 'A'
          && ai.claimId === 'A2' && ai.hitPoint) {
          const a = g.actors.A2;
          const tx = ai.hitPoint.x; const tz = ai.hitPoint.z + 0.68; // A 隊 TEAM_SIDE＝+1：往後場＝+z
          const dx = tx - a.x; const dz = tz - a.z; const d = Math.hypot(dx, dz);
          if (d > 0.25) {
            if (dz < -0.38 * d) want.add('KeyW');
            if (dz > 0.38 * d) want.add('KeyS');
            if (dx < -0.38 * d) want.add('KeyA');
            if (dx > 0.38 * d) want.add('KeyD');
          }
        }
        window.__j8Keys ??= new Set();
        for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
          if (want.has(k) && !window.__j8Keys.has(k)) { window.dispatchEvent(new KeyboardEvent('keydown', { code: k })); window.__j8Keys.add(k); }
          if (!want.has(k) && window.__j8Keys.has(k)) { window.dispatchEvent(new KeyboardEvent('keyup', { code: k })); window.__j8Keys.delete(k); }
        }
        const zones = ctl.attackZones(g);
        if (zones && zones.length && !ctl.attackPending() && ai.hitPoint?.ticks != null) {
          const left = ai.hitPoint.ticks - (g.tick - ai.planTick);
          if (left <= 26) { ctl.chooseAttack(zones[0]); window.__j8Taps = (window.__j8Taps ?? 0) + 1; }
        }
      }
      window.__frameDts.push(dt);
      const units = mv.debug.units;
      for (const [id, u] of Object.entries(units)) {
        const a = g.actors[id];
        const jumpY = u.animator.probe().jumpY;
        const seq = u.animator.peek()?.type ?? null;
        const simX = a.px + (a.x - a.px) * alpha;
        const simZ = a.pz + (a.z - a.pz) * alpha;
        const r = u.rig.root.position;
        let ep = live[id];
        // 落地後又離地＝新的一跳：前一段收尾、這一幀起算新 episode（不併成同一段）
        if (ep && ep.landIdx != null && jumpY > 0) { window.__episodes.push(ep); delete live[id]; ep = null; }
        if (!ep && jumpY > 0) {
          const team = g.players[id].teamId;
          ep = live[id] = {
            id, team, side: TEAM_SIDE[team], height: g.players[id].height.current,
            backRow: isBackRow(g.match.rotations[team], id),
            takeoffTick: g.tick, seqAtTakeoff: seq, frames: [], hits: [], serve: null, block: false,
            landIdx: null, postLand: 0,
          };
        }
        if (!ep) continue;
        const hand = u.rig.joints[`${u.rig.handed === 'l' ? 'l' : 'r'}Wrist`].getWorldPosition(wp);
        const f = {
          tick: g.tick, phase: g.phase, dt, jumpY, seq,
          rx: r.x, ry: r.y, rz: r.z, sx: simX, sz: simZ,
          drift: u.jumpDrift ? [u.jumpDrift.x, u.jumpDrift.z] : null,
          aimed: u.jumpDrift?.aimed ?? null, aim: u.jumpDrift?.aimX != null ? [u.jumpDrift.aimX, u.jumpDrift.aimZ] : null, touches: g.rally.touches, poss: g.rally.possession,
          reach: u.reachOff ? [u.reachOff.dx, u.reachOff.dz] : null,
          hand: [hand.x, hand.y, hand.z],
          ball: [g.ball.px + (g.ball.x - g.ball.px) * alpha, g.ball.py + (g.ball.y - g.ball.py) * alpha,
            g.ball.pz + (g.ball.z - g.ball.pz) * alpha],
          blockUntil: a.blockUntil, divedUntil: a.divedUntil,
        };
        ep.frames.push(f);
        if (a.blockUntil >= g.tick) ep.block = true;
        for (const e of frameEvents) {
          if (e.playerId !== id) continue;
          if (e.type === 'TOUCH') {
            ep.hits.push({
              idx: ep.frames.length - 1, kind: e.kind, routeKind: e.routeKind ?? null,
              jumpSet: !!e.jumpSet,
              // 擊球點＝觸球那一 tick 的球位置 from（game.js performTouch）。觸球後同一 tick 就積分了
              // 一步、本幀可能又多跑幾 tick——水平速度無阻力，往回推 (g.tick−e.tick) 步即得；
              // 高度取事件自帶的 ballY（＝from.y 取到 cm）
              ballAt: [g.ball.x - g.ball.vx * (g.tick - e.tick) / 60, e.ballY, g.ball.z - g.ball.vz * (g.tick - e.tick) / 60],
            });
          } else if (e.type === 'SERVE') {
            ep.serve = { idx: ep.frames.length - 1, style: e.style ?? null, ballAt: [g.ball.x - g.ball.vx * (g.tick - e.tick) / 60, g.ball.y, g.ball.z - g.ball.vz * (g.tick - e.tick) / 60] };
          } else if (e.type === 'BLOCK_TOUCH') ep.block = true;
        }
        if (ep.landIdx == null && jumpY <= 0) ep.landIdx = ep.frames.length - 1;
        if (ep.landIdx != null) {
          ep.postLand += 1;
          if (ep.postLand > POST_LAND_TICKS) { window.__episodes.push(ep); delete live[id]; }
        }
      }
      // 跳發：SERVE 事件那一幀人還沒離地（serveJump 從 t=0 起弧），事件先記在旁邊，
      // 下一幀起跳時併進該 episode
      for (const e of frameEvents) {
        if (e.type === 'SERVE' && !live[e.playerId]) {
          window.__pendingServe = { id: e.playerId, tick: g.tick, style: e.style ?? null, ballAt: [g.ball.x - g.ball.vx * (g.tick - e.tick) / 60, g.ball.y, g.ball.z - g.ball.vz * (g.tick - e.tick) / 60] };
        }
      }
      const ps = window.__pendingServe;
      if (ps && live[ps.id] && !live[ps.id].serve && live[ps.id].takeoffTick - ps.tick <= 3) {
        live[ps.id].serve = { idx: -1, tick: ps.tick, style: ps.style, ballAt: ps.ballAt };
        window.__pendingServe = null;
      }
    };
  }, { j8 });
}

async function runSeed({ seed, opp, j8 }) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await bootstrap(page, seed, opp);
  await installRecorder(page, j8);
  let last = -1; let stall = 0;
  for (let i = 0; i < 400; i += 1) {
    const st = await page.evaluate(() => ({ tick: window.__phase1.game.tick, phase: window.__phase1.game.phase }));
    if (st.tick >= TARGET_TICKS || st.phase === 'set_over' || st.phase === 'match_over') break;
    if (st.tick === last) { stall += 1; if (stall > 3) break; } else stall = 0;
    last = st.tick;
    await page.clock.runFor(CHUNK_MS);
  }
  const out = await page.evaluate(() => ({
    tick: window.__phase1.game.tick, phase: window.__phase1.game.phase,
    score: window.__phase1.game.match.score, episodes: window.__episodes, j8Taps: window.__j8Taps ?? 0,
    dtStats: (() => { const d = window.__frameDts; const s = [...d].sort((a, b) => a - b); return { n: d.length, p50: s[Math.floor(s.length / 2)], max: s[s.length - 1] }; })(),
  }));
  await context.close();
  return { seed: `${seed}${opp ? `@${opp}` : ''}${j8 ? '#J8' : ''}`, errors, ...out };
}

// ─────────────── 分析（可用 --analyze-raw 離線重跑） ───────────────
// 定義（報告 docs/experiments/jump-drift-report.md「量法」節逐條寫明）：
//   P0＝起跳幀 sim 位置；S＝擊球幀 sim 位置（sim 到位即停＝原地拔起的點）；H＝擊球點（TOUCH 幀球 x/z）
//   J2 主判準（字面）：d_sim＝|H−P0|、方向 u＝(H−P0)/|H−P0|、d_render＝(root_hit−root_0)·u
//   J2 參考（到位點）：d_simS＝|H−S|、d_rel＝(root_hit−S)·(H−S)/|H−S|
//   J3：起跳幀→落地幀（jumpY 回 0）逐幀 root 水平步長與沿 u 的增量（畫面幀；治具 rAF＝16 ms＝60fps）
//   J5：episode 全幀 |root.z|（網面 z=0）與是否在己方側
//   J6：u.jumpDrift（改後才有）——block 全幀須恰為 0；jumpSet ≤0.15 m
//   J7：落地後殘差 root−sim−reachOff（reachAssist 的根位移扣掉；改前沒外露＝不扣）
// 窗口截斷：sim 位置單幀跳 >0.3 m（得分後重新佈陣的瞬移，不屬於跳躍本身）之後的幀不算
const hyp = (x, z) => Math.hypot(x, z);
const TELEPORT = 0.3;
const STEP_MAX = 0.07; // J3／J7 每幀上限（修訂 R1：0.05→0.07）
function classify(ep) {
  const spikeHit = ep.hits.find((h) => h.kind === 'spike');
  if (ep.serve && ep.serve.style === 'power') return 'jumpServe';
  if (spikeHit) {
    return (spikeHit.routeKind === 'pipe' || spikeHit.routeKind === 'dball' || ep.backRow) ? 'back' : 'spike';
  }
  if (ep.hits.some((h) => h.kind === 'set' && h.jumpSet)) return 'jumpSet';
  if (ep.block || /^block/.test(ep.seqAtTakeoff ?? '')) return 'block';
  if (/^windup|^approach|^spike/.test(ep.seqAtTakeoff ?? '')) return 'decoy';
  return `other:${ep.seqAtTakeoff}`;
}
function analyze(ep) {
  const cat = classify(ep);
  const F = ep.frames;
  let end = F.length - 1;
  for (let i = 1; i < F.length; i += 1) {
    if (hyp(F[i].sx - F[i - 1].sx, F[i].sz - F[i - 1].sz) > TELEPORT) { end = i - 1; break; }
  }
  const f0 = F[0];
  const land = Math.min(ep.landIdx ?? end, end);
  const res = {
    a2: ep.id === 'A2',
    id: ep.id, team: ep.team, side: ep.side, takeoffTick: ep.takeoffTick, cat, seq: ep.seqAtTakeoff,
    airFrames: land, truncated: end < F.length - 1, landed: ep.landIdx != null && ep.landIdx <= end,
  };
  const spikeHit = ep.hits.find((h) => h.kind === 'spike') ?? ep.hits.find((h) => h.kind === 'set' && h.jumpSet);
  const reachAlong = (f, u) => (f.reach ? f.reach[0] * u[0] + f.reach[1] * u[1] : null);
  let u = [0, -ep.side];
  if (spikeHit && spikeHit.idx <= end) {
    const fh = F[spikeHit.idx];
    const H = [spikeHit.ballAt[0], spikeHit.ballAt[2]];
    const dx = H[0] - f0.sx; const dz = H[1] - f0.sz;
    res.dSim = hyp(dx, dz);
    if (res.dSim > 1e-6) u = [dx / res.dSim, dz / res.dSim];
    res.hitFrames = spikeHit.idx;
    res.hitTicks = fh.tick - ep.takeoffTick;
    res.slowmo = F.slice(0, spikeHit.idx + 1).some((f) => f.dt < 0.0155);
    res.dRender = (fh.rx - f0.rx) * u[0] + (fh.rz - f0.rz) * u[1];
    res.ratio = res.dSim > 1e-6 ? res.dRender / res.dSim : null;
    res.reachAlongAtHit = reachAlong(fh, u);
    const sx = H[0] - fh.sx; const sz = H[1] - fh.sz;
    res.dSimS = hyp(sx, sz);
    const us = res.dSimS > 1e-6 ? [sx / res.dSimS, sz / res.dSimS] : u;
    res.dRel = (fh.rx - fh.sx) * us[0] + (fh.rz - fh.sz) * us[1];
    res.handBall = Math.hypot(fh.hand[0] - spikeHit.ballAt[0], fh.hand[1] - spikeHit.ballAt[1], fh.hand[2] - spikeHit.ballAt[2]);
    res.driftAtHit = fh.drift ? hyp(fh.drift[0], fh.drift[1]) : null;
    res.needPerFrame = res.hitFrames > 0 ? (0.8 * res.dSim) / res.hitFrames : null;
  } else if (ep.serve) {
    res.dSim = hyp(ep.serve.ballAt[0] - f0.sx, ep.serve.ballAt[2] - f0.sz); // 跳發：sim 擊球點＝腳下
    // R3：沿發球方向（發球點→球在第 3 幀的位置，水平）起跳幀→落地幀 root 位移
    const fb = F[Math.min(3, F.length - 1)].ball;
    const sx = fb[0] - ep.serve.ballAt[0]; const sz = fb[2] - ep.serve.ballAt[2]; const sd = hyp(sx, sz);
    if (sd > 1e-6) u = [sx / sd, sz / sd];
    if (res.landed) res.serveDrift = (F[land].rx - f0.rx) * u[0] + (F[land].rz - f0.rz) * u[1];
  }
  let maxStep = 0; let minDelta = Infinity;
  for (let i = 1; i <= land; i += 1) {
    maxStep = Math.max(maxStep, hyp(F[i].rx - F[i - 1].rx, F[i].rz - F[i - 1].rz));
    minDelta = Math.min(minDelta, (F[i].rx - F[i - 1].rx) * u[0] + (F[i].rz - F[i - 1].rz) * u[1]);
  }
  res.airMaxStep = maxStep; res.airMinForwardDelta = minDelta === Infinity ? 0 : minDelta;
  let minNet = Infinity; let wrongSide = 0;
  for (let i = 0; i <= end; i += 1) {
    minNet = Math.min(minNet, Math.abs(F[i].rz));
    if (Math.sign(F[i].rz) !== ep.side) wrongSide += 1;
  }
  res.minNetDist = minNet; res.wrongSideFrames = wrongSide;
  if (f0.drift) {
    let maxDrift = 0; let allZero = true;
    for (let i = 0; i <= end; i += 1) {
      if (F[i].drift[0] !== 0 || F[i].drift[1] !== 0) allZero = false;
      maxDrift = Math.max(maxDrift, hyp(F[i].drift[0], F[i].drift[1]));
    }
    res.maxDrift = maxDrift; res.driftAllZero = allZero;
  } else { res.maxDrift = null; res.driftAllZero = null; }
  const resid = (f) => [f.rx - f.sx - (f.reach ? f.reach[0] : 0), f.rz - f.sz - (f.reach ? f.reach[1] : 0)];
  if (res.landed) {
    let t = 0; let mergedAt = null; let mergeMaxStep = 0; let maxResid = 0; let residAt05 = null;
    for (let i = ep.landIdx; i <= end; i += 1) {
      const rr = resid(F[i]); const m = hyp(rr[0], rr[1]);
      if (i > ep.landIdx) {
        t += F[i].dt;
        const rp = resid(F[i - 1]);
        mergeMaxStep = Math.max(mergeMaxStep, hyp(rr[0] - rp[0], rr[1] - rp[1]));
      }
      if (m < 0.01) { if (mergedAt == null) mergedAt = t; } else mergedAt = null;
      if (residAt05 == null && t >= 0.5) residAt05 = m;
      maxResid = Math.max(maxResid, m);
    }
    res.residAtLand = hyp(...resid(F[ep.landIdx]));
    res.mergedAtSec = mergedAt; res.mergeMaxStep = mergeMaxStep; res.maxResidAfterLand = maxResid;
    res.residAt05 = residAt05; res.postLandSec = t;
  }
  return res;
}
const median = (arr) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const maxOf = (arr) => (arr.length ? Math.max(...arr) : null);
const minOf = (arr) => (arr.length ? Math.min(...arr) : null);

let sessions;
if (RAW_IN) {
  sessions = JSON.parse(readFileSync(resolve(RAW_IN), 'utf8'));
} else {
  sessions = [];
  for (const sd of SEEDS) {
    const t0 = Date.now();
    const s = await runSeed(sd);
    console.log(`[seed ${s.seed}] tick=${s.tick} phase=${s.phase} episodes=${s.episodes.length} errors=${s.errors.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    sessions.push(s);
  }
  await browser.close();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT.replace(/\.json$/, '-raw.json'), JSON.stringify(sessions));
}

const rows = [];
for (const s of sessions) for (const ep of s.episodes) rows.push({ seed: s.seed, ...analyze(ep) });
const byCat = {};
for (const r of rows) {
  (byCat[r.cat] ??= []).push(r);
  if (r.a2 && (r.cat === 'spike' || r.cat === 'back')) (byCat.A2attack ??= []).push(r);
}
const summary = {};
for (const [cat, rs] of Object.entries(byCat)) {
  const h = rs.filter((r) => r.dRender != null);
  const landed = rs.filter((r) => r.landed);
  summary[cat] = {
    n: rs.length, nHit: h.length, seeds: [...new Set(rs.map((r) => r.seed))].length,
    dSim_p50: median(h.map((r) => r.dSim)), dSim_max: maxOf(h.map((r) => r.dSim)),
    dRender_p50: median(h.map((r) => r.dRender)), ratio_min: minOf(h.filter((r) => r.ratio != null).map((r) => r.ratio)),
    J2_fail: h.filter((r) => r.dRender < 0.8 * r.dSim).length,
    dRel_p50: median(h.map((r) => r.dRel)), dSimS_p50: median(h.map((r) => r.dSimS)),
    handBall_p50: median(h.map((r) => r.handBall)), handBall_max: maxOf(h.map((r) => r.handBall)),
    infeasible: h.filter((r) => r.needPerFrame > 0.05).length,
    J3_airMaxStep: maxOf(rs.map((r) => r.airMaxStep)), J3_airMinForwardDelta: minOf(rs.map((r) => r.airMinForwardDelta)),
    J3_fail: rs.filter((r) => r.airMaxStep > STEP_MAX || r.airMinForwardDelta < -1e-9).length,
    J5_minNetDist: minOf(rs.map((r) => r.minNetDist)), J5_wrongSideFrames: rs.reduce((a, r) => a + r.wrongSideFrames, 0),
    J6_maxDrift: rs[0]?.maxDrift == null ? null : maxOf(rs.map((r) => r.maxDrift)),
    J6_allZero: rs[0]?.driftAllZero == null ? null : rs.every((r) => r.driftAllZero),
    J7_landed: landed.length, J7_residAt05_max: maxOf(landed.filter((r) => r.residAt05 != null).map((r) => r.residAt05)),
    J7_notMergedBy05: landed.filter((r) => r.postLandSec >= 0.5 && !(r.mergedAtSec != null && r.mergedAtSec <= 0.5)).length,
    J7_mergeMaxStep: maxOf(landed.map((r) => r.mergeMaxStep)),
    J7_fail: landed.filter((r) => r.mergeMaxStep > STEP_MAX || (r.postLandSec >= 0.5 && !(r.mergedAtSec != null && r.mergedAtSec <= 0.5))).length,
    J5_fail: rs.filter((r) => r.minNetDist < 0.15 || r.wrongSideFrames > 0).length,
    serveDrift_min: minOf(rs.filter((r) => r.serveDrift != null).map((r) => r.serveDrift)),
    serveDrift_max: maxOf(rs.filter((r) => r.serveDrift != null).map((r) => r.serveDrift)),
    serve_fail: cat === 'jumpServe' ? rs.filter((r) => r.landed && (r.serveDrift == null || r.serveDrift < 0.6 || r.serveDrift > 1.5)).length : null,
    serve_landed: cat === 'jumpServe' ? rs.filter((r) => r.landed).length : null,
    truncated: rs.filter((r) => r.truncated).length,
  };
}
const hb = rows.filter((r) => (r.cat === 'spike' || r.cat === 'back') && r.handBall != null).map((r) => r.handBall);
const report = {
  label: LABEL, head: sh('git rev-parse --short HEAD'), dirty: sh('git status --porcelain').split('\n').filter(Boolean),
  base, seeds: sessions.map((s) => s.seed), targetTicks: TARGET_TICKS,
  sessions: sessions.map((s) => ({ seed: s.seed, tick: s.tick, phase: s.phase, score: s.score, episodes: s.episodes.length, errors: s.errors, dtStats: s.dtStats, j8Taps: s.j8Taps })),
  summary,
  J4: { n: hb.length, median: median(hb), max: maxOf(hb) },
  rows,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ label: LABEL, head: report.head, dirty: report.dirty.length, sessions: report.sessions.map(({ seed, tick, phase, episodes, errors }) => ({ seed, tick, phase, episodes, errors: errors.length })) }));
for (const [cat, s] of Object.entries(summary)) console.log(cat.padEnd(14), JSON.stringify(s, (k, v) => (typeof v === 'number' ? Number(v.toFixed(4)) : v)));
console.log('J4', JSON.stringify(report.J4));
console.log(`寫出 ${OUT}`);

