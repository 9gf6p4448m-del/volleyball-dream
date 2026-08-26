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

// 4.5B §6 專屬 beat 姿勢（欄位語彙同 geoAnimator/recruitPortrait 的 POSES）：
// wipe＝他第一次擦汗（右手背抬到額前——幕二斷句 beat 勝版）；
// fist＝握拳盯著手心的靜止一拍（幕二敗版）；
// knee＝膝蓋著地（撲救收勢、單膝跪地——小白事件一「不落地教」立教時刻）
const BEAT_POSES = {
  wipe: { rSh: [-2.55, -0.55], lSh: [0.05, 0.08], rEl: -2.2, lEl: -0.15, spine: 0.08, neck: 0.12 },
  fist: { rSh: [-0.85, -0.2], lSh: [-0.85, 0.2], rEl: -1.7, lEl: -1.7, spine: 0.4, neck: 0.5 },
  knee: { rSh: [-1.3, -0.3], lSh: [-1.3, 0.3], rEl: -0.2, lEl: -0.2, spine: 0.5, neck: 0.15 },
};

// 模板預設演員（消費端以語意 opts 覆蓋：playerHeightM/rivalHeightM/heightM/pose/
// formation——career 層只宣告語意，幾何在這裡收斂）
// 隊伍配色卷批 3 B4：非我方 subject 的 kit 欄位只在這裡（呼叫端明確帶對手脈絡時，
// 走 opts.opponentKit）填入——未傳＝undefined，subjectTeamKit 視同「未帶」，B 隊
// 維持 resolveKit 的現行預設（恆定紅），逐值不變。
export function defaultSubjects(template, opts = {}) {
  if (template === 'confront') {
    if (opts.formation === 'trio') {
      // 三人版轉位並排（小守/玩家/小白——三個自由人的隊）：confront 變體、不新增模板
      return [
        { id: 'AL', teamId: 'A', heightM: 1.72, role: 'libero', x: -0.95, z: -1.2, facing: 0 },
        { id: 'A2', teamId: 'A', heightM: opts.playerHeightM ?? 1.75, role: 'libero', x: 0, z: -1.2, facing: 0 },
        { id: 'N2', teamId: 'A', heightM: 1.6, role: 'libero', x: 0.95, z: -1.2, facing: 0 },
      ];
    }
    return [
      { id: 'B1', teamId: 'B', heightM: opts.rivalHeightM ?? 1.88, role: 'outside', x: 0, z: -1.4, facing: 0, kit: opts.opponentKit ?? null },
      { id: 'A2', teamId: 'A', heightM: opts.playerHeightM ?? 1.75, role: 'outside', x: 0.35, z: 1.4, facing: Math.PI },
    ];
  }
  if (template === 'exit') {
    return [
      { id: 'B1', teamId: 'B', heightM: opts.rivalHeightM ?? 1.88, role: 'outside', x: -0.4, z: -1.0, facing: Math.PI, walk: true, kit: opts.opponentKit ?? null },
      { id: 'B2', teamId: 'B', heightM: 1.82, role: 'middle', x: -1.7, z: -2.2, facing: 0, kit: opts.opponentKit ?? null },
      { id: 'B3', teamId: 'B', heightM: 1.78, role: 'setter', x: -2.4, z: -1.8, facing: 0, kit: opts.opponentKit ?? null },
    ];
  }
  if (template === 'rimlight-solo') {
    return [{
      id: opts.subjectId ?? 'B4', teamId: opts.teamId ?? 'B', heightM: opts.heightM ?? 1.84,
      role: opts.role ?? 'opposite', x: 0, z: 0, facing: 0,
      pose: opts.pose ?? null, sink: opts.sink ?? 0, kit: opts.opponentKit ?? null,
    }];
  }
  // stands：遠景球場上的兩隊剪影（止步旁觀——你在看台上）。
  // 債清批 2026-08-26 接線：B 隊＝奪冠方吃 opts.opponentKit（rivalArc 傳天鷹）；
  // A 隊＝匿名決賽對手，刻意不吃 opponentKit——此模板現僅高中章觸發（kitA 恆 null），
  // 未來章節若重用且玩家不在場上，呼叫端不得傳 kitA（否則 A 剪影誤穿我方服）。
  return [
    { id: 'B1', teamId: 'B', heightM: 1.88, role: 'outside', x: -0.8, z: -1.6, facing: 0, kit: opts.opponentKit ?? null },
    { id: 'B2', teamId: 'B', heightM: 1.8, role: 'middle', x: 0.6, z: -1.9, facing: 0, kit: opts.opponentKit ?? null },
    { id: 'A1', teamId: 'A', heightM: 1.78, role: 'outside', x: -0.2, z: 1.7, facing: Math.PI },
    { id: 'A3', teamId: 'A', heightM: 1.75, role: 'setter', x: 1.1, z: 1.5, facing: Math.PI },
  ];
}

