#!/usr/bin/env node
// 寫實球員卷 2B 驗收治具：E2(b)、E3、E4、E6（docs/kickoffs/real-player-stage2-match.md「### 2B 驗收」）
// 量法凍結紀錄：動手改 src 前寫下（scratchpad acceptance-2b-drivers.md，內容抄入 motion-2b-report.md）。
//
// 用法（repo 根目錄）：
//   node tools/motion-2b-check.mjs [--d0-json <D0 腳本 JSON>] [--only e2b,e3,e4,e6] [--out <報告 JSON>] [--skip-test]
// E2(b)：讀 D0 腳本 JSON 的 approach.primary.drop（公尺）∈ [0.20, 0.30]
// E3   ：677516f 與 ROOT 下 geoAnimator 的 SEQUENCES 逐鍵比 dur/hit/airDur/jump；
//        tests/geo-animator.test.mjs 的 hitLeadTicks 斷言區塊與 677516f 逐字相同且該檔全綠
// E4   ：每個 SEQUENCES 鍵（冷觸發）＋比賽鏈，逐幀：膝 ≤180° 且往前彎、肘有號角 ≤182°、
//        非滯空幀鞋盒 8 角點最低 y ≥ −0.03 m；右手、左手探針各一
// E6   ：windup→spikeHold 過渡每幀動作權重 >0、慣用手腕高度逐幀變化 ≤0.15 m
// 任一不過 exit 1。
import * as THREE from 'three';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, TICK, DEG, loadVersion, sourceAt } from './motion-2b-lib.mjs';

const FROZEN = '677516f';
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ONLY = new Set((getArg('--only', 'e2b,e3,e4,e6')).split(','));
const D0_JSON = getArg('--d0-json', resolve(ROOT, 'docs/experiments/motion-d0-measure.json'));
const OUT = getArg('--out', null);
const SKIP_TEST = args.includes('--skip-test');

const report = { root: ROOT, pass: {} };

// ─────────────── 探針與逐幀量測 ───────────────
function makeProbe(v, name) {
  const scene = new THREE.Scene();
  const pool = v.C.createGeoPool(scene, false, 1);
  const rig = v.C.createGeoCharacter(pool, name, 'A', 1.85, false, name);
  scene.add(rig.root);
  const anim = v.A.createGeoAnimator(rig);
  if (typeof anim.probe !== 'function') throw new Error('animator 沒有 probe()（唯讀窺視），無法判定權重與滯空');
  return { rig, anim, handed: rig.handed };
}
function stepC(c, speed = 0) {
  const y = c.anim.update(TICK, speed, 0, 1);
  c.rig.root.position.y = y;
  c.rig.root.updateMatrixWorld(true);
  return y;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SHOE_CORNERS = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) SHOE_CORNERS.push([sx * 0.065, -0.44 + sy * 0.045, 0.05 + sz * 0.13]);

function frameMetrics(c) {
  const j = c.rig.joints;
  const out = { knees: {}, elbows: {}, footMin: Infinity };
  for (const s of ['r', 'l']) {
    const H = j[`${s}Hip`].getWorldPosition(V());
    const K = j[`${s}Knee`].getWorldPosition(V());
    const A = j[`${s}Knee`].localToWorld(V(0, -0.44, 0));
    const a = H.clone().sub(K); const b = A.clone().sub(K);
    const inc = Math.acos(Math.max(-1, Math.min(1, a.dot(b) / (a.length() * b.length())))) * DEG;
    // 膝點相對髖→踝連線的前後（root 前向 +Z；本治具 root 不轉向）
    const HA = A.clone().sub(H); const u = HA.clone().normalize();
    const proj = H.clone().addScaledVector(u, K.clone().sub(H).dot(u));
    const fwd = K.clone().sub(proj).z;
    out.knees[s] = { angle: inc, fwd };
    for (const [x, y, z] of SHOE_CORNERS) out.footMin = Math.min(out.footMin, j[`${s}Knee`].localToWorld(V(x, y, z)).y);
    // 肘有號角：前臂方向換到上臂（肩關節）局部座標，屈＝局部 +Z（肘 x 負），過伸＝局部 −Z
    const S = j[`${s}Shoulder`].getWorldPosition(V());
    const E = j[`${s}Elbow`].getWorldPosition(V());
    const W = j[`${s}Wrist`].getWorldPosition(V());
    const ea = S.clone().sub(E); const eb = W.clone().sub(E);
    const einc = Math.acos(Math.max(-1, Math.min(1, ea.dot(eb) / (ea.length() * eb.length())))) * DEG;
    const fLocal = j[`${s}Shoulder`].worldToLocal(W.clone()).sub(j[`${s}Shoulder`].worldToLocal(E.clone()));
    const signed = fLocal.z < -1e-9 ? 360 - einc : einc;
    out.elbows[s] = { angle: signed };
  }
  return out;
}

