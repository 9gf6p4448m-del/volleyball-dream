// 大學謝幕卷 批 2 — 謝幕儀式 UI（gating＋三段卡序列＋送別接線＋終卡，2026-08-25）
// 驗收＝`docs/kickoffs/acceptance-uni-finale-batch2.md`（B2-1～B2-5）。
//
// ★ 為什麼非要走真 UI 路徑 ★ 批 1 的資料層測試已經證明 settleUniFinale 封存得對——
// 但那證明不了「玩家點得到、看得到三段卡、簡子嵐/曾家松的預埋句真的被念出來」。
// 治具/替身樣板照 `tests/uni-season-wiring.test.mjs`（同一套 fakeDom/fakeStorage）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { uniSeasonTurnover, UNI_GRADUATE_GRADE } from '../src/career/uniTurnover.js';

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
    replaceChildren(...nodes) {
      this.children = [];
      for (const n of nodes) this.appendChild(n);
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

const walk = (node, out = []) => {
  out.push(node);
  for (const c of node.children ?? []) walk(c, out);
  return out;
};
const tap = (node) => {
  for (const fn of [...(node.handlers?.pointerdown ?? [])]) fn({ stopPropagation() {} });
};
const nodeWith = (re) => walk(globalThis.document.body)
  .find((n) => re.test(n.textContent ?? '') && (n.handlers?.pointerdown ?? []).length);
const allText = () => walk(globalThis.document.body).map((n) => n.textContent ?? '').join('｜');
const settle = () => new Promise((r) => { setTimeout(r, 0); });

/** 找到 OWN textContent 符合 re 的葉節點，往上爬到第一個掛 pointerdown 的祖先並點擊。
 * 用於本檔自製的全螢幕卡（card1 四年回顧／card3 終卡）——每張卡的 pointerdown
 * 掛在卡片外層 overlay 本身，不是某顆具名按鈕（同 showNextChapter/舊佔位卡樣式）。*/
function tapHint(re) {
  const hint = walk(globalThis.document.body).find((n) => re.test(n.textContent ?? ''));
  assert.ok(hint, `找不到卡片提示文字：${re}`);
  let t = hint;
  while (t && !(t.handlers?.pointerdown ?? []).length) t = t.parent;
  assert.ok(t, `提示文字沒有可點的祖先節點：${re}`);
  tap(t);
}

/** 點掉 dialogPlay 的對話卡（同屆送別，card2）直到跑完（onDone 觸發、換到終卡）。
 * ⚠ 對話卡是模組層級的隱藏單例，`▼ 點擊繼續` 永遠找得到——照 uni-season-wiring
 * 的 clearDialogs 樣板，用「看到終卡標記就停」而非「找不到就停」當結束條件。 */
async function clickThroughFarewell(doneMarkerRe, maxTaps = 20) {
  for (let i = 0; i < maxTaps; i += 1) {
    if (doneMarkerRe.test(allText())) return;
    const cont = walk(globalThis.document.body).find((n) => /^▼ 點擊繼續$/.test(n.textContent ?? ''));
    if (!cont) break;
    let t = cont;
    while (t && !(t.handlers?.pointerdown ?? []).length) t = t.parent;
    if (!t) break;
    tap(t);
    await settle();
  }
}

/** 已升學到 schoolId 的存檔（大一、賽程已生、零戰績）。同 batch1/wiring 治具。 */
function uniSave(schoolId) {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 99, playerName: '小夢' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 3;
  raw.roster = { capacity: 12, members: buildStarterMembers(), alumni: [] };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  createCareerStore(storage).enterUniversity(schoolId);
  return storage;
}

function playSeason(storage, played = null) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const league = c.schedule.filter((m) => m.round === 'league');
  const n = played ?? league.length;
  s.saveCareer({
    ...c,
    results: league.slice(0, n).map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
}

/** 推進到大四、played 場已打完（預設全打完）的存檔；career.seasons 已有大一～大三共 3 筆。
 * 每次 advanceSeason 後清 campPending（同 uni-season-wiring 批4測試——否則 renderCareer
 * 會停在屆間集訓面板，看不到大四入口）。*/
function u4Save(schoolId, played = null) {
  const storage = uniSave(schoolId);
  for (let y = 1; y <= 3; y += 1) {
    playSeason(storage);
    const adv = createCareerStore(storage).advanceSeason();
    assert.ok(adv && adv.ok, `fixture 前提：大${y}→大${y + 1} 要推得動`);
    const raw = JSON.parse(storage.getItem(SAVE_KEY));
    delete raw.player.campPending;
    storage.setItem(SAVE_KEY, JSON.stringify(raw));
  }
  playSeason(storage, played);
  return storage;
}

async function renderCareer(storage, hooks = {}) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  createCareerScreen(createCareerStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPractice: () => {}, onPlay: () => {}, ...hooks,
  }).show('career');
  await settle();
  // 初始 dialog 清場（照抄 uni-season-wiring renderCareer 的 12 次上限——治具直接
  // 灌 results／不走真實比賽流程，uniLeaguePlayed 教學傳授（events.js teach-press/
  // teach-chase）會在初次渲染被 postEvs 補播，得點掉才看得到生涯畫面本體）
  for (let i = 0; i < 12; i += 1) {
    const cont = walk(globalThis.document.body).find((n) => /^▼ 點擊繼續$/.test(n.textContent ?? ''));
    if (!cont) break;
    let t = cont;
    while (t && !(t.handlers?.pointerdown ?? []).length) t = t.parent;
    if (!t) break;
    tap(t);
    await settle();
  }
  return allText();
}

