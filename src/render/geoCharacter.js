// 幾何關節球員（vow3d 路線：零模型檔、程式拼裝、純色材質、程式化動畫）
// 剪影貼近真實運動員比例；關節軸向自訂＝動畫層完全掌控（不再猜外部骨架軸向）
// 模型空間：面向 +Z、頭 +Y。**角色右手側＝-X**（three.js 右手座標系：面向 +Z 站著，
// 右手在 -X 那邊）——07-28 Sawmah 試玩抓到「怎麼是左手扣球」：原本 r 側掛在 +X，
// 等於全隊的左右手從建模那一刻就是鏡像的。基準身高 BASE_H，實際身高由 root 縮放
//
// 效能：14 名球員（雙方 6+1 自由人）原本每人 16 個獨立 Mesh＝224 draw calls。
// 改用 InstancedMesh 池——每種幾何一個池（配色卷批 2 加 cuff/sideStripe 兩池後
// 共 12 池＝12 draw calls，背號面片另計、走獨立 Mesh 不進池，見 N4），關節階層降級為
// 不可見的 Object3D 骨架（geoAnimator 完全不動，只操作 joints 的 rotation）；
// 每幀把各部件 slot 的 matrixWorld 寫進對應池的 instance（見 createGeoPool +
// matchView.sync 尾端的寫入迴圈）。膚色/髮色/隊色/自由人異色改用 instanceColor
// （材質基底色設白色，乘上 instance color＝直接得到目標色，同 arena.js 觀眾席手法）。
import * as THREE from 'three';
import { numberTextColor } from '../career/teamKit.js';

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
// 配色卷批 1（08-24）：隊伍 kit 覆寫——kit＝該隊 def 的配色物件（career/teamKit.js
// 的 kitFor 供給；shape 見該檔）。null＝回落側別預設（快速比賽／練習賽／無 kit 的隊）。
// 純函式、node 直測（驗收 K5 回退安全）。
export function resolveKit(teamId, isLibero, kit = null) {
  const fallback = isLibero ? LIBERO_KIT[teamId] : TEAM_KIT[teamId];
  if (kit) return (isLibero ? kit.libero : kit) ?? fallback;
  return fallback;
}

const SKINS = [0xe8b08c, 0xd99a72, 0xc98a63, 0xa9714f, 0x8a5a3d];
const HAIRS = [0x20242c, 0x33261c, 0x3d2e1e, 0x151820, 0x4a3423];
const SHOE = 0xf2f4f8;

