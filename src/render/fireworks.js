// 大作感四卷 批1（J3）：奪冠煙火——升空火花＋炸開放射粒子，決定論偽亂數沿
// confetti 範式（createConfetti 同款 hash rng、槽循環回收，不碰 sim/Math.random）。
// 只在 championTitle 成立的 startCelebration 鏈啟動（非冠軍勝場不建立/不啟動，
// 呼叫端 matchLoop.js 已把關）；崩潰自我停用（K1-4 永不致死慣例，沿 crowdAnim try/catch）。
import * as THREE from 'three';

const SHELLS = 5; // 【試玩必調】同時在飛的升空火花數（槽循環）
const BURST_PARTICLES = 46; // 【試玩必調】每次炸開的粒子數
const LAUNCH_EVERY_SEC = 0.9; // 【試玩必調】平均每顆升空間隔（決定論抖動見 rnd）
const RISE_SPEED = 6.5; // 【試玩必調】升空速度（世界單位/秒）
const GRAVITY = 3.4; // 【試玩必調】炸開粒子重力
const BURST_PALETTE = [0xffd166, 0xff6b6b, 0x6ee7ff, 0x7ee787, 0xffffff]; // 金/紅/藍/綠/白

export function createFireworks(scene) {
  let dead = false; // J3④：崩潰後自我停用，之後所有呼叫皆早退（不致死）

  // 升空火花：單一 Points，每槽一顆，到頂即觸發炸開並回收（槽循環，不動態配置）
  const shellPos = new Float32Array(SHELLS * 3).fill(-100);
  const shellVy = new Float32Array(SHELLS);
  const shellTargetY = new Float32Array(SHELLS);
  const shellActive = new Uint8Array(SHELLS);
  const shellGeo = new THREE.BufferGeometry();
  shellGeo.setAttribute('position', new THREE.BufferAttribute(shellPos, 3));
  const shellPoints = new THREE.Points(shellGeo, new THREE.PointsMaterial({
    size: 0.22, color: 0xfff3d6, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  shellPoints.frustumCulled = false;
  shellPoints.visible = false;
  scene.add(shellPoints);

  // 炸開粒子：固定池（SHELLS×BURST_PARTICLES 槽），槽循環（同 confetti 範式，零動態配置）
  const BP = SHELLS * BURST_PARTICLES;
  const bPos = new Float32Array(BP * 3).fill(-100);
  const bVel = new Float32Array(BP * 3);
  const bLife = new Float32Array(BP).fill(-1); // -1＝非活躍槽；>=0＝已存活秒數
  const bMaxLife = new Float32Array(BP);
  const bCol = new Float32Array(BP * 3);
  const burstGeo = new THREE.BufferGeometry();
  burstGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  burstGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3));
  const burstMat = new THREE.PointsMaterial({
    size: 0.14, vertexColors: true, transparent: true, opacity: 1,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const burstPoints = new THREE.Points(burstGeo, burstMat);
  burstPoints.frustumCulled = false;
  burstPoints.visible = false;
  scene.add(burstPoints);

  let h = 747796405; // 決定論偽亂數（獨立種子，同 createDust/createConfetti 範式，非 Math.random）
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    return ((h >>> 0) % 1000) / 1000;
  };
  const c = new THREE.Color();

  function launchShell(i) {
    shellPos[i * 3] = (rnd() - 0.5) * 12;
    shellPos[i * 3 + 1] = 0.3;
    shellPos[i * 3 + 2] = (rnd() - 0.5) * 10;
    shellVy[i] = RISE_SPEED * (0.85 + rnd() * 0.3);
    shellTargetY[i] = 6.5 + rnd() * 3.5; // 【試玩必調】炸開高度
    shellActive[i] = 1;
  }

  function burstAt(x, y, z) {
    const hex = BURST_PALETTE[Math.floor(rnd() * BURST_PALETTE.length) % BURST_PALETTE.length];
    c.setHex(hex);
    for (let k = 0; k < BURST_PARTICLES; k += 1) {
      let slot = -1;
      for (let j = 0; j < BP; j += 1) { if (bLife[j] < 0) { slot = j; break; } }
      if (slot < 0) break; // 池滿（正常運作下不會發生，SHELLS 顆同時全炸才可能）
      const theta = rnd() * Math.PI * 2;
      const phi = Math.acos(rnd() * 2 - 1);
      const speed = 2.2 + rnd() * 2.6; // 【試玩必調】炸開初速
      bPos[slot * 3] = x; bPos[slot * 3 + 1] = y; bPos[slot * 3 + 2] = z;
      bVel[slot * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      bVel[slot * 3 + 1] = Math.cos(phi) * speed * 0.8 + 0.6;
      bVel[slot * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;
      bLife[slot] = 0;
      bMaxLife[slot] = 0.9 + rnd() * 0.5; // 【試玩必調】粒子壽命（秒）
      bCol[slot * 3] = c.r; bCol[slot * 3 + 1] = c.g; bCol[slot * 3 + 2] = c.b;
    }
  }

  function resetPools() {
    shellActive.fill(0);
    shellPos.fill(-100);
    bLife.fill(-1);
    bPos.fill(-100);
    shellGeo.attributes.position.needsUpdate = true;
    burstGeo.attributes.position.needsUpdate = true;
  }

  let elapsed = 0;
  let spawnUntil = -1;
  let nextLaunchAt = 0;

  function hideInternal() {
    shellPoints.visible = false;
    burstPoints.visible = false;
    spawnUntil = -1;
    resetPools();
  }

  return {
    // 冠軍慶祝窗開始時呼叫（durationSec＝CELEBRATION_SEC）；非冠軍勝場呼叫端不叫這個
    start(durationSec) {
      if (dead) return;
      try {
        elapsed = 0;
        spawnUntil = durationSec;
        nextLaunchAt = 0.15; // 【試玩必調】開場延遲一拍再第一顆升空
        resetPools();
        shellPoints.visible = true;
        burstPoints.visible = true;
      } catch { dead = true; }
    },
    // 不再補發射；空中的自然飛完/炸完/淡出（endCelebration 隨後 hide 收口）
    stop() {
      if (dead) return;
      spawnUntil = -1;
    },
    // endCelebration 收口：停止可見、清空活躍槽＝資源釋放（固定池不觸碰 GPU 重建）
    hide() {
      if (dead) return;
      try { hideInternal(); } catch { dead = true; }
    },
    update(dt) {
      if (dead || !shellPoints.visible || dt <= 0) return;
      try {
        elapsed += dt;
        if (elapsed < spawnUntil && elapsed >= nextLaunchAt) {
          for (let i = 0; i < SHELLS; i += 1) {
            if (!shellActive[i]) { launchShell(i); break; }
          }
          nextLaunchAt = elapsed + LAUNCH_EVERY_SEC * (0.7 + rnd() * 0.6);
        }
        for (let i = 0; i < SHELLS; i += 1) {
          if (!shellActive[i]) continue;
          shellPos[i * 3 + 1] += shellVy[i] * dt;
          if (shellPos[i * 3 + 1] >= shellTargetY[i]) {
            burstAt(shellPos[i * 3], shellPos[i * 3 + 1], shellPos[i * 3 + 2]);
            shellActive[i] = 0;
            shellPos[i * 3 + 1] = -100;
          }
        }
        shellGeo.attributes.position.needsUpdate = true;
        for (let j = 0; j < BP; j += 1) {
          if (bLife[j] < 0) continue;
          bLife[j] += dt;
          if (bLife[j] >= bMaxLife[j]) { bLife[j] = -1; bPos[j * 3 + 1] = -100; continue; }
          bVel[j * 3 + 1] -= GRAVITY * dt;
          bPos[j * 3] += bVel[j * 3] * dt;
          bPos[j * 3 + 1] += bVel[j * 3 + 1] * dt;
          bPos[j * 3 + 2] += bVel[j * 3 + 2] * dt;
        }
        burstGeo.attributes.position.needsUpdate = true;
      } catch {
        dead = true;
        try { hideInternal(); } catch { /* 還原也失敗＝維持現狀，不擋比賽（K1-4） */ }
      }
    },
    // 測試/除錯用：目前是否可見（結構測試判斷用）；崩潰後恆 false
    isActive() {
      return !dead && shellPoints.visible;
    },
  };
}
