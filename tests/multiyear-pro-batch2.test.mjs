// 多年職業生涯卷 批 2「續約迴圈 UI＋一次性回填」（2026-08-27）
// 驗收＝docs/kickoffs/acceptance-multiyear-batch2.md（B1–B8，動手前凍結 5bb3b3e）。
// store 段治具沿 multiyear-pro-batch1.test.mjs；wiring 段沿 pro-batch3-wiring.test.mjs
// （帶參數 replaceChildren 假 DOM——債清批教訓）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { proBaseSalaryFor, proRenewalSalaryFor, proTeamById, PRO_TEAMS } from '../src/career/proTeams.js';
import { TIER } from '../src/career/admission.js';

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
// B1 一次性回填（store 層）
// ════════════════════════════════════════════════════════════════
test('B1 舊形狀存檔回填：contract 補隊階底薪＋enteredAtSeason、封存補 proFinish（全敗檔＝league）', () => {
  const teamId = 'cangyu-titans';
  const storage = settledProYear1(teamId);
  degradeToLegacy(storage);
  const s = createCareerStore(storage);
  assert.equal(s.backfillProMultiyear?.() ?? false, true, '舊檔必須回填（無實作＝這裡紅）');
  const save = saveOf(storage);
  assert.equal(save.career.contract.salary, proBaseSalaryFor(proTeamById(teamId)));
  assert.equal(save.career.contract.sinceSeason, save.career.chapter.enteredAtSeason);
  assert.equal(save.career.seasons.at(-1).proFinish, 'league');
});

test('B1 冠軍舊檔回填：proFinish 補 champion 且封存其他鍵逐值不動', () => {
  const storage = proSaveInProgress();
  winLeagueThenPlayoffs(storage, [true, true]);
  assert.ok(createCareerStore(storage).settleProFinale());
  degradeToLegacy(storage);
  const before = saveOf(storage).career.seasons.at(-1);
  assert.ok(createCareerStore(storage).backfillProMultiyear?.() ?? false);
  const after = saveOf(storage).career.seasons.at(-1);
  assert.equal(after.proFinish, 'champion', '冠軍舊檔必須補回 champion');
  const { proFinish, ...afterRest } = after;
  assert.deepEqual(afterRest, before, '封存其他鍵逐值不動');
});

test('B1 冪等：第二次呼叫回 false 且存檔位元組不變；新存檔 no-op；非職業章 no-op', () => {
  const storage = settledProYear1();
  degradeToLegacy(storage);
  createCareerStore(storage).backfillProMultiyear();
  const snapshot = storage.getItem(SAVE_KEY);
  assert.equal(createCareerStore(storage).backfillProMultiyear(), false, '第二次＝no-op');
  assert.equal(storage.getItem(SAVE_KEY), snapshot, '位元組不變');
  const fresh = settledProYear1();
  const freshSnap = fresh.getItem(SAVE_KEY);
  assert.equal(createCareerStore(fresh).backfillProMultiyear(), false, '新存檔 no-op');
  assert.equal(fresh.getItem(SAVE_KEY), freshSnap);
  const uni = settledUniSave();
  assert.equal(createCareerStore(uni).backfillProMultiyear(), false, '非職業章 no-op');
});

// ════════════════════════════════════════════════════════════════
// B2 續約＋推進同一次 RMW
// ════════════════════════════════════════════════════════════════
test('B2 advanceSeason({proSalary})：同一次推進寫入新薪；壞值不寫、合約保留', () => {
  const storage = settledProYear1();
  const before = saveOf(storage);
  assert.ok(createCareerStore(storage).advanceSeason({ proSalary: 777 }));
  const after = saveOf(storage);
  assert.equal(after.season.index, before.season.index + 1, '推進成功');
  assert.equal(after.career.contract.salary, 777, '新薪同 RMW 寫入');
  assert.equal(after.career.contract.sinceSeason, before.career.contract.sinceSeason, 'sinceSeason 不動');

  for (const bad of [0, -3, 1.5, 'x', null]) {
    const st = settledProYear1();
    const b = saveOf(st);
    assert.ok(createCareerStore(st).advanceSeason({ proSalary: bad }), `壞值 ${bad} 照樣推進`);
    assert.deepEqual(saveOf(st).career.contract, b.career.contract, `壞值 ${bad} 不寫入合約`);
  }
});

// ════════════════════════════════════════════════════════════════
// B3 續約薪水公式（性質斷言，不釘死絕對值）
// ════════════════════════════════════════════════════════════════
test('B3 proRenewalSalaryFor：名次單調、冠軍加成、恆正整數、壞值保守', () => {
  for (const t of PRO_TEAMS) {
    assert.ok(proRenewalSalaryFor(t, 1, 'league') >= proRenewalSalaryFor(t, 8, 'league'),
      `${t.id}：rank1 ≥ rank8`);
    assert.ok(proRenewalSalaryFor(t, 3, 'champion') > proRenewalSalaryFor(t, 3, 'league'),
      `${t.id}：champion > league（同名次）`);
    for (const [r, f] of [[1, 'champion'], [8, 'league'], [0, null], [null, '???']]) {
      const v = proRenewalSalaryFor(t, r, f);
      assert.ok(Number.isInteger(v) && v >= 1, `${t.id} rank=${r} finish=${f} 恆正整數（得 ${v}）`);
    }
  }
  assert.ok(Number.isInteger(proRenewalSalaryFor(null, null, null)), '全壞值不炸');
});

