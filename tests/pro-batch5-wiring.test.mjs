// 職業章批 5「敘事層」— DOM 接線（2026-08-26）
// 驗收＝docs/kickoffs/acceptance-pro-batch5.md（G1/G2/G3 的真實 UI 行為）。
// 純函式層另見 tests/pro-batch5.test.mjs。假 DOM 形狀沿 tests/pro-entry-wiring.test.mjs
// （同源，避免替身漂移；帶參數 replaceChildren——債清批 2026-08-26 教訓）。
//
// ★ 改前紅 ★ 本檔測的是 careerScreen.js 既有函式（showProDone／preEvs／
// showProSeasonClosing）的接線；worktree HEAD=7f62cc6 上這三處都還沒有批 5 的
// 呼叫，所以本檔在批 5 之前跑會是**行為級**紅（畫面上真的少那幾句文案/對白），
// 不是 import 炸檔——與 tests/pro-batch5.test.mjs（新檔案、import 級紅）互補。
//
// ★ events 落點 ★ careerViewOf（schema.js）把 season.events 投影成 career.events
// 給 runtime 邏輯用；但存檔落地時事件陣列真正寫在 `save.season.events`，不是
// `save.career.events`（後者是章節/名次等跨季資料）。斷言事件入帳一律讀
// `save.season.events`——這是本檔實測抓到的落點，不是猜的。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { buildSyntheticSave, advanceToPro } from '../src/career/devSeed.js';
import { FINISH } from '../src/career/admission.js';

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
    replaceChildren(...kids) { this.children = []; for (const k of kids) this.appendChild(k); },
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

async function openCareerScreen(storage) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const { createCareerStore: mkStore } = await import('../src/career/careerStore.js');
  const screen = createCareerScreen(mkStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
  return screen;
}

/** 大學四年打完、謝幕已結算的存檔（逐字沿 pro-entry-wiring.test.mjs 的 u4Save）。 */
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

