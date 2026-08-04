// 2026-08-04 試玩裁定 — 「你的攔網涵蓋帶」（純表現層、sim 零依賴）
//
// ★ 為什麼要有它（Sawmah 08-04 實玩）★
// 回報原話：「攔網都沒碰到球，觸手也沒有」。查證後機制正常——實測 6 局 492 次扣球、
// 110 次攔網觸球（22.36%），AI 攔得到。差別在**資訊**：
//   ・單人攔網的水平涵蓋半寬只有 `BLOCK_HALF_WIDTH`（收斂後 **0.5m**），球網卻寬 9m
//   ・封線面板指揮的是**隊友**攔網手（`matchLoop.js` 傳 `[controlledId]`＝AI 跳過玩家）
//     ⇒ **玩家自己的站位永遠是自己的責任**，系統不會幫他移動
//   ・但畫面上**沒有任何東西告訴他「我的手涵蓋到哪」**⇒ 站著不動、球從別處過網 ⇒ 全程零觸手
//
// ★ 畫什麼、不畫什麼（這條界線是設計的核心）★
//   ✅ 畫**玩家自己的涵蓋範圍**——那是他早就擁有的能力，只是看不見；視覺化不給任何新資訊。
//   ❌ **不畫球的預測落點**——那等於開天眼，會把攔網從「讀對手」變成「跟著標記走」。
//      AI 自己也不是這樣攔的：`ai.js` 的攔網走位改制時特地把「直接追球」拿掉，
//      理由是「球最後會飛到攻擊手手上，等於用未來的答案本身當導航」。
//
// ★★ 三版沿革（每一版都是被實玩打回來的）★★
//   一版：地板帶、opacity 0.18／色 #bfe9ff／固定 z=0.6 ⇒ 回報「根本沒有看到」。
//   二版：濃度提到 0.32／0.58、改白色、改畫在玩家與網之間 ⇒ 回報「還是不明顯」，
//         並指出關鍵：**鏡頭會換視角**（`cameraRig.js:74` 的 `defend` 模式由
//         `matchLoop` 依「面板開著／防守時刻」切換），選完封線面板一關、鏡頭一換，
//         地上的東西就離開視線了。
//   ★三版（本檔）：**改畫在網上**——垂直面片、貼在網頂下緣、x 跟著玩家。
//     攔網的手本來就是伸到網上方，把「守得住哪一段」標在網上語意最準；
//     而且不論鏡頭在玩家身後、身側或拉遠，**網恆在視線前方** ⇒ 不會再被視角吃掉。
//     地板方案的根本錯誤是：它依賴「鏡頭俯視地面」，而攔網視角本來就是平視網。
//
// 半寬向 `blockBand.js` 取單一真相：那把尺一旦跟著收斂改動，這裡自動跟上，
// 不會出現「畫面說守得到、sim 判搆不到」的分岔。
import * as THREE from 'three';
import { BLOCK_HALF_WIDTH } from '../sim/blockBand.js';
import { COURT } from '../sim/constants.js';

// 面片高度（m）——貼在網頂下緣往下鋪，讓它落在網面上而不是飄在空中。
const BAND_H = 0.42;

export function createBlockReach(scene) {
  const mesh = new THREE.Mesh(
    // 寬＝涵蓋**直徑**（半寬 ×2）：玩家看到的就是他真正守得住的那一段網
    new THREE.PlaneGeometry(BLOCK_HALF_WIDTH * 2, BAND_H),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide, // 兩側都要看得見（換邊發球後鏡頭在另一側）
    }),
  );
  mesh.visible = false;
  scene.add(mesh);

  return {
    /**
     * @param {number|null} x 玩家當前世界 x；null＝隱藏（非攔網情境）
     * @param {number} side 我方半場符號（+1／−1）——面片往自己這側偏一點，避免與網面 z-fighting
     * @param {boolean} armed 對手已進入扣球階段＝更亮（其餘時候仍要看得見，只是不搶視線）
     */
    set(x, side = 1, armed = false) {
      if (x == null) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      // 網頂 2.43m，面片中心壓在網頂下方半個帶高＝整條貼在網面上緣
      mesh.position.set(x, COURT.NET_HEIGHT - BAND_H / 2, side * 0.06);
      // 濃度沿 `blockShadow` 實測定帶（0.32–0.38 才在夜賽場景裡讀得出來）；
      // 網面是深色背景、比暖橘地板好讀，但仍不壓低——看不見是這個功能唯一的失敗模式。
      mesh.material.opacity = armed ? 0.72 : 0.42;
    },
    hide() { mesh.visible = false; },
  };
}
