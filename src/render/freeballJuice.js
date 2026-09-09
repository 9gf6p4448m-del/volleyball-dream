// Free Ball 擊球打擊反饋與頓幀系統（Hitstop、相機微震、觸覺震動）
import { createHaptics } from '../ui/haptics.js';

export function createFreeballJuice() {
  const haptics = createHaptics();

  let hitstopRemainingMs = 0;
  let shakeTimeRemaining = 0;
  let shakeDuration = 0.18;
  let shakeMagnitude = 0.08;

  const shakeOffset = { x: 0, y: 0, z: 0 };

  return {
    /**
     * 觸發 Perfect 擊球頓幀感（Hitstop）
     * @param {number} ms 凍結時長（毫秒，預設 35ms）
     */
    hitstop(ms = 35) {
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
     * 觸發手機震動反饋
     * @param {'spike'|'dig'|'block'} kind 動作類型
     */
    vibrate(kind = 'spike') {
      haptics.buzz(kind);
    },

    /**
     * 複合震撼反饋：Perfect 扣殺時一鍵觸發 Hitstop + Shake + Vibrate
     */
    impactPerfect() {
      this.hitstop(38);
      this.shake(0.12, 0.2);
      this.vibrate('spike');
    },

    /**
     * 每幀更新計算
     * @param {number} dtDelta 毫秒或秒（由呼叫端傳入）
     * @returns {{ isFrozen: boolean, shakeOffset: {x: number, y: number, z: number} }}
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

      return { isFrozen, shakeOffset };
    },
  };
}
