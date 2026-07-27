# Phase 4.5A 結案快照 — 劇情輪（宿敵三幕＋小白支線＋小件包）

> 2026-07-27 結案。工單＝`docs/kickoffs/phase4_5A-prompt.md`（Claude.ai 規劃會議產出、
> Sawmah 逐題拍板，本輪已入庫可對照原文）。
> 基準 main@b4abc94（521 測綠）→ 結案 546 測綠（+25、只增不減）、vite build 綠。
> 憲法＝`phase4-decisions-RESOLVED.md` 全程沿用；4.5B 演出輪的輸入見 §6 演出需求清單。
>
> 人物速查（本檔代稱）：**莊敬嶺**＝宿敵（天鷹學園 ace「攀天者」，與玩家同屆，人設全文
> ＝`docs/phase4-w4-status.md` §7 案 B）；**小白＝紀慕白＝N2**（第 3 屆手寫 L 新生，
> 160cm，「不落地教」，人設＝`docs/phase4-w3-status.md` §7 案 B）；**小守＝魏守恆＝AL**
> （創隊班底自由人，第 1 屆一年級→第 3 屆三年級，全程在隊——名冊 id 即 AL）；
> **阿哲**＝二傳/第 2 屆起隊長（轉 S 路徑的導師，mentor.js 句庫的說話者）。

## 0. 交付總表

| # | 項目 | 狀態 | 落點 |
|---|------|------|------|
| 1 | 賽程硬保底（天鷹三屆掛點） | ✅ | `schedule.js nationalLadderFor` + `careerState/careerStore advanceSeason` |
| 2 | 宿敵三幕全台詞＋接線 | ✅ | `src/career/rivalArc.js`（新）＋ careerScreen 賽前/賽後/換季鏈 |
| 3 | 止步降級旁觀版（三幕鏈不斷） | ✅ | rivalArc `rivalSpectatorEvents`＋換季鏈/屆末鏈掛點 |
| 4 | 幕一/幕三鏡子牆分版、幕二共用 | ✅ | rivalArc（門檻見 §4 裁量 1） |
| 5 | 幕三條件句三版＋長高變體 | ✅ | rivalArc `confessionVariant`（轉L＞打法＞基底） |
| 6 | 小白 3 事件＋轉 L 差分 | ✅ | `src/career/n2Arc.js`（新）＋ matchCareer 掃描器 |
| 7 | 三人版轉位敘事（僅轉 L） | ✅ | `positionEvents.js acceptLinesFor('libero')` 小白具名版 |
| 8 | 王勝翔讓位心境句 | ✅ | `recruitment.js RECRUIT_DEFS['sky-hawk'].persona` |
| 9 | 馬振羽一句戲（大學章伏筆） | ✅ | rivalArc `MA_LINE`（幕三賽後勝敗版＋幕三旁觀版，生涯恰見一次） |
| 10 | 招募生具名送別（不落 generic） | ✅ | `careerFinale.js FINALE_FAREWELL_BY_RECRUIT`（13 recruitKey 全補） |
| 11 | 「讀反了」字卡（攔網讀線判斷錯誤時的場內結果字卡，matchLoop 既有） | 不動（拍板：結果真值類保留） | — |
| 12 | 阿哲擴句庫（mentor.js 導師賽後句庫加句） | 不做（拍板緩，待實玩體感） | — |

新測試檔：`tests/rival-schedule.test.mjs`（6）、`tests/rival-arc.test.mjs`（9）、
`tests/n2-arc.test.mjs`（7）、`tests/finale-farewell.test.mjs`（3）；
更新：`tests/position-events.test.mjs`（三人版斷言）、`tests/finale.test.mjs`（招募生具名斷言）。

## 1. 賽程硬保底（拍板 §1-1）

- 天鷹國賽掛點逐屆固定：**第 1 屆決賽**（故事模板現狀，首遇場即幕一）→ **第 2 屆準決賽**
  （`nationalLadderFor(2)`：sf=sky-hawk、final=obsidian）→ **第 3 屆決賽**（預設階梯現狀）。
- 保底＝生成約束（靜態依屆數組裝國賽階梯），小組輪抽不動；`buildSchedule`/`advanceSeason`
  增 `seasonIndex` 參數，省略＝既有行為（舊測試零遷移）；同種子同賽程重現性測試背書
  （sim 層＋store 層三屆快進兩輪逐值一致）。
