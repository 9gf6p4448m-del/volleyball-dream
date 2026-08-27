// Phase 2 stage 4 — 輕量劇情事件（決策第 9 題：資料驅動事件表，不硬寫 if）
// 賽前/賽後對話框＋隊友 trust 事件（文字、無立繪）；Phase 3 完整劇情在此表上長
// when 條件全宣告式；effect.trust 經 sim trust.js updateTrust 調整持久 baseline
import { nextMatch } from './careerState.js';
import { opponentById } from './opponents.js';
import { HEIGHT_HONESTY_THRESHOLD_CM } from './heightGrowth.js';
import { CALL_PLAY_ROLE_LINES } from './callPlayBrief.js';

// 命名工程定案（07-25）：speaker 具名——我方隊長＝大山（MB）、二傳＝阿哲；
// 各校角色對應 opponents.js squad 具名（王牌稱號偶爾入台詞，不逐句喊）
export const EVENT_DEFS = [
  {
    id: 'debut',
    moment: 'pre',
    when: { matchId: 'group-1' },
    lines: [
      { speaker: '大山', text: '新人，第一場別想太多——球來了就打，其他交給我們。' },
      { speaker: '阿哲', text: '舉給你的球，放心打。打丟了算我的。' },
    ],
  },
  {
    id: 'mb-warn',
    moment: 'pre',
    when: { opponentId: 'obsidian', stage: 'group' },
    lines: [
      { speaker: '大山', text: '曜石的詹子曜——人稱「黑曜箭」，又快又急。中路封起來之前，別跟他硬碰。' },
    ],
  },
  {
    id: 'first-win',
    moment: 'post',
    when: { wonLast: true, playedCount: 1 },
    effect: { trust: 3 },
    lines: [
      { speaker: '阿哲', text: '打得不錯嘛，新人。下一場，關鍵分也敢給你了。' },
    ],
  },
  {
    id: 'first-loss',
    moment: 'post',
    when: { wonLast: false, lossCount: 1 },
    effect: { trust: 2 },
    lines: [
      { speaker: '阿哲', text: '別背著。輸球是全隊的事——下一顆，我照樣給你。' },
    ],
  },
  {
    id: 'hot-hand',
    moment: 'post',
    when: { minKills: 5 },
    effect: { trust: 4 },
    lines: [
      { speaker: '阿哲', text: '你手感燙起來了。之後的球，會更常到你手上。' },
    ],
  },
  // ---- 大學卷批 7（2026-08-24）：大學章專屬傳授 ----
  // ★技術軸打平（卷宗 §三之三拍板 3）★ 兩條都只看「大學聯賽打完幾場」——
  // 不看學校 tier、不看戰績、不看誰教。選北陵（強豪）與選梅溪（弱校）解鎖場次相同
  // （B7-7）。強弱校的差異只在球權與戰績兩軸，那兩軸批 6 已經做完了。
  {
    id: 'teach-press',
    moment: 'post',
    when: { uniLeaguePlayed: 3 },
    effect: { unlock: 'pressBlock' },
    lines: [
      { speaker: '大四學長', text: '你的攔網……手是直的。高中那樣沒問題，但這裡的人扣得比你想的重——直著的手，只會被他打手出界。' },
      { speaker: '大四學長', text: '手要壓過去，蓋在球上面。擦到你手頂的球就不會往後彈了，會被你壓回他們場內。' },
      { speaker: '大四學長', text: '但有個條件。壓手得提早把手送過網，你沒空再看他要打哪邊了——想壓手，就得自己先押一邊：直線，還是斜線。' },
      { speaker: '大四學長', text: '還有，壓手是賭注——賭這球會擦到你手頂。賭對，球直接被你壓死在他們半場；沒賭到，擦到手側或正面碰上，反而比直著的手更吃虧。想清楚再壓。' },
    ],
  },
  {
    id: 'teach-chase',
    moment: 'post',
    when: { uniLeaguePlayed: 6 },
    effect: { unlock: 'chaseServe' },
    lines: [
      { speaker: '大四學長', text: '發球別再只想著發不發得進了。看對面後排那三個——總有一個接得比較差。' },
      { speaker: '大四學長', text: '發給他。下一球還發給他。發到他自己都不想站在那個位置為止。' },
      { speaker: '大四學長', text: '高中你練的是怎麼把球打好。大學開始，你要練的是——怎麼讓對面打不好。' },
    ],
  },
  // ---- 職業章批 4a（2026-08-26）：職業章專屬傳授 ----
  // 講者用職業聯賽的通用角色（球探分析師）而非具名隊友——職業隊名冊隨簽約隊伍變動
  // （proTeam.js squad 逐隊不同），寫死某隊友名字會在換一支球隊時對不上人。
  // 靈魂句收尾：「職業是我決定對手看到什麼」——情報戰主題定調。
  {
    id: 'teach-baitline',
    moment: 'post',
    // 提案值＝7（單循環打滿）：晚於既有 pro-batch3 覆審治具慣用的「6 勝＋第 7 場
    // 掛 pending」窗口（那些測試刻意在該窗口不放任何到期事件、以隔離另一條回歸），
    // 選這個數字單純是避開巧合撞期，不是機制上必須卡在賽季末——真人試玩後可調。
    when: { proLeaguePlayed: 7 },
    effect: { unlock: 'baitLine' },
    lines: [
      { speaker: '球探分析師', text: '職業聯賽每一隊都有情蒐——你打過的每一顆球，都在建你的檔案。' },
      { speaker: '球探分析師', text: '但檔案是雙面刃。你知道他們在看，就能決定給他們看見什麼——故意餵一條假的慣用線。' },
      { speaker: '球探分析師', text: '關鍵分，打回你真正想打的那條。他們押檔案上那條線——押錯的，是他們。' },
      { speaker: '球探分析師', text: '高中你把球打好，大學你讓對面打不好。到了這裡——你決定對手看到什麼。' },
    ],
  },
  // 職業章批 4b（改叫，2026-08-26）：批 4a 講情報戰，這一則講**地位**。
  // 講者用「隊長」（角色而非具名）——同 teach-baitline 的理由：職業隊名冊隨簽約隊伍
  // 變動，寫死某隊友名字在換隊時對不上人；隊長是每支球隊都有的位置。
  // 提案值＝7（單循環打滿，同 teach-baitline）：原想錯開成 4（球季過半），但實測
  // 撞上 tests/pro-batch3-wiring.test.mjs 既有治具（前 6 場全勝＋第 7 場棄賽的
  // 「覆審H修」窗口）——proLeaguePlayed>=4 在那份治具的第 4 場賽後就到期，跳出
  // 這則新對話，把該測試原本要驗的準決賽畫面洗掉（改前綠、改後紅，行為級回歸）。
  // teach-baitline 的 7 已經證明能避開那個窗口（那份治具最多打到 6 場），改叫比照
  // 同一個安全值——兩招會在同一場賽後一起到期（皆屬 post moment，UI 逐則播放，
  // 不是同時疊字），代價是不再錯開，真人試玩後兩者的值都可再各自調整。
  {
    id: 'teach-audible',
    moment: 'post',
    when: { proLeaguePlayed: 7 },
    effect: { unlock: 'audible' },
    lines: [
      { speaker: '隊長', text: '這裡不是學校球隊。教練不會因為你是新人放水，我們也不會因為你是新人幫你扛。' },
      { speaker: '隊長', text: '你在這支球隊待到現在，該有的地位你自己掙來了——網前你也能直接喊套路，不必等二傳點頭。' },
      { speaker: '隊長', text: '但喊了就是你的責任。喊對了，球照樣是你自己打進去的；喊錯了，這一分算你的——沒人替你扛。' },
    ],
  },
  // 職業章批 4c（二段時間差，2026-08-26）：批 4a 講情報戰、批 4b 講地位，這一則講
  // **身體**——職業層級的空中技術。講者用「總教練」（角色而非具名，同 4a/4b 理由：
  // 職業隊名冊隨簽約隊伍變動，寫死名字換隊就對不上人；總教練每支球隊都有）。
  // 門檻＝7（同 4a/4b）：proLeaguePlayed 只數本季 round==='pro' 的完賽場（單循環滿貫
  // 就是 7，門檻再高本季就永遠不到期），且 7 已被 4a/4b 證明避開 pro-batch3-wiring
  // 「覆審H修」治具的窗口（前 6 場完賽＋第 7 場棄賽裁決）。三招同場到期＝UI 逐則播放
  // 不疊字（4b 已接受兩則同場的先例），錯開值屬真人試玩後可調項。
  // ★文案不說謊（練習賽卷 08-12 事故的教訓；拍板丙後逐句重核）★：對話裡的操作
  //（再拖一次）、收益（球飛新線——牆的真實站位沒蓋到就攔不到、蓋到照樣被攔）、
  // 代價（球變慢弧變高／體力大耗／重度疲勞不可用／體力條公開）逐句對得上 sim
  // 實作（game.js executeTouch 換 aimPoint＋timeMul＋COST_SPIKE_TWIST／tryBlock
  // bandContact 純幾何結算），不承諾機制沒有的事——「騙已起跳」「晚跳免疫」等
  // 機率騙牆層語彙已隨該層刪除，不得復述。
  {
    id: 'teach-doublespike',
    moment: 'post',
    when: { proLeaguePlayed: 7 },
    effect: { unlock: 'doubleSpike' },
    lines: [
      { speaker: '總教練', text: '攔網手最怕的不是你力量大——是他把牆立好了，球卻根本不從他站的那條線上過。' },
      { speaker: '總教練', text: '起跳照舊；人還在空中的那一瞬，再拖一次、改打別條線。牆沒蓋到的空檔就是你的得分區——這叫二段時間差。' },
      { speaker: '總教練', text: '先把醜話講完：空中二次發力，球會變慢、弧會變高，體力燒得比誰都兇——腿一沉到重度疲勞，這招就使不出來，對面看你的體力條也知道。' },
      { speaker: '總教練', text: '還有，它不是魔法。你改打的那條線上要是有人站著，球照樣被攔——這招賭的是牆的空檔，不是攔網手的眼睛。' },
    ],
  },
  // ---- 技術傳授線（改版裁定：技術經故事習得，每場一招；輸贏都教——敗者也有收穫）----
  {
    id: 'teach-tip',
    moment: 'post',
    when: { lastMatchId: 'group-1' },
    effect: { unlock: 'tip' },
    lines: [
      { speaker: '北原工商・杜品澄', text: '你只會全力打直球啊，新人。力量不夠的時候——用腦子打。' },
      { speaker: '北原工商・杜品澄', text: '看好，手腕放軟、指尖推球。這叫吊球。拿去用吧。' },
    ],
  },
  // 組合攻擊卷 段 E（07-31 Sawmah 裁定）：叫戰術＝**教出來的**，不是屆數解鎖的。
  // 教的人＝阿哲（二傳）——他是手勢的收訊端，這條知識只有他有立場教；
  // MB 補一句「交叉＝我當幌子」＝把誘餌的角色從隊友嘴裡講出來（同 teach-dive 的傳承節拍）。
  // 2026-08-01 搬到第 2 屆後這句改由**阿岩**（A6，第 2 屆的中間；大山 A3 第 1 屆末已畢業）講，
  // 並加 elderId 年級守衛——阿岩若被逐出／不在現役名冊，改播阿哲代述的 altLines。
  // moment 'camp'＝屆間集訓（advanceSeason 之後、下屆開打之前）；集訓與 pre 傳授一樣
  // 不進 upcomingTeach 預告（那條只看 moment 'post'），不會與同場賽後的 teach-dive 打架。
  {
    id: 'teach-call',
    moment: 'camp',
    // ★★ 位置（2026-08-09 屆間養成卷 E5：指名債已償還）★★
    // 歷程：第 1 屆 group-2（c5419ce 暫置）→ 第 2 屆 group-1 賽前（08-01 裁定乙）
    //      → **第一次集訓**（08-09 附表 A 裁定甲：七項技術只搬「叫戰術」一項，其餘留原地）。
    // 為什麼是這裡：舊值＝第 2 屆第一場**賽前**，而第一次集訓（advanceSeason 後
    // seasonIndex=2）就在它的正上游一步 ⇒ 時序幾乎不動、覆蓋率同為 100%
    //（集訓是屆間鏈的必經節點，不看勝負、不看賽程），但敘事從「第二屆第一場賽前
    // 突然有人教你」變成「集訓時教你怎麼叫球」——第一年學基本功、第二年學配合。
    // `matchId` 因此拿掉：集訓不掛在任何一場比賽上，只掛屆數。
    // 一次性旗標（ONCE_EVENT_IDS）照舊 ⇒ 先前已學過的舊存檔不會在集訓重播。
    when: { seasonIndex: 2 },
    effect: { unlock: 'callPlay' },
    elderId: 'A6',
    lines: [
      { speaker: '阿哲', text: '去年那句「舉給你的球放心打」——那是對新人講的。你已經不是新人了，從今天起，你可以自己點。' },
      { speaker: '阿哲', text: '一傳起來、球還在飛的時候看我一眼——交叉、時間差、B快。這一球大家跑什麼，先講好。' },
      { speaker: '阿岩', text: '……交叉，我先跳。攔網會跟著我走，你從我背後穿出來。把我當幌子，不用客氣。' },
      { speaker: '阿哲', text: '但先說清楚——球權我分。我叫了誰，那個人自己決定跑不跑；不跑我就改給別人，沒人會怪你。' },
    ],
    altLines: [
      { speaker: '阿哲', text: '去年那句「舉給你的球放心打」——那是對新人講的。你已經不是新人了，從今天起，你可以自己點。' },
      { speaker: '阿哲', text: '一傳起來、球還在飛的時候看我一眼——交叉、時間差、B快。這一球大家跑什麼，先講好。' },
      { speaker: '阿哲', text: '交叉就是中間那個先跳、把攔網拐走，你從他背後穿出來——前排的中間是你的幌子，別客氣。' },
      { speaker: '阿哲', text: '但先說清楚——球權我分。我叫了誰，那個人自己決定跑不跑；不跑我就改給別人，沒人會怪你。' },
    ],
    // ★ 2026-08-06 試玩回饋（Sawmah 打 OPP 打到第 2 屆）★
    // 原話：「我第一屆換到 OPP，第二屆開了戰術，是不是整套都沒我的事？換位置看到的文字還一樣。」
    // 查證結果：①機制上 OPP **沒有**被排除（`delay` 的主攻線認 `right`，
    //   approach.js `COMBO_MAIN_KINDS`），但他**沒有專屬戰術線**（`cross` 只認 `left`、
    //   配合者恆為 `quick`＝MB） ②叫牌面板是 S 專屬（callPlay.js「非 S 一律空陣列」）
    //   ⇒ 非 S 三個位置在死球窗都無事可做，那是「S vs 非S」的二分，不是針對 OPP
    //   ③本事件四句台詞固定、完全不看 `currentRole`——這一條他說對了。
    // 本次只補**文案層**：讓每個位置聽到「這套東西對你是什麼」。機制層的位置分歧
    // 屬集訓卷（`docs/kickoffs/training-camp-discussion-brief.md` §二 已定案
    // 「加成內容：依位置不同」，尚未實作）。
    //
    // 形狀沿用既有分歧先例（`heightAdvice.js`／`positionEvents.js` 都依 currentRole 分文案），
    // 但**只追加一句**、不重寫四句 × 五位置：前四句是共同知識，追加句才是「你的部分」。
    // ★ 每一句都必須與碼一致（對玩家說謊比不說更糟）★
    //   OH ＝ `cross` 主攻只認 `left`／OPP ＝ 交叉走不到 `right`、`delay` 認 `right`，
    //   且要球窗「⚡跟上」是 OPP 專屬（matchLoop W4 題5）／MB ＝ 配合者恆為 `quick`
    //   ＋`bquick` 單人型是他的／L ＝ 一傳 tier 決定攻擊池（`perfect` 才有快攻，
    //   ai.js `attackPointsOf`）／S ＝ 唯一拿得到叫牌清單的人。
    //
    // ★★ 2026-08-07 覆審 HIGH-2：OH／OPP 兩句補上這道閘**實際解鎖的那顆鈕** ★★
    //   本事件的 `effect.unlock = 'callPlay'` 就是 `resolveTechGates.canCallPlay`
    //   （matchConfig.js:183），而 08-07 起它同時管三個入口：S 的分配面板、
    //   OH 的「↘ 內切」浮鈕、OPP 的「🤝 夾塞」浮鈕（matchLoop 的兩個窗管理區塊）。
    //   這是全遊戲**唯一**一次解釋「叫戰術對你這個位置是什麼」的時刻——不講的話，
    //   玩家第 2 屆換到 OPP 只會看到一顆沒人介紹過的紫色鈕。
    //   OPP 那句原文說「你的球是時間差…想要球就自己喊」＝寫在夾塞還關著的時代
    //   （`TANDEM_PLAY_RATE = 0`，08-06 才解封），現在他有專屬線了，那句已過期。
    // ★★ 2026-08-09：這五句搬到 `callPlayBrief.js`（**內容一字未改**）★★
    // 因為它多了第二個消費端——轉位接受對話的補課（`positionEvents.callPlayBriefFor`）：
    // 本事件是 once ＋掛在第一次集訓，播的是**當下**那個位置的句子，於是第 3 屆才轉任 OPP
    // 的玩家永遠聽不到夾塞那段，卻看得到那顆 🤝 鈕。文案只留一份，不在兩處各抄一遍。
    roleLines: CALL_PLAY_ROLE_LINES,
  },
  {
    id: 'teach-dive',
    moment: 'post',
    when: { lastMatchId: 'group-2' },
    effect: { unlock: 'dive' },
    lines: [
      { speaker: '白浪高中・蔡沐恩', text: '看到我們救了幾顆你們以為落地的球嗎？防守不是站著等球來。' },
      { speaker: '白浪高中・蔡沐恩', text: '撲出去。會痛，但球不會落地。這叫魚躍——送你了。' },
      // 主角傳承節點（拍板敘事：對手教主角→隊長請主角教全隊＝隊友 diveRate 解鎖的劇情面）
      // 07-27 拍板 B（自由人天生會魚躍）配套：小守不在「被教」之列——大山順勢點出
      // 他一直是隊上唯一會撲的人（戲份少的角色被看見）
      { speaker: '大山', text: '學到好東西了？回去教教大家——球不落地不結束，全隊都得會。小守那一套，總算有人能陪他練了。' },
    ],
  },
  {
    id: 'teach-pipe',
    moment: 'post',
    when: { lastMatchId: 'group-3' },
    effect: { unlock: 'pipe' },
    lines: [
      { speaker: '曜石體中・詹子曜', text: '你的進攻只有前排三公尺。我們的進攻，是整片場地。' },
      { speaker: '曜石體中・詹子曜', text: '後排起跳、攻擊線後起飛——pipe。學會它，你才算立體。' },
    ],
  },
  {
    id: 'teach-float',
    moment: 'post',
    when: { lastMatchId: 'national-qf' },
    effect: { unlock: 'floatServe' },
    lines: [
      { speaker: '鐵霧工業・劉振鎧', text: '光有力氣的發球，練十年也就那樣。最難接的球——是不轉的球。' },
      { speaker: '鐵霧工業・劉振鎧', text: '掌根擊球心、瞬間停腕。飄浮球會自己跳舞。' },
      // 主角傳承節點（同 teach-dive：隊友 floatServeRate 解鎖的劇情面）
      { speaker: '大山', text: '那手飄浮球——回去也教教大家。發球輪多幾種武器。' },
    ],
  },
  {
    // 拍板 2026-07-22：提前到小組第三場（原排準決賽賽後——scouting 讀取最兇的
    // 準決賽/決賽反而沒工具用，時序自相矛盾；提前後=曜石預告要讀你→假動作正是答案
    id: 'teach-feint',
    moment: 'post',
    when: { lastMatchId: 'group-3' },
    effect: { unlock: 'feint' },
    lines: [
      { speaker: '曜石體中・石宇廷', text: '你的每一球，我們都記下來了。再遇到的時候——你那些慣用線，一條都過不了。' },
      { speaker: '曜石體中・石宇廷', text: '會被讀的人，才需要學騙。眼睛看左、手打右——當作見面禮，拿去。' },
    ],
  },
  {
    id: 'teach-jump',
    moment: 'pre',
    // 4.5A 保底階梯配套：第 2 屆決賽＝曜石（天鷹移準決賽）——台詞指名天鷹，
    // 加對手守衛防「對著曜石喊天鷹」；跳發＝對天鷹的武器。
    //
    // ★ 2026-08-06 放寬（Sawmah 裁定甲）：`matchId: 'national-final'` → `stage: 'national'` ★
    // 觸發＝真人第 1 屆止步八強後問「這樣我連跳發都學不到吧」。查證屬實，而且比想像嚴重：
    //   ① 條件寫死「決賽 ∧ 天鷹」，但天鷹的位置**逐屆固定**——第 1／3 屆決賽、
    //      **第 2 屆準決賽**（`schedule.js nationalLadderFor`）⇒ 第 2 屆**結構上沒有窗口**，
    //      就算打進決賽（對手是曜石）也不教。
    //   ② 保真基線的決賽帶＝屆 1 **20%**／屆 3 **49%** ⇒ 粗估**約四成的生涯學不到跳發**，
    //      它是整條教學鏈唯一「打完全程仍可能拿不到」的一招（其餘都掛 `lastMatchId`＝
    //      賽後發、輸贏都給）。當初拍板時決賽帶這個數字還沒被量出來過。
    // 放寬後多了「第 2 屆準決賽對天鷹」這個窗口（進準決賽率約 51%）⇒ 覆蓋率約 60%→80%。
    // ★ 為什麼是 `stage: 'national'` 而不是「對上天鷹的任何一場」★
    //   天鷹在第 2／3 屆**會被抽進小組賽 group-3**（`drawGroupOpponents` 的保底債，
    //   卷二前置備忘實測）。不加 stage 守衛的話，跳發會在小組賽賽前就發出去——
    //   它是教學鏈的最後一招，掉到小組賽等於整條進程被抄捷徑。
    // ★ 2026-08-09 循環賽卷：這個守衛**行為零變化**，但理由要更新一筆 ★
    //   `stage:'national'` 現在也涵蓋八強循環組的三場——不過天鷹**抽不進循環組**
    //   （`drawRoundRobinOpponents` 排除當屆淘汰賽兩隊：同一支隊不可能既在你的循環組、
    //   又在另一半籤表等你）⇒ 實際觸發窗仍然只有「準決賽／決賽對天鷹」那一場，
    //   與 08-06 放寬時量的覆蓋率同一個口徑。**改的是進得到那一場的機率**（循環制下
    //   止步者多打 3 場、晉級判準從「贏鐵霧一場」變成「四隊取二」）。
    when: { stage: 'national', opponentId: 'sky-hawk' },
    effect: { unlock: 'jumpServe' },
    // W2(P4) 年級守衛（拍板①保底轉授）：大山（A3）已畢業＝播 altLines 轉授版
    // ——新隊長阿哲以「大山留下的東西」名義轉授，跳發照樣學到（effect 不變）
    elderId: 'A3',
    lines: [
      // 場合中性（2026-08-06 放寬到準決賽後）：不得再寫「決賽了」——第 2 屆這一場是準決賽
      { speaker: '大山', text: '天鷹。就是這一場——把我壓箱的東西給你：跳躍發球，我們隊史上只有兩個人發得動。' },
      { speaker: '大山', text: '助跑、拋球、當它是扣球打下去。天鷹統治天空的高度——去讓他們見識，遊隼統治天空的速度。' },
    ],
    altLines: [
      { speaker: '阿哲', text: '天鷹。就是這一場——大山學長畢業前，把他壓箱的東西留給了球隊：跳躍發球。他說，交給下一個敢打關鍵球的人。' },
      { speaker: '阿哲', text: '助跑、拋球、當它是扣球打下去。人不在，牆留下的東西還在——去讓天鷹見識，遊隼統治天空的速度。' },
    ],
  },
  {
    // ★ 2026-08-09 循環賽卷 ★ `national-qf` 現在是**八強循環組的第一場**（不是單淘汰的
    // 八強）——掛點刻意不動：這個 id 承載的語意一直是「進國賽的第一場」，改制後仍然是。
    // 台詞必須改：舊版寫「單淘汰——輸一場就收隊回家」，在新賽制下是**假情報**
    // （循環組輸球不止步，三場打滿看名次）。玩家會照這句話決定要不要冒險。
    id: 'nationals',
    moment: 'pre',
    when: { matchId: 'national-qf' },
    lines: [
      { speaker: '教練', text: '全國賽八強——四隊一組，單循環三場打好打滿，前兩名進準決賽。' },
      { speaker: '教練', text: '輸一場不會回家，但每一場都算進名次。放開打，別留手。' },
    ],
  },
  // 宿敵差分（stage 5）：小組賽對曜石的勝敗決定再遇的對話——scouting 記憶同步生效
  {
    id: 'rematch-won',
    moment: 'pre',
    when: { matchId: 'national-sf', wonVs: 'obsidian' },
    elderId: 'A3', // W2(P4) 年級守衛：大山已畢業＝阿哲以隊長身分接手宿敵情報
    lines: [
      { speaker: '大山', text: '曜石。小組賽輸給我們之後，他們把你的每一球都看了三遍。' },
      { speaker: '阿哲', text: '他們衝著你來的。慣用的線路會被讀死——換節奏，或者用騙的。' },
    ],
    altLines: [
      { speaker: '阿哲', text: '曜石。小組賽輸給我們之後，他們把你的每一球都看了三遍——這種執念，大山學長那屆就領教過。' },
      { speaker: '阿哲', text: '他們衝著你來的。慣用的線路會被讀死——換節奏，或者用騙的。' },
    ],
  },
  {
    id: 'rematch-lost',
    moment: 'pre',
    when: { matchId: 'national-sf', lostVs: 'obsidian' },
    elderId: 'A3',
    lines: [
      { speaker: '大山', text: '又是曜石。小組賽欠他們一場——今天當面討回來。' },
      { speaker: '阿哲', text: '他們記得你怎麼打的。上次的套路不會再通——拿出新的東西。' },
    ],
    altLines: [
      { speaker: '阿哲', text: '又是曜石。小組賽欠他們一場——學長們沒討回來的帳，今天當面討。' },
      { speaker: '阿哲', text: '他們記得你怎麼打的。上次的套路不會再通——拿出新的東西。' },
    ],
  },
];

