// 常駐「怎麼玩」頁（2026-08-12）——主選單與生涯畫面都進得來、隨時可查。
//
// ★ 為什麼要這一檔 ★ 真人回饋：「這遊戲那麼多特別的地方，都沒有很好的解釋玩法」。
// `tutorial.js` 是**開場一次性**卡片（localStorage 記一次就再也不出現），教的是四件事；
// 而比賽中有 20 幾種操作、生涯有 20 個系統。忘了就查不到＝等於沒教。
//
// ★ 文案鐵則（本專案已為此付過兩次代價）★ 每一句都要與現行機制逐字對準，
// **不得承諾程式做不到的事**。因此下面每一條文案都在註解裡標出依據的 `檔案:行號`；
// 改機制的人請一併改這裡的句子——對不上的句子就是下一次「文案說謊」事故。
//
// ★ 內容與渲染分開 ★ `HOW_TO_PLAY` 是純資料（可被測試逐句檢查），`showHowToPlay`
// 只負責畫。文案守衛測試（`tests/how-to-play.test.mjs`）吃的是前者。
//
// ★ 2026-08-13：上面那條「文案鐵則」失效過一次，代價是整頁「基本操作」★
// 標了 `檔案:行號` 不等於對得上——那些行號指向 `src/app/matchControls.js`，
// 而**真檔在 `src/input/`**，路徑從一開始就是錯的，所以沒有人能照著去更新。
// 更根本的是漏了「模式」這一維：整頁照 classic 模式的蓄力鈕寫，而預設是 simpleMode，
// 那顆鈕在 `matchStage.js:68` 根本不會被建立。真人試玩才抓到（「我們現在哪有蓄力拖曳」）。
// ⇒ 現在每個段落可標 `mode:'simple'|'classic'`，未標＝兩者皆適用；
//   模式判定一律問 `matchConfig.isSimpleMode`（單一真相源），不得自己再判一次。
import { isSimpleMode } from '../app/matchConfig.js';

const COLOR = {
  text: '#eef2fa', dim: '#9fb0cc', gold: '#ffd166', cyan: '#6ee7ff',
  card: 'rgba(18,24,40,0.85)',
  bg: 'linear-gradient(180deg, #070a12 0%, #0b1120 55%, #070a12 100%)',
};

function el(tag, css, text) {
  const node = document.createElement(tag);
  node.style.cssText = css.join(';');
  if (text !== undefined) node.textContent = text;
  return node;
}

// ════════════════════════════════════════════════════════════════
// 內容層（純資料）
// ════════════════════════════════════════════════════════════════
// 形狀：[{ id, title, sections: [{ heading, mode?, items: [{ term, desc }] }] }]
//   mode ＝ 'simple'｜'classic'｜省略（兩種模式都顯示）。
//   term ＝畫面上那個東西的**原文**（鈕面字、鍵位、顏色），desc ＝它到底做什麼。
//   term 一律照抄程式碼裡的字串——同一條線不得有兩種叫法（`callButton` 檔頭的紀律）。

