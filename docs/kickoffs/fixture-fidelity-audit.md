# 治具保真度全盤盤點（balance-sim.mjs ↔ production 生涯推進）

> 2026-08-03｜難度重校卷前置。**盤點當輪只比對，一格 `src/` 與一格 `tools/` 都沒改。**
> **2026-08-04 更新**：盤點之後已依本表動工修治具（`src/` 仍一格未動）——
> F4／F5／G1／G3／G4／G5 先行，F1／G6／G11 一包隨後（實測見**附錄 C**）；
> 表中「治具側」欄的行號已隨之更新，標「**已修**」者以該欄行號為準。
> 上游＝`difficulty-recal-attribution.md` §七（F1–F6，先前抽樣登記的六項）。
> 本檔是**窮舉版**：逐項走過 `careerStore.advanceSeason` 與它呼叫到的 `src/career/` 全部模組，
> 以及生涯單場的注入面（`matchConfig.js` → `createGame`），逐項給結論。

---

## 一句話結論

**除了已知的 F1–F6，另找到 14 項差異（G1–G14）。連同既有的 F1／F5，共 5 項會系統性偏移
難度曲線（G1、G3、G7、F1、F5；G2 的跨屆效應待量）；
最嚴重的是 G1「治具止步後照樣打完國賽」——約四成的生涯在真實遊戲裡每屆少打兩場，
少拿成長點、少長隊友、少累積情蒐與招募，還把「只有打進決賽才學得到的跳發」白送給每一條生涯。**

方向上，G1/G2/G3/G4/G5 讓治具**低估難度**（修好後難度上升），
G7/G8/G10/G12/G13/G14 讓治具**高估難度**（修好後難度下降）——**兩邊不會互相抵銷成 0，
因為低估側的四項都逐屆放大、高估側多半是常數項**。

---

## 差異總表

圖例：**方向**＝把治具修到與 production 一致之後，量到的難度會怎麼動。
「難度上升」＝現行治具把遊戲量得比實際簡單（低估難度）。