- `matchFormatOf` 依 label 自動跟：幕二＝準決賽＝**bo3 關鍵戰**（拍板要求成立）、第 2 屆決賽曜石＝bo5。
- **配套修正**：`events.js teach-jump`（跳發傳授）原掛 `{matchId:'national-final'}` 且台詞指名
  天鷹——第 2 屆決賽改曜石後會錯棚，已加 `opponentId:'sky-hawk'` 守衛（跳發＝對天鷹的武器，
  只在天鷹決賽場傳授；第 1 屆未學者第 3 屆決賽補學）。
- **已知副作用（Sawmah 拍板「招募條件不動」的自然結果）**：王勝翔「決賽擊敗天鷹即可招」
  第 2 屆無達成窗（該屆決賽非天鷹）——僅第 1/3 屆決賽可達。如實記錄供裁定參考。

## 2. 宿敵三幕（rivalArc.js）

結構：三幕恆定；賽後分勝/敗；幕一/幕三分鏡子（你高）/牆（你矮）、幕二共用；
幕三賽後＝開場（鏡牆×勝敗）→條件句組→坦白核心（共用）→勝敗收束→長高變體（可選）→
馬振羽一句→阿哲收尾。版本矩陣只在拍板指定處展開，未全積展開。

- 事件 id：`rival-act{1,2,3}-{pre,post,watch}`——沿 `oldTeamPreEvents` 動態事件範式走
  `career.events` 去重（各幕綁定屆數＝天然一次性），接線走既有 `fireEvents`＋`dialogPlay`
  管線（憲法：不新建演出管線）。
- 賽前掛 `startMatch` 既有 pre 事件鏈收尾（對陣畫面確認出戰後、進場前）；賽後掛既有
  postEvs 管道（靜態小場先播、三幕大場收尾）。
- 簽名句落點：「爬不上來，是你不夠想」＝幕一賽後敗×牆版；「我也曾在牆的這一邊」＝
  幕三坦白核心（勝敗皆達）；敗版另一種重量＝「贏的是我。先低頭的——也是我。」
- 幕一賽後勝版（爆冷）＝人設試金石：輸不歸因對手、歸因「我還不夠想」（教義自洽）。
- 幕二「逼到牆邊」張力寫死在事件裡（加練一年/贏了仍想不通那顆球），不依比分。
- 止步旁觀版（watch）：播報＋阿哲場邊視角短版，幕三旁觀含馬振羽句與「把名字帶去大學」
  （大學章伏筆雙押）；奪冠/實戰過天鷹＝不掛（賽後版已播）。

## 3. 小白支線（n2Arc.js）

- **事件一・入學宣言**：第 3 屆換季鏈新生見面後插播；與宿敵對位（把一件事信成全部）由
  阿哲收尾句暗押不明說；玩家已轉 L＝前輩自由人追加兩句（師徒線開端）。
- **事件二・該放的球**：真實數據決定論觸發——`matchCareer.settleCareerMatch` 賽末掃描
  `scanChaseLost`（場上自由人 TOUCH kind:'dive' 後該 rally 對方得分＝1 次；零新 sim
  事件型別，招募壯舉同範式），記入 `result.stats.lbChase/lbWho`；觸發純由 results 推導
  ＝重放安全、逐屆自然歸零。三版：上場版（小白任 L 累積 ≥N）／師徒版（玩家=L，數據源
  ＝玩家自己的撲球——「該放的球」與 L 改判互為表裡）／場邊保底版（見 §4 裁量 4）。
- **事件三・承認**：屆末（第 3 屆生涯結算按鈕前插播）；信仰升級為選擇權非放棄；
  轉 L＝「地板，交給我」師徒版收束、未轉＝「下半句」版；與生涯結算送別句（N2 手寫
  「你的球，還在飛」）同場合不同節拍、無矛盾。
- **三人版轉位敘事**：`acceptLinesFor('libero')` 小白在隊＝小守讓位＋小白具名入教三句
  （「三個自由人的隊」）；僅轉 L 路徑觸發（轉位事件本身即該路徑）。

## 4. 裁量點如實記錄（工單 §5 要求）

1. **鏡子/牆身高門檻＝183cm**（`MIRROR_HEIGHT_CM`）：取 `heightAdvice ADVICE_BANDS`
   183-192 帶下緣（該帶＝攻擊手首選＝「天生就有」語意）；莊敬嶺本人 188。逐幕以當屆現值
   判定——三年長高跨帶＝幕一牆/幕三鏡子屬合法敘事（他看著你長高）。預設創角 188＝鏡子、
   平衡主錨 175＝牆，兩線皆自然可達。
