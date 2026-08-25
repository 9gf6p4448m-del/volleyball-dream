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
import { CORP_PAYDAY_EV } from '../src/career/corpEvents.js';
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
function u4Save({ settled, school = 'meixi' }) {
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
  s.enterUniversity(school);
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

// ════════ 批 3（acceptance-corp-batch3.md A3-2/A3-4）════════
/** 已簽約的企業存檔；played 控制打了幾場（7＝賽季全打完）。 */
function corpSave(played) {
  const storage = u4Save({ settled: true });
  const s = createCareerStore(storage);
  assert.ok(s.enterCorporate('panshi-heavy'), 'fixture 前提：簽約成功');
  const c = s.loadCareer();
  const games = c.schedule.filter((m) => m.round === 'corp');
  s.saveCareer({
    ...c,
    results: games.slice(0, played).map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
  return storage;
}

test('A3-2① 企業 7/7 打完 ⇒ 名次＋收尾卡入口出現、出戰消失', async () => {
  const text = await renderAndGetText(corpSave(7));
  assert.match(text, /聯賽第 \d 名|企業聯賽冠軍/, '名次要顯示');
  assert.match(text, /賽季落幕/, '收尾卡入口要在');
});

test('A3-2② 企業 6/7 未打完 ⇒ 照舊出戰、名次結算不得出現', async () => {
  const storage = corpSave(6);
  // 批 4 之後的季中常態＝薪水卡已答過（A4-2 的「卡會出現」有自己的專測；
  // 這條凍結守的是「賽季未完→出戰、無結算」，先把批 4 的閘答掉以隔離關注點）
  createCareerStore(storage).corpPaydayChoice(false);
  const text = await renderAndGetText(storage);
  assert.match(text, /出戰/);
  assert.doesNotMatch(text, /賽季落幕/);
});

test('A3-4 企業章不得出現大學殘留：「回看三年的數據」與「🎓 謝幕」', async () => {
  const text = await renderAndGetText(corpSave(3));
  assert.doesNotMatch(text, /回看三年的數據/, '企業章要用「回看生涯數據」');
  assert.match(text, /回看生涯數據/);
  assert.doesNotMatch(text, /🎓 謝幕/, '大學謝幕鈕不得在企業章冒出（年限延長也一樣）');
});

// 批 2 覆審 MEDIUM 回歸：簽約後的生涯頁頭部說實話（公司名，不是舊大學）
test('簽約後 ⇒ 頭部顯示 🏢 公司名＋企業聯賽年份，不再是「升學已定」', async () => {
  const storage = u4Save({ settled: true });
  const s = createCareerStore(storage);
  assert.ok(s.enterCorporate('panshi-heavy'), 'fixture 前提：簽約成功');
  const text = await renderAndGetText(storage);
  assert.match(text, /🏢 磐石重工/, '頭部要是公司名');
  assert.match(text, /企業聯賽——第 1 年/);
  assert.doesNotMatch(text, /升學已定/, '舊大學文案不得殘留');
  assert.match(text, /出戰/, '企業賽季要落到出戰入口（不是死路）');
});

// ════════ 批 4（acceptance-corp-batch4.md A4-1/A4-2/A4-4）════════
const findBtn = (re) => walk(globalThis.document.body)
  .find((n) => n.tag === 'button' && re.test(n.textContent ?? ''));
const tapDialogs = async () => {
  for (let i = 0; i < 15; i += 1) {
    const cont = walk(globalThis.document.body).find((n) => /點擊繼續/.test(n.textContent ?? ''));
    if (!cont) break;
    let p = cont;
    while (p && !(p.handlers?.pointerdown ?? []).length) p = p.parent;
    if (p) tap(p); else break;
    await settle();
  }
};

test('A4-1 完整簽約流程 ⇒ 入社卡含合約敘事、存檔為企業章', async () => {
  const storage = u4Save({ settled: true });
  await renderAndGetText(storage);
  // 走真流程：前往下一個舞台 → 選秀唱名（dialog 點掉）→ 邀約自選 → 簽約 → 入社卡
  tap(findBtn(/前往下一個舞台/));
  await settle();
  await tapDialogs();
  const sign = findBtn(/簽這一家/);
  assert.ok(sign, '邀約卡要出現（保底隊恆有）');
  tap(sign);
  await settle();
  tap(findBtn(/簽約/));
  await settle();
  const text = allText(globalThis.document.body);
  assert.match(text, /入社報到/);
  assert.match(text, /合約/, 'A4-1 合約敘事要在入社卡上');
  assert.match(text, /薪水|職員/, '薪水/社會人語意至少一句');
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(save.career.chapter.id, 'corporate', '流程走完＝真的入章');
});

test('A4-2 第 2 場後薪水卡出現；選請客 ⇒ +2＋旗標＋不重播', async () => {
  const storage = corpSave(2);
  const text = await renderAndGetText(storage);
  assert.match(text, /第一份薪水/, '薪水卡要出現');
  // ★ before 在 render 之後讀 ★ 未消化的賽後劇情事件在 render 時先套 trust 效果
  //（fireEvents），render 前讀會把那段也算進薪水加成（實跑抓到 33!==31）
  const before = JSON.parse(storage.getItem(SAVE_KEY)).player.trust.fromSetter;
  tap(findBtn(/請全隊吃一頓/));
  await settle();
  // 選後的餘韻卡點掉
  const note = walk(globalThis.document.body).find((n) => /點擊繼續/.test(n.textContent ?? ''));
  let p = note;
  while (p && !(p.handlers?.pointerdown ?? []).length) p = p.parent;
  if (p) tap(p);
  await settle();
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(save.player.trust.fromSetter, Math.min(100, before + 2));
  assert.ok(save.season.events.includes(CORP_PAYDAY_EV));
  const text2 = allText(globalThis.document.body);
  assert.doesNotMatch(text2, /第一份薪水/, '選完重繪不得重播');
});

test('A4-2b 只打 1 場 ⇒ 薪水卡不出現', async () => {
  const text = await renderAndGetText(corpSave(1));
  assert.doesNotMatch(text, /第一份薪水/);
});

test('A4-4 收尾卡：海外點名恆在；簡子嵐句依大學名冊封存兩態', async () => {
  // 態一：meixi（大學隊無簡子嵐）
  await renderAndGetText(corpSave(7));
  tap(findBtn(/賽季落幕/));
  await settle();
  let text = allText(globalThis.document.body);
  assert.match(text, /海外|另一邊/, '國外強權點名（海外語意）');
  assert.doesNotMatch(text, /簡子嵐/);
  // 態二：haiyan（簡子嵐同隊四年 → 封存名冊含他）
  const storage = u4Save({ settled: true, school: 'haiyan' });
  const s2 = createCareerStore(storage);
  assert.ok(s2.enterCorporate('panshi-heavy'));
  const c = s2.loadCareer();
  const games = c.schedule.filter((m) => m.round === 'corp');
  s2.saveCareer({
    ...c,
    results: games.map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
  assert.ok(JSON.parse(storage.getItem(SAVE_KEY)).career.uniRoster.members
    .some((m) => m.fullName === '簡子嵐'), 'fixture 前提：封存名冊含簡子嵐');
  await renderAndGetText(storage);
  tap(findBtn(/賽季落幕/));
  await settle();
  text = allText(globalThis.document.body);
  assert.match(text, /簡子嵐/, '同隊過的人，出海的消息要傳到');
});
