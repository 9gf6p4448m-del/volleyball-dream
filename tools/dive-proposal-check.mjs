// 魚躍方案 A 回歸底線檢查（幾何人，node 直跑；唯讀，不寫任何檔除非帶 --json <path>）
// 移植自分支 feat/dive-proposals（commit ecda0a5）的 tools/dive-proposal-check.mjs，
// 只保留方案 A 的判定（DA2，見 docs/kickoffs/real-player-stage2-match.md 修訂紀錄）——
// B、C 兩支提案與 legacy 對照已隨方案挑定移除，A 已直接取代 geoAnimator.js 的 SEQUENCES.dive。
// 用法：node tools/dive-proposal-check.mjs [--json docs/experiments/dive-proposals/geo-check.json]
//
// 驅動方式＝真實路徑：createGeoCharacter（真實幾何）＋createGeoAnimator（真實姿勢插值）＋
// diveStyles.diveRootPose（matchView 在魚躍時用的同一支 root 曲線）。root 旋轉序 YXZ、縮放 1
// （同 matchView）。每幀量：
//   F1 膝不反折：r/lKnee.rotation.x ≥ 0（膝是單軸鉸鏈，x 正＝屈膝）
//   F2 鞋盒 8 角點最低 y ≥ −0.03 m，或（該幀身體貼地）軀幹（torso＋hips）最低 y ≥ −0.03 m
//   F3（加嚴，本治具自訂）：所有部件頂點最低 y ≥ −0.03 m（不只鞋與軀幹）
//   G  貼地幀（設計為趴地的區段）軀幹最低點 ≤ 0.08 m——防「整個人浮起來所以不入地」
//   （判定範圍＝魚躍窗：sim 倒地期 p<1 或序列仍在播；之後是遊戲既有待命姿勢，鞋尖本來就約 −0.06 m，不屬魚躍）
//   H  魚躍窗內每幀全身最低點 ≤ 0.03 m——提案路徑有接地補償（只抬不壓），這條是它的對向條件
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { createGeoCharacter, geometries } from '../src/render/geoCharacter.js';
import { createGeoAnimator } from '../src/render/geoAnimator.js';
import { diveRootPose, geoBodyMinY, diveGroundLift } from '../src/render/diveStyles.js';

const DT = 1 / 60;
const RECOVER = 42; // sim TUNING.DIVE_RECOVER_TICKS
const STUB_POOL = { claim: (key) => ({ key, index: 0 }) };
const G = geometries();
const GROUND = [0.32, 0.5]; // 貼地窗（p 區間），沿用方案 A 原判定

function makeRig(handed) {
  // 'l'：找一個 isLeftHanded 為真的名字（決定論雜湊），不改 geoCharacter
  const rig = createGeoCharacter(STUB_POOL, 'A1', 'A', 1.85, false, handed === 'l' ? findLeftName() : 'R', null, null);
  if (rig.handed !== handed) throw new Error(`慣用手不符：要 ${handed} 得 ${rig.handed}`);
  rig.root.rotation.order = 'YXZ';
  rig.root.scale.setScalar(1);
  return rig;
}
let leftName = null;
function findLeftName() {
  if (leftName) return leftName;
  for (let i = 0; i < 500; i += 1) {
    const r = createGeoCharacter(STUB_POOL, 'A1', 'A', 1.85, false, `L${i}`, null, null);
    if (r.handed === 'l') { leftName = `L${i}`; return leftName; }
  }
  throw new Error('找不到左手名字');
}

const v = new THREE.Vector3();
function partMinY(part) {
  const pos = G[part.key].attributes.position;
  let m = Infinity;
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i).applyMatrix4(part.node.matrixWorld);
    if (v.y < m) m = v.y;
  }
  return m;
}
const wp = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);

function run(handed) {
  const rig = makeRig(handed);
  const anim = createGeoAnimator(rig);
  for (let i = 0; i < 30; i += 1) anim.update(DT, 0, 0, 1); // 待命收斂
  anim.trigger('dive');
  const frames = [];
  for (let k = 0; k <= 45; k += 1) {
    const bodyY = anim.update(DT, 0, 0, 1);
    const p = Math.min(k / RECOVER, 1);
    const r = diveRootPose(p);
    rig.root.position.set(0, bodyY + r.up, r.fwd);
    rig.root.rotation.set(r.tilt, 0, 0);
    rig.root.updateMatrixWorld(true);
    let lift = 0;
    const active = p < 1 || anim.peek()?.type === 'dive'; // 魚躍窗＝sim 倒地期或序列仍在播
    if (active) { // 同 matchView 的接地補償
      lift = diveGroundLift(geoBodyMinY(rig));
      rig.root.position.y += lift;
      rig.root.updateMatrixWorld(true);
    }
    let shoe = Infinity; let torso = Infinity; let all = Infinity; let allPart = '';
    for (const part of rig.parts) {
      const m = partMinY(part);
      if (part.key === 'shoe') shoe = Math.min(shoe, m);
      if (part.key === 'torso' || part.key === 'hips') torso = Math.min(torso, m);
      if (m < all) { all = m; allPart = part.key; }
    }
    const kneeMin = Math.min(rig.joints.rKnee.rotation.x, rig.joints.lKnee.rotation.x);
    const rw = wp(rig.joints.rWrist); const lw = wp(rig.joints.lWrist);
    const grounded = p >= GROUND[0] && p <= GROUND[1];
    frames.push({
      k, p: +p.toFixed(3), active, lift, shoe, torso, all, allPart, kneeMin, grounded,
      handFwd: Math.max(rw.z, lw.z), wristGap: rw.distanceTo(lw), handLow: Math.min(rw.y, lw.y),
      F1: !active || kneeMin >= -1e-9,
      F2: !active || shoe >= -0.03 || (torso <= 0.12 && torso >= -0.03),
      F3: !active || all >= -0.03,
      G: !grounded || torso <= 0.08,
      H: !active || all <= 0.03, // 對向條件：撲救期間每幀總有部位碰地（接地補償只抬不壓，防浮空）
    });
  }
  return frames;
}