// W2(P4) canon 事件年級守衛（拍板①保底轉授）：帶 elderId 的事件，該成員已不在
// 現役名冊（畢業入 alumni）＝改播 altLines（effect/id 不變——技術照學、去重照走）。
// members＝現役名冊；null/undefined（無名冊的舊路徑）＝視同在隊、播原版（安全預設）。
export function resolveEventsForRoster(evs, members) {
  if (!Array.isArray(members)) return evs;
  return evs.map((e) => (
    e.elderId && e.altLines && !members.some((m) => m.id === e.elderId)
      ? { ...e, lines: e.altLines }
      : e
  ));
}

// 2026-08-06 試玩回饋：依**玩家當下位置**追加一句「這套東西對你是什麼」
//（帶 `roleLines` 的事件才有，其餘原樣通過）。
//
// ★ 呼叫順序：必須排在 `resolveEventsForRoster` **之後** ★
// 那一步會把整組 `lines` 換成 `altLines`（年級守衛）——先追加就會被整段覆蓋掉，
// 玩家在前輩畢業的那些屆剛好一句都收不到。順序由 `tests/teach-call-role.test.mjs` 釘住。
//
// role＝`player.currentRole`；null／未知位置＝原樣（安全預設，比照上面 members 的處理）。
export function resolveEventsForRole(evs, role) {
  if (!role) return evs;
  return evs.map((e) => {
    const extra = e.roleLines?.[role];
    return extra ? { ...e, lines: [...e.lines, extra] } : e;
  });
}

