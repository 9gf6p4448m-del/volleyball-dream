// 主角字卡判定（純函式：零 DOM、零 three.js——node 可直測）
// 動機（07-24 試玩回饋「主角推播沒看到」的驗證缺口）：字卡判定原本內嵌在 matchLoop
// 的 applyEvents 裡＝只能靠瀏覽器目視或注入假卡驗證，真實觸發條件（Perfect 一傳、
// 攔網碰球、假動作騙贏、回歸建功）沒有任何自動化把關。抽成純函式後，測試可以拿
// 「真的跑 sim 產生的事件流」餵進來斷言「該出的卡出了、時長對」——不必開瀏覽器。
// 呼叫端（matchLoop）只負責把回傳的卡丟進 floatText 疊排佇列。
const PERFECT_POWER = 0.95; // TOUCH.power ≥ 此值＝球到瞬間出手的完美一傳

// 單一 sim 事件 → 主角字卡（無卡回 null）。ctx：{ controlledId, playerName }
// pri＝同框疊排優先序（低先出、被上推；高後出＝停在最顯眼基準位）
export function heroCardFor(e, ctx) {
  const { controlledId } = ctx;
  if (e.type === 'BLOCK_TOUCH' && e.playerId === controlledId) {
    // 壓手賭贏（pressed 只在 zone='top' 且 blockHand='press' 時發，game.js:1383-1398）
    // ——賭注的結果要讓玩家看得見（08-27 教學可見性批）。球回攻方半場仍是活球，不喊得分
    if (e.pressed) {
      return { pri: 20, text: '✋ 壓手成功——壓回去了！', color: '#ffd166', dur: 2200 };
    }
    // 攔死金色／擦手青色分色（攔死直接得分另有 pointBanner「攔網得分 🧱」收尾）
    return e.graze
      ? { pri: 20, text: '👆 擦到了——快補！', color: '#6ee7ff', dur: 2200 }
      : { pri: 20, text: '🧱 攔網拍回！', color: '#ffd166', dur: 2200 };
  }
  // 二段變向做出來了（retarget 純觀測旗標，game.js:913）——手勢成立與否要看得見；
  // 這一扣有沒有得分另看結果，字卡只認「變向成立」
  if (e.type === 'TOUCH' && e.kind === 'spike' && e.retarget && e.playerId === controlledId) {
    return { pri: 20, text: '🌀 二段變向！', color: '#ffd166', dur: 2200 };
  }
  if (e.type === 'BLOCK_DECEIVED' && e.spikerId === controlledId) {
    return { pri: 20, text: '🎭 晃過攔網！', color: '#ffd166', dur: 2200 };
  }
  if (
    e.type === 'TOUCH' && e.kind === 'receive' &&
    e.playerId === controlledId && (e.power ?? 0) >= PERFECT_POWER
  ) {
    return { pri: 10, text: '✨ PERFECT!', color: '#60ffa0', dur: 2400 };
  }
  if (e.type === 'COMEBACK_SPARK') {
    return {
      pri: 45,
      text: `⚡ ${ctx.playerName ?? ''} 回歸即建功！`,
      color: '#ffd166',
      dur: 1500,
    };
  }
  return null;
}

// 氣勢滿檔字卡（跨進才發、離開再進可重發）：prev/next 為 MOMENTUM 事件前後值
export function momentumCardFor(prev, next, max) {
  if (Math.abs(prev) >= max || Math.abs(next) < max) return null;
  return next > 0
    ? { pri: 22, text: '🔥 氣勢如虹！', color: '#6ee7ff', dur: 2600 }
    : { pri: 22, text: '❄ 被壓著打——穩住！', color: '#9fd8ff', dur: 2600 };
}
