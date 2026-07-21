// 程序化排球姿勢層（表現層，唯讀 sim）：疊在 Mixamo 骨架的 Idle/Run 取樣之上
// 模型沒有排球動作 clips（僅 Idle/Run/Walk），以骨骼加法旋轉合成動作
// 動作＝分段關鍵姿勢序列（引臂→觸球→收勢），animator 在段間插值＝有揮擊力道
// 【試玩必調】角度全在 POSES、時序全在 SEQUENCES；換到真動捕 clips 時整層可拔除
import * as THREE from 'three';

// 骨骼加法旋轉（弧度）。本骨架手臂軸向（實測）：Z＋＝前擺/上舉、Y＋＝側張、X＝沿骨自轉
const POSES = {
  // 低手墊球：雙臂前伸下壓併攏、含胸屈膝
  bumpReady: {
    RightArm: [0, -0.28, 1.25], LeftArm: [0, -0.28, 1.25],
    Spine: [0.35, 0, 0], crouch: 0.22,
  },
  bumpHit: { // 觸球瞬間：微微抬臂送球、屈膝略起
    RightArm: [0, -0.2, 1.55], LeftArm: [0, -0.2, 1.55],
    Spine: [0.22, 0, 0], crouch: 0.1,
  },
  // 高手舉球：雙手抬到額前上方、往上托
  setReach: {
    RightArm: [0, 0.35, 2.55], LeftArm: [0, 0.35, 2.55],
    RightForeArm: [0, 0, 0.7], LeftForeArm: [0, 0, 0.7],
    Spine: [-0.05, 0, 0], Neck: [-0.25, 0, 0], crouch: 0.08,
  },
  setPush: { // 送球：雙臂上伸、手指張
    RightArm: [0, 0.3, 2.95], LeftArm: [0, 0.3, 2.95],
    RightForeArm: [0, 0, 0.25], LeftForeArm: [0, 0, 0.25],
    Neck: [-0.15, 0, 0],
  },
  // 扣球三段：引臂後拉 → 觸球全展 → 揮臂收勢
  spikeWind: { // 引臂：右肘高抬拉到頭後、左臂上舉瞄球、含背後仰
    RightArm: [0, 0.75, 1.5], RightForeArm: [-0.3, 0, 1.5],
    LeftArm: [0, 0.55, 2.1],
    Spine: [-0.28, 0.15, 0], Neck: [-0.15, 0, 0],
  },
  spikeHit: { // 觸球：右臂過頂前甩全展、身體舒展打出、左臂收
    RightArm: [0, 0.2, 3.1], RightForeArm: [0, 0, 0.1],
    LeftArm: [0, 0.4, 0.8],
    Spine: [0.12, -0.1, 0],
  },
  spikeFollow: { // 收勢：右臂順勢揮下過身前、軀幹前屈
    RightArm: [0, -0.15, 0.7], RightForeArm: [0, 0, 0.4],
    LeftArm: [0, 0.25, 0.5],
    Spine: [0.4, 0, 0],
  },
  // 攔網：方向式手臂（armAim＝上臂在「模型空間」指向的方向；數學求解不猜軸）
  // 手肘/手腕回 T-Pose 直臂基準——雙手打直、完美對稱、不受待機動畫汙染
  blockUp: {
    Spine: [0.06, 0, 0], Neck: [-0.1, 0, 0],
    armAim: { x: 0, y: 1, z: 0.18 }, // 直上微前（模型 +z＝面向）
  },
  blockPunch: { // 頂點「蓋」：雙臂前壓過網、身體前撲
    Spine: [0.24, 0, 0],
    armAim: { x: 0, y: 0.78, z: 0.63 },
  },
  // 起跳引臂（玩家按下起跳、揮擊由 spike 接手）＝借用扣球引臂
  windup: {
    RightArm: [0, 0.7, 1.4], RightForeArm: [-0.3, 0, 1.4],
    LeftArm: [0, 0.5, 2.0],
    Spine: [-0.22, 0.12, 0],
  },
  // 落地緩衝：屈膝含胸（跳躍類動作尾段疊上）
  land: { Spine: [0.18, 0, 0], crouch: 0.28 },
};

