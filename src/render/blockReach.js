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
//
// ★ 2026-08-04 二版（Sawmah 實玩：「根本沒有看到、不明顯」）★
// 初版用 opacity 0.18／0.42、色 #bfe9ff、固定畫在 z=0.6，三個都錯：
//   ① **濃度太低**——`blockShadow.js` 的註解早就記過同一個坑：
//      「濃度實測定帶（金/青 0.34/0.24 疊暖橘地板**人眼無感**）」，它最後用 0.38/0.32。
//      我的 0.18 比那個無感值還低。
//   ② **顏色太淡**——夜賽暖橘地板上，淡藍白幾乎融進去（同一則 07-27 試玩回饋：
//      黑色牆影「在夜賽地板上讀不出語意」，改成高對比色才看得見）。
//   ③ **位置固定在 z=0.6**——那是攔網站位深度，但玩家可能站在別的深度，
//      帶子不在腳下就讀不出「這是我的範圍」。改成跟著 actor 的實際 z。
import * as THREE from 'three';
import { BLOCK_HALF_WIDTH } from '../sim/blockBand.js';

// 帶子的縱深（z 方向）——純視覺厚度，與判定無關（判定只看水平距離）。
// 0.55 → 0.9：太窄會看成一條線而不是「一塊守備範圍」。
const STRIP_DEPTH = 0.9;

export function createBlockReach(scene) {
  const mesh = new THREE.Mesh(
    // 寬＝涵蓋**直徑**（半寬 ×2）：玩家看到的就是他真正守得住的那一段網
    new THREE.PlaneGeometry(BLOCK_HALF_WIDTH * 2, STRIP_DEPTH),
    // 白色：與 blockShadow 的紅（封住的線）／綠（留給後排的線）不撞色，
    // 語意也分得開——那兩條講「佈陣」，這一塊講「我的手」。
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  scene.add(mesh);

  return {
    /**
     * @param {number|null} x 玩家當前世界 x；null＝隱藏（非攔網情境）
     * @param {number} z 玩家當前世界 z——**畫在他腳下**，固定深度會讓帶子離開身體、讀不出歸屬
     * @param {boolean} armed 對手已進入扣球階段＝更亮（其餘時候仍要看得見，只是不搶視線）
     */
    set(x, z = 0.6, armed = false) {
      if (x == null) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      // y 墊在界線（0.011）之上防 z-fighting
      mesh.position.set(x, 0.021, z);
      // 濃度沿 `blockShadow` 實測定帶（0.32–0.38 才在暖橘地板上讀得出來）：
      // 待命 0.32、對方進入扣球階段 0.58。初版的 0.18 低於「人眼無感」的 0.24。
      mesh.material.opacity = armed ? 0.58 : 0.32;
    },
    hide() { mesh.visible = false; },
  };
}
