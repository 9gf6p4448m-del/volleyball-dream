// 2026-08-04 試玩裁定 — 「你的攔網涵蓋帶」（純表現層、sim 零依賴）
//
// ★ 為什麼要有它（Sawmah 08-04 實玩）★
// 回報原話：「攔網都沒碰到球，觸手也沒有」。查證後機制正常——實測 6 局 492 次扣球、
// 110 次攔網觸球（22.36%），AI 攔得到。差別在**資訊**：
//   ・單人攔網的水平涵蓋半寬只有 `BLOCK_HALF_WIDTH`（收斂後 **0.5m**），球網卻寬 9m
//   ・封線面板指揮的是**隊友**攔網手（`matchLoop.js:1197` 傳 `[controlledId]`＝AI 跳過玩家）
//     ⇒ **玩家自己的站位永遠是自己的責任**，系統不會幫他移動
//   ・但畫面上**沒有任何東西告訴他「我的手涵蓋到哪」**⇒ 站著不動、球從別處過網 ⇒ 全程零觸手
//
// ★ 畫什麼、不畫什麼（這條界線是設計的核心）★
//   ✅ 畫**玩家自己的涵蓋範圍**——那是他早就擁有的能力，只是看不見；視覺化不給任何新資訊。
//   ❌ **不畫球的預測落點**——那等於開天眼，會把攔網從「讀對手」變成「跟著標記走」。
//      AI 自己也不是這樣攔的：`ai.js` 的攔網走位改制時特地把「直接追球」拿掉，
//      理由是「球最後會飛到攻擊手手上，等於用未來的答案本身當導航」。
//      玩家看得到攻擊手在哪，資訊對等——缺的只是「我守得住多寬」。
//
// 半寬向 `blockBand.js` 取單一真相：那把尺一旦跟著收斂改動，這裡自動跟上，
// 不會出現「畫面說守得到、sim 判搆不到」的分岔。
import * as THREE from 'three';
import { BLOCK_HALF_WIDTH } from '../sim/blockBand.js';

// 帶子的縱深（z 方向）——純視覺厚度，與判定無關（判定只看水平距離）。
const STRIP_DEPTH = 0.55;

export function createBlockReach(scene) {
  const mesh = new THREE.Mesh(
    // 寬＝涵蓋**直徑**（半寬 ×2）：玩家看到的就是他真正守得住的那一段網
    new THREE.PlaneGeometry(BLOCK_HALF_WIDTH * 2, STRIP_DEPTH),
    new THREE.MeshBasicMaterial({
      color: 0xbfe9ff, transparent: true, opacity: 0, depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  scene.add(mesh);

  return {
    /**
     * @param {number|null} x 玩家當前世界 x；null＝隱藏（非攔網情境）
     * @param {number} side  我方半場（TEAM_SIDE，A=+1）
     * @param {boolean} armed 對手已進入扣球階段＝亮起來（其餘時候淡淡的，不搶視線）
     */
    set(x, side = 1, armed = false) {
      if (x == null) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      // 貼在攔網站位深度（`AI.BLOCK_LZ` 0.6）附近、y 墊在界線之上防 z-fighting
      mesh.position.set(x, 0.021, side * 0.6);
      mesh.material.opacity = armed ? 0.42 : 0.18;
    },
    hide() { mesh.visible = false; },
  };
}