| # | 項目 | 治具側 | production 側 | 差異 | 方向 | 量級 | 修復成本 |
|---|---|---|---|---|---|---|---|
| **F1** | 無畢業換血 | `balance-sim.mjs:812-838`（**已修**，`VD_FAITHFUL`／`VD_TURNOVER`） | `careerStore.js:183-206` → `graduation.js:288-354` | 三年級不畢業、年級不推進、無新生入學 | **難度上升（已量）** | 配對 n=100：第 3 屆 Δ決賽帶 **−17.0pp ± 6.8**、Δ國賽勝場 **−0.370 ± 0.139**；第 1 屆逐值全等（自驗閘）。詳見附錄 C | 已做 |
| **F2** | 招募生從不先發 | `balance-sim.mjs:407,420`（lineup 基準臂＝null） | `lineup.js:30-59` ＋ 玩家可自行排陣 | 預設序依名冊順序，starter 永遠排在招募生前 | 難度下降 | Δ招募＝+0.0±0.0（attribution §二） | 中 |
| **F3** | 挖角不削弱對手 | — | `careerState.js:215-238`（屬性只吃 level，與 squad 名單無關） | 這是 production 的功能缺口，不是治具問題 | — | — | 不適用 |
| **F4** | 第 2 屆國賽階梯 | `balance-sim.mjs:618`（**已修**，傳 seasonIndex） | `careerStore.js:165` | 已修復 | 已結案 | — | 一行（已做） |
| **F5** | 賽制 bo1 vs 分級 | `balance-sim.mjs:193`（預設 1） | `matchConfig.js:117-118` → `schedule.js:85-91` | 需 `VD_MULTISET=1` 才對齊 | 逐屆相反（1 升 3 降） | 三屆奪冠 8/20/36 → 2/11/47 | 一行 |
| **F6** | 無屆間訓練營 | `balance-sim.mjs:611-638` | `careerScreen.js:1719` → `growth.js:100`（stamina +2／上限 80） | 治具未鏡像 | 難度下降 | 未量（體力關時≈0） | 一行 |
| **G1** | **止步後照打完國賽** | `balance-sim.mjs:474-601`（`for mi 0..5` 無條件跑滿） | `careerState.js:60-66` `nextMatch`（eliminated ⇒ null） | 治具每屆恆打 6 場；production 八強落敗＝該屆只打 4 場 | **難度上升（逐屆放大）** | 未量（見下方曝險） | 低（迴圈加一個 break），但會作廢所有既有基準 |
| **G2** | **體力／氣勢／板凳／對手暫停全關** | `balance-sim.mjs:54-59,210-221,278-286`（預設 false，要 `VD_STAMINA`/`VD_MOMENTUM`） | `matchConfig.js:112-114,123,130`（生涯場恆開）＋`matchLoop.js:1456-1478`（對手暫停＋教練 boost＋疲勞換人，每場死球窗恆跑） | 難度重校卷**至今沒有一支臂帶過這兩個開關** | 第 1 屆**量不到淨效應**（見實測；跨屆未量） | **實測（配對 n=60，附錄 A）：Δ奪冠 +1.7±2.9pp、Δ決賽 +0.0±3.4pp；七桶只有 Δgroup-2 −10.0±4.6pp 超過 2 SE** | 低 |
| **G3** | **預設身高 188 vs 主錨 175** | `balance-sim.mjs:62,402-404` → `careerState.js:179`（預設 188） | `careerScreen.js:1502` `heightInput.value='175'`；`docs/phase4-w2-status.md:59-63`「主錨 175」 | 全部難度數字都在 188cm 上量的 | **難度上升** | 已量（`phase4-w2-status.md` §4，n=150／bo1／W7 全關）：175＝決賽帶 23%／奪冠 7%；188（n=50）＝決賽帶 30% | 一行 |
| **G4** | **招募入隊漏傳 seasonIndex** | `balance-sim.mjs:340`（4 參數） | `recruitment.js:376`（5 參數，含 seasonIndex） | 招募生年級恆＝來源隊基準（`recruitment.js:321`）⇒ 成長率永遠停在快檔（`roster.js:19`）；`joinedSeason` 恆 1；成長型 ace 入隊身高取第 1 屆值（`recruitment.js:315-318`） | **難度上升** | 未量（現被 F2 遮蔽） | 一行（同 F4 型） |
| **G5** | **可招募已畢業的人** | `balance-sim.mjs:336-338`（只查 recruited／conditionMet／openSlots） | `recruitment.js:369` `recruitTargetGone` | 詹子曜（曜石，grade 3）第 1 屆末畢業、劉振鎧（鐵霧，grade 2）第 2 屆末畢業——治具第 2/3 屆照樣招得到 | **難度上升** | 未量（現被 F2 遮蔽） | 一行 |
| **G6** | 無等候名單／來投保底／~~逐出~~ | `balance-sim.mjs:372-417,419-489`（**等候名單＋來投已修**；逐出仍未建模） | `recruitment.js:370-386`（waitlist）、`careerStore.js:178-206`、`graduation.js:322-332`（來投保底） | production 屆末「零招募入隊」必補一名來投者（屬性以隊伍平均為底線） | 混合（來投讓 prod 變強／畢業讓 prod 變弱） | **實測（n=100、200 個屆界）：來投保底觸發 81 次＝40.5% 的屆界；等候名單遞補 0 人次**（名冊終量 9.2/12＝從未滿編 ⇒ 這條分支在現行招募率下不咬合，production 同理） | 已做（逐出除外） |
| **G7** | **玩家身高三屆不長** | `balance-sim.mjs:611-638`（無 revealHeightForSeason） | `careerStore.js:227` → `heightGrowth.js:73-96` | 175 起點走 mid 帶（3–8cm 總長）、188 起點走 tall 帶（1–4cm） | **難度下降** | 未量；身高敏感度已知（`phase4-w2-status.md` §4：175→195 決賽帶 23%→37%） | 一行 |
| **G8** | 玩家 trust 恆 40 | 全檔無事件系統；`careerState.js:188` 初值 40 | `careerScreen.js:1351` `updateTrust`；`events.js:29-51`（first-win +3／first-loss +2／hot-hand +4） | production 玩家持久信任最高到 49＝球權更多 | 難度下降 | 未量 | 中 |
| **G9** | 不傳 trustDynInit | `balance-sim.mjs:194-222`（createGame 選項無此鍵） | `matchConfig.js:132` ＋ `careerState.js:582-586`（舊隊情結 +8） | 招募生對原隊場內 trust +8；因 F2 幾乎不生效 | 難度下降（極小） | 未量 | 一行 |
| **G10** | 玩家暫停／教練選項未建模 | 基準臂完全不喊；MANAGE 臂只 `applyTimeout`（`balance-sim.mjs:300`），**沒有 boost** | `matchLoop.js:536-540`（玩家選 calm/fire → `applyTimeoutBoost`） | 對手有 boost、玩家沒有＝不對稱 | 難度下降 | 未量 | 低（但要先定「玩家會不會喊」的模型） |
| **G11** | lineup 每場現算、trust 恆 20 | `balance-sim.mjs:622-627,408-412,460-473,491-514`（**已修**，同 `VD_FAITHFUL`／`VD_TURNOVER`） | `careerStore.js:210-223`（新生 10／招募 10 顯式寫入）、`matchCareer.js:117-138`（換人信任 ±） | 治具新血 trust 20（應為 10）、無換人信任演化 | 混合（現況≈0，被 F2 遮蔽） | **實測 Δ第 1 屆＝逐值全等 0/100**——招募生從不先發（F2）又不進板凳（基準臂不傳 benches），trust 值根本沒有被讀到的路徑 ⇒ 本項在現行臂上恆為 0，要等 F2／板凳臂才會咬合 | 已做 |
| **G12** | 不傳 invitedId | `balance-sim.mjs:618` | `careerScreen.js:1712-1713` `showInvitePicker` → `schedule.js:52-58` | 治具＝玩家永遠不指定邀請；真人會指定（招募目標隊／弱隊） | 難度下降 | 未量 | 低（加一支 `VD_INVITE` 臂） |
| **G13** | 不解鎖 callPlay | `balance-sim.mjs:158-164`（TEACH 表無 callPlay） | `events.js:74-84`（第 2 屆 group-1 賽前傳授） | 叫戰術是玩家手動指令（`matchConfig.js resolveTechGates.canCallPlay`），AI 代打本來就不叫 ⇒ 現況零影響 | 難度下降（現況≈0） | — | 低 |
| **G14** | 玩家手動操作全未建模 | 檔頭 `balance-sim.mjs:3-5` 已聲明 | `matchLoop.js` 全鏈 | 讀攔網／假動作熟練度（feintUses）／魚躍指令／帶位接管／指定攻擊區／賽中換人 | 難度下降 | 未量（設計上刻意） | 不修（是治具的定義） |

