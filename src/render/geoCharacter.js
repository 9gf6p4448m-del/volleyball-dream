// 幾何關節球員（vow3d 路線：零模型檔、程式拼裝、純色材質、程式化動畫）
// 剪影貼近真實運動員比例；關節軸向自訂＝動畫層完全掌控（不再猜外部骨架軸向）
// 模型空間：面向 +Z、+X＝角色右手側；基準身高 BASE_H，實際身高由 root 縮放
//
// 效能：14 名球員（雙方 6+1 自由人）原本每人 16 個獨立 Mesh＝224 draw calls。
// 改用 InstancedMesh 池——每種幾何一個池（10 池＝10 draw calls），關節階層降級為
// 不可見的 Object3D 骨架（geoAnimator 完全不動，只操作 joints 的 rotation）；
// 每幀把各部件 slot 的 matrixWorld 寫進對應池的 instance（見 createGeoPool +
// matchView.sync 尾端的寫入迴圈）。膚色/髮色/隊色/自由人異色改用 instanceColor
// （材質基底色設白色，乘上 instance color＝直接得到目標色，同 arena.js 觀眾席手法）。
import * as THREE from 'three';

export const BASE_H = 1.85;

// 隊伍配色（夜賽聚光燈下要跳出來：高彩度隊色＋深色短褲＋白鞋）
const TEAM_KIT = {
  A: { jersey: 0x2e7bff, shorts: 0x16223f, trim: 0xbfd8ff },
  B: { jersey: 0xff5340, shorts: 0x3c1512, trim: 0xffd2c4 },
};
// 自由人異色球衣（FIVB：與全隊對比色）——A 隊金黃、B 隊米白
const LIBERO_KIT = {
  A: { jersey: 0xffc531, shorts: 0x16223f, trim: 0x6b5410 },
  B: { jersey: 0xf2f4f8, shorts: 0x3c1512, trim: 0x9aa0ab },
};
// 膚色與髮色池（依 id 決定論取用——12 人不撞臉的精緻感）
const SKINS = [0xe8b08c, 0xd99a72, 0xc98a63, 0xa9714f, 0x8a5a3d];
const HAIRS = [0x20242c, 0x33261c, 0x3d2e1e, 0x151820, 0x4a3423];
const SHOE = 0xf2f4f8;

function idHash(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

// 幾何共用（全部球員同一份 geometry，省記憶體；每種幾何各對應一個 InstancedMesh 池）
let GEO = null;
function geometries() {
  if (GEO) return GEO;
  GEO = {
    hips: new THREE.CapsuleGeometry(0.135, 0.1, 4, 12),
    torso: new THREE.CapsuleGeometry(0.165, 0.34, 4, 14),
    head: new THREE.SphereGeometry(0.125, 18, 14),
    hair: new THREE.SphereGeometry(0.132, 16, 12),
    upperArm: new THREE.CapsuleGeometry(0.058, 0.3, 4, 10),
    forearm: new THREE.CapsuleGeometry(0.05, 0.28, 4, 10),
    hand: new THREE.SphereGeometry(0.055, 10, 8),
    thigh: new THREE.CapsuleGeometry(0.088, 0.42, 4, 10),
    shin: new THREE.CapsuleGeometry(0.062, 0.4, 4, 10),
    shoe: new THREE.BoxGeometry(0.13, 0.09, 0.26),
  };
  // 四肢幾何位移到「樞紐在頂端」：關節 group 旋轉＝繞肩/肘/髖/膝擺動
  GEO.upperArm.translate(0, -0.21, 0);
  GEO.forearm.translate(0, -0.19, 0);
  GEO.thigh.translate(0, -0.26, 0);
  GEO.shin.translate(0, -0.25, 0);
  return GEO;
}

// 每名球員每種部件所需 instance 槽數（雙側肢體＝2，軀幹/頭/髮/骨盆＝1）
const PART_SLOTS = {
  hips: 1, torso: 1, head: 1, hair: 1,
  upperArm: 2, forearm: 2, hand: 2, thigh: 2, shin: 2, shoe: 2,
};

let BODY_MAT = null;
function bodyMaterial() {
  // 白色基底：乘上 instanceColor 直接得到目標色；所有部件材質參數一致，10 池共用一份材質
  if (!BODY_MAT) {
    BODY_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.02 });
  }
  return BODY_MAT;
}

