// 大學卷 批 1 — B1-3 接線：「▶ 生涯結算」按鈕受章節控制（2026-08-14）
// 驗收＝`docs/kickoffs/acceptance-uni-batch1.md`（動手前凍結）。
//
// ★ 為什麼要走真的 UI 路徑 ★ 純函式測試只證明「章節值存得住」，證明不了
// 「畫面真的會依它改變」。這一檔跑正式的 `createCareerScreen`，真的去看那顆按鈕
// 在不在——不掃原始碼字串（`bquickButton` 就是「定義了但沒被喚起」而從上線起
// 一次沒出現過，掃字串會誤判成通過）。
//
// ★ 鑑別力 ★ 三個案例互為對照：
//   ① 高中章＋三屆打完 ⇒ 出現（現行行為，證明測試抓得到「出現」）
//   ② 大學章       ⇒ 不出現（本批要修的 bug）
//   ③ 高中章但沒打完 ⇒ 不出現（證明條件不是恆真）
// 只有 ② 的話，一支「永遠不畫按鈕」的假實作也會綠。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { enterUniversity } from '../src/career/chapter.js';

const FINALE_BTN = /生涯結算/;

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 形狀沿 tests/practice-wiring.test.mjs 的假 DOM（同源，避免兩份替身漂移）
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

/**
 * 造一份存檔。
 * @param seasonIndex 賽季序號
 * @param eliminated  true＝加一場國賽淘汰賽敗場（careerStage ⇒ 'eliminated'，
 *                    見 careerState.js:101-105：淘汰賽敗且 round !== 'rr'）
 * @param university  true＝章節推進到大學
 */
async function seededSave({ seasonIndex, eliminated, university = false }) {
  const { SAVE_KEY } = await import('../src/career/careerStore.js');
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 4242, playerName: '小夢' });
  if (eliminated) {
    career.schedule = [
      ...career.schedule,
      { id: 'ko-1', stage: 'national', round: 'qf', opponentId: 'iron-mist', label: '八強' },
    ];
    career.results = [...career.results, { matchId: 'ko-1', won: false, scoreA: 18, scoreB: 25 }];
  }
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  // 屆數：正常路徑要賽季結束才推進，這裡直接改（同 practice-wiring 的治具手法）——
  // 改完仍走 deserializeSave 的完整驗證，讀出來是合法存檔
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = seasonIndex;
  if (university) raw.career = enterUniversity(raw.career, seasonIndex);
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
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
  // ★ 先把賽後劇情對話點完 ★ 有未消化的比賽結果時，renderCareer 會先播劇情事件
  // （「▼ 點擊繼續」），生涯視圖被蓋在後面——玩家本來就要點掉才看得到。
  // 不點的話 body 裡只有對話文字，「按鈕不出現」會**假通過**（第一次寫就踩到）。
  for (let i = 0; i < 12; i += 1) {
    const cont = walk(globalThis.document.body).find((n) => /點擊繼續/.test(n.textContent ?? ''));
    if (!cont) break;
    tap(cont);
    // 泡泡掛在祖先上時 handler 不在文字節點本身——往上找一層有 pointerdown 的
    if (!(cont.handlers?.pointerdown ?? []).length) {
      let p = cont.parent;
      while (p && !(p.handlers?.pointerdown ?? []).length) p = p.parent;
      if (p) tap(p); else break;
    }
    await settle();
  }
  return allText(globalThis.document.body);
}

test('B1-3① 高中章＋三屆打完 ⇒ 生涯結算按鈕出現（現行行為，證明測試抓得到）', async () => {
  const text = await renderAndGetText(await seededSave({ seasonIndex: 3, eliminated: true }));
  assert.match(text, FINALE_BTN, '抓不到按鈕的話，②的「不出現」就毫無意義');
});

test('★B1-3② 核心★ 大學章 ⇒ 生涯結算按鈕不得出現', async () => {
  const text = await renderAndGetText(
    await seededSave({ seasonIndex: 3, eliminated: true, university: true }),
  );
  assert.doesNotMatch(text, FINALE_BTN,
    '★這正是本批要修的 bug★ 已經在念大學了還跳「三年的一切」＝系統分不出章節');
});

test('B1-3③ 高中章但沒打完 ⇒ 不出現（證明條件不是恆真）', async () => {
  const text = await renderAndGetText(await seededSave({ seasonIndex: 2, eliminated: true }));
  assert.doesNotMatch(text, FINALE_BTN);
});

test('★反向對照★ 同一份存檔只差章節值，結果就相反（差異真的來自章節）', async () => {
  const hs = await renderAndGetText(await seededSave({ seasonIndex: 3, eliminated: true }));
  const uni = await renderAndGetText(
    await seededSave({ seasonIndex: 3, eliminated: true, university: true }),
  );
  assert.match(hs, FINALE_BTN);
  assert.doesNotMatch(uni, FINALE_BTN);
});
