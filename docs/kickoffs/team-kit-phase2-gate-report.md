# 配色卷階段二 — 停報（兩道關卡結果，2026-08-24）

> 依 `team-kit-phase2-ruling.md` §四停報條件與 §八施工順序：兩關卡量完即停、回 Claude.ai 裁定。
> E1–E6 一行未動；repo 除 docs 外零改動（HEAD 基準 ed48d34）。
> 詳細數據＝`team-kit-phase2-measurement.md`；T2/T1 逐項證據＝`team-kit-phase2-t2-t1-inventory.md`。

## 停報事由一：量測落在裁定樹第三分支（大面積不足）

- T0 不觸發：大學章對手池封閉於 9 校（逐條證據見 measurement.md (a)，練習賽＝紅白拆隊、快速比賽＝寫死預設隊、友誼賽機制不存在、16 隊池不滲入）。
- 同一把尺：`colorDistance`（`src/career/teamKit.js:32-38`，redmean）＋ `kit.jersey` 對 `kit.jersey`（與 `checkKitPalette()` identity 檢查同取值），門檻 150＝`READABILITY_MIN`（teamKit.js:19）。
- **36 對中 8 對 <150（22.2%），最小對＝北陵×海硯 102.44**——超出「少數對 ≤3」分支範圍。
- 依 ruling §三步驟 2 第三分支指示：**停在量測結果，B 案（UI 語意通道）重開討論**。
- 8 對明細（差值 0.53～47.56）見 measurement.md (e)。備註：identity 門檻 100 未被跌破（最小 102.44）。

## 停報事由二：T1 提前觸發（E4 分母盤點有漏）

E4 開工前的全 repo 盤點找到 **10 個程式碼消費端**（ruling 只列 5 個接線點），其中 4 處硬編「遊隼」、2 處邊界台詞，皆待裁定：

| 類別 | 位置 | 待裁問題 |
|---|---|---|
| 硬編・真消費端 | `src/render/arena.js:29`（球場看板「遊隼高中 ★ 主場之夜」）、`src/render/huddleProps.js:81`（戰術板角落隊名） | 大學章若共用同一場景，看板永遠印高中隊名——要不要掛 `currentTeamName()`？ |
| 硬編・結算標題 | `src/ui/careerScreen.js:2259`（`${playerName}・遊隼高中三年`） | 同名異檔陷阱：它在 ui/careerScreen.js 的 showCareerFinale()，不是被排除的 career/careerFinale.js——比照排除還是併入 E4？ |
| 硬編・情蒐文案 | `src/ui/careerScreen.js:929`（「現在穿著遊隼的球衣」） | 性質近故事文本但檔名不在排除清單 |
| 邊界台詞 | `src/career/n2Arc.js:65`、`src/career/positionEvents.js:151` | 故事文本性質、檔名未列排除清單——要不要補進排除清單？ |

已引用 `OUR_TEAM_NAME` 的 4 處（careerScreen.js:864/1803/1897/2608）＝ruling E4 原列，無爭議。

## 通過的關卡：T2（僅供裁定時參考，不構成開工授權）

前提成立：收束記錄持久化（`careerStore.js:244-248` archive→localStorage）＋第 1/2 屆歷史可查（真實引擎三屆實證，`tests/three-seasons.test.mjs` 治具）。
一個 E5 實作邊界：章節最後一屆（高中第 3 屆）不進 archive（`careerStore.js:178` 守門），收束事實在 `save.season`——E5 須「陣列內一律視為已收束＋即時季改用 `careerStage()` 判斷」，只認 archive 會違反驗收 P6。詳見 inventory 檔。

## 待 Claude.ai 裁定的問題清單

1. 題 2 主裁定：8/36 對 <150——B 案（UI 語意通道）重開？還是放寬處理方式另裁？
2. T1 四處硬編＋兩處邊界台詞：各自併入 E4、掛 `currentTeamName()`、還是補進排除清單？
3. （若重裁後仍走色票微調路線）8 對候選色值須逐項核可（ruling §三第二分支程序）。
