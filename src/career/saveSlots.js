// W4(P4) 題2 — 本地多存檔槽（3 槽）：key 映射＋存檔頭（選檔頁卡片資料）
// 純函式＋storage 注入（node 可測；src/sim 絕不 import 本檔）。
// 拍板邊界：3 槽、零槽間互通、schema 不動（槽位只反映在 storage key 命名上）；
// 槽 1 的 key 沿用既有 'vd-save'——現有單檔自然成為槽 1，零遷移（縫隙 4 原則）。
import { deserializeSave, careerViewOf } from './schema.js';

export const SLOT_COUNT = 3;

// 槽 1 = 既有單檔 key（不可改——改了等於把所有現存進度變孤兒）
export function slotKey(slot) {
  return slot === 1 ? 'vd-save' : `vd-save-s${slot}`;
}

// 存檔頭：選檔頁卡片用的輕量摘要（存檔寫入時同步維護——讀卡片不解整包）
export function slotHeadKey(slot) {
  return `${slotKey(slot)}-head`;
}

// 局間存檔（Q8 必配）：比賽中間態獨立 key——不塞進主存檔，避免每次 RMW 重寫大 blob
export function slotMidKey(slot) {
  return `${slotKey(slot)}-mid`;
}

// 整包存檔 → 存檔頭。無可用生涯（player null／season 未起）＝null（卡片顯示「新的夢」）。
// 戰績＝當屆勝敗＋歷屆冠軍數（與生涯畫面同一套語意）
export function headOf(save) {
  if (!save?.player || !careerViewOf(save)) return null;
  const results = save.season.results ?? [];
  return {
    playerName: save.season.playerName ?? save.player.name,
    role: save.player.currentRole ?? 'outside',
    seasonIndex: save.season.index ?? 1,
    wins: results.filter((r) => r.won).length,
    losses: results.filter((r) => !r.won).length,
    titles: save.season.titles ?? 0,
    heightCm: Math.round((save.player.height?.current ?? 0) * 100),
  };
}

// 選檔頁讀三槽卡片資料：只讀 head key 的小 JSON。
// 自癒路徑（一次性）：主檔在而頭缺（W4 前的舊單檔首次進選檔頁）→ 解整包補寫 head；
// 壞檔（deserializeSave throw）視同無存檔（沿 careerStore「壞檔不炸開機」慣例）
export function readSlotHeads(storage) {
  const get = (k) => {
    try { return storage.getItem(k); } catch { return null; }
  };
  return Array.from({ length: SLOT_COUNT }, (_, i) => {
    const slot = i + 1;
    const headJson = get(slotHeadKey(slot));
    if (headJson !== null) {
      try { return { slot, head: JSON.parse(headJson) }; } catch { /* 壞頭走自癒 */ }
    }
    const json = get(slotKey(slot));
    if (json !== null) {
      try {
        const head = headOf(deserializeSave(json));
        if (head) {
          try { storage.setItem(slotHeadKey(slot), JSON.stringify(head)); } catch { /* 寫不進＝下次再補 */ }
          return { slot, head };
        }
      } catch { /* 壞檔視同無存檔 */ }
    }
    return { slot, head: null };
  });
}
