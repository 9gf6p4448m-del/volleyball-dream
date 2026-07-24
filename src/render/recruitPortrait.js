// 開卡儀式立繪：招募入隊卡片頂部的獨立小 three.js 場景（自己的 renderer/canvas，
// 不掛進主賽場 scene）——幾何球員亮相姿勢＋緩慢自轉。W7 開卡儀式升級（Sawmah 拍板 #5 選 B）。
// 純邏輯（姿勢挑選／入隊台詞）與 three.js 場景建構分層：前者可在無 DOM 環境下單元測試，
// 後者（createRecruitPortrait）需要真實 canvas/WebGL，只在瀏覽器執行。
import * as THREE from 'three';
import { createGeoCharacter, createGeoPool, BASE_H } from './geoCharacter.js';

const PORTRAIT_W = 240;
const PORTRAIT_H = 300;
const ROTATE_SPEED = 0.5; // rad/s，緩慢自轉——展示但不搶戲
const MAX_DT = 0.1; // 分頁切走/掉幀防護：dt 上限避免單幀跳轉太多

// ---- 決定論小工具（同 geoCharacter.js 的 idHash 演算法，模組獨立不互相 import） ----
export function idHashLocal(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

// ---- 亮相姿勢（依位置給對應帥氣定格；欄位語彙同 geoAnimator.js 的 POSES） ----
export const DEFAULT_POSE = {
  rSh: [-0.5, -0.15], lSh: [-0.5, 0.15], rEl: -1.1, lEl: -1.1, spine: 0.08, neck: -0.05,
};
export const ROLE_POSES = {
  // 主攻/對角：扣球隨揮收勢——單手高舉的得分定格
  outside: { rSh: [-2.2, -0.1], lSh: [-0.3, 0.15], rEl: -0.3, lEl: -0.2, spine: 0.15, neck: -0.05 },
  opposite: { rSh: [-2.2, -0.1], lSh: [-0.3, 0.15], rEl: -0.3, lEl: -0.2, spine: 0.15, neck: -0.05 },
  // 舉球員：雙手捧球預備——沉穩自信
  setter: { rSh: [-1.2, 0.15], lSh: [-1.2, -0.15], rEl: -0.6, lEl: -0.6, spine: 0, neck: -0.08 },
  // 中間手：攔網雙手高舉——牆的姿態
  middle: { rSh: [-2.6, 0.1], lSh: [-2.6, -0.1], rEl: 0, lEl: 0, spine: 0.05, neck: -0.12 },
  // 自由人：雙臂抱胸／護在身前——防守待命的篤定
  libero: { rSh: [-0.5, -0.12], lSh: [-0.5, 0.12], rEl: -1.3, lEl: -1.3, spine: 0.1, neck: 0 },
};

// role 未知（理論上不會發生，防呆用）→ 回退中性抱胸姿
export function pickPortraitPose(role) {
  return ROLE_POSES[role] ?? DEFAULT_POSE;
}

// 把姿勢套進 rig.joints（純函式：joints 只需具備 {rotation:{x,z}} 的鴨子型別，
// 真實 three.js Group 與測試用假物件皆可傳入——同 geoAnimator 測試手法）
export function applyPortraitPose(joints, pose) {
  joints.rShoulder.rotation.x = pose.rSh[0];
  joints.rShoulder.rotation.z = pose.rSh[1];
  joints.lShoulder.rotation.x = pose.lSh[0];
  joints.lShoulder.rotation.z = pose.lSh[1];
  joints.rElbow.rotation.x = pose.rEl;
  joints.lElbow.rotation.x = pose.lEl;
  joints.spine.rotation.x = pose.spine;
  joints.neck.rotation.x = pose.neck;
}

// ---- 入隊宣言一行（依 role 2-3 種變化，member.id 決定論挑選——同存檔重演一致） ----
// TODO(naming)：佔位台詞，待專職文案/命名工程回頭潤飾（同 W7 kickoff 懸而未決的命名工程項）
const JOIN_LINES = {
  outside: ['——邊線是我的，誰都別想擋。', '——以後，右上角先問過我。'],
  opposite: ['——對角砲，認得我就夠了。', '——關鍵分，把球交給我。'],
  setter: ['——舉球權，我要親手贏回來。', '——你們的攻擊手，以後由我來餵球。'],
  middle: ['——以後，我的攔網就是你們的牆。', '——快攻這條線，我來守。'],
  libero: ['——沒有我接不住的球。', '——你們儘管衝，後面有我。'],
};
const DEFAULT_JOIN_LINES = ['——以後，我們是一隊了。'];

export function pickJoinLine(member) {
  const lines = JOIN_LINES[member?.role] ?? DEFAULT_JOIN_LINES;
  const idx = idHashLocal(String(member?.id ?? '')) % lines.length;
  return lines[idx];
}

// ---- three.js 立繪場景（DOM/WebGL 依賴——僅瀏覽器執行，不在 node --test 下呼叫） ----
// 回傳 { el, dispose }：el 為承載 canvas 的容器 div，插進卡片頂部；dispose 釋放
// renderer/GL context（幾何/材質是 geoCharacter.js 模組層級快取，不可在此 dispose）。
export function createRecruitPortrait(member) {
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    `width:${PORTRAIT_W}px`, `height:${PORTRAIT_H}px`, 'margin:0 auto',
    'border-radius:12px', 'overflow:hidden', 'position:relative',
    'background:radial-gradient(ellipse at 50% 35%, rgba(255,209,102,0.14), rgba(7,10,18,0) 70%)',
  ].join(';');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(PORTRAIT_W, PORTRAIT_H);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  wrap.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, PORTRAIT_W / PORTRAIT_H, 0.1, 10);
  camera.position.set(0, 1.15, 2.7);
  camera.lookAt(0, 1.05, 0);

  // 燈光：暖金主光（呼應開卡卡框金色）＋冷底光＋輕輪廓——單人小場景不需投影
  scene.add(new THREE.HemisphereLight(0x445a8c, 0x14101a, 0.6));
  const key = new THREE.DirectionalLight(0xfff1d0, 2.4);
  key.position.set(2, 3, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd166, 0.85);
  rim.position.set(-2, 1.4, -2);
  scene.add(rim);

  const pool = createGeoPool(scene, false, 1);
  const rig = createGeoCharacter(pool, member.id, 'A', member.height ?? BASE_H, member.role === 'libero');
  applyPortraitPose(rig.joints, pickPortraitPose(member.role));
  pool.finishColors();

  let raf = null;
  let last = null;
  function frame(now) {
    const dt = last === null ? 0 : Math.min((now - last) / 1000, MAX_DT);
    last = now;
    rig.root.rotation.y += dt * ROTATE_SPEED;
    rig.root.updateMatrixWorld(true);
    for (const part of rig.parts) pool.writeMatrix(part, part.node.matrixWorld);
    pool.markDirty();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    el: wrap,
    dispose() {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      renderer.dispose();
      // 立即釋放 GL context（多次連續開卡若靠 GC 回收，短時間內可能撞上瀏覽器
      // 同時存活 WebGL context 數量上限）——geometry/material 是模組層級共用快取，不受影響
      renderer.forceContextLoss?.();
      wrap.replaceChildren();
    },
  };
}
