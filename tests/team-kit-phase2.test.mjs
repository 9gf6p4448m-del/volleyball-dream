// 配色卷階段二 —— E1/E3/E4/E5 行為測試（acceptance-kit-phase2.md V1-V6）。
// K 系列（E6 色距）與批 1 既有守門在 tests/team-kit.test.mjs，本檔不重複。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  careerMatchSetup, createCareer, createCareerPlayer, careerStage,
} from '../src/career/careerState.js';
import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { ensureStarterRoster, OUR_TEAM_NAME } from '../src/career/roster.js';
import { settleCareerMatch } from '../src/app/matchCareer.js';
import { normalizeChapter, currentTeamName } from '../src/career/chapter.js';
import { universityById } from '../src/career/universities.js';
import { resolveMatchConfig } from '../src/app/matchConfig.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

const winGame = { players: { A2: { teamId: 'A' } }, match: { score: { A: 25, B: 18 }, winner: 'A' }, events: [], scoutTally: {} };
const loseGame = { players: { A2: { teamId: 'A' } }, match: { score: { A: 19, B: 25 }, winner: 'B' }, events: [], scoutTally: {} };

// 打完一屆走到收束（小組全勝＋國賽敗＝eliminated）——同 tests/three-seasons.test.mjs 手法
function playSeasonToElimination(store) {
  for (;;) {
    const career = store.loadCareer();
    const next = career.schedule.find((m) => !career.results.some((r) => r.matchId === m.id));
    if (!next || careerStage(career) === 'eliminated') break;
    settleCareerMatch({
      careerCtx: { store, career, player: store.loadPlayer(), matchEntry: next },
      game: next.stage === 'national' ? loseGame : winGame,
      playerId: 'A2',
    });
    if (careerStage(store.loadCareer()) === 'eliminated') break;
  }
}

function highSchoolStore() {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed: 42, playerName: '測' }));
  store.savePlayer(createCareerPlayer('測'));
  ensureStarterRoster(store);
  return store;
}

/** 已經升學到指定學校的存檔（同 tests/uni-season-wiring.test.mjs 的 uniStorage 手法）。 */
function universitySetup(schoolId) {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  store.saveCareer(createCareer({ seed: 42, playerName: '測' }));
  store.savePlayer(createCareerPlayer('測'));
  ensureStarterRoster(store);
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 3; // 大學第一年是第 4 屆——enterUniversity 內部 nextSeason = index+1
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  createCareerStore(storage).enterUniversity(schoolId);
  return { storage, store: createCareerStore(storage) };
}
function universityStore(schoolId) {
  return universitySetup(schoolId).store;
}

// ════════ E1：careerMatchSetup 第 7 參數 school → kits.A ════════

test('E1：高中章 kits.A 維持現狀（不補 A 面，undefined）', () => {
  const career = createCareer({ seed: 1, playerName: '測' });
  const player = createCareerPlayer('測');
  const hs = careerMatchSetup(career, player, career.schedule[0], null, null, 1);
  assert.equal(hs.kits.A, undefined);
});

test('E1：大學章＋已選校 → kits.A＝入學校 kit（E2：.libero 隨附，一併確認）', () => {
  const career = createCareer({ seed: 1, playerName: '測' });
  const player = createCareerPlayer('測');
  const uni = careerMatchSetup(
    career, player, { id: 'uni-test-1', opponentId: 'north-ridge' }, null, null, 4, 'haiyan',
  );
  const expectedKit = universityById('haiyan').kit;
  assert.deepEqual(uni.kits.A, expectedKit);
  assert.ok(uni.kits.A.libero, 'E2：自由人色隨 kits.A 一併帶，resolveKit(A,true,kit) 吃得到');
});

test('E1 反向對照：school 查無效（壞 id）→ kits.A 不補，安全回退同高中', () => {
  const career = createCareer({ seed: 1, playerName: '測' });
  const player = createCareerPlayer('測');
  const uni = careerMatchSetup(
    career, player, { id: 'uni-test-1', opponentId: 'north-ridge' }, null, null, 4, 'no-such-school',
  );
  assert.equal(uni.kits.A, undefined);
});

// ════════ E3：currentTeamName ════════

