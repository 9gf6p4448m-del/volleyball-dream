// Phase 4 W2 — 程序化儀式演出框架（底座）：暗場聚光＋單人幾何球員的獨立小
// three.js 場景（自己的 renderer/canvas，不掛主賽場 scene——同 recruitPortrait 範式）。
// 一次建成、多方共用：W2 首發消費者＝「你長高了」儀式（ui/heightRitual.js）；
// W3+ 預定接入＝畢業儀式升級／來投開箱／Q5 生涯結算（範圍鎖定：本週只建框架）。
//
// 框架介面（消費者只碰這幾個把手，不觸 three 細節）：
//   createRitualStage({ playerId, teamId, role, heightM, width, height })
//     → { el, setHeight(m), setSpot(t), setPose(pose), dispose }
//   setHeight＝即時改身高（root 縮放——幾何關節模型「鏡頭前長給你看」的核心把手）
//   setSpot＝聚光強度 0..1（暗場→亮起的演出節奏由消費者驅動）
//   tween(durMs, onTick, ease)＝rAF 補間 Promise（durMs<=0＝直接定格，供 reduced-motion）
// 效能：單人＋單聚光＋一盞半球光，手機 60 FPS 約束下綽綽有餘。
import * as THREE from 'three';
import { createGeoCharacter, createGeoPool, BASE_H } from './geoCharacter.js';
import { applyPortraitPose, pickPortraitPose, DEFAULT_POSE } from './recruitPortrait.js';

const MAX_DT = 0.1;
const SPOT_BASE = 300; // 聚光滿檔強度（同 scene.js SPOT_BASE 量級）

// rAF 補間：t 0→1 逐幀回呼，resolve 於完成。durMs<=0＝立即 onTick(1) 定格
// （reduced-motion 或無動畫需求）。ease 預設 easeInOutCubic。
export function tween(durMs, onTick, ease = easeInOutCubic) {
  return new Promise((resolve) => {
    if (!(durMs > 0)) {
      onTick(1);
      resolve();
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / durMs, 1);
      onTick(ease(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

export function createRitualStage({
  playerId = 'A2', teamId = 'A', role = 'outside', heightM = BASE_H,
  width = 300, height = 380,
} = {}) {
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    `width:${width}px`, `height:${height}px`, 'margin:0 auto', 'position:relative',
    'border-radius:14px', 'overflow:hidden',
  ].join(';');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  wrap.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 20);
  camera.position.set(0, 1.32, 3.9); // 220cm 極端值也整人入鏡（頂留 margin）
  camera.lookAt(0, 1.12, 0);

  // 暗場基調：極低半球光保剪影，聚光燈負責「亮起」的儀式感
  scene.add(new THREE.HemisphereLight(0x38507c, 0x0a0c14, 0.22));
  const spot = new THREE.SpotLight(0xfff1d0, 0, 12, 0.55, 0.6, 1.2);
  spot.position.set(0.4, 4.4, 1.0);
  spot.target.position.set(0, 1.0, 0);
  scene.add(spot);
  scene.add(spot.target);
  const rim = new THREE.DirectionalLight(0x6ea8ff, 0.35);
  rim.position.set(-2.2, 2.0, -2.4);
  scene.add(rim);

  // 光池（主角獨站的圓形光斑）：透明度隨 setSpot 同步
  const pool2d = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 40),
    new THREE.MeshBasicMaterial({ color: 0xffe9b8, transparent: true, opacity: 0 }),
  );
  pool2d.rotation.x = -Math.PI / 2;
  pool2d.position.y = 0.002;
  scene.add(pool2d);

  const pool = createGeoPool(scene, false, 1);
  const rig = createGeoCharacter(pool, playerId, teamId, heightM, role === 'libero');
  applyPortraitPose(rig.joints, pickPortraitPose(role) ?? DEFAULT_POSE);
  pool.finishColors();

  let raf = null;
  let last = null;
  let breathe = 0;
  function frame(now) {
    const dt = last === null ? 0 : Math.min((now - last) / 1000, MAX_DT);
    last = now;
    // 極輕呼吸感（脊柱微幅擺動）——站著不是雕像；振幅小到不干擾身高讀數
    breathe += dt;
    rig.joints.spine.rotation.x = pickPortraitPose(role).spine + Math.sin(breathe * 1.6) * 0.012;
    rig.root.updateMatrixWorld(true);
    for (const part of rig.parts) pool.writeMatrix(part, part.node.matrixWorld);
    pool.markDirty();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    el: wrap,
    // 即時長高的核心把手（幾何關節模型＝root 整體縮放，動畫由消費者的 tween 驅動）
    setHeight(m) {
      rig.root.scale.setScalar(m / BASE_H);
    },
    // 聚光強度 0..1（暗場→光池亮起）
    setSpot(t) {
      spot.intensity = SPOT_BASE * t;
      pool2d.material.opacity = 0.14 * t;
    },
    setPose(pose) {
      applyPortraitPose(rig.joints, pose ?? DEFAULT_POSE);
    },
    dispose() {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      pool2d.geometry.dispose();
      pool2d.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.(); // 同 recruitPortrait：不等 GC，立即釋放 GL context
      wrap.replaceChildren();
    },
  };
}
