// 多年職業生涯卷 批 5「退休謝幕總結卡」（2026-08-27）
// 驗收＝docs/kickoffs/acceptance-multiyear-batch5.md（D1–D5，動手前凍結 d4e8850）。
// 治具沿 multiyear-pro-batch2.test.mjs 同款（正式鏈＋假 DOM）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { proBaseSalaryFor, proTeamById } from '../src/career/proTeams.js';

// ════════════════════════════════════════════════════════════════
// 共用治具（同批 1 測試檔）
// ════════════════════════════════════════════════════════════════
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function playRoundRobin(storage, round, results = null) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const games = c.schedule.filter((m) => m.round === round);
  s.saveCareer({
    ...c,
    results: results ?? games.map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
}

function loseOutSeason(storage) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  playRoundRobin(storage, 'pro', c.schedule
    .filter((m) => m.round === 'pro')
    .map((m) => ({
      matchId: m.id, opponentId: m.opponentId, won: false,
      scoreFor: 0, scoreAgainst: 2, gp: 1,
    })));
}

function winLeagueThenPlayoffs(storage, playoffResults) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  playRoundRobin(storage, 'pro', c.schedule
    .filter((m) => m.round === 'pro')
    .map((m) => ({
      matchId: m.id, opponentId: m.opponentId, won: true,
      scoreFor: 2, scoreAgainst: 0, gp: 3,
    })));
  for (const won of playoffResults) {
    const s2 = createCareerStore(storage);
    const c2 = s2.loadCareer();
    const next = c2.schedule.find((m) => m.round !== 'pro' && !c2.results.some((r) => r.matchId === m.id));
    assert.ok(next, 'fixture 前提：季後賽場次已長出');
    s2.saveCareer({
      ...c2,
      results: [...c2.results, {
        matchId: next.id, opponentId: next.opponentId, won,
        scoreFor: won ? 2 : 0, scoreAgainst: won ? 0 : 2, gp: won ? 3 : 1,
      }],
    });
  }
}

function settledUniSave(schoolId = 'meixi') {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 101, playerName: '小夢' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 3;
  raw.roster = { capacity: 12, members: buildStarterMembers(), alumni: [] };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  createCareerStore(storage).enterUniversity(schoolId);
  for (let y = 1; y < 4; y += 1) {
    playRoundRobin(storage, 'league');
    assert.ok(createCareerStore(storage).advanceSeason(), `fixture 前提：第 ${y} 年推進成功`);
  }
  playRoundRobin(storage, 'league');
  assert.ok(createCareerStore(storage).settleUniFinale(), 'fixture 前提：U4 結算成功');
  return storage;
}

function proSaveInProgress(teamId = 'cangyu-titans') {
  const storage = settledUniSave();
  assert.ok(createCareerStore(storage).enterCorporate('chaoxi-marine'), 'fixture 前提：入企業章成功');
  playRoundRobin(storage, 'corp');
  assert.ok(createCareerStore(storage).settleCorpFinale(), 'fixture 前提：企業季結算成功');
  assert.ok(createCareerStore(storage).enterPro(teamId), 'fixture 前提：入職業章成功');
  return storage;
}

function settledProYear1(teamId = 'cangyu-titans') {
  const storage = proSaveInProgress(teamId);
  loseOutSeason(storage);
  assert.ok(createCareerStore(storage).settleProFinale(), 'fixture 前提：職業首季結算成功');
  return storage;
}

const saveOf = (storage) => JSON.parse(storage.getItem(SAVE_KEY));

/** 把存檔降級成職業章單年版舊形狀（08-26 上線版：無 contract、封存無 proFinish）。 */
function degradeToLegacy(storage) {
  const raw = saveOf(storage);
  delete raw.career.contract;
  raw.career.seasons = raw.career.seasons.map((sn) => {
    if (!sn.pro) return sn;
    const { proFinish, salary, ...rest } = sn;
    return rest;
  });
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
}

// ════════════════════════════════════════════════════════════════
// D1/D2/D3 wiring
// ════════════════════════════════════════════════════════════════
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
    replaceChildren(...nodes) { this.children = []; for (const n of nodes) this.appendChild(n); },
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
const allText = () => walk(globalThis.document.body).map((n) => n.textContent ?? '').join('｜');
const settle = () => new Promise((r) => { setTimeout(r, 0); });
const findBtn = (re) => walk(globalThis.document.body)
  .find((n) => n.tag === 'button' && re.test(n.textContent ?? ''));

async function renderScreen(storage) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const screen = createCareerScreen(createCareerStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
  // 吃掉開場劇情卡（沿 pro-batch3-wiring 慣例）
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
}


