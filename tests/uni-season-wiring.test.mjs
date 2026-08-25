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
    // ★ 與其他 wiring 測試的替身差在這一行 ★ 那些替身的 replaceChildren 直接清空、
    // **把參數丟掉**——對陣畫面正是用 `replaceChildren(card)` 重繪的，於是畫面內容
    // 在假 DOM 裡憑空消失，測試會誤判成「對陣畫面沒出現」。這裡照真實 DOM 的語意實作。
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

// 賽前劇情對話要先點完才會到對陣畫面（出戰 → fireEvents → showMatchupScreen）。
// ⚠ 對話卡是模組層級的**隱藏單例**（`display:none` 也留在 DOM 裡），所以這個迴圈
// 一定會找到「▼ 點擊繼續」——不能拿「找不到對話」當結束條件，只點固定次數即可。
async function clearDialogs() {
  for (let i = 0; i < 4; i += 1) {
    const cont = walk(globalThis.document.body).find((n) => /點擊繼續/.test(n.textContent ?? ''));
    if (!cont) break;
    let t = cont;
    while (t && !(t.handlers?.pointerdown ?? []).length) t = t.parent;
    if (!t) break;
    tap(t);
    await settle();
  }
}

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

async function renderCareer(storage, hooks = {}) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  createCareerScreen(createCareerStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPractice: () => {}, onPlay: () => {}, ...hooks,
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

// ════════ 對抗覆審 F2：大學場的賽前對陣畫面 ════════
// `showMatchupScreen` 原本只查高中對手表 ⇒ 大學八場 baseDef 恆 null ⇒ 直接 onConfirm()
// 跳過整個排位儀式。它是**唯一**的先發編排入口：跳過＝B6-3 特地保住的那位板凳
// 永遠換不上場、對面的具名王牌也不會亮相。
test('★F2★ 大學場點「出戰」要先進對陣畫面，不得直接開打', async () => {
  let playedCalls = 0;
  await renderCareer(uniStorage('haiyan'), { onPlay: () => { playedCalls += 1; } });
  const go = nodeWith(/出戰/);
  assert.ok(go, '沒有出戰入口');
  tap(go);
  await settle();
  await clearDialogs();
  assert.equal(playedCalls, 0, '★跳過對陣畫面直接開打★ 先發編排入口整個消失');
  const text = allText();
  assert.match(text, /返回（不出戰）/, '對陣畫面沒出現');
  assert.match(text, /海硯大學/, '對面的隊名沒亮相');
});

test('F2 對陣畫面上看得到對手的具名球員（大學表真的被吃進去）', async () => {
  await renderCareer(uniStorage('meixi'));
  tap(nodeWith(/出戰/));
  await settle();
  await clearDialogs();
  const text = allText();
  const { universityById } = await import('../src/career/universities.js');
  const { createCareerStore: mk } = await import('../src/career/careerStore.js');
  void mk;
  // 第一場的對手（賽程決定論，seed 固定）
  const oppId = createCareerStore(uniStorage('meixi')).loadCareer().schedule[0].opponentId;
  const opp = universityById(oppId);
  assert.ok(opp.squad.some((n) => text.includes(n)),
    `對陣畫面上找不到 ${opp.name} 的任何一位球員`);
});

test('債C覆審修（08-25）：大學聯賽打滿後「去找教練」不與結算同框；未打滿照舊浮現', async () => {
  // 位置旗標的 ENGINEERED_OPEN 回填只在 main.js 開機跑（node 治具吃不到）——
  // 比照 debugVault.js 走正式兩段轉移補上，否則轉位候選恆空、面板恆不浮現、
  // 這條測試兩個方向都零鑑別力
  const { ENGINEERED_OPEN } = await import('../src/career/positionFlags.js');
  const openFlags = (storage) => {
    const s = createCareerStore(storage);
    for (const p of ENGINEERED_OPEN) { s.markPositionReady(p); s.approveOpenPosition(p); }
    return storage;
  };
  // 反向：守衛不能把面板整個殺掉——7/8 未收束，請調入口該在
  const midText = await renderCareer(openFlags(uniStorage('meixi', 7)));
  assert.match(midText, /去找教練/, '未收束時請調入口消失＝守衛過寬');
  // 正向：8/8 已收束（結算分支渲染），面板不得同框——舊守衛問 careerStage
  // （對大學恆 'national'）就是在這裡穿幫的
  const doneText = await renderCareer(openFlags(uniStorage('meixi', 8)));
  assert.match(doneText, /賽季結束|大學聯賽冠軍|聯賽第/, 'fixture 前提：8/8 已進結算分支');
  assert.doesNotMatch(doneText, /去找教練/, '賽季已收束＝屆間談話的時段，不重疊');
});

test('大二卷批4：推進按鈕先播送別與新生亮相，演出完落回新賽季', async () => {
  const text0 = await renderCareer(uniStorage('meixi', 8));
  assert.match(text0, /進入大二/, 'fixture 前提：8/8 收束畫面有推進按鈕');
  const btn = nodeWith(/進入大二/);
  let t = btn;
  while (t && !(t.handlers?.pointerdown ?? []).length) t = t.parent;
  tap(t);
  await settle();
  const dlg = allText();
  // meixi 大一季末畢業者皆非 ace ⇒ 教練開場＋通用送別句（uniGraduation.js）
  assert.match(dlg, /四年級的，留下來說幾句/, '送別對話沒開場');
  // 逐格點掉對話（送別＋新生亮相）——「點擊繼續」提示節點自身沒有 handler
  // （handler 在對話卡根上），要照 clearDialogs 樣板 walk＋爬 parent，
  // 用 nodeWith 會第一輪就 break（本測第一版就是這樣假紅的）
  let sawIntro = false;
  for (let i = 0; i < 20; i += 1) {
    if (/補進來的新生/.test(allText())) sawIntro = true;
    const cont = walk(globalThis.document.body).find((n) => /點擊繼續/.test(n.textContent ?? ''));
    if (!cont) break;
    let c = cont;
    while (c && !(c.handlers?.pointerdown ?? []).length) c = c.parent;
    if (!c) break;
    tap(c);
    await settle();
    if (/大學第 2 年/.test(allText())) break; // 演出收尾、已落回大二
  }
  assert.ok(sawIntro, '新生亮相沒播（送別與亮相的演出鏈斷了）');
  assert.match(allText(), /大學第 2 年/, '演出結束沒落回大二生涯畫面');
});

test('大二卷批4：大四打完＝謝幕佔位過場卡，不出現推進按鈕', async () => {
  const storage = uniStorage('meixi', 8);
  // 推到大四打完：三次〔推進＋打滿〕（走正式 store 鏈）
  for (let y = 0; y < 3; y += 1) {
    const s = createCareerStore(storage);
    assert.ok(s.advanceSeason(), `第 ${y + 1} 次推進要成功`);
    const c = s.loadCareer();
    s.saveCareer({
      ...c,
      results: c.schedule.filter((m) => m.round === 'league').map((m, i) => ({
        matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
        scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
      })),
    });
  }
  const text = await renderCareer(storage);
  assert.doesNotMatch(text, /進入大[二三四五]/, '大四末不得再有推進按鈕');
  assert.match(text, /四年打完了——謝幕/, '謝幕入口沒出現');
  const btn = nodeWith(/四年打完了——謝幕/);
  let t = btn;
  while (t && !(t.handlers?.pointerdown ?? []).length) t = t.parent;
  tap(t);
  await settle();
  assert.match(allText(), /第二章・完/, '過場卡沒開');
});