---

## 逐項檢查：查訖**無差異**的項目（也要有結論）

| 項目 | 結論 | 依據 |
|---|---|---|
| 小組賽輪抽（含保底債、prevGroupIds） | ✅ 一致 | 治具走 `advanceSeason` → `buildSchedule`（`careerState.js:109-116`），與 production 同一條 |
| 國賽階梯（宿敵保底、第 2 屆天鷹掛準決） | ✅ 一致（F4 修完） | `balance-sim.mjs:618` ↔ `careerStore.js:165` |
| `TITLE_LEVEL_BONUS` 衛冕加成 | ✅ 一致 | 兩邊都走 `careerState.js:487-489` |
| 對手 ace 畢業遞補／成長型 ace | ✅ 一致 | 治具傳 `season` 給 `careerMatchSetup`（`balance-sim.mjs:482-484`）⇒ `applySeasonRoster` |
| 挖角除名 `applyPoaching` | ✅ 路徑一致 | 但 `roster.alumni` 那一半被 F1 阻斷（治具無校友） |
| 情蒐跨場／跨屆累積 | ✅ 一致 | `balance-sim.mjs:597` `mergeScouting` ↔ `matchCareer.js:70-72` |
| 組合攻擊屆數閘 `comboScale` | ✅ 一致 | `balance-sim.mjs:207` 遞 `setup.comboScale` ↔ `matchConfig.js:127` |
| `scoutRead`（對手讀我） | ✅ 一致 | 同由 `careerMatchSetup` 產出 |
| 隊友技能鏡像（dive／跳發／飄浮綁玩家解鎖） | ✅ 一致 | `careerState.js:594-598` 供給 aiProfiles，兩邊同一份 |
| 局分 25／deuce | ✅ 等值 | 治具不傳 setTarget ⇒ `match.js:7` `SET_TARGET=25`；production 顯式 25 |
| 局間恢復 `RECOV_SET_BREAK` | ✅ 一致（治具僅提供 patch 臂） | `balance-sim.mjs:85` |
| 隊友表現成長冪等鍵含屆數 | ✅ 一致 | `balance-sim.mjs:583` 傳 season ↔ `matchCareer.js:95-98` |
| 技術傳授時程（tip/dive/pipe/feint/floatServe） | ✅ 一致 | `balance-sim.mjs:158-163` ↔ `events.js:57-146`（group-1/2/3、qf 皆必打） |
| 技術傳授 **jumpServe** | ❌ 見 G1 | production 需「實際打到決賽且對手＝天鷹」（`events.js:148-153`），治具在 `mi===5` 無條件教（`balance-sim.mjs:475`） |
| 成長點灑法 | ⚠ 設計選擇（非 bug） | 治具平均灑（`balance-sim.mjs:313-329`），真人會集中灑＝治具是保守下緣 |
| 轉位事件／導師／宿敵三幕／小白支線 | ✅ 純敘事，不進 sim | `positionEvents.js`／`mentor.js`／`rivalArc.js`／`n2Arc.js` 查訖無數值效果 |
| 情蒐錄影帶 `buildScoutTape` | ✅ 不影響正賽 | 另建 game、決定論獨立 |

