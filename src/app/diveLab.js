// 魚躍提案預覽（feat/dive-proposals）：?mode=divelab&dive=a|b|c|now&fig=geo|real&ball=1.1
// 單人在場上反覆播放同一支魚躍（與 matchView ?dive= 用同一套序列＋root 曲線＋接地補償），
// 供使用者目視挑方案、也供 tools/dive-proposal-shots.mjs 逐幀截圖。不碰正式賽場與 sim。
// window.__diveLab＝治具介面（seek 為決定論重播：從觸發起以 1/60 s 固定步長重算）。
import * as THREE from 'three';
import { createGeoPool, createGeoCharacter, BASE_H } from '../render/geoCharacter.js';
import { createGeoAnimator } from '../render/geoAnimator.js';
import {
  diveSeqFor, diveRootPose, legacyDiveRootPose, geoBodyMinY, diveGroundLift, DIVE_FLOOR_TARGET,
} from '../render/diveStyles.js';

const DT = 1 / 60;
const RECOVER = 42; // sim TUNING.DIVE_RECOVER_TICKS（同 matchView DIVE_RECOVER）
const PRE = 20;     // 觸發前待命幀（讓待命姿勢收斂）
const LOOP_FRAMES = 44 + 40; // 一撲（含收尾）＋站定停頓
const START = { x: 1.2, z: -6.2 }; // A 隊後排、面向網（+Z）撲

