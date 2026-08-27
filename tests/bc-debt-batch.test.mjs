// B/C 債清批（2026-08-27）C1／C3／C4／C6／C7 — 驗收＝
// docs/kickoffs/acceptance-bc-debt-20260827.md。A1-A3／B1-B2 另見 tests/replay-lift.test.mjs；
// C2（「進行中」恆標）驗證即可，證據見 tests/team-kit-phase2.test.mjs:275-286/331-343；
// C5（押線→賭線改名）連動的既有測試更新在各自檔案（見回報）。
//
// 突變實測紀錄（**真的做過**，2026-08-27，各用 sed 反向替換做壞版、單跑本檔、還原）：
//   ①拿掉 careerScreen.js renewBtn 的 else 分支（C3①）→ 對應測試紅。還原後綠。
//   ②拿掉 careerScreen.js 簽下轉隊合約的 else 分支內文字（C3②）→ 對應測試紅。還原後綠。
//   ③拿掉 careerScreen.js renderCareer() 頂部 `retireConfirmOpen = false;`（C4）
//     → 對應測試紅（重繪後第二次「高掛球鞋」開不出新確認卡）。還原後綠。
// 逐條詳見回報 scratchpad/bc-debt-report.md。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { buildSyntheticSave, advanceToPro } from '../src/career/devSeed.js';
import { FINISH } from '../src/career/admission.js';
import {
  SCOUT_HOT_SHARE, SCOUT_COLD_SHARE, SCOUT_MIN_SAMPLE,
} from '../src/career/careerState.js';
import { revealHeightForSeason } from '../src/career/heightGrowth.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// ════════════════════════════════════════════════════════════
// C1：身高曲線第 4 屆起 reveal:null 是明文設計，不是漏做
// ════════════════════════════════════════════════════════════
test('C1：revealHeightForSeason(第 4 屆) 回 reveal:null 且不 throw（曲線只涵蓋高中三屆）', () => {
  const player = {
    height: {
      plan: [175, 178, 182],
      current: 1.82,
      timeline: [{ season: 1, height: 1.75 }],
    },
  };
  assert.doesNotThrow(() => revealHeightForSeason(player, 4));
  const { player: p2, reveal } = revealHeightForSeason(player, 4);
  assert.equal(reveal, null, '第 4 屆起曲線已耗盡，reveal 必須是 null');
  assert.deepEqual(p2, player, '第 4 屆起不得改動 player（no-op）');
  // 對照組：第 2 屆（曲線範圍內、尚未揭曉）必須真的揭曉，證明 4 屆的 null
  // 是「曲線耗盡」的設計分支，不是函式本身恆回 null
  const { reveal: reveal2 } = revealHeightForSeason(player, 2);
  assert.ok(reveal2, '第 2 屆在曲線範圍內，必須真的揭曉（對照組）');
});

// ════════════════════════════════════════════════════════════
// C7：proEvents.js 過時註解已更新為反映現況
// ════════════════════════════════════════════════════════════
test('C7：proEvents.js 不再殘留「不可玩」字樣——國外強權已可玩（入口＝transferPro）', () => {
  const src = read('../src/career/proEvents.js');
  assert.doesNotMatch(src, /不可玩/);
});

// ════════════════════════════════════════════════════════════
// C6：餵線量化文案——數字必須插值自常數，且與 sim/game.js 的字面對表
// ════════════════════════════════════════════════════════════
test('C6：SCOUT_MIN_SAMPLE 與 sim/game.js scoutBlockMul 的字面 6 對表（sim 禁改，這裡是有意複製）', () => {
  assert.equal(SCOUT_MIN_SAMPLE, 6);
  const src = read('../src/sim/game.js');
  assert.match(src, /if \(total < 6\) return 1;/,
    'sim 那顆字面一旦漂移，這條就會紅——提醒同步 SCOUT_MIN_SAMPLE');
});

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
      return {
        top: 0, left: 0, width: 100, height: 100, bottom: 0, right: 0,
      };
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

// ════════════════════════════════════════════════════════════
// C6 wiring：「對手眼中的你」面板／howToPlay 餵線條目文案量化（真實 DOM 讀回）
// ════════════════════════════════════════════════════════════
function proReadyStorage({ teamId = 'cangyu-titans', scouting = null, baitLine = false } = {}) {
  const storage = fakeStorage();
  storage.setItem(SAVE_KEY, JSON.stringify(buildSyntheticSave({ finish: FINISH.CHAMPION })));
  const store = createCareerStore(storage);
  assert.ok(advanceToPro(store, { teamId }), 'fixture 前提：治具跳到職業章成功');
  if (scouting) {
    const career = store.loadCareer();
    store.saveCareer({ ...career, scouting });
  }
  if (baitLine) {
    const player = store.loadPlayer();
    store.savePlayer({ ...player, techniques: { ...player.techniques, baitLine: 1 } });
  }
  return storage;
}

