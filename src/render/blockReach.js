// 2026-08-04 試玩裁定 — 攔網涵蓋帶（純表現層、sim 零依賴）
//
// ★ 為什麼要有它（Sawmah 08-04 實玩）★
// 回報原話：「攔網都沒碰到球，觸手也沒有」。查證後機制正常——實測 6 局 492 次扣球、
// 110 次攔網觸球（22.36%），AI 攔得到。差別在**資訊**：
//   ・單人攔網的水平涵蓋半寬只有 `BLOCK_HALF_WIDTH`（收斂後 **0.5m**），球網卻寬 9m
//   ・封線面板指揮的是**隊友**攔網手（`matchLoop.js` 傳 `[controlledId]`＝AI 不幫玩家出手）
//     ⇒ **玩家自己的站位永遠是自己的責任**，系統不會幫他移動
//   ・但畫面上**沒有任何東西告訴他「我的手涵蓋到哪」**⇒ 站著不動、球從別處過網 ⇒ 全程零觸手
//
// ★ 畫什麼、不畫什麼（這條界線是設計的核心）★
//   ✅ 畫**自己與隊友的涵蓋範圍**——那是場上早就存在的事實（每個人站在哪都看得見），
//      視覺化不給任何新資訊，只是把「手伸得到哪」從腦內計算變成看得見。
//   ❌ **不畫球的預測落點**——那等於開天眼，會把攔網從「讀對手」變成「跟著標記走」。
//      AI 自己也不是這樣攔的：`ai.js` 的攔網走位改制時特地把「直接追球」拿掉，
//      理由是「球最後會飛到攻擊手手上，等於用未來的答案本身當導航」。
//
// ★★ 四版沿革（每一版都是被實玩打回來的）★★
//   一版：地板帶、opacity 0.18／色 #bfe9ff／固定 z=0.6 ⇒ 回報「根本沒有看到」。
//   二版：濃度 0.32／0.58、改白色、畫在玩家與網之間 ⇒ 回報「還是不明顯」，
//         並指出關鍵：**鏡頭會換視角**（`cameraRig.js:74` 的 `defend` 模式由
//         `matchLoop` 依「面板開著／防守時刻」切換）⇒ 地上的東西會離開視線。
//   三版：**改畫在網上**（垂直面片貼網頂下緣）⇒ 回報「有，看到了」。
//         地板方案的根本錯誤：它依賴「鏡頭俯視地面」，而攔網視角本來就是平視網。
//   ★四版（本檔）：**連隊友的格子一起畫**。起因是 Sawmah 追問
//     「我下封線指令，隊友會被指令偏移，那我還能去搶中間位置嗎」——
//     可以，但有副作用：封線偏移（`AI.BLOCK_SCHEME_SHIFT` 0.9m）是**整面牆同方向平移**，
//     而**玩家不跟著平移**（AI 不控制他）⇒ 玩家與隊友的相對位置被拉開 0.9m。
//     肩寬間距只有 0.55m、單人涵蓋 1.0m（原本三人是互相重疊、不留內縫的），
//     0.9m 的相對位移足以**在玩家那一格開一道縫**。
//     畫出隊友的格子，玩家才看得到整面牆的形狀、以及縫留在哪裡。
//
// 半寬向 `blockBand.js` 取單一真相：那把尺一旦跟著收斂改動，這裡自動跟上，
// 不會出現「畫面說守得到、sim 判搆不到」的分岔。
import * as THREE from 'three';
import { BLOCK_HALF_WIDTH } from '../sim/blockBand.js';
import { COURT } from '../sim/constants.js';

// 面片高度（m）——貼在網頂下緣往下鋪，讓它落在網面上而不是飄在空中。
const BAND_H = 0.42;
// 隊友的帶子**矮一半**：主次之分改用「高度」承擔，濃度就不必壓到看不見。
// ★ 教訓（同一個坑踩第二次）★ 四版初稿給隊友 0.18／0.30，而 `blockShadow.js` 的
// 實測定帶白紙黑字寫著「0.34/0.24 疊暖橘地板**人眼無感**」——0.18 比那還低。
// 回報果然是「好淡 幾乎看不到」。**這個專案的可見濃度下限就是 0.32 上下**，
// 要做主次區分請動**尺寸或顏色**，不要再往下壓濃度。
const MATE_BAND_H = 0.22;
// 隊友格子最多幾個（前排三人，扣掉玩家自己）
const MATE_SLOTS = 2;

// ★ 色彩語言（2026-08-04 Sawmah 問「要不要改紅色」）★
// 選**琥珀金 #ffd166**——這是專案既有的「攔網」色語：`blockShadow.js` 07-27 試玩
// 定案時就寫明「改琥珀金（與『🧱封線成功！』字卡同色＝封線的色彩語言）」，
// 而「🧱 封到了！」「🧱 封線成功！」兩張字卡也都是這個色。
// **不用紅色**的兩個理由：① `blockShadow` 的紅已經佔用了「封住的線」這個語意，
// 同一個畫面兩塊紅會讀成同一件事 ② 紅在遊戲裡的普世語意是警示／失誤，
// 而這塊帶子講的是「你守得住這裡」——那是能力不是警告。
const BAND_COLOR = 0xffd166;

export function createBlockReach(scene) {
  const mk = (h = BAND_H) => {
    const m = new THREE.Mesh(
      // 寬＝涵蓋**直徑**（半寬 ×2）：看到的就是真正守得住的那一段網
      new THREE.PlaneGeometry(BLOCK_HALF_WIDTH * 2, h),
      new THREE.MeshBasicMaterial({
        color: BAND_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide, // 兩側都要看得見（換邊發球後鏡頭在另一側）
      }),
    );
    m.visible = false;
    scene.add(m);
    return m;
  };
  const mine = mk();
  const mates = Array.from({ length: MATE_SLOTS }, () => mk(MATE_BAND_H));

  const place = (mesh, x, side, opacity, h) => {
    mesh.visible = true;
    // 網頂 2.43m，面片中心壓在網頂下方半個帶高＝整條貼在網面上緣
    mesh.position.set(x, COURT.NET_HEIGHT - h / 2, side * 0.06);
    mesh.material.opacity = opacity;
  };

  return {
    /**
     * @param {number|null} x    受控玩家的世界 x；null＝整組隱藏（非攔網情境）
     * @param {number[]} mateXs  同時在網前的**前排隊友**世界 x（最多取前 MATE_SLOTS 個）
     * @param {number} side      我方半場符號（+1／−1）——面片往自己這側偏，避免與網面 z-fighting
     * @param {boolean} armed    對手已進入扣球階段＝更亮（其餘時候仍看得見，只是不搶視線）
     */
    set(x, mateXs = [], side = 1, armed = false) {
      if (x == null) {
        this.hide();
        return;
      }
      // 濃度沿 `blockShadow` 實測定帶（0.32–0.38 才在夜賽場景裡讀得出來）。
      // 看不見是這個功能唯一的失敗模式 ⇒ 自己這格不壓低。
      place(mine, x, side, armed ? 0.80 : 0.55, BAND_H);
      // 隊友＝**參考資訊**（看牆的形狀與縫），不是要玩家去管他們的位置。
      // 主次之分由**高度**承擔（矮一半），濃度只比自己低一階、仍在可見門檻之上。
      for (let i = 0; i < mates.length; i += 1) {
        if (i < mateXs.length) place(mates[i], mateXs[i], side, armed ? 0.52 : 0.36, MATE_BAND_H);
        else mates[i].visible = false;
      }
    },
    hide() {
      mine.visible = false;
      for (const m of mates) m.visible = false;
    },
  };
}