/** 簽入企業隊＋打滿企業那一季（逐字沿 pro-entry-wiring.test.mjs 的 corpSave）。 */
function corpSave(played = 7, corpId = 'panshi-heavy', school = 'meixi') {
  const storage = u4Save(school);
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

/** 治具直達職業章開局（未打任何一場）——已簽入指定隊，走 devSeed 正式鏈（同大學海硯）。 */
function proReadyStorage(teamId) {
  const storage = fakeStorage();
  storage.setItem(SAVE_KEY, JSON.stringify(buildSyntheticSave({ finish: FINISH.CHAMPION })));
  const store = createCareerStore(storage);
  assert.ok(advanceToPro(store, { teamId }), 'fixture 前提：治具跳到職業章成功');
  return storage;
}

/**
 * 同 proReadyStorage，但大學母校可指定（用來控制「有沒有跟簡子嵐同隊」——
 * devSeed.advanceToPro 固定走海硯大學，海硯正是簡子嵐的校，G3② 的負向情境
 * 需要換一所別校）。手動走 store 正式鏈（enterUniversity→四年→settleUniFinale→
 * enterCorporate→打滿→settleCorpFinale→enterPro），與 devSeed 的三顆函式同構。
 */
function proReadyStorageWithSchool(teamId, school) {
  const storage = corpSave(7, 'panshi-heavy', school);
  const s = createCareerStore(storage);
  assert.ok(s.settleCorpFinale(), 'fixture 前提：企業季結算成功');
  assert.ok(s.enterPro(teamId), 'fixture 前提：簽入職業隊成功');
  return storage;
}

/** 治具直達「下一場就是對蒼羽泰坦」的職業章存檔（敵隊變體用）。 */
function proReadyRivalStorage(teamId) {
  const storage = proReadyStorage(teamId);
  const store = createCareerStore(storage);
  const career = store.loadCareer();
  const league = (career.schedule ?? []).filter((m) => m.round === 'pro');
  const idx = league.findIndex((m) => m.opponentId === 'cangyu-titans');
  assert.ok(idx >= 0, 'fixture 前提：職業賽程裡一定有一場對蒼羽泰坦（八隊循環全打一次）');
  if (idx > 0) {
    store.saveCareer({
      ...career,
      results: league.slice(0, idx).map((m, i) => ({
        matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
        scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
      })),
    });
  }
  return storage;
}

function seasonEventsOf(storage) {
  return JSON.parse(storage.getItem(SAVE_KEY)).season?.events ?? [];
}

function playAllPro(store) {
  let career = store.loadCareer();
  for (let guard = 0; guard < 20; guard += 1) {
    const league = (career.schedule ?? [])
      .filter((m) => m.round === 'pro' || m.round === 'semi' || m.round === 'final');
    const unresolved = league.filter((m) => !(career.results ?? []).some((r) => r.matchId === m.id));
    if (!unresolved.length) break;
    const next = unresolved[0];
    store.saveCareer({
      ...career,
      results: [...career.results, {
        matchId: next.id, opponentId: next.opponentId, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3,
      }],
    });
    career = store.loadCareer(); // growProSchedule（季後賽長場次）由 saveCareer 內部接線
  }
  return career;
}

// ════════════════════════════════════════════════════════════════
// G1：職業合約卡（showProDone）
// ════════════════════════════════════════════════════════════════
test('G1 職業初登場卡要含合約文案（同企業章 A4-1 的併卡做法，走真實簽約 UI）', async () => {
  const storage = corpSave(7);
  await openCareerScreen(storage);
  tap(findBtn(/賽季落幕/));
  await settle();
  tap(findBtn(/前往下一個舞台/));
  await settle();
  await tapDialogsAll();
  tap(findBtn(/簽這一隊/));
  await settle();
  tap(findBtn(/簽約/));
  await settle();
  const text = allText(globalThis.document.body);
  assert.match(text, /職業初登場/, '對照：既有的收尾卡本身要在');
  assert.match(text, /唯一的身分/, '合約卡文案要出現在畫面上（PRO_CONTRACT_LINES 第一句）');
});

// ════════════════════════════════════════════════════════════════
// G2：王勝翔同場宿敵線
// ════════════════════════════════════════════════════════════════
test('G2① 簽他隊：循環賽首次對戰蒼羽泰坦的賽前對話要真的播出來', async () => {
  const storage = proReadyRivalStorage('tiegu-warlords');
  await openCareerScreen(storage);
  const outBtn = findBtn(/▶ 出戰/);
  assert.ok(outBtn, 'fixture 前提：職業章下一場的「▶ 出戰」鈕要渲染得出來');
  tap(outBtn);
  await settle();
  const confirmBtn = findBtn(/確認出戰/);
  assert.ok(confirmBtn, '對陣畫面要能確認出戰');
  tap(confirmBtn);
  await settle();
  const text = allText(globalThis.document.body);
  assert.match(text, /制空者|王勝翔/, '王勝翔賽前對話要出現');
  assert.match(text, /四年/, '資歷差四年錨點要在畫面上');

  const events = seasonEventsOf(storage);
  assert.ok(events.includes('pro-wang-rival'), '事件要入帳（一生一次）');
  assert.ok(!events.includes('pro-wang-teammate'), '互斥：敵隊變體不得同時入帳同隊變體的事件 id');
});

test('G2② 簽蒼羽泰坦：第一場賽前播隊內首見台詞，不播對戰版', async () => {
  const storage = proReadyStorage('cangyu-titans');
  await openCareerScreen(storage);
  tap(findBtn(/▶ 出戰/));
  await settle();
  tap(findBtn(/確認出戰/));
  await settle();
  const text = allText(globalThis.document.body);
  assert.match(text, /王勝翔/, '隊內首見台詞要出現');
  assert.doesNotMatch(text, /制空者。這個聯賽的天花板/, '不得播對戰版措辭');

  const events = seasonEventsOf(storage);
  assert.ok(events.includes('pro-wang-teammate'));
  assert.ok(!events.includes('pro-wang-rival'), '互斥：同隊變體不得誤觸敵隊事件');
});

test('G2③ 一生一次：預先入帳後重看，不會再播第二次', async () => {
  const storage = proReadyRivalStorage('tiegu-warlords');
  const store = createCareerStore(storage);
  const career = store.loadCareer();
  assert.ok(store.saveCareer({ ...career, events: ['pro-wang-rival'] }), 'fixture：預先入帳');
  assert.ok(seasonEventsOf(storage).includes('pro-wang-rival'), 'fixture 前提：入帳確實落在 season.events');
  await openCareerScreen(storage);
  tap(findBtn(/▶ 出戰/));
  await settle();
  const confirmBtn = findBtn(/確認出戰/);
  if (confirmBtn) { tap(confirmBtn); await settle(); }
  const text = allText(globalThis.document.body);
  assert.doesNotMatch(text, /終於。同一個聯賽/, '播過一次不得重播');
});

test('回歸：企業章存檔零誤觸發（round 不是 pro，preEvs 不含王勝翔宿敵線）', async () => {
  // 簽入王勝翔企業章時期的母隊（擎空航太）——企業章自己的王勝翔亮相事件會播
  // （corp-wang-intro，既有行為），但職業章的兩個新事件 id 都不得入帳。
  const storage = corpSave(7, 'qingkong-aero');
  await openCareerScreen(storage);
  const outBtn = findBtn(/▶ 出戰/);
  if (outBtn) { tap(outBtn); await settle(); }
  const confirmBtn = findBtn(/確認出戰/);
  if (confirmBtn) { tap(confirmBtn); await settle(); }
  await tapDialogsAll();
  const events = seasonEventsOf(storage);
  assert.ok(!events.includes('pro-wang-teammate'), '企業章存檔不得誤觸發職業章的隊內首見事件');
  assert.ok(!events.includes('pro-wang-rival'), '企業章存檔不得誤觸發職業章的敵隊宿敵事件');
});

// ════════════════════════════════════════════════════════════════
// G3：收尾卡點名＋條件簡子嵐
// ════════════════════════════════════════════════════════════════
test('G3① 收尾卡恆有國外強權點名句', async () => {
  const storage = proReadyStorage('moye-outlaws');
  const store = createCareerStore(storage);
  playAllPro(store);
  await openCareerScreen(storage);
  await tapDialogsAll(); // 球探分析師開場泡泡（同 D 系列面板既有行為）先消化掉
  const closeBtn = findBtn(/賽季落幕——職業元年/);
  assert.ok(closeBtn, 'fixture 前提：職業賽季要打完，收尾卡入口才會出現');
  tap(closeBtn);
  await settle();
  const text = allText(globalThis.document.body);
  assert.match(text, /海外|次元/, '國外強權點名句要出現');
});

test('G3② 條件簡子嵐——同隊（海硯大學）存檔要播「更大的海」收束句', async () => {
  const storage = proReadyStorage('moye-outlaws'); // devSeed 固定走海硯（簡子嵐母校）
  const store = createCareerStore(storage);
  const uniRoster = store.loadUniRoster?.();
  assert.ok((uniRoster?.members ?? []).some((m) => m?.fullName === '簡子嵐'),
    'fixture 前提：海硯名冊要真的含簡子嵐');
  playAllPro(store);
  await openCareerScreen(storage);
  await tapDialogsAll();
  tap(findBtn(/賽季落幕——職業元年/));
  await settle();
  const text = allText(globalThis.document.body);
  assert.match(text, /簡子嵐/, '同隊過的存檔要播出簡子嵐收束句');
});

test('G3② 條件簡子嵐——未同隊（別校）存檔零可見', async () => {
  const storage = proReadyStorageWithSchool('moye-outlaws', 'meixi');
  const store = createCareerStore(storage);
  const uniRoster = store.loadUniRoster?.();
  assert.ok(!(uniRoster?.members ?? []).some((m) => m?.fullName === '簡子嵐'),
    'fixture 前提：別校名冊不含簡子嵐');
  playAllPro(store);
  await openCareerScreen(storage);
  await tapDialogsAll();
  tap(findBtn(/賽季落幕——職業元年/));
  await settle();
  const text = allText(globalThis.document.body);
  assert.doesNotMatch(text, /簡子嵐/, '未同隊存檔不得看到簡子嵐收束句');
});
