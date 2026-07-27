// Phase 4.5B §2-1 — 劇情 beat 小舞台（ritualStage 範式：獨立 renderer/canvas，
// 不掛主賽場 scene——劇情事件播在 careerScreen DOM 層，主場景根本不在場）。
// 消費 cameraRig.beatShot 四鏡位模板；驅動＝自己的 rAF（獨立演出時鐘，§2-2），
// 與 sim 零往來。WebGL 失敗＝建構丟例外，呼叫端 try/catch 退化純對話卡（ritualStage 慣例）。
//
// 舞台空間（與 beatShot 約定一致）：網帶在 z=0；對方站 z=-1.4 面向 +z（鏡頭）、
// 玩家站 z=+1.4 背對鏡頭；單人模板主體站原點。
import * as THREE from 'three';
import { createGeoCharacter, createGeoPool, BASE_H } from './geoCharacter.js';
import { applyPortraitPose, pickPortraitPose, DEFAULT_POSE } from './recruitPortrait.js';
import { beatShot } from './cameraRig.js';

const MAX_DT = 0.1;
const NET_TOP = 2.43;

// 模板預設演員（消費端可用 opts.subjects 覆蓋；rival 場景的身高由呼叫端帶入）
function defaultSubjects(template) {
  if (template === 'confront') {
    return [
      { id: 'B1', teamId: 'B', heightM: 1.88, role: 'outside', x: 0, z: -1.4, facing: 0 },
      { id: 'A2', teamId: 'A', heightM: 1.75, role: 'outside', x: 0.35, z: 1.4, facing: Math.PI },
    ];
  }
  if (template === 'exit') {
    return [
      { id: 'B1', teamId: 'B', heightM: 1.88, role: 'outside', x: -0.4, z: -1.0, facing: Math.PI, walk: true },
      { id: 'B2', teamId: 'B', heightM: 1.82, role: 'middle', x: -1.7, z: -2.2, facing: 0 },
      { id: 'B3', teamId: 'B', heightM: 1.78, role: 'setter', x: -2.4, z: -1.8, facing: 0 },
    ];
  }
  if (template === 'rimlight-solo') {
    return [{ id: 'B4', teamId: 'B', heightM: 1.84, role: 'opposite', x: 0, z: 0, facing: 0 }];
  }
  // stands：遠景球場上的兩隊剪影（止步旁觀——你在看台上）
  return [
    { id: 'B1', teamId: 'B', heightM: 1.88, role: 'outside', x: -0.8, z: -1.6, facing: 0 },
    { id: 'B2', teamId: 'B', heightM: 1.8, role: 'middle', x: 0.6, z: -1.9, facing: 0 },
    { id: 'A1', teamId: 'A', heightM: 1.78, role: 'outside', x: -0.2, z: 1.7, facing: Math.PI },
    { id: 'A3', teamId: 'A', heightM: 1.75, role: 'setter', x: 1.1, z: 1.5, facing: Math.PI },
  ];
}

// 燈光預設（beatShot.lighting）：match 賽場感／dusk 賽後餘暉剪影／rim 邊光單人／arena 遠景場館
function buildLights(scene, preset) {
  if (preset === 'rim') {
    scene.add(new THREE.HemisphereLight(0x2c3c60, 0x090b12, 0.18));
    const rim = new THREE.DirectionalLight(0x9ec4ff, 2.4);
    rim.position.set(-1.6, 2.6, -3.2);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffe2b8, 0.16);
    fill.position.set(1.8, 1.4, 2.6);
    scene.add(fill);
    return;
  }
  if (preset === 'dusk') {
    scene.add(new THREE.HemisphereLight(0x36466e, 0x0a0c14, 0.3));
    const warm = new THREE.DirectionalLight(0xffb37a, 0.55);
    warm.position.set(3.2, 1.2, -1.0);
    scene.add(warm);
    return;
  }
  if (preset === 'arena') {
    scene.add(new THREE.HemisphereLight(0x51648f, 0x10141f, 0.6));
    const top = new THREE.DirectionalLight(0xfff1d0, 0.7);
    top.position.set(0, 8, 2);
    scene.add(top);
    return;
  }
  // match：夜賽聚光基調（主場景同語彙的簡化版）
  scene.add(new THREE.HemisphereLight(0x3a4c78, 0x0a0c14, 0.42));
  const spot = new THREE.SpotLight(0xfff1d0, 260, 16, 0.7, 0.55, 1.1);
  spot.position.set(0.6, 5.2, 2.0);
  spot.target.position.set(0, 1.0, -0.5);
  scene.add(spot);
  scene.add(spot.target);
}

