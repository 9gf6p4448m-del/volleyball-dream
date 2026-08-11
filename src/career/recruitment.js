// Phase 3 W4 — 招募判定（純函式層＋store 入隊流程；零 three.js/DOM，node 可測）
// 條件表集中在本檔（不掛 opponents.js）的理由：條件引用生涯層概念（壯舉事件掃描、
// 賽程 stage id、名冊空位），opponents.js 維持「純 sim 參數檔」的單一職責；
// 對手參數（level/attrBias/heights/style）仍由 opponents.js 供給、本檔只引用。
// 壯舉統計一律從賽末 state.events 掃描——sim 執行碼零改動、零新事件型別（硬性約束）。
import { opponentById } from './opponents.js';
import { buildLibero } from './careerState.js';
import { aceGrowthAt } from './aceGrowth.js';
import { matchStatsFor } from './growth.js';
import { countSetAssistKills } from './boxScore.js';
import { boxScoreLFor } from './boxScoreL.js';
import { openSlots } from './roster.js';
import { ATTRIBUTE_KEYS } from '../sim/player.js';

// 新隊員 trust 初值（拍板）：10——低於既有隊友 20 是刻意設計，新人要重新贏得信任，
// 舉球分配真的會少。入隊時**顯式寫入 lineup.trust**（W3 §6b：勿依賴 trustOf 缺鍵回退
// 20——回退值會遮蔽漏寫）。
export const RECRUIT_TRUST = 10;
// W5 逐出機制（拍板）：逐出→全隊 lineup.trust −5（夾限≥0，主角另計不受影響）；
// 每屆上限 1 次；僅可逐招募生（origin≠'starter'）。常數集中此處與 RECRUIT_TRUST 同域。
export const EXPEL_TRUST_PENALTY = 5;
export const EXPEL_PER_SEASON_LIMIT = 1;
// 生成屬性夾限：上限與隊友成長天花板一致（roster.js ROSTER_GROWTH.ATTR_CAP＝85）
const ATTR_MIN = 30;
const ATTR_MAX = 85;

// 「接起強發」的品質門檻（08-11 由 0.8 降到 0.70）——**單一事實源**：招募條件與
// 換人面板的「接發到位率」共用這個常數。分開寫死的下場是 08-11 覆審抓到的那個縫：
// 招募判準降到 0.70 之後，`subPanel` 還停在 0.8 ⇒ 玩家接出 0.70 的球，招募進度照加、
// 面板卻顯示「接 0%」，等於畫面與判準各說各話。
export const STRONG_RECEIVE_QUALITY = 0.7;

