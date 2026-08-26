// 多年職業生涯卷 批 3「轉隊」（2026-08-27）
// 驗收＝docs/kickoffs/acceptance-multiyear-batch3.md（C1–C6，動手前凍結 5bed27d）。
// 治具沿 multiyear-pro-batch2.test.mjs 同一條正式鏈。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { proRenewalSalaryFor, proOffersFor } from '../src/career/proTeams.js';
import { proStartTrustFor, proRankTrustBonus } from '../src/career/proTeam.js';
import { proTeamById } from '../src/career/proTeams.js';

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
// C1 轉隊邀約集合
// ════════════════════════════════════════════════════════════════
test('C1 已結算＝offer 集合非空且排除現隊、吃本季 proRank；未結算/非職業章＝空', () => {
  const storage = settledProYear1('cangyu-titans'); // 全敗＝proRank 8 → 只開新軍階
  const offers = createCareerStore(storage).proTransferOffers?.() ?? [];
  assert.ok(offers.length >= 2, `全敗仍有新軍保底（得 ${offers.length}）`);
  assert.ok(offers.every((t) => t.id !== 'cangyu-titans'), '排除現隊');
  const expected = proOffersFor(8).filter((t) => t.id !== 'cangyu-titans').map((t) => t.id);
  assert.deepEqual(offers.map((t) => t.id), expected, '集合＝proOffersFor(本季名次) 排除現隊');

  const inProgress = proSaveInProgress();
  loseOutSeason(inProgress);
  assert.deepEqual(createCareerStore(inProgress).proTransferOffers?.(), [], '未結算＝空');
  const uni = settledUniSave();
  assert.deepEqual(createCareerStore(uni).proTransferOffers?.(), [], '非職業章＝空');
});

test('C1 末季/已退休＝空集合（末季不得再轉隊）', () => {
  const storage = proSaveInProgress();
  const raw = saveOf(storage);
  raw.season.index = raw.career.chapter.enteredAtSeason + 9;
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  loseOutSeason(storage);
  assert.ok(createCareerStore(storage).settleProFinale());
  assert.deepEqual(createCareerStore(storage).proTransferOffers(), [], '末季＝空');
  const retired = settledProYear1();
  assert.ok(createCareerStore(retired).retirePro());
  assert.deepEqual(createCareerStore(retired).proTransferOffers(), [], '已退休＝空');
});

// ════════════════════════════════════════════════════════════════
// C2 transferPro
// ════════════════════════════════════════════════════════════════
test('C2 轉隊成功：換隊＋推進同一次 RMW——隊/合約/名冊/lineup/trust/season 一次到位【壞版自證條】', () => {
  const storage = settledProYear1('cangyu-titans'); // proRank 8 → 只能轉新軍
  const before = saveOf(storage);
  const target = createCareerStore(storage).proTransferOffers()[0];
  assert.ok(createCareerStore(storage).transferPro?.(target.id) ?? false, '轉隊必須成功（無實作＝這裡紅）');
  const after = saveOf(storage);
  assert.equal(after.career.pro, target.id, '換隊');
  assert.equal(after.season.index, before.season.index + 1, '同時推進');
  const lastPro = before.career.seasons.at(-1);
  assert.equal(after.career.contract.salary,
    proRenewalSalaryFor(proTeamById(target.id), lastPro.proRank, lastPro.proFinish), '新約薪水＝同一顆公式');
  assert.equal(after.career.contract.sinceSeason, after.season.index, 'sinceSeason＝新季');
  assert.notDeepEqual(after.roster.members, before.roster.members, '名冊重建為新隊');
  assert.equal(after.player.trust.fromSetter,
    Math.min(100, proStartTrustFor(proTeamById(target.id)) + proRankTrustBonus(lastPro.proRank)),
    '信任重置＝新隊起點＋名次加成（轉隊代價）');
  assert.equal(after.career.proFinaleSettled, false, '旗標逐季重置');
  assert.equal(after.season.schedule.filter((m) => m.round === 'pro').length, 7, '新隊新賽程');
  assert.equal(after.season.results.length, 0);
  assert.deepEqual(after.season.events ?? [], before.season.events ?? [], '劇情/傳授旗標保留');
});

