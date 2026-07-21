// D4 Intent — 模擬核心唯一輸入型別（玩家 / AI / 未來網路封包一律同型）
// sim 消費 Intent 時不知道、也不在乎它從哪來（鐵律 1 的落地）

export const ACTIONS = ['serve', 'receive', 'set', 'spike', 'block'];

export function createIntent({
  playerId,        // 須對得上 Player.id
  tick,            // 決定論：此 Intent 生效的固定步長 tick
  move = { x: 0, z: 0 },   // 走位方向，各分量 -1..1
  action = null,           // ACTIONS 之一或 null
  aim = { x: 0, z: 0 },    // 瞄準落點（世界座標）
  gaze = null,             // 視線欺敵；僅一人稱扣球有效，null＝等同 aim（H3 骨架先不驅動）
  timing = 1,              // 擊球質量 0..1（H1 蓄力/時機窗接手前先給滿）
}) {
  if (playerId === undefined || tick === undefined) {
    throw new Error('Intent 必須帶 playerId 與 tick');
  }
  if (action !== null && !ACTIONS.includes(action)) {
    throw new Error(`未知的 Intent action：${action}`);
  }
  return { playerId, tick, move, action, aim, gaze: gaze ?? aim, timing };
}