// ---- W5 逐出台詞（B5 拍板：2 行極簡，被逐者一行＋隊長一行，平靜克制）----
// 玩家主動點擊觸發（非賽程狀態驅動），故不進 EVENT_DEFS 條件比對；沿用 {speaker,text}
// 形狀以復用 dialogPlay（呼叫端包一層 [{ lines: EXPEL_LINES }]）。
// W1(P4)：speaker 大山→阿哲——大山第 1 屆末畢業，第 2 屆起逐出仍可觸發，畢業者
// 不得開口（隊長交接未拍板＝W2 議題，暫由三屆全程在隊的信任核心代言）
export const EXPEL_LINES = [
  { speaker: '（離隊者）', text: '……我明白。這段路，謝謝你們帶我走過。' },
  { speaker: '阿哲', text: '是你自己選的路。走吧——別回頭。' },
];

// ---- W7.1 屆間訓練營台詞（#6 拍板 C 案：主角 stamina +2/屆走事件不走灑點）----
export const OFFSEASON_TRAINING_LINES = [
  { speaker: '教練', text: '這個冬天沒白練——你的底氣厚了。（耐力 +2）' },
];

// ---- W5 賽季開場（A4 拍板：最小劇情，衛冕/捲土重來各一段隊長對話）----
// advanceSeason 成功後由 careerScreen 播放（衛冕＝defend、止步捲土重來＝comeback）。
// W1(P4)：speaker 大山→阿哲——開場只在進入第 2/3 屆時播，而大山第 1 屆末必畢業，
// 亡靈不得訓話（UI 實跑抓到的敘事 bug）；隊長交接未拍板＝W2 議題
export const SEASON_OPENERS = {
  defend: [
    { speaker: '阿哲', text: '新的一屆了。現在全國都認得遊隼——冠軍掛在我們身上，每一隊都衝著我們來。' },
  ],
  comeback: [
    { speaker: '阿哲', text: '輸掉的那場記著就好。名冊還在、你也更強了——這一屆，遊隼重新起飛。' },
  ],
};

