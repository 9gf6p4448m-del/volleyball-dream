// Phase 2 存檔層 — localStorage 介面卡（career 與 Player 分 key 儲存）
// storage 可注入替身（tests 用 Map 假體）；私密模式/配額爆掉一律安全降級不炸畫面
import { serializeCareer, deserializeCareer } from './careerState.js';
import { serializePlayer, deserializePlayer } from '../sim/player.js';

export const CAREER_KEY = 'vd-career-v1';
export const PLAYER_KEY = 'vd-career-player-v1';
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

  return {
    hasSave() {
      return read(CAREER_KEY) !== null && read(PLAYER_KEY) !== null;
    },
    loadCareer() {
      const json = read(CAREER_KEY);
      if (json === null) return null;
      try {
        return deserializeCareer(json);
      } catch {
        return null; // 壞檔視同無存檔（不炸開機流程）
      }
    },
    saveCareer(career) {
      return write(CAREER_KEY, serializeCareer(career));
    },
    loadPlayer() {
      const json = read(PLAYER_KEY);
      if (json === null) return null;
      try {
        return deserializePlayer(json);
      } catch {
        return null;
      }
    },
    savePlayer(player) {
      return write(PLAYER_KEY, serializePlayer(player));
    },
    clear() {
      try {
        store.removeItem(CAREER_KEY);
        store.removeItem(PLAYER_KEY);
      } catch { /* ignore */ }
    },
    // 匯出/匯入：單一 JSON 打包兩把 key（換裝置用）；匯入走完整驗證，壞檔直接 throw
    exportSave() {
      const career = this.loadCareer();
      const player = this.loadPlayer();
      if (!career || !player) throw new Error('沒有可匯出的生涯存檔');
      return JSON.stringify({ format: SAVE_FORMAT, career, player }, null, 2);
    },
    importSave(text) {
      const raw = JSON.parse(text);
      if (raw.format !== SAVE_FORMAT) throw new Error('不是排球夢的存檔檔案');
      const career = deserializeCareer(JSON.stringify(raw.career));
      const player = deserializePlayer(JSON.stringify(raw.player));
      if (!this.saveCareer(career) || !this.savePlayer(player)) {
        throw new Error('存檔寫入失敗（儲存空間不可用）');
      }
      return { career, player };
    },
  };
}

// 私密模式連 localStorage 物件都可能 throw——退化為記憶體存檔（本次分頁有效）
function safeLocalStorage() {
  try {
    const s = globalThis.localStorage;
    s.getItem(CAREER_KEY);
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
