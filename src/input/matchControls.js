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
const BUFFER_TICKS = 36;     // 出手緩衝：放開後持續嘗試 0.6 秒（球一進可及範圍就出手）
const SALVAGE_Y = 2.15;      // 第三擊球掉到此高度以下＝錯過扣球窗，保底送安全球
const JUMP_WINDOW_MS = 750;  // 起跳滯空窗：按下＝起跳，須在窗內放開揮臂才是扣球
const CALL_WINDOW_MS = 1500; // 喊球有效窗：喊聲維持這段時間，期間的來球歸你

export function createMatchControls(domElement, camera, initialPlayerId, rig) {
  let playerId = initialPlayerId; // 全隊輪控：main 依球權切換（setPlayerId）
  const keys = new Set();
  let joystick = null;              // { pointerId, ox, oy, dx, dy }
  let charge = null;                // { pointerId, startedAt, gaze }
  let queuedAction = null;          // { action, aim, gaze, timing }
  let pointerNdc = { x: 0, y: 0 };
  let pointerPx = { x: 0, y: 0 };   // 螢幕像素座標（觸控 UI 疊層用）
  let jumpSignal = false;           // 本次按下觸發了起跳（main 轉給表現層播 windup）
  let jumpStartedAt = 0;
  let blockSignal = false;          // 本次出手是攔網（main 轉給表現層立即播跳攔）
  let callAt = -Infinity;           // 喊球時刻（空白鍵／喊球鈕）

  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      callAt = performance.now(); // 空白鍵＝喊球（這球我的）
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyJ' && !e.repeat) { beginCharge('key'); return; } // J＝主動作蓄力
    if (e.code === 'KeyK' && !e.repeat) { blockTap(); return; }         // K＝攔網
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyJ' && charge?.pointerId === 'key') { releaseCharge(); return; }
    keys.delete(e.code);
  });
  window.addEventListener('blur', () => keys.clear());

  // 攔網：一點即出（獨立按鈕/K 鍵；不經蓄力）
  function blockTap() {
    queuedAction = {
      timing: 1, gaze: null, aimNdc: null, aimVec: null,
      forceAction: 'block', expiresTick: null, jumpAt: null,
      releasedAt: performance.now(),
    };
    blockSignal = true;
  }

  let lastGame = null; // pointer 事件在 collect 之外發生，需要最近一次的比賽狀態判情境

  // 開始蓄力（指標路徑與按鈕路徑共用；扣球情境按下＝起跳）
  function beginCharge(source) {
    if (charge) return;
    charge = {
      pointerId: source, startedAt: performance.now(),
      gaze: null, jumpAt: null,
      btnDrag: source === 'button' ? { dx: 0, dy: 0 } : null,
    };
    if (lastGame && contextAction(lastGame) === 'spike') {
      charge.jumpAt = performance.now();
      jumpSignal = true;
      jumpStartedAt = charge.jumpAt;
    }
  }

  // 結束蓄力 → 出手排queue（aimVec＝按鈕拖曳方向；aimNdc＝球場指標）
  function releaseCharge() {
    if (!charge) return;
    const held = performance.now() - charge.startedAt;
    const drag = charge.btnDrag;
    queuedAction = {
      timing: Math.min(held / CHARGE_MS, 1),
      gaze: charge.gaze,
      aimNdc: drag ? null : { ...pointerNdc },
      aimVec: drag && Math.hypot(drag.dx, drag.dy) > 14 ? { ...drag } : null,
      expiresTick: null,
      jumpAt: charge.jumpAt,
      releasedAt: performance.now(),
    };
    charge = null;
  }

  domElement.addEventListener('pointerdown', (e) => {
    // 觸控：左 40% 螢幕＝走位搖桿；其餘不做事（出手一律走右側按鈕，防誤觸）
    if (e.pointerType === 'touch') {
      if (e.clientX < window.innerWidth * 0.4 && !joystick) {
        joystick = { pointerId: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
      }
      return;
    }
    // 滑鼠：球場指標瞄準＋蓄力（桌機仍可用滑鼠玩）
    updateNdc(e);
    if (!charge) {
      beginCharge(e.pointerId);
    }
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
      releaseCharge();
    }
  };
  domElement.addEventListener('pointerup', endPointer);
  domElement.addEventListener('pointercancel', endPointer);

  function updateNdc(e) {
    pointerPx = { x: e.clientX, y: e.clientY };
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
    const nearNet = Math.abs(a.z) < 4.2; // 前區＋一步內都可起攔（手機容錯）
    if (r.possession && r.possession !== me.teamId &&
        isFrontRow(game.match.rotations[me.teamId], playerId) && nearNet) {
      return 'block';
    }
    return 'receive';
  }

  return {
    // 主迴圈每個固定步長呼叫；輸出與 AI 同型的 Intent（sim 不知來源）
    // aiState：唯讀參考 AI 協調層的呼叫鎖定（誰的球）與攻擊手選擇，做輔助判斷
    collect(game, aiState = null) {
      lastGame = game;
      const tick = game.tick;
      const me = game.players[playerId];
      const a = game.actors[playerId];
      const move = readMove(keys, joystick, TEAM_SIDE[me.teamId]);

      let action = null;
      let aim = { x: 0, z: -6.5 * TEAM_SIDE[me.teamId] }; // 預設瞄對方深區
      let gaze = null;
      let timing = 1;

      if (queuedAction) {
        // 出手緩衝：放開後持續投遞到成功（onEvents 清除）或逾時——按了就會打
        if (queuedAction.expiresTick === null) {
          queuedAction.expiresTick = tick + BUFFER_TICKS;
        }
        action = queuedAction.forceAction ?? contextAction(game);
        if (action === 'block' && !queuedAction.forceAction) blockSignal = true;
        // 起跳時機窗：沒起跳或滯空已過就不能扣——降級成往瞄準點送安全球
        if (action === 'spike') {
          const okWindow =
            queuedAction.jumpAt !== null &&
            queuedAction.releasedAt - queuedAction.jumpAt <= JUMP_WINDOW_MS;
          if (!okWindow) action = 'receive';
        }
        if (queuedAction.aimVec) {
          // 按鈕拖曳瞄準：螢幕向量→場地方向（上＝朝對場、右＝+x），距離隨拖曳長度 3–9m
          const d = queuedAction.aimVec;
          const len = Math.hypot(d.dx, d.dy) || 1;
          const dist = 3 + (Math.min(len, 130) / 130) * 6;
          aim = { x: a.x + (d.dx / len) * dist, z: a.z + (d.dy / len) * dist };
        } else if (queuedAction.aimNdc) {
          const ground = groundPoint(queuedAction.aimNdc);
          if (ground) aim = ground;
        }
        gaze = queuedAction.gaze ?? rig.gazePoint(game);
        timing = queuedAction.timing;
        // 發球等哨音沒有時限；其他動作逾時作廢
        const waitingServe = game.phase === 'serve' && action === 'serve';
        if (!waitingServe && tick >= queuedAction.expiresTick) queuedAction = null;
      } else if (charge && rig.getMode() === 'first' && !charge.gaze) {
        // 一人稱蓄力中：按下當下的視線＝gaze（看哪），之後拖到別處放開＝aim（打哪）
        charge.gaze = rig.gazePoint(game);
      } else if (game.phase === 'rally' && !charge) {
        // 自動輔助（玩家沒出手時的反射與保底；主動操作永遠優先）
        const r = game.rally;
        const b = game.ball;
        const canTouch = r.touches < 3 &&
          !(r.profile === 'serve' && r.lastTouchTeam === me.teamId) &&
          r.lastToucherId !== playerId;
        const near = Math.hypot(b.x - a.x, b.z - a.z) <= AUTO_RECEIVE_DIST;
        const reachable = near && b.vy < 0 && b.y <= standingReach(me) + 0.3;
        const claimedToMe = aiState?.claimId === playerId;
        if (canTouch && reachable && r.touches === 0) {
          // 到位自動接（一傳是反射不是瞄準）
          action = 'receive';
          aim = localToWorld(me.teamId, 1.2, 1.2);
        } else if (canTouch && reachable && claimedToMe && r.touches === 1) {
          // 這球歸你的二傳保底：自動舉給攻擊手
          action = 'set';
          const atk = aiState?.attackerId && game.actors[aiState.attackerId];
          const lane = atk ? -TEAM_SIDE[me.teamId] * atk.x : 2;
          aim = localToWorld(me.teamId, lane, 1.3);
        } else if (canTouch && reachable && claimedToMe && r.touches === 2 &&
            b.y < SALVAGE_Y) {
          // 錯過扣球窗的保底：送安全球過網（主動跳扣永遠更強）
          action = 'receive';
          aim = localToWorld(me.teamId === 'A' ? 'B' : 'A', 0, 6.5);
        }
      }

      return [createIntent({ playerId, tick, move, action, aim, gaze, timing })];
    },
    // 出手成功（sim 發出我的觸球/發球事件）→ 清掉緩衝
    onEvents(events) {
      if (!queuedAction) return;
      for (const e of events) {
        if ((e.type === 'TOUCH' || e.type === 'SERVE') && e.playerId === playerId) {
          queuedAction = null;
          return;
        }
      }
    },
    isCharging() { return charge !== null; },
    // 全隊輪控：切換受控球員（清掉舊人的蓄力/緩衝，避免指令錯掛）
    setPlayerId(id) {
      if (id === playerId) return;
      playerId = id;
      queuedAction = null;
      charge = null;
      jumpSignal = false;
      blockSignal = false;
    },
    getPlayerId() { return playerId; },
    // NBA2K 式按鈕路徑（actionButtons UI 呼叫）
    beginAction() { beginCharge('button'); },
    dragAction(dx, dy) { if (charge?.btnDrag) charge.btnDrag = { dx, dy }; },
    endAction() { if (charge?.btnDrag) releaseCharge(); },
    pressBlock() { blockTap(); },
    // 當前情境動作（按鈕標籤用）：'serve'|'spike'|'set'|'block'|'receive'|null
    currentContext() { return lastGame ? contextAction(lastGame) : null; },
    // 喊球（螢幕鈕呼叫；空白鍵走 keydown）
    call() { callAt = performance.now(); },
    isCalling() { return performance.now() - callAt < CALL_WINDOW_MS; },
    // 玩家剛按下起跳（一次性訊號；main 轉給表現層播 windup 跳躍）
    consumeJumpSignal() {
      const s = jumpSignal;
      jumpSignal = false;
      return s;
    },
    consumeBlockSignal() {
      const s = blockSignal;
      blockSignal = false;
      return s;
    },

    // 觸控 UI 疊層讀這裡畫搖桿/蓄力圈；render 層讀 aim 畫地面瞄準標記
    uiState() {
      return {
        joystick: joystick ? { ...joystick } : null,
        charge: charge
          ? {
            x: pointerPx.x, y: pointerPx.y,
            progress: Math.min((performance.now() - charge.startedAt) / CHARGE_MS, 1),
          }
          : null,
      };
    },
    currentAimPoint() {
      return charge ? groundPoint(pointerNdc) : null;
    },
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