// ════════ B2-1 gating ════════

test('B2-1 大四未打完：謝幕鈕禁用＋理由文案，「出戰」入口仍在（不影響繼續打球）', async () => {
  const storage = u4Save('meixi', 5); // 大四只打 5/8 場
  const text = await renderCareer(storage);
  assert.match(text, /把大四聯賽打完，才能開啟謝幕儀式/, '禁用理由文案沒出現');
  const btn = walk(globalThis.document.body).find((n) => /🎓 謝幕/.test(n.textContent ?? ''));
  assert.ok(btn, '禁用鈕本身沒出現');
  assert.equal(btn.disabled, true, '未打完時謝幕鈕必須是 disabled');
  assert.equal((btn.handlers?.pointerdown ?? []).length, 0, '禁用鈕不得掛可觸發的 handler');
  assert.ok(nodeWith(/出戰/), '大四還在打，出戰入口不該消失');
  assert.doesNotMatch(text, /大學謝幕・四年回顧/, '沒打完卻能看到回顧卡＝謝幕流程被誤觸發');
});

test('B2-1 大四打完：謝幕鈕可按，點下去進三段卡序列（不是舊佔位卡）', async () => {
  const storage = u4Save('meixi', 8);
  const text = await renderCareer(storage);
  assert.doesNotMatch(text, /🎓 謝幕/, '打完了不該還看到禁用鈕殘留');
  assert.match(text, /四年打完了——謝幕/, '可按的謝幕入口沒出現');
  const btn = nodeWith(/四年打完了——謝幕/);
  assert.ok(btn, '找不到可點的謝幕鈕');
  tap(btn);
  await settle();
  const afterTap = allText();
  assert.match(afterTap, /大學謝幕・四年回顧/, '★B2-1★ 點下去該進回顧卡，不是舊佔位卡');
  assert.doesNotMatch(afterTap, /大學的謝幕儀式與下一個舞台　在下一卷/, '舊佔位卡的字樣不該再出現');
});

// ════════ B2-2～B2-5 全流程（haiyan：簡子嵐同屆＋何硯青同屆通用句＋5 位學弟）════════

