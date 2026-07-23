// 比賽球員視覺：12 名幾何關節球員對映 sim actors（只讀 sim 狀態＋插值，絕不寫回）
// vow3d 路線：零模型檔（無 GLTF/骨架/mixer），角色由 geoCharacter 程式拼裝、
// 動畫由 geoAnimator 程序化驅動——載入零等待、軸向全掌控
import * as THREE from 'three';
import { SIM_DT } from '../sim/constants.js';
import { TEAM_SIDE, isFrontRow } from '../sim/rotation.js';
import { serverId } from '../sim/match.js';
import { createGeoCharacter, createGeoPool } from './geoCharacter.js';
import { createGeoAnimator } from './geoAnimator.js';

const OVERHAND_Y = 1.6; // 擊球高度高於此＝高手動作，低於＝低手墊球（表現層判定）
const TAG_COLORS = { A: '#6ee7ff', B: '#ff9d7a' };
// 頭上標籤＝排球標準角色縮寫（命名統一：廢除 P1–P6 泛稱）
const ROLE_TAG = { setter: 'S', outside: 'OH', middle: 'MB', opposite: 'OPP', libero: 'L' };

const TURN_K = 25; // 轉身收斂率（1/秒，指數衰減；排球轉身要快，慢了像背對球）
// 魚躍飛撲視覺（純表現，sim 不含位移）：沿朝向撲出一段＋身體前傾接近水平
const DIVE_RECOVER = 42;   // 同 sim TUNING.DIVE_RECOVER_TICKS（魚躍倒地恢復＝撲救動畫時長）
const DIVE_LUNGE = 1.35;   // 撲出水平距離（m）
const DIVE_TILT = 1.2;     // 撲出時身體前傾（rad，接近水平 1.57）
const DIVE_HOP = 0.22;     // 撲出微騰空（m，飛撲離地的弧）