export function createBeatStage({ template, opts = {}, width = 460, height = 240 } = {}) {
  const shot = beatShot(template, opts);
  if (!shot) throw new Error(`unknown beat template: ${template}`);

  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'width:min(460px, 92vw)', 'margin:0 auto', 'position:relative',
    'border-radius:14px', 'overflow:hidden', 'background:#060810',
  ].join(';');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.cssText = 'width:100%;height:auto;display:block';
  wrap.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x060810, 9, 26);
  const camera = new THREE.PerspectiveCamera(shot.fov ?? 40, width / height, 0.1, 40);
  camera.position.set(shot.cam.x, shot.cam.y, shot.cam.z);
  camera.lookAt(shot.look.x, shot.look.y, shot.look.z);

  buildLights(scene, shot.lighting);

  // 地板＋場地帶（極簡佈景：暗底、場地略亮——語意到位即可，遠景靠霧收掉）
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshLambertMaterial({ color: 0x11182a }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshLambertMaterial({ color: 0x1b2742 }),
  );
  court.rotation.x = -Math.PI / 2;
  court.position.y = 0.005;
  scene.add(court);

  // 網帶（隔網對峙的空間語意；stands 遠景也看得到球場中線）
  const net = new THREE.Mesh(
    new THREE.BoxGeometry(9, NET_TOP - 1.4, 0.02),
    new THREE.MeshLambertMaterial({ color: 0xd8e2f4, transparent: true, opacity: 0.32 }),
  );
  net.position.set(0, (NET_TOP + 1.4) / 2, 0);
  scene.add(net);
  const netTape = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.07, 0.03),
    new THREE.MeshLambertMaterial({ color: 0xf4f7ff }),
  );
  netTape.position.set(0, NET_TOP, 0);
  scene.add(netTape);

  const subjects = (opts.subjects?.length ? opts.subjects : defaultSubjects(template))
    .map((s) => ({ ...s }));
  const pool = createGeoPool(scene, false, subjects.length);
  const rigs = subjects.map((s) => {
    const rig = createGeoCharacter(pool, s.id ?? 'A2', s.teamId ?? 'A', s.heightM ?? BASE_H, s.role === 'libero');
    applyPortraitPose(rig.joints, pickPortraitPose(s.role ?? 'outside') ?? DEFAULT_POSE);
    rig.root.position.set(s.x ?? 0, 0, s.z ?? 0);
    rig.root.rotation.y = s.facing ?? 0;
    return rig;
  });
  pool.finishColors();

  let raf = null;
  let last = null;
  let elapsed = 0;
  function frame(now) {
    const dt = last === null ? 0 : Math.min((now - last) / 1000, MAX_DT);
    last = now;
    elapsed += dt;
    for (let i = 0; i < rigs.length; i += 1) {
      const s = subjects[i];
      const rig = rigs[i];
      // 呼吸感（ritualStage 慣例）：站著不是雕像
      const base = pickPortraitPose(s.role ?? 'outside') ?? DEFAULT_POSE;
      rig.joints.spine.rotation.x = base.spine + Math.sin(elapsed * 1.6 + i) * 0.012;
      // exit 模板：主體轉身走離（鏡頭定住不追——beatShot 約定）
      if (s.walk) {
        rig.root.position.z = Math.max((s.z ?? -1) - elapsed * 0.42, -5.2);
      }
      rig.root.updateMatrixWorld(true);
      for (const part of rig.parts) pool.writeMatrix(part, part.node.matrixWorld);
    }
    pool.markDirty();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    el: wrap,
    template,
    dispose() {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      floor.geometry.dispose();
      floor.material.dispose();
      court.geometry.dispose();
      court.material.dispose();
      net.geometry.dispose();
      net.material.dispose();
      netTape.geometry.dispose();
      netTape.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      wrap.replaceChildren();
    },
  };
}
