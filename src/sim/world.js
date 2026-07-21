// 世界狀態與固定步長推進 — 模擬核心唯一入口
// 鐵律：stepWorld 不接受可變 dt；所有變化由 tick/cycle 序號決定，任何幀率下結果一致
import { SIM_DT, SERVE_PERIOD } from './constants.js';
import { createBall, stepBall } from './ball.js';

// 發球參數表：依 cycle 輪流取用（含一組刻意觸網的，驗證球網碰撞）
const SERVES = [
  { speed: 14.0, vy: 3.5, lane: 0 },
  { speed: 15.0, vy: 3.2, lane: -1 },
  { speed: 12.5, vy: 3.8, lane: 1 },
  { speed: 16.0, vy: 2.8, lane: 0 }, // 這組會掛網
];

export function createWorld() {
  const w = {
    tick: 0,
    time: 0,
    cycle: -1,
    ball: createBall(),
  };
  applyServe(w.ball, 0);
  w.cycle = 0;
  return w;
}

// 推進一個固定步長（1/60 秒）；render 幀率與此完全脫鉤
export function stepWorld(w) {
  w.tick += 1;
  w.time = w.tick * SIM_DT; // 由 tick 推導，避免浮點累加漂移

  const cycle = Math.floor(w.time / SERVE_PERIOD);
  if (cycle !== w.cycle) {
    w.cycle = cycle;
    applyServe(w.ball, cycle);
  }

  stepBall(w.ball, SIM_DT);
}

function applyServe(b, cycle) {
  const s = SERVES[cycle % SERVES.length];
  const side = cycle % 2 === 0 ? 1 : -1; // 兩側輪流發球

  b.x = s.lane * 2;
  b.y = 2.55; // 跳發擊球點
  b.z = side * 9.5;
  b.vx = -s.lane * 1.2;
  b.vy = s.vy;
  b.vz = -side * s.speed;
  b.px = b.x;
  b.py = b.y;
  b.pz = b.z;
}