// 動作＝關鍵姿勢序列（at: 0..1 於動作時長內的時間點）＋跳躍弧＋落地緩衝
const SEQUENCES = {
  bump: {
    dur: 0.5, jump: 0, land: false,
    keys: [{ at: 0, p: 'bumpReady' }, { at: 0.45, p: 'bumpHit' }, { at: 1, p: 'bumpReady' }],
  },
  overhead: {
    dur: 0.55, jump: 0, land: false,
    keys: [{ at: 0, p: 'setReach' }, { at: 0.5, p: 'setPush' }, { at: 1, p: 'setReach' }],
  },
  spike: {
    dur: 0.6, jump: 0.55, land: true,
    keys: [{ at: 0, p: 'spikeWind' }, { at: 0.42, p: 'spikeHit' }, { at: 1, p: 'spikeFollow' }],
  },
  serve: {
    dur: 0.72, jump: 0.3, land: false,
    keys: [{ at: 0, p: 'spikeWind' }, { at: 0.5, p: 'spikeHit' }, { at: 1, p: 'spikeFollow' }],
  },
  block: {
    dur: 0.7, jump: 0.34, land: true,
    keys: [{ at: 0, p: 'blockUp' }, { at: 0.4, p: 'blockPunch' }, { at: 1, p: 'blockUp' }],
  },
  windup: {
    dur: 0.75, jump: 0.5, land: false,
    keys: [{ at: 0, p: 'windup' }, { at: 1, p: 'windup' }],
  },
};

const ATTACK_MS = 0.08;  // 進入姿勢的淡入秒數
const RELEASE_MS = 0.2;  // 收勢淡出秒數
const LAND_FROM = 0.72;  // 跳躍動作進度超過此值＝下降段，疊落地緩衝

const BONE_KEYS = ['RightArm', 'LeftArm', 'RightForeArm', 'LeftForeArm', 'Spine', 'Neck'];
// 絕對姿勢的手臂鏈（以 T-Pose 為基準定位，兩手完美對稱、不受待機動畫影響）
const ABS_KEYS = [
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
];

// 取姿勢在某骨的加法旋轉（缺＝零）
function poseRot(pose, key) {
  return pose[key] ?? ZERO;
}
const ZERO = [0, 0, 0];

