// 多年職業生涯卷 小批（2026-08-27 夜）— DOM 接線
// 驗收＝docs/kickoffs/acceptance-milestone-rival-20260827.md（M2/M5、R2/R5 的真實 UI 行為）。
// 純函式層另見 tests/milestone-rival-batch1.test.mjs。假 DOM 沿
// tests/multiyear-pro-batch5.test.mjs 同款（帶參數 replaceChildren——債清批教訓）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { MILESTONE_TEAM_TRUST_BONUS } from '../src/career/proMilestones.js';

// ════════════════════════════════════════════════════════════════
// 共用治具（逐字沿 tests/multiyear-pro-batch5.test.mjs 同款）
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

function proSaveInProgress(teamId = 'tiegu-warlords') {
  const storage = settledUniSave();
  assert.ok(createCareerStore(storage).enterCorporate('chaoxi-marine'), 'fixture 前提：入企業章成功');
  playRoundRobin(storage, 'corp');
  assert.ok(createCareerStore(storage).settleCorpFinale(), 'fixture 前提：企業季結算成功');
  assert.ok(createCareerStore(storage).enterPro(teamId), 'fixture 前提：入職業章成功');
  return storage;
}

/**
 * 讓存檔輸掉 N 個完整職業季（逐季結算＋推進），最終停在第 N+1 年開局。
 * 推進後職業屆間「路線／體能」兩段 pending 各自清一次（chooseProGrowth 的
 * 'rest'／'fitness-skip' 是純店層 API、跳過選擇的等效行為，不需要真的點 UI
 * ——同 careerScreen.js showProGrowthChoice 面板的「先不練」「休息」選項）；
 * 否則 renderCareer 的屆間閘會擋住「▶ 出戰」，這是本檔實測抓到的真實接線行為。
 */