// ---- 學招預告（Sawmah 07-23 拍板：情蒐帶開頭字幕）----
// 這場打完會傳授、且尚未播過的技術（輸贏都教——既有政策）。從 EVENT_DEFS 導出＝
// 自維護：教學鏈改場次/加招式，預告自動跟。只看 post＋lastMatchId（賽前 pre 傳授
// 如決賽跳發，進場前已播完，無需預告）；跨屆已學（events 保留）不再預告。
export function upcomingTeach(career, matchId) {
  const triggered = career?.events ?? [];
  return EVENT_DEFS
    .filter((e) => e.moment === 'post' && e.when.lastMatchId === matchId
      && e.effect?.unlock && !triggered.includes(e.id))
    .map((e) => e.effect.unlock);
}

// W4(P4) W3 債務 5：一次性事件分類（跨屆持久旗標）——events 逐屆重置會讓 debut
// 等敘事一次性事件每屆重播；此清單內的事件播過一次＝生涯內不再播（旗標存
// save.career.playedOnce，careerScreen fireEvents 入帳、dueEvents 呼叫端過濾）。
// 「每屆重置」語意保留給狀態性事件（hot-hand）與轉位談話「下屆再問」節拍（分類處理）。
// teach-*/mb-warn 未觸發者不受影響（旗標只擋「播過的」——canon 轉授版路徑不變）
export const ONCE_EVENT_IDS = new Set([
  'debut', 'first-win', 'first-loss', 'nationals',
  'teach-tip', 'teach-dive', 'teach-pipe', 'teach-float', 'teach-feint', 'teach-jump',
  'teach-call',
  // 批 7：大學兩招同樣是「教過就不再教」（舊存檔升上大學後不會重播）
  'teach-press', 'teach-chase',
  // 職業章批 4b：改叫同樣「教過就不再教」
  'teach-audible',
  // 職業章批 4c：二段時間差同樣「教過就不再教」（漏加＝舊存檔重播教學事件）
  'teach-doublespike',
  'mb-warn', 'rematch-won', 'rematch-lost',
]);
export function isOnceEvent(id) {
  return ONCE_EVENT_IDS.has(id);
}

