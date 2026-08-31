# 統一敘事卷 kickoff（2026-08-31 晚場）

Sawmah 提議（真實感卷檔尾）：打手出界／吞下去／晃過攔網＝「攻擊方戰勝攔網」三情境，
做成同一族字卡＋播報。純表現層、零 sim 改動。

## 台灣用語查證（web 查證 agent，出處留 memory 分卷）

- 打手出界：有實據（Decathlon 教學文）；PTT 俚語「打噴」。
- 「吞下去」：查無出處；台灣圈「吞球」另指攔網連續觸球的規則例外（語意不同）；
  本情境 PTT 實際用語＝「中洞」（偏兩人牆中間的洞）、「燒腋毛」（戲謔）。
- 晃過攔網／總稱（打穿攔網、破攔）：查無固定講法。

## Sawmah 拍板（2026-08-31 AskUserQuestion 四題）

1. 歸族方式＝**丙：統一視覺不加前綴**——三卡同色框（#ffd166）同時長（2200ms）同音效，
   各自保留現名；播報同句型。總稱不自創。
2. 「球被吞下去了」**維持**（他定的詞；「吞球」他義不混淆）。
3. （批6 收尾同輪裁定，記於 balance-recal kickoff：X 接受為設計身分、B6-5 修正追認。）

## 現況盤點

- 晃過：heroCards.js「🎭 晃過攔網！」#ffd166/2200 ＋ commentary「被晃過去了！」✓
- 吞下去：matchLoop BLOCK_SWALLOW「🕳 球被吞下去了！」#ffd166/2200；**無播報**
- 打手出界：只有 highlightReplay 重播字卡（netDuelQualify 'tool'）；**無即時字卡、無播報**
  ——連線（重播關）與演出偏好 off 時整個情境無回饋

## 落地項

- N1 打手出界即時字卡「✋ 打手出界！」#ffd166/2200，掛 netDuelFire outcome='tool' 當下
  （與重播共存；重播不放的場合也看得到）
- N2 播報補齊同句型：tool→「{攻擊手} 借手得分！」（主詞＝攻擊手，補存 lastSpikeTouch）；
  swallow→「{spikerId} 這球吞進去了！」；deceived 既有句不動
- N3 家族視覺一致性以測試釘住（三卡同 color/dur）

## 驗收凍結（動手前訂）

- V1 npm test 全綠；新測試：①tool SCORE 時字卡含「打手出界」②三族卡 color/dur 逐值相同
  ③commentary 收 BLOCK_SWALLOW 出含攻擊手名的「吞」句、收 NET_DUEL_TOOL 出「借手」句
- V2 `src/sim/` 零檔案改動；sim-hash 逐值同基準（0a948ad2）
- V3 文案最終由 Sawmah 試玩裁定（品味誠實條款）；句字全【試玩必調】
