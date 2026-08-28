// 大作感卷 批2（2026-08-28）：音量設定持久化——總靜音鈕、音效／音樂音量滑桿、
// 選單曲目索引。localStorage key 用 `vd-` 前綴慣例（沿 careerStore.js SAVE_KEY）；
// 私密模式連 localStorage 物件都可能 throw——比照 careerStore.js:1671
// safeLocalStorage 的做法，退化為記憶體存檔（本次分頁有效，不 throw）。
const KEY = 'vd-audio';
const DEFAULT = { muted: false, sfx: 1, bgm: 0.8, menuTrack: 0 };

let mem = null; // 私密模式 fallback（Map，本次分頁有效）
function storage() {
  try {
    const s = globalThis.localStorage;
    s.getItem(KEY); // 探測：私密模式下這一行本身就可能 throw
    return s;
  } catch {
    if (!mem) mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); },
    };
  }
}

let cache = null; // 讀過一次就快取，set() 時同步更新——避免每次 get() 都重新 parse
const subscribers = new Set();

export function get() {
  if (cache) return cache;
  try {
    const raw = storage().getItem(KEY);
    cache = raw ? { ...DEFAULT, ...JSON.parse(raw) } : { ...DEFAULT };
  } catch {
    cache = { ...DEFAULT }; // 壞資料／解析失敗＝退預設，不讓整頁掛掉
  }
  return cache;
}

export function set(patch) {
  cache = { ...get(), ...patch };
  try { storage().setItem(KEY, JSON.stringify(cache)); } catch { /* 私密模式等寫入失敗＝這次分頁記得住、下次分頁失憶 */ }
  for (const fn of subscribers) {
    try { fn(cache); } catch { /* 訂閱者自己丟錯不該打斷其他訂閱者 */ }
  }
  return cache;
}

// 回傳取消訂閱函式（沿專案內其餘 subscribe 慣例）
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