// 取當下應觸發的事件（依表序；已觸發者不重複）。
// moment 'pre'＝出戰前（條件看下一場）；'post'＝賽後回到生涯畫面（條件看最後一場）；
// 'camp'＝屆間集訓（2026-08-09 E5；advanceSeason 之後、下屆開打之前，只看屆數）
// seasonIndex（2026-08-01）：career 物件本身不帶屆數（每屆重建 schedule/results），
// 由呼叫端（careerScreen 讀 store.seasonIndex()）供給——`when.seasonIndex` 條件用。
// 省略＝1＝第 1 屆：與 careerStore.seasonIndex() 的 `?? 1` 同一個保守方向，
// 推不出屆數時不會誤發第 2 屆才該播的事件。
export function dueEvents(career, moment, seasonIndex = 1) {
  const triggered = career.events ?? [];
  const last = career.results[career.results.length - 1] ?? null;
  const next = nextMatch(career);
  return EVENT_DEFS.filter(
    (e) => e.moment === moment && !triggered.includes(e.id) &&
      matchesWhen(e.when, { career, last, next, seasonIndex }),
  );
}

// ---- W7 D1 舊隊情結（拍板 A：動態賽前事件——EVENT_DEFS 開動態入口、不硬編 12 條）----
// 名冊中來自下一場對手原隊的隊友（dna.teamId＝招募來源隊）→ 賽前插一段動態對話
// （speaker＝隊友名、模板帶原隊名）。id 綁 member×原隊＝每人對原隊一生一次
// （去重走 career.events 既有管道；場內效果 D2/D3 每次對戰都生效，不受此限）。
// 與 dueEvents 靜態表分開：這裡需要 roster（dueEvents 只吃 career），呼叫端合流
export function oldTeamPreEvents(career, roster) {
  const next = nextMatch(career);
  if (!next) return [];
  const triggered = career.events ?? [];
  const teamName = opponentById(next.opponentId)?.name ?? '老東家';
  // W1(P4)：收尾句由現任隊長講——大山畢業後（第 2 屆起）不得開口；名冊無 captain
  // 旗標時（隊長交接未拍板＝W2 議題）暫由阿哲代言
  const captain = (roster?.members ?? []).find((m) => m.captain)?.name ?? '阿哲';
  return (roster?.members ?? [])
    .filter((m) => m.dna?.teamId === next.opponentId)
    .map((m) => ({
      id: `old-team-${m.id}-${next.opponentId}`,
      moment: 'pre',
      lines: [
        { speaker: m.name, text: `${teamName}……我以前的隊。這場讓我上，我不會手軟。` },
        { speaker: captain, text: '不用你說。把你練出來的人就在網子對面——打給他們看。' },
      ],
    }))
    .filter((e) => !triggered.includes(e.id));
}