test('C2 守衛：未結算/offer 外/現隊/末季/退休/壞 id 全拒絕且零寫入', () => {
  const notSettled = proSaveInProgress();
  loseOutSeason(notSettled);
  const snap0 = notSettled.getItem(SAVE_KEY);
  assert.equal(createCareerStore(notSettled).transferPro('tiegu-warlords'), false, '未結算拒絕');
  assert.equal(notSettled.getItem(SAVE_KEY), snap0, '零寫入');

  const storage = settledProYear1('cangyu-titans'); // proRank 8：offer 只有新軍
  const snap = storage.getItem(SAVE_KEY);
  assert.equal(createCareerStore(storage).transferPro('cangyu-titans'), false, '現隊拒絕');
  const midTeam = proOffersFor(1).find((t) => t.tier !== proOffersFor(8)[0].tier);
  assert.equal(createCareerStore(storage).transferPro(midTeam.id), false, 'offer 外（階太高）拒絕');
  assert.equal(createCareerStore(storage).transferPro('不存在'), false, '壞 id 拒絕');
  assert.equal(storage.getItem(SAVE_KEY), snap, '全拒絕零寫入');

  const retired = settledProYear1();
  assert.ok(createCareerStore(retired).retirePro());
  assert.equal(createCareerStore(retired).transferPro(
    createCareerStore(retired).proTransferOffers()[0]?.id ?? 'tiegu-warlords'), false, '退休拒絕');
});

test('C2 決定論：同存檔同目標隊重演逐值一致；轉隊後可打可結算（迴圈活著）', () => {
  const a = settledProYear1();
  const target = createCareerStore(a).proTransferOffers()[0];
  assert.ok(createCareerStore(a).transferPro(target.id));
  const snapA = a.getItem(SAVE_KEY);
  const b = settledProYear1();
  assert.ok(createCareerStore(b).transferPro(target.id));
  assert.equal(b.getItem(SAVE_KEY), snapA, '重演逐值一致');
  loseOutSeason(a);
  assert.equal(createCareerStore(a).settleProFinale(), true, '轉隊後新季可結算');
  assert.equal(saveOf(a).career.seasons.at(-1).pro, target.id, '新季封存掛新隊');
});

// ════════════════════════════════════════════════════════════════
// C3 宿敵線與事件跨隊安全
// ════════════════════════════════════════════════════════════════
test('C3 轉隊後 proEvents 不炸、已播事件旗標保留（career.events 不重播的資料基礎）', async () => {
  const storage = settledProYear1('cangyu-titans');
  const raw = saveOf(storage);
  raw.season.events = [...(raw.season.events ?? []), 'pro-wang-teammate'];
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  const target = createCareerStore(storage).proTransferOffers()[0];
  assert.ok(createCareerStore(storage).transferPro(target.id));
  const after = saveOf(storage);
  assert.ok((after.season.events ?? []).includes('pro-wang-teammate'), '已播旗標跨隊保留');
  const { proWangRivalPreEvents, PRO_WANG_TEAMMATE_EV } = await import('../src/career/proEvents.js');
  // 轉入新軍後對上蒼羽（敵隊變體局面）：同隊事件已播過的旗標不影響敵隊變體，
  // 敵隊變體本身未播過＝照常可播（一生一次判準不因轉隊放寬也不誤鎖）
  const rivalEvents = proWangRivalPreEvents(
    { events: after.season.events },
    { id: 'pro-r3', round: 'pro', opponentId: 'cangyu-titans' },
    after.career.pro,
  );
  assert.equal(rivalEvents.length, 1, '敵隊變體未播過＝新隊局面照常可播');
  // 同隊變體已播旗標保留＝就算把玩家再放回蒼羽的局面也不重播
  const teammateAgain = proWangRivalPreEvents(
    { events: after.season.events },
    { id: 'pro-r1', round: 'pro', opponentId: 'x' },
    'cangyu-titans',
  );
  assert.equal(teammateAgain.length, 0, '已播同隊事件（career.events 旗標）不重播');
  assert.ok((after.season.events ?? []).includes(PRO_WANG_TEAMMATE_EV), '旗標常數同源');
});