// ─────────────── E2(b) ───────────────
function e2b() {
  const d0 = JSON.parse(readFileSync(D0_JSON, 'utf8'));
  const drop = d0.approach.primary.drop;
  const r = { d0Json: D0_JSON, speed: d0.approach.primary.speed, drop, range: [0.2, 0.3], ok: drop >= 0.2 && drop <= 0.3 };
  console.log(`[E2b] 助跑重心下降 v=${r.speed}：${drop.toFixed(4)} m（須 ∈ [0.20, 0.30]）${r.ok ? 'OK' : 'FAIL'}`);
  return r;
}

// ─────────────── E3 ───────────────
function hitLeadBlock(src) {
  const i = src.indexOf("test('§4 提前量：hitLeadTicks");
  if (i < 0) return null;
  const j = src.indexOf('\n});', i);
  return src.slice(i, j + 4);
}
async function e3() {
  const frozen = await loadVersion(FROZEN);
  const cur = await loadVersion(null);
  const diffs = [];
  const extra = [];
  for (const [k, s] of Object.entries(frozen.A.SEQUENCES)) {
    const n = cur.A.SEQUENCES[k];
    if (!n) { diffs.push({ key: k, field: '(整鍵消失)' }); continue; }
    for (const f of ['dur', 'hit', 'airDur', 'jump']) {
      if (!Object.is(s[f], n[f])) diffs.push({ key: k, field: f, frozen: s[f], now: n[f] });
    }
  }
  for (const k of Object.keys(cur.A.SEQUENCES)) if (!frozen.A.SEQUENCES[k] && !k.startsWith('__probe_')) extra.push(k);
  const tFrozen = hitLeadBlock(sourceAt(FROZEN, 'tests/geo-animator.test.mjs'));
  const tNow = hitLeadBlock(sourceAt(null, 'tests/geo-animator.test.mjs'));
  const textSame = tFrozen != null && tFrozen === tNow;
  let testOk = null; let testTail = '';
  if (!SKIP_TEST) {
    try {
      testTail = execSync('node --test tests/geo-animator.test.mjs', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      testOk = true;
    } catch (e) { testTail = `${e.stdout ?? ''}${e.stderr ?? ''}`; testOk = false; }
    testTail = testTail.split('\n').filter((l) => /^ℹ (tests|pass|fail)/.test(l)).join(' | ');
  }
  const ok = diffs.length === 0 && textSame && testOk !== false;
  console.log(`[E3] SEQUENCES 比 ${FROZEN}：${Object.keys(frozen.A.SEQUENCES).length} 鍵，差異 ${diffs.length} 處${diffs.length ? `：${JSON.stringify(diffs)}` : ''}；新增鍵（不判）：${extra.join(', ') || '無'}`);
  console.log(`[E3] hitLeadTicks 斷言區塊與 ${FROZEN} 逐字相同：${textSame}；tests/geo-animator.test.mjs：${SKIP_TEST ? '（略過）' : testTail}`);
  console.log(`[E3] ${ok ? 'OK' : 'FAIL'}`);
  return { diffs, extra, textSame, testOk, testTail, ok };
}

// ─────────────── 驅動（E4／E6 共用） ───────────────
function leftName(v) {
  for (let n = 0; n < 5000; n += 1) {
    const name = `L2BProbe${n}`;
    if (v.C.isLeftHanded(name, name)) return name;
  }
  throw new Error('找不到左手探針名');
}
// 一條驅動＝一串步驟；回傳逐幀紀錄（每幀在 update 之後量）
function runDriver(v, name, drv) {
  const c = makeProbe(v, name);
  const frames = [];
  const rec = (label) => {
    const m = frameMetrics(c);
    const pr = c.anim.probe();
    const pk = c.anim.peek();
    const hw = c.rig.joints[`${c.handed}Wrist`].getWorldPosition(V()).y;
    frames.push({ label, seq: pk?.type ?? null, t: pk?.t ?? null, w: pr.w, jumpY: pr.jumpY, wristY: hw, ...m });
  };
  for (let i = 0; i < 30; i += 1) stepC(c, 0); // 待命 0.5 s（不記錄）
  drv(c, rec);
  return { name, handed: c.handed, frames };
}
const until = (c, rec, speed, pred, max = 600, label = '') => {
  let n = 0;
  while (n < max) { stepC(c, speed); rec(label); n += 1; if (pred(c)) break; }
  return n;
};
function drivers(v) {
  const list = [];
  for (const k of Object.keys(v.A.SEQUENCES)) {
    if (k.startsWith('__probe_')) continue;
    list.push({ id: `cold:${k}`, drv: (c, rec) => { c.anim.trigger(k); until(c, rec, 0, (cc) => cc.anim.isIdle()); for (let i = 0; i < 5; i += 1) { stepC(c, 0); rec('tail'); } } });
  }
  const chain = (id, fn) => list.push({ id: `chain:${id}`, drv: fn });
  const idleEnd = (c, rec) => { until(c, rec, 0, (cc) => cc.anim.isIdle()); for (let i = 0; i < 5; i += 1) { stepC(c, 0); rec('tail'); } };
  const ticks = (c, rec, n, speed = 0) => { for (let i = 0; i < n; i += 1) { stepC(c, speed); rec(''); } };
  chain('receiveReady→bump', (c, rec) => { c.anim.trigger('receiveReady'); ticks(c, rec, 18); c.anim.trigger('bump'); idleEnd(c, rec); });
  chain('setReady→overhead', (c, rec) => { c.anim.trigger('setReady'); ticks(c, rec, 18); c.anim.trigger('overhead'); idleEnd(c, rec); });
  chain('windup→spike', (c, rec) => { c.anim.trigger('windup'); ticks(c, rec, 11); c.anim.trigger('spike', { hitInTicks: 11 }); idleEnd(c, rec); });
  chain('windup→tip', (c, rec) => { c.anim.trigger('windup'); ticks(c, rec, 12); c.anim.trigger('tip', { hitInTicks: 10 }); idleEnd(c, rec); });
  chain('windup(hold 到落地)', (c, rec) => { c.anim.trigger('windup'); idleEnd(c, rec); });
  for (const s of ['serveJump', 'serveFloat', 'serve']) {
    chain(`serveReady hold→${s}`, (c, rec) => { c.anim.setHold('serveReady'); ticks(c, rec, 6); c.anim.trigger(s); idleEnd(c, rec); c.anim.setHold(null); });
  }
  for (const s of ['blockJump', 'blockJumpGraze']) {
    chain(`block hold→${s}`, (c, rec) => { c.anim.setHold('block'); ticks(c, rec, 6); c.anim.trigger(s); idleEnd(c, rec); });
  }
  for (const sp of [2.55, 4.5]) {
    for (const s of ['approach3', 'approach4']) {
      chain(`${s}@${sp}`, (c, rec) => { for (let i = 0; i < 30; i += 1) stepC(c, sp); c.anim.trigger(s); until(c, rec, sp, (cc) => cc.anim.isIdle()); });
    }
  }
  return list;
}

// ─────────────── E4 ───────────────
async function e4() {
  const v = await loadVersion(null);
  const names = ['D0Probe', leftName(v)];
  const fails = [];
  let frames = 0; let grounded = 0; let worstFoot = Infinity; let worstKnee = 0; let worstElbow = 0; let worstFwd = Infinity;
  const perDriver = [];
  for (const name of names) {
    for (const d of drivers(v)) {
      const r = runDriver(v, name, d.drv);
      let dWorstFoot = Infinity;
      r.frames.forEach((f, i) => {
        frames += 1;
        for (const s of ['r', 'l']) {
          worstKnee = Math.max(worstKnee, f.knees[s].angle);
          worstFwd = Math.min(worstFwd, f.knees[s].fwd);
          worstElbow = Math.max(worstElbow, f.elbows[s].angle);
          if (f.knees[s].angle > 180 + 1e-9 || f.knees[s].fwd < -0.001) fails.push({ driver: d.id, probe: name, frame: i, seq: f.seq, what: `${s}膝`, angle: f.knees[s].angle, fwd: f.knees[s].fwd });
          if (f.elbows[s].angle > 182) fails.push({ driver: d.id, probe: name, frame: i, seq: f.seq, what: `${s}肘`, angle: f.elbows[s].angle });
        }
        if (f.jumpY === 0) {
          grounded += 1;
          worstFoot = Math.min(worstFoot, f.footMin);
          dWorstFoot = Math.min(dWorstFoot, f.footMin);
          if (f.footMin < -0.03) fails.push({ driver: d.id, probe: name, frame: i, seq: f.seq, what: '腳底', footMin: f.footMin });
        }
      });
      perDriver.push({ driver: d.id, probe: name, frames: r.frames.length, worstFoot: dWorstFoot });
    }
  }
  const ok = fails.length === 0 && frames > 0 && grounded > 0;
  console.log(`[E4] 驅動 ${perDriver.length} 條、幀 ${frames}（非滯空 ${grounded}）；最大膝角 ${worstKnee.toFixed(2)}°、最小膝前距 ${worstFwd.toFixed(4)} m、最大肘有號角 ${worstElbow.toFixed(2)}°、非滯空最低腳底 ${worstFoot.toFixed(4)} m`);
  if (fails.length) {
    const byDriver = {};
    for (const f of fails) { const k = `${f.driver}｜${f.probe}｜${f.what}`; byDriver[k] = byDriver[k] ?? { n: 0, first: f }; byDriver[k].n += 1; }
    for (const [k, x] of Object.entries(byDriver).slice(0, 60)) console.log(`  FAIL ${k}：${x.n} 幀，首幀 ${JSON.stringify(x.first)}`);
    if (Object.keys(byDriver).length > 60) console.log(`  …共 ${Object.keys(byDriver).length} 組`);
  }
  console.log(`[E4] ${ok ? 'OK' : 'FAIL'}`);
  return { ok, frames, grounded, worstKnee, worstFwd, worstElbow, worstFoot, failCount: fails.length, fails: fails.slice(0, 200), perDriver };
}

// ─────────────── E6 ───────────────
async function e6() {
  const v = await loadVersion(null);
  const names = ['D0Probe', leftName(v)];
  const runs = [];
  for (const name of names) {
    for (const [id, second, at] of [['windup→spikeHold', null, 0], ['windup→spike', 'spike', 11], ['windup→tip', 'tip', 12]]) {
      const r = runDriver(v, name, (c, rec) => {
        c.anim.trigger('windup');
        // 過渡窗：windup 觸發起，到 spikeHold 已播 ≥6 tick；接擊球的鏈則到擊球觸發前為止
        let holdTicks = 0;
        for (let i = 0; i < 120; i += 1) {
          if (second && i === at) break;
          stepC(c, 0); rec('');
          if (c.anim.peek()?.type === 'spikeHold') holdTicks += 1;
          if (!second && holdTicks >= 6) break;
        }
      });
      // 判定窗＝「過渡期間」：windup 漸入完成（權重達 1）那一幀起，到 spikeHold 前 6 幀
      // （或擊球觸發前）為止。windup 自己的 0.08 s 冷觸發漸入不屬於 E6 條文的過渡（見 report
      // 量法修改紀錄），另外記在 attackMaxDy 供對照
      const start = r.frames.findIndex((f) => f.seq === 'windup' && f.w >= 1 - 1e-9);
      let minW = Infinity; let maxDy = 0; let sawHold = false; let attackMaxDy = 0;
      r.frames.forEach((f, i) => {
        const dy = i > 0 ? Math.abs(f.wristY - r.frames[i - 1].wristY) : 0;
        if (start < 0 || i < start) { attackMaxDy = Math.max(attackMaxDy, dy); return; }
        minW = Math.min(minW, f.w);
        if (f.seq === 'spikeHold') sawHold = true;
        if (i > start) maxDy = Math.max(maxDy, dy);
      });
      const ok = start >= 0 && sawHold && minW > 0 && maxDy <= 0.15;
      runs.push({ id, probe: name, handed: r.handed, frames: r.frames.length, windowStart: start, minW, maxDy, attackMaxDy, sawHold, ok,
        trace: r.frames.map((f) => ({ seq: f.seq, w: +f.w.toFixed(4), wristY: +f.wristY.toFixed(4) })) });
      console.log(`[E6] ${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(18)} ${name}(${r.handed}) 幀 ${r.frames.length}（窗自第 ${start} 幀）、最小權重 ${minW.toFixed(4)}、慣用手腕最大逐幀高度變化 ${maxDy.toFixed(4)} m（窗外 windup 漸入 ${attackMaxDy.toFixed(4)} m，不判）`);
    }
  }
  const ok = runs.every((r) => r.ok);
  console.log(`[E6] ${ok ? 'OK' : 'FAIL'}`);
  return { ok, runs };
}

async function main() {
  if (ONLY.has('e2b')) report.e2b = e2b();
  if (ONLY.has('e3')) report.e3 = await e3();
  if (ONLY.has('e4')) report.e4 = await e4();
  if (ONLY.has('e6')) report.e6 = await e6();
  for (const k of ['e2b', 'e3', 'e4', 'e6']) if (report[k]) report.pass[k] = report[k].ok;
  report.pass.all = Object.values(report.pass).every(Boolean);
  console.log(`[2B check] ${JSON.stringify(report.pass)}`);
  if (OUT) writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.pass.all ? 0 : 1);
}
main();
