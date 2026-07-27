// H2 混合視角：比賽狀態自動切換（發球/扣球一人稱、其餘肩後三人稱）
// 鐵則：切換前後「網在哪」不變——本 rig 的兩種視角都保證球網在畫面前方
import * as THREE from 'three';
import { COURT } from '../sim/constants.js';
import { serverId } from '../sim/match.js';
import { TEAM_SIDE } from '../sim/rotation.js';
import { coachPos, huddleSlot } from './huddleLayout.js';

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
  // W8（07-26 檢查）：防守/攔網視角參數化（原硬編）——距離實測穩定（恆定、抖動 2mm），
  // 但原高度 eye+1.15≈2.9m 高於網頂 2.43m＝俯視；INSET 1 代表相機在球員正後方
  // （原 0.92＝隨站位往中線側偏，邊線站位偏移達 28cm）
  // 07-26 定稿（三案同場景截圖對照）：原 1.7/1.15 ＝離地 2.9m 高於網頂 2.43m＝俯視
  // 上帝視角；改 1.45/0.7 ＝離地約 2.45m ≈ 網頂高＝與對面攻擊手「平視隔網對峙」，
  // 對面整排前排入鏡、自己的頭在畫面下緣定錨。INSET 0.92→1＝相機回到正後方
  // （原值使相機隨站位往中線側偏，邊線站位偏移達 28cm）
  DEFEND_BACK: 1.45,      // 球員身後距離（m）
  DEFEND_UP: 0.7,         // 眼高之上再抬（m）
  DEFEND_INSET: 1,        // 相機 x＝球員 x × 此值（1＝正後方）
  DEFEND_LOOK_H: 2.35,    // 注視點高度（m；網頂略下＝視線水平帶落在對面攻擊手身上）
  DEFEND_LOOK_AHEAD: 5.0, // 注視點在球員前方距離（m）
  DEFEND_LOOK_INSET: 0.85, // 注視點 x＝球員 x × 此值
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
  let huddleView = false;    // W8 暫停演出：第一人稱圍圈看教練戰術板
  let diveCam = false;       // W3(P4) L 魚躍演出：低機位貼地鏡頭（附錄 A4①）
  let tourProgress = null;   // W4(P4) Q10 冠軍館燈光秀巡場：0..1（null＝關）——與燈光秀共時間軸
  let sigBeat = null;        // 4.5B §3 招牌演出：{kind:'oh'|'mb'|'opp', focusId, mateId}（勝負已定後的回放性一拍）
  let setScan = false;       // 4.5B §4 S diegetic：分配決策＝自 S 視線回望自家半場（點隊友＝分配）

  function desiredMode(game) {
    const me = game.players[playerId];
    if (!me) return 'third';
    if (tourProgress !== null) return 'tour'; // 開場燈光秀巡場——凌駕一切（sim 凍結中）
    if (benchMode) return 'bench'; // 板凳視角最高優先——沒有身體可跟，不吃攻防切換
    if (sigBeat) return 'sig'; // 4.5B §3 招牌演出：死球窗內的回放性一拍（SERVE 即收）
    if (huddleView) return 'huddle'; // 暫停圍圈：主角在場上時的第一人稱
    if (diveCam) return 'dive'; // L 魚躍慢動作：貼地仰起（與 OH 俯衝反向）
    if (setScan) return 'sset'; // 4.5B §4：S 分配決策——全場等你的一秒
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
    setHuddleView(v) { huddleView = v; },
    setDiveCam(v) { diveCam = v; },
    setSigBeat(b) { sigBeat = b; }, // 4.5B §3：null＝關；{kind, focusId, mateId}
    setSetScan(v) { setScan = v; }, // 4.5B §4：S 分配決策窗
    setTourProgress(p) { tourProgress = p; }, // null＝關；0..1＝燈光秀巡場進度
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
      if (mode === 'tour') {
        // W4(P4) Q10 冠軍館燈光秀巡場：低空弧線繞場半圈（從客側繞到我方側），
        // 視線從穹頂緩降到球場中央——「頂點舞台」的第一眼。時間軸＝燈光秀進度
        const p = tourProgress ?? 0;
        const ang = Math.PI * 1.25 - p * Math.PI * 0.9; // 半圈弧
        const r = 19 - p * 5; // 漸進貼場
        pos.set(Math.cos(ang) * r, 9.5 - p * 4.2, Math.sin(ang) * r);
        target.set(0, 3.5 - p * 2.3, 0);
        curPos.copy(pos);
        curTarget.copy(target);
        camera.position.copy(curPos);
        camera.lookAt(curTarget);
        return;
      }
      if (mode === 'bench') {
        // W7 C2①：板凳側位廣角——固定機位看整個球場（兩隊都在畫面內），不跟任何球員
        pos.set(CAMERA_TUNING.BENCH_X, CAMERA_TUNING.BENCH_HEIGHT, side * CAMERA_TUNING.BENCH_Z);
        target.set(0, 1.1, 0);
      } else if (mode === 'sig') {
        // 4.5B §3 招牌演出鏡位（勝負已定後的回放性一拍；SERVE 前必收）
        const focus = sigBeat.focusId ? game.actors[sigBeat.focusId] : null;
        const fh = sigBeat.focusId ? (game.players[sigBeat.focusId]?.height?.current ?? 1.85) : 1.85;
        if (sigBeat.kind === 'oh' && focus) {
          // 被騙的人：我方近網低位隔網特寫被晃過的攔網手（撲錯的方向本身入鏡）
          pos.set(focus.x * 0.7 + 0.85, 1.75, side * 1.15);
          target.set(focus.x, fh * 0.88, focus.z);
        } else if (sigBeat.kind === 'mb' && focus) {
          // 早到的人：網帶上方俯視——對面攻擊手抬頭（focus＝對面攻擊手；
          // OH 俯衝/L 貼地/MB 靜止的三角鏡頭語言之「靜止」）
          pos.set(focus.x * 0.65, 3.55, side * 1.0);
          target.set(focus.x, 1.55, focus.z * 0.7);
        } else if (sigBeat.kind === 'opp') {
          // 三米線起飛的回報：低機位框住 OPP（自己）與 S 的專屬擊掌
          const mate = sigBeat.mateId ? game.actors[sigBeat.mateId] : null;
          const mx = mate ? (ax + mate.x) / 2 : ax;
          const mz = mate ? (az + mate.z) / 2 : az;
          pos.set(mx + 2.3, 0.68, mz + side * 2.4);
          target.set(mx, 1.25, mz);
        } else {
          // 焦點缺席（資料缺）＝退回三人稱構圖
          pos.set(ax * 0.72, CAMERA_TUNING.THIRD_HEIGHT, az + side * CAMERA_TUNING.THIRD_BACK);
          target.set(ax * 0.5, CAMERA_TUNING.LOOK_HEIGHT, az - side * CAMERA_TUNING.LOOK_AHEAD);
        }
      } else if (mode === 'huddle') {
        // W8 暫停演出（07-26 二輪拍板）：圈口固定視角——主角恆佔 slot 0（朝球場的
        // 圈口），每次暫停同一構圖；沿「教練→圈口」方向退半步取景，對準教練胸前
        // 戰術板：板置中、教練頭上緣、隊友環繞兩側與教練身後。幾何同 huddleLayout
        const slot = huddleSlot(side, 0);
        const coach = coachPos(side);
        const dx = slot.x - coach.x;
        const dz = slot.z - coach.z;
        const d = Math.hypot(dx, dz) || 1;
        const back = 0.42; // 取景後拉距離（四輪回饋：0.6 太遠——貼近才有圈內感）
        const eye = me.height.current * CAMERA_TUNING.FP_EYE_RATIO;
        pos.set(slot.x + (dx / d) * back, eye + 0.08, slot.z + (dz / d) * back);
        // 注視點＝戰術板本體（教練胸前 0.42m、板高 1.26）
        target.set(coach.x + (dx / d) * 0.42, 1.26, coach.z + (dz / d) * 0.42);
      } else if (mode === 'sset') {
        // 4.5B §4 S 掃場：自 S 眼位回望自家半場——候選攻擊手全數入鏡，
        // 點隊友模型本身＝分配（網在身後：分配決策看的是自己人，非隔網情境）
        const eye = me.height.current * CAMERA_TUNING.FP_EYE_RATIO;
        pos.set(ax * 0.8, eye + 0.18, az - side * 0.5);
        target.set(0, 1.3, az + side * 4.5);
      } else if (mode === 'defend') {
        // 攔網手身後略高，隔網看對面攻擊手的助跑與起跳（守方讀攻擊——與攻擊視角對稱）
        const eye = me.height.current * CAMERA_TUNING.FP_EYE_RATIO;
        const T = CAMERA_TUNING;
        pos.set(ax * T.DEFEND_INSET, eye + T.DEFEND_UP, az + side * T.DEFEND_BACK);
        target.set(ax * T.DEFEND_LOOK_INSET, T.DEFEND_LOOK_H, az - side * T.DEFEND_LOOK_AHEAD);
      } else if (mode === 'attack') {
        // 攻擊手身後略高，越過網看對面攔網手與空檔（讀攔網視角）
        const eye = me.height.current * CAMERA_TUNING.FP_EYE_RATIO;
        pos.set(ax * 0.92, eye + 1.3, az + side * 2.0);
        target.set(ax * 0.5, 1.7, az - side * 6.0);
      } else if (mode === 'dive') {
        // W3(P4) L 魚躍鏡頭（附錄 A4①）：低機位貼地、看球與指尖的距離——
        // 鏡頭語言與 OH 反向：OH 俯衝向下，L 貼地仰起
        const b = game.ball;
        pos.set(ax + side * 1.4, 0.4, az + side * 1.8);
        target.set(b.x, Math.max(0.5, b.y), b.z);
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

// ---- Phase 4.5B §2-1 四鏡位模板（劇情 beat 用；Phase 5 劇情輪直接吃）----
// 純組成函式：回傳 plain object（cam/look/fov/lighting），由 beatStage 的獨立小場景
// 消費——不掛主賽場 rig（劇情事件播在 careerScreen DOM 層，主場景不在場）。
// 舞台空間約定（beatStage 座標）：網帶在 z=0，對方（焦點人物）站 z=-1.4 面向 +z，
// 玩家站 z=+1.4 面向 -z；單人模板主體站原點。
//
// 模板語意（工單 §2-1）：
//   confront      對峙——兩人隔網；angle:'level' 同高度平視（鏡子版）/'up' 仰角（牆版）
//                 /'down' 俯視（幕一牆版「他量你」）
//   exit          離場——人物轉身走離、鏡頭定住不追（餘隊伍剪影由 stage 佈景給）
//   rimlight-solo 單人邊光——隊伍末端單人、邊光強調、不搶主場景
//   stands        看台遠景——觀眾席視角、球場在下方遠景（止步旁觀/頒獎台定格）
export const BEAT_SHOT_NAMES = ['confront', 'exit', 'rimlight-solo', 'stands'];

export function beatShot(name, opts = {}) {
  if (name === 'confront') {
    // 鏡頭沿玩家肩後越網取對方；angle 改變高度與注視俯仰
    const angle = opts.angle ?? 'level';
    if (angle === 'up') {
      return { cam: { x: 0.5, y: 0.9, z: 2.6 }, look: { x: 0, y: 2.0, z: -1.4 }, fov: 40, lighting: 'match' };
    }
    if (angle === 'down') {
      return { cam: { x: 0.5, y: 3.0, z: 2.4 }, look: { x: 0, y: 1.1, z: -1.4 }, fov: 40, lighting: 'match' };
    }
    return { cam: { x: 0.55, y: 1.55, z: 3.0 }, look: { x: 0, y: 1.5, z: -1.4 }, fov: 38, lighting: 'match' };
  }
  if (name === 'exit') {
    // 定機位側後方廣角：人物走離（+depth 由 stage 動畫給），鏡頭不追
    return { cam: { x: 2.6, y: 1.7, z: 2.8 }, look: { x: -0.4, y: 1.1, z: -1.6 }, fov: 44, lighting: 'dusk' };
  }
  if (name === 'rimlight-solo') {
    return { cam: { x: 0.85, y: 1.5, z: 2.3 }, look: { x: 0, y: 1.35, z: 0 }, fov: 36, lighting: 'rim' };
  }
  if (name === 'stands') {
    // 觀眾席視角：高機位、球場遠在下方
    return { cam: { x: 0, y: 6.4, z: 10.5 }, look: { x: 0, y: 0.4, z: -1.0 }, fov: 46, lighting: 'arena' };
  }
  return null;
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
