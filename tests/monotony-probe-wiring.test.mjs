// 單調治療探針卷 批 1 — M3/M4 接線（2026-08-26）
// 驗收＝`docs/kickoffs/acceptance-probe-batch1.md`（凍結 0aaff0c）。
// 假 DOM 形狀沿 tests/corp-entry-wiring.test.mjs（同源，避免替身漂移）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { clearCampPending } from '../src/career/trainingCamp.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function fakeDom() {
  const make = (tag = 'div') => ({
    tag,
    style: { cssText: '' },
    textContent: '',
    value: '',
    dataset: {},
    children: [],
    handlers: {},
    disabled: false,
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    remove() { this.parent?.removeChild(this); },
    addEventListener(ev, fn) { (this.handlers[ev] ||= []).push(fn); },
    removeEventListener(ev, fn) {
      this.handlers[ev] = (this.handlers[ev] ?? []).filter((f) => f !== fn);
    },
    // ★與 chapter-wiring 同源替身的一處修正★ 原版 replaceChildren 忽略參數——
    // showMatchupScreen 用 lineupOverlay.replaceChildren(card) 掛整張對陣卡，
    // 忽略參數＝卡被靜默丟棄（M3 實跑抓到）。既有測試都沒帶參數呼叫、不受影響。
    replaceChildren(...kids) {
      this.children = [];
      for (const k of kids) this.appendChild(k);
    },
    setAttribute() {},
    getAttribute() { return null; },
    focus() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() {
      return { top: 0, left: 0, width: 100, height: 100, bottom: 0, right: 0 };
    },
  });
  globalThis.document = {
    createElement: (t) => make(t),
    createTextNode: (t) => ({ textContent: t }),
    body: make('body'),
    head: make('head'),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = {
    innerWidth: 400,
    innerHeight: 700,
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 0; };
}

const tap = (node) => {
  for (const fn of [...(node.handlers?.pointerdown ?? [])]) fn({ stopPropagation() {} });
};
const walk = (node, out = []) => {
  out.push(node);
  for (const c of node.children ?? []) walk(c, out);
  return out;
};
const allText = (root) => walk(root).map((n) => n.textContent ?? '').join('｜');
const settle = () => new Promise((r) => { setTimeout(r, 0); });
const findBtn = (re) => walk(globalThis.document.body)
  .find((n) => n.tag === 'button' && re.test(n.textContent ?? ''));

/** 已簽約磐石重工、打了 played 場的企業存檔（含指定 scouting）。 */
function corpSave({ played = 0, scouting = null, thisOppZones = null } = {}) {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 99, playerName: '小夢' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 3;
  raw.roster = { capacity: 12, members: buildStarterMembers(), alumni: [] };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  const s = createCareerStore(storage);
  s.enterUniversity('meixi');
  const play = () => {
    const c = s.loadCareer();
    const league = c.schedule.filter((m) => m.round === 'league');
    s.saveCareer({
      ...c,
      results: league.map((m, i) => ({
        matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
        scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
      })),
    });
  };
  for (let y = 1; y < 4; y += 1) {
    play();
    assert.ok(s.advanceSeason(), `fixture 前提：第 ${y} 年推進成功`);
  }
  play();
  const player = s.loadPlayer();
  clearCampPending(player);
  s.savePlayer(player);
  assert.ok(s.settleUniFinale());
  assert.ok(s.enterCorporate('panshi-heavy'));
  const c = s.loadCareer();
  const games = c.schedule.filter((m) => m.round === 'corp');
  const sc = scouting ? { ...scouting } : {};
  if (thisOppZones && played > 0) sc[games[played - 1].opponentId] = { zones: thisOppZones };
  s.saveCareer({
    ...c,
    scouting: sc,
    results: games.slice(0, played).map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
  return { storage, games };
}

// 聚合被盯線＝直線（60%）的球探素材。
// ★ 用合成 id，不用 sky-hawk 等真實隊 id ★ 真實 id 會在 renderCareer 誤觸宿敵/
// 劇情事件鏈（實跑抓到：卡出一張空對話卡）——聚合只吃 zones 加總，id 無所謂；
// 真實存檔的宿敵事件在高中章早已入帳，fixture 直接注入才會出現這種假影（02 §6.1-3）。
const LINE_HEAVY = {
  'probe-a': { zones: { line: 20, cross: 6, middle: 2, tip: 2 } },
  'probe-b': { zones: { line: 16, cross: 8, middle: 4, tip: 2 } },
};

/** render 並沿途累積所有出現過的文字（對話泡泡點掉前也記下來）。 */
async function renderAccumulate(storage) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const { createCareerStore: mkStore } = await import('../src/career/careerStore.js');
  const screen = createCareerScreen(mkStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
  let acc = allText(globalThis.document.body);
  for (let i = 0; i < 15; i += 1) {
    const cont = walk(globalThis.document.body).find((n) => /點擊繼續/.test(n.textContent ?? ''));
    if (!cont) break;
    let p = cont;
    while (p && !(p.handlers?.pointerdown ?? []).length) p = p.parent;
    if (p) tap(p); else break;
    await settle();
    acc += `｜${allText(globalThis.document.body)}`;
  }
  return acc;
}

// ════════════════════════════════════════════════════════════════
// M3 賽前盯線句（對陣卡，兩態）
// ════════════════════════════════════════════════════════════════
test('M3① 有慣性聚合 ⇒ 對陣卡點名被盯的線', async () => {
  const { storage } = corpSave({ played: 0, scouting: LINE_HEAVY });
  await renderAccumulate(storage);
  tap(findBtn(/出戰/));
  await settle();
  const text = allText(globalThis.document.body);
  assert.match(text, /聯賽球探研究過你/, '球探建檔警告要在');
  assert.match(text, /盯上你的直線/, '要點名具體線路');
});

test('M3② 零紀錄 ⇒ 盯線句不得出現（不嚇唬沒有慣性的玩家）', async () => {
  const { storage } = corpSave({ played: 0 });
  await renderAccumulate(storage);
  tap(findBtn(/出戰/));
  await settle();
  const text = allText(globalThis.document.body);
  assert.doesNotMatch(text, /球探研究過你/);
  assert.match(text, /VS|確認出戰/, '對照：對陣卡本身要正常渲染');
});

// ════════════════════════════════════════════════════════════════
// M4 賽後甩開句（postEvs 鏈，兩態）
// ════════════════════════════════════════════════════════════════
test('M4① 整場躲開被盯線 ⇒ 甩開句播出並入帳', async () => {
  const { storage, games } = corpSave({
    played: 1, scouting: LINE_HEAVY,
    thisOppZones: { line: 0, cross: 6, middle: 3, tip: 1 }, // 直線 0%
  });
  const acc = await renderAccumulate(storage);
  assert.match(acc, /球探報告在第一局就過期/, '甩開句要在賽後對話裡出現');
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  assert.ok(save.season.events.includes(`corp-shakeoff-${games[0].id}`), '入帳＝一場一次');
});

test('M4② 被盯線照打 ⇒ 不播、不入帳', async () => {
  const { storage, games } = corpSave({
    played: 1, scouting: LINE_HEAVY,
    thisOppZones: { line: 6, cross: 3, middle: 1, tip: 0 }, // 直線 60%
  });
  const acc = await renderAccumulate(storage);
  assert.doesNotMatch(acc, /球探報告在第一局就過期/);
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(save.season.events.includes(`corp-shakeoff-${games[0].id}`), false);
});