test('B2-2～B2-5 全流程：回顧→簡子嵐送別→終卡→回生涯頁，U4 名次與封存值一致、學弟不發言', async () => {
  const storage = u4Save('haiyan', 8);
  const store = createCareerStore(storage);

  // fixture 前提：haiyan 只有簡子嵐(slot0)與何硯青(slot4)是與玩家同屆（U1 入學 grade1、
  // 撐到 U4 末畢業）；其餘 5 位是屆間換血補進來的學弟（grade<4）——照 uniTurnover 同一份
  // 判準算出來，不是憑印象猜的
  const rosterBefore = store.loadRoster();
  const { graduates } = uniSeasonTurnover({
    roster: rosterBefore, schoolId: 'haiyan', seasonIndex: 999, seed: 1,
  });
  assert.deepEqual(graduates.map((g) => g.name).sort(), ['何硯青', '簡子嵐'].sort(),
    'fixture 前提：haiyan 大四同屆畢業生應為簡子嵐＋何硯青');
  const juniorNames = rosterBefore.members
    .filter((m) => (m.growth?.grade ?? 1) < UNI_GRADUATE_GRADE)
    .map((m) => m.name);
  assert.equal(juniorNames.length, 5, 'fixture 前提：另有 5 位學弟在隊（換血補進來的）');

  const text0 = await renderCareer(storage);
  const btn = nodeWith(/四年打完了——謝幕/);
  assert.ok(btn, '找不到謝幕入口');
  tap(btn);
  await settle();

  // ①四年回顧：U1–U4 四筆名次齊全，U4 名次與批 1 封存值一致（B2-2）
  const reviewText = allText();
  assert.match(reviewText, /大一/); assert.match(reviewText, /大二/);
  assert.match(reviewText, /大三/); assert.match(reviewText, /大四/);
  const archived = store.loadSeasonArchive();
  assert.equal(archived.length, 4, 'B2-2：settleUniFinale 該已把 U4 封存進去（四筆）');
  const u4 = archived.at(-1);
  const rankTag = u4.uniRank === 1 ? '🏆 聯賽冠軍' : `聯賽第 ${u4.uniRank} 名`;
  assert.match(reviewText, new RegExp(rankTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'B2-2：回顧卡上的 U4 名次要跟批 1 封存值一致');

  // ②同屆送別：跳到 card2（點擊回顧卡進入）
  tapHint(/還有幾句話/);
  await settle();
  const farewellOpenText = allText();
  assert.match(farewellOpenText, /最後一場，打完了/, 'card2 開場白沒出現');

  // 逐句點完，中途收集看到的文字（判斷簡子嵐/何硯青/玩家自白都真的被念出來）
  // ★學弟不發言的判準不用 DOM 文字比對★——對話卡是覆蓋層，底下的生涯畫面（含
  // 「名冊」清單，裡面本來就列著這幾位學弟）還在 DOM 裡，allText() 撈的是全頁
  // 文字湯，拿學弟名字去比對會撞上名冊列表這個假陽性（已實測踩到：蘇之勤只是
  // 出現在背景名冊，不是他在對話卡開口）。改成直接查 uniFinaleFarewellLines
  // 的輸出結構——那正是 UI 餵給 dialogPlay 的同一份資料，查它的 speaker 集合
  // 才是「誰真的說了話」的準確判準。
  let seenAll = '';
  for (let i = 0; i < 10; i += 1) {
    seenAll += `｜${allText()}`;
    if (/第二章・完/.test(allText())) break;
    const cont = walk(globalThis.document.body).find((n) => /^▼ 點擊繼續$/.test(n.textContent ?? ''));
    if (!cont) break;
    let t = cont;
    while (t && !(t.handlers?.pointerdown ?? []).length) t = t.parent;
    if (!t) break;
    tap(t);
    await settle();
  }
  seenAll += `｜${allText()}`;
  assert.match(seenAll, /海硯之後，還有更大的海/, 'B2-3：簡子嵐的具名句沒被念到');
  assert.match(seenAll, /四年打完了。這片場地，之後拜託你們了。/, 'B2-3：何硯青（通用款）沒被念到');
  assert.match(seenAll, /四年——比想像中快/, 'B2-3：玩家收束自白沒出現');

  const { uniFinaleFarewellLines } = await import('../src/career/uniGraduation.js');
  const fedLines = uniFinaleFarewellLines(graduates, '小夢'); // 與 showUniFinaleFarewell 同一組實參
  const speakers = new Set(fedLines.map((l) => l.speaker));
  assert.deepEqual([...speakers].sort(), ['何硯青', '教練', '簡子嵐', '小夢'].sort(),
    'B2-3：對話卡的講者集合只該有教練/畢業生/玩家——不含任何學弟');
  for (const name of juniorNames) {
    assert.ok(!speakers.has(name), `B2-3：學弟「${name}」不該出現在講者集合裡`);
  }

  // ③終卡：不點名成人/企業（B2-5）
  const closingText = allText();
  assert.match(closingText, /第二章・完/, 'B2-5：終卡沒出現');
  assert.match(closingText, /下一個舞台/, 'B2-5：「下一個舞台」敬請期待語沒出現');
  assert.doesNotMatch(closingText, /成人|企業/, 'B2-5：終卡不得點名成人/企業聯賽');

  // 出口：回生涯頁不崩潰，🏆/名次含 U4（B2-5）
  tapHint(/返回生涯畫面/);
  await settle();
  const backText = allText();
  assert.ok(backText.length > 0, 'B2-5：回生涯頁後畫面不得是空的（崩潰的訊號）');
  assert.doesNotMatch(backText, /進入大[二三四五]/, '大四末不該再出現推進按鈕');

  // 生涯數據頁（Q9 累積）要看得到 U4 那一筆
  const totalsBtn = nodeWith(/回看三年的數據/);
  assert.ok(totalsBtn, '找不到生涯數據入口');
  tap(totalsBtn);
  await settle();
  const totalsText = allText();
  assert.match(totalsText, new RegExp(rankTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'B2-5：生涯數據頁沒看到 U4 的名次');
});

// ════════ B2-3 補充：曾家松（另一所學校，證明兩句預埋具名句都可達） ════════

test('B2-3 曾家松：另一所學校（chengguang）的同屆送別也念得到具名句', async () => {
  const storage = u4Save('chengguang', 8);
  const text0 = await renderCareer(storage);
  tap(nodeWith(/四年打完了——謝幕/));
  await settle();
  tapHint(/還有幾句話/);
  await settle();
  let seenAll = allText();
  for (let i = 0; i < 10; i += 1) {
    if (/第二章・完/.test(allText())) break;
    const cont = walk(globalThis.document.body).find((n) => /^▼ 點擊繼續$/.test(n.textContent ?? ''));
    if (!cont) break;
    let t = cont;
    while (t && !(t.handlers?.pointerdown ?? []).length) t = t.parent;
    if (!t) break;
    tap(t);
    await settle();
    seenAll += `｜${allText()}`;
  }
  assert.match(seenAll, /三年沒封頂的牆，在這裡砌完了/, '曾家松的具名句沒被念到');
});

// ════════ B2-4 結算接線恰一次 ════════

test('B2-4 重看謝幕不重複封存：第二次進入儀式，career.seasons 仍 4 筆', async () => {
  const storage = u4Save('meixi', 8);
  const store = createCareerStore(storage);
  await renderCareer(storage);
  tap(nodeWith(/四年打完了——謝幕/));
  await settle();
  assert.equal(store.loadSeasonArchive().length, 4, '第一次進入該已結算（4 筆）');
  const afterFirst = storage.getItem(SAVE_KEY);

  // 模擬「重看」：重新渲染生涯頁（未離開 U4-done 狀態），再點一次謝幕鈕
  const text2 = await renderCareer(storage);
  const btn2 = nodeWith(/四年打完了——謝幕/);
  assert.ok(btn2, '重看時謝幕入口該還在');
  tap(btn2);
  await settle();
  assert.equal(store.loadSeasonArchive().length, 4, 'B2-4：重看不得再封一次（仍 4 筆）');
  assert.equal(storage.getItem(SAVE_KEY), afterFirst, 'B2-4：重看不得再動存檔');
});
