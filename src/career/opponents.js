// Phase 2 stage 2 — 對手參數檔（純資料；數值差×風格差）
// trait＝識別特徵：供劇情層與情蒐錄影帶（stage 5）引用；賽前敵情一行字
// scoutRead＝情蒐讀取強度（0-1：讀你的慣用線收攏攔網；弱隊不讀）
// level＝全屬性基準；attrBias＝全隊屬性偏移；roleBias＝角色屬性偏移；
// trustBias＝舉球分配傾向（疊在基準 trust 上）；heights＝六槽身高
// （槽序同 lineup：S/OH/MB/OPP/OH/MB）；ai＝風格機率（皆決定論 hash 消費）
// 命名工程定案（2026-07-25 拍板「方向 C 意象字號」；同日 v2 台灣自然化——Sawmah 回饋
// 初版太中國風）：姓氏一律台灣常見姓、意象字只用真實人名會出現的字，每人名帶一個字族字
// ——北原=穩定字(澄正定律衡恆安)／白浪=水字(泓濤灝洋澤瀚沐)／曜石=石字(石磊曜峻岳碩)／
// 青嵐=風水字(嵐浚澔昊汐澎帆)／鐵霧=鋼鐵字(錚銘鎮鎧鋒鑫銓)／黑松=木字(楠樺松柏楷森杉)／
// 天鷹=飛翔字(鴻翔鵬騰羽昇)。squad＝六先發全名（槽序同 heights：S/OH/MB/OPP/OH/MB）、
// libero＝自由人全名、ace＝{ slot, name, title }（slot 0-5 對 squad、'L'＝自由人；
// 王牌＝招募招牌球員本人——RECRUIT_DEFS 暱稱與此處全名同一人，挖角敘事的一致性錨點；
// 暱稱分兩型：名字錨定（阿曜/小嵐…取自名中字）與隊魂外號（小浪/阿鐵/阿鷹…取自球風隊名））
//
// Phase 4 W1 年級系統（憲法 Q1/Q3/Q4；2026-07-26 拍板）：
// grades＝六先發「第 1 屆基準年級」（槽序同 squad）、liberoGrade＝自由人年級；
// 現行年級＝基準 + (屆數−1)，賽季推進不改本檔（純參數檔，屆數換算在 careerState）。
// 三年級 ace 名單（2026-07-30 試玩回饋 D1 修訂）＝詹子曜（第 1 屆末畢業→遞補換臉）；
//   青嵐簡子嵐／黑松曾家松原為三年級「登場即畢業」，回饋 #5「畢業無感」拍板降為
//   1 年級＝與玩家同期成長、第二三屆再戰（ace.grows＝跨屆吃成長曲線，見 aceGrowth.js）；
//   王勝翔讓位宿敵後降為 2 年級（W4 題6）。
// 資料不變式（tests/grades 把關）：非 ace 的 squad/libero/reserves 基準年級一律 ≤2
//   ——擋「畢業了卻因無 49 人輪替而繼續出賽」的還魂矛盾；招募目標年級由本檔導出
//   （recruitment.recruitGradeOf），條件越苛者年級越低（Q3）。
// reserves（W1 擴充 2→4，A1 對手板凳＋Q4 ace 遞補同一批資料）：
//   { name, role, grade, drop, title? }——role＝換人/遞補的對位；drop＝上場時
//   相對 def.level 的能力降幅（弱隊板凳落差大、強隊小＝板凳深度差異可感）；
//   title＝升格新 ace 時的稱號（僅指定接班人有，＝隊內 drop 最小者；接班人基準
//   年級一律 1——保證三屆生涯內不二次畢業）。applyPoaching／applySeasonRoster
//   （careerState）消費同一批，消耗後剩餘者＝該場對手板凳。
// Phase 5 W1 §6 B1 攔網人格（2026-07-29；憲法 §三 B 「強隊 read、弱隊 commit」）：
// ai.blockPersona＝'read'｜'commit'——**難度與隊伍個性從數值變成行為**的那一條。
//   read   ＝守住追球軸、等球離手才反應（＝本輪之前所有隊伍的既有行為，一行未動）
//   commit ＝不等二傳出手就跟死快攻；讀對＝中路封死，判錯＝晚一整段反應時間才動身、
//            邊線變單人攔網（交叉／兩翼就是解法）
// 分級以 level 為主軸（≥64 read／<64 commit），曜石體中是刻意的個性例外：
// level 60 卻 commit——「這隊 MB 攔網極快、中路是他們的天下」的 trait 本來就是
// 「賭中間」的打法，玩家該學會的是拿交叉去懲罰它，而不是硬扣中路。
// ★ 2026-07-29 Sawmah 拍板：commit 暫停派任；**開啟條件＝憲法 §十「讓 sim 誠實」落地**。
// 當時列的兩個結構障礙：
//   ① 攔網結算只認一個人 ⇒ §十-3 帶模型已修（牆＝區間聯集，多人涵蓋由幾何湧現）
//   ② 攔網手零反應延遲 ⇒ §十-2 已修（read 解鎖＝二傳觸球＋reactionTicks）
// ★ 2026-07-31 §十全卷（含十-4/十-4b）落地後試開實測：commit 的賭局已成立
//（P4 快攻列 commit 攔到 42.2% vs read 14.2%），但**全面開啟炸熔斷**——配對 Δ
//（基準檔 tools/balance-paired-baseline-commitflag.json）：Δgroup-3 −45.0±9.4、
// Δsf −30.0、Δg2 −25.0（單輪熔斷線 25pp 多輪突破）。原因＝§三 B「弱隊 commit」
// 的前提「commit＝只有代價的可懲罰個性」已被 §十 反轉成真武器，小組賽弱隊
// 全員升級。
// ★ 2026-07-31 Sawmah 裁定丙＝**曜石單隊先行**：只開憲法指定的個性例外（曜石體中，
// 「中路是他們的天下」trait 本來就是賭中間的打法，交叉/兩翼是解法——commit 對兩翼
// 只攔 2.6%），其餘維持 read；全面派任留給未來難度重校卷（重校 §三 B 分級表時
// 把 COMMIT_PERSONA_ENABLED 改回 true 並刪白名單）。
const COMMIT_PERSONA_ENABLED = false;
const COMMIT_ALLOWLIST = new Set(['obsidian']);
const persona = (p, id) => (COMMIT_PERSONA_ENABLED || COMMIT_ALLOWLIST.has(id) ? p : 'read');

