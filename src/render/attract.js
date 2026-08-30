// 大作感二卷 批5（2026-08-30）：主選單 attract 背景——複用開機就建好的
// scene/arena/lights（不建第二套場景），慢速環繞空場館＋緩慢起伏。
// 獨立 rAF 迴圈：renderHome 顯示時開、離開 home／進比賽即停（與 matchLoop 的
// 迴圈絕不並存——main.js 在 runMatch 前 stop）。迴圈內任何一幀炸掉＝自動停迴圈、
// 選單照常可用（J5-3）。
export function attractShot(t) {
  const ang = t * 0.07; // 【試玩必調】環繞角速度（rad/s）
  const r = 15 + Math.sin(t * 0.045) * 2.2; // 半徑緩慢吐納
  return {
    pos: {
      x: Math.cos(ang) * r,
      y: 6.2 + Math.sin(t * 0.09) * 1.5, // 高度緩慢起伏
      z: Math.sin(ang) * r,
    },
    target: { x: 0, y: 1.8, z: 0 },
  };
}

export function createAttract(ctx) {
  let raf = 0;
  let running = false;
  let t0 = null;
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    try {
      if (t0 === null) t0 = now;
      const shot = attractShot((now - t0) / 1000);
      ctx.camera.position.set(shot.pos.x, shot.pos.y, shot.pos.z);
      ctx.camera.lookAt(shot.target.x, shot.target.y, shot.target.z);
      ctx.postFx.render(ctx.scene, ctx.camera); // 渲染單一出口（同 matchLoop A3 慣例）
    } catch {
      running = false; // 這一幀炸了＝整段放棄，選單不受影響
      cancelAnimationFrame(raf);
    }
  }
  return {
    start() {
      if (running) return;
      running = true;
      t0 = null; // 每次重啟從頭走鏡（避免長時間累積的浮點角度）
      try { raf = requestAnimationFrame(frame); } catch { running = false; }
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
