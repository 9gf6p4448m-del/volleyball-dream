// Phase 2 stage 4 — 輕量劇情事件（決策第 9 題：資料驅動事件表，不硬寫 if）
// 賽前/賽後對話框＋隊友 trust 事件（文字、無立繪）；Phase 3 完整劇情在此表上長
// when 條件全宣告式；effect.trust 經 sim trust.js updateTrust 調整持久 baseline
import { nextMatch } from './careerState.js';

// TODO(naming)：EVENT_DEFS / EXPEL_LINES / SEASON_OPENERS 內所有 speaker 角色代號
// （隊長（MB）、二傳（S）、各校角色…）與台詞均為佔位，命名工程統一潤稿定名
export const EVENT_DEFS = [
  {
    id: 'debut',
    moment: 'pre',
    when: { matchId: 'group-1' },
    lines: [
      { speaker: '隊長（MB）', text: '新人，第一場別想太多——球來了就打，其他交給我們。' },
      { speaker: '二傳（S）', text: '舉給你的球，放心打。打丟了算我的。' },
    ],
  },
  {
    id: 'mb-warn',
    moment: 'pre',
    when: { opponentId: 'obsidian', stage: 'group' },
    lines: [
      { speaker: '隊長（MB）', text: '曜石的中間手又快又急——中路封起來之前，別跟他硬碰。' },
    ],
  },
  {
    id: 'first-win',
    moment: 'post',
    when: { wonLast: true, playedCount: 1 },
    effect: { trust: 3 },
    lines: [
      { speaker: '二傳（S）', text: '打得不錯嘛，新人。下一場，關鍵分也敢給你了。' },
    ],
  },
  {
    id: 'first-loss',
    moment: 'post',
    when: { wonLast: false, lossCount: 1 },
    effect: { trust: 2 },
    lines: [
      { speaker: '二傳（S）', text: '別背著。輸球是全隊的事——下一顆，我照樣給你。' },
    ],
  },
  {
    id: 'hot-hand',
    moment: 'post',
    when: { minKills: 5 },
    effect: { trust: 4 },
    lines: [
      { speaker: '二傳（S）', text: '你手感燙起來了。之後的球，會更常到你手上。' },
    ],
  },
  // ---- 技術傳授線（改版裁定：技術經故事習得，每場一招；輸贏都教——敗者也有收穫）----
  {
    id: 'teach-tip',
    moment: 'post',
    when: { lastMatchId: 'group-1' },
    effect: { unlock: 'tip' },
    lines: [
      { speaker: '北原工商・隊長', text: '你只會全力打直球啊，新人。力量不夠的時候——用腦子打。' },
      { speaker: '北原工商・隊長', text: '看好，手腕放軟、指尖推球。這叫吊球。拿去用吧。' },
    ],
  },
  {
    id: 'teach-dive',
    moment: 'post',
    when: { lastMatchId: 'group-2' },
    effect: { unlock: 'dive' },
    lines: [
      { speaker: '白浪高中・自由人', text: '看到我們救了幾顆你們以為落地的球嗎？防守不是站著等球來。' },
      { speaker: '白浪高中・自由人', text: '撲出去。會痛，但球不會落地。這叫魚躍——送你了。' },
      // 主角傳承節點（拍板敘事：對手教主角→隊長請主角教全隊＝隊友 diveRate 解鎖的劇情面）
      { speaker: '隊長（MB）', text: '學到好東西了？回去教教大家——球不落地不結束，全隊都得會。' }, // TODO(naming)
    ],
  },
  {
    id: 'teach-pipe',
    moment: 'post',
    when: { lastMatchId: 'group-3' },
    effect: { unlock: 'pipe' },
    lines: [
      { speaker: '曜石體中・MB', text: '你的進攻只有前排三公尺。我們的進攻，是整片場地。' },
      { speaker: '曜石體中・MB', text: '後排起跳、攻擊線後起飛——pipe。學會它，你才算立體。' },
    ],
  },
  {
    id: 'teach-float',
    moment: 'post',
    when: { lastMatchId: 'national-qf' },
    effect: { unlock: 'floatServe' },
    lines: [
      { speaker: '鐵霧工業・王牌發球手', text: '光有力氣的發球，練十年也就那樣。最難接的球——是不轉的球。' },
      { speaker: '鐵霧工業・王牌發球手', text: '掌根擊球心、瞬間停腕。飄浮球會自己跳舞。' },
      // 主角傳承節點（同 teach-dive：隊友 floatServeRate 解鎖的劇情面）
      { speaker: '隊長（MB）', text: '那手飄浮球——回去也教教大家。發球輪多幾種武器。' }, // TODO(naming)
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
      { speaker: '曜石體中・隊長', text: '你的每一球，我們都記下來了。再遇到的時候——你那些慣用線，一條都過不了。' },
      { speaker: '曜石體中・隊長', text: '會被讀的人，才需要學騙。眼睛看左、手打右——當作見面禮，拿去。' },
    ],
  },
  {
    id: 'teach-jump',
    moment: 'pre',
    when: { matchId: 'national-final' },
    effect: { unlock: 'jumpServe' },
    lines: [
      { speaker: '隊長（MB）', text: '決賽了。把我壓箱的東西給你——跳躍發球，我們隊史上只有兩個人發得動。' },
      { speaker: '隊長（MB）', text: '助跑、拋球、當它是扣球打下去。去吧，把天鷹轟下來。' },
    ],
  },
  {
    id: 'nationals',
    moment: 'pre',
    when: { matchId: 'national-qf' },
    lines: [
      { speaker: '教練', text: '全國賽，單淘汰——輸一場就收隊回家。放開打，別留手。' },
    ],
  },
  // 宿敵差分（stage 5）：小組賽對曜石的勝敗決定再遇的對話——scouting 記憶同步生效
  {
    id: 'rematch-won',
    moment: 'pre',
    when: { matchId: 'national-sf', wonVs: 'obsidian' },
    lines: [
      { speaker: '隊長（MB）', text: '曜石。小組賽輸給我們之後，他們把你的每一球都看了三遍。' },
      { speaker: '二傳（S）', text: '他們衝著你來的。慣用的線路會被讀死——換節奏，或者用騙的。' },
    ],
  },
  {
    id: 'rematch-lost',
    moment: 'pre',
    when: { matchId: 'national-sf', lostVs: 'obsidian' },
    lines: [
      { speaker: '隊長（MB）', text: '又是曜石。小組賽欠他們一場——今天當面討回來。' },
      { speaker: '二傳（S）', text: '他們記得你怎麼打的。上次的套路不會再通——拿出新的東西。' },
    ],
  },
];

