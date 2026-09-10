// Free Ball 擊球打擊反饋與頓幀系統（Hitstop、相機微震、觸覺震動）
import { createHaptics } from '../ui/haptics.js';

export function createFreeballJuice() {
  const haptics = createHaptics();

  let hitstopRemainingMs = 0;
  let shakeTimeRemaining = 0;
  let shakeDuration = 0.18;
  let shakeMagnitude = 0.08;

  // 動態 FOV 衝擊控制
  let currentFov = 55;
  const BASE_FOV = 55;

  const shakeOffset = { x: 0, y: 0, z: 0 };

  return {
    getBaseFov() {
      return BASE_FOV;
    },

    getCurrentFov() {
      return currentFov;
    },

    /**
     * 觸發 Perfect 擊球頓幀感（Hitstop）
     * @param {number} ms 凍結時長（毫秒，預設 38ms）
     */
    hitstop(ms = 38) {
      hitstopRemainingMs = ms;
    },

    /**
     * 觸發相機衝擊微震
     * @param {number} magnitude 振幅（公尺）
     * @param {number} duration 時長（秒）
     */
    shake(magnitude = 0.09, duration = 0.16) {
      shakeMagnitude = magnitude;
      shakeDuration = duration;
      shakeTimeRemaining = duration;
    },

    /**
     * 觸發動態 FOV Kick（視野驟張後彈性回縮）
     * @param {number} kickTo 目標展開角度（度，例如 63）
     */
    kickFov(kickTo = 63) {
      currentFov = kickTo;
    },

    /**
     * 觸發手機震動反饋
     * @param {'spike'|'dig'|'block'} kind 動作類型
     */
    vibrate(kind = 'spike') {
      haptics.buzz(kind);
    },

    /**
     * 複合震撼反饋：Perfect 扣殺時一鍵觸發 Hitstop + Shake + Vibrate + FOV Kick
     */
    impactPerfect() {
      this.hitstop(38);
      this.shake(0.12, 0.22);
      this.kickFov(63);
      this.vibrate('spike');
    },

    /**
     * 正面攔死反饋（Solid Roof Block）
     */
    impactRoofBlock() {
      this.hitstop(32);
      this.shake(0.15, 0.24);
      this.kickFov(60);
      this.vibrate('block');
    },

    /**
     * 擦手出界/偏折反饋（Tool / Graze）
     */
    impactTool() {
      this.shake(0.08, 0.16);
      this.vibrate('block');
    },

    /**
     * 自主完美接球反饋（Perfect Dig）
     */
    impactDig() {
      this.shake(0.04, 0.12);
      this.vibrate('dig');
    },

    /**
     * 每幀更新計算
     * @param {number} dtSec 秒
     * @returns {{ isFrozen: boolean, shakeOffset: {x: number, y: number, z: number}, fov: number }}
     */
    update(dtSec) {
      // 1. Hitstop 結算
      let isFrozen = false;
      if (hitstopRemainingMs > 0) {
        hitstopRemainingMs -= dtSec * 1000;
        isFrozen = true;
      }

      // 2. Camera Shake 結算
      shakeOffset.x = 0;
      shakeOffset.y = 0;
      shakeOffset.z = 0;

      if (shakeTimeRemaining > 0) {
        shakeTimeRemaining -= dtSec;
        const progress = Math.max(0, shakeTimeRemaining / shakeDuration);
        const currentMag = shakeMagnitude * progress;

        // 高頻衰減隨機抖動
        shakeOffset.x = (Math.random() * 2 - 1) * currentMag;
        shakeOffset.y = (Math.random() * 2 - 1) * currentMag * 0.7;
        shakeOffset.z = (Math.random() * 2 - 1) * currentMag;
      }

      // 3. FOV Kick 平滑彈性回縮至 BASE_FOV
      if (Math.abs(currentFov - BASE_FOV) > 0.05) {
        currentFov += (BASE_FOV - currentFov) * (1 - Math.exp(-12 * dtSec));
      } else {
        currentFov = BASE_FOV;
      }

      return { isFrozen, shakeOffset, fov: currentFov };
    },
  };
}

