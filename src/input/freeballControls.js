// Free Ball 風格移動端觸控與街機控制器（Dual-Thumb Context Controller）
// 左半螢幕：動態浮動搖桿；右半螢幕：情境動作鈕（地面起跳 → 空中扣殺）＋拖曳瞄準
import { evaluateTiming, TIMING_GRADE, calculateSpikeVelocity } from '../sim/physicsMath.js';

export function createFreeballControls(domElement, camera) {
  // 搖桿狀態
  let joystick = null; // { pointerId, ox, oy, dx, dy }
  const JOYSTICK_MAX_RADIUS = 64;
  const moveVector = { x: 0, z: 0 };

  // 鍵盤狀態（桌機測試相容）
  const keys = new Set();

  // 動作按鈕狀態
  let actionPointerId = null;
  let actionDrag = { dx: 0, dy: 0, startX: 0, startY: 0 };
  let isDraggingAction = false;
  let lastSnappedShotType = null;

  // 玩家當前狀態
  let isAirborne = false;
  let jumpStartTime = 0;
  let jumpDuration = 0.75; // 滯空時間約 0.75 秒
  let jumpApexY = 1.1;     // 額外起跳高度（公尺）
  let currentJumpHeight = 0;

  // 最近一次擊球結果（供 HUD 與反饋顯示）
  let lastHitResult = {
    grade: TIMING_GRADE.GOOD,
    score: 0.8,
    speed: 18,
    time: 0,
  };

  // 輕微觸覺震動（方向切換卡榫感）
  function triggerSnapHaptic() {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(8);
      }
    } catch {
      // 靜默處理
    }
  }

  // 監聽鍵盤
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.add('up');
    if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.add('down');
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.add('left');
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.add('right');

    if ((e.code === 'Space' || e.code === 'KeyJ') && !e.repeat) {
      if (!isAirborne) {
        handleActionButtonPress('ACTION');
      } else {
        if (keys.has('left')) handleActionButtonPress('CROSS_LEFT');
        else if (keys.has('right')) handleActionButtonPress('CROSS_RIGHT');
        else if (keys.has('down')) handleActionButtonPress('LINE');
        else if (keys.has('up')) handleActionButtonPress('TIP');
        else handleActionButtonPress('SMASH');
      }
    }
    if ((e.code === 'KeyK' || e.code === 'KeyT') && !e.repeat) {
      handleActionButtonPress(!isAirborne ? 'ACTION' : 'TIP');
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.delete('up');
    if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.delete('down');
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.delete('left');
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.delete('right');
  });

  // 監聽指標（手機觸控與滑鼠）
  domElement.addEventListener('pointerdown', (e) => {
    const isLeftHalf = e.clientX < window.innerWidth * 0.45;
    if (isLeftHalf && !joystick) {
      // 左側：浮動搖桿出現在手指觸碰位置
      joystick = {
        pointerId: e.pointerId,
        ox: e.clientX,
        oy: e.clientY,
        dx: 0,
        dy: 0,
      };
      return;
    }

    const isRightHalf = e.clientX >= window.innerWidth * 0.45;
    if (isRightHalf && actionPointerId === null) {
      actionPointerId = e.pointerId;
      actionDrag = { dx: 0, dy: 0, startX: e.clientX, startY: e.clientY };
      isDraggingAction = true;
      lastSnappedShotType = isAirborne ? 'LINE' : null;

      // 地面動作（起跳或墊球）：零延遲立即觸發！
      if (!isAirborne) {
        handleActionButtonPress('ACTION');
      }
    }
  });

  domElement.addEventListener('pointermove', (e) => {
    if (joystick && e.pointerId === joystick.pointerId) {
      const rawDx = e.clientX - joystick.ox;
      const rawDy = e.clientY - joystick.oy;
      const dist = Math.hypot(rawDx, rawDy);
      const clampedDist = Math.min(dist, JOYSTICK_MAX_RADIUS);
      const angle = Math.atan2(rawDy, rawDx);

      joystick.dx = Math.cos(angle) * clampedDist;
      joystick.dy = Math.sin(angle) * clampedDist;
      return;
    }

    if (actionPointerId !== null && e.pointerId === actionPointerId) {
      actionDrag.dx = e.clientX - actionDrag.startX;
      actionDrag.dy = e.clientY - actionDrag.startY;

      if (isAirborne) {
        const currentShot = resolveAirActionType(actionDrag.dx, actionDrag.dy);
        if (currentShot !== lastSnappedShotType) {
          lastSnappedShotType = currentShot;
          triggerSnapHaptic();
        }

        // 空中蓄力時：若手指劃動幅度達到快速甩擊閾值（Flick），可提前釋放！
        if (Math.hypot(actionDrag.dx, actionDrag.dy) >= 68) {
          finishAirAction();
        }
      }
    }
  });

  /**
   * 手勢判定：上滑為單手吊球，下滑區分直線與左右斜線重扣
   */
  function resolveAirActionType(dx, dy) {
    const dist = Math.hypot(dx, dy);
    // 輕點或小於死區（<12px）：預設為重扣
    if (dist < 12) return 'SMASH';

    // 1. 上滑（向上劃動）：單手輕吊球 (TIP)
    if (dy < -16) {
      return 'TIP';
    }

    // 2. 下滑區分：直線重扣 vs 左右斜線重扣
    if (dy > 12) {
      if (dx < -16) return 'CROSS_LEFT';  // 左下劃動：銳利左斜線
      if (dx > 16) return 'CROSS_RIGHT'; // 右下劃動：銳利右斜線
      return 'LINE';                     // 正向垂直下滑：直線重扣
    }

    // 3. 水平甩擊（左右劃動）
    if (dx < -20) return 'CROSS_LEFT';
    if (dx > 20) return 'CROSS_RIGHT';

    return 'LINE';
  }

  function finishAirAction() {
    if (!actionPointerId) return;
    const type = resolveAirActionType(actionDrag.dx, actionDrag.dy);
    handleActionButtonPress(type);
    actionPointerId = null;
    isDraggingAction = false;
    lastSnappedShotType = null;
  }

  const endPointer = (e) => {
    if (joystick && e.pointerId === joystick.pointerId) {
      joystick = null;
      moveVector.x = 0;
      moveVector.z = 0;
    }
    if (actionPointerId !== null && e.pointerId === actionPointerId) {
      if (isAirborne) {
        finishAirAction();
      } else {
        actionPointerId = null;
        isDraggingAction = false;
        lastSnappedShotType = null;
      }
    }
  };

  domElement.addEventListener('pointerup', endPointer);
  domElement.addEventListener('pointercancel', endPointer);

  // 動作按鈕觸發核心
  let onActionTriggerCallback = null;

  function handleActionButtonPress(typeOverride = null) {
    if (onActionTriggerCallback) {
      let actionType = typeOverride;
      if (!actionType) {
        if (!isAirborne) actionType = 'ACTION';
        else actionType = resolveAirActionType(actionDrag.dx, actionDrag.dy);
      }
      onActionTriggerCallback({
        isAirborne,
        dragAim: { ...actionDrag },
        actionType,
      });
    }
  }

  return {
    onAction(cb) {
      onActionTriggerCallback = cb;
    },

    triggerAction(type) {
      handleActionButtonPress(type);
    },

    setAirborne(airborne, height = 0) {
      isAirborne = airborne;
      currentJumpHeight = height;
    },

    isAirborne() {
      return isAirborne;
    },

    setLastHitResult(res) {
      lastHitResult = res;
    },

    getLastHitResult() {
      return lastHitResult;
    },

    /**
     * 獲取搖桿輸入向量（歸一化）
     */
    getMoveInput() {
      let x = 0;
      let z = 0;

      if (joystick) {
        x = joystick.dx / JOYSTICK_MAX_RADIUS;
        z = joystick.dy / JOYSTICK_MAX_RADIUS;
      }

      if (keys.has('up')) z -= 1;
      if (keys.has('down')) z += 1;
      if (keys.has('left')) x -= 1;
      if (keys.has('right')) x += 1;

      const len = Math.hypot(x, z);
      if (len > 1) {
        x /= len;
        z /= len;
      }

      moveVector.x = x;
      moveVector.z = z;
      return moveVector;
    },

    /**
     * 獲取拖曳瞄準方向（用於扣殺朝向）
     */
    getAimDirection() {
      const len = Math.hypot(actionDrag.dx, actionDrag.dy);
      if (len < 10) return null; // 死區
      return {
        x: actionDrag.dx / len,
        z: -actionDrag.dy / len, // 向上拖曳為向前（-z）
      };
    },

    /**
     * 獲取當前瞄準線路與手勢預測（供 HUD 與指示圈使用）
     */
    getAimState() {
      const isDragging = isDraggingAction && isAirborne;
      const shotType = isDragging ? resolveAirActionType(actionDrag.dx, actionDrag.dy) : 'LINE';
      return {
        isDragging,
        dx: actionDrag.dx,
        dy: actionDrag.dy,
        shotType,
      };
    },

    /**
     * 獲取手機端手勢輪盤（Aim Compass）狀態
     */
    getAimCompass() {
      const isDragging = isDraggingAction && isAirborne;
      const dist = Math.hypot(actionDrag.dx, actionDrag.dy);
      const shotType = resolveAirActionType(actionDrag.dx, actionDrag.dy);
      return {
        active: isDragging,
        startX: actionDrag.startX || 0,
        startY: actionDrag.startY || 0,
        currX: (actionDrag.startX || 0) + actionDrag.dx,
        currY: (actionDrag.startY || 0) + actionDrag.dy,
        dx: actionDrag.dx,
        dy: actionDrag.dy,
        dist,
        shotType,
      };
    },

    /**
     * UI 渲染狀態
     */
    getUiState() {
      return {
        joystick: joystick
          ? { active: true, ox: joystick.ox, oy: joystick.oy, x: joystick.ox + joystick.dx, y: joystick.oy + joystick.dy }
          : { active: false },
        actionState: isAirborne ? 'SPIKE' : 'JUMP',
      };
    },
  };
}
