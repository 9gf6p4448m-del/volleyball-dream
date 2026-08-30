// 場景基礎：renderer、camera、燈光（畫面層，不含任何模擬邏輯）
import * as THREE from 'three';

export function createRenderer(container, quality) {
  const renderer = new THREE.WebGLRenderer({
    antialias: quality.antialias,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(quality.dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  if (quality.shadowSize > 0) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  container.appendChild(renderer.domElement);
  return renderer;
}

// 夜賽氛圍（vow3d 剪影美學的排球版）：暗色場館＋球場聚光——人物從背景跳出來
export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e1a);
  scene.fog = new THREE.Fog(0x0b0e1a, 28, 62);
  return scene;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    120,
  );
  camera.position.set(13, 8, 15);
  camera.lookAt(0, 1.5, 0);
  return camera;
}

export function createLights(scene, quality) {
  // 底光：冷藍夜色（壓暗——聚光燈才有戲）
  const hemi = new THREE.HemisphereLight(0x4a5a8c, 0x141821, 0.5);
  scene.add(hemi);

  // 主燈：暖白「場館頂燈」（唯一影燈——效能不加價）
  const key = new THREE.DirectionalLight(0xffefd8, 2.6);
  key.position.set(8, 20, 6);
  if (quality.shadowSize > 0) {
    key.castShadow = true;
    key.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 45;
    key.shadow.bias = -0.0004;
  }
  scene.add(key);

  // 逆光：冷藍輪廓光（剪影感——人物邊緣從暗背景切出來）
  const rim = new THREE.DirectionalLight(0x5f7dff, 0.7);
  rim.position.set(-9, 12, -14);
  scene.add(rim);

  // 球場聚光光池 ×2（不投影的氛圍燈：兩個半場各一盞暖光錐）
  const SPOT_BASE = 260;
  const SPOT_BASE_COLOR = new THREE.Color(0xffe6bf);
  const SPOT_TEAM_TINT = new THREE.Color(0x6ee7ff); // W7.1 #4⑤：我方（A）氣勢滿檔微染隊色青
  const spots = [];
  for (const sz of [7, -7]) {
    const spot = new THREE.SpotLight(0xffe6bf, SPOT_BASE, 40, 0.62, 0.55, 1.6);
    spot.position.set(0, 15, sz * 0.55);
    spot.target.position.set(0, 0, sz * 0.6);
    scene.add(spot);
    scene.add(spot.target);
    spots.push(spot);
  }

  // 局點張力：底光再壓、輪廓光加強（戲劇性收攏）——幀率無關指數收斂
  let tension = 0;
  // W7 B4③：氣勢聚光微聯動（+3 微增亮／−3 微收）——幀率無關指數收斂，獨立於 tension 狀態
  let momentumGlow = 0;
  // W4(P4) Q10 冠軍館燈光秀：暗場→聚光逐盞亮→底光回升（牆鐘驅動；rig 巡場同窗）。
  // 進行中 setTension/setMomentum 短路——常態燈控不與演出打架；跳過＝stopOpeningShow
  let show = null; // { t0, dur }
  // 三卷批2 MVP 燈暗聚光：底光/主燈快速壓暗、聚光微增（人物從暗裡浮出）——
  // 同燈光秀慣例：進行中常態燈控短路；收口走 stopMvpDim（還原值與 stopOpeningShow 同源）
  let mvpDim = null; // { t0, dur }
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  return {
    setTension(active, dt) {
      if (show || mvpDim) return;
      const t = active ? 1 : 0;
      tension += (t - tension) * (1 - Math.exp(-3 * dt));
      hemi.intensity = 0.5 - 0.22 * tension;
      rim.intensity = 0.7 + 0.55 * tension;
      key.intensity = 2.6 - 0.25 * tension;
    },
    // value：momentum.value/MOMENTUM_MAX 正規化後的 −1..1（呼叫端已除好，這裡不吃 sim 常數）；
    // 局點張力優先——tensionActive 時目標收斂回 0，避免與局點壓暗管線疊加打架
    setMomentum(value, tensionActive, dt) {
      if (show || mvpDim) return;
      const target = tensionActive ? 0 : value;
      momentumGlow += (target - momentumGlow) * (1 - Math.exp(-3 * dt));
      const mul = 1 + momentumGlow * 0.1; // 「微」增亮/微收，幅度封頂 ±10%——不可搶戲
      // W7.1 #4⑤：我方滿檔氛圍光微染——只在正值染色（往隊色青）、負值維持中性偏暗（不換色只調強度）
      const tint = Math.max(0, Math.min(1, momentumGlow)) * 0.12; // 「微」封頂 12% 混色
      for (const spot of spots) {
        spot.intensity = SPOT_BASE * mul;
        spot.color.copy(SPOT_BASE_COLOR).lerp(SPOT_TEAM_TINT, tint);
      }
    },
    startOpeningShow(now, dur = 5600) {
      show = { t0: now, dur };
    },
    stopOpeningShow() {
      show = null;
      hemi.intensity = 0.5;
      key.intensity = 2.6;
      rim.intensity = 0.7;
      for (const spot of spots) {
        spot.intensity = SPOT_BASE;
        spot.color.copy(SPOT_BASE_COLOR);
      }
    },
    openingShowActive() {
      return !!show;
    },
    // 三卷批2：MVP 燈暗（K2-4）——前 18% 快速壓暗後定住；stopMvpDim 完全還原常態
    startMvpDim(now, dur = 4500) {
      mvpDim = { t0: now, dur };
    },
    stopMvpDim() {
      mvpDim = null;
      this.stopOpeningShow(); // 還原值單一來源（hemi 0.5／key 2.6／rim 0.7／spot 常態）
    },
    updateMvpDim(now) {
      if (!mvpDim) return null;
      const p = Math.min((now - mvpDim.t0) / mvpDim.dur, 1);
      const dip = clamp01(p / 0.18); // 【試玩必調】壓暗速度（前 18% 到位）
      hemi.intensity = 0.5 - 0.4 * dip; // → 0.1
      key.intensity = 2.6 - 2.0 * dip; // → 0.6
      rim.intensity = 0.7 + 0.3 * dip; // 輪廓補光：人物邊緣從暗場切出來
      for (const spot of spots) {
        spot.intensity = SPOT_BASE * (1 + 0.35 * dip); // 聚光微增＝舞台感【試玩必調】
        spot.color.copy(SPOT_BASE_COLOR);
      }
      return p;
    },
    // 每幀驅動；回傳 0..1 進度（rig 巡場共用時間軸）、結束回 null 並自動恢復常態
    updateOpeningShow(now) {
      if (!show) return null;
      const p = (now - show.t0) / show.dur;
      if (p >= 1) {
        this.stopOpeningShow();
        return null;
      }
      // 0–0.22 暗場；0.22–0.72 聚光逐盞亮；0.72–1 底光回升（開演）
      const rise = clamp01((p - 0.72) / 0.28);
      hemi.intensity = 0.04 + rise * 0.46;
      key.intensity = 0.12 + rise * 2.48;
      rim.intensity = p < 0.5 ? 0.08 : 0.08 + clamp01((p - 0.5) / 0.3) * 0.62;
      spots.forEach((spot, i) => {
        const t0 = 0.22 + i * 0.24; // 逐盞亮（兩盞錯開）
        const ramp = clamp01((p - t0) / 0.14);
        spot.intensity = SPOT_BASE * ramp * (1.3 - rise * 0.3); // 亮起瞬間略過曝再回常態
        spot.color.copy(SPOT_BASE_COLOR);
      });
      return p;
    },
  };
}

export function bindResize(renderer, camera) {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
