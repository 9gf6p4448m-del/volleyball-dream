// Phase 2 stage 3 — 成長引擎（純函式；零 DOM/存檔 IO）
// 雙層成長（決策第 2 題）：表現給點數、玩家分配——
// 屬性層（次要）＝+1 微調維持真實感；技術層（主要）＝解鎖新決策選項

export const GROWTH = {
  BASE_POINTS: 2,       // 出賽保底（場次保障成長點數的累積循環——輸球也有）
  WIN_BONUS: 2,
  KILL_POINT: 1,        // 殺球/吊球直接得分
  ACE_POINT: 1,
  BLOCK_POINT: 1,       // 攔網得分
  PERFECT_PER_POINT: 2, // 每 2 次 Perfect 一傳折 1 點
  MATCH_CAP: 12,        // 單場上限（防灌分）
  ATTR_STEP: 1,
  ATTR_CAP: 90,         // 屬性成長天花板（100 留給傳奇；維持真實感）
  TIP_POWER: 0.45,      // 吊球判定界線（與 pointBanner/commentary 同）
};

// 屬性層可加點清單（control/stamina 不開放：前者是手感基準、後者 stage 未接線）
// desc（07-24 Sawmah：玩家不知道加點強化什麼）＝sim 實際接線的誠實描述——
// power→spikeSpeed、jump→spikeReach/blockReach、reaction→起動/出界判斷/讀攔網檔位/
// 接球技術(與 control 平均)、speed→moveSpeed/defenseRange、serve→發球散佈、block→攔網成功率
export const GROWABLE_ATTRS = [
  { key: 'power', name: '力量', desc: '扣球球速——重扣更快更難救' },
  { key: 'jump', name: '彈跳', desc: '起跳高度——扣球點與攔網都更高' },
  { key: 'reaction', name: '反應', desc: '起動更快、出界判斷更準、讀攔網更清、一傳更穩' }, // blockReadTier 來源
  { key: 'speed', name: '速度', desc: '跑速與防守範圍——追得到更多球' },
  { key: 'serve', name: '發球', desc: '發球落點更準——跳發/飄浮也穩' },
  { key: 'block', name: '攔網', desc: '攔網成功率——攔死與擦手機率' },
];

