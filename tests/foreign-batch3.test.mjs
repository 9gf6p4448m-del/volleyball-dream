// 國外聯賽卷 批 3「UI 接線」（2026-08-27，src/ui/careerScreen.js＋DOM 行為級）
// 驗收＝docs/kickoffs/acceptance-foreign-batch3.md（F3-1～F3-10，動手前凍結）。
// 卷宗＝docs/kickoffs/foreign-league-kickoff.md。
//
// 治具沿 tests/foreign-batch2.test.mjs 同一條正式鏈**照抄**（該檔是批 2 凍結產物，
// 不改動它、不從它 import 私有函式——凍結驗收 F3-9 允許「import 或照抄同源」，本檔
// 選照抄，讓本檔自成一份不依賴其他測試檔內部實作的獨立回歸）。DOM 行為級測試手法
// 照抄 tests/pro-entry-wiring.test.mjs（假 DOM／tap／walk／allText 同構——純函式測試
// 證明不了「畫面真的依旗標改變」）。
//
// ════════════════════════════════════════════════════════════════
// F3-9 突變實測紀錄（★真的跑過★，指令＝`node --test tests/foreign-batch3.test.mjs`，
// 基準＝本檔 13 測全綠；每組突變跑完即用備份還原，最後再驗一次 13/0）
// ════════════════════════════════════════════════════════════════
// ① F3-3 解鎖閘 careerStore.js `transferOfferSetOf`（src/career/careerStore.js:140）
//    刪：`inForeign || foreignUnlocked(save) ? FOREIGN_TEAMS : []` → 改成 `FOREIGN_TEAMS`
//    → 紅 1／13＝「F3-3a／F3-8 未解鎖（在國內）：轉隊選單完全不出現海外分組」
//    （未解鎖存檔冒出 4 支海外隊——offers 集合本身漏了守衛，UI 照樣如實畫出，
//     正是「offers 單一事實源」的鑑別力：UI 沒有另一道閘能攔住這個洩漏）。
// ② F3-6 分流 careerScreen.js `proGames`（本批新增的併 'foreign' 那行，:2543）
//    刪：`|| x.round === 'foreign'`（filter 改回只認 'pro'）
//    → 紅 4／13＝「F3-2 海外續約鈕」「F3-3c 在海外」「F3-6 季末結算摘要卡」
//    「F3-10 端到端收束」全部斷在「賽季落幕」卡永遠不出現——proSeasonDone 恆
//    false，海外季卡死在這條鏈上（批 2 覆審 HIGH 正是這條，F3-10 的「壞版必紅」
//    即此突變）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { PRO_TIER_LABEL, proTeamById, proBaseSalaryFor } from '../src/career/proTeams.js';
import { PLAYOFF_ROUND } from '../src/career/proSchedule.js';
import { FOREIGN_TEAMS, FOREIGN_TIER_LABEL, isForeignTeamId } from '../src/career/foreignTeams.js';
import { advanceToForeign, buildSyntheticSave } from '../src/career/devSeed.js';
import { FINISH } from '../src/career/admission.js';

// ════════════════════════════════════════════════════════════════
// 治具（照抄 tests/foreign-batch2.test.mjs 的正式鏈手法，同源不 import）
// ════════════════════════════════════════════════════════════════
const HOME_TEAM = 'cangyu-titans';
const FOREIGN_TEAM = 'aurora-orion';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function winLeague(storage, round) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const games = c.schedule.filter((m) => m.round === round);
  assert.ok(games.length, `fixture 前提：${round} 循環場次存在`);
  s.saveCareer({
    ...c,
    results: games.map((m) => ({
      matchId: m.id, opponentId: m.opponentId, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3,
    })),
  });
}

function loseLeague(storage, round) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const games = c.schedule.filter((m) => m.round === round);
  s.saveCareer({
    ...c,
    results: games.map((m) => ({
      matchId: m.id, opponentId: m.opponentId, won: false, scoreFor: 0, scoreAgainst: 2, gp: 1,
    })),
  });
}