function idHash(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

// 32-bit 雪崩混合（murmur3 fmix32）：idHash 是 ×31 累加，短字串的輸出值本身就很小
// ——`A1` 只有 2064，任何 `>>> k`（k≥11）恆為 0、k≤7 又與字元碼強相關。
// 混過一輪才讓「一個字元之差」散布到整個 32-bit 空間。純算術、無 rng、決定論。
function mix32(x) {
  let h = x >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

// Phase 5 W1 §1b 慣用手（本輪只做視覺層＋步序，戰術層明定不做）：決定論分佈約 15% 左手。
//
// 07-29 修（W1 驗收第 7 項「場上永遠看不到左手」）：原版吃 `idHash(playerId) >>> 7`，
// 但 sim 的 playerId 是固定字面 `${team}${i+1}`（`src/sim/game.js:1450`）——
// **全遊戲的 id 母體只有 A1..A6/B1..B6/AL/BL/BR1..BR5 這十幾個短字串**，
// 兩個問題疊在一起：①母體太小，分佈由這十幾個值的雜湊落點決定，不是統計量
// ②短字串 ×31 累加的值太小，`>>> 7` 幾乎只剩最高幾個位元 ⇒ 實測 12 人 100% 右手。
//
// 修法：雜湊鍵改吃**球員身分**——`name` 優先、缺席才回落 id。
//   ・慣用手跟著「人」，不跟輪轉槽位：生涯球員換先發順序／被遞補頂替都不會換手
//   ・不吃 `game.seed`：同一名生涯球員跨場次、跨種子恆同一手
//   ・母體變成全專案的球員名（七隊 squad ＋替補＋我方＋招募生，命名工程保證不撞名）
// 決定論不變（純字串雜湊），不得改用 Math.random。
export function isLeftHanded(playerId, name = '') {
  const key = name || playerId || '';
  return (mix32(idHash(key)) % 100) < 15;
}

// 幾何共用（全部球員同一份 geometry，省記憶體；每種幾何各對應一個 InstancedMesh 池）。
// export＝供測試直讀真實幾何參數（如 .parameters.radius）驗證 trim 凸出量，不是給
// 渲染層外部呼叫（渲染層一律走 createGeoPool/createGeoCharacter）。
let GEO = null;
export function geometries() {
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
    // 隊伍配色卷批 2（trim 幾何細節，F3 對抗覆審修正 2026-08-24）：袖口（套在袖口的環）
    // ＋側條（軀幹兩側的窄板），kit.trim 色，走既有 InstancedMesh 池同一套模式
    // （新增 2 池，見 PART_SLOTS）。
    // ★ F3 修前用的是「領圈」，數學驗過整個埋在軀幹裡看不見：領圈外半徑 0.112 <
    // 該高度軀幹半徑 0.131，且頭底 y=0.515 低於軀幹頂 y=0.595——頸部零縫隙，領圈在
    // 這個模型結構上不可行（不是調數字能救，頭直接蓋住脖子）。改做袖口：套在
    // upperArm（球衣袖）末端，同一顆 torus 幾何，只是改尺寸/位置/掛點，見下方
    // createGeoCharacter 的掛法。
    cuff: new THREE.TorusGeometry(0.062, 0.012, 8, 20),
    // sideStripe：F3 修前掛在 z=0.03、x=±0.145——軀幹在該處表面 x=0.180，
    // 整條埋在軀幹裡（0.145<0.180）。改到真側面 z=0（該處表面 x=0.1848＝
    // 0.165 半徑×1.12 縮放），box 中心 x=±0.188、半厚 0.006 → 外緣 0.194（凸出
    // 表面 0.0092m）、內緣 0.182（嵌入表面 0.0028m，不懸空）；高度 0.28 置中在
    // 軀幹圓柱段（非球冠端蓋）y∈[0.09,0.43] 內，見下方掛法。
    sideStripe: new THREE.BoxGeometry(0.012, 0.28, 0.04),
  };
  // 四肢幾何位移到「樞紐在頂端」：關節 group 旋轉＝繞肩/肘/髖/膝擺動
  GEO.upperArm.translate(0, -0.21, 0);
  GEO.forearm.translate(0, -0.19, 0);
  GEO.thigh.translate(0, -0.26, 0);
  GEO.shin.translate(0, -0.25, 0);
  // Torus 預設躺在 XY 平面（孔洞軸＝Z）；立起 90° 讓孔洞軸變 Y，套住沿 Y 軸延伸的
  // 手臂（同下方 upperArm/forearm 的軸向）
  GEO.cuff.rotateX(Math.PI / 2);
  return GEO;
}

// 每名球員每種部件所需 instance 槽數（雙側肢體＝2，軀幹/頭/髮/骨盆＝1）
const PART_SLOTS = {
  hips: 1, torso: 1, head: 1, hair: 1,
  upperArm: 2, forearm: 2, hand: 2, thigh: 2, shin: 2, shoe: 2,
  cuff: 2, sideStripe: 2,
};

let BODY_MAT = null;
function bodyMaterial() {
  // 白色基底：乘上 instanceColor 直接得到目標色；所有部件材質參數一致，10 池共用一份材質
  if (!BODY_MAT) {
    BODY_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.02 });
  }
  return BODY_MAT;
}