// ════════════════════════════════════════════════════════════════
// B6 舊語意文案（機械判定：原始碼不再有「職業元年」）
// ════════════════════════════════════════════════════════════════
test('B6 careerScreen.js 無「職業元年」字樣', async () => {
  const src = await readFile(new URL('../src/ui/careerScreen.js', import.meta.url), 'utf-8');
  assert.ok(!src.includes('職業元年'), '職業段年份必須跟 chapterSeasonOf 走');
});

// ════════════════════════════════════════════════════════════════
// B4/B5 wiring（真實 UI 路徑；假 DOM 沿 pro-batch3-wiring 帶參數 replaceChildren 版）
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

test('B4① 季末收尾卡＝續約談判卡：第 N 年標題＋續約鈕（帶年薪）＋退休鈕都在畫面上', async () => {
  const storage = proSaveInProgress();
  loseOutSeason(storage);
  await renderScreen(storage);
  const closeBtn = findBtn(/賽季落幕——第 1 年/);
  assert.ok(closeBtn, '季末鈕年份跟 chapterSeasonOf 走');
  tap(closeBtn);
  await settle();
  const text = allText();
  assert.match(text, /職業第 1 年・完/);
  assert.match(text, /✍ 續約留隊——年薪 \d+ 萬/);
  assert.match(text, /👋 高掛球鞋/);
});

test('B4② 續約鈕＝推進：按下後屆數+1、新薪入檔、回生涯畫面可出戰新季', async () => {
  const storage = proSaveInProgress();
  loseOutSeason(storage);
  const beforeIdx = saveOf(storage).season.index;
  await renderScreen(storage);
  tap(findBtn(/賽季落幕/));
  await settle();
  const renewBtn = findBtn(/續約留隊/);
  assert.ok(renewBtn);
  const offered = Number(renewBtn.textContent.match(/年薪 (\d+) 萬/)[1]);
  tap(renewBtn);
  await settle();
  const save = saveOf(storage);
  assert.equal(save.season.index, beforeIdx + 1, '屆數推進');
  assert.equal(save.career.contract.salary, offered, '入檔薪水＝鈕上顯示的數字');
  assert.equal(save.career.proFinaleSettled, false, '旗標逐季重置');
  assert.match(allText(), /職業聯賽——第 2 年/, '回生涯畫面＝第 2 年');
});

test('B4③ 退休：確認卡二段確認→proRetired；再 render 顯示生涯已收束、無出戰入口', async () => {
  const storage = proSaveInProgress();
  loseOutSeason(storage);
  await renderScreen(storage);
  tap(findBtn(/賽季落幕/));
  await settle();
  tap(findBtn(/高掛球鞋/));
  await settle();
  assert.match(allText(), /確定要高掛球鞋嗎/, '先出確認卡，不直接退');
  assert.equal(saveOf(storage).career.proRetired, undefined, '確認前不得寫入');
  tap(findBtn(/確定退休/));
  await settle();
  assert.equal(saveOf(storage).career.proRetired, true);
  const text = allText();
  assert.match(text, /生涯已收束/);
  assert.ok(!findBtn(/▶ 出戰/), '退休後不得再出戰');
});

test('B4④ 末季（章內第 10 年）：收尾卡不給續約鈕、顯示謝幕佔位', async () => {
  const storage = proSaveInProgress();
  const raw = saveOf(storage);
  const entered = raw.career.chapter.enteredAtSeason;
  raw.season.index = entered + 9; // 章內第 10 年
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  loseOutSeason(storage);
  await renderScreen(storage);
  const closeBtn = findBtn(/賽季落幕——第 10 年/);
  assert.ok(closeBtn, '末季季末鈕年份＝10');
  tap(closeBtn);
  await settle();
  const text = allText();
  assert.match(text, /十年職業生涯走到終點/);
  assert.ok(!findBtn(/續約留隊/), '末季不得出現續約鈕（死按鈕防線）');
});

test('B1 接線順序：舊形狀存檔一 render 就回填（早於任何推進入口）', async () => {
  const storage = settledProYear1();
  degradeToLegacy(storage);
  await renderScreen(storage);
  const save = saveOf(storage);
  assert.ok(save.career.contract, 'render 即回填 contract');
  assert.equal(save.career.seasons.at(-1).proFinish, 'league', 'render 即回填 proFinish');
});

test('B5 生涯數據頁：職業冠軍季亮 🏆 職業冠軍、亞軍/名次標籤正確', async () => {
  const storage = proSaveInProgress();
  winLeagueThenPlayoffs(storage, [true, true]);
  assert.ok(createCareerStore(storage).settleProFinale());
  await renderScreen(storage);
  const totalsBtn = findBtn(/回看生涯數據/);
  assert.ok(totalsBtn);
  tap(totalsBtn);
  await settle();
  assert.match(allText(), /🏆 職業冠軍/, '冠軍季標籤');
});

