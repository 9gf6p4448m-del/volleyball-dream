// 大學卷 批 6 — B6-5 接線：大學賽季真的開得起來、打得完（2026-08-14）
// 驗收＝`docs/kickoffs/acceptance-uni-batch6.md`。
//
// ★ 為什麼非要走真 UI 路徑 ★ 資料層測試已經證明賽程生得出來、積分算得對——
// 但那證明不了「玩家點得到出戰」。第一版就是這樣壞的：賽程生出來了，畫面卻把整個
// 大學章攔在分支鏈最前面，一場都打不了（八場賽程配零個入口）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { uniTable, UNI_PLAYER_ID } from '../src/career/uniSchedule.js';

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

/** 已經升學到指定學校、打完 `played` 場的存檔。 */
function uniStorage(schoolId, played = 0) {
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
  if (played > 0) {
    const s2 = createCareerStore(storage);
    const c2 = s2.loadCareer();
    s2.saveCareer({
      ...c2,
      // 交錯的戰績：2-0 勝與 1-2 敗各半 ⇒ 積分不是勝場數的倍數（勝點制才看得出差別）
      results: c2.schedule.slice(0, played).map((m, i) => ({
        matchId: m.id,
        opponentId: m.opponentId,
        won: i % 2 === 0,
        scoreFor: i % 2 === 0 ? 2 : 1,
        scoreAgainst: i % 2 === 0 ? 0 : 2,
        gp: 3,
      })),
    });
  }
  return storage;
}

async function renderCareer(storage) {
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
  return allText();
}

test('★B6-5 核心★ 升學後賽季開得起來：看得到八場賽程與「出戰」入口', async () => {
  const text = await renderCareer(uniStorage('meixi'));
  assert.match(text, /大學聯賽・單循環/, '大學賽程區塊沒出現');
  assert.match(text, /梅溪大學/);
  assert.ok(nodeWith(/出戰/), '★八場賽程配零個入口★ 一場都打不了');
  assert.match(text, /三戰兩勝/, 'bo3 沒有告訴玩家');
});

test('B6-5 賽程上列的是別的大學，不是高中對手', async () => {
  const text = await renderCareer(uniStorage('meixi'));
  assert.match(text, /北陵大學|瀚崎體育大學|海硯大學/, '對手名字沒顯示成大學');
  assert.doesNotMatch(text, /曜石體中|天鷹學園/, '大學賽季卻排了高中對手');
});

test('★B6-2 畫面★ 打過幾場後出現勝點制積分表（分數不等於勝場數）', async () => {
  const storage = uniStorage('meixi', 4);
  const text = await renderCareer(storage);
  assert.match(text, /勝點制/, '積分表的規則說明沒出現');
  const store = createCareerStore(storage);
  const career = store.loadCareer();
  const board = uniTable({
    schoolId: 'meixi', seed: career.seed, schedule: career.schedule, results: career.results,
  });
  const me = board.table.find((r) => r.id === UNI_PLAYER_ID);
  assert.equal(me.wins, 2, '治具的戰績變了，下面的數字要跟著改');
  assert.equal(me.points, 3 + 1 + 3 + 1, '2-0 勝×2＋1-2 敗×2 ＝ 8 分');
  assert.notEqual(me.points, me.wins, '★積分等於勝場數＝勝點制形同虛設★');
  assert.match(text, new RegExp(`${me.points} 分`), '畫面上找不到積分');
});

test('★B6-5★ 打完八場 ⇒ 賽季結算出現名次，且不再有出戰入口', async () => {
  const text = await renderCareer(uniStorage('meixi', 8));
  assert.match(text, /大一賽季結束/, '賽季沒有結算');
  assert.match(text, /聯賽第 \d+ 名|大學聯賽冠軍/, '沒有名次');
  assert.equal(nodeWith(/出戰/), undefined, '賽季打完了還有出戰按鈕');
  assert.doesNotMatch(text, /進入下一屆|捲土重來/, '大二是下一批，不該給推進鈕');
});

test('★B6-5 反向對照★ 打到一半 ⇒ 有出戰、沒有賽季結算', async () => {
  const text = await renderCareer(uniStorage('meixi', 4));
  assert.ok(nodeWith(/出戰/), '賽季中途卻沒有入口');
  assert.doesNotMatch(text, /大一賽季結束/, '還沒打完就宣告賽季結束');
});

test('B6-4 畫面對照：強豪與弱校的玩家球權不同（同一份存檔只差選校）', async () => {
  const weak = createCareerStore(uniStorage('meixi')).loadPlayer().trust.fromSetter;
  const power = createCareerStore(uniStorage('north-ridge')).loadPlayer().trust.fromSetter;
  assert.ok(weak > power, `弱校的球權應該多於強豪：${weak} vs ${power}`);
});