// ---- 條件模板（W4 任務書 §1 拍板表＋W6 擴池；三軸缺項＝不檢查）----
// W6 鍵結構：recruitKey → { opponentId, role, wins?, feat?, stage? }——
// 一隊可掛多名招募對象（A3 強隊第二人／A1 新隊雙招牌）。既有 5 隊 recruitKey 沿用
// opponentId 本身＝舊存檔 progress/recruited 鍵零遷移；新增鍵用 `{oppId}-2` 等。
// wins＝對該隊累計勝場（缺項＝不檢查——A3 第二人拍板走純壯舉軸，避開 wins 同質）；
// feat＝個人壯舉（跨場累積）；stage＝須在此場次擊敗——2026-08-09 起可給**字串或字串陣列**
// （陣列＝任一場次擊敗即算；天鷹的「淘汰賽舞台」跨準決/決賽兩個掛點就靠它）。
// 壯舉軸的事件層定義（替代定義的歸因見 W4 結案快照偏差表）：
//   digMatch：單場「dig」（敵方扣球後的第一時間 receive/dive）達 perMatch 次＝1 場達標
//   blockKill：攔網得分（BLOCK_TOUCH 後我隊直接得分）——事件流無「快攻」標記，
//     以「攔死其攻擊」近似「攔死其快攻」（曜石＝快攻隊，其攻擊以快攻為主體）
//   strongReceive：高品質接發（敵方發球後第一觸為玩家 receive/dive 且品質 ≥ quality）
//     ——SERVE 事件無式樣欄位，以「接發品質」近似「接起強發」（頂住鐵霧發球輪＝壯舉本意）
//   W6 新增三型（單場統計 ≥ perMatch＝1 場達標，皆走 matchStatsFor 既有欄位）：
//   blockKillMatch＝單場攔網得分×N／aceMatch＝單場 ACE×N／killMatch＝單場殺球×N
// ★★ 2026-08-09 循環賽卷：門檻對準新賽程重算 ★★
// 判準＝**結構上限**（cap）：對象畢業前，玩家最多能遇到那支隊幾次。`wins` 門檻高於
// cap ＝這條路恆不可達；門檻**等於** cap ＝要求「窗口內每一場全勝」，實務上也接近不可達。
// cap 由賽程層決定論展開量出（探針：止步循環臂 300 條生涯，取**最小值**不取平均）：
//   改制前（單淘汰）止步者 cap：north-tech 2／obsidian 1／gale-shore 1／
//     gale-shore-2 1／black-pine 1／black-pine-2 1／sky-hawk 0
//     ⇒ 12 條裡有 7 條的門檻打不到，止步者第 1 屆招募率實測 0/40。
//   改制後（八強循環）止步者 cap：north-tech 3／white-wave 3／gale-shore 3／
//     gale-shore-2 3／black-pine 3／black-pine-2 2／iron-mist 2／obsidian 1／sky-hawk 0
//     ⇒ 賽程改制本身就修好 5 條；剩下兩條（obsidian／sky-hawk）門檻在下面調。
// ★★ 2026-08-11 替代路徑卷（使用者裁定）★★
// 病灶：9 條 feat 軸裡攻擊向 6、防守接發向 3、**組織向 0** ⇒ 玩二傳或自由人的人推不動
// 大半招募，而且遊戲沒說。修法＝`altFeats`（替代路徑 OR）：原條件一字不動，另外接受
// 一組替代軸，**feat 與任一 altFeat 達成即算**（`conditionMet`）。攻擊型玩家零影響。
//   `assistMatch`＝單場助攻（我舉→隊友扣得分）≥ perMatch 的場次數——**綁二傳**
//   `saveMatch`＝單場起球（`boxScoreLFor().digs`＝第一觸 receive/dive，含接發與防守起球）
//     ≥ perMatch 的場次數——**綁自由人**（為什麼一定要綁：見下面 `AXIS_ROLE`）
// ★門檻是逐槽量出來的，不是拍的★（`tools/recruit-axis-distribution-probe.mjs`，
// 2453–2480 場/情境、3 個 seed 家族、經驗達成率 40–60%）。
// ★★這些百分比都是治具數字，兩條軸的偏差方向**相反**，不要一句話帶過★★
//   `assistMatch`＝**上界**：治具 AI 二傳幾乎每一球都舉（探針自己標了這一條），真人
//     走位不到位時球會落給保底自動舉、那些場次不記在玩家頭上 ⇒ 真人必然更低。
//     `count 3` 的三槽（white-wave／black-pine／gale-shore-2＝窗口內幾乎每場都要達標）
//     對這個偏差最敏感。
//   `saveMatch`＝**方向未知、可能偏低**：治具 AI 的魚躍是擲骰節流（`ai.js:89`
//     `DIVE_RATE=0.16`），真人版**不擲骰、判到就撲**（`matchControls.js:509-511` 註解
//     自陳「機率會變『角色不聽話』」）⇒ 真人會把 AI 骰掉的那批也撲到。
// **兩條都在真人試玩取樣前當作待驗，不要拿去當難度基準。****每一槽的 perMatch 都對齊
// 那一槽自己的窗口**——同一個「單場 N 次」在 bo5 決賽比小組賽好過 2–3 倍（小組 18–22
// vs 決賽 63.2），這是 `218130e`「門檻與窗口不相稱」的同族陷阱，變數換成該場的局數。
// ⇒ **要改任何一個 perMatch，先重跑那支探針看該槽的窗口，不要只調數字**。
export const RECRUIT_CONDS = {
  // cap 3（改制前 2＝不可達）：level 52 最弱隊，三戰全勝仍是合理挑戰 ⇒ 門檻不動
  'north-tech': { opponentId: 'north-tech', role: 'setter', wins: 3 },
  'white-wave': {
    opponentId: 'white-wave', role: 'libero', wins: 2,
    feat: { type: 'digMatch', perMatch: 3, count: 3, label: '單場救起 3 記重扣' },
    // 原軸（敵方扣球後的救球）自由人走得到、二傳走不到（S 每場起球均 0.66、
    // P(單場≥3)=4.4%，窗口 3.19 場要湊 3 場＝量級 10⁻⁵）⇒ 補一條二傳的路。
    // 窗口均 3.19 場，治具上界 48%（見下方「這些百分比是上界」）
    altFeats: [
      { type: 'assistMatch', perMatch: 18, count: 3, label: '單場助攻 18 次' },
    ],
  },
  obsidian: {
    // ★ 改動（08-09）：wins 2 → 1 ★ 詹子曜是**三年級**（`recruitTargetGone` 第 2 屆起
    // 已畢業）⇒ 窗口只有第 1 屆；而第 1 屆止步者對曜石的 cap ＝**1**（小組第三場，
    // 準決賽打不到）。原本的 wins 2 對止步者是恆不可達的死條件，且它跟賽制無關——
    // 改制前就壞了，改制後 cap 依然是 1（曜石是淘汰賽隊、抽不進循環組）。
    // ★ 改動（08-11，使用者裁定）：feat.count 5 → 1 ★ 病灶是**門檻與窗口不相稱**，
    // 不是「門檻太高」——曜石窗口固定 1 局（上面那段已定案），5 顆攔死要塞進 1 局，
    // Poisson 達成率僅 0.006%（λ 見下）。真人手動攔網速率 ≈0.4 blockKill/局
    // （使用者自述「偶爾一局會有一球」，非治具數字——治具 AI 代打只有 0.09~0.19/局，
    // 低估 2–5 倍，不能拿來訂門檻）。窗口 1 局 × 0.4 ⇒ λ=0.4，門檻 1 的達成率
    // ≈1-e^-0.4≈33%。**改這裡之前，先重算窗口局數再訂門檻，不要只調數字**。
    opponentId: 'obsidian', role: 'middle', wins: 1,
    feat: { type: 'blockKill', count: 1, label: '攔死其攻擊' },
    // 替代路徑（窗口均 1.48 場／L 1.37）：治具上界 40%（助攻）／46%（起球）
    altFeats: [
      { type: 'assistMatch', perMatch: 19, count: 2, label: '單場助攻 19 次' },
      { type: 'saveMatch', perMatch: 10, count: 1, label: '單場起球 10 次' },
    ],
  },
  'iron-mist': {
    // cap 2＝門檻 2（窗口內要全勝 level 64）：偏緊但**沒有變差**（改制前也是 2），
    // 且第 2 屆多了「鐵霧被抽進小組」的加場機會（cap 均 2.22）⇒ 本卷不動，留待難度卷
    // ★ 改動（08-11，使用者裁定）：quality 0.8 → 0.70 ★ 接發品質**不是連續分佈，是離散
    // 點質量**：真人只產得出 {1.00, 0.70, 0.60, 0.50} 四個值（`matchControls.js:198/468/
    // 472/514`）、治具 AI 恆 0.75（`ai.js:1773`）。⇒ 門檻 0.8 的真實語意是「**只認完美
    // 接發**」（唯一 ≥0.8 的取值是 1.00），而 0.8→0.75 對真人是**零效果改動**（0.75 是
    // 治具值、真人產不出來）。真正會改變行為的切點只有 ≤0.70（納入「按了但沒抓到
    // Perfect 窗」）。**改這個數字前先看那張取值表，別在 0.71~0.79 之間微調——那整段是空的**。
    // ★誠實標註：真人 1.00 與 0.70 各佔多少比例，程式裡沒有分佈模型 ⇒ 放寬後的達成率
    // 無法給數字，只能說方向是對的（治具端 0.60~0.75 逐值相同，量不出這一刀）★
    opponentId: 'iron-mist', role: 'opposite', wins: 2,
    feat: {
      type: 'strongReceive', quality: STRONG_RECEIVE_QUALITY, count: 8, label: '穩穩接起其發球',
    },
    // 接發軸對二傳是**結構性恆 0**（`ai.js:719` 的接發仲裁直接排除 setter；治具 2480 場
    // 逐場為 0）⇒ 放寬 quality 對 S 是零效果，要給的是另一條路。窗口均 2.23 場，上界 43%
    altFeats: [
      { type: 'assistMatch', perMatch: 17, count: 2, label: '單場助攻 17 次' },
    ],
  },
  // ★ 改動（08-09）：`stage` 由單一場次 → 場次清單（準決賽∪決賽）★ 原本寫死
  // `national-final`，三重矛盾疊在一起：
  //   ①天鷹在第 2 屆掛**準決賽**（`nationalLadderFor`）⇒ 該屆決賽對手是曜石，
  //     就算打進決賽也記不到 stageCleared＝**該屆結構上沒有窗口**（schedule.js 早有註記）
  //   ②王勝翔二年級 ⇒ 第 3 屆已畢業
  //   ⇒ 實際窗口只剩「第 1 屆決賽擊敗天鷹」＝第 1 屆奪冠（治具實測奪冠率 1%）。
  // 改成「在**淘汰賽舞台**上擊敗天鷹」：敘事（他要在畢業前站上大場面）與資料同源，
  // 且不再依賴天鷹當屆掛哪一輪。小組輪抽撞到天鷹不算——那不是他要的舞台。
  'sky-hawk': {
    opponentId: 'sky-hawk', role: 'outside', wins: 1,
    stage: ['national-sf', 'national-final'],
  },
  // W6 A3 強隊第二人（純壯舉軸；數值待 C2 治具複核）
  'obsidian-2': {
    opponentId: 'obsidian', role: 'middle',
    feat: { type: 'blockKillMatch', perMatch: 2, count: 1, label: '單場攔死其攻擊 2 次' },
    // 替代路徑（窗口均 1.79 場／L 1.61）：治具上界 40%（助攻）／43%（起球）
    altFeats: [
      { type: 'assistMatch', perMatch: 20, count: 2, label: '單場助攻 20 次' },
      { type: 'saveMatch', perMatch: 4, count: 2, label: '單場起球 4 次' },
    ],
  },
  'iron-mist-2': {
    opponentId: 'iron-mist', role: 'outside',
    feat: { type: 'aceMatch', perMatch: 2, count: 1, label: '單場對其 ACE 2 記' },
    // 替代路徑（窗口均 2.23 場）：治具上界 43%（助攻）／43%（起球）
    altFeats: [
      { type: 'assistMatch', perMatch: 17, count: 2, label: '單場助攻 17 次' },
      { type: 'saveMatch', perMatch: 5, count: 2, label: '單場起球 5 次' },
    ],
  },
  'sky-hawk-2': {
    opponentId: 'sky-hawk', role: 'opposite',
    feat: { type: 'killMatch', perMatch: 5, count: 1, label: '單場轟其 5 記殺球' },
    // 替代路徑（窗口均 1.46 場／L 1.29，且 12.5% 的生涯根本打不到天鷹）：
    // 治具上界 41%（助攻）／43%（起球）。★門檻看起來特別高是因為窗口全在淘汰賽（bo3/bo5）
    // ——局數多、單場統計自然膨脹，不是這一槽比較嚴★
    altFeats: [
      { type: 'assistMatch', perMatch: 31, count: 2, label: '單場助攻 31 次' },
      { type: 'saveMatch', perMatch: 13, count: 1, label: '單場起球 13 次' },
    ],
  },
  // W6 A1/A5 新隊雙招牌（wins 1-2 低門檻＋壯舉軸——配指定邀請＝一屆內看得到進度）
  'gale-shore': { opponentId: 'gale-shore', role: 'setter', wins: 2 },
  'gale-shore-2': {
    opponentId: 'gale-shore', role: 'outside', wins: 1,
    feat: { type: 'killMatch', perMatch: 4, count: 1, label: '單場轟 4 記殺球' },
    // 替代路徑（窗口均 3.18 場）：治具上界 60%（助攻）／58%（起球）
    altFeats: [
      { type: 'assistMatch', perMatch: 17, count: 3, label: '單場助攻 17 次' },
      { type: 'saveMatch', perMatch: 8, count: 1, label: '單場起球 8 次' },
    ],
  },
  'black-pine': {
    // ★ 改動（08-11，使用者裁定）：feat.count 4 → 2 ★ 同 obsidian，病灶是**門檻與
    // 窗口不相稱**。黑松窗口＝3 屆，保底均值 3.15 局（全程不需贏球）。真人手動攔網
    // 速率 ≈0.4 blockKill/局（使用者自述，非治具——治具 AI 代打低估 2–5 倍，不能拿來
    // 訂門檻）。窗口 3.15 局 × 0.4 ⇒ λ≈1.26，門檻 2 的達成率 ≈1-e^-1.26×(1+1.26)≈36%
    // （對照舊門檻 4：λ=1.26 下累積到 4 的機率 <5%，太貼天花板）。**改這裡之前，
    // 先重算窗口局數再訂門檻，不要只調數字**。
    opponentId: 'black-pine', role: 'middle', wins: 1,
    feat: { type: 'blockKill', count: 2, label: '攔死其攻擊' },
    // 替代路徑（窗口均 3.23 場）：治具上界 44%（助攻）／47%（起球）
    altFeats: [
      { type: 'assistMatch', perMatch: 16, count: 3, label: '單場助攻 16 次' },
      { type: 'saveMatch', perMatch: 4, count: 3, label: '單場起球 4 次' },
    ],
  },
  'black-pine-2': {
    // ★ 改動（08-09）：wins 2 → 1 ★ 戴柏毅二年級 ⇒ 窗口＝第 1、2 屆；改制前止步者對
    // 黑松的 cap ＝**1**（黑松只在小組輪抽出現，第 1 屆的小組是固定模板）⇒ 恆不可達
    // （這就是任務書點名的那條）。改制後 cap ＝2（黑松進了循環組抽籤池），但門檻 2
    // ＝要求「兩次相遇對 level 67 全勝」⇒ 仍然貼在天花板上。放到 1，讓它是
    // 「贏過黑松一次＋接起 5 記強發」——與同級的 `black-pine`（wins 1＋壯舉）同構。
    // ★ 改動（08-11）：quality 0.8 → 0.70 ★ 理由同 `iron-mist`（離散點質量，0.8＝只認完美）
    opponentId: 'black-pine', role: 'opposite', wins: 1,
    feat: {
      type: 'strongReceive', quality: STRONG_RECEIVE_QUALITY, count: 5, label: '穩穩接起其發球',
    },
    // 同 iron-mist：接發軸對二傳結構性恆 0。窗口均 2.09 場，上界 51%
    altFeats: [
      { type: 'assistMatch', perMatch: 16, count: 2, label: '單場助攻 16 次' },
    ],
  },
};

