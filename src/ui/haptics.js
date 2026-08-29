// 大作感二卷 批2（2026-08-30）：手機震動——打擊感分級對應 navigator.vibrate。
// 映射是純函式（可測）；createHaptics 把三道閘（偏好開關/裝置支援/呼叫失敗）包在
// buzz 裡，呼叫端一行即用。iOS Safari 沒有 vibrate＝永遠靜默，不是錯誤路徑。
import { get as getAudioPrefs } from './audioPrefs.js';

// 單位 ms；[震,停,震,…] 慣例同 Vibration API。全表【試玩必調】
export const VIBRATION_PATTERNS = {
  spike: [40],                      // 重扣（≥HEAVY_SPIKE_POWER_MIN 才觸發，輕吊不震）
  block: [25],                      // 攔網觸球
  dig: [20, 40, 30],                // 重扣被救起（丙1 定格的觸覺版）
  dive: [15, 30, 45],               // 神救球慢動作
  champion: [60, 80, 60, 80, 160],  // 奪冠慶祝開場
};

export function vibrationFor(kind) {
  return VIBRATION_PATTERNS[kind] ?? null;
}

// prefs/nav 可注入（測試用）；預設吃 audioPrefs 與全域 navigator
export function createHaptics({ prefs = getAudioPrefs, nav } = {}) {
  const theNav = nav !== undefined ? nav : (typeof navigator !== 'undefined' ? navigator : null);
  return {
    buzz(kind) {
      const pattern = vibrationFor(kind);
      if (!pattern) return false;
      if (prefs().vibrate === false) return false; // 預設開（DEFAULT.vibrate=true）
      if (!theNav || typeof theNav.vibrate !== 'function') return false;
      try {
        return Boolean(theNav.vibrate(pattern));
      } catch {
        return false; // 權限/平台怪癖＝這一下不震，永不往外丟
      }
    },
  };
}