// ════════════════════════════════════════════════════════════════
// 批 2 覆審修補（M1/M2/M3）的行為測試
// ════════════════════════════════════════════════════════════════
test('M1 修：末季（第 10 年）結算返回後＝收束佔位（proCareerOver 接線），不再落收尾卡迴圈', async () => {
  const storage = proSaveInProgress();
  const raw = saveOf(storage);
  raw.season.index = raw.career.chapter.enteredAtSeason + 9;
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  loseOutSeason(storage);
  assert.ok(createCareerStore(storage).settleProFinale(), '前提：末季結算成功');
  await renderScreen(storage);
  const text = allText();
  assert.match(text, /生涯已收束/, '滿十年（未退休）也要進收束佔位');
  assert.match(text, /十年職業生涯走到終點/, '文案分流：非退休態');
  assert.ok(!findBtn(/賽季落幕/), '不得再出現收尾卡迴圈入口');
});

test('M2 修：同批事件連點「高掛球鞋」只開一張確認卡', async () => {
  const storage = proSaveInProgress();
  loseOutSeason(storage);
  await renderScreen(storage);
  tap(findBtn(/賽季落幕/));
  await settle();
  const retireBtn = findBtn(/高掛球鞋/);
  tap(retireBtn); tap(retireBtn); // 雙指同批事件
  await settle();
  const confirms = walk(globalThis.document.body)
    .filter((n) => /確定要高掛球鞋嗎/.test(n.textContent ?? ''));
  assert.equal(confirms.length, 1, '重入旗標必須擋下第二張卡');
});

test('M3 修：「封存未推進」窗口開數據頁——同一屆不重複、合計不灌水', async () => {
  const storage = settledProYear1(); // 第 9 屆已封存、未推進
  await renderScreen(storage);
  tap(findBtn(/回看生涯數據/));
  await settle();
  const rows = walk(globalThis.document.body)
    .filter((n) => /^第 9 屆/.test(n.textContent ?? ''));
  assert.equal(rows.length, 1, '同一屆只能出現一列');
});

test('送審輪2修：同批連點「賽季落幕」只開一張收尾卡（不留死續約鈕）', async () => {
  const storage = proSaveInProgress();
  loseOutSeason(storage);
  await renderScreen(storage);
  const closeBtn = findBtn(/賽季落幕/);
  tap(closeBtn); tap(closeBtn); // 雙指同批事件
  await settle();
  const cards = walk(globalThis.document.body)
    .filter((n) => /職業第 1 年・完/.test(n.textContent ?? ''));
  assert.equal(cards.length, 1, '重入旗標必須擋下第二張收尾卡');
  // 推進後重開收尾卡要開得起來（旗標有還原）：續約進第 2 季再打完
  // （批 4B 起推進會設屆間待辦——治具直接跳過，屆間卡本體由 batch4b 測試護）
  tap(findBtn(/續約留隊/));
  await settle();
  // ★超出 acceptance-pro-fitness-split.md FS-4 清單的必要修補★（2026-08-27）：
  // 職業屆間體能格「不互斥」改制把屆間待辦拆成路線／體能兩顆獨立 pending
  // （proGrowthPending／proFitnessPending）；本檔原本只清一顆（單顆共用旗標的
  // 舊語意），治具在此只是「跳過屆間選擇好繼續往下測收尾卡」，不是本測試的
  // 驗證標的——體能 pending 不清會讓下一次 renderScreen 卡在屆間卡（只剩體能段），
  // 找不到後面要點的「賽季落幕——第 2 年」而丟未捕捉例外。補這一行使治具與新
  // 兩段狀態機同步，判準（重入旗標防雙開收尾卡）本身未改動一個字。
  assert.ok(createCareerStore(storage).chooseProGrowth?.('rest') ?? true, '治具：跳過屆間選擇（路線段）');
  assert.ok(createCareerStore(storage).chooseProGrowth?.('fitness-skip') ?? true, '治具：跳過屆間選擇（體能段）');
  loseOutSeason(storage);
  await renderScreen(storage);
  tap(findBtn(/賽季落幕——第 2 年/));
  await settle();
  assert.match(allText(), /職業第 2 年・完/, '旗標還原後第 2 季收尾卡照常開');
});

test('送審輪2修：回填遇屆數不符（損毀檔，只缺 proFinish）＝回 false 且不寫檔', () => {
  const storage = settledProYear1();
  const raw = saveOf(storage);
  // 只剝 proFinish（contract 留著——缺 contract 時回填 contract 回 true 是正確行為）
  const last = raw.career.seasons.at(-1);
  delete last.proFinish;
  last.index = 999; // 手改損毀：封存屆數與當前季對不上
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  const snapshot = storage.getItem(SAVE_KEY);
  assert.equal(createCareerStore(storage).backfillProMultiyear(), false, '不得回 true');
  assert.equal(storage.getItem(SAVE_KEY), snapshot, '不得寫檔');
});