// 左右語意實測（不從既有 POSES 數值推論）——同 feat/dive-proposals，供人工核對鏡像方向
function semantics() {
  const out = {};
  const rig = makeRig('r');
  rig.root.updateMatrixWorld(true);
  const base = { rW: wp(rig.joints.rWrist), lW: wp(rig.joints.lWrist), rH: wp(rig.joints.rHip) };
  out.rightSideX = Math.sign(wp(rig.joints.rShoulder).x); // 角色右肩在哪一側
  rig.joints.rShoulder.rotation.z = 0.3; rig.joints.lShoulder.rotation.z = 0.3;
  rig.root.updateMatrixWorld(true);
  out.rShZpos_dx = wp(rig.joints.rWrist).x - base.rW.x; // >0 且右肩在 −X ⇒ 內收
  out.lShZpos_dx = wp(rig.joints.lWrist).x - base.lW.x; // >0 且左肩在 +X ⇒ 外展
  rig.joints.rShoulder.rotation.z = 0; rig.joints.lShoulder.rotation.z = 0;
  rig.joints.pelvis.rotation.y = 0.3;
  rig.root.updateMatrixWorld(true);
  out.pelvisYpos_rHip_dz = wp(rig.joints.rHip).z - base.rH.z; // >0 ⇒ 右髖往前（身體往左轉）
  rig.joints.pelvis.rotation.y = 0;
  rig.joints.rHip.rotation.x = -0.5; rig.root.updateMatrixWorld(true);
  out.hipXneg_kneeDz = wp(rig.joints.rKnee).z - wp(rig.joints.rHip).z; // >0 ⇒ 大腿前抬
  rig.joints.rHip.rotation.x = 0; rig.joints.rKnee.rotation.x = 0.5; rig.root.updateMatrixWorld(true);
  out.kneeXpos_shoeDz = wp(rig.parts.find((q) => q.key === 'shoe').node).z - wp(rig.joints.rKnee).z; // <0 ⇒ 小腿往後＝正常屈膝
  return out;
}

const report = { semantics: semantics(), handed: {} };
let ok = true;
const f3 = (x) => x.toFixed(3);
console.log('左右語意實測：', JSON.stringify(report.semantics, (k, x) => (typeof x === 'number' ? +x.toFixed(4) : x)));
for (const handed of ['r', 'l']) {
  const fr = run(handed);
  const act = fr.filter((x) => x.active); // 摘要只算魚躍窗（之後是遊戲既有待命姿勢）
  const worst = (key) => act.reduce((m, x) => Math.min(m, x[key]), Infinity);
  const fails = ['F1', 'F2', 'F3', 'G', 'H'].map((c) => [c, fr.filter((x) => !x[c]).map((x) => x.k)]);
  const s = {
    frames: fr.length,
    minShoe: worst('shoe'), minTorso: worst('torso'), minAll: worst('all'),
    minAllPart: act.reduce((m, x) => (x.all < m.all ? x : m), { all: Infinity }).allPart,
    minKnee: worst('kneeMin'),
    maxHandFwd: Math.max(...act.map((x) => x.handFwd)),
    activeFrames: act.length,
    groundedTorsoMax: Math.max(...fr.filter((x) => x.grounded).map((x) => x.torso)),
    fails: Object.fromEntries(fails),
  };
  report.handed[handed] = { summary: s, frames: fr };
  const pass = fails.every(([, l]) => l.length === 0);
  if (!pass) ok = false;
  console.log(`${pass ? 'PASS' : 'FAIL'} 魚躍方案 A 慣用手${handed}（魚躍窗 ${s.activeFrames} 幀）：鞋最低 ${f3(s.minShoe)}／軀幹最低 ${f3(s.minTorso)}／全身最低 ${f3(s.minAll)}(${s.minAllPart})／膝最小 ${f3(s.minKnee)} rad／貼地段軀幹最高 ${f3(s.groundedTorsoMax)}／手最遠 ${f3(s.maxHandFwd)} m`
    + (pass ? '' : `｜未過幀 ${fails.filter(([, l]) => l.length).map(([c, l]) => `${c}:[${l.join(',')}]`).join(' ')}`));
}
const ji = process.argv.indexOf('--json');
if (ji > 0) writeFileSync(process.argv[ji + 1], JSON.stringify(report, (k, x) => (typeof x === 'number' ? +x.toFixed(4) : x), 1));
console.log(ok ? '方案 A 左右手全幀 PASS' : '有未過項');
process.exit(ok ? 0 : 1);
