// H2 混合視角：比賽狀態自動切換（發球/扣球一人稱、其餘肩後三人稱）
// 鐵則：切換前後「網在哪」不變——本 rig 的兩種視角都保證球網在畫面前方
import * as THREE from 'three';
import { COURT } from '../sim/constants.js';
import { serverId } from '../sim/match.js';
import { TEAM_SIDE } from '../sim/rotation.js';

// 【試玩必調】H2 可調參數：銜接時間、鏡位、俯角
export const CAMERA_TUNING = {
  TRANSITION_SEC: 0.07,   // 過場運鏡時長（秒，與幀率脫鉤）
  THIRD_BACK: 5.4,        // 三人稱：在球員身後的距離
  THIRD_HEIGHT: 3.8,      // 三人稱：鏡頭高度（升高俯角＝H4 縱深可讀性）
  LOOK_AHEAD: 4.5,        // 三人稱：注視點超前距離（朝網）
  LOOK_HEIGHT: 1.0,
  FOLLOW_K: 9,            // 三人稱跟隨收斂率（1/秒，指數衰減；越大越黏）
  FP_EYE_RATIO: 0.93,     // 一人稱眼高 = 身高 × 此值
  FP_YAW_RANGE: 1.05,     // 一人稱左右視角範圍（弧度）
  FP_PITCH_RANGE: 0.5,
  SPIKE_CAM_DIST: 3.0,    // 球距我小於此值且輪到第三擊 → 進入扣球一人稱
  // W7 C2①：板凳視角（教練側位廣角，兩隊都在畫面內；不隨球員走位）
  BENCH_X: -6.6,
  BENCH_Z: 10.6,
  BENCH_HEIGHT: 1.8,
};

// 幀率無關的平滑係數：每幀吃掉的比例＝1-e^(-k·dt)，任何 fps 下同樣的秒級收斂
export function smoothFactor(k, dt) {
  return 1 - Math.exp(-k * Math.max(dt, 0));
}

export function createCameraRig(camera, initialPlayerId) {
  let playerId = initialPlayerId; // 全隊輪控：跟著受控球員走
  let mode = 'third';
  let trans = 0; // 剩餘過場時間（秒）
  const fromPos = new THREE.Vector3();
  const fromTarget = new THREE.Vector3();
  const curPos = new THREE.Vector3().copy(camera.position);
  const curTarget = new THREE.Vector3(0, 1, 0);
  let look = { x: 0, y: 0 }; // 指標 NDC（-1..1），一人稱視線用
  let attackView = false;    // 進攻決策：切攻擊手視角越過網看攔網
  let defendView = false; // 攔網第一視角旗標（main 每幀依防守時刻設定）
  let spikeMine = false;     // 這球第三擊是否分配給我（claim）——舉給隊友不搶鏡
  let benchMode = false;     // W7 C2①：主角在板凳＝教練視角，優先於其餘所有模式

  function desiredMode(game) {
    const me = game.players[playerId];
    if (!me) return 'third';
    if (benchMode) return 'bench'; // 板凳視角最高優先——沒有身體可跟，不吃攻防切換
    if (attackView) return 'attack'; // 讀攔網視角優先
    if (defendView) return 'defend'; // 攔網第一視角（隔網讀對面攻擊手）
    if (game.phase === 'serve' && serverId(game.match) === playerId) return 'first';
    if (game.phase === 'rally') {
      const r = game.rally;
      const a = game.actors[playerId];
      const near = Math.hypot(game.ball.x - a.x, game.ball.z - a.z)
        < CAMERA_TUNING.SPIKE_CAM_DIST;
      // 扣球一人稱：限定「這球舉給我」——舉給隊友時球恰好飛過我頭上不得劫持鏡頭
      // （防守/補位全程三人稱：原設計即無防守一人稱）
      if (r.possession === me.teamId && r.touches === 2 && near && spikeMine) return 'first';
    }
    return 'third';
  }

  return {
    setPlayerId(id) { playerId = id; },
    setAttackView(v) { attackView = v; },
    setDefendView(v) { defendView = v; },
    setSpikeMine(v) { spikeMine = v; },
    setBenchMode(v) { benchMode = v; },
    setLook(nx, ny) { look = { x: nx, y: ny }; },
    resetLook() { look = { x: 0, y: 0 }; },
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

    update(game, alpha, dt = 1 / 60) {
      const me = game.players[playerId];
      const a = game.actors[playerId];
      const side = TEAM_SIDE[me.teamId];
      const ax = a.px + (a.x - a.px) * alpha;
      const az = a.pz + (a.z - a.pz) * alpha;

      const want = desiredMode(game);
      if (want !== mode) {
        mode = want;
        trans = CAMERA_TUNING.TRANSITION_SEC; // H2：極短過場運鏡（秒，與幀率脫鉤）
        fromPos.copy(curPos);
        fromTarget.copy(curTarget);
      }

      const pos = new THREE.Vector3();
      const target = new THREE.Vector3();
      if (mode === 'bench') {
        // W7 C2①：板凳側位廣角——固定機位看整個球場（兩隊都在畫面內），不跟任何球員
        pos.set(CAMERA_TUNING.BENCH_X, CAMERA_TUNING.BENCH_HEIGHT, side * CAMERA_TUNING.BENCH_Z);
        target.set(0, 1.1, 0);
      } else if (mode === 'defend') {
        // 攔網手身後略高，隔網看對面攻擊手的助跑與起跳（守方讀攻擊——與攻擊視角對稱）
        const eye = me.height.current * CAMERA_TUNING.FP_EYE_RATIO;
        pos.set(ax * 0.92, eye + 1.15, az + side * 1.7);
        target.set(ax * 0.6, 2.0, az - side * 5.0);
      } else if (mode === 'attack') {
        // 攻擊手身後略高，越過網看對面攔網手與空檔（讀攔網視角）
        const eye = me.height.current * CAMERA_TUNING.FP_EYE_RATIO;
        pos.set(ax * 0.92, eye + 1.3, az + side * 2.0);
        target.set(ax * 0.5, 1.7, az - side * 6.0);
      } else if (mode === 'first') {
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
        trans = Math.max(0, trans - dt);
        const t = 1 - trans / CAMERA_TUNING.TRANSITION_SEC;
        curPos.lerpVectors(fromPos, pos, easeOut(t));
        curTarget.lerpVectors(fromTarget, target, easeOut(t));
      } else if (mode === 'third') {
        const f = smoothFactor(CAMERA_TUNING.FOLLOW_K, dt);
        curPos.lerp(pos, f);
        curTarget.lerp(target, f);
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
