// Free Ball 風格動態光圈指示器：地面投影圈（Shadow Ring）＋收斂時機圈（Convergence Timing Ring）
// 解決手機 3D 空間視知覺不足，提供節奏遊戲般的直覺時機判定反饋
import * as THREE from 'three';

const COLOR_PERFECT = 0x38ef7d; // 翠綠色
const COLOR_GOOD = 0xffd166;    // 金黃色
const COLOR_NORMAL = 0x6ee7ff;  // 天藍色
const COLOR_MISS = 0xff4b4b;    // 亮紅色

export function createBallIndicator(scene) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // 1. 地面內環：陰影落點環（越近地越清晰、半徑越小）
  const innerGeo = new THREE.RingGeometry(0.32, 0.42, 32);
  const innerMat = new THREE.MeshBasicMaterial({
    color: COLOR_NORMAL,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const innerRing = new THREE.Mesh(innerGeo, innerMat);
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.02;
  group.add(innerRing);

  // 地面中心實心點：方便精準定錨
  const dotGeo = new THREE.CircleGeometry(0.08, 16);
  const dotMat = new THREE.MeshBasicMaterial({
    color: COLOR_NORMAL,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const centerDot = new THREE.Mesh(dotGeo, dotMat);
  centerDot.rotation.x = -Math.PI / 2;
  centerDot.position.y = 0.021;
  group.add(centerDot);

  // 2. 地面外環：收斂時機環（隨高度與時間向內坍縮，重合時為最佳擊球時機）
  const outerGeo = new THREE.RingGeometry(0.9, 1.0, 32);
  const outerMat = new THREE.MeshBasicMaterial({
    color: COLOR_NORMAL,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const outerRing = new THREE.Mesh(outerGeo, outerMat);
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.022;
  group.add(outerRing);

  return {
    group,

    /**
     * 更新光圈狀態
     * @param {{x: number, y: number, z: number}} ballPos 當前球位置
     * @param {number} targetHitY 目標擊球高度（扣球約 2.5~2.8m，接球約 0.9m）
     * @param {number} vy 當前球垂直速度
     */
    update(ballPos, targetHitY = 2.6, vy = 0) {
      if (!ballPos || ballPos.y < 0.1) {
        group.visible = false;
        return;
      }
      group.visible = true;

      // 投影至地面
      group.position.x = ballPos.x;
      group.position.z = ballPos.z;

      // 內環：高度越高稍微擴大且變淡
      const heightAboveGround = Math.max(0, ballPos.y);
      const innerScale = 1.0 + Math.min(heightAboveGround, 6.0) * 0.06;
      innerRing.scale.set(innerScale, innerScale, 1);
      innerMat.opacity = Math.max(0.25, Math.min(0.85, 0.9 - heightAboveGround * 0.08));

      // 外環收斂計算：
      // 當 ballPos.y 剛好等於 targetHitY 且正在下落時，收斂比率為 1.0（與內環完全重疊）
      const heightAboveTarget = ballPos.y - targetHitY;
      const isFalling = vy < 0;

      let convergenceRatio = 1.0;
      if (heightAboveTarget > 0) {
        // 球在擊球點之上：向內收縮，高度差越小越接近 1.0
        convergenceRatio = 1.0 + heightAboveTarget * 0.65;
      } else {
        // 球已墜破擊球點：向內縮得更小（代表過晚）
        convergenceRatio = Math.max(0.4, 1.0 + heightAboveTarget * 0.4);
      }

      const outerScale = innerScale * convergenceRatio;
      outerRing.scale.set(outerScale, outerScale, 1);

      // 顏色反饋：
      // 當 outerScale 與 innerScale 差距極小時，點亮 PERFECT（綠色）
      const diff = Math.abs(outerScale - innerScale);
      if (diff < 0.12 && isFalling) {
        outerMat.color.setHex(COLOR_PERFECT);
        innerMat.color.setHex(COLOR_PERFECT);
        dotMat.color.setHex(COLOR_PERFECT);
        outerMat.opacity = 0.95;
      } else if (diff < 0.32 && isFalling) {
        outerMat.color.setHex(COLOR_GOOD);
        innerMat.color.setHex(COLOR_GOOD);
        dotMat.color.setHex(COLOR_GOOD);
        outerMat.opacity = 0.8;
      } else if (heightAboveTarget < -0.3) {
        // 錯過擊球點（太晚）
        outerMat.color.setHex(COLOR_MISS);
        innerMat.color.setHex(COLOR_MISS);
        dotMat.color.setHex(COLOR_MISS);
        outerMat.opacity = 0.5;
      } else {
        outerMat.color.setHex(COLOR_NORMAL);
        innerMat.color.setHex(COLOR_NORMAL);
        dotMat.color.setHex(COLOR_NORMAL);
        outerMat.opacity = 0.7;
      }
    },

    hide() {
      group.visible = false;
    },

    dispose() {
      innerGeo.dispose();
      innerMat.dispose();
      outerGeo.dispose();
      outerMat.dispose();
      dotGeo.dispose();
      dotMat.dispose();
      scene.remove(group);
    },
  };
}
