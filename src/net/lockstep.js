// 多人連線卷 批2（2026-08-28）—— 鎖步核心（純資料，零 three.js／DOM／網路 API）
// 凍結檔＝docs/kickoffs/acceptance-multiplayer-20260828.md（拍板 6＝鎖步＋固定輸入延遲）
//
// 模型：兩台各跑一份一模一樣的 sim（60Hz 固定步長、種子 PRNG——地基見
// src/sim/game.js:2 鐵律）。雙方在 tick T 取樣的本地輸入，一律排到 T+delay 才生效；
// tick E 只有在「兩邊的 E 影格都到齊」時才准推進 ⇒ 兩台餵給 stepGame 的輸入序列
// **逐 tick 逐值相同** ⇒ 決定論保證兩台狀態逐位元一致，完全不必傳狀態本身。
//
// 影格（frame）＝某一執行 tick 的單側輸入包：
//   { p: [Intent 去掉 tick], a: patch|null }
//   p＝該側真人的 Intent（tick 在消費端改寫成執行 tick——game.js:476 只吃
//     it.tick===state.tick 的 Intent，不改寫就會被靜默丟掉）
//   a＝該側真人對 aiState 的旁路指令 patch（欄位限 rallyTape.PLAYER_AI_FIELDS 那 9 條
//     ——拍板 3：沿用白名單當指令通道，零 sim 改動）
//
// ★ 旁路 patch 的合併規則（A2-3）★
//   兩側 patch 一律按 **A 先 B 後** 的固定順序套用（consumeFrame 的 apply 迴圈）。
//   兩台都跑同一條合併程式 ⇒ 就算同 tick 同欄位被兩側同時寫（語意上不該發生，
//   但防禦上不能靠「不該」），兩台合併出的 aiState 仍逐位元相同——決定論不破。
//   語意層的所有權分析（誰在什麼時機寫哪個欄位）見 tests/net-lockstep.test.mjs A2-3。
//
// 本檔不做：傳輸（批3 transport）、UI、斷線重連。它只回答一個問題：
// 「這一 tick 可不可以推進、推進時要餵什麼」。

export const SLOTS = ['A', 'B'];

// 佔位空影格：與「還沒到」(undefined) 區分——空輸入也是輸入
const EMPTY = Object.freeze({ p: [], a: null });

export function createLockstep({ delay, localSlot }) {
  if (!SLOTS.includes(localSlot)) throw new Error(`未知的 slot：${localSlot}`);
  if (!Number.isInteger(delay) || delay < 0) throw new Error(`delay 必須是非負整數：${delay}`);
  const remoteSlot = localSlot === 'A' ? 'B' : 'A';
  const frames = new Map(); // execTick → { A: frame|undefined, B: frame|undefined }
  const ensure = (t) => {
    let f = frames.get(t);
    if (!f) { f = { A: undefined, B: undefined }; frames.set(t, f); }
    return f;
  };
  // 開場預填：tick 0..delay-1 沒有任何輸入來得及生效（取樣 0 → 生效 delay）
  for (let t = 0; t < delay; t += 1) { const f = ensure(t); f.A = EMPTY; f.B = EMPTY; }
  let lastSampled = -1;

  return {
    get delay() { return delay; },
    get localSlot() { return localSlot; },
    // 在 sim tick T 取樣本地輸入（每 tick 恰一次；重複取樣＝呼叫端亂序，直接炸）。
    // 回傳要送給對方的訊息（純資料，可 JSON）；呼叫端負責丟給 transport。
    sample(tick, { intents = [], patch = null } = {}) {
      if (tick !== lastSampled + 1) throw new Error(`取樣亂序：上次 ${lastSampled}、這次 ${tick}`);
      lastSampled = tick;
      const exec = tick + delay;
      const frame = (intents.length || patch)
        ? { p: intents.map(stripTick), a: patch ?? null }
        : EMPTY;
      ensure(exec)[localSlot] = frame;
      return { t: exec, f: frame === EMPTY ? null : frame };
    },
    // 收對方訊息（transport 層保序交付——WebRTC DataChannel 預設 ordered+reliable）
    pushRemote(msg) {
      if (!Number.isInteger(msg?.t)) throw new Error('遠端訊息缺 t');
      ensure(msg.t)[remoteSlot] = msg.f ?? EMPTY;
    },
    // tick T 的兩側影格都到齊了嗎？沒到齊＝這一 tick 不准 stepGame（鎖步的「鎖」）
    ready(tick) {
      const f = frames.get(tick);
      return !!f && f.A !== undefined && f.B !== undefined;
    },
    // 取走 tick T 的合併輸入。回傳：
    //   intents：A 側在前、B 側在後，tick 已改寫成 T（game.js:476 的決定論保護）
    //   patches：[A 的 patch, B 的 patch]（null＝該側本 tick 無指令），呼叫端按序套用
    consumeFrame(tick) {
      if (!this.ready(tick)) throw new Error(`tick ${tick} 影格未到齊`);
      const f = frames.get(tick);
      frames.delete(tick);
      const intents = [];
      for (const slot of SLOTS) {
        for (const p of f[slot].p) intents.push({ ...p, tick });
      }
      return { intents, patches: SLOTS.map((slot) => f[slot].a ?? null) };
    },
    // 遠端最遠已到哪個 tick（斷線偵測／等待畫面用；批3 消費）
    remoteHorizon() {
      let max = -1;
      for (const [t, f] of frames) if (f[remoteSlot] !== undefined && t > max) max = t;
      return max;
    },
  };
}

function stripTick(intent) {
  const { tick: _drop, ...rest } = intent;
  return rest;
}

// 把兩側 patch 按固定順序套上 aiState（兩台跑同一條 ⇒ 合併結果逐位元相同）。
// 只允許白名單欄位——不是防玩家，是防「未來某批把非指令欄位塞進 patch」的自己人。
export function applyPatches(aiState, patches, allowedFields) {
  for (const patch of patches) {
    if (!patch) continue;
    for (const k of Object.keys(patch)) {
      if (!allowedFields.includes(k)) throw new Error(`patch 欄位不在白名單：${k}`);
      aiState[k] = structuredClone(patch[k]);
    }
  }
}
