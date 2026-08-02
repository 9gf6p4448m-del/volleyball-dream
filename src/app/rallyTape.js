// Phase 4.6 §3-0 — 一顆球的錄影帶（VCR v2）：快照＋「只錄玩家 Intent」的重演格式。
//
// 為什麼改格式（07-28 Sawmah 裁定，依 §3-0 容量探針實測）：舊格式逐 tick 錄十二人
// Intent，單筆中位數 1.1MB、p90 1.9MB——四槽典藏牆 4.4MB 直接撞穿 localStorage
// 額度（三個存檔槽還共用同一份）。AI 決策是零 rng 的情境決定論、aiState 是可完整
// 快照的小物件，所以 AI 的那十一份 Intent **重演時重算即可**，不必存。實測 ×0.10。
//
// 重演契約（與賽中 s.replay／情蒐 tape 同一條）：快照＋同序 Intent＝逐格一致。
// 決定論的三個支點，缺一不可：
//   ① aiState 快照——AI 協調層的跨 tick 記憶（flightPlan/claim/攻擊手指派）
//   ② 每 tick 的 controlledId——AI 不代打受控者；漏了它 AI 會多產一份 Intent
//   ③ aiState 玩家欄位的 patch——digBias（L 封線指令）／attackerId+attackKind
//      （S 分配、二次球）／counterRead（ace 反讀）是玩家透過協調層下的指令，
//      走的不是 Intent 管線，不錄就重演不出來
//
// 純資料＋sim：零 three.js／DOM（app 層模組，src/sim/ 純核心整輪零 diff）。
import { stepGame } from '../sim/game.js';
import { createAiState, aiCollectIntents } from '../sim/ai.js';

export const TAPE_VERSION = 2;

// aiState 中「玩家（UI 層）會寫」的欄位——其餘欄位由 AI 自己逐 tick 演進、重演重算
//
// 組合攻擊卷 段 E（2026-07-31）追加 replanCall——**錄的是「玩家的輸入」不是「重算
// 出來的結果」**，這條界線決定了要不要進白名單：
//   · AI 自己擲骰產出的 `attackCombo`／`approach`：吃 game 狀態＋flightId＋seed 的
//     純函式，重演端重算即得 ⇒ **不進白名單**（tests/rally-tape-approach.test.mjs
//     已用突變測試背書「真的算得出來」）
//   · S 的遠段改判（replanCall）：沒有任何可觀察量推得出來 ⇒ **必須錄**。錄了輸入
//     之後，由它導出的 attackCombo／approach／callOutcome 仍走重算路徑，白名單不必
//     為結果加欄位。
// 卷五（2026-08-02 裁定 1）：`calledPlay`（路徑甲・死球窗）已隨入口退場而移除。
const PLAYER_AI_FIELDS = [
  'digBias', 'attackerId', 'attackKind', 'counterRead', 'replanCall',
];

// 發球前保留的 tick 數（1 秒）：更早的等哨時間逐秒重照快照丟掉——一顆球的戲
// 從發球佈陣的最後一秒開始，不從玩家放下手機的那一刻開始
const PRESERVE_KEEP = 60;

function playerAiView(aiState) {
  const out = {};
  for (const k of PLAYER_AI_FIELDS) out[k] = aiState?.[k] ?? null;
  return out;
}

// 錄製器：matchLoop 的固定步長迴圈逐 tick 餵。一顆球一卷，DEAD_BALL 歸檔。
export function createRallyRecorder() {
  let cur = null;   // 錄製中的卷
  let prevAi = null; // 上一 tick 的玩家欄位值（差分基準）
  let prevControlled = null;
  return {
    get recording() { return cur !== null; },
    // 發球佈陣完成、本球尚未開錄 → 快照當下 game＋aiState（events 清空＝重演自產）。
    // **只在發球相位被呼叫**（matchLoop 契約），所以「還在錄卻又被呼叫」＝球還沒發出去
    // ——每 PRESERVE_KEEP tick 重照一次快照並丟掉舊步：玩家在發球面板前發呆五分鐘
    // 不該讓那一卷長成 2.7MB（實跑抓到：20000 步＝2.7MB）。等哨的時間不是那顆球
    begin(game, aiState) {
      if (cur !== null) {
        if (cur.steps.length < PRESERVE_KEEP) return;
        cur = null; // 落到下方重照
      }
      cur = {
        v: TAPE_VERSION,
        snapshot: structuredClone({ ...game, events: [] }),
        ai: structuredClone(aiState ?? createAiState()),
        steps: [],
      };
      prevAi = playerAiView(aiState);
      prevControlled = null;
    },
    // 每個 sim tick 呼叫一次——**必須在 aiCollectIntents 之前**（那一步會演進 aiState，
    // 而重演端也是「先套 patch 再 collect」，順序對齊才逐格一致）
    step(game, aiState, controlledId, playerIntents) {
      if (cur === null) return;
      const st = {};
      if (playerIntents?.length) st.p = structuredClone(playerIntents);
      if (controlledId !== prevControlled) {
        st.c = controlledId ?? null;
        prevControlled = controlledId ?? null;
      }
      const view = playerAiView(aiState);
      for (const k of PLAYER_AI_FIELDS) {
        if (JSON.stringify(view[k]) !== JSON.stringify(prevAi[k])) {
          st.a = { ...(st.a ?? {}), [k]: structuredClone(view[k]) };
        }
      }
      prevAi = view;
      cur.steps.push(st);
    },
    // 死球＝一球結束：歸檔並回傳該卷（無錄製中＝null）
    end() {
      const done = cur;
      cur = null;
      prevAi = null;
      prevControlled = null;
      return done;
    },
    reset() { cur = null; prevAi = null; prevControlled = null; },
  };
}

// 重演器：吃 v2 卷（AI 重算）或舊格式 clip（steps[i].intents 全錄——情蒐帶走這條）。
// 回傳的 state 即可直接餵 matchView/ballView（唯讀）。
export function createRallyPlayer(tape) {
  const legacy = tape?.v !== TAPE_VERSION;
  const state = structuredClone(tape.snapshot);
  const aiState = legacy ? null : structuredClone(tape.ai ?? createAiState());
  let controlled = null;
  let idx = 0;
  let lastIntents = [];
  const total = tape.steps.length;
  return {
    state,
    length: total,
    // 本步實際餵給 sim 的完整 Intent 陣列（測試用：與原錄逐值比對＝重演契約背書）
    get lastIntents() { return lastIntents; },
    get index() { return idx; },
    get done() { return idx >= total; },
    // 推進一 tick，回傳本步 sim 事件（播完再呼叫＝空陣列）
    step() {
      if (idx >= total) return [];
      const st = tape.steps[idx];
      idx += 1;
      if (legacy) {
        lastIntents = st.intents ?? [];
        return stepGame(state, lastIntents);
      }
      if (st.a) Object.assign(aiState, structuredClone(st.a));
      if (st.c !== undefined) controlled = st.c;
      lastIntents = [
        ...(st.p ?? []),
        ...aiCollectIntents(state, aiState, controlled ? [controlled] : []),
      ];
      return stepGame(state, lastIntents);
    },
    // 快轉 n 步（不渲染）——賽中回放只播尾段時用
    fastForward(n) {
      for (let i = 0; i < n && idx < total; i += 1) this.step();
    },
  };
}

// 卷是否可播（缺快照/零步數＝不可播；UI 據此決定入口出不出現）
export function isPlayableTape(tape) {
  return !!(tape && tape.snapshot && Array.isArray(tape.steps) && tape.steps.length > 0);
}
