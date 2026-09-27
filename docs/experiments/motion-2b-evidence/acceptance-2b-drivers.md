# 2B 驗收治具的量法凍結（動手改 src 之前寫下，2026-09-27）

條文本身凍結在 `docs/kickoffs/real-player-stage2-match.md`「### 2B 驗收」E1–E9（f4ccbec），本檔只凍結**我新寫的治具怎麼量**，避免實作後回頭調量法。改動本檔＝移動及格線，須先寫原因。

## 共同
- 探針球員：`D0Probe`（右手、1.85 m，同 D0 腳本）；另跑一名左手探針（名字由 `isLeftHanded` 搜出第一個判左手的 `L2BProbe<n>`）檢查鏡像。
- 固定步長 1/60 s、speed 0、lateral 0、staminaMul 1；root 不轉不平移，root.y＝update 回傳值。

## E1 探針（tools/motion-2b-e1-mirror.mjs）
- 舊版＝`git show 1fd5da6:src/render/geoAnimator.js`／`geoCharacter.js`；新版＝工作樹檔案。兩者都用同一種最小插樁：animator 原文尾端附加 `export { POSES, SEQUENCES };`，`three`／`../career/teamKit.js` 的 import 改成絕對 file URL，以 data: URL 動態 import（不寫任何檔）。
- 每個姿勢 P：往 SEQUENCES 加 `__probe_P = { dur:1, jump:0, land:false, keys:[{at:0,p:P},{at:1,p:P}] }`，`setHold('__probe_P')`，走 30 tick（hold 路徑 w=1），讀關節世界座標。
- 向量：左右上臂（肩→肘）、左右前臂（肘→腕）、肩線（左肩→右肩，丟 y）、髖線（左髖→右髖，丟 y）。意圖＝舊版向量 x 取反；夾角用 3D（線用水平投影）。
- 健全性：舊版中肩 z 全為 0 且 pelvisY/chestY 全為 0 的姿勢（25 個以外、兩版都存在者），意圖與**基準 f4ccbec 現況**夾角 ≤ 0.5°。
- 通過：25 個姿勢每個向量 ≤ 5°；例外只收「還原後會違反 E2 或有來源教學描述」，逐條列出。
- 另兩條直接量：`bump.contact.span` ≤ 0.20 m、`spike.wind.shline` < 180°（讀 D0 腳本 JSON）。

## E2
- (a) 跑 `node tools/motion-d0-measure.mjs`，讀其 JSON `rows`：`kind==='angle'` 的 40 列 `out===false`。
- (b) 同一份 JSON `approach.primary.drop`（公尺）∈ [0.20, 0.30]。
- D0 腳本、JSON 欄位、幀定義一律不動；D0 腳本會覆寫 `docs/experiments/motion-d0-measure.json`，跑完另存一份到 2B 證據檔，原檔以 git 還原（D0 交付物保持 677516f 狀態）。

## E3（tools/motion-2b-check.mjs e3）
- 對 `git show 677516f:src/render/geoAnimator.js` 與工作樹兩份 SEQUENCES（同上插樁取得物件），逐鍵比 `dur/hit/airDur/jump`（677516f 有的鍵，新版必須存在且四欄逐值相同；新版多出的鍵列出不判）。
- `tests/geo-animator.test.mjs` 中 hitLeadTicks 斷言那段文字與 677516f 逐字相同，且該檔測試全綠。

## E4（同一支 check 的 e4）
- 驅動：(1) 每個 SEQUENCES 鍵冷觸發：待命 30 tick → trigger(K) → 逐 tick 走到 `isIdle()`（上限 600 tick）再多 5 tick；(2) 比賽鏈：receiveReady 30 tick→bump、setReady 30 tick→overhead、windup→(11 tick)spike、windup→(12 tick)tip、windup 不接擊球（hold 到落地）、serveReady hold→serveJump／serveFloat／serve、block hold→blockJump／blockJumpGraze；(3) approach3、approach4 另以 speed 2.55 與 4.5（先跑 30 tick 再觸發、持續餵速）。右手、左手探針各跑一次。
- 每幀：左右膝 3D 夾角（髖—膝—踝）≤ 180° 且有號「往前彎」（膝點在髖→踝連線的前方〔root 前向 +Z〕距離 ≥ −0.001 m）；左右肘有號角 ≤ 182°（以肘 hinge 軸判號：伸直過頭＝過伸，角度 = 180 + 過伸量）；該幀 animator 跳躍弧高度＝0 時，左右鞋盒（BoxGeometry 0.13×0.09×0.26、掛膝局部 (0,−0.44,0.05)）8 角點世界 y 的最小值 ≥ −0.03 m。
- 跳躍弧高度由 animator 新增的唯讀窺視取得（不改其他行為）。

## E6（check 的 e6）
- windup 觸發起，逐 tick 走到 spikeHold 已播 ≥ 6 tick（涵蓋接續那一幀）；每幀動作層權重 > 0（唯讀窺視）、慣用手腕世界 y 逐幀變化 ≤ 0.15 m。右手、左手各一次；另跑 windup→(11)spike 與 windup→(12)tip 兩條鏈同樣判。

## E9 突變（git archive 副本）
- 撤銷鏡像：把 25 姿勢的肩 z、pelvisY、chestY 改回 f4ccbec 值 → E1 探針紅。
- 每技術一列：低手 `bump.contact.elbow`？→ 於實作後挑「姿勢參數一對一映射到量值」的列，偏移 = max(1SD,10°)+5°，方向取遠離文獻平均的一側 → 該列 E2 紅。技術：低手、高手、扣球、吊球、跳發、飄球（攔網無角度列）。
- 過渡空窗：把接續分支改回「接續那一幀不產生姿勢」→ E6 紅。
- 每次突變前備份、跑完以備份還原並比 sha1。

## 量法修改紀錄（實作中發現，改前寫明原因）
- 2026-09-27（E6 窗）：原寫「windup 觸發起」判定。錯在哪：windup 冷觸發本身有 0.08 s ATTACK 漸入（權重 0→1，手臂由下垂抬到頭上），那 5 幀的腕高變化（0.46 m/幀）屬於 windup 的漸入，不是 E6 條文「windup 接 spikeHold 的過渡期間」。為什麼現在才知道：修掉接續空窗後逐幀印出，接續幀（1.813→1.840 m、w=1）已平順，紅燈全落在觸發後第 0→1 幀。改為：自 windup 權重達 1 的那一幀起判，到 spikeHold 前 6 幀（或擊球觸發前）。鑑別力：撤銷接續修正時，接續幀 w=0、腕高單幀 0.86 m（改前實測），仍落在新窗內 → 仍會紅（E9 實測）。窗外漸入數字照列在報告，列為範圍外發現。
- 2026-09-27（E4 助跑）：觸發前 30 tick 熱身跑是「讓 runW 收斂」的設定，不屬於「從觸發到回待命」；原驅動把它記入判定。改為熱身不記錄、判到 isIdle 那一幀為止（助跑序列結束後是一般跑動底層，不屬任何 SEQUENCES 鍵）。熱身幀（一般跑動）改前 −0.037～−0.044 m 的鞋底入地已由同一個抬腳修正處理，照列在報告。
