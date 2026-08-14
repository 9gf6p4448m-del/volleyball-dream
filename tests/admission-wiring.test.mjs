// 大學卷 批 5 — B5-6 接線：升學畫面只列出成績開得出來的學校（2026-08-14）
// 驗收＝`docs/kickoffs/acceptance-uni-batch5.md`。
//
// ★ 為什麼要走真的 UI 路徑 ★ `tests/university.test.mjs` 已經證明
// `admissibleSchoolsFor` 會篩——但那證明不了**畫面真的吃了它**。本批最容易寫出的
// 假通過就是「資料層篩得漂亮，畫面照樣列九所」。這一檔跑正式的 `createCareerScreen`，
// 真的去數畫面上有幾所學校（假 DOM 形狀沿 tests/chapter-wiring.test.mjs，同源不漂移）。
//
// ★ 鑑別力 ★ 兩個案例互為對照：亞軍存檔 9 所／小組出局存檔 3 所。
// 只驗一邊的話，一支「永遠列全部」或「永遠只列弱校」的實作都會有一半綠。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { UNIVERSITIES } from '../src/career/universities.js';
import { TIER } from '../src/career/admission.js';

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
const nodeWith = (re) => walk(globalThis.document.body)
  .find((n) => re.test(n.textContent ?? '') && (n.handlers?.pointerdown ?? []).length);
const allText = () => walk(globalThis.document.body).map((n) => n.textContent ?? '').join('｜');
const settle = () => new Promise((r) => { setTimeout(r, 0); });

/**
 * 造一份第 3 屆結束的存檔。
 * @param koId 國賽敗場的場次 id：`national-final`＝亞軍（九所全開）；
 *             `ko-1`（不在國賽階梯上）＝沒打進淘汰賽＝小組出局（只剩弱校）。
 *             ★ 兩者都讓 careerStage 判為 eliminated（round !== 'rr'）★
 *             ——差別只在 `seasonFinishOf` 讀不讀得到那個 id，正是本批要驗的那條線。
 */
async function seededStorage(koId) {
  const { SAVE_KEY } = await import('../src/career/careerStore.js');
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 4242, playerName: '小夢' });
  career.schedule = [
    ...career.schedule,
    { id: koId, stage: 'national', round: koId === 'ko-1' ? 'qf' : 'final', opponentId: 'iron-mist', label: '決賽' },
  ];
  career.results = [...career.results, { matchId: koId, won: false, scoreA: 20, scoreB: 25 }];
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 3;
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  return storage;
}

async function openAdmission(storage) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const screen = createCareerScreen(createCareerStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
  // 賽後劇情對話要先點完，否則生涯視圖被蓋著（chapter-wiring 踩過這個假通過）
  for (let i = 0; i < 12; i += 1) {
    const cont = walk(globalThis.document.body)
      .find((n) => /點擊繼續/.test(n.textContent ?? ''));
    if (!cont) break;
    let target = cont;
    while (target && !(target.handlers?.pointerdown ?? []).length) target = target.parent;
    if (!target) break;
    tap(target);
    await settle();
  }
  const btn = nodeWith(/決定升學志願/);
  assert.ok(btn, '找不到「▶ 決定升學志願」按鈕——入口沒接上，下面的斷言全部失去意義');
  tap(btn);
  await settle();
}

const schoolsOnScreen = () => {
  const text = allText();
  return UNIVERSITIES.filter((u) => text.includes(u.name));
};

test('★B5-6① 亞軍存檔 ⇒ 升學畫面列出九所（含強豪）', async () => {
  await openAdmission(await seededStorage('national-final'));
  const shown = schoolsOnScreen();
  assert.equal(shown.length, 9, `畫面上只有 ${shown.length} 所`);
  assert.ok(shown.some((u) => u.tier === TIER.POWERHOUSE));
  assert.match(allText(), /全國亞軍/);
});

test('★B5-6② 核心★ 小組出局存檔 ⇒ 只列三所弱校（畫面真的吃了候選集合）', async () => {
  await openAdmission(await seededStorage('ko-1'));
  const shown = schoolsOnScreen();
  assert.equal(shown.length, 3, `畫面上有 ${shown.length} 所——候選集合沒被畫面吃進去`);
  assert.ok(shown.every((u) => u.tier === TIER.WEAK), '小組出局卻看得到強豪／中段');
  assert.match(allText(), /小組賽止步/);
});

test('★B5-6③ 反向對照★ 同一支畫面，兩份不同成績的存檔列出不同的學校數', async () => {
  await openAdmission(await seededStorage('national-final'));
  const many = schoolsOnScreen().map((u) => u.id).sort().join(',');
  await openAdmission(await seededStorage('ko-1'));
  const few = schoolsOnScreen().map((u) => u.id).sort().join(',');
  assert.notEqual(many, few, '兩份成績天差地遠卻列出同一批學校＝畫面根本沒看成績');
});

test('B5-6④ 卡片可點：選擇→確認→存檔真的記住了（畫面不是擺飾）', async () => {
  const storage = await seededStorage('ko-1');
  await openAdmission(storage);
  assert.equal(createCareerStore(storage).loadSchool(), null, '還沒選就有志願＝這條恆真');
  const pick = nodeWith(/就決定是這裡/);
  assert.ok(pick, '卡片上沒有可點的選擇鈕');
  tap(pick);
  await settle();
  // 二次確認：先按「再想想」要回得去（不可逆的決定不能一鍵完成）
  const back = nodeWith(/再想想/);
  assert.ok(back, '缺二次確認');
  tap(back);
  await settle();
  assert.equal(createCareerStore(storage).loadSchool(), null, '按了「再想想」卻已經寫進存檔');
  tap(nodeWith(/就決定是這裡/));
  await settle();
  tap(nodeWith(/確定就是這裡/));
  await settle();
  const picked = createCareerStore(storage).loadSchool();
  assert.ok(picked, '確認後存檔仍然沒有志願');
  assert.equal(createCareerStore(storage).loadChapter().id, 'university');
  assert.match(allText(), /新生報到/);
});

test('B5-6⑤ 已選校的存檔重開 ⇒ 顯示升學已定、不再出現升學入口', async () => {
  const storage = await seededStorage('ko-1');
  await openAdmission(storage);
  tap(nodeWith(/就決定是這裡/));
  await settle();
  tap(nodeWith(/確定就是這裡/));
  await settle();
  const picked = createCareerStore(storage).loadSchool();

  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  createCareerScreen(createCareerStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  }).show('career');
  await settle();
  for (let i = 0; i < 12; i += 1) {
    const cont = walk(globalThis.document.body).find((n) => /點擊繼續/.test(n.textContent ?? ''));
    if (!cont) break;
    let t = cont;
    while (t && !(t.handlers?.pointerdown ?? []).length) t = t.parent;
    if (!t) break;
    tap(t);
    await settle();
  }
  const text = allText();
  assert.ok(text.includes(UNIVERSITIES.find((u) => u.id === picked).name), '沒顯示已選的學校');
  assert.match(text, /升學已定/);
  assert.doesNotMatch(text, /決定升學志願/, '已經升學了還讓他再選一次');
});