// 技術層（生涯新人全鎖起步；快速比賽預設全開）——經故事線傳授習得，不花點數
// （改版裁定 2026-07-22：每場賽後對手/隊長教一招；成長點數專注屬性層）
export const TECH_DEFS = [
  { key: 'tip', name: '吊球', desc: '攻擊面板新增「吊球」——騙重心的輕放' },
  { key: 'dive', name: '魚躍救球', desc: '來不及的球自動飛撲救起——撲空會倒地' },
  { key: 'pipe', name: '後排 pipe', desc: '輪到後排也能主導進攻（後排攻擊面板）' },
  { key: 'floatServe', name: '飄浮發球', desc: '不轉的球最難接——破壞對方一傳品質' },
  { key: 'feint', name: '假動作', desc: '按A滑B視線騙攔網；越用越純熟' },
  { key: 'jumpServe', name: '跳躍發球', desc: '最強的發球——力量換準度' },
  // 組合攻擊卷 段 E（07-31 Sawmah 裁定）：叫戰術改由技術傳授解鎖，不硬綁屆數——
  // 解鎖不是重點，**教學才是**（新玩家第一次看到「交叉」要有人告訴他那是什麼）。
  // 閘門走 matchConfig.resolveTechGates 的 canCallPlay（同 pipe 先例）
  // 2026-08-03 修：入口與招式清單都過期了——死球窗入口卷五 §六 已整條拆除（改在
  // 一傳起來、球飛向你的那段下指令）；夾塞出廠關閉（TANDEM_PLAY_RATE=0 ＋
  // CALL_OFFERS_FACTORY_OFF_TYPES=false）玩家結構上叫不出來；而真正叫得出來的 B快沒提。
  // 2026-08-07 再修：**「當二傳時」也過期了**。這道閘現在同時管三個入口——
  //   ① S 的分配面板（⚡ 指令：交叉攻擊／時間差／B快）
  //   ② OH 前排的「↘ 內切」浮鈕（08-07 起吃這道閘，先前完全沒閘、第 1 屆就能按）
  //   ③ OPP 前排的「🤝 夾塞」浮鈕（08-06 夾塞解封後的專屬線，08-07 上線）
  // 描述改成「不分位置都有一個決定」，因為現在確實如此；三個入口共用同一個布林。
  { key: 'callPlay', name: '叫戰術', desc: '一傳起來後下戰術指令：二傳叫組合（交叉／時間差／B快）、主攻按內切、對角按夾塞' },

  // 大學卷批 7（2026-08-24）：大學章專屬傳授的兩招。這一卷的靈魂＝
  // 「高中是我把球打好，大學是我讓對面打不好」——兩招都是作用在對手身上的技術。
  //
  // ★ 壓手攔網的代價在**押方向**，不在時機（B7-3，2026-08-24 修訂）★
  //   它只能經 MB 讀心面板的「壓手封直線／壓手封斜線」送出：想用 press 就得自己
  //   押一邊，放棄 blockPlanTargetX（ai.js:2009）的 AI 讀球判斷。押錯＝牆站錯邊，
  //   press 連擦頂的機會都摸不到。
  //   ⚠ 不要改成「獨立的壓手鈕」——時機軸經 08-03 實測證明整條都是負的
  //   （tools/block-timing-oracle-probe.mjs：按早 ≥12 tick 一律 −6.2～−13.7pp），
  //   而沒有代價的壓手＝純增益的假抉擇。理由全文在 acceptance-uni-batch7.md 的 B7-3。
  { key: 'pressBlock', name: '壓手攔網', desc: '攔網時手伸過網面把擦頂的球壓回去——但必須自己押封線方向，押錯就整面落空' },
  { key: 'chaseServe', name: '追發', desc: '發球指名對方後排某一個人——專打接發最弱的那位' },

  // 職業章批 4a（2026-08-26）：職業章專屬傳授——靈魂句「高中是我把球打好、大學是我讓對面
  // 打不好、職業是我決定對手看到什麼」。機制全長在探針卷地基上（scoutBlockMul 反常線折扣
  // 既有 0.6 倍，本批零新 sim 判定）——這招只是把「對手眼中的你」變成**可見**，
  // 解鎖前對陣卡/面板零新增元素（見 acceptance-pro-batch4a.md D1）。
  {
    key: 'baitLine',
    name: '餵線',
    desc: '看見「對手眼中的你」——全生涯扣打分佈與對手將押的線都現形，關鍵分故意打冷門線，吃反常線折扣',
  },

  // 職業章批 4b（改叫，2026-08-26，拍板 B2）：批 4a 的靈魂句換個方向講——
  // 「職業是我決定對手看到什麼」講的是情報戰；這一招講的是**地位**：不分位置，
  // 職業老手在網前也有下指令的份量。盤點證實 AI 二傳的組合選擇是當下抽籤
  // （CROSS_PLAY_RATE 等），沒有顯式叫牌可覆蓋 ⇒ 拍板重用既有 applyReplanCall
  // 通道，把組合指令（交叉／時間差／B快，同 S 的⚡面板選項集合）開放給非 S 位置。
  // 閘門走**新的一把**（matchConfig.resolveTechGates 的 canAudible）——不與
  // `callPlay` 共用：那把管的是既有三入口（S 面板／OH 內切／OPP 夾塞），這裡是
  // 第四個入口，各自的解鎖時序不該綁死在一起。
  // 代價（acceptance-pro-batch4b.md E3）：改叫那一波沒得分＝信任扣加倍，得分不
  // 另給獎勵——地位是掙來的，不是按鈕給的。
  {
    key: 'audible',
    name: '改叫',
    desc: '非二傳位置也能在窗內直接下組合指令（交叉／時間差／B快）——地位是掙來的，那一波沒得分，信任扣加倍',
  },
];

// 從 sim 事件日誌統計玩家表現（歸因法與 pointBanner 同：得分前最後觸球者）
export function matchStatsFor(events, playerId, myTeam) {
  const stats = { kills: 0, tipKills: 0, aces: 0, blockPoints: 0, perfects: 0, spikes: 0 };
  let lastTouch = null;
  for (const e of events) {
    if (e.type === 'TOUCH' || e.type === 'SERVE') {
      lastTouch = { playerId: e.playerId, team: e.team, kind: e.kind ?? 'serve', power: e.power };
      if (e.type === 'TOUCH' && e.playerId === playerId) {
        if (e.kind === 'spike') stats.spikes += 1;
        if (e.kind === 'receive' && (e.power ?? 0) >= 0.95) stats.perfects += 1;
      }
    } else if (e.type === 'BLOCK_TOUCH') {
      lastTouch = { playerId: e.playerId, team: e.team, kind: 'block' };
    } else if (e.type === 'SCORE') {
      if (
        e.team === myTeam && lastTouch &&
        lastTouch.team === myTeam && lastTouch.playerId === playerId
      ) {
        if (lastTouch.kind === 'spike') {
          if ((lastTouch.power ?? 1) <= GROWTH.TIP_POWER) stats.tipKills += 1;
          else stats.kills += 1;
        } else if (lastTouch.kind === 'serve') stats.aces += 1;
        else if (lastTouch.kind === 'block') stats.blockPoints += 1;
      }
      lastTouch = null; // 死球歸零，下一分重新歸因
    }
  }
  return stats;
}