async function openMatchupScreen(storage) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const screen = createCareerScreen(createCareerStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
  const btn = findBtn(/▶ 出戰/);
  assert.ok(btn, 'fixture 前提：職業章第一場的「▶ 出戰」鈕要渲染得出來');
  tap(btn);
  await settle();
  return allText();
}

test('C6①：樣本不足（讀不到你）文案含 SCOUT_MIN_SAMPLE 插值，不是手寫字面數字', async () => {
  const storage = proReadyStorage({ baitLine: true });
  const text = await openMatchupScreen(storage);
  assert.match(text, /🎯 餵線——對手眼中的你/);
  assert.match(text, new RegExp(`出手不到 ${SCOUT_MIN_SAMPLE} 球`), '樣本門檻必須插值自 SCOUT_MIN_SAMPLE');
});

test('C6②：有明顯慣用線時文案含 SCOUT_HOT_SHARE／SCOUT_COLD_SHARE 插值百分比', async () => {
  const storage = proReadyStorage({
    baitLine: true,
    scouting: { 'probe-a': { zones: { line: 20, cross: 6, middle: 2, tip: 2 } } },
  });
  const text = await openMatchupScreen(storage);
  assert.match(text, /這場他們會押你的直線/);
  assert.match(text, new RegExp(`佔比超過 ${Math.round(SCOUT_HOT_SHARE * 100)}%`));
  assert.match(text, new RegExp(`壓到 ${Math.round(SCOUT_COLD_SHARE * 100)}% 以下`));
});

test('C6③：howToPlay 餵線條目文案同樣插值自常數，不是手寫字面數字', async () => {
  const { HOW_TO_PLAY } = await import('../src/ui/howToPlay.js');
  const item = HOW_TO_PLAY
    .flatMap((page) => page.sections)
    .flatMap((sec) => sec.items)
    .find((it) => it.term === '🎯 餵線——對手眼中的你');
  assert.ok(item, '找不到 howToPlay 的餵線條目');
  assert.match(item.desc, new RegExp(`${SCOUT_MIN_SAMPLE} 球`));
  assert.match(item.desc, new RegExp(`${Math.round(SCOUT_HOT_SHARE * 100)}%`));
  assert.match(item.desc, new RegExp(`${Math.round(SCOUT_COLD_SHARE * 100)}%`));
});

// ════════════════════════════════════════════════════════════
// C3／C4 治具（沿 multiyear-pro-batch2/3.test.mjs 同一條正式鏈）
// ════════════════════════════════════════════════════════════
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
      matchId: m.id, opponentId: m.opponentId, won: false, scoreFor: 0, scoreAgainst: 2, gp: 1,
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

function proSaveInProgress(teamId = 'cangyu-titans') {
  const storage = settledUniSave();
  assert.ok(createCareerStore(storage).enterCorporate('chaoxi-marine'), 'fixture 前提：入企業章成功');
  playRoundRobin(storage, 'corp');
  assert.ok(createCareerStore(storage).settleCorpFinale(), 'fixture 前提：企業季結算成功');
  assert.ok(createCareerStore(storage).enterPro(teamId), 'fixture 前提：入職業章成功');
  return storage;
}

const saveOf = (storage) => JSON.parse(storage.getItem(SAVE_KEY));

