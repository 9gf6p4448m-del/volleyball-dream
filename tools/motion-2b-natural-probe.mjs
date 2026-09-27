#!/usr/bin/env node
// 寫實球員卷 2B：「看起來不自然」的動態成因量測（使用者 E7 判定「不像、看起來不自然」後的診斷）
//
// 用法：node tools/motion-2b-natural-probe.mjs [--rev <commit>]... [--out <json>]
//   不給 --rev＝只量 ROOT 下的工作樹；可給多個 rev（例 --rev f4ccbec --rev f9d89d6）並排比較。
// 情境（同 D0 觸發鏈，60 Hz、root 依情境等速前移）：
//   spike＝助跑 approach3（2.55 m/s）→ windup → 11 tick 後 spike → 落地 → 待命
//   bump ＝receiveReady 撐 0.3 s → bump → 待命；servejump＝serveReady 持球 → serveJump → 落地
// 量什麼（每一項都對應一個「不自然」假設，數字越大越嚴重）：
//   M1 速度斷點：同一關節角速度相鄰兩幀的跳變 |Δω| 最大值（°/幀²）與「跳變 > 該段峰值 50% 的幀數」
//      —關鍵影格間線性插值＝速度在影格處瞬間換檔
//   M2 同時起訖：每段關鍵影格內，肩／肘／腕／脊椎／骨盆／胸椎開始動（角速度 > 峰值 10%）的幀，
//      各關節起動幀的最大差（幀）——0＝所有關節同一幀起動、同一幀停
//   M3 完全靜止：動作層權重 = 1 且所有被量關節角速度 < 0.05°/幀 的連續最長幀數
//   M4 軀幹時間差：骨盆 y 與胸椎 y 角速度峰值的幀差（真人：骨盆先轉、胸椎後轉）
//   M5 腳底滑動：鞋底最低點 ≤ 地面 +1 cm 的「踩地幀」中，該腳世界水平速度（m/s）的最大值
//   M6 手臂瞬移：慣用手腕世界位移單幀最大值（m），與發生在哪個序列
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { loadVersion, makeRig, TICK, DEG } from './motion-2b-lib.mjs';

const args = process.argv.slice(2);
const revs = [];
for (let i = 0; i < args.length; i += 1) if (args[i] === '--rev') revs.push(args[i + 1]);
if (!revs.length) revs.push(null);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : null;

const JOINTS = [['rShoulder', 'x'], ['rElbow', 'x'], ['rWrist', 'x'], ['spine', 'x'], ['spineUpper', 'x'], ['pelvis', 'y'], ['spineUpper', 'y'], ['neck', 'x'], ['rKnee', 'x'], ['rHip', 'x']];
const V = () => new THREE.Vector3();
const SHOE = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) SHOE.push([sx * 0.065, -0.44 + sy * 0.045, 0.05 + sz * 0.13]);

function scenario(v, name) {
  const c = makeRig(v);
  const frames = [];
  let z = 0; let speed = 0;
  const step = () => {
    const y = c.anim.update(TICK, speed, 0, 1);
    z += speed * TICK;
    c.rig.root.position.set(0, y, z);
    c.rig.root.updateMatrixWorld(true);
    const j = c.rig.joints;
    const pk = c.anim.peek();
    const feet = {};
    for (const s of ['r', 'l']) {
      let low = Infinity; const ctr = V();
      for (const q of SHOE) {
        const p = j[`${s}Foot`] ? j[`${s}Foot`].localToWorld(new THREE.Vector3(q[0], q[1] + 0.44, q[2])) : j[`${s}Knee`].localToWorld(new THREE.Vector3(...q));
        low = Math.min(low, p.y); ctr.add(p);
      }
      ctr.multiplyScalar(1 / SHOE.length);
      feet[s] = { low, x: ctr.x, z: ctr.z };
    }
    frames.push({
      seq: pk?.type ?? null, t: pk?.t ?? null, w: c.anim.probe ? c.anim.probe().w : null,
      ang: JOINTS.map(([n, ax]) => j[n].rotation[ax] * DEG),
      wrist: j.rWrist.getWorldPosition(V()).toArray(),
      feet,
    });
  };
  const ticks = (n) => { for (let i = 0; i < n; i += 1) step(); };
  const untilIdle = (max = 300) => { let n = 0; do { step(); n += 1; } while (!c.anim.isIdle() && n < max); ticks(6); };
  ticks(30);
  if (name === 'spike') {
    speed = 2.55; ticks(30);
    c.anim.trigger('approach3');
    let n = 0; while (c.anim.peek()?.type === 'approach3' && n < 200) { step(); n += 1; }
    speed = 1.0; // 起跳後水平速度（Zahálka 約 1.7 m/s；取保守值）
    c.anim.trigger('windup'); ticks(11);
    c.anim.trigger('spike', { hitInTicks: 11 }); speed = 0.6; untilIdle(); speed = 0; ticks(10);
  } else if (name === 'bump') {
    c.anim.trigger('receiveReady'); ticks(18); c.anim.trigger('bump'); untilIdle();
  } else if (name === 'servejump') {
    c.anim.setHold('serveReady'); ticks(20); c.anim.setHold(null); // 同 matchView：發球觸發後 phase 轉 rally、hold 清掉
    c.anim.trigger('serveJump'); speed = 0.8; untilIdle(); speed = 0; ticks(10);
  }
  return frames;
}