// ---- B-3 身高誠實化：教練轉位引導（docs/kickoffs/height-honesty-case.md §五；
// 2026-07-30 Sawmah 裁定「引導不補償」）----
// 觸發＝生涯開場（第 1 屆開幕，出戰 group-1 賽前）＋創角身高 < 門檻＋現任主攻
// （憲法 Q7＝一律 OH 出道，此刻 currentRole 恆為 outside；仍顯式判斷以求函式自證、
// 也涵蓋「已轉位」防重複觸發的邊界）。只給資訊、零機制改動——不動轉位 gate、
// 不動任何平衡值、不動 sim。門檻常數單一真相在 heightGrowth.js
// （HEIGHT_HONESTY_THRESHOLD_CM），本檔只 import，測試亦不得另立第二份 168。
// 每個生涯只播一次：入帳走 career.events（與其餘劇情事件同管道——advanceSeason
// 只濾轉位旗標，本 id 跨屆保留、不會重播；career.events 本身即去重，免另掛
// ONCE_EVENT_IDS）。呼叫端（careerScreen）直接消費本函式回傳的事件物件。
export const HEIGHT_GUIDANCE_EVENT_ID = 'coach-height-guidance';

// 語氣鐵則（案卷裁定回填）：點破辛苦、不判死刑——留「你還在長」的口子（憲法承諾
// 「以真實的自己追排球夢」；路不只一條，不是你不行）。教練聲線：短句、務實、不煽情。
export const HEIGHT_GUIDANCE_LINES = [
  { speaker: '教練', text: '……過來一下，新人。' },
  { speaker: '教練', text: '你這個身高打主攻，以後每一球都是硬仗——網子對面，比你高一顆頭的人多得是。' },
  { speaker: '教練', text: '但這支隊，位置不是判死刑。舉球員、自由人——矮個子一樣能站在場中央，而且站得比誰都穩。門，我一直開著。' },
  { speaker: '教練', text: '當然，你還在長。先把眼前這球打好，路——之後再看。' },
];

// 純函式：career＋player → 事件物件或 null。
// null 情境：已播過（career.events 含此 id）／無 player／身高 ≥ 門檻／currentRole
// 已非 outside（已轉位）。
export function heightGuidanceEventFor(career, player) {
  if ((career?.events ?? []).includes(HEIGHT_GUIDANCE_EVENT_ID)) return null;
  if (!player) return null;
  const cm = Math.round((player.height?.current ?? 0) * 100);
  if (!cm || cm >= HEIGHT_HONESTY_THRESHOLD_CM) return null;
  if ((player.currentRole ?? 'outside') !== 'outside') return null;
  return { id: HEIGHT_GUIDANCE_EVENT_ID, lines: HEIGHT_GUIDANCE_LINES };
}

// ---- W1(P4) 畢業儀式（憲法 Q1/Q3/Q4；儀式規格對標來投開箱）----
// 我方畢業者具名台詞：大山＝隊長級離別重場、阿烈＝輕量但有記憶點、三年級招募生＝
// 「短暫相遇的告別」（四名三年級招牌各有專屬句，其餘走通用款）；
// 播報＝對手 ace 畢業一句話＋「舊王牌去向」伏筆（大學章埋線，不展開）。
// 純建構器：吃畢業名單回台詞列，呼叫端（careerScreen）以 dialogPlay 播放。

