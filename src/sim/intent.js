// D4 Intent — 模擬核心唯一輸入型別（玩家 / AI / 未來網路封包一律同型）
// sim 消費 Intent 時不知道、也不在乎它從哪來（鐵律 1 的落地）

export const ACTIONS = ['serve', 'receive', 'set', 'spike', 'block', 'dive'];

export function createIntent({
  playerId,        // 須對得上 Player.id
  tick,            // 決定論：此 Intent 生效的固定步長 tick
  move = { x: 0, z: 0 },   // 走位方向，各分量 -1..1
  action = null,           // ACTIONS 之一或 null
  aim = { x: 0, z: 0 },    // 瞄準落點（世界座標）
  gaze = null,             // 視線欺敵；僅一人稱扣球有效，null＝等同 aim（H3 骨架先不驅動）
  timing = 1,              // 擊球質量 0..1（H1 蓄力/時機窗接手前先給滿）
  style = null,            // 發球式：null＝穩定、'float'＝飄浮（跳發走 timing>1.1）
  // Phase 5 W1 §5 A3 跳舉：這一觸是「跳起來出手」。目前只有 action==='set' 消費
  //（game.js 的觸球高度上緣 maxY）。**不帶任何威力語意**——球的目標、弧頂、散佈
  // 一格未動，唯一的效果是「可以更早、在更高的位置接管這顆球」。
  // 為 false 時不寫進物件＝既有 Intent 逐值不變（VCR 舊卷與既有比對零擾動）
  jump = false,
  // 組合攻擊卷 Q4 資料層（2026-07-31，純記帳）：這一擊的攻擊路線種類
  // ('quick'|'left'|'left_inside'|'right'|'pipe'|'dball'|null)——只有 action==='spike'
  // 時才有意義，來源是協調層已定案的 aiState.attackKind。**不帶任何判定語意**：
  // 物理／落點／散佈一律不讀這個欄位，唯一消費者是 game.js 的 scoutTally 路線記帳。
  routeKind = null,
}) {
  if (playerId === undefined || tick === undefined) {
    throw new Error('Intent 必須帶 playerId 與 tick');
  }
  if (action !== null && !ACTIONS.includes(action)) {
    throw new Error(`未知的 Intent action：${action}`);
  }
  return {
    playerId, tick, move, action, aim, gaze: gaze ?? aim, timing, style,
    ...(jump ? { jump: true } : {}),
    ...(routeKind ? { routeKind } : {}),
  };
}