export const HOW_TO_PLAY = [
  {
    id: 'basics',
    title: '基本操作',
    sections: [
      {
        heading: '走位',
        items: [
          {
            // matchControls.js:824-841 readMove（鍵盤/搖桿→世界座標）；
            // :213-217 觸控只認左 40% 螢幕（點在那裡就是搖桿原點，拖曳出方向）
            term: 'WASD／方向鍵・左側螢幕搖桿',
            desc: '手機在螢幕左側按下去就是搖桿（按哪就以哪為原點，拖出方向）、電腦按 WASD。',
          },
          {
            // matchControls.js:320-323 manualOwned；:336-346 發球前歸位；:348-378 rally 中帶位
            term: '你不動，隊形自己會帶',
            desc: '沒碰搖桿時系統會把你帶到該站的位置；一碰就是「這球歸你跑」，之後不再拉回。',
          },
        ],
      },
      {
        heading: '出手',
        items: [
          {
            // matchControls.js:464-470 到位自動接（timing 0.6）；:471-474 自由人讀對＝1.0
            term: '接球不用按任何東西',
            desc: '走到球落點就會自動接起來——一傳是反射不是瞄準。接得好不好看你有沒有站到位，不是看你按什麼。',
          },
          {
            // zonePanel.js:14-18 螢幕下緣置中；matchLoop.js:1136-1151 chooseAttack（timing＝zone.power）
            term: '攻擊面板',
            desc: '舉球給你時畫面下方會跳出選區面板，時間放慢，點你要打的那一區就出手。威力由選區決定。',
          },
          {
            // diegeticUi.js:214-225 疊在隊友身上的熱點；matchLoop.js:1305-1321 舉球分配
            term: '舉球是點隊友',
            desc: '換你舉球時，隊友身上會浮出可以點的記號——點誰就舉給誰。',
          },
        ],
      },
      {
        heading: '出手（經典模式 ?classic=1）',
        mode: 'classic',
        items: [
          {
            // actionButtons.js:3-5,41-44 標籤隨情境；matchControls.js:167-209 蓄力/拖曳/放開
            // ★ 這一整段只活在 classic ★ matchStage.js:68 在 simpleMode 下不建立 actionButtons
            term: '右側大鈕（或 J 鍵）',
            desc: '按住蓄力、拖曳瞄準、放開出手。鈕面的字會隨情境變成發球／扣球／舉球／墊球。',
          },
          {
            // matchControls.js:177,166 甜蜜區與超蓄 >1.15 品質劣化
            term: '蓄力別過頭',
            desc: '蓄力條有甜蜜區，一路壓到底反而會讓球飄掉。',
          },
          {
            // matchControls.js:178-198：放開瞬間球恰在可及範圍且下墜＝timing 1.0（散佈減半）
            term: 'Perfect 接球',
            desc: '接球時在球正好落進你手可及範圍、而且正在往下掉的瞬間放開，散佈砍半。',
          },
        ],
      },
      {
        heading: '攔網',
        items: [
          {
            // matchControls.js:120,141-148 K 鍵一點即出（不蓄力）；:519-527 手機站到位自動起跳
            // ★ 不寫「攔網鈕」★ 那顆鈕在 actionButtons.js:34，simpleMode 下不存在（matchStage.js:68）
            // ★ 連「不用蓄力」都不寫 ★ 否定句一樣會讓人去找那個不存在的東西
            term: 'K 鍵／站到位自動跳',
            desc: '電腦按 K 一點就跳；手機不用按，貼網卡到位就會自己起跳。',
          },
          {
            // matchControls.js:280-290 貼網 |z| < 2.2 才攔得到
            term: '先卡位，再談時機',
            desc: '要貼著網站（離網太遠就不算攔網），沿網橫移卡在他要打的那條線上。',
          },
        ],
      },
      {
        heading: '發球三式',
        items: [
          {
            // game.js:945-992 三式；stamina.js:14,18,25 體力成本 0.001/0.008/0.015
            term: '普通',
            desc: '零風險、幾乎不耗體力。想穩穩開球就選它。',
          },
          {
            // FLOAT_SCATTER ×2.2 自身散佈；對方接發懲罰 ×1.15；體力 0.008
            term: '飄浮',
            desc: '自己會飄一點（失誤變多），換對方一傳難接一點。體力中等。',
          },
          {
            // POWER_SERVE_SCATTER ×2.8；對方接發懲罰 ×2.0；體力 0.015＝三式最高
            term: '跳發',
            desc: '威脅最大、失誤也最多，而且是三式裡最耗體力的一種。想要 ACE 就得付這個價。',
          },
          {
            // matchControls.js:739-747 serveZones 四落點；matchLoop.js:1218-1241
            term: '落點四選一',
            desc: '深左／深中／深右／短球，跟球路分開選。',
          },
        ],
      },
      {
        heading: '假動作',
        items: [
          {
            // zonePanel.js:41-84 onFake 手勢；matchControls.js:607-612 chooseAttackFake
            term: '按住 A 區、滑到 B 區才放開',
            desc: '眼睛看 A、球打 B。兩區差越開越能騙過攔網，但自己的落點也越飄。',
          },
        ],
      },
      {
        heading: '魚躍',
        items: [
          {
            // matchStage.js:606-608（07-24 撤掉常駐手動鈕）；matchControls.js:488-518 自動觸發
            term: '自動的，沒有鈕',
            desc: '站著搆不到、但撲得到的球，你會自動飛身撲救——不用按任何東西。',
          },
        ],
      },
      {
        heading: '其他隨時能按的',
        items: [
          {
            // matchStage.js:335-352 右上角圓鈕；matchLoop.js:724-726 R 鍵；:746-755 半速重播
            term: '🎬 回放',
            desc: '右上角圓鈕（電腦按 R）：把上一球最後三秒用半速重播一次。',
          },
          {
            // matchStage.js:356-387
            term: '⏱ 暫停',
            desc: '喊暫停。',
          },
          {
            // subPanel.js；死球窗才開
            term: '⚙ 換人',
            desc: '死球空檔才點得動。',
          },
        ],
      },
    ],
  },
  {
    id: 'roles',
    title: '五個位置',
    sections: [
      {
        heading: '共通：三顆浮鈕，兩種脾氣',
        items: [
          {
            // ai.js:1358-1362 檔頭把三顆鈕的語意寫死：內切/夾塞不動球權、要B快動球權
            term: '「要球」還是「改線」',
            desc: '「🖐 要 B 快」「⚡ 跟上！」是把球要過來；「↘ 內切」「🤝 夾塞」只是改自己跑的線，球最後給誰仍由二傳決定。',
          },
          {
            // callButton.js:1-9 浮鈕 0.8s 窗、點一下就收
            term: '窗很短',
            desc: '浮鈕亮起來只有一瞬間，點一下就收。沒亮就是這一波你按不動。',
          },
        ],
      },
      {
        heading: 'S 舉球員',
        items: [
          {
            // diegeticUi.js:56-73 預設點 3D 隊友身上光圈；setOptions.js:111-115 標題播報一傳品質
            term: '分配：點誰誰打',
            desc: '球到你手上時時間放慢，直接點隊友身上的光圈把球給他。面板會如實告訴你這顆一傳的品質。',
          },
          {
            // setOptions.js:90-106：tier === 'perfect' 且 S 在前排才有 dump
            term: '🎯二次球',
            desc: '一傳到位、而且你人在前排，才會冒出來。自己把第二球輕推到對面淺區——是你打，不是傳給人。',
          },
          {
            // callPlay.js:43,47-64 只有 S 能叫；approach.js offeredCallTypes 決定池
            term: '⚡指令',
            desc: '叫戰術給隊友跑（交叉、夾塞、時間差、B 快）。球還在飛的時候就要下，指定的是隊友，不是你自己攻。',
          },
        ],
      },
      {
        heading: 'MB 攔中',
        items: [
          {
            // blockRead.js:27-29 只有前排 MB 拿得到讀心線索；matchControls.js:37-60 mbMomentFor
            term: '讀舉球',
            desc: '你站前排時，對方第二觸出手那一瞬間會給你線索（一傳品質、哪一翼在助跑），面板讓你選封直線還是封斜線。',
          },
          {
            // ai.js:1373-1387 bquickStateOf；:1391-1401 applyBquickCall 改 attackerId
            term: '🖐 要 B 快',
            desc: '你這一波本來就跑快攻線時才會亮。按下去＝這球給你打 B 快，會真的改球權。第 1 屆還沒有戰術，按不到。',
          },
        ],
      },
      {
        heading: 'OPP 對角',
        items: [
          {
            // ai.js:1239-1241 檔頭：夾塞不改球權，實測 73% 的波球不是他打的
            term: '🤝 夾塞',
            desc: '把你和快攻手排成前後夾擊。這是跑位不是要球——球最後給誰仍看二傳，鈕面會誠實寫「這球你的」有沒有成立。',
          },
          {
            // matchLoop.js:1516-1527 後排 OPP、一傳起球、0.8s 窗；:2183,2389 CALL_GRANT=0.7
            term: '⚡ 跟上！',
            desc: '你在後排、一傳剛起來的那 0.8 秒亮起。喊了大約七成機率球真的給你——不是保證。',
          },
        ],
      },
      {
        heading: 'OH 主攻',
        items: [
          {
            // ai.js:1127-1157 cutStateOf：前排 OH、本波走左翼線、一傳 perfect 才開窗
            term: '↘ 內切',
            desc: '前排、跑左翼線、而且一傳到位時才亮。把外線改成往中間切——只改路線，不改球權。',
          },
        ],
      },
      {
        heading: 'L 自由人',
        items: [
          {
            // liberoRead.js:14-18 三選項；matchControls.js:691-698 對手舉球出手瞬間開窗
            term: '防守指揮',
            desc: '對方舉球出手那一刻開窗，三選一：封直線・收斜線／封斜線・收直線／攔手讓開・收吊球。前排怎麼站、後排怎麼縮，一起變。',
          },
          {
            // matchLoop.js:977-994 一秒未動照 AI 建議執行；:1093 override 旗標
            term: '不選也會動',
            desc: '面板預設高亮 AI 的建議，一秒沒動就照建議跑。你點下去＝改判，覆蓋它。',
          },
          {
            // liberoRead.js:99-105 digReadCorrect：讀對且球飛向自己＝Perfect 窗
            term: '讀對有獎',
            desc: '猜對方向、球又剛好飛向你，這球會給你 Perfect 接球窗。',
          },
          {
            // matchStage.js:531-566 板凳常駐鈕；matchLoop.js:500-512 可用性；:519 二次確認
            term: '🔥該我上了',
            desc: '坐板凳時常駐。自由人配對回場不吃換人額度，但要二次確認——換上來，防守是真的會變弱。',
          },
        ],
      },
    ],
  },
  {
    id: 'screen',
    title: '看懂畫面',
    sections: [
      {
        heading: '地上那個圈',
        items: [
          {
            // matchLoop.js:1876-1878：predictLanding 的落地點；青 0x6ee7ff 界內、紅 0xff5b5b 出界
            term: '青圈＝球會落在這裡',
            desc: '這是球「落地」的位置，不是你該站的位置。變成紅圈＝這球算出來會出界，別碰它。',
          },
          {
            // matchLoop.js:1842-1845 CONTACT_ASSIST_COLOR；contactAssist.js:1-24 檔頭（落地點差 0.72m）
            term: '輪到你碰球時，圈會換一種',
            desc: '這球指名你處理時，圈改成畫「你該站的地方」——球墜到你手搆得到的高度時它在哪。綠＝扣得動、黃＝舉得起來、橘＝只能墊過去。',
          },
        ],
      },
      {
        // ★ 只有 classic 看得到 ★ touchUi.js:27-38 的蓄力圈讀 controls.uiState().charge，
        // 而 charge 只由滑鼠 pointerdown（matchControls.js:219-223）或 beginAction()
        // （只有 actionButtons.js 會呼叫，simpleMode 不建立）設起來 ⇒ 觸控＋預設模式恆為 null，
        // 這個圈畫面上根本不會出現。
        heading: '手指上的蓄力圈（經典模式 ?classic=1）',
        mode: 'classic',
        items: [
          {
            // touchUi.js:30-33：藍 110,231,255／綠 96,255,160 甜蜜區／紅 255,91,91 超蓄
            term: '藍 → 綠 → 紅',
            desc: '藍＝蓄力中，綠＝甜蜜區（放開最準），紅＝壓過頭、球會飄。',
          },
          {
            // heroCards.js:22-27 PERFECT_POWER 0.95、字卡 ✨ PERFECT!；
            // matchControls.js:177-198 receive 的 timing 判準與蓄力進度是兩套
            term: '接球的 Perfect 不看這個圈',
            desc: '扣球發球看綠色沒錯，但「✨ PERFECT!」是另一套判定——球進到你手可及範圍又正在下墜的那一刻放開才算。字卡跳出來才是真的拿到。',
          },
        ],
      },
      {
        heading: '攻擊面板的紅綠',
        items: [
          {
            // matchLoop.js:1027-1038：綠 96,255,160 空區、紅 255,91,91 已被擋（附「✋」）
            term: '綠＝空檔、紅✋＝被封',
            desc: '舉球給你時面板會把對面的牆標出來：綠色那格沒人守，紅色打過去會被攔。',
          },
          {
            // growth.js:95-99 blockReadTier：reaction <55 none／55-69 slow（600ms）／>=70 instant
            term: '看不看得到，看你的「反應」',
            desc: '反應低於 55 就沒有顏色可看，得自己用眼睛找牆；55 到 69 要等 0.6 秒顏色才浮現；70 以上一開窗就即時上色。',
          },
        ],
      },
      {
        heading: '記分板下的氣勢條',
        items: [
          {
            // scoreboard.js:20 MOMENTUM_COLOR：A 青 #6ee7ff、B 暖橘 #ff9d7a；game.js:53 MOMENTUM_MAX=3
            term: '往哪邊長就是誰在燒',
            desc: '青色往你這邊長＝你們氣勢在上，暖橘往對面長＝對方順。最多三檔，滿檔會發光。',
          },
          {
            // game.js:1397-1431 MOMENTUM_STREAK_MIN=3；條下三顆小點 scoreboard.js:55-58
            term: '連得三分才推一檔',
            desc: '條子下面那三顆小點就是連續得分的進度，集滿三顆才推一檔；對方得分就退回來。',
          },
          {
            // game.js:1021-1038：MOMENTUM_SCATTER_CAP=0.08、MOMENTUM_RECOV_PER_STEP 死球恢復
            term: '有實際作用',
            desc: '占上風那隊出手最多穩 8%，落後那隊飄 8%，而且死球時體力恢復得比較多。',
          },
        ],
      },
      {
        heading: '體力條',
        items: [
          {
            // stamina.js:36-37 TIER1_BELOW=0.5、TIER2_BELOW=0.25；matchStage.js:570-604 左下常駐
            term: '綠 → 黃 → 紅',
            desc: '五成以上綠、五成到兩成五黃、兩成五以下紅。左下角是你自己的，⚙ 換人面板裡看得到全隊的。',
          },
          {
            // stamina.js:38-40 TIER1_MUL 0.9／TIER2_MUL 0.8／TIER2_RECV_PENALTY 1.18
            term: '紅了會怎樣',
            desc: '黃燈時力量、彈跳、速度都打九折；紅燈打八折，而且接球明顯變飄——爆接就是這樣來的。',
          },
          {
            // stamina.js:112-119：跳發權重 1.0、飄浮 0.15、站發 0；:14,18,25 三式成本
            term: '最先崩的是跳發',
            desc: '體力掉下去之後，跳發的失誤增加最多，飄浮受影響小，普通發球完全不受影響。',
          },
        ],
      },
      {
        heading: '場上其他的線與圈',
        items: [
          {
            // blockReach.js 檔頭：畫玩家自己的攔網涵蓋帶，刻意不畫球的預測落點
            term: '網上的涵蓋帶',
            desc: '你攔網時網上那條帶子＝「我這雙手守得住多寬」。它不會告訴你球要往哪打——那得自己讀。',
          },
          {
            // routeCue.js:42-57：tempo 一速紅 #ff6b6b／二速橙 #ffa94d／三速藍 #74c0fc；
            // action wait 冷色 #cfe3ff／now #ffd166／running #60ffa0；:SHOW_LEAD_TICKS 90、URGENT_TICKS 8
            term: '畫面下緣那條字帶',
            desc: '二傳要你跑哪條線、幾速、現在該不該起跑。顏色轉黃就是「該跑了」，轉綠代表你已經在跑。',
          },
          {
            // diegeticUi.js:56-73：loud 金 #ffe45c 大圈＋「🙋這球給我！」、hesitant 灰 #5a6a8a、一般青
            term: '隊友腳下的光圈（你是二傳時）',
            desc: '金色大圈＋「🙋這球給我！」＝他在要球，灰色＝他在猶豫，青色＝一般候選。點誰球就給誰。',
          },
          {
            // pointBanner.js:30-48 derivePointInfo：站位犯規/四擊犯規/後排攻擊違例/各種出界
            term: '得分後跳出來的那張面板',
            desc: '寫的是「這一分為什麼結束」——出界、犯規、攔死還是打穿，看不懂剛剛發生什麼時看它。',
          },
        ],
      },
    ],
  },
  {
    id: 'career',
    title: '生涯系統',
    sections: [
      {
        heading: '成長點',
        items: [
          {
            // growth.js:5-16 GROWTH 常數；:84-93 growthPointsFor
            term: '怎麼賺',
            desc: '每場保底 2 點，贏球再 2 點；殺球、吊球、ACE、攔網得分各 1 點，每 2 次 Perfect 一傳折 1 點。單場最多 12 點。',
          },
          {
            // growth.js:22-29 GROWABLE_ATTRS 六項；:14 ATTR_CAP 90（職業章 100，attrCapFor）
            term: '加在哪',
            desc: '力量、彈跳、反應、速度、發球、攔網六項，1 點加 1，上限 90（職業章解鎖到 100）。',
          },
          {
            // growth.js:20 註解：control/stamina 不開放逐場加點；trainingCamp.js:65-79 才動耐力
            term: '控球與耐力不在這裡',
            desc: '這兩項不能用成長點加——耐力要靠集訓，控球目前還沒開放。',
          },
          {
            // growth.js:32-34 TECH_DEFS：故事線傳授，不花點數
            term: '技術是另一條路',
            desc: '吊球、魚躍、後排攻擊、飄浮發球這些不用點數買，是劇情裡被人教會的。',
          },
        ],
      },
      {
        heading: '信任',
        items: [
          {
            // careerScreen.js:1131 原文照抄；trust.js:9-14 trustToWeights
            term: '信任決定球權',
            desc: '信任影響舉球分配——高信任拿更多攻擊球權。',
          },
          {
            // trust.js:35-52 trustDyn：得分 +5、連續再 +3、失誤 −6、連續再 −4，夾限 ±25
            term: '場內還有一份浮動的',
            desc: '這一場打得好，二傳當場就更愛找你；連續失誤則相反。這份加減只活在這場比賽裡。',
          },
          {
            // trust.js:104-114 applyFloorShare 玩家保底球權
            term: '不會被冷凍',
            desc: '就算信任很低，你仍有保底球權——不至於整場當觀眾。',
          },
        ],
      },
      {
        heading: '招募與等候名單',
        items: [
          {
            // recruitment.js:79-216 RECRUIT_CONDS：wins / feat / stage 組合
            term: '對誰打出什麼',
            desc: '每支對手隊都有自己的招募條件：贏他幾場、或對他打出指定的壯舉。生涯畫面的招募區塊會列出目前進度。',
          },
          {
            // recruitment.js:321 AXIS_ROLE 綁位置；:457-461 featAxisMet（OR 判定）
            term: '有些軸換位置才走得到',
            desc: '二傳看得到「單場助攻」那條、自由人看得到「單場起球」那條，任一條達標都算。畫面只列你這個位置真的推得動的路。',
          },
          {
            // roster.js:5,111 capacity 12；recruitment.js:592-653 settleRecruitJoins / waiting
            term: '滿編就排隊',
            desc: '名冊上限 12 人。條件達成但沒空位時他會進等候名單，等有人畢業或被逐出再遞補。',
          },
        ],
      },
      {
        heading: '情蒐錄影帶',
        items: [
          {
            // matchConfig.js:135-148 每場生涯賽開賽前自動生成；scoutTape.js:56-100 收 2-3 段
            term: '賽前自動放給你看',
            desc: '不用去哪裡開——每場生涯賽開打前，會先播 2、3 段對手的得分回合。',
          },
          {
            // scoutTape.js:19,35-49 TAPE_FEATURE_KEYS：本場要教的招會被放大並優先收錄
            term: '順便預告你要學的招',
            desc: '這場賽後會學到的技術，剪輯會刻意讓你先在對手身上看到它長什麼樣。',
          },
        ],
      },
      {
        heading: '集訓',
        items: [
          {
            // trainingCamp.js:15 CAMP_SEASONS={FIRST:2,SECOND:3}；:172-180 campPlanFor
            term: '一輩子只有兩次',
            desc: '升上二年級前、升上三年級前各一次。第一次補技術＋練屬性，第二次練屬性＋選默契對象。',
          },
          {
            // trainingCamp.js:65-79 CAMP_ATTR_TRAINING：耐力 +2 上限 80；控球 gain/cap 為 null
            term: '練得動的只有耐力',
            desc: '耐力每次 +2、到 80 為止。控球那格會寫「尚未開放」——那不是 bug，是還沒定案。',
          },
          {
            // trainingCamp.js:198-218 pendingCampSlots：提醒但不強制攔阻
            term: '沒領會提醒你',
            desc: '有能點沒點的東西，離開前會列出來——但不會擋你走。',
          },
          {
            // trainingCamp.js:8-9,232-239：默契目前零效果，只記 chemistry.focusId
            term: '默契目前只是記錄',
            desc: '選了誰只會被記下來，還沒有實際作用——文案不騙你。',
          },
        ],
      },
      {
        heading: '轉位',
        items: [
          {
            // positionEvents.js:13 TALK_CANDIDATES（不含 outside）；:25-42 positionTalkFor
            term: '屆間教練會來問',
            desc: '賽季之間教練會找你談，勸你轉二傳、攔中、對角或自由人。婉拒不扣任何東西，下個屆間他還會再問。',
          },
          {
            // positionEvents.js:15-19 TRANSFER_CANDIDATES 含 outside，且只走玩家主動請調
            term: '想轉回主攻要自己開口',
            desc: '教練不會勸你回主攻。生涯畫面的「🚪 去找教練」是你自己提的那條路，回任 OH 只走這裡。',
          },
          {
            // positionEvents.js:186-256 transferCandidates 閘門：本屆滿 3 場、每屆一次、與屆間談話互斥
            term: '每屆一次',
            desc: '賽季中請調要先打滿 3 場，而且一屆只能用一次——跟屆間談話共用同一次額度。',
          },
        ],
      },
      {
        heading: '逐出隊友',
        items: [
          {
            // recruitment.js:667-680 canExpel：僅招募生、不在先發/自由人位、每屆 1 人
            term: '能逐的很有限',
            desc: '只能逐你自己招來的人，不能逐現役先發或自由人，而且一屆最多一個。',
          },
          {
            // careerScreen.js:1208 原文；recruitment.js:21 EXPEL_TRUST_PENALTY=5；careerStore.js:325-354
            term: '代價寫在按鈕上',
            desc: '逐出後果：全隊信任 −5・本屆不可再逐・那支對手隊也不可再招。',
          },
        ],
      },
      {
        heading: '賽程與輪轉',
        items: [
          {
            // schedule.js:258-275 buildSchedule；:14-18 RR 三場、RR_ADVANCE=2
            term: '一屆最多 8 場',
            desc: '地區小組 3 場 → 全國八強 4 隊單循環 3 場（取前二晉級）→ 準決賽 → 決賽。循環賽輸球不會直接止步。',
          },
          {
            // schedule.js:250-256 matchFormatOf：決賽 bo5、準決/宿敵 bo3、其餘 bo1
            term: '局數不一樣',
            desc: '決賽五局三勝、準決賽與宿敵戰三局兩勝，其餘一局定生死。',
          },
          {
            // graduation.js:14-29 三年級畢業、其餘 +1；careerFinale.js 三屆定格
            term: '高中就三年',
            desc: '打完三屆就是生涯結算。三年級隊友每屆畢業離隊，新生會補進來。',
          },
          {
            // rotationRules.js:35-93 POSITIONAL_FAULT；game.js:911-924 發球瞬間檢查；pointBanner.js:39 字卡
            term: '站位犯規',
            desc: '發球擊球的那一瞬間，六個人的前後左右順序必須合法，違反就直接失分，畫面會跳「🚫 站位犯規」。照系統帶位走通常踩不到。',
          },
        ],
      },
    ],
  },
];