export const OPPONENTS = [
  {
    id: 'north-tech',
    name: '北原工商',
    style: 'steady',
    trait: '紀律型隊伍——發球保守、失誤極少，節奏四平八穩',
    level: 52,
    attrBias: { control: 6 },
    roleBias: {},
    trustBias: {},
    heights: [1.80, 1.85, 1.92, 1.86, 1.83, 1.90],
    squad: ['杜品澄', '黃俊正', '張定豪', '羅律安', '紀子衡', '傅恆宇'],
    grades: [1, 2, 2, 1, 2, 1], // 杜品澄=1（招募 wins:3 最長線——Q3 條件越苛年級越低）
    libero: '顏廷安',
    liberoGrade: 2,
    reserves: [
      { name: '董律辰', role: 'outside', grade: 2, drop: 10 },
      { name: '馮定緯', role: 'middle', grade: 2, drop: 12 },
      { name: '施定衡', role: 'setter', grade: 1, drop: 9 },
      { name: '章正安', role: 'opposite', grade: 1, drop: 11 },
    ],
    ace: { slot: 0, name: '杜品澄', title: '節拍器' }, // S・隊長——一傳一舉把亂流理成直線
    scoutRead: 0,
    ai: { tipRate: 0.06, dumpRate: 0.04, floatServeRate: 0.25, diveRate: 0.03, blockPersona: persona('commit') }, // 控制系：飄浮發球、防守韌性低（少魚躍）
  },
  {
    id: 'white-wave',
    name: '白浪高中',
    style: 'defense',
    trait: '防守黏得可怕——救球救不完，還愛用吊球打亂你的節奏',
    level: 57, // 平衡治具 07-22：group-2 勝率 92%>group-1 86% 倒掛——加黏不加暴力
    attrBias: { reaction: 10, speed: 6, power: -4 },
    roleBias: {},
    trustBias: {},
    heights: [1.81, 1.84, 1.90, 1.85, 1.83, 1.89],
    squad: ['游承泓', '江昱濤', '溫子灝', '潘志洋', '涂政澤', '汪育瀚'],
    grades: [2, 1, 2, 2, 1, 2],
    libero: '蔡沐恩',
    liberoGrade: 1, // 招募 wins:2＋壯舉的跨屆長線——Q3 低年級（挖到可長用）
    reserves: [
      { name: '白泓睿', role: 'outside', grade: 2, drop: 9 },
      { name: '唐世澤', role: 'middle', grade: 2, drop: 11 },
      { name: '方瀚洋', role: 'setter', grade: 1, drop: 8 },
      { name: '田家沐', role: 'opposite', grade: 1, drop: 10 },
    ],
    ace: { slot: 'L', name: '蔡沐恩', title: '不沉之浪' }, // 自由人＝隊魂——球不落地是他唯一的信仰
    scoutRead: 0.25,
    ai: { tipRate: 0.22, dumpRate: 0.08, floatServeRate: 0.15, diveRate: 0.15, blockPersona: persona('commit') }, // 防守隊招牌：拚命魚躍、球不落地不放棄
  },
  {
    id: 'obsidian',
    name: '曜石體中',
    style: 'quick',
    trait: '這隊 MB 攔網極快、快攻又急又狠——中路是他們的天下',
    level: 60,
    attrBias: {},
    roleBias: { middle: { block: 10, jump: 8, power: 4 } },
    trustBias: { middle: 22 },
    heights: [1.83, 1.87, 1.98, 1.89, 1.85, 1.96],
    squad: ['石宇廷', '吳彥磊', '詹子曜', '鄭峻豪', '賴岳霖', '許嘉碩'],
    grades: [2, 1, 3, 2, 1, 2], // 詹子曜=3（拍板：第 1 屆兩度交手可招——「只能用一年」的正宗取捨）
    libero: '沈威宏',
    liberoGrade: 2,
    reserves: [
      { name: '古承岳', role: 'middle', grade: 1, drop: 4, title: '第二支箭' }, // 接班人
      { name: '薛宇碩', role: 'outside', grade: 2, drop: 9 },
      { name: '嚴子磊', role: 'opposite', grade: 1, drop: 9 },
      { name: '柳世峻', role: 'setter', grade: 2, drop: 10 },
    ],
    ace: { slot: 2, name: '詹子曜', title: '黑曜箭' }, // MB・阿曜——起跳永遠快你半拍
    scoutRead: 0.7,
    ai: { tipRate: 0.1, dumpRate: 0.1, jumpServeRate: 0.05, diveRate: 0.08, blockPersona: persona('commit', 'obsidian') }, // §6 B1 個性例外：中路是他們的天下＝賭中間（裁定丙唯一現役 commit）
  },
  // W6 A1 新隊①（level 55，北原↔白浪空檔）：變化球隊——身材矮、火力弱，
  // 靠球路變化（吊球/二次球/飄浮球）打亂節奏；攔網差＝扣過去很痛快
  {
    id: 'gale-shore',
    name: '青嵐水產',
    style: 'trick',
    trait: '球路花得要命——吊球、二次球、飄浮球輪番來，節奏全在他們手裡',
    level: 55,
    attrBias: { control: 8, power: -6, block: -4 },
    roleBias: { setter: { control: 6 } },
    trustBias: { setter: 6 },
    heights: [1.79, 1.83, 1.89, 1.84, 1.82, 1.87],
    squad: ['簡子嵐', '藍浚廷', '翁品澔', '柯宇昊', '余承汐', '郭家澎'],
    // 簡子嵐=1（2026-07-30 D1 拍板，原 3）：他不在第 1 屆賽程，玩家第 2 屆才第一次
    // 碰到他——那時他二年級、正在變強，第 3 屆再碰是三年級的完成版。同期成長線取代
    // 「登場即三年級」的換臉敘事（回饋 #5：畢業無感）
    grades: [1, 2, 2, 1, 1, 2],
    libero: '阮信帆',
    liberoGrade: 1,
    reserves: [
      { name: '侯俊帆', role: 'setter', grade: 1, drop: 5, title: '起風點' }, // 接班人
      { name: '邵子昊', role: 'middle', grade: 2, drop: 10 },
      { name: '龔明澔', role: 'outside', grade: 1, drop: 9 },
      { name: '苗浚澎', role: 'opposite', grade: 2, drop: 11 },
    ],
    // S・小嵐——亂流的正中央永遠是靜的；grows（N2）＝跨屆吃身高與能力曲線
    ace: { slot: 0, name: '簡子嵐', title: '颱風眼', grows: true },
    scoutRead: 0.15,
    ai: { tipRate: 0.28, dumpRate: 0.18, floatServeRate: 0.35, diveRate: 0.1, blockPersona: persona('commit') },
  },
  {
    id: 'iron-mist',
    name: '鐵霧工業',
    style: 'serve',
    trait: '發球輪就是他們的得分輪——強力發球連發，一傳頂不住就崩',
    level: 64,
    attrBias: { serve: 12, power: 4 },
    roleBias: {},
    trustBias: {},
    heights: [1.84, 1.89, 1.95, 1.91, 1.87, 1.93],
    squad: ['鍾子錚', '徐世銘', '盧鎮宇', '劉振鎧', '楊士鋒', '邱育鑫'],
    grades: [2, 2, 1, 2, 1, 2], // 劉振鎧=2（每屆僅八強一遇的長線目標——Q3 不設 3；第 2 屆末畢業）
    libero: '孫啟銓',
    liberoGrade: 2,
    reserves: [
      { name: '彭冠銘', role: 'opposite', grade: 1, drop: 4, title: '新彈道' }, // 接班人（第 3 屆升格）
      { name: '袁世鈞', role: 'middle', grade: 2, drop: 7 },
      { name: '賀鎮鑫', role: 'outside', grade: 1, drop: 6 },
      { name: '宋育銓', role: 'setter', grade: 2, drop: 8 },
    ],
    ace: { slot: 3, name: '劉振鎧', title: '鐵彈道' }, // OPP・阿鐵——王牌發球手，發球跟扣球一樣往死裡打
    scoutRead: 0.5,
    ai: { tipRate: 0.08, dumpRate: 0.06, jumpServeRate: 0.45, floatServeRate: 0.2, diveRate: 0.08, blockPersona: 'read' }, // 發球輪就是得分輪
  },
  // W6 A1 新隊②（level 67，鐵霧↔天鷹空檔）：高牆型——攔網手一排比一排高，
  // 正面硬扣會被一路蓋回來；腳步偏慢＝吊球與快節奏是解法
  {
    id: 'black-pine',
    name: '黑松實業',
    style: 'wall',
    trait: '高牆型隊伍——攔網手一排比一排高，硬扣過去的球都會被蓋回來',
    level: 67,
    attrBias: { block: 10, jump: 6, speed: -3 },
    roleBias: { middle: { block: 6 } },
    trustBias: { middle: 10 },
    heights: [1.86, 1.93, 2.01, 1.95, 1.91, 1.99],
    squad: ['呂宗楠', '蕭宇樺', '曾家松', '戴柏毅', '范育楷', '廖振森'],
    // 曾家松=1（2026-07-30 D1 拍板，原 3）：牆還沒砌完——第 2 屆碰到的是二年級的他、
    // 第 3 屆是三年級的他，一屆比一屆高。原「三年級最後一屆」悲壯設定廢止（回饋 #5）
    grades: [2, 1, 1, 2, 2, 1],
    libero: '朱以杉',
    liberoGrade: 2,
    reserves: [
      { name: '姚松霖', role: 'middle', grade: 1, drop: 4, title: '下一堵牆' }, // 接班人
      { name: '鄧柏宇', role: 'outside', grade: 2, drop: 6 },
      { name: '崔家楠', role: 'opposite', grade: 1, drop: 7 },
      { name: '巫宗森', role: 'setter', grade: 2, drop: 7 },
    ],
    // MB・老松——牆還在往上砌，一屆比一屆難翻過去；grows（N2）＝跨屆吃身高與能力曲線
    ace: { slot: 2, name: '曾家松', title: '未完成的牆', grows: true },
    scoutRead: 0.6,
    ai: { tipRate: 0.06, dumpRate: 0.05, jumpServeRate: 0.15, floatServeRate: 0.1, diveRate: 0.07, blockPersona: 'read' }, // 高牆型＝不賭、等你出手
  },
  {
    id: 'sky-hawk',
    name: '天鷹學園',
    // W4(P4) 題6 拍板：天鷹＝宿敵所屬（三屆三幕同屆宿敵的舞台）。隊級旗標供
    // 關鍵戰館主客場氛圍（橫幅/應援）、情蒐宿敵標記、L 2.0 ace 反讀（附錄 B-4）
    // 的隊判定共用；宿敵 ace 人設＝三案待 Sawmah 挑（快照存檔），選定落檔時：
    // ace 換宿敵（grade 1 同屆＋rival:true 豁免旗標）、王勝翔留 squad（招募語意不動）
    rival: true,
    style: 'power',
    trait: '全國決賽常客——兩翼重砲全面壓制，硬碰硬幾乎沒有勝算',
    level: 72,
    attrBias: { power: 6, jump: 5 },
    roleBias: { outside: { power: 6 } },
    trustBias: { outside: 8 },
    heights: [1.86, 1.88, 1.99, 1.94, 1.92, 1.97], // slot1 莊敬嶺 1.88（爬上來的高）／slot4 王勝翔 1.92
    // W4 題6 選案落檔（07-27 Sawmah 拍板 B 案「攀天者」）：宿敵莊敬嶺＝新 ace
    // （grade 1 與玩家同屆＋rival 豁免＝三年不滾、第 3 屆同屆畢業）；
    // 王勝翔讓 ace 移 slot 4——年級 3→2（還魂防線收束：非 ace 無遞補機制、grade 3
    // 會畢業後續出賽；「決賽擊敗即可招」條件不動＝招募從陪一年變陪兩年）；
    // 原 slot 4 周羽辰移 reserves。人設全文＝phase4-w4-status.md §7；台詞＝4.5 劇情輪
    squad: ['梁鴻宇', '莊敬嶺', '謝鵬翰', '李振騰', '王勝翔', '丁昱昇'],
    grades: [2, 1, 2, 2, 2, 2],
    libero: '蘇冠羽',
    liberoGrade: 1,
    reserves: [
      { name: '馬振羽', role: 'outside', grade: 1, drop: 3, title: '逐空者' },
      { name: '康宇鵬', role: 'middle', grade: 2, drop: 5 },
      { name: '雷俊昇', role: 'setter', grade: 1, drop: 4 },
      { name: '文鴻騰', role: 'opposite', grade: 2, drop: 6 },
      { name: '周羽辰', role: 'outside', grade: 1, drop: 5 }, // 讓位莊敬嶺（W4 題6）
    ],
    ace: { slot: 1, name: '莊敬嶺', title: '攀天者', rival: true }, // 宿敵——把牆砌得更高的人
    scoutRead: 0.9,
    ai: { tipRate: 0.1, dumpRate: 0.08, jumpServeRate: 0.25, floatServeRate: 0.1, diveRate: 0.13, blockPersona: 'read' }, // 強隊全能：積極魚躍
  },
];

export function opponentById(id) {
  return OPPONENTS.find((o) => o.id === id) ?? null;
}