export async function runDiveLab(ctx) {
  const { scene, camera, renderer, params, loadingEl } = ctx;
  const styleParam = params.get('dive') ?? 'a';
  const ballY = Number.parseFloat(params.get('ball') ?? '1.1');
  const figParam = params.get('fig') === 'real' ? 'real' : 'geo';
  if (loadingEl) loadingEl.remove();

  // 幾何人（同 matchView：InstancedMesh 池、root 旋轉序 YXZ、縮放 1）
  const castShadow = (ctx.quality?.shadowSize ?? 0) > 0;
  const pool = createGeoPool(scene, castShadow, 1);
  const geo = createGeoCharacter(pool, 'A1', 'A', BASE_H, false, 'R', null, null);
  pool.finishColors();
  geo.root.rotation.order = 'YXZ';

  // 寫實人（寫實球員卷第一階段白模；同一套 geoAnimator 驅動）
  let real = null;
  if (figParam === 'real') {
    const { loadRealPlayerAsset, createRealPlayer } = await import('../render/realPlayer.js');
    const variant = params.get('faces') === '5k' ? '5k' : '20k';
    const asset = await loadRealPlayerAsset(`${import.meta.env.BASE_URL}models/real/player_${variant}.glb`);
    real = createRealPlayer(asset, { playerId: 'A1', teamId: 'A', height: BASE_H });
    real.rig.root.rotation.order = 'YXZ';
    real.mesh.castShadow = castShadow;
    scene.add(real.rig.root);
    scene.add(real.mesh);
  }

  const state = { style: styleParam, fig: figParam, ballY, seq: null, frame: 0, auto: true, lift: 0, minY: 0 };
  function seqName() {
    return state.style === 'now' ? 'dive' : diveSeqFor(state.style, state.ballY);
  }
  function rootPose(p) {
    return state.seq === 'dive' ? legacyDiveRootPose(p) : diveRootPose(state.seq, p);
  }
  const rig = () => (state.fig === 'real' ? real.rig : geo);
  // 寫實人全身最低點（CPU 蒙皮，抽樣每 3 個頂點）
  const vtx = new THREE.Vector3();
  function realMinY() {
    const pos = real.mesh.geometry.attributes.position;
    let m = Infinity;
    for (let i = 0; i < pos.count; i += 3) {
      real.mesh.getVertexPosition(i, vtx);
      if (vtx.y < m) m = vtx.y;
    }
    return m;
  }
  let anim = null;
  // 決定論重播到第 f 幀（f<0＝觸發前待命；f=0＝觸發後第一幀）
  function seek(f) {
    const r = rig();
    if (state.fig === 'real') real.resetPose();
    for (const j of Object.values(r.joints)) j.rotation.set(0, 0, 0);
    anim = createGeoAnimator(r);
    state.seq = seqName();
    for (let i = 0; i < PRE; i += 1) anim.update(DT, 0, 0, 1);
    let bodyY = 0;
    if (f >= 0) {
      anim.trigger(state.seq);
      for (let k = 0; k <= f; k += 1) bodyY = anim.update(DT, 0, 0, 1);
    } else {
      bodyY = anim.update(DT, 0, 0, 1);
    }
    place(r, f, bodyY);
    state.frame = f;
  }
  function place(r, f, bodyY) {
    const p = f < 0 ? 1 : Math.min(f / RECOVER, 1);
    const rp = f < 0 ? { fwd: 0, up: 0, tilt: 0 } : rootPose(p);
    r.root.position.set(START.x, bodyY + rp.up, START.z + rp.fwd);
    r.root.rotation.set(rp.tilt, 0, 0);
    r.root.updateMatrixWorld(true);
    const active = f >= 0 && (p < 1 || anim.peek()?.type === state.seq);
    state.lift = 0;
    if (state.seq !== 'dive' && active) {
      // 提案接地補償（同 matchView）：寫實人用自己的蒙皮頂點量最低點
      state.lift = diveGroundLift(state.fig === 'real' ? realMinY() : geoBodyMinY(r));
      r.root.position.y += state.lift;
      r.root.updateMatrixWorld(true);
    }
    state.minY = state.fig === 'real' ? realMinY() : geoBodyMinY(r);
    if (state.fig === 'geo') for (const part of geo.parts) pool.writeMatrix(part, part.node.matrixWorld);
    pool.markDirty();
  }
  // 顯示哪一個人：另一個藏到地下
  function applyFig() {
    if (real) real.mesh.visible = state.fig === 'real';
    if (state.fig === 'real') {
      geo.root.position.set(0, -50, 0);
      geo.root.updateMatrixWorld(true);
      for (const part of geo.parts) pool.writeMatrix(part, part.node.matrixWorld);
      pool.markDirty();
    }
  }
  applyFig();

  const CAMS = {
    // 側面（沿撲出方向的垂直方向看）：姿勢最好判讀
    side: { pos: [START.x - 7.6, 1.0, START.z + 1.25], look: [START.x, 0.7, START.z + 1.25] },
    // 斜前 3/4：人朝鏡頭撲
    front: { pos: [START.x - 3.2, 1.9, START.z + 4.6], look: [START.x, 0.45, START.z + 0.9] },
    // 比賽鏡頭（己方底線後上方）
    game: { pos: [0, 5.6, -15.5], look: [0, 0.4, -2.5] },
  };
  function setCam(name) {
    const c = CAMS[name] ?? CAMS.side;
    camera.position.set(...c.pos);
    camera.lookAt(...c.look);
  }
  setCam(params.get('cam') ?? 'side');
  seek(-1);

  let frameCounter = 0;
  let acc = 0;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    acc += Math.min((now - last) / 1000, 0.1);
    last = now;
    while (state.auto && acc >= DT) {
      acc -= DT;
      frameCounter = (frameCounter + 1) % LOOP_FRAMES;
      seekIncremental(frameCounter);
    }
    if (!state.auto) acc = 0;
    if (ctx.postFx) ctx.postFx.render(scene, camera);
    else renderer.render(scene, camera);
  }
  // 自動播放用：逐幀推進（不重播），行為與 seek 相同
  function seekIncremental(n) {
    const r = rig();
    if (n === 0) { seek(-1); return; }
    const f = n - 1;
    if (f === 0) anim.trigger(state.seq);
    const bodyY = anim.update(DT, 0, 0, 1);
    if (f >= 0) place(r, f, bodyY);
    state.frame = f;
  }
  requestAnimationFrame(frame);

  // 選單（手機可點）：方案切換＋寫實/幾何＋鏡頭
  const bar = document.createElement('div');
  bar.id = 'divelab-bar';
  bar.style.cssText = 'position:fixed;left:8px;right:8px;bottom:max(12px,env(safe-area-inset-bottom));z-index:20;'
    + 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center;font:600 14px/1 system-ui,sans-serif';
  const link = (label, patch) => {
    const a = document.createElement('a');
    const q = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) q.set(k, v);
    a.href = `?${q.toString()}`;
    a.textContent = label;
    const on = Object.entries(patch).every(([k, v]) => (params.get(k) ?? { dive: 'a', fig: 'geo', cam: 'side' }[k]) === v);
    a.style.cssText = `padding:10px 12px;border-radius:10px;text-decoration:none;color:#eef2fa;min-height:44px;box-sizing:border-box;display:inline-flex;align-items:center;background:${on ? 'rgba(46,123,255,.85)' : 'rgba(12,16,26,.75)'}`;
    bar.appendChild(a);
  };
  link('現行', { dive: 'now' }); link('A 滑撲', { dive: 'a' }); link('B 手掌貼地', { dive: 'b' });
  link('C 依球高', { dive: 'c' }); link('幾何人', { fig: 'geo' }); link('寫實人', { fig: 'real' });
  link('側面', { cam: 'side' }); link('斜前', { cam: 'front' }); link('比賽鏡頭', { cam: 'game' });
  if (state.style === 'c') { link('C：高球 1.1m', { ball: '1.1' }); link('C：貼地球 0.2m', { ball: '0.2' }); }
  document.body.appendChild(bar);

  window.__diveLab = {
    THREE,
    state,
    frames: 44, // 觸發後第 0..43 幀涵蓋整支序列（0.72 s）
    recover: RECOVER,
    floorTarget: DIVE_FLOOR_TARGET,
    pause() { state.auto = false; },
    resume() { state.auto = true; },
    seek(f) { state.auto = false; seek(f); scene.updateMatrixWorld(true); return { seq: state.seq, lift: state.lift, minY: state.minY }; },
    setCam,
    render() { renderer.render(scene, camera); },
    joints: () => rig().joints,
    real: () => real,
    geo: () => geo,
  };
}
