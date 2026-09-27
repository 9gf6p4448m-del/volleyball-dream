// 進賽場卷 2A B11：比賽 FPS 摘要（平均／最低）。沿用 hud.js 現行「不重疊、約 0.5 秒
// 一格」的回報格：累積到 ≥ BUCKET_MS 才結一格。自本場第一個 SERVE 事件起算——呼叫端
// 在每一幀傳入當下「已發球」旗標，一格只要在**格子開始的那一幀**尚未發球就整格排除
// （發球前的等待/暖機畫面不算數）。document.hidden 期間的格子整格排除——一格只要有
// 任一幀 hidden=true 就整格排除。
// 平均＝計入格子的總幀數 ÷ 總時間；最低＝計入格子中 FPS 最低的一格。
// 零 DOM／零 performance.now 依賴（呼叫端自己算 deltaMs），可用合成時間序列單元測試。
export const BUCKET_MS = 500;

export function createFpsSummary() {
  let bucketFrames = 0;
  let bucketMs = 0;
  let bucketStarted = false;   // 本格是否已收到至少一幀
  let bucketServedAtStart = false;
  let bucketHidden = false;

  let totalFrames = 0;
  let totalMs = 0;
  let minFps = null;

  function flush() {
    if (bucketServedAtStart && !bucketHidden && bucketMs > 0 && bucketFrames > 0) {
      totalFrames += bucketFrames;
      totalMs += bucketMs;
      const fps = bucketFrames / (bucketMs / 1000);
      if (minFps == null || fps < minFps) minFps = fps;
    }
    bucketFrames = 0;
    bucketMs = 0;
    bucketStarted = false;
    bucketHidden = false;
  }

  return {
    // deltaMs：本幀耗時（毫秒，> 0）；hidden／served＝本幀當下 document.hidden／
    // 是否已發生過第一個 SERVE。
    frame(deltaMs, hidden, served) {
      if (!bucketStarted) {
        bucketStarted = true;
        bucketServedAtStart = served;
      }
      bucketFrames += 1;
      bucketMs += deltaMs;
      if (hidden) bucketHidden = true;
      if (bucketMs >= BUCKET_MS) flush();
    },
    // 目前累計的平均／最低（尚無任何計入格子時兩者皆為 null）。不強制 flush 未滿的
    // 格子——沿用「不重疊、約 0.5 秒一格」的定義，半格不算一格。
    summary() {
      if (totalMs <= 0) return { avg: null, min: null };
      return { avg: totalFrames / (totalMs / 1000), min: minFps };
    },
  };
}