---

## ★ 會系統性偏移難度曲線的是哪幾項 ★

**這幾項是難度重校卷的產出所在——它們不是常數偏移，是逐屆放大的偏移：**

1. **G1（止步後照打）**——偏移量逐屆複利。第 1 屆本輪實測 qf 勝率 60%
   ⇒ 約 40% 的生涯在 production 每屆少打兩場（少 4–8 成長點、少兩場隊友成長、
   少兩場情蒐與招募進度）；到第 3 屆時治具的玩家隊已經比 production 多打了最多 4 場。
   **且 42% 的生涯（未進決賽者）在 production 學不到跳發，治具 100% 都學到。**
2. **F1（無畢業換血）**——同樣逐屆複利，且與 G1 同號（都讓治具的玩家隊偏強）。
   **2026-08-04 已修並實測**（附錄 C）：偏移確實幾乎全落在第 3 屆
   （Δ決賽帶 −17.0pp ± 6.8、Δ國賽勝場 −0.370 ± 0.139），第 2 屆只有 group-1 一桶超過 2 SE
   ——與「逐屆複利」的預期一致（第 1 屆末畢業大山/阿烈，第 2 屆末再畢業一批）。
3. **F5（賽制）**——已修（開關存在），但**偏誤方向逐屆相反**，所以它不是可以「事後折算」的常數。
4. **G2（W7 三系統全關）**——**第 1 屆量不到淨效應**（Δ奪冠 +1.7±2.9pp＝0.6 SE），
   七桶裡只有 Δgroup-2（白浪）−10.0±4.6pp 超過 2 SE、且逐條只有 8/60 有變。
   體力診斷同時顯示這一屆的體力**幾乎沒咬合**（B 隊終場最低 0.35、全 360 場只換人 1 人次）
   ⇒ 它列在「系統性偏移」是因為**跨屆未量**：第 2/3 屆有 bo5 打滿與更長的 rally，
   體力才會真的進場（本輪 bo5 打滿 16 場，第 5 局開局帶已掉到 0.739）。
5. **G7（玩家身高三屆不長）**——**唯一一項逐屆放大且方向相反的漏項**：production 的玩家
   每屆長高、治具永遠停在起點。修 G1/F1 而不補 G7 ＝ 會把難度過度上調。

**G3（身高 188 vs 175）不逐屆放大，但它是常數項裡最大的一個**——所有既有難度數字
都在「明顯優勢」的身高上量的，而驗收錨（W8 帶：決賽帶 20%／奪冠 5-7%）是在 175 上定的。

