// 比賽球員視覺：12 名幾何關節球員對映 sim actors（只讀 sim 狀態＋插值，絕不寫回）
// vow3d 路線：零模型檔（無 GLTF/骨架/mixer），角色由 geoCharacter 程式拼裝、
// 動畫由 geoAnimator 程序化驅動——載入零等待、軸向全掌控
import * as THREE from 'three';
import { SIM_DT } from '../sim/constants.js';
import { TEAM_SIDE, isFrontRow } from '../sim/rotation.js';
import { createGeoCharacter } from './geoCharacter.js';
import { createGeoAnimator } from './geoAnimator.js';

const OVERHAND_Y = 1.6; // 擊球高度高於此＝高手動作，低於＝低手墊球（表現層判定）
const TAG_COLORS = { A: '#6ee7ff', B: '#ff9d7a' };
// 頭上標籤＝排球標準角色縮寫（命名統一：廢除 P1–P6 泛稱）
const ROLE_TAG = { setter: 'S', outside: 'OH', middle: 'MB', opposite: 'OPP', libero: 'L' };

const TURN_K = 25; // 轉身收斂率（1/秒，指數衰減；排球轉身要快，慢了像背對球）

export async function createMatchView(scene, quality, game, initialControlledId, forcePose = null) {
  let highlightId = initialControlledId;
  const castShadow = quality.shadowSize > 0;

  const units = {};
  for (const p of Object.values(game.players)) {
    const rig = createGeoCharacter(p.id, p.teamId, p.height.current, castShadow);
    rig.root.rotation.y = TEAM_SIDE[p.teamId] === 1 ? Math.PI : 0; // 面向球網
    scene.add(rig.root);
    units[p.id] = {
      rig,
      animator: createGeoAnimator(rig),
      yaw: rig.root.rotation.y,
      tag: makeTag(scene),
      tagText: '',
      tagY: p.height.current + 0.45,
    };
  }

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
  function routeEvents(events) {
    for (const e of events) {
      const u = units[e.playerId];
      if (!u) continue;
      if (e.type === 'SERVE') u.animator.trigger('serve');
      else if (e.type === 'BLOCK_TOUCH') u.animator.trigger('block');
      else if (e.type === 'TOUCH') {
        if (e.kind === 'spike') u.animator.trigger('spike');
        else if (e.kind === 'set') u.animator.trigger('overhead');
        else u.animator.trigger(e.ballY >= OVERHAND_Y ? 'overhead' : 'bump');
      }
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
      routeEvents(frameEvents);
      for (const [id, u] of Object.entries(units)) {
        // 舉手備戰：①攔網窗開著②對方進攻組織中且我在網前——攻擊方讀攔網看得到手牆
        let blockDuty = false;
        if (forcePose) {
          u.animator.setHold(forcePose);
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
        u.rig.root.position.set(x, bodyY, z);
        u.rig.root.rotation.y = u.yaw;

        if (id === highlightId) {
          ring.position.x = x;
          ring.position.z = z;
        }
      }
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