test('E3：高中章（含缺席 chapter）恆 OUR_TEAM_NAME', () => {
  assert.equal(currentTeamName(normalizeChapter(null)), OUR_TEAM_NAME);
  assert.equal(currentTeamName(normalizeChapter({ chapter: { id: 'highschool' } })), OUR_TEAM_NAME);
  // school 誤傳也不影響——高中章分支不看 school
  assert.equal(currentTeamName(normalizeChapter(null), 'haiyan'), OUR_TEAM_NAME);
});

test('E3：大學章＋已選校 → 入學校名', () => {
  const uniChapter = normalizeChapter({ chapter: { id: 'university', enteredAtSeason: 4 } });
  assert.equal(currentTeamName(uniChapter, 'haiyan'), universityById('haiyan').name);
  assert.equal(currentTeamName(uniChapter, 'north-ridge'), universityById('north-ridge').name);
});

test('E3 反向對照：大學章但未選校／壞校 id → 安全回退 OUR_TEAM_NAME', () => {
  const uniChapter = normalizeChapter({ chapter: { id: 'university', enteredAtSeason: 4 } });
  assert.equal(currentTeamName(uniChapter, null), OUR_TEAM_NAME);
  assert.equal(currentTeamName(uniChapter, 'no-such-school'), OUR_TEAM_NAME);
});

// ════════ E4：resolveMatchConfig.teamName（單一入口實際接線；真實 store 路徑）════════

test('E4：config.teamName 高中/大學雙向＋快速比賽＝null（真實 careerStore 路徑）', () => {
  const hsStore = highSchoolStore();
  const hsCareer = hsStore.loadCareer();
  const hsConfig = resolveMatchConfig({
    params: new URLSearchParams(''),
    careerCtx: {
      store: hsStore, career: hsCareer, player: hsStore.loadPlayer(),
      matchEntry: hsCareer.schedule[0], roster: hsStore.loadRoster(), lineup: hsStore.loadLineup(),
      seasonIndex: 1,
    },
    randomSeed: 1,
  });
  assert.equal(hsConfig.teamName, OUR_TEAM_NAME);

  const uniStore = universityStore('haiyan');
  const uniCareer = uniStore.loadCareer();
  const uniConfig = resolveMatchConfig({
    params: new URLSearchParams(''),
    careerCtx: {
      store: uniStore, career: uniCareer, player: uniStore.loadPlayer(),
      matchEntry: uniCareer.schedule[0], roster: uniStore.loadRoster(), lineup: uniStore.loadLineup(),
      seasonIndex: uniStore.seasonIndex(),
    },
    randomSeed: 1,
  });
  assert.equal(uniConfig.teamName, universityById('haiyan').name);
  // 順手驗 E1 真的透過同一條生產路徑接上（不只是單元測試裡直呼 careerMatchSetup）
  assert.deepEqual(uniConfig.kits.A, universityById('haiyan').kit);

  const quickConfig = resolveMatchConfig({
    params: new URLSearchParams(''), careerCtx: null, randomSeed: 1,
  });
  assert.equal(quickConfig.teamName, null);
});

// ════════ E5：進行中雙源判定（真實 DOM 接線——直接驗 careerScreen.js 的兩個掛點）════════

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
    localStorage: (() => {
      const m = new Map();
      return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
      };
    })(),
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

// 賽前/屆初劇情對話要先點完才會到主畫面（同 tests/uni-season-wiring.test.mjs 手法）；
// 對話卡是模組層級隱藏單例，找不到「點擊繼續」才算清完，不能拿次數當結束條件之外的判斷
async function clearDialogs() {
  for (let i = 0; i < 12; i += 1) {
    const cont = walk(globalThis.document.body).find((n) => /點擊繼續/.test(n.textContent ?? ''));
    if (!cont) break;
    let t = cont;
    while (t && !(t.handlers?.pointerdown ?? []).length) t = t.parent;
    if (!t) break;
    tap(t);
    await settle();
  }
}

async function openCareerTotals(storage, btnPattern = /生涯數據/) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  createCareerScreen(createCareerStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPractice: () => {}, onPlay: () => {},
  }).show('career');
  await settle();
  await clearDialogs();
  // 屆初教學局邀請卡（新開/新一屆的季一開場就會彈，非本測試範圍）——跳過它
  // 才走得到主生涯畫面，同 tests/tutorial-match.test.mjs「跳過」路徑
  const skipTutorial = nodeWith(/我打過了，跳過/);
  if (skipTutorial) {
    tap(skipTutorial);
    await settle();
    await clearDialogs();
  }
  const btn = nodeWith(btnPattern);
  assert.ok(btn, '找不到生涯數據入口——E5 測試前提不成立');
  tap(btn);
  await settle();
  return allText();
}

