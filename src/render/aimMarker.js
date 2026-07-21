// 瞄準標記：蓄力時在地面顯示落點圈（讀輸入層的瞄準點，不碰 sim）
import * as THREE from 'three';

export function createAimMarker(scene, color = 0xffc857, radius = 0.42) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.12, radius, 32),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  ring.visible = false;
  scene.add(ring);

  return {
    show(point) {
      ring.visible = true;
      ring.position.x = point.x;
      ring.position.z = point.z;
    },
    hide() {
      ring.visible = false;
    },
  };
}