// 每位 subject 實際套用的 teamKit（createGeoCharacter 第 7 參數）——createBeatStage
// 與單測共用同一份，不得分裂成兩份邏輯（B4 驗收）。我方（teamId 'A'，未標示者預設
// 亦視為 'A'）恆吃 opts.kitA（章節感知，呼叫端算好；未傳＝null＝resolveKit 回落
// 現行 TEAM_KIT.A 預設，高中章／大學未選校下逐值不變）；非我方僅在 subject 自帶
// .kit（呼叫端經 opts.opponentKit 明確傳入對手身分）時換裝，未傳＝null＝resolveKit
// 回落現行預設（B 隊恆定紅），逐值不變。
export function subjectTeamKit(s, opts = {}) {
  return (s.teamId ?? 'A') === 'A' ? (opts.kitA ?? null) : (s.kit ?? null);
}

// 膝蓋著地悶響（零音檔架構——憲法 Q3 未開，一律 WebAudio 合成；失敗靜默）
function playThud() {
  try {
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
    osc.onended = () => ctx.close();
  } catch { /* 音效失敗不擋演出 */ }
}

// 燈光預設（beatShot.lighting；opts.lighting 可覆蓋）：match 賽場感／dusk 賽後餘暉剪影
// ／rim 邊光單人／arena 遠景場館／confess 坦白燈光帶（幕三專屬：場館燈滅、只留兩人光帶）
function buildLights(scene, preset) {
  if (preset === 'confess') {
    scene.add(new THREE.HemisphereLight(0x1a2334, 0x05060b, 0.1));
    for (const [x, z] of [[0, -1.4], [0.35, 1.4]]) {
      const spot = new THREE.SpotLight(0xfff1d0, 220, 9, 0.42, 0.65, 1.2);
      spot.position.set(x + 0.3, 4.6, z + 0.5);
      spot.target.position.set(x, 1.0, z);
      scene.add(spot);
      scene.add(spot.target);
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(0.85, 36),
        new THREE.MeshBasicMaterial({ color: 0xffe9b8, transparent: true, opacity: 0.1 }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.004, z);
      scene.add(pool);
    }
    return;
  }
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
    // 亮度經 Playwright 像素採樣校正（07-27：0.3/0.55 檔近全黑——剪影要「看得見的暗」）
    scene.add(new THREE.HemisphereLight(0x36466e, 0x0a0c14, 0.5));
    const warm = new THREE.DirectionalLight(0xffb37a, 0.9);
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

  buildLights(scene, opts.lighting ?? shot.lighting);
  if (opts.sound === 'thud') playThud();

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

  const subjects = (opts.subjects?.length ? opts.subjects : defaultSubjects(template, opts))
    .map((s) => ({
      ...s,
      // 每人的基準姿勢：專屬 beat 姿勢（wipe/fist/knee）優先於位置亮相姿
      basePose: BEAT_POSES[s.pose] ?? pickPortraitPose(s.role ?? 'outside') ?? DEFAULT_POSE,
    }));
  const pool = createGeoPool(scene, false, subjects.length);
  const rigs = subjects.map((s) => {
    // 隊伍配色卷批 3 B4：第 7 參數＝subjectTeamKit（我方章節感知／對手看脈絡），
    // 第 6 參數 name 明傳空字串——原本靠省略吃預設值，這裡補上第 7 參數就得顯式補回
    const rig = createGeoCharacter(
      pool, s.id ?? 'A2', s.teamId ?? 'A', s.heightM ?? BASE_H, s.role === 'libero',
      '', subjectTeamKit(s, opts),
    );
    applyPortraitPose(rig.joints, s.basePose);
    rig.root.position.set(s.x ?? 0, -(s.sink ?? 0), s.z ?? 0);
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
      // 呼吸感（ritualStage 慣例）：站著不是雕像——以各自基準姿勢的脊柱為中心
      rig.joints.spine.rotation.x = (s.basePose.spine ?? 0) + Math.sin(elapsed * 1.6 + i) * 0.012;
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
