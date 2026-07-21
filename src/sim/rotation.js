// 輪轉與站位（純函式）— FIVB 位置編號：P1 右後(發球) P2 右前 P3 中前 P4 左前 P5 左後 P6 中後
// 隊伍座標：team 'A' 佔 z>0（side=+1）、'B' 佔 z<0（side=-1）；網在 z=0
import { COURT } from './constants.js';

export const TEAM_SIDE = { A: 1, B: -1 };

export function otherTeam(team) {
  return team === 'A' ? 'B' : 'A';
}

// 站位模板（隊伍視角）：lx = 面向網時的右手向、lz = 距網深度
const POSITION_TEMPLATE = [
  { lx: 3, lz: 7 },   // P1 右後
  { lx: 3, lz: 3 },   // P2 右前
  { lx: 0, lz: 3 },   // P3 中前
  { lx: -3, lz: 3 },  // P4 左前
  { lx: -3, lz: 7 },  // P5 左後
  { lx: 0, lz: 7 },   // P6 中後
];

// 隊伍視角座標 → 世界座標
// 對映經畫面實證（07-21 修正）：A 隊（z>0、鏡頭後方）的「右」＝世界 +x＝螢幕右，
// 故 x = side * lx；B 隊自動鏡像。發球員在近端畫面右下＝真實轉播視角
export function localToWorld(team, lx, lz) {
  const side = TEAM_SIDE[team];
  return { x: side * lx, z: side * lz };
}

// rotation：長度 6 的 playerId 陣列，index 0 = P1
// 得發球權時輪轉：新 P1 ← 舊 P2（順時針推一格）
export function rotateLineup(rotation) {
  return [...rotation.slice(1), rotation[0]];
}

// 該位置編號（1–6）的基準站位（世界座標）
export function basePosition(team, positionNo) {
  const t = POSITION_TEMPLATE[positionNo - 1];
  return localToWorld(team, t.lx, t.lz);
}

export function positionOf(rotation, playerId) {
  const idx = rotation.indexOf(playerId);
  return idx === -1 ? null : idx + 1;
}

export function isFrontRow(rotation, playerId) {
  const pos = positionOf(rotation, playerId);
  return pos === 2 || pos === 3 || pos === 4;
}

export function isBackRow(rotation, playerId) {
  const pos = positionOf(rotation, playerId);
  return pos === 1 || pos === 5 || pos === 6;
}

// 發球點（世界座標）：P1 後方、端線外
export function servePosition(team) {
  return localToWorld(team, 2, COURT.LENGTH / 2 + 0.7);
}

// 該世界座標是否在此隊的前區（網與攻擊線之間）
export function isInFrontZone(team, z) {
  const lz = TEAM_SIDE[team] * z;
  return lz >= 0 && lz <= COURT.ATTACK_LINE;
}

// 落點在界內時（壓線算界內），判它落在哪隊半場；界外回傳 null
export function landedCourtTeam(x, z) {
  const halfW = COURT.WIDTH / 2;
  const halfL = COURT.LENGTH / 2;
  if (Math.abs(x) > halfW || Math.abs(z) > halfL) return null;
  return z >= 0 ? 'A' : 'B'; // 恰落中線下沿極罕見，決定論上固定歸 A 半場
}
