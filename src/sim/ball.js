// 排球物理（純函式模組，無 three.js 依賴）
// 半隱式 Euler 積分＋地板/球網/自由區邊界碰撞，固定步長下完全決定論
import { BALL, COURT } from './constants.js';

export function createBall() {
  return {
    x: 0, y: BALL.RADIUS, z: 0,
    vx: 0, vy: 0, vz: 0,
    // 上一步位置：供 render 層插值與跨步碰撞偵測用
    px: 0, py: BALL.RADIUS, pz: 0,
  };
}

export function stepBall(b, dt) {
  b.px = b.x;
  b.py = b.y;
  b.pz = b.z;

  // 半隱式 Euler：先更新速度再更新位置
  b.vy += BALL.GRAVITY * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;

  collideNet(b);
  collideFloor(b);
  collideBounds(b);
}

// 球網：z=0 的垂直平面，網面自網下緣到網上緣，寬度含超出邊線的部分
function collideNet(b) {
  const crossed = (b.pz > 0) !== (b.z > 0) && b.pz !== b.z;
  if (!crossed) return;

  // 線性插值找出穿越 z=0 瞬間的位置
  const t = b.pz / (b.pz - b.z);
  const xCross = b.px + (b.x - b.px) * t;
  const yCross = b.py + (b.y - b.py) * t;

  const halfSpan = COURT.WIDTH / 2 + COURT.NET_OVERHANG;
  const netBottom = COURT.NET_HEIGHT - COURT.NET_BAND;
  const hitsNet =
    Math.abs(xCross) <= halfSpan &&
    yCross >= netBottom - BALL.RADIUS &&
    yCross <= COURT.NET_HEIGHT + BALL.RADIUS;

  if (!hitsNet) return; // 過網或從網下/網外通過

  const side = b.pz > 0 ? 1 : -1; // 球來自哪一側就被擋回哪一側
  b.x = xCross;
  b.y = yCross;
  b.z = side * BALL.RADIUS;
  b.vz = -b.vz * BALL.NET_RESTITUTION;
  b.vx *= BALL.NET_DAMPING;
  b.vy *= BALL.NET_DAMPING;
}

function collideFloor(b) {
  if (b.y >= BALL.RADIUS) return;
  b.y = BALL.RADIUS;
  if (b.vy < 0) {
    const bounced = -b.vy * BALL.RESTITUTION;
    b.vy = bounced < BALL.REST_SPEED ? 0 : bounced;
  }
  b.vx *= BALL.GROUND_FRICTION;
  b.vz *= BALL.GROUND_FRICTION;
}

// 自由區邊界：把球留在場景內（視覺用，不影響規則）
function collideBounds(b) {
  const maxX = COURT.WIDTH / 2 + COURT.FREE_ZONE - BALL.RADIUS;
  const maxZ = COURT.LENGTH / 2 + COURT.FREE_ZONE - BALL.RADIUS;
  if (b.x > maxX) { b.x = maxX; b.vx = -Math.abs(b.vx) * BALL.WALL_RESTITUTION; }
  if (b.x < -maxX) { b.x = -maxX; b.vx = Math.abs(b.vx) * BALL.WALL_RESTITUTION; }
  if (b.z > maxZ) { b.z = maxZ; b.vz = -Math.abs(b.vz) * BALL.WALL_RESTITUTION; }
  if (b.z < -maxZ) { b.z = -maxZ; b.vz = Math.abs(b.vz) * BALL.WALL_RESTITUTION; }
}