// 招牌球員定稿（命名工程 07-25）：name＝入隊後的隊內暱稱（存檔鍵值不動）、
// fullName＝全名——與 opponents.js squad/libero 裡同一人逐字一致（挖角敘事的
// 一致性錨點，naming.test 靜態把關）；persona 沿用
const RECRUIT_DEFS = {
  'north-tech': { name: '阿澄', fullName: '杜品澄', persona: '北原的節拍器——不起眼的一傳一舉，把整隊的亂流理成直線' },
  'white-wave': { name: '小浪', fullName: '蔡沐恩', persona: '白浪最黏的那道浪——球不落地，是他唯一的信仰' },
  obsidian: { name: '阿曜', fullName: '詹子曜', persona: '曜石的快攻箭頭——起跳永遠比你的判斷快半拍' },
  'iron-mist': { name: '阿鐵', fullName: '劉振鎧', persona: '鐵霧的重砲右翼——發球跟扣球一樣，都往死裡打' },
  // 4.5A 小件：讓位後心境（W4 ace 讓位莊敬嶺、移第 4 槽；招募條件不動）
  'sky-hawk': { name: '阿鷹', fullName: '王勝翔', persona: '天鷹的前任王牌——舞台讓給了一年級，他想在畢業前證明：天空，還記得他的名字' },
  'obsidian-2': { name: '小磐', fullName: '許嘉碩', persona: '曜石的第二座山——不如阿曜快，但攔下來的球一顆都不還' },
  'iron-mist-2': { name: '阿霜', fullName: '徐世銘', persona: '鐵霧的左翼冷刃——安靜，準，出手不帶感情' },
  'sky-hawk-2': { name: '大隼', fullName: '李振騰', persona: '天鷹的右翼重錘——王牌的影子，也想當一次主角' },
  // D1 成長線 persona（2026-07-30 拍板：ace 降 1 年級，登場即三年級的悲壯設定廢止）
  'gale-shore': { name: '小嵐', fullName: '簡子嵐', persona: '青嵐的球路設計師——跟你同一屆。上次那套球路他已經拆過了，這次換新的' },
  'gale-shore-2': { name: '阿汐', fullName: '余承汐', persona: '青嵐的斜線快手——潮水退了才知道他打的是哪條線' },
  'black-pine': { name: '老松', fullName: '曾家松', persona: '黑松高牆的基石——跟你同一屆，牆一年砌高一次。他等的不是最後一戰，是下一戰' },
  'black-pine-2': { name: '大柏', fullName: '戴柏毅', persona: '黑松的右翼砲台——牆後面，藏著一門重砲' },
};