function advanceProYears(storage, n) {
  for (let y = 0; y < n; y += 1) {
    loseOutSeason(storage);
    assert.ok(createCareerStore(storage).settleProFinale(), `fixture 前提：第 ${y + 1} 職業季結算成功`);
    assert.ok(createCareerStore(storage).advanceSeason(), `fixture 前提：第 ${y + 1} 年推進成功`);
    const s = createCareerStore(storage);
    assert.ok(s.chooseProGrowth('rest'), `fixture 前提：第 ${y + 1} 年推進後路線段清除成功`);
    assert.ok(s.chooseProGrowth('fitness-skip'), `fixture 前提：第 ${y + 1} 年推進後體能段清除成功`);
  }
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
// 對話框逐句推進——同 tests/pro-batch5-wiring.test.mjs 的 tapDialogsAll 慣例
// （點擊事件掛在 dlg 外層容器，「▼ 點擊繼續」節點本身沒有 handler，得往上找）
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
/** 只推進對話框一句（同一個「王勝翔宿敵線」preEvs 消費點會把里程碑卡＋宿敵年表句
 * 接成一條隊列一起播——要斷言特定一句就不能 tapDialogsAll 到底，得精準點一下）。 */
const tapDialogOnce = async () => {
  const cont = walk(globalThis.document.body).find((n) => /點擊繼續/.test(n.textContent ?? ''));
  let p = cont;
  while (p && !(p.handlers?.pointerdown ?? []).length) p = p.parent;
  assert.ok(p, 'fixture 前提：對話框要找得到可點擊的容器');
  tap(p);
  await settle();
};

async function openCareerScreen(storage) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const screen = createCareerScreen(createCareerStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
  // 吃掉開場劇情卡（沿 multiyear-pro-batch5-wiring 慣例）
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
  return screen;
}

const saveOf = (storage) => JSON.parse(storage.getItem(SAVE_KEY));

// ════════════════════════════════════════════════════════════════
// M2：老兵之年（第 5 年）真的接進 preEvs、真的播出來、小獎勵真的落存檔
// ════════════════════════════════════════════════════════════════
test('M2 老兵之年：第 5 年賽前真的播出敘事卡（{speaker,text} 分容器），全隊信任真的 +2', async () => {
  const storage = proSaveInProgress('tiegu-warlords');
  advanceProYears(storage, 4); // 打完前 4 個職業季（archive 4 筆）＝正要開打第 5 年
  const before = saveOf(storage).lineup?.trust ?? {};
  const someId = Object.keys(before)[0];
  assert.ok(someId, 'fixture 前提：lineup.trust 至少有一名隊友');
  await openCareerScreen(storage);
  const outBtn = findBtn(/▶ 出戰/);
  assert.ok(outBtn, 'fixture 前提：第 5 年第一場「▶ 出戰」鈕要渲染得出來');
  tap(outBtn);
  await settle();
  const confirmBtn = findBtn(/確認出戰/);
  assert.ok(confirmBtn, '對陣畫面要能確認出戰');
  tap(confirmBtn);
  await settle();
  // 敘事卡第一句（speaker=''）已隨 fireEvents 同步 paint；點一下推進到第二句
  // （speaker='教練'）——同一個 preEvs 消費點後面還接了 R2 宿敵年表句，不能
  // tapDialogsAll 到底，否則斷言會落在 R2 那句上（真實踩到過，見上一輪失敗紀錄）
  await tapDialogOnce();

  const text = allText();
  assert.match(text, /第五個年頭/, '老兵之年敘事卡要出現在畫面上');

  // {speaker,text} 分容器斷言（探針卷空白泡棚教訓）：講話者與台詞要落在不同節點，
  // 不是同一顆節點把整句字串塞進去
  const speakerNode = walk(globalThis.document.body)
    .find((n) => n.textContent === '教練');
  assert.ok(speakerNode, 'speaker 容器要有「教練」字樣，不是空字串（字串誤用會讓這裡是空白）');
  const textNode = walk(globalThis.document.body)
    .find((n) => /這份重量，你扛得起/.test(n.textContent ?? ''));
  assert.ok(textNode, 'text 容器要有台詞內容');
  assert.notEqual(speakerNode, textNode, 'speaker 與 text 是不同節點（{speaker,text} 物件的分容器落點）');

  const after = saveOf(storage).lineup?.trust ?? {};
  assert.equal(after[someId], (before[someId] ?? 0) + MILESTONE_TEAM_TRUST_BONUS,
    '小獎勵要真的寫進 lineup.trust（全隊 +2 級別，具名常數）');
});

test('M4 回歸：年資未達門檻（第 1 年）不播里程碑卡、trust 不動', async () => {
  const storage = proSaveInProgress('tiegu-warlords'); // 尚未打完任何一季，年資=1
  const before = saveOf(storage).lineup?.trust ?? {};
  await openCareerScreen(storage);
  tap(findBtn(/▶ 出戰/));
  await settle();
  const confirmBtn = findBtn(/確認出戰/);
  if (confirmBtn) { tap(confirmBtn); await settle(); }
  assert.doesNotMatch(allText(), /第五個年頭|第九個年頭|王朝/, '未達門檻不得出現任何里程碑錨點文字');
  assert.deepEqual(saveOf(storage).lineup?.trust ?? {}, before, '未觸發＝trust 不動');
});

// ════════════════════════════════════════════════════════════════
// R2：宿敵生涯鏡像也真的接進同一個 preEvs 消費點
// ════════════════════════════════════════════════════════════════
test('R2 第 3 年隊長句：真的接進 preEvs、真的播出來（敵隊語氣，非同隊存檔）', async () => {
  const storage = proSaveInProgress('tiegu-warlords');
  advanceProYears(storage, 2); // 打完前 2 個職業季＝正要開打第 3 年
  await openCareerScreen(storage);
  tap(findBtn(/▶ 出戰/));
  await settle();
  const confirmBtn = findBtn(/確認出戰/);
  assert.ok(confirmBtn, '對陣畫面要能確認出戰');
  tap(confirmBtn);
  await settle();
  const text = allText();
  assert.match(text, /隊長袖標/, '第 3 年隊長句要出現在畫面上');
  assert.match(text, /王勝翔/, '講話者要是王勝翔');
});

// ════════════════════════════════════════════════════════════════
// 回歸：既有王勝翔宿敵線 wiring 零漂移（本檔不動 proEvents.js，這裡只是再跑一次
// 既有測試檔本身佐證——真正的零改動證據是 git diff --stat 不含 proEvents.js）
// ════════════════════════════════════════════════════════════════
test('回歸探針：本卷新增不影響既有企業章存檔（round 非 pro 時兩條新敘事線皆不觸發）', async () => {
  const storage = settledUniSave();
  assert.ok(createCareerStore(storage).enterCorporate('chaoxi-marine'), 'fixture 前提：入企業章成功');
  await openCareerScreen(storage);
  const outBtn = findBtn(/▶ 出戰/);
  if (outBtn) { tap(outBtn); await settle(); }
  const confirmBtn = findBtn(/確認出戰/);
  if (confirmBtn) { tap(confirmBtn); await settle(); }
  const text = allText();
  assert.doesNotMatch(text, /第五個年頭|第九個年頭|王朝|隊長袖標|MVP 獎盃/, '企業章存檔不得誤觸發職業章的新敘事線');
});