2. **打法版門檻**：對天鷹情蒐 `spikes ≥ 12` 且 `(feints + zones.tip) / spikes ≥ 0.35`
   （`STYLE_MIN_SPIKES`/`STYLE_DECEPTION_SHARE`）。資料源＝`career.scouting['sky-hawk']`
   ＝**他親眼看過的你**（跨屆累積）——判定與敘事同源；樣本下限沿情蒐「<6 球不讀」精神加倍。
3. **長高變體門檻＝三年累計 ≥ 8cm**（`GROW_TALL_CM`，current−plan[0]）：165-175 帶成長
   幅度帶上緣＝「肉眼可見地長」；僅附加一句、不作主判定（拍板原文）。
4. **小白事件二 n＝3**（`N2_CHASE_N`）：單場自由人魚躍後失分約 1-3 次，3＝約 1-2 場累積，
   小組賽內可自然觸發。**場邊保底版**：小組 3 場打完且小白未任一場任 L（`lbWho` 無 N2
   記錄）＝改觸發場邊版（他數落地的球）——因小守（AL）三年級仍在隊、預設 lineup 的 L 是
   小守，小白上場與否取決於玩家排陣；保底確保三事件鏈不因排陣選擇而斷，「整個小組賽未
   上場」本身即決定論事實。玩家=L 路徑無保底（L 撲球頻繁，師徒版數據自然達標）。
5. **「曾交手」判定＝`career.scouting['sky-hawk']` 存在**（任何實戰場末必寫情蒐、跨屆
   持久）——幕二賽前分「交手版/首遇版」、幕三賽前分「對峙版（鏡/牆）/首遇版」用此判定，
   防「他提起沒發生過的交手」的事實錯誤（這是事實守衛、非新增分版軸）。
6. **幕三賽前首遇版不分鏡/牆**（從未交手＝幕一幕二皆旁觀的稀有路徑）：矩陣紀律——分版軸
   只在拍板指定處展開；鏡/牆語彙由幕三賽後（照常分版）承擔。
7. **旁觀短版單一版本**（不分鏡牆/勝敗/條件句）：同上矩陣紀律；幕三旁觀無坦白——坦白需要
   你站在網子對面才成立，止步者看到的是「三年沒人爬上那道牆」的冷結尾（戲劇上自洽）。
8. **事件一無 events 入帳**：掛在換季鏈 seqs（advanceSeason 單次不可重入）＝結構性不重播；
   既有存檔已在第 3 屆者不會補看（僅新進第 3 屆的生涯經歷）。
9. **馬振羽句掛幕三**（賽後勝/敗版＋旁觀版三處同句）：每條生涯路徑恰好經過其一＝
   「僅一句」語意成立（生涯內恰見一次）。
10. **招募生送別 13 句全補**（拍板寫「七名招募目標」）：-2 第二人槽（小磐/阿霜/大隼/
    阿汐/大柏＋原有 6 主槽外的 gale-shore-2）同樣可入隊，若只補 7 句則 -2 招募生仍落
    generic、違反「招募生不得再吃 generic」——取完備解，13 recruitKey 各一句。
    查表鍵＝`m.recruitKey ?? m.origin`（舊存檔無 recruitKey 者以 origin=隊 id 命中主槽句）。

## 5. 驗收清單逐條（工單 §6）

1. ✅ `npm test`＝**546 pass / 0 fail**（基準 521＋25、只增不減）；`vite build` 綠。
2. ✅ 三屆快進掛點：sim 層（`rival-schedule` advanceSeason 帶屆數）＋store 層
   （careerStore 傳 seasonIndex、兩輪 `deepEqual` 逐值一致）測試背書。
3. ✅ 止步情境：`rival-arc` 旁觀版觸發/不觸發矩陣測試＋**瀏覽器實跑**（注入「第 1 屆
   八強止步」存檔→捲土重來→幕一旁觀四句依序播出→正確接回畢業儀式鏈，console 0 錯誤）。
4. ✅ 勝/敗兩版、鏡子/牆分流、幕三條件句三版（轉 L/打法/基底）＋長高變體各自可達
   （`rival-arc` 構造情境測試）。
