// 職業章 批 2「入章接線」— B2/B3/B7 行為級接線（2026-08-26）
// 驗收＝docs/kickoffs/acceptance-pro-batch2.md（B2/B3/B7）。
//
// ★ 為什麼走真的 UI 路徑 ★ 同 tests/corp-entry-wiring.test.mjs：純函式測試證明不了
// 「畫面真的會依旗標改變」「dialogPlay 的字真的出現在對的容器」。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 形狀沿 tests/corp-entry-wiring.test.mjs 的假 DOM（同源，避免替身漂移；帶參數
// replaceChildren——債清批 2026-08-26 教訓：原版丟參數＝內容憑空消失）
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
const allText = (root) => walk(root).map((n) => n.textContent ?? '').join('｜');
const settle = () => new Promise((r) => { setTimeout(r, 0); });
const findBtn = (re) => walk(globalThis.document.body)
  .find((n) => n.tag === 'button' && re.test(n.textContent ?? ''));
// ★容器斷言★ dialogPlay 的對話泡泡是 careerScreen.js 建構時就釘死掛在 body 下的
// 單一 DOM 節點（dlgHint 的文字「▼ 點擊繼續」恆在，不管顯不顯示）——抓它的父節點
// （dlgCard）第二個子節點就是 dlgText，字要出現在**這裡**，不是隨便哪個 div。
function findDialogTextNode() {
  const hint = walk(globalThis.document.body).find((n) => n.textContent === '▼ 點擊繼續');
  return hint?.parent?.children?.[1] ?? null;
}
const tapDialogsAll = async () => {
  for (let i = 0; i < 20; i += 1) {
    const cont = walk(globalThis.document.body).find((n) => /點擊繼續/.test(n.textContent ?? ''));
    if (!cont) break;
    let p = cont;
    while (p && !(p.handlers?.pointerdown ?? []).length) p = p.parent;
    if (p) tap(p); else break;
    await settle();
  }
};

/** U4 打滿、謝幕已結算的存檔（沿 corp-entry-wiring.test.mjs 的 u4Save 手法）。 */
function u4Save(school = 'meixi') {
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
  play();
  assert.ok(s.settleUniFinale(), 'fixture 前提：U4 結算成功');
  return storage;
}

