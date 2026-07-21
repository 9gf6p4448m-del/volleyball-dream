// 程序化排球姿勢層（表現層，唯讀 sim）：疊在 Mixamo 骨架的 Idle/Run 取樣之上
// 模型沒有排球動作 clips（僅 Idle/Run/Walk），以骨骼加法旋轉合成墊/舉/扣/攔/發五式
// 【試玩必調】角度與時長常數全在 POSES / ACTIONS；換到真動捕 clips 時整層可拔除
import * as THREE from 'three';

// 各姿勢的骨骼加法旋轉（弧度；bone 名為 mixamorig: 後綴）
// 本骨架手臂軸向（實測）：Z＋＝前擺、Y＋＝側張、X＝沿骨自轉
const POSES = {
  // 低手墊球：雙臂前伸下壓併攏、含胸屈膝
  bump: {
    RightArm: [0, -0.25, 1.35], LeftArm: [0, -0.25, 1.35],
    Spine: [0.3, 0, 0], crouch: 0.16,
  },
  // 高手（舉球/高手接球）：雙臂高舉過頭額前、肘微彎、抬頭
  overhead: {
    RightArm: [0, 0.35, 2.9], LeftArm: [0, 0.35, 2.9],
    RightForeArm: [0, 0, 0.4], LeftForeArm: [0, 0, 0.4],
    Spine: [-0.1, 0, 0], Neck: [-0.3, 0, 0],
  },
  // 扣球揮臂：右臂過頂前甩、左臂平衡、微展背
  spike: {
    RightArm: [0, 0.2, 3.05], RightForeArm: [0, 0, 0.5],
    LeftArm: [0, 0.5, 0.9],
    Spine: [-0.15, 0, 0],
  },
  // 攔網：雙臂垂直上舉、掌面向前
  block: {
    RightArm: [0, 0.15, 2.85], LeftArm: [0, 0.15, 2.85],
    Spine: [-0.05, 0, 0],
  },
  // 起跳引臂（玩家按下起跳、尚未揮擊）：右臂後拉、左臂前指平衡
  windup: {
    RightArm: [0, 0.3, -0.7], RightForeArm: [0, 0, 0.5],
    LeftArm: [0, 0.2, 1.6],
    Spine: [-0.12, 0, 0],
  },
};

// 軸向測試姿勢（?pose=t1/t2 調參用；找出手臂擺動軸後即棄用）
POSES.t1 = { RightArm: [0, 1.5, 0], LeftArm: [0, 1.5, 0] };
POSES.t2 = { RightArm: [0, 0, 1.5], LeftArm: [0, 0, 1.5] };

// 動作時間包絡與跳躍弧（秒、公尺）
const ACTIONS = {
  bump: { pose: 'bump', dur: 0.55, jump: 0 },
  overhead: { pose: 'overhead', dur: 0.6, jump: 0 },
  spike: { pose: 'spike', dur: 0.62, jump: 0.5 },
  serve: { pose: 'spike', dur: 0.7, jump: 0.32 }, // 跳發共用揮臂、跳略小
  block: { pose: 'block', dur: 0.7, jump: 0.34 },
  windup: { pose: 'windup', dur: 0.75, jump: 0.5 }, // 起跳滯空窗（揮擊由 spike 接手）
  t1: { pose: 't1', dur: 1, jump: 0 },
  t2: { pose: 't2', dur: 1, jump: 0 },
};
const ATTACK_MS = 0.10; // 進入姿勢的淡入秒數
const RELEASE_MS = 0.22; // 收勢淡出秒數

const BONE_KEYS = ['RightArm', 'LeftArm', 'RightForeArm', 'LeftForeArm', 'Spine', 'Neck'];

export function createAnimator(inst) {
  const bones = {};
  for (const key of BONE_KEYS) {
    // GLTFLoader 會消毒節點名（mixamorig:RightArm → mixamorigRightArm），兩種都試
    bones[key] = inst.getObjectByName(`mixamorig${key}`)
      ?? inst.getObjectByName(`mixamorig:${key}`) ?? null;
  }
  let current = null; // { def, t }
  let hold = null;    // 持續姿勢（攔網窗）：'block' | null
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  return {
    // 觸發一次性動作：'bump'|'overhead'|'spike'|'serve'|'block'|'windup'
    trigger(type) {
      const def = ACTIONS[type];
      if (!def) return;
      // 空中接續：跳躍中換動作（windup→spike 揮擊）延續跳躍弧，不落地重跳
      const carry =
        current && current.def.jump > 0 && def.jump > 0
          ? Math.min(current.t / current.def.dur, 0.55) * def.dur
          : 0;
      current = { def, t: carry };
    },
    // 攔網窗開著時持續舉手（無需事件）
    setHold(type) { hold = type; },
    isIdle() { return current === null; },

    // 在 mixer.update 之後呼叫；回傳本幀跳躍高度（加到模型 y）
    update(dt) {
      let poseName = null;
      let weight = 0;
      let jumpY = 0;

      if (current) {
        current.t += dt;
        const { def } = current;
        if (current.t >= def.dur) {
          current = null;
        } else {
          poseName = def.pose;
          const t = current.t;
          const attack = Math.min(t / ATTACK_MS, 1);
          const release = Math.min((def.dur - t) / RELEASE_MS, 1);
          weight = Math.min(attack, release);
          if (def.jump > 0) jumpY = def.jump * Math.sin((t / def.dur) * Math.PI);
        }
      }
      if (!poseName && hold) {
        poseName = ACTIONS[hold].pose;
        weight = 0.85;
      }

      if (poseName && weight > 0) {
        const pose = POSES[poseName];
        for (const key of BONE_KEYS) {
          const bone = bones[key];
          const rot = pose[key];
          if (!bone || !rot) continue;
          e.set(rot[0] * weight, rot[1] * weight, rot[2] * weight);
          q.setFromEuler(e);
          bone.quaternion.multiply(q); // 疊加在 Idle/Run 取樣之上
        }
        if (pose.crouch) jumpY -= pose.crouch * weight;
      }
      return jumpY;
    },
  };
}