function playPlayoff(storage, round, won = true) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const m = c.schedule.find((x) => x.round === round);
  assert.ok(m, `fixture 前提：${round} 場次已長出`);
  s.saveCareer({
    ...c,
    results: [...c.results, {
      matchId: m.id, opponentId: m.opponentId, won, scoreFor: won ? 2 : 0, scoreAgainst: won ? 0 : 2, gp: 3,
    }],
  });
  return m;
}

function playRoundRobin(storage, round) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const games = c.schedule.filter((m) => m.round === round);
  s.saveCareer({
    ...c,
    results: games.map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
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

function proSaveInProgress(teamId = HOME_TEAM) {
  const storage = settledUniSave();
  assert.ok(createCareerStore(storage).enterCorporate('chaoxi-marine'), 'fixture 前提：入企業章成功');
  playRoundRobin(storage, 'corp');
  assert.ok(createCareerStore(storage).settleCorpFinale(), 'fixture 前提：企業季結算成功');
  assert.ok(createCareerStore(storage).enterPro(teamId), 'fixture 前提：入職業章成功');
  return storage;
}

/** 國內職業首季奪冠且已結算＝海外門檻已解鎖。 */
function unlockedProSave(teamId = HOME_TEAM) {
  const storage = proSaveInProgress(teamId);
  winLeague(storage, 'pro');
  playPlayoff(storage, PLAYOFF_ROUND.SEMI, true);
  playPlayoff(storage, PLAYOFF_ROUND.FINAL, true);
  assert.ok(createCareerStore(storage).settleProFinale(), 'fixture 前提：國內首季結算成功');
  return storage;
}

/** 國內職業首季全敗且已結算＝海外門檻未解鎖。 */
function lockedProSave(teamId = HOME_TEAM) {
  const storage = proSaveInProgress(teamId);
  loseLeague(storage, 'pro');
  assert.ok(createCareerStore(storage).settleProFinale(), 'fixture 前提：國內首季結算成功');
  return storage;
}

/** 已轉隊入海外隊、海外首季開局。 */
function foreignSaveInProgress(foreignId = FOREIGN_TEAM) {
  const storage = unlockedProSave();
  assert.ok(createCareerStore(storage).transferPro(foreignId), 'fixture 前提：轉隊入海外成功');
  return storage;
}

function playForeignChampionSeason(storage) {
  winLeague(storage, 'foreign');
  playPlayoff(storage, PLAYOFF_ROUND.SEMI, true);
  playPlayoff(storage, PLAYOFF_ROUND.FINAL, true);
}

/** 海外季奪冠且已結算——連同國內首季在內，是一份「國內+海外」混合生涯。 */
function settledForeignSeason(foreignId = FOREIGN_TEAM) {
  const storage = foreignSaveInProgress(foreignId);
  playForeignChampionSeason(storage);
  assert.ok(createCareerStore(storage).settleProFinale(), 'fixture 前提：海外季結算成功');
  return storage;
}

// ════════════════════════════════════════════════════════════════
// DOM 行為級手法（照抄 tests/pro-entry-wiring.test.mjs 的假 DOM，同構避免替身漂移）
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
const allText = (root) => walk(root).map((n) => n.textContent ?? '').join('｜');
const settle = () => new Promise((r) => { setTimeout(r, 0); });
const findBtn = (re) => walk(globalThis.document.body)
  .find((n) => n.tag === 'button' && re.test(n.textContent ?? ''));

// 照抄 tests/pro-entry-wiring.test.mjs 的 tapDialogsAll：「▼ 點擊繼續」本身未必掛
// pointerdown（掛在祖先容器上），要沿 parent 往上找到有掛的節點才點得動。
async function drainDialogs() {
  for (let i = 0; i < 30; i += 1) {
    const cont = walk(globalThis.document.body).find((n) => /點擊繼續/.test(n.textContent ?? ''));
    if (!cont) break;
    let p = cont;
    while (p && !(p.handlers?.pointerdown ?? []).length) p = p.parent;
    if (p) tap(p); else break;
    await settle();
  }
}

async function makeScreen(storage) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const { createCareerStore: mkStore } = await import('../src/career/careerStore.js');
  const screen = createCareerScreen(mkStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
  await drainDialogs();
  // 治具直接呼叫 transferPro/advanceSeason 會留下「屆間三選一」pending（每季一次）——
  // 那不是本批驗收範圍，一律跳過（好好休息），讓畫面落回正常生涯流程。
  for (let i = 0; i < 5; i += 1) {
    const skip = findBtn(/好好休息/);
    if (!skip) break;
    tap(skip);
    await settle();
    await drainDialogs();
  }
  return screen;
}

/** 渲染生涯主畫面（「還在打」的狀態），回傳可見文字。 */
async function renderMainText(storage) {
  await makeScreen(storage);
  return allText(globalThis.document.body);
}

/** 渲染主畫面並點開季末收尾卡（續約談判卡），回傳可見文字。 */
async function openClosingCard(storage) {
  await makeScreen(storage);
  const btn = findBtn(/賽季落幕/);
  assert.ok(btn, 'fixture 前提：賽季落幕卡入口要出現');
  tap(btn);
  await settle();
  return allText(globalThis.document.body);
}

// ════════════════════════════════════════════════════════════════
// F3-2：薪水顯示單一 helper
// ════════════════════════════════════════════════════════════════
test('F3-2 海外續約鈕：美金＋約合台幣', async () => {
  const text = await openClosingCard(settledForeignSeason());
  assert.match(text, /遞來了新合約/);
  const renewBtn = findBtn(/續約留隊/);
  assert.ok(renewBtn, '海外續約鈕要出現');
  assert.match(renewBtn.textContent, /^✍ 續約留隊——年薪 \$[\d.]+ 萬美金（約 \d+ 萬台幣）$/);
});

test('F3-2 國內續約鈕：維持「N 萬」（不得混進美金）', async () => {
  const text = await openClosingCard(unlockedProSave());
  assert.match(text, /遞來了新合約/);
  const renewBtn = findBtn(/續約留隊/);
  assert.ok(renewBtn, '國內續約鈕要出現');
  assert.match(renewBtn.textContent, /^✍ 續約留隊——年薪 \d+ 萬$/);
  assert.doesNotMatch(renewBtn.textContent, /美金/);
});

// ════════════════════════════════════════════════════════════════
// F3-3／F3-8：轉隊選單分組——只吃 offers 集合內容，不巢方向相反的既有閘
// ════════════════════════════════════════════════════════════════
test('F3-3a／F3-8 未解鎖（在國內）：轉隊選單完全不出現海外分組（不劇透）', async () => {
  await openClosingCard(lockedProSave());
  const transferBtn = findBtn(/測試其他球團/);
  assert.ok(transferBtn, 'fixture 前提：轉隊入口要出現（國內 offers 非空）');
  tap(transferBtn);
  await settle();
  const menuText = allText(globalThis.document.body);
  assert.doesNotMatch(menuText, /🌏/, '未解鎖＝海外分組完全不出現');
  for (const t of FOREIGN_TEAMS) assert.doesNotMatch(menuText, new RegExp(t.name));
});

test('F3-3b 已解鎖且在國內：出現「🌏 海外邀約」分組＋4 隊＋FOREIGN_TIER_LABEL（不得顯示豪門/勁旅）', async () => {
  await openClosingCard(unlockedProSave());
  tap(findBtn(/測試其他球團/));
  await settle();
  const menuText = allText(globalThis.document.body);
  assert.match(menuText, /🌏 海外邀約/);
  const foreignCardBtns = walk(globalThis.document.body)
    .filter((n) => n.tag === 'button' && FOREIGN_TEAMS.some((t) => n.textContent?.includes(t.name)));
  assert.equal(foreignCardBtns.length, FOREIGN_TEAMS.length, '4 隊海外卡要全出現');
  const domesticOnlyLabels = Object.values(PRO_TIER_LABEL)
    .filter((l) => !Object.values(FOREIGN_TIER_LABEL).includes(l));
  for (const btn of foreignCardBtns) {
    assert.match(btn.textContent, /（(霸主|列強)）/, '海外卡隊階要用 FOREIGN_TIER_LABEL');
    for (const l of domesticOnlyLabels) {
      assert.doesNotMatch(btn.textContent, new RegExp(l), `海外卡不得顯示國內標籤「${l}」`);
    }
    assert.match(btn.textContent, /年薪 \$[\d.]+ 萬美金（約 \d+ 萬台幣）/);
  }
});

test('F3-3c 在海外：轉隊選單分「🌏 海外」與「🏠 回國」兩組', async () => {
  await openClosingCard(settledForeignSeason());
  tap(findBtn(/測試其他球團/));
  await settle();
  const menuText = allText(globalThis.document.body);
  assert.match(menuText, /🏠 回國/);
  assert.match(menuText, /🌏 海外(?!邀約)/, '在海外時的海外分組標籤是「🌏 海外」不是「🌏 海外邀約」');
});

// ════════════════════════════════════════════════════════════════
// F3-4：轉隊確認卡
// ════════════════════════════════════════════════════════════════
test('F3-4 轉隊確認卡：海外目標附美金＋約合台幣，文案沿用現行警語', async () => {
  await openClosingCard(unlockedProSave());
  tap(findBtn(/測試其他球團/));
  await settle();
  const foreignCard = walk(globalThis.document.body)
    .find((n) => n.tag === 'button' && FOREIGN_TEAMS.some((t) => n.textContent?.includes(t.name)));
  assert.ok(foreignCard, '海外邀約卡要在');
  tap(foreignCard);
  await settle();
  const confirmText = allText(globalThis.document.body);
  assert.match(confirmText, /確定轉入.+？年薪 \$[\d.]+ 萬美金（約 \d+ 萬台幣）——隊友信任將重新累積。/);
});

// ════════════════════════════════════════════════════════════════
// F3-5：謝幕卡
// ════════════════════════════════════════════════════════════════
test('F3-5 謝幕卡：混合生涯——海外季卡片帶 🌏＋隊名＋美金，合計區加「海外 X 年」', async () => {
  const storage = settledForeignSeason(); // 國內首季冠軍 + 海外季冠軍
  assert.ok(createCareerStore(storage).retirePro(), 'fixture 前提：退休成功');
  await makeScreen(storage);
  const btn = findBtn(/生涯謝幕/);
  assert.ok(btn, 'fixture 前提：退休後謝幕鈕要出現');
  tap(btn);
  await settle();
  const text = allText(globalThis.document.body);
  assert.match(text, /🌏 極光獵戶/, '海外季卡片要帶 🌏 前綴＋隊名');
  assert.match(text, /年薪 \$[\d.]+ 萬美金（約 \d+ 萬台幣）/, '海外季卡片薪水要顯示美金＋約合台幣');
  assert.match(text, /職業合計：2 冠・\d+ 勝 \d+ 敗・海外 1 年/, '合計區要加「海外 X 年」');
});

test('F3-5 零漂移：純國內生涯謝幕卡輸出與改動前逐字相同（無海外標記／薪水格式不變）', async () => {
  const storage = unlockedProSave();
  assert.ok(createCareerStore(storage).retirePro(), 'fixture 前提：退休成功');
  await makeScreen(storage);
  tap(findBtn(/生涯謝幕/));
  await settle();
  const text = allText(globalThis.document.body);
  assert.doesNotMatch(text, /🌏/, '純國內生涯不得出現海外標記');
  assert.doesNotMatch(text, /海外 \d+ 年/, '純國內生涯合計區不得出現「海外 X 年」');
  assert.doesNotMatch(text, /美金/, '純國內生涯不得出現美金顯示');
  const archive = JSON.parse(storage.getItem(SAVE_KEY)).career.seasons.filter((sn) => sn.pro);
  assert.equal(archive.length, 1);
  const sn = archive[0];
  const team = proTeamById(sn.pro);
  const expectedSalary = sn.salary ?? proBaseSalaryFor(team);
  // 逐值重建：與改動前公式（`年薪 ${salary} 萬`）逐字比對，不是「看起來差不多」
  assert.match(text, new RegExp(`年薪 ${expectedSalary} 萬(?!美金)`));
  assert.match(text, new RegExp(`職業合計：1 冠・${sn.wins ?? 0} 勝 ${sn.losses ?? 0} 敗(?=｜)`));
});

// ════════════════════════════════════════════════════════════════
// F3-6：季末鏈海外分流（proGames 併 'foreign'；名次表/聯賽名分流）
// ════════════════════════════════════════════════════════════════
test('F3-6 進行中賽程 board：海外季顯示「寰宇超級聯賽・雙循環」＋1..4 名次表＋海外季後賽標題', async () => {
  const storage = foreignSaveInProgress();
  winLeague(storage, 'foreign'); // 循環打完、季後賽場次已長出但未打——仍是「還在打」
  const text = await renderMainText(storage);
  assert.match(text, /寰宇超級聯賽・雙循環（6 場・每場三戰兩勝）/);
  assert.match(text, /1\. /);
  assert.match(text, /4\. /);
  assert.match(text, /海外季後賽・四強單淘汰/);
});

test('F3-6 季末結算摘要卡：海外季冠軍顯示「寰宇超級聯賽冠軍！」（foreignTable 分流生效）', async () => {
  const storage = foreignSaveInProgress();
  playForeignChampionSeason(storage);
  const text = await renderMainText(storage);
  assert.match(text, /🏆 寰宇超級聯賽冠軍！/);
});

// ════════════════════════════════════════════════════════════════
// F3-7：海外對手 merged resolver（scoutRead／情報網照常運作）
// ════════════════════════════════════════════════════════════════
test('F3-7 merged resolver：proTeamById 解得到海外隊，scoutRead 與 foreignTeamById 同一筆（不同源會漂移）', () => {
  for (const t of FOREIGN_TEAMS) {
    const resolved = proTeamById(t.id);
    assert.ok(resolved, `merged BY_ID 要解得到海外隊 ${t.id}`);
    assert.equal(resolved.scoutRead, t.scoutRead);
    assert.equal(resolved.league, 'foreign');
  }
});

test('F3-7 DOM：海外季賽程列顯示對手真名（merged resolver 供 rowFor 用，不是外露原始 id）', async () => {
  const storage = foreignSaveInProgress();
  const text = await renderMainText(storage);
  const car = createCareerStore(storage).loadCareer();
  const firstOpp = car.schedule.find((m) => m.round === 'foreign')?.opponentId;
  assert.ok(firstOpp);
  const oppName = FOREIGN_TEAMS.find((t) => t.id === firstOpp)?.name;
  assert.ok(oppName);
  assert.match(text, new RegExp(oppName));
  assert.doesNotMatch(text, new RegExp(firstOpp));
});

// ════════════════════════════════════════════════════════════════
// F3-10：端到端收束（批 2 覆審 HIGH 兌現）——治具用 devforeign 的正式鏈同款
// （advanceToForeign，devSeed.js 的程式化等價，同一顆已在批 2 F2-9/F2-10 驗過）。
// ════════════════════════════════════════════════════════════════
test('F3-10 端到端收束：devforeign 落地→打完海外季（含季後賽）→季末卡→settle→續留→advanceSeason 進下一海外季', async () => {
  // devforeign 治具（同 tests/foreign-batch2.test.mjs F2-9 手法）：advanceToForeign
  // 需要先有一份完整存檔（seedWholeSave＋buildSyntheticSave），不是空白 storage。
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const synthetic = buildSyntheticSave({ finish: FINISH.CHAMPION, seed: 55 });
  assert.ok(synthetic, 'fixture 前提：合成存檔成立');
  store.seedWholeSave(synthetic);
  assert.ok(advanceToForeign(store, { teamId: FOREIGN_TEAM }), 'fixture 前提：devforeign 治具落地海外季開局');
  winLeague(storage, 'foreign');
  playPlayoff(storage, PLAYOFF_ROUND.SEMI, true);
  playPlayoff(storage, PLAYOFF_ROUND.FINAL, true);

  await makeScreen(storage);
  let text = allText(globalThis.document.body);
  assert.match(text, /賽季落幕/, '季末卡入口要出現（proGames 併 foreign 生效——批 2 覆審 HIGH 兌現）');
  tap(findBtn(/賽季落幕/));
  await settle();
  text = allText(globalThis.document.body);
  assert.match(text, /遞來了新合約/, 'showProSeasonClosing 內的 settleProFinale 要成功結算');
  const saveAfterSettle = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(saveAfterSettle.career.proFinaleSettled, true);
  assert.ok(Number.isInteger(saveAfterSettle.career.seasons.at(-1)?.proRank), '封存筆要帶 proRank');
  assert.equal(saveAfterSettle.career.seasons.at(-1)?.proFinish, 'champion');

  const renewBtn = findBtn(/續約留隊/);
  assert.ok(renewBtn, '續約鈕（三路之一：續留）要出現');
  assert.match(renewBtn.textContent, /\$[\d.]+ 萬美金（約 \d+ 萬台幣）/);
  assert.ok(findBtn(/測試其他球團/), '轉隊路（三路之二，內含回國）鈕要出現');
  assert.ok(findBtn(/高掛球鞋/), '退休路（三路之三）鈕要出現');

  tap(renewBtn); // 續留：advanceSeason 帶 proSalary，同一次 RMW
  await settle();
  const saveAfterAdvance = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(saveAfterAdvance.career.proFinaleSettled, false, '推進到下一季要重置本季結算旗標');
  const nextForeignGames = saveAfterAdvance.season.schedule.filter((m) => m.round === 'foreign');
  assert.equal(nextForeignGames.length, 6, '下一海外季賽程重新長出（buildForeignSchedule 雙循環 6 場）');
  assert.ok(isForeignTeamId(saveAfterAdvance.career.pro), '仍在海外（續留，不是轉隊）');
});

// ════════════════════════════════════════════════════════════════
// 批 3 覆審 MEDIUM 修（2026-08-27）——純國內季末摘要文案零漂移（錨定式）
// 病灶：季末摘要卡重構借用共用 label 把國內名次列從「聯賽第 N 名」順手改成
// 「職業聯賽第 N 名」；pro-batch3-wiring 的 /聯賽第 8 名/ 是非錨定 regex，
// 子字串照樣命中攔不到。這裡用「不得含職業前綴」的錨定斷言補上鑑別力。
// ════════════════════════════════════════════════════════════════
test('覆審修 純國內季末摘要：名次列逐字＝「聯賽第 8 名」，不得帶「職業」前綴', async () => {
  const storage = proSaveInProgress();
  loseLeague(storage, 'pro'); // 全敗＝循環第 8、不進季後賽（rank-only 分支）
  const text = await renderMainText(storage);
  assert.match(text, /聯賽第 8 名/, '前提：季末摘要卡有名次列');
  assert.doesNotMatch(text, /職業聯賽第 8 名/, '國內名次列不得被順手加上「職業」前綴');
});