export async function createMatchView(scene, quality, game, initialControlledId, forcePose = null) {
  let highlightId = initialControlledId;
  const castShadow = quality.shadowSize > 0;

  // InstancedMesh 池（每種幾何一池＝10 draw calls，取代每人 16 個獨立 Mesh）；
  // root 骨架不再加入 scene——它只是不可見的關節 Object3D 樹，逐幀由 sync() 手動
  // updateMatrixWorld 後讀 matrixWorld 寫進池（見下方 sync 尾端）
  const playerList = Object.values(game.players);
  const pool = createGeoPool(scene, castShadow, playerList.length);

  const units = {};
  for (const p of playerList) {
    const rig = createGeoCharacter(pool, p.id, p.teamId, p.height.current, p.currentRole === 'libero');
    rig.root.rotation.order = 'YXZ'; // 先朝向(y)再前傾(x)——魚躍飛撲沿朝向前方傾倒才正確
    rig.root.rotation.y = TEAM_SIDE[p.teamId] === 1 ? Math.PI : 0; // 面向球網
    units[p.id] = {
      rig,
      animator: createGeoAnimator(rig),
      yaw: rig.root.rotation.y,
      tag: makeTag(scene),
      tagText: '',
      tagY: p.height.current + 0.45,
    };
  }
  pool.finishColors();

  // 灰塵粒子池（跳躍落地/死球落點的塵土——夜賽聚光燈下的空氣感）
  const dust = createDust(scene);

  // 玩家操控者足下光圈（一眼找到自己；「這球歸你」時轉橘紅示警）
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.55, 40),
    new THREE.MeshBasicMaterial({ color: 0x6ee7ff, transparent: true, opacity: 0.85 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  scene.add(ring);
  let ringHot = false;

  // 比賽事件 → 姿勢觸發（表現層唯讀路由）
  function routeEvents(events, gameState) {
    for (const e of events) {
      const u = units[e.playerId];
      if (!u) continue;
      if (e.type === 'SERVE') {
        // 發球分式（07-24）：依本球式樣選動畫——跳發高跳全揮／飄浮站立推擊／穩定原樣
        const style = gameState.rally.serveStyle;
        u.animator.trigger(style === 'power' ? 'serveJump' : style === 'float' ? 'serveFloat' : 'serve');
      }
      else if (e.type === 'BLOCK_TOUCH') u.animator.trigger('block');
      else if (e.type === 'TOUCH') {
        if (e.kind === 'spike') u.animator.trigger('spike');
        else if (e.kind === 'set') u.animator.trigger('overhead');
        // kind==='dive'＝魚躍觸球：動畫由 sync 的 divedUntil 偵測負責（撲到/撲空都演），不走墊球
        else if (e.kind !== 'dive') u.animator.trigger(e.ballY >= OVERHAND_Y ? 'overhead' : 'bump');
      }
    }
    // 死球落點塵土（e.at＝球落地/犯規點）
    for (const e of events) {
      if (e.type === 'DEAD_BALL' && e.at) dust.burst(e.at.x, e.at.z, 10, 0.9);
    }
  }

  return {
    count: Object.keys(units).length,
    triggerPose(playerId, type) {
      units[playerId]?.animator.trigger(type);
    },
    setControlled(id) { highlightId = id; },
    setHot(hot) {
      if (hot === ringHot) return;
      ringHot = hot;
      ring.material.color.setHex(hot ? 0xff8c42 : 0x6ee7ff);
      ring.scale.setScalar(hot ? 1.35 : 1);
    },
    // alpha＝步間插值；dt＝畫面幀時間；frameEvents＝本幀 sim 事件（驅動姿勢）
    sync(gameState, alpha, dt, frameEvents = []) {
      routeEvents(frameEvents, gameState);
      for (const [id, u] of Object.entries(units)) {
        // 魚躍：偵測新倒地（divedUntil 剛跳到未來）→ 撲救動畫；撲到有 TOUCH、撲空無事件，
        // 都靠這裡演，修「按魚躍站著不動」bug（sim 端已倒地、缺的是視覺）
        const diveActor = gameState.actors[id];
        if (diveActor.divedUntil > gameState.tick && diveActor.divedUntil !== u.lastDived) {
          u.animator.trigger('dive');
        }
        u.lastDived = diveActor.divedUntil;
        // 舉手備戰：①攔網窗開著②對方進攻組織中且我在網前——攻擊方讀攔網看得到手牆
        let blockDuty = false;
        if (forcePose) {
          u.animator.setHold(forcePose);
        } else if (gameState.phase === 'serve' && serverId(gameState.match) === id
          && u.animator.isIdle()) {
          // 發球前持球預備（07-24 連貫性）：等哨/等面板期間捧球站位——
          // 發球瞬間直接銜接分式揮擊，不再「罰站→憑空揮手」
          u.animator.setHold('serveReady');
        } else {
          const teamB = gameState.players[id].teamId;
          const r = gameState.rally;
          const ready =
            gameState.phase === 'rally' &&
            r.possession && r.possession !== teamB && r.touches >= 1 &&
            isFrontRow(gameState.match.rotations[teamB], id) &&
            Math.abs(gameState.actors[id].z) < 2.2;
          blockDuty = gameState.actors[id].blockUntil >= gameState.tick || ready;
          u.animator.setHold(blockDuty ? 'block' : null);
        }
        const a = gameState.actors[id];
        const x = a.px + (a.x - a.px) * alpha;
        const z = a.pz + (a.z - a.pz) * alpha;

        // 頭上標籤：角色縮寫（S/OH/MB/OPP；玩家標「你·」前綴）
        const team0 = gameState.players[id].teamId;
        const text = (id === highlightId ? '你·' : '') +
          (ROLE_TAG[gameState.players[id].currentRole] ?? '?');
        if (text !== u.tagText) {
          u.tagText = text;
          drawTag(u.tag, text, TAG_COLORS[team0]);
        }
        u.tag.sprite.position.set(x, u.tagY, z);

        const vx = (a.x - a.px) / SIM_DT;
        const vz = (a.z - a.pz) / SIM_DT;
        const speed = Math.hypot(vx, vz);

        // 朝向（職責制）：攔網職責鎖面向網；其餘面向球；近身改面向來球方向
        const team = gameState.players[id].teamId;
        const netYaw = TEAM_SIDE[team] === 1 ? Math.PI : 0;
        let targetYaw = netYaw;
        if (gameState.phase === 'rally' && !blockDuty) {
          const b = gameState.ball;
          const bdx = b.x - x;
          const bdz = b.z - z;
          if (Math.hypot(bdx, bdz) > 1.1) {
            targetYaw = Math.atan2(bdx, bdz);
          } else {
            const bvx = b.x - b.px;
            const bvz = b.z - b.pz;
            targetYaw = Math.hypot(bvx, bvz) > 1e-4
              ? Math.atan2(-bvx, -bvz)
              : u.yaw;
          }
        }
        u.yaw += shortestArc(u.yaw, targetYaw) * (1 - Math.exp(-TURN_K * dt));

        const bodyY = u.animator.update(dt, speed);
        // 魚躍飛撲（純視覺）：dive 期間沿朝向前撲一段＋微騰空落地＋身體前傾接近水平——
        // sim 只有原地觸球＋倒地，往前撲的距離與傾倒全在這裡補（不寫回 sim）
        let diveX = 0; let diveZ = 0; let diveTilt = 0; let diveY = 0;
        if (a.divedUntil > gameState.tick) {
          const remain = a.divedUntil - gameState.tick; // 42→0
          const p = 1 - Math.max(0, remain) / DIVE_RECOVER; // 撲救進度 0→1
          // 爬起自然化（Sawmah 07-23：原「滑回與立起同時」＝站著溜冰＋線性回正＝殭屍彈起）：
          // 滑回提前且緩動——大半發生在身體仍前傾時（低姿爬行感）；前傾晚收尾、緩動回正
          const ease = (t) => t * t * (3 - 2 * t); // smoothstep：起緩收緩
          // 撲出位移三段：0-0.3 快速撲出、0.3-0.5 趴住、0.5-0.86 低姿爬回；0.86 後原地起身
          let lungeP;
          if (p < 0.3) lungeP = (p / 0.3) ** 0.6;
          else if (p < 0.5) lungeP = 1;
          else lungeP = 1 - ease(Math.min((p - 0.5) / 0.36, 1));
          diveX = Math.sin(u.yaw) * DIVE_LUNGE * lungeP;
          diveZ = Math.cos(u.yaw) * DIVE_LUNGE * lungeP;
          // 前傾三段：0-0.24 前撲、0.24-0.62 貼地、0.62-1 撐起回正（先爬後起，收尾放緩）
          let tiltP;
          if (p < 0.24) tiltP = p / 0.24;
          else if (p < 0.62) tiltP = 1;
          else tiltP = 1 - ease((p - 0.62) / 0.38);
          diveTilt = DIVE_TILT * tiltP;
          diveY = p < 0.4 ? DIVE_HOP * Math.sin((p / 0.4) * Math.PI) : 0; // 只撲出段微騰空、落地貼地
        }
        // 跳躍落地塵土：從空中回到地面的瞬間（含魚躍落地）
        const totalY = bodyY + diveY;
        if ((u.lastBodyY ?? 0) > 0.18 && totalY <= 0.03) dust.burst(x + diveX, z + diveZ, 8, 0.7);
        u.lastBodyY = totalY;
        u.rig.root.position.set(x + diveX, totalY, z + diveZ);
        u.rig.root.rotation.set(diveTilt, u.yaw, 0);

        // root 不在 scene 裡（無 Mesh 可畫），手動推一次 matrixWorld，
        // 再把各部件 slot 的世界矩陣寫進 InstancedMesh 池
        u.rig.root.updateMatrixWorld(true);
        for (const part of u.rig.parts) pool.writeMatrix(part, part.node.matrixWorld);

        if (id === highlightId) {
          ring.position.x = x;
          ring.position.z = z;
        }
      }
      pool.markDirty();
      dust.update(dt);
    },
  };
}

// ---- 灰塵粒子池（單一 Points、96 槽循環使用；死粒子藏到地下）----
function createDust(scene) {
  const N = 96;
  const pos = new Float32Array(N * 3).fill(-100);
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xb9a389, size: 0.09, transparent: true, opacity: 0.55,
    depthWrite: false,
  }));
  points.frustumCulled = false;
  scene.add(points);
  let cursor = 0;
  let h = 2166136261; // 決定論偽亂數（視覺層；不碰 sim rng）
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    return ((h >>> 0) % 1000) / 1000;
  };
  return {
    burst(x, z, n, power) {
      for (let k = 0; k < n; k += 1) {
        const i = cursor;
        cursor = (cursor + 1) % N;
        const ang = rnd() * Math.PI * 2;
        const sp = (0.4 + rnd() * 0.9) * power;
        pos[i * 3] = x; pos[i * 3 + 1] = 0.06; pos[i * 3 + 2] = z;
        vel[i * 3] = Math.cos(ang) * sp;
        vel[i * 3 + 1] = 0.8 + rnd() * 1.2 * power;
        vel[i * 3 + 2] = Math.sin(ang) * sp;
        life[i] = 0.4 + rnd() * 0.25;
      }
    },
    update(dt) {
      let alive = false;
      for (let i = 0; i < N; i += 1) {
        if (life[i] <= 0) continue;
        alive = true;
        life[i] -= dt;
        if (life[i] <= 0) { pos[i * 3 + 1] = -100; continue; }
        vel[i * 3 + 1] -= 4.5 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] = Math.max(0.02, pos[i * 3 + 1] + vel[i * 3 + 1] * dt);
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      if (alive) geo.attributes.position.needsUpdate = true;
    },
  };
}

function shortestArc(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---- 頭上標籤（canvas sprite）----

function makeTag(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 56;
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  sprite.scale.set(0.9, 0.4, 1);
  sprite.renderOrder = 5;
  scene.add(sprite);
  return { sprite, canvas, texture };
}

function drawTag(tag, text, color) {
  const ctx = tag.canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 56);
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(12,16,26,0.85)';
  ctx.strokeText(text, 64, 28);
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 28);
  tag.texture.needsUpdate = true;
}