// 名單一致性測試用（naming.test.mjs）：不進 UI、不進 sim
export function recruitDefOf(recruitKey) {
  return RECRUIT_DEFS[recruitKey] ?? null;
}

// ---- W1(P4) 年級（憲法 Q3：真實年級——三年級挖來只能用一年）----

// 招募目標的基準年級＝來源隊名單同一人的年級（單一事實源在 opponents.js grades/
// liberoGrade，以 fullName 對槽——「年級與來源隊名單同一人一致」由構造保證，
// naming.test 再靜態把關）。查無＝回退 2（防呆，不應發生）
export function recruitGradeOf(recruitKey) {
  const cond = RECRUIT_CONDS[recruitKey];
  const meta = RECRUIT_DEFS[recruitKey];
  const def = cond ? opponentById(cond.opponentId) : null;
  if (!def || !meta) return 2;
  if (cond.role === 'libero') return def.liberoGrade ?? 2;
  const slot = def.squad?.indexOf(meta.fullName) ?? -1;
  return slot >= 0 ? (def.grades?.[slot] ?? 2) : 2;
}

// 目標現行年級（第 seasonIndex 屆）；>3＝已畢業離校
export function recruitCurrentGrade(recruitKey, seasonIndex = 1) {
  return recruitGradeOf(recruitKey) + (seasonIndex - 1);
}

// 已畢業＝不可再招（UI 顯示「已畢業」、settleRecruitJoins 跳過；progress 保留不清
// ——歷史就是歷史，短暫相遇也是敘事資產）
export function recruitTargetGone(recruitKey, seasonIndex = 1) {
  return recruitCurrentGrade(recruitKey, seasonIndex) > 3;
}

// ---- 壯舉事件掃描（賽末 state.events；純函式）----

