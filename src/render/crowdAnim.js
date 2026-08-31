// 大作感三卷 批1：觀眾反應動畫（純視覺，不碰 sim）
// 得分死球＝觀眾彈跳波動反應窗；關鍵分＝窗加長加高＋燈海（觀眾席光點層）。
// 效能鐵則（K1-1）：兩個窗（反應窗／J4 人浪窗）都關時零 instance 矩陣更新——
// 窗收尾那一幀還原 base 後就不再碰。
// 觸發同源（K1-2）：matchLoop 在 DEAD_BALL 處餵 s.keyPointRally 鎖存值，這裡不另判關鍵分。
// 大作感四卷 批1（J4）觀眾人浪：暫停集合（timeoutHuddleTeam 設值 edge）與局間
// （set_break 進場 edge）各觸發一次人浪窗，複用同一套 restore 收尾。matchLoop 只在
// 這兩個 edge（皆為死球態：暫停集合發生在 serve 相位的發球前等待、局間是 set_break
// 相位）呼叫 onTimeout/onSetBreak——事件觸發、非狀態輪詢（同 onScore 慣例），
// 本模組不重讀 game.phase，「rally 進行中不播」由呼叫端只在這兩個 edge 呼叫來保證
// （J4②，見 matchLoop.js requestTimeout／AI 暫停分支／set_break edge 三處呼叫點的註解）。
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

// 【試玩必調】J4 人浪窗參數：travelMs＝波前掃過全場一圈的時間，riseMs＝單一座位
// 起伏半週期（上升到峰值再落回的一半），整窗總長＝travelMs + riseMs*2
// （最後一顆座位也要跑完自己的起伏）。
export const WAVE = {
  travelMs: 2600,
  riseMs: 260,
  amp: 0.26,
};

// 純函式（K1-3）：elapsed（ms）＋keyPoint → { amp, lightsea }
// 窗內 amp>0（sin 包絡淡入淡出）、窗外恆 0；燈海只在關鍵分窗內
export function crowdReactionAt(elapsedMs, { keyPoint = false } = {}) {
  const dur = keyPoint ? REACT.keyDurMs : REACT.durMs;
  if (!(elapsedMs >= 0) || elapsedMs >= dur) return { amp: 0, lightsea: false };
  const peak = keyPoint ? REACT.keyAmp : REACT.amp;
  return { amp: peak * Math.sin(Math.PI * (elapsedMs / dur)), lightsea: !!keyPoint };
}

// J4①（純函式，供測試直測）：elapsed（ms，人浪窗開始算起）＋seatPhase（0..1，
// 座位在波前繞場一圈的相對位置——由呼叫端把座位座標換算成角度算出，本函式不碰
// THREE／座標系，只認 0..1 這個數）→ 該座位此刻的振幅。
// 語意：波前在 seatPhase*travelMs 那一刻掃到這顆座位，掃到後座位起伏 riseMs*2
// （sin 半週期，淡入淡出、峰值 WAVE.amp）就歸零；窗外（elapsed<0 或已經播完整窗）
// 恆 0——「播畢座位還原 base」由呼叫端在窗外收尾一次即可，這裡的 0 只是不再貢獻位移。
export function crowdWaveAt(elapsedMs, seatPhase = 0) {
  if (!(elapsedMs >= 0)) return 0;
  const localStart = seatPhase * WAVE.travelMs; // 波前遞延：相位越大，輪到起伏的時間越晚
  const local = elapsedMs - localStart;
  const localDur = WAVE.riseMs * 2;
  if (local < 0 || local >= localDur) return 0;
  return WAVE.amp * Math.sin(Math.PI * (local / localDur));
}

// 座位相位：以場地中心為圓心，座位 (x,z) 的方位角正規化到 0..1——人浪繞場一圈的視覺。
function seatPhaseOf(x, z) {
  const ang = Math.atan2(z, x); // -PI..PI
  return (ang + Math.PI) / (Math.PI * 2);
}

// 每幀驅動器：onScore/onTimeout/onSetBreak 開窗、update 在窗內動矩陣、兩窗皆外早退
// （零成本）。崩潰 try/catch 自我停用並盡力還原（K1-4 永不致死——動畫死了比賽照打）。
export function createCrowdAnim(scene, arena) {
  let startedAt = -1; // 得分反應窗（onScore）
  let keyPoint = false;
  let waveStartedAt = -1; // J4 人浪窗（onTimeout／onSetBreak，各自獨立時鐘）
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

  function applyWave(crowd, elapsed) {
    const base = crowd.userData.crowdBase;
    const present = crowd.userData.crowdPresent;
    const n = present.length;
    for (let i = 0; i < n; i += 1) {
      if (!present[i]) continue; // 缺席者留在地下，不動
      const amp = crowdWaveAt(elapsed, seatPhaseOf(base[i * 3], base[i * 3 + 2]));
      m4.makeTranslation(base[i * 3], base[i * 3 + 1] + amp, base[i * 3 + 2]);
      crowd.setMatrixAt(i, m4);
    }
    crowd.instanceMatrix.needsUpdate = true;
  }

  return {
    // matchLoop DEAD_BALL 處呼叫；keyPoint＝s.keyPointRally 鎖存值（同源，這裡不判）
    onScore(now, opts = {}) {
      if (dead) return;
      startedAt = now;
      keyPoint = !!opts.keyPoint;
    },
    // J4：暫停集合 edge（s.timeoutHuddleTeam 剛設值那一刻，matchLoop 只呼叫一次）
    onTimeout(now) {
      if (dead) return;
      waveStartedAt = now;
    },
    // J4：局間 edge（game.phase 剛轉進 set_break 那一刻，matchLoop 只呼叫一次）
    onSetBreak(now) {
      if (dead) return;
      waveStartedAt = now;
    },
    update(now) {
      const scoreOpen = startedAt >= 0;
      const waveOpen = waveStartedAt >= 0;
      if (dead || (!scoreOpen && !waveOpen)) return; // K1-1：兩窗皆關＝零成本，不碰 crowd
      try {
        const crowd = arena.getCrowd?.();
        if (!crowd?.userData?.crowdBase) return;

        // J4③ 仲裁規則（同幀只一種生效）：得分反應窗（既有機制，含關鍵分燈海）
        // 優先於人浪——反應窗這一刻有 amp 就只動反應窗，人浪這幀讓路（各自時鐘
        // 各走各的，等反應窗收尾，人浪若還沒過期，下一幀立刻接手，不必重觸發）。
        if (scoreOpen) {
          const { amp, lightsea } = crowdReactionAt(now - startedAt, { keyPoint });
          if (amp > 0) {
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
            return; // 反應窗這幀在動，人浪讓路
          }
          // 反應窗收尾：還原一次（若人浪窗接著開，下面會馬上重畫，這次還原不浪費——
          // 兩窗交界那一幀最多一次 restore＋一次 applyWave，仍是「同幀一種生效」）
          if (active) {
            restore(crowd);
            if (sea) sea.points.visible = false;
            active = false;
          }
          startedAt = -1;
        }

        if (waveStartedAt >= 0) {
          const elapsed = now - waveStartedAt;
          const dur = WAVE.travelMs + WAVE.riseMs * 2;
          if (elapsed < 0 || elapsed >= dur) {
            if (active) { restore(crowd); active = false; }
            waveStartedAt = -1;
            return;
          }
          active = true;
          applyWave(crowd, elapsed);
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
