// Phase 2 stage 4 — 輕量劇情事件（決策第 9 題：資料驅動事件表，不硬寫 if）
// 賽前/賽後對話框＋隊友 trust 事件（文字、無立繪）；Phase 3 完整劇情在此表上長
// when 條件全宣告式；effect.trust 經 sim trust.js updateTrust 調整持久 baseline
import { nextMatch } from './careerState.js';

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
  {
    id: 'nationals',
    moment: 'pre',
    when: { matchId: 'national-qf' },
    lines: [
      { speaker: '教練', text: '全國賽，單淘汰——輸一場就收隊回家。放開打，別留手。' },
    ],
  },
  {
    id: 'rematch',
    moment: 'pre',
    when: { matchId: 'national-sf' },
    lines: [
      { speaker: '隊長（MB）', text: '曜石。他們記得你小組賽怎麼打的——這次他們是衝著你來的。' },
      { speaker: '二傳（S）', text: '那正好。小組賽的帳，今天當面算。' },
    ],
  },
];

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