5. ✅ 小白 3 事件：事件一（含轉 L 追加）、事件二三版決定論觸發（含掃描器單元測試）、
   事件三差分＋去重（`n2-arc` 7 測試）。
6. ✅ 送別具名：13 recruitKey 不落 generic＋舊存檔 origin 回退＋補位員仍 generic
   （`finale-farewell` 3 測試＋`finale.test` 更新）。
7. ✅ 演出需求清單＝本檔 §6（4.5B 輸入）。
8. ✅ 本快照＋commit＋deploy:pages。

測試表更新兩處皆屬規格變更非遷就：`position-events`（L 讓位對話＝拍板改寫為三人版）、
`finale.test`（「招募生落 generic」＝本輪明令移除的舊行為）。

## 6. 演出需求清單（4.5B 演出輪輸入；本輪只立骨——全部以既有 dialogPlay/字卡/鏡位交付）

**幕一・碾壓（第 1 屆決賽）**
- 賽前首遇：莊敬嶺「量人」的鏡頭語言——對陣畫面或賽前鏡位給一個他隔網俯視/平視的注視 beat（牆版俯視、鏡子版平視）。
- 賽後：他轉身離場不回頭的走位；大山/阿哲的收尾句配隊伍剪影。

**幕二・被逼到牆邊（第 2 屆準決賽）**
- 賽前：bo3 關鍵戰開場的重量感（燈光壓暗半檔/觀眾聲浪先靜後起）。
- 賽後勝版：「牆只是——」斷句處＝**他第一次擦汗/第一次沒把話說完**的演出點（工單例示的
  「幕二他第一次擦汗」即此 beat）；敗版：他握拳盯著手心的靜止一拍。

**幕三・坦白（第 3 屆決賽）**
- 賽前：三年對峙的對稱構圖（兩人隔網同高度鏡位——鏡子版）或仰角（牆版）。
- 坦白段燈光語言：場館燈漸暗、只留兩人所在的光帶（工單例示「幕三坦白的燈光語言」）；
  「國中三年，一百五十幾公分」句可配一個他縮小/回望的剪影 beat。
- 馬振羽句：隊伍末端的邊光單人 beat（不搶主場景）。
- 長高變體句：可回接身高儀式的刻度視覺（比對三年前的尺）。

**止步旁觀版（三幕通用）**
- 看台視角鏡位（玩家在觀眾席、球場在下方遠景）＋頒獎台燈光；幕三旁觀「他依然沒有笑」
  ＝頒獎台定格特寫 beat。

**小白支線**
- 事件一：撲救出界球的慢動作＋膝蓋著地音效 beat（「膝蓋碰得到地。球不行」句上）。
- 事件二上場版：可回放他撲球失位的位置示意（本輪未做回放引擎——4.5B 末位項，勿依賴）。
- 事件三：更衣室/空體育館燈光（畢業前夕氛圍）；師徒版「異色球衣」交接可做一個球衣特寫 beat。

**三人版轉位**：三個自由人並排的隊形 beat（小守/玩家/小白）。

## 7. 檔案清單

- 新增：`src/career/rivalArc.js`、`src/career/n2Arc.js`、`tests/rival-schedule.test.mjs`、
  `tests/rival-arc.test.mjs`、`tests/n2-arc.test.mjs`、`tests/finale-farewell.test.mjs`
- 修改：`schedule.js`（nationalLadderFor/buildSchedule seasonIndex）、`careerState.js`
  （advanceSeason seasonIndex）、`careerStore.js`（傳下一屆屆數）、`events.js`（teach-jump
  對手守衛）、`positionEvents.js`（三人版）、`recruitment.js`（王勝翔 persona）、
  `careerFinale.js`（FINALE_FAREWELL_BY_RECRUIT）、`matchCareer.js`（掃描器接線）、
  `careerScreen.js`（賽前/賽後/換季鏈/屆末鏈四處接線）
- 測試更新：`position-events.test.mjs`、`finale.test.mjs`

## 8. 下一步（4.5B 演出輪）

Sawmah 試玩本輪（三幕＋小白＋送別）→ 回饋後帶本檔 §6 演出需求清單＋
`docs/phase4-w4-status.md` §14 演出債清單去 Claude.ai 生 4.5B 工單
（五位置招牌演出→儀式大作→huddle 3D 圍圈→回放引擎末位，範圍溢出先砍回放）。
