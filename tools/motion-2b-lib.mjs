// 寫實球員卷 2B 動作文獻校準：驗收治具共用函式（tools/motion-2b-e1-mirror.mjs、motion-2b-check.mjs 用）
//
// 載入某個 commit（或工作樹）的 geoAnimator／geoCharacter：以 `git show` 讀原文，做**最小插樁**
// ——animator 尾端附加 `export { POSES, SEQUENCES };`、geoCharacter 的 `three`／teamKit import
// 換成絕對 URL——再以 data: URL 動態 import。**不寫任何檔案**；插樁不改任何既有行。
// 兩個版本走同一條插樁路徑（對稱），比較時不會有一邊是真實模組、一邊是重建模型。
import * as THREE from 'three';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TICK = 1 / 60;
export const DEG = 180 / Math.PI;
const THREE_URL = import.meta.resolve('three');
const TEAMKIT_URL = pathToFileURL(resolve(ROOT, 'src/career/teamKit.js')).href;

// 歷史版本從哪個 git 讀：預設本 repo；在 `git archive` 副本（無 .git）上跑突變時以環境變數指回工作樹
const GIT_DIR = process.env.MOTION_2B_GIT_DIR || ROOT;
// rev＝null 讀 ROOT 下的檔案（工作樹或 archive 副本）；否則 git show <rev>:<path>
export function sourceAt(rev, path) {
  if (!rev) return readFileSync(resolve(ROOT, path), 'utf8');
  return execSync(`git show ${rev}:${path}`, { cwd: GIT_DIR, encoding: 'utf8', maxBuffer: 1 << 26 });
}

const cache = new Map();
export async function loadVersion(rev) {
  const key = rev ?? '(worktree)';
  if (cache.has(key)) return cache.get(key);
  const animSrc = `${sourceAt(rev, 'src/render/geoAnimator.js')}\nexport { POSES, SEQUENCES };\n`;
  const charSrc = sourceAt(rev, 'src/render/geoCharacter.js')
    .replace(/from 'three'/g, `from '${THREE_URL}'`)
    .replace(/from '\.\.\/career\/teamKit\.js'/g, `from '${TEAMKIT_URL}'`);
  if (/^import .* from '\.{1,2}\//m.test(charSrc)) throw new Error(`${key} geoCharacter 還有相對 import 未改寫`);
  if (/^import /m.test(animSrc)) throw new Error(`${key} geoAnimator 出現 import，插樁假設失效`);
  const A = await import(`data:text/javascript,${encodeURIComponent(animSrc)}`);
  const C = await import(`data:text/javascript,${encodeURIComponent(charSrc)}`);
  const v = { rev: key, A, C };
  cache.set(key, v);
  return v;
}

// 建一名探針球員（同 D0：D0Probe、隊 A、1.85 m）；舊版 createGeoCharacter 只吃 5 參數，多給的忽略
export function makeRig(v, name = 'D0Probe', height = 1.85) {
  const scene = new THREE.Scene();
  const pool = v.C.createGeoPool(scene, false, 1);
  const rig = v.C.createGeoCharacter(pool, name, 'A', height, false, name);
  scene.add(rig.root);
  const anim = v.A.createGeoAnimator(rig);
  rig.root.updateMatrixWorld(true);
  return { rig, anim };
}

export function step(c, dt = TICK, speed = 0) {
  const bodyY = c.anim.update(dt, speed, 0, 1);
  c.rig.root.position.y = bodyY;
  c.rig.root.updateMatrixWorld(true);
  return bodyY;
}

// 以 hold 路徑（w=1）擺出單一姿勢 P：往該版 SEQUENCES 加一支兩關鍵幀都是 P 的探針序列
export function holdPose(v, poseName, name = 'D0Probe') {
  const key = `__probe_${poseName}`;
  if (!v.A.SEQUENCES[key]) {
    v.A.SEQUENCES[key] = { dur: 1, jump: 0, land: false, keys: [{ at: 0, p: poseName }, { at: 1, p: poseName }] };
  }
  const c = makeRig(v, name);
  c.anim.setHold(key);
  for (let i = 0; i < 30; i += 1) step(c);
  return c;
}

export function worldPoints(rig) {
  rig.root.updateMatrixWorld(true);
  const P = {};
  for (const n of ['pelvis', 'spine', 'spineUpper', 'neck', 'rShoulder', 'lShoulder', 'rElbow', 'lElbow',
    'rWrist', 'lWrist', 'rHip', 'lHip', 'rKnee', 'lKnee']) {
    P[n] = rig.joints[n].getWorldPosition(new THREE.Vector3());
  }
  return P;
}

// E1 的六個向量（線＝水平投影）
export function e1Vectors(P) {
  const d = (a, b) => b.clone().sub(a);
  const flat = (x) => new THREE.Vector3(x.x, 0, x.z);
  return {
    rUpperArm: d(P.rShoulder, P.rElbow),
    lUpperArm: d(P.lShoulder, P.lElbow),
    rForearm: d(P.rElbow, P.rWrist),
    lForearm: d(P.lElbow, P.lWrist),
    shoulderLine: flat(d(P.lShoulder, P.rShoulder)),
    hipLine: flat(d(P.lHip, P.rHip)),
  };
}
export const mirrorX = (x) => new THREE.Vector3(-x.x, x.y, x.z);
export function angleDeg(a, b) {
  const den = a.length() * b.length();
  if (den < 1e-12) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, a.dot(b) / den))) * DEG;
}

export function sha1(buf) {
  return createHash('sha1').update(buf).digest('hex');
}
