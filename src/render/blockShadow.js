// W4(P4) 附錄 B-3 — 封線影子（與 B-1 同批工程；純表現層、沿燈光/地板語彙）：
// 配套下達後，我方半場地板浮現佈陣可視化——封住的線＝暗牆影、留給後排的線＝微亮。
// 非落點提示（不預測球）：畫的是玩家自己的佈陣。sim 零依賴
import * as THREE from 'three';
import { COURT } from '../sim/constants.js';

export function createBlockShadow(scene) {
  const group = new THREE.Group();
  const mk = (w, l) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, l),
      new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0, depthWrite: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    group.add(m);
    return m;
  };
  // 直線走廊（沿 z 縱帶）、斜線走廊（斜帶）、吊球短區（前區橫帶）
  const lineStrip = mk(1.8, 6.4);
  const crossStrip = mk(1.8, 7.6);
  const tipZone = mk(COURT.WIDTH, 2.6);
  scene.add(group);

  const paint = (mesh, mode) => {
    // mode：'wall'＝封住的線（暗牆影）／'open'＝留給後排的線（微亮）／null＝隱藏
    if (!mode) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.material.color.setHex(mode === 'wall' ? 0x000000 : 0x6ee7ff);
    mesh.material.opacity = mode === 'wall' ? 0.32 : 0.10;
  };

  return {
    // schemeKey：'block-line'|'block-cross'|'no-block'；ballX＝對手攻擊點世界 x；
    // side＝我方半場（TEAM_SIDE，A=+1）。幾何＝從網口鋪向我方後場的走廊帶
    set(schemeKey, ballX, side = 1) {
      const bx = Math.max(-COURT.WIDTH / 2 + 1, Math.min(COURT.WIDTH / 2 - 1, ballX));
      // 直線走廊：攻擊點正對縱帶
      lineStrip.position.set(bx, 0.015, side * 4.2);
      lineStrip.rotation.z = 0;
      // 斜線走廊：攻擊點斜向對角（帶體旋轉指向遠角）
      const crossTargetX = -Math.sign(bx || 1) * (COURT.WIDTH / 2 - 1.2);
      crossStrip.position.set((bx + crossTargetX) / 2, 0.015, side * 4.4);
      crossStrip.rotation.z = Math.atan2(crossTargetX - bx, 7.4) * -side;
      // 吊球短區：網後前區
      tipZone.position.set(0, 0.015, side * 2.2);
      if (schemeKey === 'block-line') {
        paint(lineStrip, 'wall');
        paint(crossStrip, 'open');
        paint(tipZone, null);
      } else if (schemeKey === 'block-cross') {
        paint(crossStrip, 'wall');
        paint(lineStrip, 'open');
        paint(tipZone, null);
      } else if (schemeKey === 'no-block') {
        // 攔手讓開＝無封線層（不畫牆影——語意自洽）；全收吊球＝短區微亮
        paint(lineStrip, null);
        paint(crossStrip, null);
        paint(tipZone, 'open');
      } else {
        this.hide();
      }
    },
    hide() {
      paint(lineStrip, null);
      paint(crossStrip, null);
      paint(tipZone, null);
    },
  };
}
