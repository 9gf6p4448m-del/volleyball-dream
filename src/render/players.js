// 12 名寫實比例球員：載入 GLB（Mixamo 系動捕動畫）、SkeletonUtils 複製、各自獨立 AnimationMixer
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { COURT } from '../sim/constants.js';

// 12 名球員身高（公尺）——寫實差異；超過 12 人時循環取用
const HEIGHTS = [1.98, 1.85, 1.72, 1.9, 2.02, 1.8, 1.95, 1.88, 1.7, 1.92, 2.0, 1.78];
// 動畫指派模式（固定序列，決定論；TPose 排除）
const CLIP_PATTERN = ['Idle', 'Idle', 'Walk', 'Idle', 'Run', 'Walk'];

export async function createPlayers(scene, quality) {
  const gltf = await new GLTFLoader().loadAsync(
    `${import.meta.env.BASE_URL}models/${quality.model}`,
  );
  const source = gltf.scene;
  const clips = gltf.animations;

  const bbox = new THREE.Box3().setFromObject(source);
  const baseHeight = bbox.max.y - bbox.min.y || 1;

  const castShadow = quality.shadowSize > 0;
  const mixers = [];
  const spots = formation(quality.players);

  spots.forEach((spot, i) => {
    const inst = cloneSkeleton(source);
    inst.scale.setScalar(HEIGHTS[i % HEIGHTS.length] / baseHeight);
    inst.position.set(spot.x, 0, spot.z);
    inst.rotation.y = spot.z > 0 ? Math.PI : 0; // 面向球網
    inst.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = castShadow;
        o.frustumCulled = false; // 蒙皮網格骨架動作會超出原始包圍盒，關掉避免消失
      }
    });
    scene.add(inst);

    const mixer = new THREE.AnimationMixer(inst);
    const clip = pickClip(clips, i);
    if (clip) {
      mixer.clipAction(clip).play();
      mixer.update((i * 0.37) % clip.duration); // 錯開起始相位，避免 12 人同步踏步
    }
    mixers.push(mixer);
  });

  return {
    count: spots.length,
    update(dt) {
      for (const m of mixers) m.update(dt);
    },
  };
}

function pickClip(clips, i) {
  if (clips.length === 0) return null;
  const wanted = CLIP_PATTERN[i % CLIP_PATTERN.length];
  return (
    clips.find((c) => c.name === wanted) ??
    clips.find((c) => c.name !== 'TPose') ??
    clips[0]
  );
}

// 前 12 人站標準 6v6 站位（前排 ×3＋後排 ×3 兩側對稱）；多出的人排在場邊
function formation(n) {
  const spots = [];
  for (const zAbs of [2.5, 6.5]) {
    for (const x of [-3, 0, 3]) {
      for (const side of [1, -1]) {
        spots.push({ x, z: zAbs * side });
      }
    }
  }
  const benchX = COURT.WIDTH / 2 + COURT.FREE_ZONE + 1;
  for (let k = 12; k < n; k += 1) {
    const idx = k - 12;
    const col = Math.floor(idx / 12);
    const row = idx % 12;
    const side = col % 2 === 0 ? 1 : -1;
    spots.push({
      x: side * (benchX + Math.floor(col / 2) * 1.2),
      z: (row - 5.5) * 1.6,
    });
  }
  return spots.slice(0, n);
}
