// H1 五動作輸入（輸入層）：鍵盤/滑鼠＋觸控 → 與 AI 同型的 Intent，同一條管線進 sim
// 統一向量邏輯：按下＝蓄力起點與視線(gaze)、拖曳＝瞄準、放開＝出手(action+aim+timing)
// 接發＝走位到位自動觸發（一傳是反射不是瞄準）；細部手感靠試玩調參
import * as THREE from 'three';
import { createIntent } from '../sim/intent.js';
import { serverId } from '../sim/match.js';
import { TEAM_SIDE, isFrontRow, localToWorld } from '../sim/rotation.js';
import { standingReach } from '../sim/player.js';
import { TUNING } from '../sim/game.js';

const CHARGE_MS = 600;       // 蓄力到滿的毫秒數（timing 質量曲線，H1 可調）
const JOYSTICK_RADIUS = 64;  // 虛擬搖桿最大半徑（px）
const AUTO_RECEIVE_DIST = TUNING.REACH_RADIUS * 0.9;

export function createMatchControls(domElement, camera, playerId, rig) {
  const keys = new Set();
  let joystick = null;              // { pointerId, ox, oy, dx, dy }
  let charge = null;                // { pointerId, startedAt, gaze }
  let queuedAction = null;          // { action, aim, gaze, timing }
  let pointerNdc = { x: 0, y: 0 };

  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  domElement.addEventListener('pointerdown', (e) => {
    // 觸控左 40% 螢幕＝走位搖桿；其餘（含滑鼠）＝動作指標
    if (e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.4 && !joystick) {
      joystick = { pointerId: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
      return;
    }
    if (charge) return;
    updateNdc(e);
    charge = { pointerId: e.pointerId, startedAt: performance.now(), gaze: null };
  });

  domElement.addEventListener('pointermove', (e) => {
    if (joystick && e.pointerId === joystick.pointerId) {
      joystick.dx = e.clientX - joystick.ox;
      joystick.dy = e.clientY - joystick.oy;
      return;
    }
    updateNdc(e);
  });

  const endPointer = (e) => {
    if (joystick && e.pointerId === joystick.pointerId) {
      joystick = null;
      return;
    }
    if (charge && e.pointerId === charge.pointerId) {
      updateNdc(e);
      const held = performance.now() - charge.startedAt;
      queuedAction = {
        timing: Math.min(held / CHARGE_MS, 1),
        gaze: charge.gaze,             // 看哪＝蓄力期間的視線落點（進一人稱後由 rig 補）
        aimNdc: { ...pointerNdc },     // 往哪打＝放開瞬間的指向（collect 時換算場地座標）
      };
      charge = null;
    }
  };
  domElement.addEventListener('pointerup', endPointer);
  domElement.addEventListener('pointercancel', endPointer);

  function updateNdc(e) {
    pointerNdc = {
      x: (e.clientX / window.innerWidth) * 2 - 1,
      y: -(e.clientY / window.innerHeight) * 2 + 1,
    };
    rig.setLook(pointerNdc.x, pointerNdc.y);
  }

  // 指標 → 地面座標（瞄準用）
  function groundPoint(ndc) {
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, hit)) return { x: hit.x, z: hit.z };
    return null;
  }

  // 依比賽狀態決定這一下是哪個動作（玩家不用記按鍵表，情境即語意）
  function contextAction(game) {
    const me = game.players[playerId];
    if (game.phase === 'serve') {
      return serverId(game.match) === playerId ? 'serve' : null;
    }
    if (game.phase !== 'rally') return null;
    const r = game.rally;
    if (r.possession === me.teamId && r.touches === 2) return 'spike';
    if (r.possession === me.teamId && r.touches === 1) return 'set';
    const a = game.actors[playerId];
    const nearNet = Math.abs(a.z) < 3.2;
    if (r.possession && r.possession !== me.teamId &&
        isFrontRow(game.match.rotations[me.teamId], playerId) && nearNet) {
      return 'block';
    }
    return 'receive';
  }

  return {
    // 主迴圈每個固定步長呼叫；輸出與 AI 同型的 Intent（sim 不知來源）
    collect(game) {
      const tick = game.tick;
      const me = game.players[playerId];
      const a = game.actors[playerId];
      const move = readMove(keys, joystick, TEAM_SIDE[me.teamId]);

      let action = null;
      let aim = { x: 0, z: -6.5 * TEAM_SIDE[me.teamId] }; // 預設瞄對方深區
      let gaze = null;
      let timing = 1;

      if (queuedAction) {
        action = contextAction(game);
        const ground = groundPoint(queuedAction.aimNdc);
        if (ground) aim = ground;
        gaze = queuedAction.gaze ?? rig.gazePoint(game);
        timing = queuedAction.timing;
        queuedAction = null;
      } else if (charge && rig.getMode() === 'first' && !charge.gaze) {
        // 一人稱蓄力中：按下當下的視線＝gaze（看哪），之後拖到別處放開＝aim（打哪）
        charge.gaze = rig.gazePoint(game);
      } else if (game.phase === 'rally') {
        // 到位自動接（接發是反射）：球進可及範圍且下墜、輪到我方可觸 → 自動墊往舉球點
        const r = game.rally;
        const canTouch = r.touches < 3 &&
          !(r.profile === 'serve' && r.lastTouchTeam === me.teamId);
        const b = game.ball;
        const near = Math.hypot(b.x - a.x, b.z - a.z) <= AUTO_RECEIVE_DIST;
        if (canTouch && near && b.vy < 0 && b.y <= standingReach(me) + 0.3 &&
            r.lastToucherId !== playerId && r.touches === 0) {
          action = 'receive';
          aim = localToWorld(me.teamId, 1.2, 1.2); // 墊向我方舉球點
        }
      }

      return [createIntent({ playerId, tick, move, action, aim, gaze, timing })];
    },
    isCharging() { return charge !== null; },
  };
}

// 走位向量：WASD/方向鍵 或 觸控搖桿 → 世界座標方向（W＝朝網）
function readMove(keys, joystick, side) {
  let x = 0;
  let z = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (side === -1) { x = -x; z = -z; } // B 隊視角鏡像（Phase 1 玩家固定 A 隊，預留）

  if (joystick) {
    x = joystick.dx / JOYSTICK_RADIUS;
    z = joystick.dy / JOYSTICK_RADIUS;
    if (side === -1) { x = -x; z = -z; }
  }
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  return { x, z };
}