// 建立本場全部球員共用的 InstancedMesh 池（每種幾何一池＝12 draw calls，含 trim）。
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
// name＝球員名（慣用手的雜湊鍵，見 isLeftHanded）。省略＝回落 playerId：
// 立牌／儀式／開卡三個靜態舞台不播助跑，handed 在那裡不被消費（geoAnimator 只用它
// 鏡像 approach3/4 的步序），所以只有 matchView 需要餵真名
// number（隊伍配色卷批 2，N2/N4）：背號（全名冊 1 起連號，見 career/teamKit.js
// numbersForRoster）；null＝不建背號面片槽位（僅供呼叫端明確不要背號的場景使用，
// 正式比賽路徑全名冊皆有值，見 F1 對抗覆審修正）
export function createGeoCharacter(
  pool, playerId, teamId, height, isLibero = false, name = '', teamKit = null, number = null,
) {
  const kit = resolveKit(teamId, isLibero, teamKit);
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

  // 骨盆（短褲）＋雙腿。4.7 動作重製：pelvis 升格為**可驅動關節**（髖肩分離要它
  // 能獨立於軀幹轉）——預設 rotation 0＝既有動作外觀一格不變
  const pelvis = joint(root, 'pelvis', 0, 0.96, 0);
  add(pelvis, 'hips', kit.shorts, 0, 0, 0).scale.set(1.05, 0.9, 0.8);
  // sx：r＝-1（-X 才是角色右側，見檔頭），l＝+1
  for (const [side, sx] of [['r', -1], ['l', 1]]) {
    const hip = joint(pelvis, `${side}Hip`, sx * 0.095, -0.04, 0);
    add(hip, 'thigh', kit.shorts, 0, 0, 0); // 及膝運動短褲
    const knee = joint(hip, `${side}Knee`, 0, -0.46, 0);
    add(knee, 'shin', skin, 0, 0, 0);
    add(knee, 'shoe', SHOE, 0, -0.44, 0.05);
  }

  // 軀幹（球衣）→ 胸椎 → 頸/頭 → 雙臂。
  // 4.7 動作重製：脊椎分兩節——`spine`（腰／下段，既有名稱與位置不動，動畫層舊欄位
  // 照樣驅動它）＋ `spineUpper`（胸／上段，帶著頸與雙肩）。弓身→收腹的輪廓要兩節
  // 才做得出來。**插入層的位置數學等價**（0.3+0.2=0.5、0.3+0.12=0.42），
  // 新關節預設 rotation 0 → 所有既有姿勢外觀不變
  const spine = joint(pelvis, 'spine', 0, 0.12, 0);
  add(spine, 'torso', kit.jersey, 0, 0.26, 0).scale.set(1.12, 1, 0.8);
  // trim 側條（配色卷批 2，領圈/袖口/側條擇二之一；F3 對抗覆審修正 2026-08-24）：
  // 真側面 z=0（軀幹在該處表面 x=0.165*1.12=0.1848）；box 中心 x=±0.188、半厚
  // 0.006 → 外緣 0.194 凸出表面 0.0092m、內緣 0.182 嵌入表面 0.0028m（不懸空、
  // 也沒整條埋進去，見 geometries() 註解的完整驗算）。y=0.26 置中、高度 0.28
  // （y∈[0.12,0.40]）落在軀幹圓柱段 [0.09,0.43] 內，不切到球冠端蓋。
  for (const [side, sx] of [['r', -1], ['l', 1]]) {
    add(spine, 'sideStripe', kit.trim, sx * 0.188, 0.26, 0);
  }
  const chest = joint(spine, 'spineUpper', 0, 0.3, 0);
  const neck = joint(chest, 'neck', 0, 0.2, 0);
  add(neck, 'head', skin, 0, 0.14, 0);
  // 髮帽：只蓋頭頂與後腦（露臉）——縮扁、上移、後偏
  add(neck, 'hair', hair, 0, 0.195, -0.035).scale.set(0.98, 0.62, 0.95);
  for (const [side, sx] of [['r', -1], ['l', 1]]) {
    const sh = joint(chest, `${side}Shoulder`, sx * 0.225, 0.12, 0);
    add(sh, 'upperArm', kit.jersey, 0, 0, 0); // 短袖
    // trim 袖口（擇二之二；F3 對抗覆審修正，取代原本埋在軀幹裡看不見的領圈）：
    // 套在袖口/前臂交界處——同 rElbow/lElbow 關節位置（y=-0.32，upperArm capsule
    // 半徑 0.058 已 translate(0,-0.21,0) 到頂端在肩、底端約 -0.42），torus 外緣
    // 0.062+0.012=0.074 凸出臂面 0.016m、內緣 0.062-0.012=0.05 嵌入臂面 0.008m
    // （見 geometries() 註解），孔洞軸沿手臂長軸（Y），掛在 sh（肩關節）同一父層。
    add(sh, 'cuff', kit.trim, 0, -0.32, 0);
    const el = joint(sh, `${side}Elbow`, 0, -0.32, 0);
    add(el, 'forearm', skin, 0, 0, 0);
    // 手腕（4.7）：觸球瞬間的壓腕 snap 是排球辨識度最高的一幀。
    // 手掌從掛在肘下 -0.34 改為掛在腕關節（同座標）下的原點＝位置等價
    const wr = joint(el, `${side}Wrist`, 0, -0.34, 0);
    add(wr, 'hand', skin, 0, 0, 0);
  }

  // 背號面片槽位（配色卷批 2，N2/N4；F1 對抗覆審修正 2026-08-24）：不進 InstancedMesh
  // 池——每人號碼各異、貼圖各自快取（見下方 getNumberTexture）。這裡只建「貼齊點」
  // （Object3D，非 Mesh，不會被加進 scene，本函式不碰 scene，建置成本可忽略）；
  // matchView 逐幀複製其 matrixWorld 到獨立建立的真實 Mesh 上（同 pool.writeMatrix
  // 的手法：讀關節樹的世界矩陣，不重算一次位置數學）。
  // ★ F1：現在 number 對全名冊（含板凳）都有值（見 teamKit.numbersForRoster），
  // 這裡槽位一律建；真正的 Mesh 何時建（開場上場者立刻建／板凳等 SUBSTITUTION
  // 事件才惰性建）是 matchView 的政策，不在這層決定——number＝null 只留給
  // 呼叫端明確不想要背號的場景（如本檔內建預設、node 單測）。
  let numberSlots = null;
  if (number != null) {
    const textColor = numberTextColor(kit.jersey);
    const back = new THREE.Object3D();
    back.position.set(0, 0.34, -0.14); // 背後、略高於腰——真實球衣背號慣例
    back.rotation.y = Math.PI; // 面向 -Z（背後）；Y 軸旋轉是正規變換，文字不會鏡像
    spine.add(back);
    const front = new THREE.Object3D();
    front.position.set(0, 0.36, 0.14); // 胸前，略高於背號（真實球衣慣例）；面向 +Z
    spine.add(front);
    numberSlots = {
      back: { node: back, number, color: textColor, size: 0.2 },
      front: { node: front, number, color: textColor, size: 0.09 },
    };
  }

  root.scale.setScalar(height / BASE_H);
  // 慣用手（視覺層）：決定論、綁球員身分（name 優先，見 isLeftHanded）——
  // geoAnimator 只用它鏡像助跑步序方向，
  // 不影響揮擊臂（壓腕/扣球仍恆用 r 側，戰術層鏡像本輪不做，見 §1b）
  const handed = isLeftHanded(playerId, name) ? 'l' : 'r';
  return {
    root, joints, parts, handed, numberSlots,
  };
}

// ---- 背號貼圖快取（N4）----
// key＝`${number}:${colorHex}`；同號碼同色只建一份 CanvasTexture，重複取用回同一實例
// （渲染層省重建/GPU 重上傳；也是 N2「同號碼同色」的視覺一致性保證）。
// node 測試環境沒有 document——偵測不到就退化成最小 stub（不觸發真正繪製），
// 快取「命中回同一物件」這件事本身在兩種環境下行為一致，可直接 node 斷言。
const numberTextureCache = new Map();
export function getNumberTexture(number, colorHex) {
  const key = `${number}:${colorHex}`;
  const hit = numberTextureCache.get(key);
  if (hit) return hit;
  const size = 128;
  let canvas;
  if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `#${(colorHex >>> 0).toString(16).padStart(6, '0')}`;
    ctx.fillText(String(number), size / 2, size / 2 + 6);
  } else {
    canvas = { width: size, height: size }; // node 測試 stub：不繪製，只驗快取身分
  }
  const texture = new THREE.CanvasTexture(canvas);
  numberTextureCache.set(key, texture);
  return texture;
}