// 我方創隊班底的專屬離別（member id 對句；查無＝通用款）
const FAREWELL_BY_ID = {
  A3: [
    { speaker: '大山', text: '……三年，就這樣打完了。體育館的燈，原來這麼亮。' },
    { speaker: '大山', text: '我把遊隼交給你們。牆不在了——你們自己，就要是牆。' },
    { speaker: '大山', text: '還有你，新人。那種關鍵球，以後每一顆都要敢打。學長只能陪你到這裡了。' },
  ],
  A4: [
    { speaker: '阿烈', text: '哼——不習慣講這種話。球給你們了，別打得比我斯文。' },
  ],
  // A7 阿遠（替補學長，第 2 屆末與阿岩同屆畢業）：替補的告別——把板凳坐成專業的人
  A7: [
    { speaker: '阿遠', text: '兩年裡，我大部分時間都在旁邊看。……但因為一直在看，誰累了、誰慌了，我都第一個知道。' },
    { speaker: '阿遠', text: '板凳交給你們了。記住——會休息的隊伍，才打得完整個夏天。' },
  ],
  // W3(P4) 甲3③ 阿岩專屬離別（阿烈級份量＋一段專屬對話）：安靜離場的留白處理——
  // 台詞不堆量，重量靠演出；「牆」交給無名接班者（不指名，對照小雷/大山戲的留白）。
  // 與小雷的專屬對話由 graduationCeremonySegments 依名冊追加（N1 在隊才有）
  A6: [
    { speaker: '阿岩', text: '……嗯。輪到我了。' },
    { speaker: '阿岩', text: '三年，我都站在網子中間。話不多——牆本來就不用說話。' },
    { speaker: '阿岩', text: '以後誰站中間，誰就是牆。不用是誰。站上去，就是了。' },
  ],
};

// 阿岩×小雷的離別對話（甲3③ 專屬對話；留白＝阿岩不挽留、小雷不承諾）
const IWAN_RAI_EXCHANGE = [
  { speaker: '小雷', text: '……我才不會替你守什麼牆。' },
  { speaker: '阿岩', text: '嗯。你會拆掉它，蓋一面新的。……也好。' },
];

// 三年級招牌球員的專屬告別（recruitKey 對句）
const FAREWELL_BY_RECRUIT = {
  obsidian: [{ speaker: '阿曜', text: '只有一年，但跟你們打球，比在曜石三年都痛快。網子對面再見——大學的舞台。' }],
  'sky-hawk': [{ speaker: '阿鷹', text: '決賽的天空，讓給你了。下次見面，我會在更高的地方等。' }],
  'gale-shore': [{ speaker: '小嵐', text: '風要往前吹了。你們的節奏——我會在某個球場想起來。' }],
  'black-pine': [{ speaker: '老松', text: '這面牆，最後一年砌在遊隼。……值得。' }],
};

// 對手 ace 畢業播報（ace 名對句：一句話＋去向伏筆；查無＝通用款）
const ACE_FAREWELL_BY_NAME = {
  詹子曜: '曜石體中「黑曜箭」詹子曜畢業——據說北部的大學強豪，已經為他留了球衣。',
  王勝翔: '天鷹學園「制空者」王勝翔畢業——傳聞他要直接挑戰企業聯賽的天空。',
  簡子嵐: '青嵐水產「颱風眼」簡子嵐畢業——風停了？不，聽說只是換了一片更大的海。',
  // D1（07-30）：老松降為與玩家同屆＝第 3 屆末才畢業（屆末播報只跑第 1、2 屆，
  // 這句實務上由生涯結算接手；文案與新稱號「未完成的牆」對齊，不留舊悲壯口徑）
  曾家松: '黑松實業「未完成的牆」曾家松畢業。三年砌到這裡還沒封頂——大學排壇等著看他砌完。',
  劉振鎧: '鐵霧工業「鐵彈道」劉振鎧畢業——下一站，據說是國家隊青年隊的靶場。',
};

// W3(P4) 結構化儀式段落（演出版消費）：opening／perGraduate（逐畢業者＝聚光段）／
// aceLines／closing。members＝當屆名冊（阿岩×小雷對話的在隊判定；省略＝無追加）。
// graduationCeremonyLines＝本函式的攤平（退化對話卡與既有呼叫端同一事實源）
export function graduationCeremonySegments({ graduates = [], aceGrads = [], members = [] } = {}) {
  const opening = [
    { speaker: '教練', text: '賽季結束了。三年級的最後一天——全隊到齊，送他們一程。' },
  ];
  const perGraduate = graduates.map((m) => {
    const own = FAREWELL_BY_ID[m.id] ?? FAREWELL_BY_RECRUIT[m.recruitKey ?? m.origin];
    const lines = own
      ? [...own]
      : [{ speaker: m.name, text: '謝謝大家。這段路，我不會忘。' }];
    // W2(P4) 隊長交接（拍板：阿哲正式接任）：大山離別後、儀式鏈內完成交接
    if (m.id === 'A3') {
      lines.push({ speaker: '大山', text: '阿哲。隊長臂章，從今天起是你的——遊隼的節奏，交給你握。' });
      lines.push({ speaker: '阿哲', text: '……收下了，學長。牆不在了不算完——牆教過的東西，換我來傳。' });
    }
    // 甲3③ 阿岩×小雷專屬對話（小雷在隊才有；他不在＝阿岩獨白收尾的留白）
    if (m.id === 'A6' && members.some((x) => x.id === 'N1')) {
      lines.push(...IWAN_RAI_EXCHANGE);
    }
    return { member: m, lines };
  });
  const aceLines = aceGrads.map((a) => ({
    speaker: '播報',
    text: ACE_FAREWELL_BY_NAME[a.name]
      ?? `${a.teamName}「${a.title}」${a.name} 畢業——他的去向，是下一個舞台的故事。`,
  }));
  const closing = [
    { speaker: '教練', text: '明天起，新的一屆。體育館的鑰匙——交給留下來的人。' },
  ];
  return { opening, perGraduate, aceLines, closing };
}

// graduates＝我方畢業成員快照（graduation.splitGraduates）；aceGrads＝
// careerState.graduatingAces 輸出。回傳 dialogPlay 可直接吃的台詞列
export function graduationCeremonyLines({ graduates = [], aceGrads = [], members = [] } = {}) {
  const s = graduationCeremonySegments({ graduates, aceGrads, members });
  return [
    ...s.opening,
    ...s.perGraduate.flatMap((g) => g.lines),
    ...s.aceLines,
    ...s.closing,
  ];
}