// ════════════════════════════════════════════════════════════════
// 渲染層
// ════════════════════════════════════════════════════════════════

// 分頁式（手機優先）：頁籤橫向可捲、內容區直向捲；點「關閉」回原畫面。
// 沿 careerScreen.js showCareerTotals 的覆蓋層形狀（z-index 36／safe center／明鈕關閉——
// U1 07-30 拍板移除「點任意處關閉」，此處比照）。
// 這一頁該顯示哪些段落（純函式，可測）。
// `mode` 未標＝兩種模式都適用；標了就只在該模式出現。
// ★ 為什麼要有這個維度 ★ 2026-08-13 事故：整頁「基本操作」是照 classic 模式的蓄力鈕寫的，
// 但 simpleMode 下那顆鈕根本不會被建立（`matchStage.js:68`）⇒ 說明頁在教一個
// 畫面上不存在的東西。分模式之後，玩家只會看到自己那一套。
export function sectionsFor(tab, simple = true) {
  const want = simple ? 'simple' : 'classic';
  return (tab?.sections ?? []).filter((s) => s.mode == null || s.mode === want);
}

// simple 預設值走 `matchConfig.isSimpleMode` 這個單一真相源——不得在這裡自己再判一次
// `classic`（那正是兩份文案各自猜模式、猜錯了也沒人知道的原因）。
// `globalThis.location?.` ＝測試的假 DOM 沒有 location（不是防禦性程式碼，是真的會 undefined）
export function showHowToPlay(
  simple = isSimpleMode(new URLSearchParams(globalThis.location?.search ?? '')),
) {
  const overlay = el('div', [
    'position:fixed', 'inset:0', 'z-index:37', 'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:flex-start', 'overflow:hidden',
    `background:${COLOR.bg}`, `color:${COLOR.text}`,
    'font-family:system-ui,sans-serif', 'user-select:none',
    'padding:calc(env(safe-area-inset-top, 0px) + 18px) 12px 0',
  ]);
  // 背景誤觸不關頁（同 showCareerTotals 的 stopPropagation）
  overlay.addEventListener('pointerdown', (e) => e.stopPropagation());

  overlay.appendChild(el('div', [
    'font-size:20px', 'font-weight:900', `color:${COLOR.gold}`, 'letter-spacing:3px',
    'flex:none',
  ], '❓ 怎麼玩'));
  overlay.appendChild(el('div', [
    'font-size:12px', `color:${COLOR.dim}`, 'letter-spacing:1px', 'margin-top:2px',
    'flex:none',
  ], '隨時可以回來查——選一個主題'));

  // 頁籤列：橫向可捲（手機上四個頁籤放不下時不擠成兩行）
  const tabRow = el('div', [
    'display:flex', 'gap:8px', 'margin:12px 0 10px', 'flex:none',
    'overflow-x:auto', 'max-width:min(560px, 96vw)', 'padding-bottom:4px',
  ]);
  // 內容區：只有這一塊捲動，頁籤永遠看得到
  const body = el('div', [
    'flex:1', 'min-height:0', 'overflow-y:auto', 'width:min(560px, 96vw)',
    'display:flex', 'flex-direction:column', 'gap:10px',
    'padding-bottom:calc(env(safe-area-inset-bottom, 0px) + 88px)',
  ]);

  const tabs = [];
  function renderTab(index) {
    for (let i = 0; i < tabs.length; i += 1) {
      const on = i === index;
      tabs[i].style.cssText = tabCss(on);
    }
    body.replaceChildren();
    for (const sec of sectionsFor(HOW_TO_PLAY[index], simple)) {
      const card = el('div', [
        `background:${COLOR.card}`, 'border-radius:12px', 'border:1px solid #2c3a58',
        'padding:11px 15px', 'text-align:left', 'display:flex', 'flex-direction:column',
        'gap:7px',
      ]);
      card.appendChild(el('div', [
        'font-size:13px', 'font-weight:800', `color:${COLOR.cyan}`, 'letter-spacing:2px',
      ], sec.heading));
      for (const item of sec.items) {
        const row = el('div', ['display:flex', 'flex-direction:column', 'gap:2px']);
        row.appendChild(el('div', [
          'font-size:13.5px', 'font-weight:700', `color:${COLOR.gold}`,
        ], item.term));
        row.appendChild(el('div', [
          'font-size:12.5px', `color:${COLOR.dim}`, 'line-height:1.65',
        ], item.desc));
        card.appendChild(row);
      }
      body.appendChild(card);
    }
  }

  for (let i = 0; i < HOW_TO_PLAY.length; i += 1) {
    const t = el('button', [], HOW_TO_PLAY[i].title);
    t.style.cssText = tabCss(i === 0);
    t.addEventListener('pointerdown', (e) => { e.stopPropagation(); renderTab(i); });
    tabs.push(t);
    tabRow.appendChild(t);
  }
  overlay.appendChild(tabRow);
  overlay.appendChild(body);

  // 關閉鈕固定在底部（內容很長，捲到一半也要關得掉——手機上這是主要退出路徑）
  const close = el('button', [
    'position:fixed', 'left:50%', 'transform:translateX(-50%)',
    'bottom:calc(env(safe-area-inset-bottom, 0px) + 18px)', 'z-index:38',
    'height:44px', 'padding:0 28px', 'border-radius:22px', 'border:1px solid #2c3a58',
    'background:rgba(12,18,32,0.96)', `color:${COLOR.text}`, 'font-size:14px',
    'cursor:pointer', 'touch-action:manipulation', 'font-family:system-ui,sans-serif',
  ], '關閉');
  close.addEventListener('pointerdown', (e) => { e.stopPropagation(); overlay.remove(); });
  overlay.appendChild(close);

  renderTab(0);
  document.body.appendChild(overlay);
  return overlay;
}

function tabCss(active) {
  return [
    'height:36px', 'padding:0 14px', 'border-radius:18px', 'flex:none',
    'font-size:13px', 'font-weight:700', 'cursor:pointer', 'touch-action:manipulation',
    'font-family:system-ui,sans-serif', 'letter-spacing:1px',
    active
      ? `border:1px solid ${COLOR.gold};background:${COLOR.gold};color:#1a1405`
      : `border:1px solid #2c3a58;background:transparent;color:${COLOR.dim}`,
  ].join(';');
}