function analyze(frames) {
  const n = frames.length;
  const vel = frames.map((f, i) => (i === 0 ? f.ang.map(() => 0) : f.ang.map((a, k) => a - frames[i - 1].ang[k])));
  // M1
  let maxJerk = 0; let jerkAt = null; let jerkFrames = 0;
  const peak = JOINTS.map((_, k) => Math.max(...vel.map((v) => Math.abs(v[k]))));
  for (let i = 2; i < n; i += 1) {
    for (let k = 0; k < JOINTS.length; k += 1) {
      const d = Math.abs(vel[i][k] - vel[i - 1][k]);
      if (d > maxJerk) { maxJerk = d; jerkAt = { frame: i, joint: JOINTS[k].join('.'), seq: frames[i].seq }; }
      if (peak[k] > 0.5 && d > 0.5 * peak[k]) jerkFrames += 1;
    }
  }
  // M2：以序列 + 關鍵影格段落切段（同一序列內連續幀為一段），每段量各關節起動幀
  const segs = [];
  let s0 = 0;
  for (let i = 1; i <= n; i += 1) {
    if (i === n || frames[i].seq !== frames[s0].seq) { if (frames[s0].seq && i - s0 > 4) segs.push([s0, i]); s0 = i; }
  }
  const onset = segs.map(([a, b]) => {
    const on = JOINTS.map((_, k) => {
      const pk = Math.max(...vel.slice(a, b).map((v) => Math.abs(v[k])));
      if (pk < 0.3) return null;
      const idx = vel.slice(a, b).findIndex((v) => Math.abs(v[k]) > 0.1 * pk);
      return idx;
    }).filter((x) => x != null);
    return { seq: frames[a].seq, frames: b - a, spread: on.length ? Math.max(...on) - Math.min(...on) : null, joints: on.length };
  });
  // M3
  let still = 0; let run = 0; let stillSeq = null;
  for (let i = 1; i < n; i += 1) {
    const quiet = frames[i].w === 1 && vel[i].every((v) => Math.abs(v) < 0.05);
    run = quiet ? run + 1 : 0;
    if (run > still) { still = run; stillSeq = frames[i].seq; }
  }
  // M4：骨盆 y（k=5）與胸椎 y（k=6）角速度峰值幀差
  const pk5 = vel.reduce((b, v, i) => (Math.abs(v[5]) > Math.abs(vel[b][5]) ? i : b), 0);
  const pk6 = vel.reduce((b, v, i) => (Math.abs(v[6]) > Math.abs(vel[b][6]) ? i : b), 0);
  // M5
  let slide = 0; let slideAt = null;
  for (let i = 1; i < n; i += 1) {
    for (const s of ['r', 'l']) {
      const f = frames[i].feet[s]; const p = frames[i - 1].feet[s];
      if (f.low <= -0.015 && p.low <= -0.015) {
        const sp = Math.hypot(f.x - p.x, f.z - p.z) / TICK;
        if (sp > slide) { slide = sp; slideAt = { frame: i, foot: s, seq: frames[i].seq }; }
      }
    }
  }
  // M6
  let jump = 0; let jumpAt = null;
  for (let i = 1; i < n; i += 1) {
    const d = Math.hypot(...frames[i].wrist.map((x, k) => x - frames[i - 1].wrist[k]));
    if (d > jump) { jump = d; jumpAt = { frame: i, seq: frames[i].seq, prevSeq: frames[i - 1].seq }; }
  }
  return {
    frames: n,
    M1_maxVelJump_degPerFrame2: maxJerk, M1_at: jerkAt, M1_jumpFrames: jerkFrames,
    M2_onsetSpreadBySegment: onset,
    M3_longestStill_frames: still, M3_seq: stillSeq,
    M4_pelvisChestPeakLag_frames: pk6 - pk5,
    M5_plantedFootMaxSpeed_mps: slide, M5_at: slideAt,
    M6_wristMaxStep_m: jump, M6_at: jumpAt,
  };
}

const result = {};
for (const rev of revs) {
  const v = await loadVersion(rev);
  const key = rev ?? 'worktree';
  result[key] = {};
  for (const sc of ['spike', 'bump', 'servejump']) {
    const a = analyze(scenario(v, sc));
    result[key][sc] = a;
    const on = a.M2_onsetSpreadBySegment.map((o) => `${o.seq}:${o.spread}`).join(' ');
    console.log(`[${key}] ${sc.padEnd(9)} M1 最大速度跳變 ${a.M1_maxVelJump_degPerFrame2.toFixed(1)}°/幀²（${a.M1_at?.joint}@${a.M1_at?.seq}）跳變幀 ${a.M1_jumpFrames}｜M2 起動幀差 ${on}｜M3 最長全靜止 ${a.M3_longestStill_frames} 幀（${a.M3_seq}）｜M4 骨盆→胸椎峰值差 ${a.M4_pelvisChestPeakLag_frames} 幀｜M5 踩地腳最大滑速 ${a.M5_plantedFootMaxSpeed_mps.toFixed(2)} m/s（${a.M5_at?.seq}）｜M6 腕單幀最大位移 ${a.M6_wristMaxStep_m.toFixed(3)} m（${a.M6_at?.prevSeq}→${a.M6_at?.seq}）`);
  }
}
if (OUT) writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
