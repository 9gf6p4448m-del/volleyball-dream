// D4 管線輸入端骨架 — 玩家輸入產生與 AI 同型的 Intent，走同一條管線進 sim
// H1 手感層在此接手：拖曳=aim+timing、點按/放開=action、長按=timing 蓄力
import { createIntent } from '../sim/intent.js';

export function createIntentQueue(playerId) {
  let pending = null;
  return {
    // UI/手勢層丟進部分欄位（move/action/aim/gaze/timing）
    queue(partial) {
      pending = { ...(pending ?? {}), ...partial };
    },
    // 主迴圈每個固定步長呼叫一次，取走本 tick 的玩家 Intent
    collect(tick) {
      if (!pending) return [];
      const it = createIntent({ ...pending, playerId, tick });
      pending = null;
      return [it];
    },
  };
}
