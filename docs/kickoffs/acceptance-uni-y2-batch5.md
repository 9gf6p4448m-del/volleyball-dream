# 驗收凍結——大二卷批 5：屆間養成窗＋U4 身高定型（2026-08-25）

拍板依據＝題 8（沿用高中集訓機制換文案）＋題 7（U4＝身高明確定型）。
裁量記錄：大學集訓 `hasChemistry = false`——默契是「一生一次」（高中第二次集訓
限定消費），大學重開會撞語意；大學集訓＝屬性特訓＋紅白對抗賽＋技術補修
（事件數餵入的既有機制）。使用者試玩後想要大學默契另議。

## 驗收條件（凍結，改動依 02 §2.1）

- **B5-1 大學屆間集訓**：大學分支 RMW 內 `markCampPending`（與屆數推進**同一次
  落檔**——高中 HIGH-1 的中斷復原紀律同款）；推進演出結束回生涯畫面時集訓面板
  自動開（既有 `isCampPending` 復原閘生效）。wiring 測試：推進演出後畫面出現
  集訓標題。★改前紅★：批 4 完成點（c65384a）推進後無集訓面板。
- **B5-2 大學集訓 plan**：`campPlanFor` 大學章 title＝「大N屆間集訓」、
  `hasChemistry=false`、`hasPractice=true`；**高中 plan 逐值不變**（既有呼叫端
  零遷移、既有測試全綠）。
- **B5-3 U4 身高定型**：`heightGrowth.heightSettled(player, seasonIndex)`＝
  plan 耗盡（seasonIndex > plan.length）→true；大學章生涯抬頭附
  「・身高 Ncm（已定型）」；高中章抬頭逐字不變。單元測試：屆 2/3→false、
  屆 4+→true；wiring：大學章畫面含「已定型」——★改前紅★。
- **B5-4 全套綠（基準 1707 不得少）＋sim-hash 同基準 34772c06e02243fd。**
