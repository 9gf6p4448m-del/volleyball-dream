// 幾何關節球員（vow3d 路線：零模型檔、程式拼裝、純色材質、程式化動畫）
// 剪影貼近真實運動員比例；關節軸向自訂＝動畫層完全掌控（不再猜外部骨架軸向）
// 模型空間：面向 +Z、+X＝角色右手側；基準身高 BASE_H，實際身高由 root 縮放
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

// 幾何共用（12 人同一份 geometry，省記憶體；材質依隊/膚色快取）
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

const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshStandardMaterial({
      color, roughness: 0.82, metalness: 0.02,
    }));
  }
  return matCache.get(color);
}

// 建一名球員。回傳 { root, joints }——joints 供 geoAnimator 驅動：
// spine/neck、r/lShoulder、r/lElbow、r/lHip、r/lKnee（rotation 全從 0 起算）
export function createGeoCharacter(playerId, teamId, height, castShadow, isLibero = false) {
  const g = geometries();
  const kit = isLibero ? LIBERO_KIT[teamId] : TEAM_KIT[teamId];
  const h = idHash(playerId);
  const skin = mat(SKINS[h % SKINS.length]);
  const hair = mat(HAIRS[(h >> 3) % HAIRS.length]);

  const root = new THREE.Group();
  const joints = {};
  const meshes = [];
  const add = (parent, geo, material, x, y, z) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = castShadow;
    parent.add(m);
    meshes.push(m);
    return m;
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
  add(pelvis, g.hips, mat(kit.shorts), 0, 0, 0).scale.set(1.05, 0.9, 0.8);
  for (const [side, sx] of [['r', 1], ['l', -1]]) {
    const hip = joint(pelvis, `${side}Hip`, sx * 0.095, -0.04, 0);
    add(hip, g.thigh, mat(kit.shorts), 0, 0, 0); // 及膝運動短褲
    const knee = joint(hip, `${side}Knee`, 0, -0.46, 0);
    add(knee, g.shin, skin, 0, 0, 0);
    add(knee, g.shoe, mat(SHOE), 0, -0.44, 0.05);
  }

  // 軀幹（球衣）→ 頸/頭 → 雙臂
  const spine = joint(pelvis, 'spine', 0, 0.12, 0);
  add(spine, g.torso, mat(kit.jersey), 0, 0.26, 0).scale.set(1.12, 1, 0.8);
  const neck = joint(spine, 'neck', 0, 0.5, 0);
  add(neck, g.head, skin, 0, 0.14, 0);
  // 髮帽：只蓋頭頂與後腦（露臉）——縮扁、上移、後偏
  const hairM = add(neck, g.hair, hair, 0, 0.195, -0.035);
  hairM.scale.set(0.98, 0.62, 0.95);
  for (const [side, sx] of [['r', 1], ['l', -1]]) {
    const sh = joint(spine, `${side}Shoulder`, sx * 0.225, 0.42, 0);
    add(sh, g.upperArm, mat(kit.jersey), 0, 0, 0); // 短袖
    const el = joint(sh, `${side}Elbow`, 0, -0.32, 0);
    add(el, g.forearm, skin, 0, 0, 0);
    add(el, g.hand, skin, 0, -0.34, 0);
  }

  root.scale.setScalar(height / BASE_H);
  return { root, joints, meshes };
}