---

## 動 level 旋鈕之前必須先修掉的

按「不修就會把旋鈕調到錯的位置」排序：

1. **G3 身高預設**（一行；不修＝所有臂都在 188 上量，對不上驗收錨）
2. **F5 賽制**（已有開關，鐵則已立：每支臂都要帶 `VD_MULTISET=1`）
3. **G1 止步後照打**（一行 break；不修＝二三屆的成長曲線陡度是假的，
   而「二三屆太陡」正是這一卷要修的病灶）
4. ~~**F1 畢業換血 ＋ G4/G5/G6/G11**（同一包；不修＝(b)(c) 兩條歸因線與真實遊戲脫鉤）~~
   **✅ 2026-08-04 全數修畢**（G4/G5 無條件修；F1/G6/G11 掛 `VD_FAITHFUL`／`VD_TURNOVER`）。
   剩餘未接：**逐出**——production 的逐出是玩家手動決定（`canExpel` 只被 UI 閘門呼叫，
   沒有自動政策），與 G14 同類，治具沒有玩家意圖模型可鏡像，維持不建模。
5. **G2 W7 三系統**（決定要「基準臂鏡像 production」還是「難度臂固定帶三開關」；
   兩種都行，但要**先決定再跑**，否則新舊基準又會混在一起）

⚠ **修 G1/G3/F1 都會讓既有基準失去可比性**（同 F5 的處境）。建議一次修完再重建一份新基準，
不要分批修——分批修會出現「三套互不可比的數字」。

---

## 還有幾項未量的風險

**完全未量共 9 項**（2026-08-04 更新：F1／G6／G11 已修並實測，見附錄 C）：
F6、G1、G4、G5、G7、G8、G9、G10、G12。
（已量：F5＝三屆奪冠 8/20/36→2/11/47；G2＝第 1 屆配對 Δ，見附錄 A；
G3＝`phase4-w2-status.md` §4 的 175/188 對照；F2＝attribution §二 的 Δ招募＝0；
F1／G6／G11＝附錄 C 的配對 Δ。）
其中風險最高的三項：

- **G1**：完全未量，且是本盤點裡影響最大的一項。要量必須改治具（本輪硬約束禁止），
  或另寫一支帶 `break` 的對照臂。
- **G7（身高不長）**：唯一一項**明確反向**且量級可能不小的漏項——它會抵銷掉一部分
  G1/F1 的低估。在修 G1/F1 的同時沒補 G7，會過度校正。
- **G2 的跨屆行為**：本輪只在第 1 屆量過（附錄）。第 2/3 屆玩家轉強後，
  體力／氣勢對「強方」的效果可能翻號，需在 `VD_SEASONS=3` 上重量。

**治具目前的難度數字，可信度如何：**
**單屆的相對比較（同一支臂前後配對）仍然可信**——配對同種子把這些系統性偏移都消掉了，
所以「level +1 值多少勝率」這類 Δ 量測不受本盤點影響。
**但絕對值不可信，跨屆曲線的陡度更不可信**：G1＋F1＋G4＋G5 同號地讓治具的玩家隊
逐屆偏強，G3 讓起點偏強，只有 G7 反向。
⇒ **拿現行絕對值去對驗收錨（錨 1／錨 3a／錨 3b）並據以調 level，會把旋鈕調到錯的位置。**

---

## 附錄 A：G2 實測（本輪唯一新跑的量測）

配對同種子，RUNS=60、第 1 屆、`VD_MULTISET=1`（真實賽制）：

- 基準臂：`VD_MULTISET=1 VD_PAIRED=<file> node tools/balance-sim.mjs 60`
- 對照臂：`VD_MULTISET=1 VD_STAMINA=1 VD_MOMENTUM=1 VD_PAIRED=<file> node tools/balance-sim.mjs 60`
  （＝把 production 恆開的體力／氣勢／對手板凳／對手 AI 暫停＋教練 boost＋疲勞換人打開）