// W1(P4) 新生入學（輕量見面演出；手寫新生的支線重場＝之後的週次，本週不做內容）
// 手寫新生見面句依 id 對句（人設定案後在此補；07-26 拍板 B 案雷紹齊＝叛逆型）
const FRESHMAN_GREETING_BY_ID = {
  N1: '……雷紹齊，攔中。先說好——我不是來當第二個大山的。',
  // 第 3 屆手寫 L（07-27 拍板 B 案）：安靜篤定型——與小雷叛逆型對照的入場句
  N2: '紀慕白，自由人。……球落地之前，都還不算輸。請多指教。',
};
const FRESHMAN_GREETING_BY_ROLE = {
  setter: '我來讓球去它該去的地方。',
  middle: '攔網——交給我試試。',
  opposite: '右邊的砲位，我想接下來。',
  outside: '主攻的位置，我會追上學長們的。',
  libero: '球不落地——聽說這是遊隼的規矩。',
};

export function freshmenIntroLines(freshmen = []) {
  if (!freshmen.length) return [];
  const lines = [{ speaker: '教練', text: '進來吧——今年的新生。' }];
  for (const f of freshmen) {
    lines.push({
      speaker: f.name,
      text: f.origin === 'handwritten'
        ? (FRESHMAN_GREETING_BY_ID[f.id] ?? '請、請多指教！')
        : (FRESHMAN_GREETING_BY_ROLE[f.role] ?? '請多指教！'),
    });
  }
  lines.push({ speaker: '教練', text: '都是生面孔——場上見真章。解散！' });
  return lines;
}

// ---- P2① 來投見面（試玩回饋 0730 拍板；接在新生入學之後的屆末鏈）----
// 口徑鐵則：**慕名而來、不是挖角成功**——台詞不得出現「挖角」「條件達成」語彙，
// 也不由教練帶進來（他是自己找上門的，這是玩家的比賽打出來的結果）。
const WALKON_GREETING_BY_ROLE = {
  setter: '我在看台上算過你們的球路。……讓我來舉，我能讓它更快。',
  middle: '你們中間那道牆，我想站上去補一塊。',
  opposite: '右邊那個位置——上一場空了兩球。我可以。',
  outside: '我看了你們三場。這種球隊，我想加入。',
  libero: '我是為了那顆救起來的球來的。球不落地，這裡是這樣打的吧？',
};

export function walkOnIntroLines(walkOn = null) {
  if (!walkOn) return [];
  return [
    { speaker: '教練', text: '……還有一個人。不是我找來的——他自己站在門口等。' },
    {
      speaker: walkOn.name,
      text: WALKON_GREETING_BY_ROLE[walkOn.role] ?? '我看了你們的比賽。我想在這裡打球。',
    },
    { speaker: '教練', text: '有人因為你們的球主動找上門——這種事，我教了十年第一次遇到。' },
  ];
}

// 事件入帳（不可變）；career.events 為已觸發 id 清單（v3 相容：欄位缺席視同空）
export function recordEvent(career, id) {
  return { ...career, events: [...(career.events ?? []), id] };
}

function matchesWhen(when, { career, last, next, seasonIndex = 1 }) {
  for (const [key, val] of Object.entries(when)) {
    switch (key) {
      // 第幾屆（2026-08-01）：值由呼叫端供給（career 物件每屆重建、自己不記屆數）。
      // 教學鏈搬家用——例：teach-call 掛第 2 屆的集訓（moment 'camp'，08-09 起無 matchId）
      case 'seasonIndex':
        if (seasonIndex !== val) return false;
        break;
      case 'matchId':
        if (next?.id !== val) return false;
        break;
      case 'opponentId':
        if (next?.opponentId !== val) return false;
        break;
      case 'stage':
        if (next?.stage !== val) return false;
        break;
      case 'wonLast':
        if (!last || !!last.won !== val) return false;
        break;
      case 'lastMatchId':
        if (last?.matchId !== val) return false;
        break;
      case 'wonVs': // 曾勝過該隊（宿敵差分用）
        if (!ctxCareerHasResult(career, val, true)) return false;
        break;
      case 'lostVs':
        if (!ctxCareerHasResult(career, val, false)) return false;
        break;
      // 大學卷批 7：大學聯賽已打完幾場。★round==='league' 只在 uniSchedule 產生★
      // （高中賽程是 'rr'，schedule.js:110）⇒ 高中章恆 0，這兩條事件不可能在
      // 高中觸發，B7-11 的零回歸由判準本身保證，不靠額外的章節條件。
      // 用 >= 而不是 ===：ONCE_EVENT_IDS 已保證只播一次，而 >= 讓「那一場賽後剛好
      // 沒進賽後畫面」的存檔之後仍補得到；=== 會讓錯過的人一輩子學不到這一招。
      case 'uniLeaguePlayed': {
        const league = (career.schedule ?? []).filter((m) => m?.round === 'league');
        // ★棄賽不算「打完」★（2026-08-24 Sawmah 裁定）：學長教你東西是因為看了你
        // 打球，棄賽三場就領走傳授在敘事上也說不通。標記由 resolveForfeit 寫入
        // （careerState.js 的 recordResult，可選欄位）；舊存檔無此欄＝當作正常完賽。
        const done = league.filter(
          (m) => career.results.some((r) => r.matchId === m.id && !r.forfeit),
        ).length;
        if (done < val) return false;
        break;
      }
      // 職業章批 4a：職業聯賽已打完幾場（同 uniLeaguePlayed 的棄賽不算「打完」規則，
      // round==='pro' 只在 proSchedule 產生——高中/大學/企業章恆 0，不可能誤觸發）。
      case 'proLeaguePlayed': {
        const league = (career.schedule ?? []).filter((m) => m?.round === 'pro');
        const done = league.filter(
          (m) => career.results.some((r) => r.matchId === m.id && !r.forfeit),
        ).length;
        if (done < val) return false;
        break;
      }
      case 'playedCount':
        if (career.results.length !== val) return false;
        break;
      case 'lossCount':
        if (career.results.filter((r) => !r.won).length !== val) return false;
        break;
      case 'minKills':
        if (((last?.stats?.kills ?? 0) + (last?.stats?.tipKills ?? 0)) < val) return false;
        break;
      default:
        return false; // 未知條件鍵＝不觸發（安全預設；打錯字不會誤發事件）
    }
  }
  return true;
}

function ctxCareerHasResult(career, opponentId, won) {
  return career.results.some((r) => r.opponentId === opponentId && !!r.won === won);
}