export function growthPointsFor(stats, won) {
  const raw =
    GROWTH.BASE_POINTS +
    (won ? GROWTH.WIN_BONUS : 0) +
    (stats.kills + stats.tipKills) * GROWTH.KILL_POINT +
    stats.aces * GROWTH.ACE_POINT +
    stats.blockPoints * GROWTH.BLOCK_POINT +
    Math.floor(stats.perfects / GROWTH.PERFECT_PER_POINT);
  return Math.min(raw, GROWTH.MATCH_CAP);
}

// 讀攔網提示檔位（決策第 4 題：綁能力值）：reaction 低＝無、中＝慢（0.6s 才上色）、高＝即時
export function blockReadTier(player) {
  const r = player.attributes.reaction;
  return r < 55 ? 'none' : r < 70 ? 'slow' : 'instant';
}

// W7.1 屆間訓練營（試玩回饋 07-24 #6 拍板 C 案）：stamina 不進逐場灑點（A5 拍板
// 六項成長槽不動），改走屆間事件——每屆 +2、上限 80（低於 ATTR_CAP＝耐力天花板
// 略保守，保留建隊個性差異：自由人 70 天生鐵肺的相對優勢不被磨平）。只加主角
export const OFFSEASON = { STAMINA_GAIN: 2, STAMINA_CAP: 80 };
export function applyOffseasonTraining(player) {
  const cur = player.attributes.stamina ?? 50;
  return {
    ...player,
    attributes: {
      ...player.attributes,
      stamina: Math.min(OFFSEASON.STAMINA_CAP, cur + OFFSEASON.STAMINA_GAIN),
    },
  };
}

// 職業章批 3（C4）：PRO 章天花板 100（「100 留給傳奇」兌現，見 GROWTH.ATTR_CAP 註解）；
// 其餘章節維持 90，逐值不變。
// ★ 單一入口 ★ 呼叫端（growth.js 自己與 UI 層）一律問 `attrCapFor()`，不得各自另判
// 「章節是不是 pro」再挑數字——那會讓天花板散落多處各自維護（凍結驗收 C4）。
// ★ 為什麼吃布林參數，不是直接 `import { isPro } from './chapter.js'` ★ growth.js 是
// 最底層的純函式模組（本檔向來零 import）；而 `chapter.js → roster.js → growth.js`
// 已經有一條依賴鏈（`chapter.js` 讀 `roster.js` 的 `OUR_TEAM_NAME`，`roster.js` 讀本檔
// 的 `GROWABLE_ATTRS`），growth.js 若反過來 import chapter.js 會成環。呼叫端（如
// `careerScreen.js`）自己用 `isPro(chapter)` 算好布林餵進來即可，維持本檔零依賴。
export const PRO_ATTR_CAP = 100;
export function attrCapFor(isProChapter = false) {
  return isProChapter ? PRO_ATTR_CAP : GROWTH.ATTR_CAP;
}

// 屬性層加點（不可變；1 點＝+1，天花板走 attrCapFor——省略第三參數＝非職業章的 90，
// 既有呼叫端／測試斷言零遷移）
export function spendAttribute(player, key, isProChapter = false) {
  if (!GROWABLE_ATTRS.some((a) => a.key === key)) {
    throw new Error(`spendAttribute：不可加點的屬性 ${key}`);
  }
  const cap = attrCapFor(isProChapter);
  const cur = player.attributes[key];
  if (cur >= cap) throw new Error(`spendAttribute：${key} 已達上限 ${cap}`);
  return {
    ...player,
    attributes: { ...player.attributes, [key]: Math.min(cap, cur + GROWTH.ATTR_STEP) },
  };
}

// 技術層解鎖（不可變）；點數扣減由呼叫端管（career.growthPoints）
export function unlockTechnique(player, key) {
  const def = TECH_DEFS.find((t) => t.key === key);
  if (!def) throw new Error(`unlockTechnique：未知技術 ${key}`);
  if ((player.techniques?.[key] ?? 0) >= 1) throw new Error(`unlockTechnique：${def.name} 已解鎖`);
  const techniques = { ...player.techniques, [key]: 1 };
  if (key === 'feint') techniques.feintUses = techniques.feintUses || 0; // 熟練度從 0 累積
  return { ...player, techniques };
}
