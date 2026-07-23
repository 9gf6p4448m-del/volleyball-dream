// 存取層 — localStorage 介面卡（表現層側；src/sim 絕不 import 本檔）
// Phase 3 W1 起：單一 key 的 schema v2 存檔（結構定義在 schema.js）。
// 對外 API 維持 Phase 2 形狀（loadCareer/savePlayer…吃回 careerState v3 物件視圖）——
// W2–W5 把 runtime 邏輯搬上 v2 鍵後再收斂。
// storage 可注入替身（tests 用 Map 假體）；私密模式/配額爆掉一律安全降級不炸畫面
import { serializePlayer } from '../sim/player.js';
import {
  createSaveV2, seasonFromCareer, careerViewOf, deserializeSave, serializeSave,
  SCHEMA_VERSION,
} from './schema.js';

export const SAVE_KEY = 'vd-save';
// Phase 2 雙 key 舊制（v1）：拍板不相容——偵測到即清空並提示重置，不做資料遷移
export const LEGACY_CAREER_KEY = 'vd-career-v1';
export const LEGACY_PLAYER_KEY = 'vd-career-player-v1';
export const SAVE_FORMAT = 'volleyball-dream-save';

export function createCareerStore(storage) {
  const store = storage ?? safeLocalStorage();

  const read = (key) => {
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      store.setItem(key, value);
      return true;
    } catch {
      return false; // 配額滿/私密模式：呼叫端可提示，遊戲不中斷
    }
  };

  // v1 偵測（建 store 當下裁決一次）：無 v2 存檔而有舊 key＝Phase 2 存檔——清空＋記旗標
  // 供 UI 提示「Phase 2 存檔不相容，已重置」；有 v2 存檔時舊 key 屬殘留，靜默清除
  let legacyReset = false;
  try {
    const hadLegacy = read(LEGACY_CAREER_KEY) !== null || read(LEGACY_PLAYER_KEY) !== null;
    if (hadLegacy) {
      if (read(SAVE_KEY) === null) legacyReset = true;
      store.removeItem(LEGACY_CAREER_KEY);
      store.removeItem(LEGACY_PLAYER_KEY);
    }
  } catch { /* storage 不可用：當作無舊檔 */ }

  // 讀整包 v2 存檔；任何損毀（壞 JSON/缺鍵/版本無路徑）→ null（壞檔視同無存檔，不炸開機）
  const loadSave = () => {
    const json = read(SAVE_KEY);
    if (json === null) return null;
    try {
      return deserializeSave(json);
    } catch {
      return null;
    }
  };
  // 讀寫合一（RMW）：saveCareer/savePlayer 各自只動自己的欄位，其餘鍵原樣保留
  const writeSave = (mutate) => {
    const prev = loadSave();
    const next = mutate(prev);
    return write(SAVE_KEY, serializeSave(next));
  };

  return {
    // v1 清空是否發生（UI 顯示重置提示用；session 內恆定）
    wasLegacyReset() {
      return legacyReset;
    },
    hasSave() {
      const save = loadSave();
      return !!(save && save.player && careerViewOf(save));
    },
    loadCareer() {
      const save = loadSave();
      return save ? careerViewOf(save) : null;
    },
    saveCareer(career) {
      return writeSave((prev) => {
        const next = prev ?? createSaveV2({ player: null });
        return { ...next, season: seasonFromCareer(career, prev) };
      });
    },
    loadPlayer() {
      const save = loadSave();
      return save?.player ? structuredClone(save.player) : null;
    },
    // W2 名冊：整包 roster 讀寫（{capacity, members}）；members 補齊/成長都走 RMW
    loadRoster() {
      const save = loadSave();
      return save ? structuredClone(save.roster) : null;
    },
    saveRoster(roster) {
      return writeSave((prev) => ({ ...(prev ?? createSaveV2({})), roster }));
    },
    savePlayer(player) {
      // 走 serializePlayer 正規化（沿用既有格式；three/函式參照擋在存檔外）
      const plain = JSON.parse(serializePlayer(player));
      return writeSave((prev) => ({ ...(prev ?? createSaveV2({})), player: plain }));
    },
    clear() {
      try {
        store.removeItem(SAVE_KEY);
        store.removeItem(LEGACY_CAREER_KEY);
        store.removeItem(LEGACY_PLAYER_KEY);
      } catch { /* ignore */ }
    },
    // 匯出/匯入：整包 v2 存檔（換裝置用）；匯入走 schema 完整驗證，壞檔直接 throw
    exportSave() {
      const save = loadSave();
      if (!save || !save.player || !careerViewOf(save)) {
        throw new Error('沒有可匯出的生涯存檔');
      }
      return JSON.stringify({ format: SAVE_FORMAT, schemaVersion: SCHEMA_VERSION, save }, null, 2);
    },
    importSave(text) {
      const raw = JSON.parse(text);
      if (raw.format !== SAVE_FORMAT) throw new Error('不是排球夢的存檔檔案');
      // Phase 2 匯出檔（{format, career, player} 雙物件形）：同拍板走不相容
      if (raw.save === undefined) {
        throw new Error('Phase 2 存檔不相容（schema v2 起無遷移路徑），無法匯入');
      }
      const save = deserializeSave(JSON.stringify(raw.save));
      if (!save.player || !careerViewOf(save)) {
        throw new Error('存檔內容不完整（缺主角或賽季資料）');
      }
      if (!write(SAVE_KEY, serializeSave(save))) {
        throw new Error('存檔寫入失敗（儲存空間不可用）');
      }
      return { career: careerViewOf(save), player: structuredClone(save.player) };
    },
  };
}

// 私密模式連 localStorage 物件都可能 throw——退化為記憶體存檔（本次分頁有效）
function safeLocalStorage() {
  try {
    const s = globalThis.localStorage;
    s.getItem(SAVE_KEY);
    return s;
  } catch {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: (k) => { m.delete(k); },
    };
  }
}
