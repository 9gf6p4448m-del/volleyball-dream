// 進攻決策：依攻擊手位置與對方攔網，算出可選攻擊區＋讀攔網（哪區被封/空檔）
// 純函式，讀 game 狀態不寫回；供 UI 顯示與出手瞄準共用
import { COURT } from '../sim/constants.js';
import { otherTeam, isFrontRow } from '../sim/rotation.js';
import { spikeAimsFor, netCrossingX } from '../sim/blockRead.js';
// 攔網手涵蓋的水平半徑（m）——落在此範圍內＝被封。
// 陷阱 1（§十 憲法 §八-1）：這裡改制前自己寫死一份 1.1，與 sim 的 TUNING.BLOCK_REACH_X
// 各持一份。面板的「被封」提示與 sim 的實際涵蓋一旦分岔，面板就是在對玩家說謊
// （違反顯示哲學「狀態誠實呈現」）。現在兩邊同吃 blockBand.js 這一份。
import { BLOCK_HALF_WIDTH } from '../sim/blockBand.js';

// 回傳 [{ key, label, aim:{x,z}, power, blocked }]（team 視角固定為玩家隊）
export function attackZonesFor(game, attackerId) {
  const team = game.players[attackerId].teamId;
  const opp = otherTeam(team);
  const a = game.actors[attackerId];

  // 對方前排攔網手的 x（2/3/4 號位）
  const oppFront = [game.match.rotations[opp][1], game.match.rotations[opp][2],
    game.match.rotations[opp][3]];
  const blockerXs = oppFront.map((id) => game.actors[id].x);

  // 瞄準點＝防守站位的縫隙與邊線帶（不是往人身上打——後排基準位在 ±3/7 與 0/7）
  // 幾何本體在 sim/blockRead.js（C2 之後 sim 的後排讀站位要吃同一份，數值零改動）
  const aims = spikeAimsFor(game, attackerId);
  const zones = [
    { key: 'line', label: '直線', aim: aims.line, power: 1 },
    { key: 'cross', label: '斜線', aim: aims.cross, power: 1 },
    { key: 'middle', label: '中路', aim: aims.middle, power: 1 },
  ];
  // 吊球僅前排（後排攻擊距網太遠、吊不進短區）
  if (isFrontRow(game.match.rotations[team], attackerId)) {
    zones.push({ key: 'tip', label: '吊球', aim: aims.tip, power: 0.25 });
  }

  for (const z of zones) {
    z.blocked = isBlocked(a, z.aim, blockerXs, z.key);
  }
  return zones;
}

// 攻擊路線在網面（z=0）通過的 x（攻守兩端共用：讀攔網、攔網站位計算）
// 本體已移入 sim/blockRead.js（C2 讓 sim 也要用同一份算法）；此處保留舊名對外相容
export const crossingXOf = netCrossingX;

// 這條攻擊路線過網瞬間的 x 是否落在某攔網手涵蓋範圍內（吊球走高球過網、視為不被攔）
function isBlocked(from, aim, blockerXs, key) {
  if (key === 'tip') return false;
  const netX = crossingXOf(from, aim);
  if (Math.abs(netX) > COURT.WIDTH / 2 + 0.3) return false; // 打邊線外側攔不到
  return blockerXs.some((bx) => Math.abs(bx - netX) < BLOCK_HALF_WIDTH);
}