// ---- W5 逐出台詞（B5 拍板：2 行極簡，被逐者一行＋隊長一行，平靜克制）----
// 玩家主動點擊觸發（非賽程狀態驅動），故不進 EVENT_DEFS 條件比對；沿用 {speaker,text}
// 形狀以復用 dialogPlay（呼叫端包一層 [{ lines: EXPEL_LINES }]）。
export const EXPEL_LINES = [
  { speaker: '（離隊者）', text: '……我明白。這段路，謝謝你們帶我走過。' }, // TODO(naming)
  { speaker: '隊長（MB）', text: '是你自己選的路。走吧——別回頭。' }, // TODO(naming)
];

// ---- W5 賽季開場（A4 拍板：最小劇情，衛冕/捲土重來各一段隊長對話）----
// advanceSeason 成功後由 careerScreen 播放（衛冕＝defend、止步捲土重來＝comeback）。
export const SEASON_OPENERS = {
  defend: [
    { speaker: '隊長（MB）', text: '新的一屆了。冠軍的號碼掛在我們身上——全國都想把它摘下來。' }, // TODO(naming)
  ],
  comeback: [
    { speaker: '隊長（MB）', text: '輸掉的那場記著就好。名冊還在、你也更強了——這一屆，我們重新來過。' }, // TODO(naming)
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

// 取當下應觸發的事件（依表序；已觸發者不重複）。
// moment 'pre'＝出戰前（條件看下一場）；'post'＝賽後回到生涯畫面（條件看最後一場）
export function dueEvents(career, moment) {
  const triggered = career.events ?? [];
  const last = career.results[career.results.length - 1] ?? null;
  const next = nextMatch(career);
  return EVENT_DEFS.filter(
    (e) => e.moment === moment && !triggered.includes(e.id) &&
      matchesWhen(e.when, { career, last, next }),
  );
}

// 事件入帳（不可變）；career.events 為已觸發 id 清單（v3 相容：欄位缺席視同空）
export function recordEvent(career, id) {
  return { ...career, events: [...(career.events ?? []), id] };
}

function matchesWhen(when, { career, last, next }) {
  for (const [key, val] of Object.entries(when)) {
    switch (key) {
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