// ════════════════════════════════════════════════════════════════
// C4 wiring（治具沿批 2 同款假 DOM）
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


test('C4① 收尾卡三路齊：續約/轉隊/退休；轉隊選單開卡、隊卡帶年薪、返回路可用', async () => {
  const storage = proSaveInProgress();
  loseOutSeason(storage);
  await renderScreen(storage);
  tap(findBtn(/賽季落幕/));
  await settle();
  assert.ok(findBtn(/續約留隊/), '第一路');
  assert.ok(findBtn(/高掛球鞋/), '第二路');
  const transferBtn = findBtn(/測試其他球團/);
  assert.ok(transferBtn, '第三路');
  tap(transferBtn);
  await settle();
  assert.match(allText(), /隊友的信任要從頭建立/, '選單開卡');
  const teamCard = walk(globalThis.document.body)
    .find((n) => n.tag === 'button' && /（新軍）——年薪 \d+ 萬/.test(n.textContent ?? ''));
  assert.ok(teamCard, '隊卡帶隊階與年薪');
  tap(findBtn(/回續約談判/));
  await settle();
  assert.ok(!findBtn(/簽下轉隊合約/), '返回後選單收掉');
  // 返回後再開得起來（旗標有還原）
  tap(findBtn(/測試其他球團/));
  await settle();
  const menus = walk(globalThis.document.body)
    .filter((n) => /隊友的信任要從頭建立/.test(n.textContent ?? ''));
  assert.equal(menus.length, 1, '重開單卡');
});

test('C4② 轉隊全鏈：選隊→確認→換隊推進回生涯畫面；顯示年薪＝入檔年薪；連點不雙轉', async () => {
  const storage = proSaveInProgress('cangyu-titans');
  loseOutSeason(storage);
  const beforeIdx = saveOf(storage).season.index;
  await renderScreen(storage);
  tap(findBtn(/賽季落幕/));
  await settle();
  tap(findBtn(/測試其他球團/));
  await settle();
  const teamCard = walk(globalThis.document.body)
    .find((n) => n.tag === 'button' && /——年薪 \d+ 萬/.test(n.textContent ?? '') && !/續約留隊/.test(n.textContent));
  const offered = Number(teamCard.textContent.match(/年薪 (\d+) 萬/)[1]);
  tap(teamCard);
  await settle();
  assert.match(allText(), /確定轉入/, '確認卡');
  const signBtn = findBtn(/簽下轉隊合約/);
  tap(signBtn); tap(signBtn); // 連點
  await settle();
  const save = saveOf(storage);
  assert.equal(save.season.index, beforeIdx + 1, '只推進一季（連點不雙轉）');
  assert.notEqual(save.career.pro, 'cangyu-titans', '已換隊');
  assert.equal(save.career.contract.salary, offered, '入檔薪水＝隊卡顯示值');
  assert.match(allText(), /第 2 年/, '回生涯畫面＝新季');
});

test('C4③ 末季收尾卡無轉隊鈕（同續約鈕防線）', async () => {
  const storage = proSaveInProgress();
  const raw = saveOf(storage);
  raw.season.index = raw.career.chapter.enteredAtSeason + 9;
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  loseOutSeason(storage);
  await renderScreen(storage);
  tap(findBtn(/賽季落幕——第 10 年/));
  await settle();
  assert.ok(!findBtn(/測試其他球團/), '末季不得出現轉隊鈕');
});
