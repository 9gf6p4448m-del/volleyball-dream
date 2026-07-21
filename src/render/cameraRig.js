// H2 混合視角：比賽狀態自動切換（發球/扣球一人稱、其餘肩後三人稱）
// 鐵則：切換前後「網在哪」不變——本 rig 的兩種視角都保證球網在畫面前方
import * as THREE from 'three';
import { COURT } from '../sim/constants.js';
import { serverId } from '../sim/match.js';
import { TEAM_SIDE } from '../sim/rotation.js';

// 【試玩必調】H2 可調參數：銜接幀數（3–5）、鏡位、俯角
export const CAMERA_TUNING = {
  TRANSITION_FRAMES: 4,   // 過場運鏡幀數
  THIRD_BACK: 5.4,        // 三人稱：在球員身後的距離
  THIRD_HEIGHT: 3.8,      // 三人稱：鏡頭高度（升高俯角＝H4 縱深可讀性）
  LOOK_AHEAD: 4.5,        // 三人稱：注視點超前距離（朝網）
  LOOK_HEIGHT: 1.0,
  FOLLOW_LERP: 0.14,      // 三人稱跟隨平滑
  FP_EYE_RATIO: 0.93,     // 一人稱眼高 = 身高 × 此值
  FP_YAW_RANGE: 1.05,     // 一人稱左右視角範圍（弧度）
  FP_PITCH_RANGE: 0.5,
  SPIKE_CAM_DIST: 3.0,    // 球距我小於此值且輪到第三擊 → 進入扣球一人稱
};

export function createCameraRig(camera, playerId) {
  let mode = 'third';
  let trans = 0;
  const fromPos = new THREE.Vector3();
  const fromTarget = new THREE.Vector3();
  const curPos = new THREE.Vector3().copy(camera.position);
  const curTarget = new THREE.Vector3(0, 1, 0);
  let look = { x: 0, y: 0 }; // 指標 NDC（-1..1），一人稱視線用

  function desiredMode(game) {
    const me = game.players[playerId];
    if (!me) return 'third';
    if (game.phase === 'serve' && serverId(game.match) === playerId) return 'first';
    if (game.phase === 'rally') {
      const r = game.rally;
      const a = game.actors[playerId];
      const near = Math.hypot(game.ball.x - a.x, game.ball.z - a.z)
        < CAMERA_TUNING.SPIKE_CAM_DIST;
      if (r.possession === me.teamId && r.touches === 2 && near) return 'first'; // 扣球視角
    }
    return 'third';
  }

  return {
    setLook(nx, ny) { look = { x: nx, y: ny }; },
    getMode() { return mode; },

    // 一人稱視線落點（gaze）：視線方向與地面的交點——餵給扣球 Intent 的「看哪」
    gazePoint(game) {
      const me = game.players[playerId];
      const a = game.actors[playerId];
      const side = TEAM_SIDE[me.teamId];
      const eye = me.height.current * CAMERA_TUNING.FP_EYE_RATIO;
      const yaw = baseYaw(side) + look.x * CAMERA_TUNING.FP_YAW_RANGE * -side;
      const pitch = -0.28 + look.y * CAMERA_TUNING.FP_PITCH_RANGE;
      const dir = dirFrom(yaw, pitch);
      if (dir.y >= -0.02) return { x: a.x + dir.x * 9, z: a.z + dir.z * 9 }; // 平視：取遠點
      const t = eye / -dir.y;
      return { x: a.x + dir.x * t, z: a.z + dir.z * t };
    },

    update(game, alpha) {
      const me = game.players[playerId];
      const a = game.actors[playerId];
      const side = TEAM_SIDE[me.teamId];
      const ax = a.px + (a.x - a.px) * alpha;
      const az = a.pz + (a.z - a.pz) * alpha;

      const want = desiredMode(game);
      if (want !== mode) {
        mode = want;
        trans = CAMERA_TUNING.TRANSITION_FRAMES; // H2：極短過場運鏡
        fromPos.copy(curPos);
        fromTarget.copy(curTarget);
      }

      const pos = new THREE.Vector3();
      const target = new THREE.Vector3();
      if (mode === 'first') {
        const eye = me.height.current * CAMERA_TUNING.FP_EYE_RATIO;
        const yaw = baseYaw(side) + look.x * CAMERA_TUNING.FP_YAW_RANGE * -side;
        const pitch = -0.12 + look.y * CAMERA_TUNING.FP_PITCH_RANGE;
        const dir = dirFrom(yaw, pitch);
        pos.set(ax, eye, az);
        target.set(ax + dir.x * 8, eye + dir.y * 8, az + dir.z * 8);
      } else {
        // 三人稱肩後：鏡頭在球員身後（背網側）、略升高俯角，網永遠在前方
        pos.set(
          ax * 0.72,
          CAMERA_TUNING.THIRD_HEIGHT,
          az + side * CAMERA_TUNING.THIRD_BACK,
        );
        target.set(
          ax * 0.5,
          CAMERA_TUNING.LOOK_HEIGHT,
          az - side * CAMERA_TUNING.LOOK_AHEAD,
        );
      }

      if (trans > 0) {
        const t = 1 - trans / (CAMERA_TUNING.TRANSITION_FRAMES + 1);
        curPos.lerpVectors(fromPos, pos, easeOut(t));
        curTarget.lerpVectors(fromTarget, target, easeOut(t));
        trans -= 1;
      } else if (mode === 'third') {
        curPos.lerp(pos, CAMERA_TUNING.FOLLOW_LERP);
        curTarget.lerp(target, CAMERA_TUNING.FOLLOW_LERP);
      } else {
        curPos.copy(pos);
        curTarget.copy(target);
      }

      camera.position.copy(curPos);
      camera.lookAt(curTarget);
    },
  };
}

// 面向球網的基準 yaw：A 隊（z>0）朝 -z＝π、B 隊朝 +z＝0
function baseYaw(side) {
  return side === 1 ? Math.PI : 0;
}

function dirFrom(yaw, pitch) {
  const cp = Math.cos(pitch);
  return new THREE.Vector3(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
}

function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}
