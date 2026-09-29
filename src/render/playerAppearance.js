// 進賽場卷 2A：球員外觀（幾何／寫實）與面數設定——單一函式決定（B1/B8(a)）。
// 架構鐵律②不自我降級：這裡刻意不吃 performance.now／FPS 量測，輸入只有 localStorage
// 設定值與 URL 參數——同一組輸入，不論呼叫時的時鐘或裝置效能，恆回同一個輸出。
// 面數預設 5k（2026-09-29 使用者裁定，docs/kickoffs/real-skin-acceptance.md R14：CPU 蒙皮在手機上 20k 撐不住）；
// 20k 只能靠使用者手動帶 URL 的 &faces=20k——由使用者決定，不是程式自動偵測。
//
// 單鍵持久化寫法比照 src/ui/presentation.js 的 PRESENTATION_PREF_KEY 慣例。
export const APPEARANCE_PREF_KEY = 'vd-player-appearance';

export function loadAppearancePref(storage) {
  try {
    return storage?.getItem?.(APPEARANCE_PREF_KEY) === 'real' ? 'real' : 'geo';
  } catch { return 'geo'; }
}

export function saveAppearancePref(storage, pref) {
  try { storage?.setItem?.(APPEARANCE_PREF_KEY, pref === 'real' ? 'real' : 'geo'); } catch { /* 私隱模式等寫入失敗＝維持預設 */ }
}

// B8(a)：面數（20k／5k）與外觀（幾何／寫實）的決定集中在這一個函式；輸入只有
// storage（localStorage 或相容介面）與 params（URLSearchParams 或相容介面，需 .get）。
// 回傳 { appearance: 'geo'|'real', faces: 20000|5000 }。
export function resolvePlayerAppearance({ storage = null, params = null } = {}) {
  const appearance = loadAppearancePref(storage);
  const faces = params?.get?.('faces') === '20k' ? 20000 : 5000;
  return { appearance, faces };
}