```
基準臂（W7 全關，＝難度重校卷至今所有數字的設定）
group-1 75%  group-2 82%  group-3 85%  qf 60%  sf 97%  final 3%
決賽帶 58%   奪冠率 2%

對照臂（W7 三系統開＝production 生涯場的真實設定）
group-1 77%  group-2 72%  group-3 90%  qf 57%  sf 97%  final 3%
決賽帶 55%   奪冠率 3%
體力診斷：A 隊終場場上均值 0.81、單場最低 0.05、場均換人 0.00 人次
對手換人樣本：全 360 場共 1 人次、有換人場數 1（0%）
體力診斷（B 隊）：終場場上均值 0.83、單場最低 0.35、終場有人 <25% 的場數 0/360
體力曲線（局開局帶）：第1局 1.000(n=120)　第2局 0.948(n=120)　第3局 0.892(n=71)
                      第4局 0.846(n=20)　第5局 0.739(n=5)；打滿場數 16
```

配對 Δ（逐 seed 相減；配對成功 60/60）：

```
Δgroup-1               +1.7pp ± 3.8　（逐條有變的 5/60）
Δgroup-2              -10.0pp ± 4.6　（逐條有變的 8/60）
Δgroup-3               +5.0pp ± 2.8　（逐條有變的 3/60）
Δnational-qf           -3.3pp ± 5.3　（逐條有變的 10/60）
Δnational-sf           +0.0pp ± 2.4　（逐條有變的 2/60）
Δnational-final        +0.0pp ± 3.4　（逐條有變的 4/60）
**Δ奪冠率              +1.7pp ± 2.9**　（逐條有變的 3/60）
```

**怎麼讀這組數**：七桶裡只有 Δgroup-2 超過 2 SE（−10.0/4.6＝2.2 SE），其餘全在雜訊帶內；
奪冠率 Δ 只有 0.6 SE。**這不代表 G2 無害**——它代表「在第 1 屆、n=60、真實賽制下，
W7 三系統的淨效應小於本樣本的解析力」。體力診斷解釋了為什麼：這一屆體力根本沒咬合
（B 隊終場最低 0.35＝連喘氣帶都沒進、全 360 場只換了 1 人次）。
**跨屆（VD_SEASONS=3）尚未量**——第 2/3 屆 bo5 打滿變多時體力才會真的進場。

## 附錄 B：本盤點的取證方式

- 全部差異均以**逐檔對讀**取得（治具全檔 820 行；production 側
  `careerStore.js`／`careerState.js`／`graduation.js`／`roster.js`／`recruitment.js`／
  `growth.js`／`lineup.js`／`heightGrowth.js`／`schedule.js`／`aceGrowth.js`／
  `events.js`／`matchConfig.js`／`matchCareer.js`／`matchLoop.js`／`careerScreen.js`），
  非抽樣。
- 引用的既有數字全部標明出處檔名（`difficulty-recal-attribution.md`／
  `difficulty-recal-opening-rulings.md`／`phase4-w2-status.md`）。
- 附錄 A 是本輪實跑，指令原文與輸出如上；**沒有任何估算數字**，未量者一律標「未量」。

---

## 附錄 C：F1／G6／G11 修復與實測（2026-08-04）

**改了什麼**（全部在 `tools/balance-sim.mjs`，`src/` 一格未動）：

| 位置 | 內容 |
|---|---|
| `:103-120` | `TURNOVER` 開關（`VD_FAITHFUL=1` 含之；`VD_TURNOVER=1` 可單開） |
| `:419-489` | `applyTurnoverMirror`＝`careerStore.advanceSeason` RMW 的無 store 版：`pendingWaiting` → `applySeasonTurnover`（畢業→等候遞補→來投保底→年級+1→新生）→ lineup 重排（trust 跟人）→ recruitment 收尾。**兩顆種子分開**：新生／來投吃 advanceSeason **之後**的 seed（`careerStore.js:186` next.seed）、等候遞補者吃**之前**的 seed（`careerStore.js:195` prev.season.seed） |
| `:372-417` | `settleJoinsMirror` 補等候名單（滿編＝`mergeWaiting`）＋招募生入隊顯式 `trust=10`；`recruitTargetGone` 移到 `openSlots` 之前（照 `recruitment.js:368-373` 的序） |
| `:491-514` | `applySubTrustMirror`＝`matchCareer.js:117-138` 換人信任演化（換下 −1／換上有建功 +2） |
| `:622-627` | lineup 由「每場現算」改為持有一份（production 的 lineup 是存檔狀態） |
| `:812-838`／`:973-981` | 屆界呼叫點＋換血量測輸出 |

