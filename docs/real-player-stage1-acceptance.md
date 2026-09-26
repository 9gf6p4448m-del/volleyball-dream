# 寫實球員卷 · 第一階段驗收（2026-09-26 凍結）

> 凍結規則：`~/docs/harness/02-dispatch-rules.md §2.1`。任何讓通過機率上升的改動（門檻、案例、時間點、容差、量測法）需使用者逐條同意。
> 基準 commit：`26593b7`（分支 `feat/real-player` 起點）。使用者裁定：Q1 v8 由另一 session 處理；Q2–Q7 照建議。

## 目標
`?mode=realpreview`（別名 `?devreal=1`）獨立預覽場景：14 名 Modly 寫實白模（20k／5k 可切），以**既有 geoCharacter 關節樹當骨架、既有 geoAnimator 驅動**，依部位頂點色上色、隊色沿用 kit。不碰正式賽場。

## 驗收條件（全部由 `tools/real-player-browser.mjs` 在 headless Chromium 機械判定，輸出 JSON 報告）

- **A1 載入**：頁面暴露 `window.__realPreview`，`playerCount === 14`（兩隊各 6 名一般＋1 名自由人）；載入到跑完全部斷言期間 `pageerror` 與 console error 皆 0。
- **A2 骨架跟隨（行為斷言）**：對 `bump`、`spike`（windup→spikeHold→spike 完整序列）、`block` 三個序列，各取 ≥5 個均勻時間點，對骨 `rWrist`、`lWrist`、`rKnee` 各自：以「靜止綁定時主權重屬於該骨的頂點群」經 **CPU 蒙皮**（`SkinnedMesh.getVertexPosition` 或 `applyBoneTransform`，不得用未蒙皮的原始座標）算質心 C_t，骨世界座標 J_t；
  - (a) 剛性跟隨：`| |C_t − J_t| − |C_rest − J_rest| | ≤ 0.05 m`（每個時間點）；
  - (b) 確實有動：每個序列內，`rWrist` 與 `lWrist` 各自至少一個時間點 `|C_t − C_rest| ≥ 0.30 m`（`rKnee` 不要求 (b)）。
  - 會變紅的實作：蒙皮沒隨骨更新（(b) 紅）、bind 矩陣錯或權重綁錯骨（(a) 紅）。
- **A3 權重衛生**：每頂點權重和 = 1 ± 1e-4；頂點在綁定姿勢下 x 偏離身體中線 > 0.10 m 者，對對側骨（`r*`↔`l*` 的 Shoulder/Elbow/Wrist/Hip/Knee）權重總和 = 0。
- **A4 腋下不黏**：綁定姿勢下，位於軀幹範圍（`|x| ≤ min(|x_rShoulder|,|x_lShoulder|) − 0.03 m` 且高度介於髖關節與肩關節之間）的頂點，主權重屬於 `rElbow/lElbow/rWrist/lWrist` 的比例 ≤ 1%。
- **A5 配色**：每名球員軀幹區（髖～肩高度、軀幹範圍內）頂點色的眾數 = 該球員 kit 球衣色（一般球員 `resolveKit` 的隊色、自由人 `LIBERO_KIT`），每通道容差 ≤ 2/255；頭部區（頸關節以上）頂點色眾數 ∈ 該球員由 `SKINS` 決定的膚色或 `HAIRS` 髮色。
- **A6 雙面數**：預設載入 `faces` 回報 20000 ± 1%；`&faces=5k` 回報 5000 ± 1%；兩者 A1–A5 都要跑且全過。畫面上 HUD 顯示 FPS 與目前面數。
- **A7 不動正式遊戲**：`git diff 26593b7 -- src/render/matchView.js src/render/geoAnimator.js` 為空；`src/render/geoCharacter.js` 若有改動只允許**新增 export**（不改既有行為行）；`src/main.js` 只新增 mode 分派；`npm test` 全綠且通過數 ≥ 基準（實作前在 26593b7 先跑一次記錄）；`npm run build` 成功。
- **A8 截圖證據**：桌機 1280×720 與直式 390×844 各一張「靜止」與「spike 擊球瞬間」，落 `docs/experiments/real-player-evidence/`。

## 加嚴紀錄（2026-09-26，02 §2.1：加嚴自行記錄）
- **A2(c) 綁定還原**（補 A2(a) 盲點：(a) 只量距離，bind 矩陣差一個骨座標系內的平移時仍綠，實作 agent 以故意改壞的版本實測確認）：實作須提供重現「算 boneInverses 當下關節姿勢」的函式；在該姿勢下，每名受測球員 CPU 蒙皮後的頂點位置＝載入後（縮放、貼地後）未蒙皮頂點位置，最大誤差 ≤ 1e-3 m。20k／5k 都要驗。
- **A2(d) 肢段方向與 geo 人一致**（補目標「沿用既有 geoAnimator」的隱含要求：原實作把白模原始張角當旋轉 0，換 A-pose 白模後所有動作都會多出約 35° 外張；原條件無一條量得到）：以同一組 `trigger`／`step` 序列同步驅動一個參考 geo 人（`createGeoCharacter`＋`createGeoAnimator`，同 root 位置朝向），在 A2 的每個取樣時間點**以及未觸發任何序列的待命狀態**，比較 `rShoulder→rElbow`、`rElbow→rWrist`、`lShoulder→lElbow`、`lElbow→lWrist`、`rHip→rKnee`、`lHip→lKnee` 六段的世界方向，夾角全部 ≤ 10°。

## 修正紀錄（2026-09-26，02 §2.1 例外條款：錯到無論實作對錯都不可能通過 → 自行修正、事後回報）
- **A7「`npm test` 全綠」→「`npm test` 失敗清單與 26593b7 基準逐項相同（不得新增任何失敗），且通過數 ≥ 基準」**。
  - 原標準錯在哪：基準 26593b7 本身就有 2 個失敗（`tests/direct-receive-assist.test.js` A23a、A23b，屬直接操作 v8 範圍）。主對話在乾淨的 26593b7 detached worktree 獨立重跑該檔：tests 13／pass 11／fail 2，失敗項即 A23a、A23b（5 分 8 秒）。「全綠」不論本卷實作對錯都不可能成立。
  - 為什麼現在才知道：訂條件時未先跑基準就假設全綠（條件本身寫了「先跑一次記錄」卻沒在凍結前執行）。
  - 為何不是放水：本卷造成的任何新失敗仍會讓修正後的條件變紅；只排除本卷無法控制、基準既有的 2 項。

## 使用者側（不阻塞本階段交付，決定是否進賽場）
- 手機經區網開預覽，實測 5k／20k 兩版 14 人 FPS（門檻：60 FPS，`docs/design-brief.md:42`）。
- 重生雙臂 A-pose 30–45° 原圖（Q4）→ 重跑生成與減面，換檔後 A1–A8 重跑。
