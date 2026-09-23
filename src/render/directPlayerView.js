import * as THREE from 'three';
import { resolveKit, getNumberTexture } from './geoCharacter.js';

// Clothing follows the original geometric athlete. Every visible limb surface is
// still the exact sim capsule; there is no render-only gait or contact retiming.
export function createDirectPlayerView(scene) {
  const group = new THREE.Group();
  group.name = 'direct-player';
  scene.add(group);
  const kit = resolveKit('A', false);
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const material = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
  const materials = {
    shirt: material(kit.jersey, 0.65),
    skin: material(0xe8b08c),
    shorts: material(kit.shorts),
    shoes: material(0xf2f4f8, 0.6),
    hair: material(0x20242c),
    active: new THREE.MeshStandardMaterial({ color: 0xf3cb72, emissive: 0x7c4e16, emissiveIntensity: 0.22, roughness: 0.6 }),
  };
  // Colour the head surface itself: the hair never enlarges the contact volume.
  const headGeometry = sphere.clone();
  const positions = headGeometry.getAttribute('position');
  const indices = headGeometry.index;
  headGeometry.clearGroups();
  const headFaces = [[], []];
  for (let i = 0; i < indices.count; i += 3) {
    let y = 0, z = 0;
    for (let j = 0; j < 3; j++) { const v = indices.getX(i + j); y += positions.getY(v) / 3; z += positions.getZ(v) / 3; }
    const faces = headFaces[y > 0.35 || (z > 0.25 && y > -0.4) ? 1 : 0];
    for (let j = 0; j < 3; j++) faces.push(indices.getX(i + j));
  }
  headGeometry.setIndex([...headFaces[0], ...headFaces[1]]);
  headGeometry.addGroup(0, headFaces[0].length, 0);
  headGeometry.addGroup(headFaces[0].length, headFaces[1].length, 1);
  // Reuse the original player's number texture, fitted to the jersey's surface.
  const numberGeometry = new THREE.PlaneGeometry(1, 1);
  const numberMaterial = new THREE.MeshBasicMaterial({ map: getNumberTexture(1, 0xffffff), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const number = new THREE.Mesh(numberGeometry, numberMaterial);
  group.add(number);
  const parts = new Map();
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const right = new THREE.Vector3(), spine = new THREE.Vector3(), back = new THREE.Vector3();
  const torsoEnd = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const orient = new THREE.Quaternion();
  function mesh(geometry, mat) {
    const result = new THREE.Mesh(geometry, mat);
    result.castShadow = true;
    group.add(result);
    return result;
  }
  function tube(mesh, a, b, radius) {
    direction.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const length = direction.length();
    mesh.visible = length > 1e-6;
    mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.scale.set(radius, length, radius);
    if (length > 1e-6) mesh.quaternion.setFromUnitVectors(up, direction.normalize());
  }
  return {
    sync(pose) {
      const torso = pose.find(p => p.id === 'torso');
      const hips = pose.find(p => p.id === 'hips');
      if (torso && hips) {
        right.set(hips.b.x - hips.a.x, hips.b.y - hips.a.y, hips.b.z - hips.a.z).normalize();
        spine.set(torso.b.x - torso.a.x, torso.b.y - torso.a.y, torso.b.z - torso.a.z).normalize();
        back.crossVectors(right, spine).normalize();
        spine.crossVectors(back, right).normalize();
        basis.makeBasis(right, spine, back);
        orient.setFromRotationMatrix(basis);
        torsoEnd.set(torso.b.x, torso.b.y, torso.b.z);
        number.position.set(torso.a.x, torso.a.y, torso.a.z).lerp(torsoEnd, 0.69).addScaledVector(back, torso.radius * 1.006);
        number.quaternion.copy(orient);
        number.scale.setScalar(torso.radius * 1.15);
      }
      for (const segment of pose) {
        let meshes = parts.get(segment.id);
        const shirtSleeve = segment.id.endsWith('upper-arm');
        const shortsLeg = segment.id.endsWith('thigh');
        const split = shirtSleeve || shortsLeg;
        if (!meshes) {
          if (segment.part === 'head') {
            meshes = [mesh(headGeometry, [materials.skin, materials.hair])];
          } else {
            meshes = [mesh(cylinder), mesh(sphere), mesh(sphere)];
            if (split) meshes.push(mesh(cylinder));
          }
          parts.set(segment.id, meshes);
        }
        const { a, b, radius } = segment;
        if (segment.part === 'head') {
          meshes[0].position.set(a.x, a.y, a.z);
          meshes[0].scale.setScalar(radius);
          meshes[0].quaternion.copy(orient);
          continue;
        }
        const mat = segment.active ? materials.active
          : segment.part === 'foot' ? materials.shoes
            : segment.part === 'hips' ? materials.shorts
              : segment.part === 'torso' && segment.id !== 'neck' ? materials.shirt : materials.skin;
        meshes.forEach(mesh => { mesh.material = mat; });
        if (split) {
          const amount = shirtSleeve ? 0.48 : 0.56;
          const seam = { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount, z: a.z + (b.z - a.z) * amount };
          meshes[0].material = meshes[1].material = shirtSleeve ? materials.shirt : materials.shorts;
          tube(meshes[0], a, seam, radius);
          tube(meshes[3], seam, b, radius);
        } else tube(meshes[0], a, b, radius);
        meshes[1].position.set(a.x, a.y, a.z);
        meshes[2].position.set(b.x, b.y, b.z);
        meshes[1].scale.setScalar(radius);
        meshes[2].scale.setScalar(radius);
        // Degenerate hand capsules need one sphere, not duplicate surfaces.
        meshes[2].visible = a.x !== b.x || a.y !== b.y || a.z !== b.z;
      }
    },
    dispose() {
      scene.remove(group);
      sphere.dispose(); cylinder.dispose(); headGeometry.dispose(); numberGeometry.dispose(); numberMaterial.dispose();
      Object.values(materials).forEach(material => material.dispose());
      // getNumberTexture is shared with the original match renderer; its owner
      // retains the texture across practice restarts.
    },
  };
}