**驗證**（指令原文與輸出）：

1. `npm test` → **1012 pass / 0 fail**；`node tools/sim-hash-probe.mjs` → 合計
   **`992e95c19fdb2cab`＝基準**（治具改動不得動到 sim，逐值不變）
2. **不帶開關逐值不變**：`VD_SEASONS=3 node tools/balance-sim.mjs 100` 修前修後
   輸出**逐行相同**；再以 `VD_JSON` 落檔逐 run 逐屆比對（n=40×3 屆）
   `JSON.stringify` **完全相同＝true**
3. **換血確實發生（真實路徑）**：`VD_SEASONS=3 VD_FAITHFUL=1 VD_DUMP=1 node tools/balance-sim.mjs 1`
   ——`VD_DUMP` 印的是 `careerMatchSetup` 真的交給 sim 的那份 setup：

   ```
   修前  屆1..屆3 先發恆為 A1,A2,A3,A4,A5,A6（大山 A3／阿烈 A4 打滿三屆）
   修後  屆1 先發=A1,A2,A3,A4,A5,A6   名冊=7
         屆2 先發=A1,A2,A6,R1,A5,N1   名冊=7   ← A3/A4 第 1 屆末畢業，手寫新生 N1 頂上
         屆3 先發=A1,A2,N1,G2,A5,G1   名冊=8   ← R1（鐵霧 劉振鎧 grade 2）第 2 屆末畢業
         我方均屬性 屆2 65.6 → 屆3 61.7（換血讓隊伍變弱，不再逐屆單調變強）
   ```

4. **換血量測**（`VD_SEASONS=3 VD_FAITHFUL=1 node tools/balance-sim.mjs 100`）：

   ```
   屆界 200 次｜畢業 468 人次（2.34/屆）｜新生 328 人次（1.64/屆）
   等候名單遞補 0 人次（0.00/屆）｜來投保底觸發 81 次（40.5% 的屆界）
   名冊終量平均 9.9/12 → 9.2/12
   ```

   等候名單 0 人次＝名冊從未滿編（9.2/12）⇒ **這條分支在現行招募率下不咬合**，
   production 同理；來投保底則是常態（四成屆界）。

**配對同種子 Δ（n=100，`VD_SEASONS=3 VD_FAITHFUL=1`，逐 run 逐屆相減；負＝難度上升）**：

```
第 1 屆  七桶全部 +0.0pp（逐條有變 0/100）  ← 自驗閘：屆界才動手，第 1 屆必須全等
第 2 屆  Δgroup-1 -11.0 ± 4.2（2.6 SE）  其餘六桶全在 2 SE 內
         Δ奪冠 +4.0 ± 2.8　Δ決賽帶 +4.0 ± 2.8　Δ國賽勝場 +0.010 ± 0.096
第 3 屆  Δgroup-3 -10.0 ± 4.6　Δnational-qf -17.0 ± 6.8　Δnational-sf -17.0 ± 6.8
         Δ奪冠 -3.0 ± 1.7　**Δ決賽帶 -17.0 ± 6.8（2.5 SE）**
         **Δ國賽勝場 -0.370 ± 0.139（2.7 SE）**
```

**怎麼讀**：方向＝**難度上升**（治具原本高估玩家隊），量級**集中在第 3 屆**——
第 2 屆只有 group-1 一桶超過 2 SE，第 3 屆則是決賽帶與國賽勝場兩個總量指標都超過 2.5 SE。
絕對值：第 3 屆決賽帶 61%→44%、國賽勝場 1.26→0.89/3。
**這正是「二三屆曲線太陡」的成因之一**：修完後三屆曲線由 32%／3%／61% 變成
32%／7%／44%，第 3 屆的翹尾被削掉一大截。

⚠ **本附錄的量測不含 G7**（玩家身高三屆不長，方向相反且逐屆放大）——修 G7 之後
第 2/3 屆會被推回去一些，**現在還不能拿這組數字直接去調 level**。