// 敵方扣球後的第一時間救球（receive/dive）＝dig；掃描器與 matchStatsFor 同一套
// 事件語彙（TOUCH kind/power、BLOCK_TOUCH、SCORE），不新增事件型別
function countDigs(events, playerId, myTeam) {
  let digs = 0;
  let enemySpikeLive = false;
  for (const e of events) {
    if (e.type === 'TOUCH') {
      if (e.team !== myTeam && e.kind === 'spike') {
        enemySpikeLive = true;
      } else {
        if (
          enemySpikeLive && e.playerId === playerId &&
          (e.kind === 'receive' || e.kind === 'dive')
        ) digs += 1;
        enemySpikeLive = false;
      }
    } else if (e.type === 'BLOCK_TOUCH' || e.type === 'SCORE') {
      enemySpikeLive = false;
    }
  }
  return digs;
}

// 敵方發球後的第一觸＝接發；power（觸球品質）≥ quality 才算「接起」
function countStrongReceives(events, playerId, myTeam, quality) {
  let n = 0;
  let awaitingReception = false;
  for (const e of events) {
    if (e.type === 'SERVE') {
      awaitingReception = e.team !== myTeam;
    } else if (e.type === 'TOUCH') {
      if (
        awaitingReception && e.playerId === playerId &&
        (e.kind === 'receive' || e.kind === 'dive') && (e.power ?? 0) >= quality
      ) n += 1;
      awaitingReception = false;
    } else if (e.type === 'BLOCK_TOUCH' || e.type === 'SCORE') {
      awaitingReception = false;
    }
  }
  return n;
}

// 替代軸綁定的位置（★08-11 對抗覆審 HIGH★）：`saveMatch` 的判準是「第一觸起球」，
// 而治具實測 **OH 每場 12.84 次起球，比自由人臂的 7.08 還高**（自由人只在後排輪次
// 上場）⇒ 不綁位置的話，這條「給自由人的替代路徑」對主攻手近乎恆真，實測讓 4 個槽
// 從 0% 跳到 33/50/92/33%＝把那些槽的壯舉軸實質廢掉。
// ★這個病靠「調高門檻」修不好★：要調到 OH 打不到，自由人只會更打不到（7.08 < 12.84）
// ——門檻與位置是兩個問題，用一個數字回答必然顧此失彼。
// assistMatch 同理綁二傳：替代路徑的用意是「用你這個位置的方式證明自己」，不是通用捷徑。
const AXIS_ROLE = { assistMatch: 'setter', saveMatch: 'libero' };

// 單一壯舉軸的本場增量（feat 與 altFeats 共用同一個判定器——兩份判定器＝兩套語意，
// 遲早分岔）。未知軸型回 0。
// `role`＝玩家本場的 currentRole；綁位置的軸在位置不符時一律 0。**role 缺值也是 0**
// （安全預設往「不承諾」倒——寧可漏發也不要送出玩家其實走不到的路）。
function gainOfAxis(events, playerId, myTeam, f, role) {
  if (!f || !events) return 0;
  if (AXIS_ROLE[f.type] && role !== AXIS_ROLE[f.type]) return 0;
  if (f.type === 'blockKill') return matchStatsFor(events, playerId, myTeam).blockPoints;
  if (f.type === 'strongReceive') return countStrongReceives(events, playerId, myTeam, f.quality);
  if (f.type === 'digMatch') return countDigs(events, playerId, myTeam) >= f.perMatch ? 1 : 0;
  // W6 單場統計軸（matchStatsFor 既有欄位 ≥ perMatch＝1 場達標）
  if (f.type === 'blockKillMatch') {
    return matchStatsFor(events, playerId, myTeam).blockPoints >= f.perMatch ? 1 : 0;
  }
  if (f.type === 'aceMatch') return matchStatsFor(events, playerId, myTeam).aces >= f.perMatch ? 1 : 0;
  if (f.type === 'killMatch') return matchStatsFor(events, playerId, myTeam).kills >= f.perMatch ? 1 : 0;
  // 08-11 替代路徑軸（二傳／自由人）
  if (f.type === 'assistMatch') {
    return countSetAssistKills(events, playerId, myTeam) >= f.perMatch ? 1 : 0;
  }
  if (f.type === 'saveMatch') return boxScoreLFor(events, playerId).digs >= f.perMatch ? 1 : 0;
  return 0;
}

// 本場壯舉進度增量（依對手條件的 feat 軸；無 feat 軸＝0）。原 feat 軸不綁位置。
export function featGainFor(events, playerId, myTeam, cond) {
  return gainOfAxis(events, playerId, myTeam, cond?.feat, null);
}

// 替代軸清單（缺項＝空陣列——呼叫端不必各自 `?? []`）
export function altFeatsOf(cond) {
  return cond?.altFeats ?? [];
}

// 這條替代軸是不是「這個位置走得到的路」——判定端（gainOfAxis）與顯示端
// （careerScreen 的進度列）共用這一支。**兩邊各寫一份＝畫面遲早承諾走不到的路**
// 未知軸型一律 false（安全預設往「不承諾」倒）：`gainOfAxis` 對認不得的型別回 0，
// 若這裡反而回 true，畫面就會對所有位置承諾一條判定端永遠給 0 的路——軸型打錯字
// （`assistMach`）就是這樣靜默生效的。`tests/recruit-alt-path.test.mjs` 另有型別守衛。
export function altFeatAvailableTo(f, role) {
  return !!AXIS_ROLE[f?.type] && role === AXIS_ROLE[f.type];
}

// 這條替代軸屬於哪個位置（顯示層用來說「（需二傳）」；未知軸型＝null）
export function altFeatRoleOf(f) {
  return AXIS_ROLE[f?.type] ?? null;
}

