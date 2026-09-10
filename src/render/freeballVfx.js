// Free Ball 3D 視覺特效系統（衝擊波環、起跳揚塵、地面重扣光斑）
import * as THREE from 'three';

export function createFreeballVfx(scene) {
  // 1. 衝擊波環池 (Shockwave Rings)
  const MAX_WAVES = 4;
  const waves = [];
  const waveGeo = new THREE.RingGeometry(0.2, 0.38, 32);

  for (let i = 0; i < MAX_WAVES; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe066,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(waveGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    waves.push({ mesh, mat, life: 0, maxLife: 0.35, startScale: 1, endScale: 5 });
  }

  // 2. 地面重扣撞擊光圈 (Floor Impact Decal)
  const floorGeo = new THREE.RingGeometry(0.25, 0.65, 32);
  const floorMat = new THREE.MeshBasicMaterial({
    color: 0xff416c,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const floorRing = new THREE.Mesh(floorGeo, floorMat);
  floorRing.rotation.x = -Math.PI / 2;
  floorRing.position.y = 0.015;
  floorRing.visible = false;
  scene.add(floorRing);
  let floorLife = 0;

  // 3. 起跳腳底揚塵 (Takeoff Dust Points)
  const DUST_N = 36;
  const dustPos = new Float32Array(DUST_N * 3).fill(-100);
  const dustVel = new Float32Array(DUST_N * 3);
  const dustLife = new Float32Array(DUST_N);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xdfd2c4,
    size: 0.14,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.frustumCulled = false;
  scene.add(dustPoints);

  return {
    /**
     * 在擊球點生成朝向打擊方向的立體擴散衝擊波環
     */
    spawnShockwave(pos, normal = new THREE.Vector3(0, 0, 1), color = 0xffe066, maxRadius = 4.2) {
      const wave = waves.find(w => w.life <= 0) || waves[0];
      wave.mesh.position.copy(pos);
      wave.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
      wave.mat.color.setHex(color);
      wave.life = 0.32;
      wave.maxLife = 0.32;
      wave.endScale = maxRadius;
      wave.mesh.scale.set(1, 1, 1);
      wave.mesh.visible = true;
    },

    /**
     * 生成球體砸地的地面衝擊光環
     */
    spawnFloorImpact(x, z, color = 0xff416c) {
      floorRing.position.set(x, 0.015, z);
      floorMat.color.setHex(color);
      floorRing.scale.set(1, 1, 1);
      floorRing.visible = true;
      floorLife = 0.45;
    },

    /**
     * 生成助跑起跳瞬間的腳底爆破揚塵
     */
    spawnJumpDust(x, z) {
      for (let i = 0; i < 18; i++) {
        const idx = (Math.floor(Math.random() * DUST_N)) * 3;
        dustPos[idx] = x + (Math.random() - 0.5) * 0.35;
        dustPos[idx + 1] = 0.04;
        dustPos[idx + 2] = z + (Math.random() - 0.5) * 0.35;

        const ang = Math.random() * Math.PI * 2;
        const spd = 1.4 + Math.random() * 2.2;
        dustVel[idx] = Math.cos(ang) * spd;
        dustVel[idx + 1] = 0.8 + Math.random() * 1.5;
        dustVel[idx + 2] = Math.sin(ang) * spd;

        dustLife[idx / 3] = 0.35 + Math.random() * 0.25;
      }
      dustGeo.attributes.position.needsUpdate = true;
    },

    update(dt) {
      // 衝擊波生命週期更新
      for (const wave of waves) {
        if (wave.life > 0) {
          wave.life -= dt;
          const p = 1 - Math.max(0, wave.life / wave.maxLife);
          const s = THREE.MathUtils.lerp(1, wave.endScale, p);
          wave.mesh.scale.set(s, s, 1);
          wave.mat.opacity = (1 - p) * 0.9;
          if (wave.life <= 0) wave.mesh.visible = false;
        }
      }

      // 地面光圈生命週期更新
      if (floorLife > 0) {
        floorLife -= dt;
        const p = 1 - Math.max(0, floorLife / 0.45);
        floorRing.scale.set(1 + p * 2.2, 1 + p * 2.2, 1);
        floorMat.opacity = (1 - p) * 0.8;
        if (floorLife <= 0) floorRing.visible = false;
      }

      // 揚塵粒子物理推進
      let anyDust = false;
      for (let i = 0; i < DUST_N; i++) {
        if (dustLife[i] > 0) {
          anyDust = true;
          dustLife[i] -= dt;
          const idx = i * 3;
          dustPos[idx] += dustVel[idx] * dt;
          dustPos[idx + 1] += dustVel[idx + 1] * dt;
          dustPos[idx + 2] += dustVel[idx + 2] * dt;
          dustVel[idx + 1] -= 9.81 * dt; // 重力下墜
          if (dustLife[i] <= 0) dustPos[idx + 1] = -100;
        }
      }
      if (anyDust) dustGeo.attributes.position.needsUpdate = true;
    },
  };
}
