// 大作感三卷 批1：觀眾反應動畫（純視覺，不碰 sim）
// 得分死球＝觀眾彈跳波動反應窗；關鍵分＝窗加長加高＋燈海（觀眾席光點層）。
// 效能鐵則（K1-1）：反應窗外零 instance 矩陣更新——窗收尾那一幀還原 base 後就不再碰。
// 觸發同源（K1-2）：matchLoop 在 DEAD_BALL 處餵 s.keyPointRally 鎖存值，這裡不另判關鍵分。
import * as THREE from 'three';

// 【試玩必調】反應窗參數（普通得分／關鍵分）
export const REACT = {
  durMs: 1600,      // 普通反應窗長
  keyDurMs: 2600,   // 關鍵分反應窗長
  amp: 0.2,         // 普通彈跳峰值（世界單位）
  keyAmp: 0.32,     // 關鍵分彈跳峰值
  freq: 7.5,        // 彈跳角頻率（rad/s）
  seaEvery: 8,      // 燈海取點密度（每 N 個在席觀眾出 1 點）
};

// 純函式（K1-3）：elapsed（ms）＋keyPoint → { amp, lightsea }
// 窗內 amp>0（sin 包絡淡入淡出）、窗外恆 0；燈海只在關鍵分窗內
export function crowdReactionAt(elapsedMs, { keyPoint = false } = {}) {
  const dur = keyPoint ? REACT.keyDurMs : REACT.durMs;
  if (!(elapsedMs >= 0) || elapsedMs >= dur) return { amp: 0, lightsea: false };
  const peak = keyPoint ? REACT.keyAmp : REACT.amp;
  return { amp: peak * Math.sin(Math.PI * (elapsedMs / dur)), lightsea: !!keyPoint };
}

// 每幀驅動器：onScore 開窗、update 在窗內動矩陣、窗外早退（零成本）。
// 崩潰 try/catch 自我停用並盡力還原（K1-4 永不致死——動畫死了比賽照打）。
export function createCrowdAnim(scene, arena) {
  let startedAt = -1;
  let keyPoint = false;
  let active = false;
  let dead = false;
  let sea = null; // { points, mesh }——mesh 換了（換館重建）就重建光點層
  const m4 = new THREE.Matrix4();

  function restore(crowd) {
    const base = crowd.userData.crowdBase;
    const n = crowd.userData.crowdPresent.length;
    for (let i = 0; i < n; i += 1) {
      m4.makeTranslation(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
      crowd.setMatrixAt(i, m4);
    }
    crowd.instanceMatrix.needsUpdate = true;
  }

  function rebuildSea(crowd) {
    if (sea) {
      scene.remove(sea.points);
      sea.points.geometry.dispose();
      sea.points.material.dispose();
      sea = null;
    }
    const base = crowd.userData.crowdBase;
    const present = crowd.userData.crowdPresent;
    const pos = [];
    for (let i = 0; i < present.length; i += 1) {
      if (present[i] && i % REACT.seaEvery === 0) {
        pos.push(base[i * 3], base[i * 3 + 1] + 0.55, base[i * 3 + 2]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffe9b0, size: 0.22, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.matrixAutoUpdate = false;
    points.updateMatrix();
    points.visible = false;
    scene.add(points);
    sea = { points, mesh: crowd };
  }

  return {
    // matchLoop DEAD_BALL 處呼叫；keyPoint＝s.keyPointRally 鎖存值（同源，這裡不判）
    onScore(now, opts = {}) {
      if (dead) return;
      startedAt = now;
      keyPoint = !!opts.keyPoint;
    },
    update(now) {
      if (dead || startedAt < 0) return;
      try {
        const crowd = arena.getCrowd?.();
        if (!crowd?.userData?.crowdBase) return;
        const { amp, lightsea } = crowdReactionAt(now - startedAt, { keyPoint });
        if (amp <= 0) {
          // 窗收尾：還原 base 一次，之後零更新
          if (active) {
            restore(crowd);
            if (sea) sea.points.visible = false;
            active = false;
          }
          startedAt = -1;
          return;
        }
        active = true;
        const base = crowd.userData.crowdBase;
        const present = crowd.userData.crowdPresent;
        const n = present.length;
        const t = now / 1000;
        for (let i = 0; i < n; i += 1) {
          if (!present[i]) continue; // 缺席者留在地下，不動
          const bounce = amp * Math.abs(Math.sin(t * REACT.freq + (i % 7) * 0.9));
          m4.makeTranslation(base[i * 3], base[i * 3 + 1] + bounce, base[i * 3 + 2]);
          crowd.setMatrixAt(i, m4);
        }
        crowd.instanceMatrix.needsUpdate = true;
        if (lightsea) {
          if (!sea || sea.mesh !== crowd) rebuildSea(crowd);
          if (sea) {
            sea.points.visible = true;
            sea.points.material.opacity = 0.5 + 0.4 * Math.sin(t * 9);
          }
        } else if (sea) {
          sea.points.visible = false;
        }
      } catch {
        dead = true; // 永不致死：停用自己，盡力把觀眾放回原位
        try {
          const crowd = arena.getCrowd?.();
          if (crowd?.userData?.crowdBase) restore(crowd);
          if (sea) sea.points.visible = false;
        } catch { /* 還原也失敗＝維持現狀，不擋比賽 */ }
      }
    },
  };
}