// 用真 store（不是 storage）建畫面——C3 要在建畫面前 stub store 的方法
async function renderWithStore(store) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const screen = createCareerScreen(store, {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
  await clearDialogs();
  return screen;
}

// ════════════════════════════════════════════════════════════
// C3：續約／轉隊寫入失敗時 UI 必須顯示可見的失敗訊息（含「寫入失敗」四字）
// ════════════════════════════════════════════════════════════
test('C3①：advanceSeason 回 false（store stub）——UI 顯示含「寫入失敗」的訊息，不靜默', async () => {
  const storage = proSaveInProgress();
  loseOutSeason(storage);
  const store = createCareerStore(storage);
  store.advanceSeason = () => false; // stub 回 false（不動真實 store 邏輯）
  await renderWithStore(store);
  tap(findBtn(/賽季落幕/));
  await settle();
  const renewBtn = findBtn(/續約留隊/);
  assert.ok(renewBtn, 'fixture 前提：續約鈕要出現');
  tap(renewBtn);
  await settle();
  assert.match(allText(), /寫入失敗/, 'stub 回 false 時必須出現含「寫入失敗」的訊息');
  // 覆審 MEDIUM-1：文案寫「請再試一次」——連點不得每點疊一條紅字
  tap(renewBtn);
  tap(renewBtn);
  await settle();
  const msgs = walk(globalThis.document.body)
    .filter((n) => /寫入失敗/.test(n.textContent ?? ''));
  assert.equal(msgs.length, 1, '連點三次也只能有一則失敗訊息（防無限疊加）');
});

test('C3① 反向：advanceSeason 回 true（真實 store）——訊息不出現', async () => {
  const storage = proSaveInProgress();
  loseOutSeason(storage);
  const store = createCareerStore(storage);
  await renderWithStore(store);
  tap(findBtn(/賽季落幕/));
  await settle();
  tap(findBtn(/續約留隊/));
  await settle();
  assert.doesNotMatch(allText(), /寫入失敗/, '成功時不得出現失敗訊息');
});

test('C3②：transferPro 回 false（store stub）——UI 顯示含「寫入失敗」的訊息，確認卡不靜默移除', async () => {
  const storage = proSaveInProgress();
  loseOutSeason(storage);
  const store = createCareerStore(storage);
  store.transferPro = () => false; // stub 回 false；proTransferOffers 走真實 store 給出真隊卡
  await renderWithStore(store);
  tap(findBtn(/賽季落幕/));
  await settle();
  const transferBtn = findBtn(/測試其他球團/);
  assert.ok(transferBtn, 'fixture 前提：轉隊鈕要出現（全敗仍有新軍保底）');
  tap(transferBtn);
  await settle();
  const teamCard = walk(globalThis.document.body)
    .find((n) => n.tag === 'button' && /——年薪 \d+ 萬/.test(n.textContent ?? '')
      && !/續約留隊/.test(n.textContent ?? ''));
  assert.ok(teamCard, 'fixture 前提：至少一張隊卡');
  tap(teamCard);
  await settle();
  const signBtn = findBtn(/簽下轉隊合約/);
  assert.ok(signBtn, 'fixture 前提：確認卡要出現');
  tap(signBtn);
  await settle();
  assert.match(allText(), /寫入失敗/, 'stub 回 false 時必須出現含「寫入失敗」的訊息');
  assert.ok(findBtn(/再想想/), '確認卡不得被靜默移除——玩家還能退出');
});

test('C3② 反向：transferPro 回 true（真實 store）——訊息不出現', async () => {
  const storage = proSaveInProgress();
  loseOutSeason(storage);
  const store = createCareerStore(storage);
  await renderWithStore(store);
  tap(findBtn(/賽季落幕/));
  await settle();
  tap(findBtn(/測試其他球團/));
  await settle();
  const teamCard = walk(globalThis.document.body)
    .find((n) => n.tag === 'button' && /——年薪 \d+ 萬/.test(n.textContent ?? '')
      && !/續約留隊/.test(n.textContent ?? ''));
  tap(teamCard);
  await settle();
  tap(findBtn(/簽下轉隊合約/));
  await settle();
  assert.doesNotMatch(allText(), /寫入失敗/, '成功時不得出現失敗訊息');
});

// ════════════════════════════════════════════════════════════
// C4：生涯畫面整頁重繪＝retireConfirmOpen 歸位，重繪後能再次打開退休確認
// ════════════════════════════════════════════════════════════
test('C4：整頁重繪（screen.show(\'career\') 再呼叫一次）後，retireConfirmOpen 歸位、可再開退休確認', async () => {
  const storage = proSaveInProgress();
  loseOutSeason(storage);
  const store = createCareerStore(storage);
  const screen = await renderWithStore(store);
  tap(findBtn(/賽季落幕/));
  await settle();
  tap(findBtn(/高掛球鞋/));
  await settle();
  const afterFirst = walk(globalThis.document.body)
    .filter((n) => /確定要高掛球鞋嗎/.test(n.textContent ?? ''));
  assert.equal(afterFirst.length, 1, '前提：第一次開得起確認卡');

  // 模擬「生涯畫面整頁重繪」——重新呼叫 show('career') 觸發 renderCareer() 重跑，
  // 但退休確認卡是掛在 document.body 的獨立節點，不會被 root 的重繪一起收掉
  screen.show('career');
  await settle();
  await clearDialogs();
  tap(findBtn(/高掛球鞋/));
  await settle();
  const afterSecond = walk(globalThis.document.body)
    .filter((n) => /確定要高掛球鞋嗎/.test(n.textContent ?? ''));
  // 覆審 MEDIUM-2：重繪要「旗標歸位＋舊卡收走」一起做——能再開（≥1）且不疊卡（=1）。
  // 原版斷言 2（接受疊卡）被覆審駁回：疊兩張全螢幕卡＝下面那張永遠關不掉。
  assert.equal(afterSecond.length, 1,
    '重繪後要能再開出確認卡，且舊卡必須被收走——恰好一張，不得疊卡');
});
