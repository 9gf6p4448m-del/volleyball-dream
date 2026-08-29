// 鞋底摩擦聲觸發判定（08-29 試玩回饋：加排球鞋摩擦球場聲）——純函式、零 WebAudio
// 依賴，node --test 直測。輸入＝同一名球員前後兩個 sim tick 的位移向量（m/tick，
// 呼叫端從 actor 的 x-px / z-pz 直接取得，純觀測不碰 sim）。
//
// 真實球場的鞋聲物理：橡膠底「唧」一聲來自急停與急變向（腳掌對地面滑移），
// 等速直線跑不會響。對應成兩個條件，任一成立即觸發：
// - turn：前一刻在跑（≥speedThresh）、這一刻仍在跑、方向反轉（點積 < 0）
// - stop：前一刻在「衝刺」（≥stopSpeedThresh）、這一刻速度掉到不足 stopRatio（急煞）。
//   stop 另設較高門檻的原因（08-29 探針實測）：AI 走位每次到點都是急停，用同一門檻
//   時 stop 佔 87%、密度 21.9 次/rally——普通到位不該響，只有全速衝刺急煞才算鞋聲
// intensity ∈ (0,1]＝前一刻速度相對門檻的比例，供音量/音高微分化。
export function detectSqueak(prev, cur, {
  speedThresh, stopRatio = 0.35, stopSpeedThresh = speedThresh,
} = {}) {
  if (!prev || !cur || !(speedThresh > 0)) return null;
  const prevSpeed = Math.hypot(prev.dx, prev.dz);
  if (prevSpeed < speedThresh) return null; // 慢慢走蹭不出聲
  const curSpeed = Math.hypot(cur.dx, cur.dz);
  const intensity = Math.min(1, prevSpeed / (speedThresh * 2));
  if (curSpeed >= speedThresh && prev.dx * cur.dx + prev.dz * cur.dz < 0) {
    return { kind: 'turn', intensity };
  }
  if (prevSpeed >= stopSpeedThresh && curSpeed <= prevSpeed * stopRatio) {
    return { kind: 'stop', intensity };
  }
  return null;
}