// 建立本場全部球員共用的 InstancedMesh 池（每種幾何一池＝10 draw calls）。
// playerCount＝場上球員數（含雙方自由人），於 createMatchView 一開始、建角色前呼叫。
export function createGeoPool(scene, castShadow, playerCount) {
  const g = geometries();
  const pools = {};
  for (const [key, perPlayer] of Object.entries(PART_SLOTS)) {
    const capacity = Math.max(playerCount * perPlayer, 1);
    const mesh = new THREE.InstancedMesh(g[key], bodyMaterial(), capacity);
    mesh.castShadow = castShadow;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // 球員持續跑動、部件散布全場——base geometry 的 bounding sphere 抓不到實際跨距，
    // 停用 frustum culling（同 matchView 塵土粒子池的既有手法）避免誤剔
    mesh.frustumCulled = false;
    scene.add(mesh);
    pools[key] = { mesh, cursor: 0 };
  }
  const tmpColor = new THREE.Color();
  return {
    // 分配一個 instance 槽並立刻寫入決定論配色；回傳 slot 供逐幀寫矩陣用
    claim(key, colorHex) {
      const p = pools[key];
      const index = p.cursor;
      p.cursor += 1;
      tmpColor.setHex(colorHex);
      p.mesh.setColorAt(index, tmpColor);
      return { key, index };
    },
    // 全部球員建立完成後呼叫一次，把 instanceColor 緩衝區推上 GPU
    finishColors() {
      for (const p of Object.values(pools)) {
        if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
      }
    },
    writeMatrix(slot, matrixWorld) {
      pools[slot.key].mesh.setMatrixAt(slot.index, matrixWorld);
    },
    // 每幀全部球員的矩陣寫完後呼叫一次，推上 GPU
    markDirty() {
      for (const p of Object.values(pools)) p.mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// 建一名球員的關節骨架（不可見 Object3D，不加入 scene）。回傳：
// - root：本地座標系原點（供 matchView 逐幀寫 position/rotation.y）
// - joints：供 geoAnimator 驅動：spine/neck、r/lShoulder、r/lElbow、r/lHip、r/lKnee
// - parts：[{ key, index, node }]，node＝部件 slot 的 Object3D（供 matchView 讀 matrixWorld）
export function createGeoCharacter(pool, playerId, teamId, height, isLibero = false) {
  const kit = isLibero ? LIBERO_KIT[teamId] : TEAM_KIT[teamId];
  const h = idHash(playerId);
  const skin = SKINS[h % SKINS.length];
  const hair = HAIRS[(h >> 3) % HAIRS.length];

  const root = new THREE.Group();
  const joints = {};
  const parts = [];
  const add = (parent, key, colorHex, x, y, z) => {
    const slot = new THREE.Object3D();
    slot.position.set(x, y, z);
    parent.add(slot);
    parts.push({ ...pool.claim(key, colorHex), node: slot });
    return slot;
  };
  const joint = (parent, name, x, y, z) => {
    const j = new THREE.Group();
    j.position.set(x, y, z);
    parent.add(j);
    joints[name] = j;
    return j;
  };

  // 骨盆（短褲）＋雙腿
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.96;
  root.add(pelvis);
  add(pelvis, 'hips', kit.shorts, 0, 0, 0).scale.set(1.05, 0.9, 0.8);
  for (const [side, sx] of [['r', 1], ['l', -1]]) {
    const hip = joint(pelvis, `${side}Hip`, sx * 0.095, -0.04, 0);
    add(hip, 'thigh', kit.shorts, 0, 0, 0); // 及膝運動短褲
    const knee = joint(hip, `${side}Knee`, 0, -0.46, 0);
    add(knee, 'shin', skin, 0, 0, 0);
    add(knee, 'shoe', SHOE, 0, -0.44, 0.05);
  }

  // 軀幹（球衣）→ 頸/頭 → 雙臂
  const spine = joint(pelvis, 'spine', 0, 0.12, 0);
  add(spine, 'torso', kit.jersey, 0, 0.26, 0).scale.set(1.12, 1, 0.8);
  const neck = joint(spine, 'neck', 0, 0.5, 0);
  add(neck, 'head', skin, 0, 0.14, 0);
  // 髮帽：只蓋頭頂與後腦（露臉）——縮扁、上移、後偏
  add(neck, 'hair', hair, 0, 0.195, -0.035).scale.set(0.98, 0.62, 0.95);
  for (const [side, sx] of [['r', 1], ['l', -1]]) {
    const sh = joint(spine, `${side}Shoulder`, sx * 0.225, 0.42, 0);
    add(sh, 'upperArm', kit.jersey, 0, 0, 0); // 短袖
    const el = joint(sh, `${side}Elbow`, 0, -0.32, 0);
    add(el, 'forearm', skin, 0, 0, 0);
    add(el, 'hand', skin, 0, -0.34, 0);
  }

  root.scale.setScalar(height / BASE_H);
  return { root, joints, parts };
}
