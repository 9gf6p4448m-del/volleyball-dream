// 大作感二卷 批1（2026-08-30）：奪冠彩帶——單一 Points、頂部連續灑落＋擺盪飄移。
// 範式照 matchView.createDust（槽循環、死粒子藏地下、決定論偽亂數＝視覺層不碰 sim rng）；
// 差異：vertexColors 多色、負重力慢落、sin 擺盪（紙片感）、活動窗內落地即回收重灑。
import * as THREE from 'three';

const N = 480; // 【試玩必調】同時在空中的彩帶量
const PALETTE = [0xffd166, 0xfff3d6, 0x6ee7ff, 0xff8a8a, 0x7ee787]; // 金為主、綴隊色系

export function createConfetti(scene) {
  const pos = new Float32Array(N * 3).fill(-100);
  const vel = new Float32Array(N * 3);
  const phase = new Float32Array(N); // 擺盪相位（逐粒錯開才不會整片同步搖）
  const col = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.16, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);

  let h = 2166136261; // 決定論偽亂數（同 createDust）
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    return ((h >>> 0) % 1000) / 1000;
  };
  const c = new THREE.Color();
  function spawn(i) {
    pos[i * 3] = (rnd() - 0.5) * 18;
    pos[i * 3 + 1] = 7.5 + rnd() * 4.5; // 從穹頂灑下
    pos[i * 3 + 2] = (rnd() - 0.5) * 14;
    vel[i * 3] = (rnd() - 0.5) * 0.5;
    vel[i * 3 + 1] = -(1.1 + rnd() * 0.9); // 【試玩必調】慢落（紙片，不是石頭）
    vel[i * 3 + 2] = (rnd() - 0.5) * 0.5;
    phase[i] = rnd() * Math.PI * 2;
    c.setHex(PALETTE[Math.floor(rnd() * PALETTE.length) % PALETTE.length]);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }

  let t = 0;
  let spawnUntil = -1; // 活動窗：窗內落地即回收重灑；窗外落完就沒了（自然收尾）
  return {
    start(durationSec) {
      t = 0;
      spawnUntil = durationSec;
      points.visible = true;
      for (let i = 0; i < N; i += 1) {
        spawn(i);
        pos[i * 3 + 1] = 0.5 + rnd() * 11; // 首灑鋪滿全高度，不必等第一批落完
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    stop() { spawnUntil = -1; }, // 停止補灑；空中的自然落完（endCelebration 隨後 hide）
    hide() {
      points.visible = false;
      pos.fill(-100);
      geo.attributes.position.needsUpdate = true;
    },
    update(dt) {
      if (!points.visible || dt <= 0) return;
      t += dt;
      for (let i = 0; i < N; i += 1) {
        if (pos[i * 3 + 1] < 0.02) {
          if (t < spawnUntil) spawn(i);
          else pos[i * 3 + 1] = -100;
          continue;
        }
        pos[i * 3] += (vel[i * 3] + Math.sin(t * 2.6 + phase[i]) * 0.55) * dt; // 擺盪飄移
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += (vel[i * 3 + 2] + Math.cos(t * 2.2 + phase[i]) * 0.4) * dt;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
