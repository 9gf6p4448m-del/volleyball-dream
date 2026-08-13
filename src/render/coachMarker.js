// 教練的地面光圈（分步關卡卷 2026-08-13，Sawmah 題 2 裁定）——「你現在該站這裡」。
//
// ★ 只在教學局出現 ★ 紅白對抗賽與正式賽零改變（建立與否由 matchStage 依 tutorial 旗標決定）。
//
// ★ 位置一律取自引擎自己的值，不另算一份 ★ 接發用 `aiState.landing`（＝`predictLanding`
// 的輸出，AI 隊友也是照這個跑）、攔網用 `aiState.attackerId` 那個人的實際 x。
// 這條紀律是 2026-08-13 那場「文案說謊」事故的直接教訓：第二份模型遲早跟本體分岔，
// 而分岔的那天它會**很有自信地指向錯的地方**——比沒有標記更糟。
//
// ★ 為什麼只有兩步有圈 ★ simpleMode 下「你不動，隊形自己會帶」（`matchControls.js:348-377`），
// 扣球與發球那兩步玩家根本不需要移動（面板會自己來找他），畫圈是噪音、還會跟自動帶位
// 互相打架。真正要玩家自己跑的只有接發（走到落點）與攔網（沿網卡線）。
import * as THREE from 'three';

const COLOR_AWAY = 0x6ee7ff; // 青＝還沒到位（與「現在練」那一列同色）
const COLOR_HERE = 0x60ffa0; // 綠＝踩進來了（與攻擊面板「空檔」同色語言）
const RADIUS = 1.0;          // 半徑＝「站在這附近就算數」的寬容度

export function createCoachMarker(scene) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(RADIUS - 0.14, RADIUS, 40),
    new THREE.MeshBasicMaterial({
      color: COLOR_AWAY, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02; // 略高於場地線，避免 z-fighting（同 aimMarker 的做法）
  ring.visible = false;
  scene.add(ring);

  // 內圈：踩進去之前緩慢收縮＝「往這裡走」的動勢；踩進去就停住不再吸引注意
  const pulse = new THREE.Mesh(
    new THREE.RingGeometry(RADIUS - 0.06, RADIUS - 0.02, 40),
    new THREE.MeshBasicMaterial({
      color: COLOR_AWAY, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    }),
  );
  pulse.rotation.x = -Math.PI / 2;
  pulse.position.y = 0.021;
  pulse.visible = false;
  scene.add(pulse);

  return {
    /**
     * @param point  目標點 {x,z}（null＝這一幀沒有目標，收起來）
     * @param here   玩家在不在圈裡（呼叫端用同一個 RADIUS 判定）
     * @param now    毫秒時鐘（脈動用；不影響 sim）
     */
    show(point, here = false, now = 0) {
      if (!point) { this.hide(); return; }
      ring.visible = true;
      ring.position.x = point.x;
      ring.position.z = point.z;
      const hex = here ? COLOR_HERE : COLOR_AWAY;
      ring.material.color.setHex(hex);
      pulse.material.color.setHex(hex);
      pulse.position.x = point.x;
      pulse.position.z = point.z;
      pulse.visible = !here;
      if (!here) {
        // 1.2 秒一圈的收縮（0.55→1.0 倍），純表現層
        const t = ((now % 1200) / 1200);
        const k = 1 - 0.45 * t;
        pulse.scale.set(k, k, k);
      }
    },
    hide() {
      ring.visible = false;
      pulse.visible = false;
    },
    RADIUS,
  };
}