/** 簽入企業隊＋打滿企業那一季（played 場）；未結算（settleCorpFinale 由收尾卡消費）。 */
function corpSave(played = 7, corpId = 'panshi-heavy') {
  const storage = u4Save();
  const s = createCareerStore(storage);
  assert.ok(s.enterCorporate(corpId), 'fixture 前提：簽約成功');
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

async function renderAndGetText(storage) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const { createCareerStore: mkStore } = await import('../src/career/careerStore.js');
  const screen = createCareerScreen(mkStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
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

// ════════════════════════════════════════════════════════════════
// B2 收尾卡入口：消費 corpFinaleSettled 長出「前往下一個舞台」
// ════════════════════════════════════════════════════════════════
test('B2① 企業 7/7 打完並開收尾卡 ⇒ 結算成功、「前往下一個舞台」出現', async () => {
  const storage = corpSave(7);
  const text = await renderAndGetText(storage);
  assert.match(text, /賽季落幕/, '對照：收尾卡入口本身要在');
  tap(findBtn(/賽季落幕/));
  await settle();
  const text2 = allText(globalThis.document.body);
  assert.match(text2, /前往下一個舞台/);
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(save.career.corpFinaleSettled, true, '進入收尾卡要順手把結算封進存檔');
  assert.ok(Number.isInteger(save.career.seasons.at(-1)?.corpRank), '封存筆要帶 corpRank');
});

test('B2② 首次進入且結算失敗（存檔寫入失敗）⇒ 擋下明示，不出現「前往下一個舞台」', async () => {
  // ★ 為什麼用寫入失敗模擬「結算失敗」，不是壞 corp id ★
  // settleCorpFinale 的 corporationById(corpId) 守衛與 UI 的 pickedCorp/corpSeasonDone
  // 閘用的是同一顆檢查——壞 corp id 會讓「賽季落幕」按鈕本身都不出現（同一顆守衛擋兩處），
  // 不構成「按鈕在、結算卻失敗」的可達狀態。真正可達的失敗＝存檔寫入失敗（配額滿/
  // 私密模式，同 corpPaydayChoice 覆審 HIGH 教訓）：守衛全過但 writeSave 回 false。
  const storage = corpSave(7);
  await renderAndGetText(storage); // 先讓初始賽後劇情泡泡正常消化一輪
  storage.setItem = () => { throw new Error('quota exceeded'); };
  tap(findBtn(/賽季落幕/));
  await settle();
  const text = allText(globalThis.document.body);
  assert.match(text, /結算失敗/, '首次進入且結算失敗要擋下明示，不得靜默照播');
  assert.doesNotMatch(text, /前往下一個舞台/);
});

test('B2③ 重看路徑（旗標已打）：再次進收尾卡仍看得到「前往下一個舞台」（冪等不影響顯示）', async () => {
  const storage = corpSave(7);
  const s = createCareerStore(storage);
  assert.ok(s.settleCorpFinale(), 'fixture 前提：已提前結算過一次');
  await renderAndGetText(storage);
  tap(findBtn(/賽季落幕/));
  await settle();
  const text = allText(globalThis.document.body);
  assert.match(text, /前往下一個舞台/);
  assert.doesNotMatch(text, /結算失敗/);
});

// ════════════════════════════════════════════════════════════════
// B3 挖角/測試會演出 → 邀約自選 → 入隊；容器斷言（泡泡 vs 卡片）
// ════════════════════════════════════════════════════════════════
test('B3① 完整簽約流程 ⇒ 職業初登場卡、存檔為職業章、賽程 round=pro', async () => {
  const storage = corpSave(7);
  await renderAndGetText(storage);
  tap(findBtn(/賽季落幕/));
  await settle();
  tap(findBtn(/前往下一個舞台/));
  await settle();
  // 球團開場白要真的有字（同 A4-1 加嚴：line 不得是空白泡泡）
  assert.match(allText(globalThis.document.body), /手機開始不安分/);
  await tapDialogsAll();
  const sign = findBtn(/簽這一隊/);
  assert.ok(sign, '邀約卡要出現（保底隊恆有）');
  tap(sign);
  await settle();
  tap(findBtn(/簽約/));
  await settle();
  const text = allText(globalThis.document.body);
  assert.match(text, /職業初登場/);
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(save.career.chapter.id, 'pro', '流程走完＝真的入章');
  const games = save.season.schedule.filter((m) => m.round === 'pro');
  assert.equal(games.length, 7, '八隊單循環＝7 場');
});

test('B3② 容器斷言：球團提案文字在對話泡泡（dlgText），邀約卡的提案字在卡片（不混在泡泡裡）', async () => {
  const storage = corpSave(7);
  await renderAndGetText(storage);
  tap(findBtn(/賽季落幕/));
  await settle();
  tap(findBtn(/前往下一個舞台/));
  await settle();
  const dlgText1 = findDialogTextNode();
  assert.ok(dlgText1, '對話泡泡容器要存在（dlgHint 的錨點抓不到就沒有意義）');
  assert.match(dlgText1.textContent, /手機開始不安分/, '開場白要出現在泡泡容器裡');
  await tapDialogsAll();
  // 邀約卡出現後，卡片上的提案字（球權/戰績/環境）不得混進對話泡泡容器——
  // 此時泡泡容器已顯示最後一句對話（或維持原樣），不應含「球權」字樣
  const dlgText2 = findDialogTextNode();
  const bodyText = allText(globalThis.document.body);
  assert.match(bodyText, /球權/, '邀約卡的提案字要出現在畫面上');
  assert.doesNotMatch(dlgText2?.textContent ?? '', /球權/, '提案卡文字不得混進對話泡泡容器');
});

test('B3③ 簽約前後對照：「再想想」取消不入章，「簽約」才入章（誤觸防線）', async () => {
  const storage = corpSave(7);
  await renderAndGetText(storage);
  tap(findBtn(/賽季落幕/));
  await settle();
  tap(findBtn(/前往下一個舞台/));
  await settle();
  await tapDialogsAll();
  tap(findBtn(/簽這一隊/));
  await settle();
  tap(findBtn(/再想想/));
  await settle();
  let save = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(save.career.chapter.id, 'corporate', '取消不得入章');
  // 回到邀約集合後重新選一次、這次真的簽下去
  tap(findBtn(/簽這一隊/));
  await settle();
  tap(findBtn(/簽約/));
  await settle();
  save = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(save.career.chapter.id, 'pro');
});

// ════════════════════════════════════════════════════════════════
// 回歸：企業章既有行為不因批 2 改動而壞（同 corp-entry-wiring.test.mjs A3-4 對照）
// ════════════════════════════════════════════════════════════════
test('回歸：企業 6/7 未打完 ⇒ 照舊出戰，收尾卡與「前往下一個舞台」皆不出現', async () => {
  const storage = corpSave(6);
  createCareerStore(storage).corpPaydayChoice(false);
  const text = await renderAndGetText(storage);
  assert.match(text, /出戰/);
  assert.doesNotMatch(text, /賽季落幕/);
  assert.doesNotMatch(text, /前往下一個舞台/);
});