export function createAnimator(inst, tposeRef = null) {
  const bones = {};
  for (const key of [...new Set([...BONE_KEYS, ...ABS_KEYS])]) {
    // GLTFLoader 會消毒節點名（mixamorig:RightArm → mixamorigRightArm），兩種都試
    bones[key] = inst.getObjectByName(`mixamorig${key}`)
      ?? inst.getObjectByName(`mixamorig:${key}`) ?? null;
  }
  let current = null; // { seq, t }
  let hold = null;    // 持續姿勢（攔網窗）：'block' | null
  const q = new THREE.Quaternion();
  const qAbs = new THREE.Quaternion();
  const qWorld = new THREE.Quaternion();
  const qParent = new THREE.Quaternion();
  const vWorld = new THREE.Vector3();
  const vLocal = new THREE.Vector3();
  const vAxis = new THREE.Vector3();
  const e = new THREE.Euler();

  // 累積某骨在給定「已插值姿勢對」下的加法旋轉，寫進 out[key]
  function blendKeys(seq, t, out) {
    // 找出 t 落在哪兩個關鍵之間
    const keys = seq.keys;
    let i = 0;
    while (i < keys.length - 1 && t > keys[i + 1].at) i += 1;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    const span = Math.max(b.at - a.at, 1e-4);
    const f = Math.min(Math.max((t - a.at) / span, 0), 1);
    const pa = POSES[a.p];
    const pb = POSES[b.p];
    for (const key of BONE_KEYS) {
      const ra = poseRot(pa, key);
      const rb = poseRot(pb, key);
      out[key] = [
        ra[0] + (rb[0] - ra[0]) * f,
        ra[1] + (rb[1] - ra[1]) * f,
        ra[2] + (rb[2] - ra[2]) * f,
      ];
    }
    out.crouch = (pa.crouch ?? 0) + ((pb.crouch ?? 0) - (pa.crouch ?? 0)) * f;
    // 方向式手臂：兩關鍵的 armAim 向量插值（單邊缺時沿用另一邊）
    const aa = pa.armAim ?? pb.armAim;
    const ab = pb.armAim ?? pa.armAim;
    out.armAim = aa
      ? {
        x: aa.x + (ab.x - aa.x) * f,
        y: aa.y + (ab.y - aa.y) * f,
        z: aa.z + (ab.z - aa.z) * f,
      }
      : null;
  }

  const blended = {};

  return {
    // 觸發一次性動作：'bump'|'overhead'|'spike'|'serve'|'block'|'windup'
    trigger(type) {
      const seq = SEQUENCES[type];
      if (!seq) return;
      // 空中接續：跳躍中換動作（windup→spike 揮擊）延續跳躍弧，不落地重跳
      const carry =
        current && current.seq.jump > 0 && seq.jump > 0
          ? Math.min(current.t / current.seq.dur, 0.5) * seq.dur
          : 0;
      current = { seq, t: carry };
    },
    setHold(type) { hold = type; },
    isIdle() { return current === null; },

    // 在 mixer.update 之後呼叫；回傳本幀跳躍高度（加到模型 y）
    update(dt) {
      let weight = 0;
      let jumpY = 0;
      let usePose = null;

      if (current) {
        current.t += dt;
        const { seq } = current;
        if (current.t >= seq.dur) {
          current = null;
        } else {
          const t = current.t / seq.dur; // 正規化 0..1
          const attack = Math.min(current.t / ATTACK_MS, 1);
          const release = Math.min((seq.dur - current.t) / RELEASE_MS, 1);
          weight = Math.min(attack, release);
          blendKeys(seq, t, blended);
          usePose = blended;
          if (seq.jump > 0) jumpY = seq.jump * Math.sin(t * Math.PI);
          // 落地緩衝：下降段疊上屈膝
          if (seq.land && t > LAND_FROM) {
            const lf = (t - LAND_FROM) / (1 - LAND_FROM);
            blended.crouch = (blended.crouch ?? 0) + POSES.land.crouch * lf;
            blended.Spine = addRot(blended.Spine, POSES.land.Spine, lf);
          }
        }
      }
      if (!usePose && hold && SEQUENCES[hold]) {
        blendKeys(SEQUENCES[hold], 0, blended); // 攔網持姿：停在起始（雙手上舉）
        usePose = blended;
        weight = 1.0;
      }

      if (usePose && weight > 0) {
        for (const key of BONE_KEYS) {
          const bone = bones[key];
          const rot = usePose[key];
          if (!bone || !rot) continue;
          e.set(rot[0] * weight, rot[1] * weight, rot[2] * weight);
          q.setFromEuler(e);
          bone.quaternion.multiply(q); // 疊加在 Idle/Run 取樣之上
        }
        // 方向式手臂：解「上臂骨軸 → 目標世界方向」的局部四元數（不猜歐拉軸）
        // 手肘/手腕 slerp 回 T-Pose 直臂基準——雙手打直、左右對稱
        if (usePose.armAim && tposeRef) {
          inst.getWorldQuaternion(qWorld);
          vWorld.set(usePose.armAim.x, usePose.armAim.y, usePose.armAim.z)
            .normalize()
            .applyQuaternion(qWorld); // 模型空間 → 世界
          for (const side of ['Right', 'Left']) {
            const arm = bones[`${side}Arm`];
            const fore = bones[`${side}ForeArm`];
            if (!arm || !fore) continue;
            vAxis.copy(fore.position).normalize(); // 骨軸（局部恆定：指向子骨）
            arm.parent.getWorldQuaternion(qParent);
            vLocal.copy(vWorld).applyQuaternion(qParent.invert());
            qAbs.setFromUnitVectors(vAxis, vLocal);
            arm.quaternion.slerp(qAbs, weight);
            const refF = tposeRef[`${side}ForeArm`];
            if (refF) fore.quaternion.slerp(refF, weight);
            const hand = bones[`${side}Hand`];
            const refH = tposeRef[`${side}Hand`];
            if (hand && refH) hand.quaternion.slerp(refH, weight);
          }
        }
        if (usePose.crouch) jumpY -= usePose.crouch * weight;
      }
      return jumpY;
    },
  };
}

function addRot(base, extra, f) {
  const b = base ?? ZERO;
  return [b[0] + extra[0] * f, b[1] + extra[1] * f, b[2] + extra[2] * f];
}