// 本場位置的**單一取得路徑**（賽末累加 `matchCareer` 與賽中字卡 `matchLoop` 共用）。
// 收斂而不是各自寫一份：這個值漏掉時整個替代路徑會靜默失效（軸恆 0、玩家打完三年
// `alts` 仍是 {}），而漏掉的地方越多、能靜默的入口就越多。
export function matchRoleOf(game, playerId) {
  return game?.players?.[playerId]?.currentRole ?? null;
}

// 該位置走得到的替代軸（顯示層用；role 缺值＝一條都不列，與判定端同一個安全預設）
export function altFeatsFor(cond, role) {
  return altFeatsOf(cond).filter((f) => altFeatAvailableTo(f, role));
}

// 本場替代軸增量：回傳 { [axisType]: gain }（鍵＝軸型而非索引——存檔看得懂，
// 且日後調換 altFeats 順序不會把進度對錯欄）。`role` 缺值時綁位置的軸一律 0。
export function altGainsFor(events, playerId, myTeam, cond, role = null) {
  const out = {};
  for (const f of altFeatsOf(cond)) {
    out[f.type] = gainOfAxis(events, playerId, myTeam, f, role);
  }
  return out;
}

// ---- 進度資料層（save.recruitment：progress 跨賽季累積、永不重置）----

// 逐鍵正規化（不是整條回退）：手改/匯入的半殘條目（如 {wins:2} 缺 feat）缺鍵補 0——
// 否則 `undefined + n` 產生 NaN，該員的 conditionMet 恆 false（對抗審查 LOW-1）。
// W6：progress 鍵＝recruitKey（既有 5 隊鍵值同 opponentId，舊存檔零遷移）
export function progressOf(recruitment, recruitKey) {
  const p = recruitment?.progress?.[recruitKey];
  // alts＝替代軸進度 { [axisType]: n }；08-11 前的存檔沒有這個鍵 ⇒ 回退 {}（零遷移，
  // 且與 wins/feat 同一條「缺鍵補 0、不是整條回退」的正規化慣例）
  const alts = {};
  for (const [k, v] of Object.entries(p?.alts ?? {})) alts[k] = v ?? 0;
  return {
    wins: p?.wins ?? 0,
    feat: p?.feat ?? 0,
    stageCleared: !!p?.stageCleared,
    alts,
  };
}

// 某條替代軸的已累積進度（缺鍵＝0）
export function altProgressOf(recruitment, recruitKey, axisType) {
  return progressOf(recruitment, recruitKey).alts[axisType] ?? 0;
}

// stage 軸的場次集合（字串或字串陣列皆可；缺項＝不檢查）——單一真相，
// accrueRecruitProgress 與 UI 進度說明共用，勿在呼叫端各自 `Array.isArray` 一次
export function stageIdsOf(cond) {
  if (!cond?.stage) return [];
  return Array.isArray(cond.stage) ? cond.stage : [cond.stage];
}

// 賽末累加（不可變）：勝場＋壯舉＋stage 軸（僅在指定場次擊敗才記）。
// W6：同隊多招募對象＝逐鍵各自累加（wins 軸同步、feat 軸各算各的）；
// 非招募對象（無條件定義）原樣返回。
export function accrueRecruitProgress(recruitment, {
  opponentId, matchId, won, events = null, playerId = null, myTeam = null, role = null,
}) {
  let rec = recruitment;
  for (const [key, cond] of Object.entries(RECRUIT_CONDS)) {
    if (cond.opponentId !== opponentId) continue;
    const prev = progressOf(rec, key);
    const gains = altGainsFor(events, playerId, myTeam, cond, role);
    const alts = { ...prev.alts };
    for (const [type, g] of Object.entries(gains)) {
      // 零增量且從未累積過＝不在存檔裡長出這個鍵（玩主攻手的人不該因為經過這些對手，
      // 就在存檔裡多出一堆恆 0 的替代軸欄位；`progressOf` 對缺鍵本來就回 0）
      if (!g && alts[type] == null) continue;
      alts[type] = (alts[type] ?? 0) + g;
    }
    const entry = {
      wins: prev.wins + (won ? 1 : 0),
      feat: prev.feat + featGainFor(events, playerId, myTeam, cond),
      stageCleared: prev.stageCleared
        || !!(won && stageIdsOf(cond).includes(matchId)),
      alts,
    };
    rec = { ...rec, progress: { ...(rec.progress ?? {}), [key]: entry } };
  }
  return rec;
}

// 壯舉軸是否達成：原 feat **或**任一 altFeat（08-11 替代路徑卷）。
// 只有壯舉這一軸走 OR——wins 與 stage 不在此列（那兩軸對所有位置一律可達，
// 沒有「二傳算不到」的問題，放寬會變成無差別降門檻）。
function featAxisMet(cond, p) {
  if (!cond.feat) return true; // 無壯舉軸＝不檢查（altFeats 亦不獨立成軸）
  if (p.feat >= cond.feat.count) return true;
  return altFeatsOf(cond).some((f) => (p.alts[f.type] ?? 0) >= f.count);
}

// 條件是否全數達成（三軸缺項＝不檢查；W6 起 wins 亦可缺——A3 第二人純壯舉軸）
export function conditionMet(recruitment, recruitKey) {
  const cond = RECRUIT_CONDS[recruitKey];
  if (!cond) return false;
  const p = progressOf(recruitment, recruitKey);
  return (cond.wins == null || p.wins >= cond.wins)
    && featAxisMet(cond, p)
    && (!cond.stage || !!p.stageCleared);
}

// ---- 招牌球員 DNA 生成（決定論：種子＝career seed × opponentId，同存檔重演逐值一致）----

