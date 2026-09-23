import * as THREE from 'three';

// The visible body is the simulation's capsule geometry, not an independently animated rig.
export function createDirectPlayerView(scene) {
  const group = new THREE.Group();
  group.name = 'direct-player';
  scene.add(group);
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const materials = {
    shirt: new THREE.MeshStandardMaterial({ color: 0x168d9a, roughness: 0.65 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xe8b390, roughness: 0.8 }),
    legs: new THREE.MeshStandardMaterial({ color: 0x192c43, roughness: 0.8 }),
    active: new THREE.MeshStandardMaterial({ color: 0xf3cb72, emissive: 0x7c4e16, emissiveIntensity: 0.22, roughness: 0.6 }),
  };
  const parts = new Map();
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  return {
    sync(pose) {
      for (const segment of pose) {
        let meshes = parts.get(segment.id);
        if (!meshes) {
          meshes = [new THREE.Mesh(cylinder), new THREE.Mesh(sphere), new THREE.Mesh(sphere)];
          meshes.forEach(mesh => { mesh.castShadow = true; group.add(mesh); });
          parts.set(segment.id, meshes);
        }
        const name = `${segment.id} ${segment.part}`.toLowerCase();
        const material = segment.active ? materials.active
          : /head|hand|arm|palm/.test(name) ? materials.skin
            : /leg|foot|thigh|shin/.test(name) ? materials.legs : materials.shirt;
        meshes.forEach(mesh => { mesh.material = material; });
        const { a, b, radius } = segment;
        direction.set(b.x - a.x, b.y - a.y, b.z - a.z);
        const length = direction.length();
        meshes[0].visible = length > 1e-6;
        meshes[0].position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        meshes[0].scale.set(radius, length, radius);
        if (length > 1e-6) meshes[0].quaternion.setFromUnitVectors(up, direction.normalize());
        meshes[1].position.set(a.x, a.y, a.z);
        meshes[2].position.set(b.x, b.y, b.z);
        meshes[1].scale.setScalar(radius);
        meshes[2].scale.setScalar(radius);
      }
    },
    dispose() {
      scene.remove(group);
      sphere.dispose();
      cylinder.dispose();
      Object.values(materials).forEach(material => material.dispose());
    },
  };
}
