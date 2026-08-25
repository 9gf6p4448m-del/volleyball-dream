// 成人/企業章 批 2 — A2-3 接線：「▶ 前往下一個舞台」入口受 finaleSettled 控制
// 驗收＝`docs/kickoffs/acceptance-corp-batch2.md`（A2-3，凍結 aa49e56）。
//
// ★ 為什麼走真的 UI 路徑 ★ 同 chapter-wiring.test.mjs：純函式測試證明不了
// 「畫面真的會依旗標改變」。兩個案例互為對照：
//   ① U4 打完＋已謝幕結算 ⇒ 入口出現
//   ② U4 打完＋未結算     ⇒ 不出現（謝幕先於下一章；一支「永遠畫按鈕」的假實作在②紅）
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { clearCampPending } from '../src/career/trainingCamp.js';

const ENTRY_BTN = /前往下一個舞台/;

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 形狀沿 tests/chapter-wiring.test.mjs 的假 DOM（同源，避免替身漂移）
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
    replaceChildren() { this.children = []; },
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

/** U4 打滿的存檔；settled 控制要不要跑謝幕結算（A2-3 的兩態）。 */
function u4Save({ settled }) {
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
  play(); // U4 打滿
  // 大四屆間集訓待辦先清掉（advanceSeason 批 5 會標 campPending，renderCareer 的
  // 集訓閘會先蓋整頁疊層——本測試驗的是入口按鈕，不是集訓流程）
  const player = s.loadPlayer();
  clearCampPending(player);
  s.savePlayer(player);
  if (settled) assert.ok(s.settleUniFinale(), 'fixture 前提：U4 結算成功');
  return storage;
}

async function renderAndGetText(storage) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const { createCareerStore: mkStore } = await import('../src/career/careerStore.js');
  const screen = createCareerScreen(mkStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
  // 賽後劇情泡泡先點完（同 chapter-wiring 的防假通過手法）
  for (let i = 0; i < 12; i += 1) {
    const cont = walk(globalThis.document.body).find((n) => /點擊繼續/.test(n.textContent ?? ''));
    if (!cont) break;
    tap(cont);
    if (!(cont.handlers?.pointerdown ?? []).length) {
      let p = cont.parent;
      while (p && !(p.handlers?.pointerdown ?? []).length) p = p.parent;
      if (p) tap(p); else break;
    }
    await settle();
  }
  return allText(globalThis.document.body);
}

test('A2-3① U4 打完＋已謝幕結算 ⇒「前往下一個舞台」出現', async () => {
  const text = await renderAndGetText(u4Save({ settled: true }));
  assert.match(text, ENTRY_BTN, '抓不到按鈕的話，②的「不出現」就毫無意義');
});

test('A2-3② U4 打完＋未結算 ⇒ 不出現（謝幕先於下一章）', async () => {
  const text = await renderAndGetText(u4Save({ settled: false }));
  assert.doesNotMatch(text, ENTRY_BTN);
  assert.match(text, /謝幕/, '對照：謝幕鈕本身要在（畫面沒壞，只是入口被旗標擋住）');
});