// FNV-1a 混雜（與 careerState.matchSeed 同慣例）：careerSeed × 字串 → 32-bit hash
function hash32(seed, str) {
  let h = ((seed >>> 0) ^ 0x811c9dc5) >>> 0;
  for (const ch of String(str)) {
    h = (h ^ ch.codePointAt(0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

const clampAttr = (v) => Math.max(ATTR_MIN, Math.min(ATTR_MAX, Math.round(v)));

// W6 入隊補正（新增採納 1）：招募生以「當前隊伍平均能力」為底線生成——解「後期招募
// 貶值」（隊友成長到 80+ 時，新人還從來源隊出廠值起跳＝進來就是棄子）。
// 只補不砍：來源隊公式值已高於隊伍水位＝照舊（早期招強隊招牌仍然是即戰力）；
// 由入隊當下名冊決定論導出（成員屬性是存檔狀態，同存檔重演一致）
// export（07-30）：來投保底（graduation.buildWalkOn）吃同一條公式——單一真相
export function rosterUplift(members, baseAttrs) {
  if (!members?.length) return 0;
  const avgOf = (attrs) => ATTRIBUTE_KEYS
    .reduce((s, k) => s + (attrs[k] ?? 0), 0) / ATTRIBUTE_KEYS.length;
  const teamAvg = members.reduce((s, m) => s + avgOf(m.attributes), 0) / members.length;
  return Math.max(0, Math.round(teamAvg - avgOf(baseAttrs)));
}

// 屬性槽位身高（opponents.js heights 槽序＝S/OH/MB/OPP/OH/MB）
const ROLE_HEIGHT_SLOT = { setter: 0, outside: 1, middle: 2, opposite: 3 };

// N2：招募目標本人就是該隊成長型 ace 時的當屆身高（否則 null＝走建檔常數）
function aceHeightForRecruit(def, meta, seasonIndex) {
  if (def?.ace?.name !== meta?.fullName) return null;
  return aceGrowthAt(def, seasonIndex)?.heightM ?? null;
}

// 依來源隊 level＋attrBias（＋該角色 roleBias）決定論生成成員；每屬性帶 −2..+2
// 決定論抖動（hash(careerSeed, recruitKey:attr)）讓同角色轉學生不是複製人。
// 自由人走 buildLibero 防守專才公式為基底（與小守同一條屬性哲學）再抖動。
// W6：第一參數改 recruitKey（既有 5 隊鍵值＝opponentId，抖動 hash 輸入不變＝
// 舊存檔重演逐值一致）；origin 維持「來源隊 id」語義（cond.opponentId），
// recruitKey 另立欄位（同隊第二人與招牌的 UI/防重招對映靠它；舊成員缺欄回退 origin）
// 第 4 參數 rosterMembers（W6）：給了就做入隊補正（settleRecruitJoins 傳現役名冊）；
// 省略＝無補正（治具基準臂/舊呼叫端行為不變）。
// 第 5 參數 seasonIndex（W1/P4，取代舊「固定二年級」拍板）：入隊年級＝來源隊
// 基準年級＋(屆數−1)——真實年級接成長率分檔（RATE_BY_GRADE）與畢業流程
export function buildRecruitMember(recruitKey, careerSeed, id, rosterMembers = null, seasonIndex = 1) {
  const cond = RECRUIT_CONDS[recruitKey];
  const def = cond ? opponentById(cond.opponentId) : null;
  const meta = RECRUIT_DEFS[recruitKey];
  if (!def || !cond || !meta) throw new Error(`buildRecruitMember：未知招募對象 ${recruitKey}`);
  const role = cond.role;
  const jitter = (key) => (hash32(careerSeed, `${recruitKey}:${key}`) % 5) - 2;
  const attributes = {};
  const base = role === 'libero'
    ? buildLibero('A', meta.name, def.level).attributes
    : null;
  const baseAttrs = {};
  for (const k of ATTRIBUTE_KEYS) {
    baseAttrs[k] = base
      ? base[k]
      : def.level + (def.attrBias?.[k] ?? 0) + (def.roleBias?.[role]?.[k] ?? 0);
  }
  const uplift = rosterUplift(rosterMembers, baseAttrs); // W6 入隊補正（只補不砍）
  for (const k of ATTRIBUTE_KEYS) {
    attributes[k] = clampAttr(baseAttrs[k] + uplift + jitter(k));
  }
  return {
    id,
    name: meta.name,
    fullName: meta.fullName,
    origin: def.id, // schema：origin＝來源隊 id（starter 以外皆招募生）
    recruitKey, // W6：招募槽對映（同隊多人時 origin 不再唯一）
    role,
    // N2（07-30）：挖到的是成長型 ace＝身高取**入隊當屆**值，不是建檔常數——
    // 否則情蒐畫面說 2.03m、入隊後隊友卡變回 2.01m（同一個人兩個身高）
    height: role === 'libero'
      ? 1.72
      : (aceHeightForRecruit(def, meta, seasonIndex)
        ?? def.heights?.[ROLE_HEIGHT_SLOT[role]] ?? 1.86),
    attributes,
    // W1(P4)：真實年級（夾限 3——理論上 settleRecruitJoins 已擋畢業者）
    growth: { grade: Math.min(3, recruitGradeOf(recruitKey) + (seasonIndex - 1)), xp: {}, log: [] },
    // P2①（07-30）：入隊屆數——「本屆有無招募入隊」的單一判準（來投保底的觸發條件）；
    // 舊存檔成員無此欄＝該屆視為無招募（保底寧可多給一名，不會少給）
    joinedSeason: seasonIndex,
    dna: { teamId: def.id, style: def.style, tag: def.name },
    persona: meta.persona,
  };
}

// 新成員 id：R 前綴避免與 A1..A6/AL 碰撞；序號＝歷來 R 成員（現役 members ∪ 已逐出
// expelled 快照）最大號＋1——逐出移除現役成員後 id 絕不回收（否則新招募與現役撞號，
// 亦違「R id 不回收」）。expelled 屬存檔狀態一部分，同存檔重演一致。
export function nextRecruitId(members, expelled = []) {
  const ids = [
    ...(members ?? []).map((m) => m.id),
    ...(expelled ?? []).map((e) => e.member?.id),
  ];
  let max = 0;
  for (const id of ids) {
    const m = /^R(\d+)$/.exec(id ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `R${max + 1}`;
}

// ---- 入隊流程（store 層）----

// 條件達成→入隊：逐招募槽檢查（表序），滿足且有空位＝生成成員、單次 RMW 原子寫入
// 三處（roster.members push＋lineup.trust 顯式 10＋recruitment.recruited push——
// store.applyRecruit 一筆寫完，不留「入了名冊沒記 recruited」的中間態）。
// 無空位（P2② 2026-07-30 拍板修正「達標但滿編＝永遠不入隊」）：達標者進**等候名單**
// （recruitment.waiting，表序即等候序）——逐出騰位後下次結算自動入隊，或下屆畢業潮
// 騰位時由 advanceSeason 優先遞補（careerStore；優先於新生保底）。
// progress 一律不清（條件保持已達成）。
// 冪等：recruited 已含該槽＝跳過；重複呼叫返回空陣列。
// W6：recruited 存 recruitKey（既有 5 隊鍵值＝opponentId，舊存檔零遷移）；
// applyRecruit 的 opponentId 參數自 W6 起承載 recruitKey（store 只作 recruited push 用）
export function settleRecruitJoins(store, careerSeed) {
  const joined = [];
  const waitlisted = []; // P2②：本次達標但滿編者（入等候名單，下屆優先）
  const seasonIndex = store.seasonIndex?.() ?? 1; // W1(P4)：真實年級與畢業下架
  for (const recruitKey of Object.keys(RECRUIT_CONDS)) {
    const rec = store.loadRecruitment();
    const roster = store.loadRoster();
    // members 空＝名冊尚未 ensureStarterRoster 補齊——先入隊會讓補齊判定（members
    // 非空＝已補）誤判而永遠缺創隊班底；實務上 progress>0 必經開賽（已補齊），此為防線
    if (!rec || !roster || roster.members.length === 0) return joined;
    if (rec.recruited.includes(recruitKey) || !conditionMet(rec, recruitKey)) continue;
    if (recruitTargetGone(recruitKey, seasonIndex)) continue; // 已畢業＝條件達成也不入隊
    if (openSlots(roster) <= 0) {
      waitlisted.push(recruitKey); // P2②：不再是黑洞——排隊等下屆騰位
      continue;
    }
    const id = nextRecruitId(roster.members, rec.expelled ?? []); // 含 expelled：id 不回收
    // W6：傳現役名冊＝入隊補正生效（晚招的人跟上隊伍成長水位）
    const member = buildRecruitMember(recruitKey, careerSeed, id, roster.members, seasonIndex);
    if (!store.applyRecruit({ member, opponentId: recruitKey, trust: RECRUIT_TRUST })) return joined;
    joined.push(member);
  }
  if (waitlisted.length) {
    const rec = store.loadRecruitment();
    if (rec) {
      const next = mergeWaiting(rec, waitlisted);
      if (next !== rec) store.saveRecruitment(next);
    }
  }
  return joined;
}

// ---- P2② 等候名單（recruitment.waiting；純函式層）----
// schema：可選鍵（比照 roster.alumni／recruitment.expelled 慣例）——舊存檔無此鍵＝
// 讀取端 ?? [] 容錯，零遷移。內容＝recruitKey 陣列，**表序即等候序**（先達標先入隊）。

export function waitingOf(recruitment) {
  return [...(recruitment?.waiting ?? [])];
}

// 併入等候者（去重、保序）；無變化＝原物件返回（呼叫端可據此省一次寫檔）
export function mergeWaiting(recruitment, keys) {
  const waiting = waitingOf(recruitment);
  let changed = false;
  for (const k of keys ?? []) {
    if (!waiting.includes(k)) {
      waiting.push(k);
      changed = true;
    }
  }
  return changed ? { ...recruitment, waiting } : recruitment;
}

// 等候名單的當屆有效順位（advanceSeason 消費）：已入隊者與**目標已畢業**者出列
// ——D1 ace 降年級後，畢業作廢時點跟著變（recruitTargetGone 是唯一判準，不另抄一份）
export function pendingWaiting(recruitment, seasonIndex) {
  return waitingOf(recruitment).filter(
    (k) => RECRUIT_CONDS[k]
      && !(recruitment?.recruited ?? []).includes(k)
      && !recruitTargetGone(k, seasonIndex),
  );
}

// ---- W5 逐出資格判定（純函式：UI 閘門與 store 最後防線共用同一套規則）----

// 本屆已逐出人數（每屆上限判定用）：以 expelled 條目的 seasonIndex 過濾當屆
export function expelCountThisSeason(recruitment, seasonIndex) {
  return (recruitment?.expelled ?? []).filter((e) => e.seasonIndex === seasonIndex).length;
}

// 可否逐出某成員（拍板邊界，回傳 { ok, reason }——reason 供 UI 對應提示）：
//   僅招募生可逐（W5 拍板「僅可逐招募生」；W1/P4 起 origin 家族擴為
//   starter/handwritten/generated——判準改「origin 是對手隊 id」＝招募生，
//   創隊班底與新生一律不可逐）、不在現役先發或自由人位（先發保護；
//   libero 一併擋——避免逐掉現役自由人孤兒化 lineup.libero）、每屆上限 1。
export function canExpel(save, memberId) {
  const member = save?.roster?.members?.find((m) => m.id === memberId);
  if (!member) return { ok: false, reason: 'not-found' };
  if (!opponentById(member.origin)) return { ok: false, reason: 'starter-origin' };
  const lineup = save.lineup ?? {};
  if ((lineup.starters ?? []).includes(memberId) || lineup.libero === memberId) {
    return { ok: false, reason: 'in-lineup' };
  }
  const seasonIndex = save.season?.index ?? 1;
  if (expelCountThisSeason(save.recruitment, seasonIndex) >= EXPEL_PER_SEASON_LIMIT) {
    return { ok: false, reason: 'season-limit' };
  }
  return { ok: true, reason: '' };
}
