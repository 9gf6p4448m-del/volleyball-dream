// S14 逐點 δ（照抄 tools/real-skin-armpit-web.mjs 的算法；只供判讀與截圖標記，不是量尺）
import { V2 } from './evalx.mjs';
const segDist = (p, a, b) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  let t = ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
};
const tr = (m) => [m.elements[12], m.elements[13], m.elements[14]];
export function deltas(setup, skeleton, P1, faces) {
  const { R } = setup; const F = setup.frozen.fz[faces]; const BONES = setup.mods.rp.BONES; const THREE = V2.MODS.THREE;
  const out = {};
  for (const [s, ids, parts] of [['r', F.arm.r, F.arm.rPart], ['l', F.arm.l, F.arm.lPart]]) {
    const bs = BONES.indexOf(`${s}Shoulder`); const be = BONES.indexOf(`${s}Elbow`);
    const S0 = tr(new THREE.Matrix4().copy(skeleton.boneInverses[bs]).invert()); const E0 = tr(new THREE.Matrix4().copy(skeleton.boneInverses[be]).invert());
    const S1 = tr(skeleton.bones[bs].matrixWorld); const E1 = tr(skeleton.bones[be].matrixWorld);
    const sc = Math.hypot(E1[0] - S1[0], E1[1] - S1[1], E1[2] - S1[2]) / Math.hypot(E0[0] - S0[0], E0[1] - S0[1], E0[2] - S0[2]);
    const rows = [];
    ids.forEach((i, k) => {
      if (parts[k] !== 0) return;
      const p0 = [R.P[i * 3], R.P[i * 3 + 1], R.P[i * 3 + 2]];
      const r0 = segDist(p0, S0, E0);
      let d = -Infinity; let vv = i;
      for (const v of R.armReps.get(i)) { const x = segDist([P1[v * 3], P1[v * 3 + 1], P1[v * 3 + 2]], S1, E1) / sc - r0; if (x > d) { d = x; vv = v; } }
      // 綁定幾何屬性：t、朝向（徑向單位向量 · 指向軀幹中線的水平方向）
      const ab = [E0[0] - S0[0], E0[1] - S0[1], E0[2] - S0[2]]; const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      const t = ((p0[0] - S0[0]) * ab[0] + (p0[1] - S0[1]) * ab[1] + (p0[2] - S0[2]) * ab[2]) / L2;
      const foot = [S0[0] + ab[0] * t, S0[1] + ab[1] * t, S0[2] + ab[2] * t];
      const rad = [p0[0] - foot[0], p0[1] - foot[1], p0[2] - foot[2]]; const rl = Math.hypot(...rad) || 1;
      const inward = s === 'r' ? 1 : -1; // 右臂在 −X，朝軀幹＝+X
      const cosIn = (rad[0] * inward) / rl;
      rows.push({ i, v: vv, d, t, cosIn, pos: [P1[vv * 3], P1[vv * 3 + 1], P1[vv * 3 + 2]] });
    });
    out[s] = rows;
  }
  return out;
}
