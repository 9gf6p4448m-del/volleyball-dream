// 診斷（唯讀）：S13 取帶敏感度——t 分箱（寬 0.05）的軀幹權重平均與頂點數；另列「目前主骨屬手臂骨」子集
import * as V2 from './real-skin-penetration-v2.mjs';
import { FROZEN_LANDMARKS, TORSO } from './real-skin-arm-follow.mjs';
const faces = process.argv[2];
const setup = await V2.loadSetup(faces); const { R, G } = setup; const F = setup.frozen.fz[faces]; const B = setup.mods.rp.BONES;
const TI = new Set(TORSO.map((b) => B.indexOf(b))); const AI = new Set(['rShoulder','rElbow','rWrist','lShoulder','lElbow','lWrist'].map((b) => B.indexOf(b)));
const SI = G.attributes.skinIndex.array, SW = G.attributes.skinWeight.array;
const tw = (v) => { let s = 0; for (let q = 0; q < 4; q++) if (TI.has(SI[v*4+q])) s += SW[v*4+q]; return s; };
const mainArm = (v) => { let b = -1, w = -1; for (let q = 0; q < 4; q++) if (SW[v*4+q] > w) { w = SW[v*4+q]; b = SI[v*4+q]; } return AI.has(b); };
for (const [s, ids, parts] of [['r', F.arm.r, F.arm.rPart], ['l', F.arm.l, F.arm.lPart]]) {
  const sh = s === 'r' ? FROZEN_LANDMARKS.rShoulder : [-FROZEN_LANDMARKS.rShoulder[0], ...FROZEN_LANDMARKS.rShoulder.slice(1)];
  const el = s === 'r' ? FROZEN_LANDMARKS.rElbow : [-FROZEN_LANDMARKS.rElbow[0], ...FROZEN_LANDMARKS.rElbow.slice(1)];
  const ab = el.map((x, k) => x - sh[k]); const L2 = ab.reduce((a, x) => a + x * x, 0);
  const bins = {};
  ids.forEach((i, k) => { if (parts[k] !== 0) return; const p = [R.P[i*3], R.P[i*3+1], R.P[i*3+2]];
    let t = ((p[0]-sh[0])*ab[0]+(p[1]-sh[1])*ab[1]+(p[2]-sh[2])*ab[2]) / L2; t = Math.max(0, Math.min(1, t));
    const bk = (Math.floor(t * 20) / 20).toFixed(2); const z = bins[bk] || (bins[bk] = { n: 0, s: 0, na: 0, sa: 0 });
    const w = tw(i); z.n++; z.s += w; if (mainArm(i)) { z.na++; z.sa += w; } });
  console.log(`${faces} ${s}：` + Object.keys(bins).sort().map((k) => `[${k}) n${bins[k].n} ${(bins[k].s / bins[k].n).toFixed(2)}｜主骨手臂 n${bins[k].na} ${bins[k].na ? (bins[k].sa / bins[k].na).toFixed(2) : '-'}`).join('  '));
}