test('E5：①真正進行中的即時季照標（進行中）', async () => {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  store.saveCareer(createCareer({ seed: 7, playerName: '測' }));
  store.savePlayer(createCareerPlayer('測'));
  ensureStarterRoster(store);
  // 一場都沒打——group 階段、貨真價實的「進行中」
  assert.equal(careerStage(store.loadCareer()), 'group');
  const text = await openCareerTotals(storage);
  assert.match(text, /第 1 屆（進行中）/, '真正進行中的季沒有標「進行中」');
});

test('E5：②已收束的即時季（eliminated）不標「進行中」', async () => {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  store.saveCareer(createCareer({ seed: 7, playerName: '測' }));
  store.savePlayer(createCareerPlayer('測'));
  ensureStarterRoster(store);
  playSeasonToElimination(store);
  assert.equal(careerStage(store.loadCareer()), 'eliminated');
  const text = await openCareerTotals(storage);
  assert.match(text, /第 1 屆/, '賽季卡片本身該出現');
  assert.doesNotMatch(text, /第 1 屆（進行中）/, '已收束（eliminated）的季不該再標「進行中」');
});

test('E5：③archive 陣列內的季恆不標「進行中」（即使剛好是收束的那屆）', async () => {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  store.saveCareer(createCareer({ seed: 7, playerName: '測' }));
  store.savePlayer(createCareerPlayer('測'));
  ensureStarterRoster(store);
  playSeasonToElimination(store);
  store.advanceSeason(); // 第 1 屆進 archive、屆數推進到第 2 屆（新一屆尚未開打）
  assert.equal(store.seasonIndex(), 2);
  assert.equal(careerStage(store.loadCareer()), 'group'); // 第 2 屆全新開局＝真進行中
  // 屆間集訓（屬本卷範圍外的另一套互動覆蓋層）不是這個測試的對象——直接清掉
  // campPending 待辦，繞過它進到主畫面，跟「進行中」判定完全無關
  store.savePlayer({ ...store.loadPlayer(), campPending: null });
  const text = await openCareerTotals(storage);
  assert.doesNotMatch(text, /第 1 屆（進行中）/, 'archive 內的第 1 屆不該標進行中');
  assert.match(text, /第 2 屆（進行中）/, '第 2 屆是真正進行中的即時季，該標');
});

// 打完大學聯賽全部場次——「league 全有結果」＝收束（careerScreen uniSeasonDone 同判準）
function playUniLeagueAll(store) {
  for (;;) {
    const career = store.loadCareer();
    const next = career.schedule
      .filter((m) => m.round === 'league')
      .find((m) => !career.results.some((r) => r.matchId === m.id));
    if (!next) break;
    settleCareerMatch({
      careerCtx: { store, career, player: store.loadPlayer(), matchEntry: next },
      game: winGame,
      playerId: 'A2',
    });
  }
}

const UNI_TOTALS_BTN = /生涯數據|回看三年的數據/;

test('E5：④大學章真正進行中的即時季照標（進行中）', async () => {
  const { storage, store } = universitySetup('haiyan');
  const idx = store.seasonIndex();
  const text = await openCareerTotals(storage, UNI_TOTALS_BTN);
  assert.match(text, new RegExp(`第 ${idx} 屆（進行中）`), '大學章一場未打＝真進行中，該標');
});

test('E5：⑤大學章 league 全打完的即時季不標「進行中」（覆審 CRITICAL 的行為斷言）', async () => {
  const { storage, store } = universitySetup('haiyan');
  playUniLeagueAll(store);
  const career = store.loadCareer();
  const league = career.schedule.filter((m) => m.round === 'league');
  assert.ok(league.length > 0
    && league.every((m) => career.results.some((r) => r.matchId === m.id)),
  '治具前提：league 全有結果');
  const idx = store.seasonIndex();
  const text = await openCareerTotals(storage, UNI_TOTALS_BTN);
  assert.match(text, new RegExp(`第 ${idx} 屆`), '賽季卡片本身該出現');
  assert.doesNotMatch(text, new RegExp(`第 ${idx} 屆（進行中）`),
    '大學球季打完＝已收束，不該再標「進行中」');
});