/** 冠軍一年→續約→全敗一年→退休（兩年職業生涯，冠軍數 1）。 */
async function twoYearRetiredSave() {
  const storage = proSaveInProgress('cangyu-titans');
  winLeagueThenPlayoffs(storage, [true, true]);
  assert.ok(createCareerStore(storage).settleProFinale(), '前提：Y1 冠軍季結算');
  assert.ok(createCareerStore(storage).advanceSeason(), '前提：推進 Y2');
  loseOutSeason(storage);
  assert.ok(createCareerStore(storage).settleProFinale(), '前提：Y2 結算');
  assert.ok(createCareerStore(storage).retirePro(), '前提：退休');
  return storage;
}

test('D2 退休態：收束佔位有謝幕鈕【壞版自證條】；開卡冪等純顯示；重看可開', async () => {
  const storage = await twoYearRetiredSave();
  await renderScreen(storage);
  const finaleBtn = findBtn(/生涯謝幕/);
  assert.ok(finaleBtn, '退休態要有謝幕鈕（無實作＝這裡紅）');
  const snap = storage.getItem(SAVE_KEY);
  tap(finaleBtn); tap(finaleBtn); // 連點
  await settle();
  const cards = walk(globalThis.document.body)
    .filter((n) => /年職業生涯/.test(n.textContent ?? ''));
  assert.equal(cards.length, 1, '重入旗標＝單卡');
  assert.equal(storage.getItem(SAVE_KEY), snap, '開卡不寫檔');
  // 返回後重看
  const overlayRoot = walk(globalThis.document.body)
    .find((n) => (n.handlers?.pointerdown ?? []).length
      && walk(n).some((c) => /生涯謝幕・職業歲月/.test(c.textContent ?? '')));
  assert.ok(overlayRoot, '找得到謝幕卡 overlay');
  tap(overlayRoot);
  await settle();
  tap(findBtn(/生涯謝幕/));
  await settle();
  assert.match(allText(), /生涯謝幕・職業歲月/, '重看可開');
});

test('D1 謝幕卡內容：逐年列（隊名/名次/季後賽標籤/年薪）＋冠軍數合計；退休態收尾句', async () => {
  const storage = await twoYearRetiredSave();
  await renderScreen(storage);
  tap(findBtn(/生涯謝幕/));
  await settle();
  const text = allText();
  assert.match(text, /2 年職業生涯/);
  assert.match(text, /第 1 年・蒼羽泰坦/);
  assert.match(text, /🏆 冠軍/, 'Y1 冠軍標籤');
  assert.match(text, /第 2 年・蒼羽泰坦/);
  assert.match(text, /未進季後賽/, 'Y2 標籤');
  assert.match(text, /年薪 \d+ 萬/, '薪水曲線');
  assert.match(text, /職業合計：1 冠/, '冠軍數＝proFinish 計數');
  assert.match(text, /你選擇在還能跳的時候放下球/, '退休態收尾句');
  assert.ok(!/undefined/.test(text), '不得出現 undefined');
  assert.ok(!/第 4 屆/.test(text), '非職業封存不進謝幕卡');
});

test('D1 舊檔缺 salary＝隊階底薪回退；D3 滿十年態收尾句不同', async () => {
  const storage = proSaveInProgress('cangyu-titans');
  const raw0 = saveOf(storage);
  raw0.season.index = raw0.career.chapter.enteredAtSeason + 9; // 直接末季
  storage.setItem(SAVE_KEY, JSON.stringify(raw0));
  loseOutSeason(storage);
  assert.ok(createCareerStore(storage).settleProFinale());
  const raw = saveOf(storage);
  delete raw.career.seasons.at(-1).salary; // 模擬舊檔缺薪
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  await renderScreen(storage);
  const finaleBtn = findBtn(/生涯謝幕/);
  assert.ok(finaleBtn, '滿十年（未退休）也要有謝幕鈕——批 2 覆審 M1 的族群');
  tap(finaleBtn);
  await settle();
  const text = allText();
  assert.match(text, new RegExp(`年薪 ${proBaseSalaryFor(proTeamById('cangyu-titans'))} 萬`), '缺薪回退隊階底薪');
  assert.ok(!/undefined/.test(text), '不得出現 undefined');
  assert.match(text, /把一個聯賽從天花板打成了自己的地板/, '滿十年態收尾句');
  assert.ok(!/你選擇在還能跳的時候放下球/.test(text), '兩態不同句');
});

test('D2 未收束（續約窗）無謝幕鈕；D3 佔位句已清', async () => {
  const storage = settledProYear1();
  await renderScreen(storage);
  assert.ok(!findBtn(/生涯謝幕/), '續約窗不得出現謝幕鈕');
  const src = await readFile(new URL('../src/ui/careerScreen.js', import.meta.url), 'utf-8');
  assert.ok(!src.includes('謝幕儀式・敬請期待'), '佔位句必須被真入口取代');
});
