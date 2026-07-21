// 進攻決策：依攻擊手位置與對方攔網，算出可選攻擊區＋讀攔網（哪區被封/空檔）
// 純函式，讀 game 狀態不寫回；供 UI 顯示與出手瞄準共用
import { COURT } from '../sim/constants.js';
import { TEAM_SIDE, otherTeam } from '../sim/rotation.js';

const BLOCK_COVER_X = 1.1; // 攔網手涵蓋的水平半徑（m）——落在此範圍內＝被封

// 回傳 [{ key, label, aim:{x,z}, power, blocked }]（team 視角固定為玩家隊）
export function attackZonesFor(game, attackerId) {
  const team = game.players[attackerId].teamId;
  const opp = otherTeam(team);
  const side = TEAM_SIDE[team];          // 玩家隊在 z>0（side +1）；對方場 z 為 -side 方向
  const a = game.actors[attackerId];
  const deepZ = -side * 7.0;             // 對方後場深區
  const shortZ = -side * 1.9;            // 吊球短區（貼網後）
  const sign = a.x >= 0 ? 1 : -1;        // 攻擊手所在半邊

  // 對方前排攔網手的 x（P2/P3/P4）
  const oppFront = [game.match.rotations[opp][1], game.match.rotations[opp][2],
    game.match.rotations[opp][3]];
  const blockerXs = oppFront.map((id) => game.actors[id].x);

  const zones = [
    { key: 'line', label: '直線', aim: { x: sign * 3.3, z: deepZ }, power: 1 },
    { key: 'cross', label: '斜線', aim: { x: -sign * 3.3, z: deepZ }, power: 1 },
    { key: 'middle', label: '中路', aim: { x: 0, z: deepZ }, power: 1 },
    { key: 'tip', label: '吊球', aim: { x: -sign * 1.2, z: shortZ }, power: 0.25 },
  ];

  for (const z of zones) {
    z.blocked = isBlocked(a, z.aim, blockerXs, z.key);
  }
  return zones;
}

// 這條攻擊路線過網瞬間的 x 是否落在某攔網手涵蓋範圍內（吊球走高球過網、視為不被攔）
function isBlocked(from, aim, blockerXs, key) {
  if (key === 'tip') return false;
  const t = from.z / (from.z - aim.z);        // z 過零（網）的時刻比例
  const netX = from.x + (aim.x - from.x) * t;
  if (Math.abs(netX) > COURT.WIDTH / 2 + 0.3) return false; // 打邊線外側攔不到
  return blockerXs.some((bx) => Math.abs(bx - netX) < BLOCK_COVER_X);
}
