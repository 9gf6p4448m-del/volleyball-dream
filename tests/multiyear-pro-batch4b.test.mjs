// 多年職業生涯卷 批 4B「屆間三選一」（2026-08-27）
// 驗收＝docs/kickoffs/acceptance-multiyear-batch4b.md（F1–F6，動手前凍結 bab8b06）。
// 治具沿 multiyear-pro-batch2.test.mjs 同款。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
// ★ mergeOppScouting 走動態 import（F6 鑑別力：舊樹載入不得死——批 3 HIGH-1 教訓）★

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
// F1 pending 鏈（store）
// ════════════════════════════════════════════════════════════════
/** 已結算→推進到 Y2（pending=Y2 屆數）。 */
function pendingY2Save() {
  const storage = settledProYear1();
  assert.ok(createCareerStore(storage).advanceSeason(), '前提：推進 Y2');
  return storage;
}

test('F1 推進設 pending【壞版自證條】；入章首季無 pending；選定/跳過清 pending', () => {
  const storage = pendingY2Save();
  assert.equal(createCareerStore(storage).proGrowthPending?.() ?? false, true,
    '推進後屆間待辦（無實作＝這裡紅）');
  const fresh = proSaveInProgress();
  assert.equal(createCareerStore(fresh).proGrowthPending?.() ?? false, false, '入章首季無待辦');
  assert.ok(createCareerStore(storage).chooseProGrowth('rest'));
  assert.equal(createCareerStore(storage).proGrowthPending(), false, '跳過清 pending');
  assert.equal(createCareerStore(storage).chooseProGrowth('rest'), false, '清了不能再選（冪等）');
});

test('F1 轉隊也設 pending；待辦＝新季屆數', () => {
  const storage = settledProYear1('cangyu-titans');
  const target = createCareerStore(storage).proTransferOffers()[0];
  assert.ok(createCareerStore(storage).transferPro(target.id));
  const save = saveOf(storage);
  assert.equal(save.career.proGrowthPending, save.season.index, '轉隊後待辦＝新季屆數');
});

// ════════════════════════════════════════════════════════════════
// F2 三路效果
// ════════════════════════════════════════════════════════════════
test('F2 聲望：fromSetter +6 且封頂 100', () => {
  const storage = pendingY2Save();
  const before = saveOf(storage).player.trust.fromSetter;
  assert.ok(createCareerStore(storage).chooseProGrowth?.('prestige') ?? false,
    '聲望路必須可選（無實作＝這裡紅）');
  assert.equal(saveOf(storage).player.trust.fromSetter, Math.min(100, before + 6));
});

test('F2 傳承：目標隊友 attrs 每項 +2 clamp 90；同人一生一次；壞 id 拒絕', () => {
  const storage = pendingY2Save();
  const target = saveOf(storage).roster.members[0];
  assert.equal(createCareerStore(storage).chooseProGrowth('mentor', '不存在'), false, '壞 id 拒絕');
  assert.ok(createCareerStore(storage).chooseProGrowth('mentor', target.id));
  const after = saveOf(storage);
  for (const [k, v] of Object.entries(target.attributes)) {
    assert.equal(after.roster.members[0].attributes[k], Math.min(90, v + 2), `attrs.${k} +2 clamp 90`);
  }
  assert.deepEqual(after.career.proGrowth.mentored, [target.id], '記帳');
  loseOutSeason(storage);
  assert.ok(createCareerStore(storage).settleProFinale());
  assert.ok(createCareerStore(storage).advanceSeason());
  assert.equal(createCareerStore(storage).chooseProGrowth('mentor', target.id), false, '同人一生一次');
});

test('F2 情報：一次性解鎖；第二次拒絕；state accessor 形狀', () => {
  const storage = pendingY2Save();
  assert.deepEqual(createCareerStore(storage).proGrowthState(), { mentored: [], intel: false });
  assert.ok(createCareerStore(storage).chooseProGrowth('intel'));
  assert.equal(createCareerStore(storage).proGrowthState().intel, true);
  loseOutSeason(storage);
  assert.ok(createCareerStore(storage).settleProFinale());
  assert.ok(createCareerStore(storage).advanceSeason());
  assert.equal(createCareerStore(storage).chooseProGrowth('intel'), false, '一次性');
});

// ════════════════════════════════════════════════════════════════
// F3 對手攻擊分佈記帳（純函式＋投影 roundtrip）
// ════════════════════════════════════════════════════════════════
test('F3 mergeOppScouting：逐隊累加、與 scouting 方向分離、壞 tally no-op', async () => {
  const { mergeOppScouting } = await import('../src/career/careerState.js');
  let c = { scouting: { x: { zones: { line: 9, cross: 0, middle: 0, tip: 0 } } } };
  c = mergeOppScouting(c, 'teamX', { zones: { line: 2, cross: 3, middle: 1, tip: 0 } });
  c = mergeOppScouting(c, 'teamX', { zones: { line: 1, cross: 0, middle: 0, tip: 4 } });
  assert.deepEqual(c.oppScouting.teamX.zones, { line: 3, cross: 3, middle: 1, tip: 4 }, '累加');
  assert.deepEqual(c.scouting.x.zones, { line: 9, cross: 0, middle: 0, tip: 0 },
    'scouting（對手看我）不得被動到——方向分離');
  assert.equal(mergeOppScouting(c, 'teamY', null), c, '壞 tally no-op');
});

test('F3 投影 roundtrip：oppScouting 存檔讀回一致【壞版自證條】', async () => {
  const storage = settledProYear1();
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  // 舊樹無 mergeOppScouting——手寫等價寫入，讓紅落在「投影漏存」的行為斷言
  const withOpp = {
    ...c,
    oppScouting: { 'cangyu-titans': { zones: { line: 5, cross: 2, middle: 1, tip: 0 } } },
  };
  assert.ok(s.saveCareer(withOpp));
  const back = createCareerStore(storage).loadCareer();
  assert.deepEqual(back.oppScouting?.['cangyu-titans']?.zones,
    { line: 5, cross: 2, middle: 1, tip: 0 }, '存讀一致（投影漏存＝這裡紅）');
});

// ════════════════════════════════════════════════════════════════
// F5 屆間卡 wiring
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


test('F5① 推進後 render＝屆間卡先出、出戰不放行；跳過後回畫面可出戰', async () => {
  const storage = pendingY2Save();
  await renderScreen(storage);
  assert.match(allText(), /這個冬天，你想怎麼過/, '屆間卡先出');
  assert.ok(!findBtn(/▶ 出戰/), '選定前不放行出戰');
  const restBtn = findBtn(/好好休息/);
  tap(restBtn); tap(restBtn); // 連點單效
  await settle();
  assert.equal(saveOf(storage).career.proGrowthPending, null, 'pending 清掉');
  assert.ok(findBtn(/▶ 出戰/), '跳過後可出戰');
});

test('F5② 傳承全鏈：選單選人→attrs 變→回畫面；教過的人下一年不再列', async () => {
  const storage = pendingY2Save();
  await renderScreen(storage);
  tap(findBtn(/傳承/));
  await settle();
  const firstName = saveOf(storage).roster.members[0].fullName;
  const memberBtn = findBtn(new RegExp(firstName));
  assert.ok(memberBtn, '隊友選單列出名冊');
  tap(memberBtn);
  await settle();
  const save = saveOf(storage);
  assert.equal(save.career.proGrowth.mentored.length, 1, '教了一位');
  assert.ok(findBtn(/▶ 出戰/), '選完回畫面');
  loseOutSeason(storage);
  assert.ok(createCareerStore(storage).settleProFinale());
  assert.ok(createCareerStore(storage).advanceSeason());
  await renderScreen(storage);
  tap(findBtn(/傳承/));
  await settle();
  assert.ok(!findBtn(new RegExp(firstName)), '教過的人不再列');
});

test('F5③ 情報選過後下一年不再列情報鈕', async () => {
  const storage = pendingY2Save();
  assert.ok(createCareerStore(storage).chooseProGrowth('intel'));
  loseOutSeason(storage);
  assert.ok(createCareerStore(storage).settleProFinale());
  assert.ok(createCareerStore(storage).advanceSeason());
  await renderScreen(storage);
  assert.match(allText(), /這個冬天/, '屆間卡出現');
  assert.ok(!findBtn(/情報網——解鎖/), '已解鎖不再列');
  assert.ok(findBtn(/立威/), '其他路照列');
});

// ════════════════════════════════════════════════════════════════
// F4 情報消費端（布置面板槽①）
// ════════════════════════════════════════════════════════════════
async function openMatchup(storage) {
  await renderScreen(storage);
  const btn = findBtn(/▶ 出戰/);
  assert.ok(btn, '出戰鈕要在');
  tap(btn);
  await settle();
  return allText();
}

/** 槽①的 scouted 閘吃 career.scouting（治具塞假結果沒真打比賽→恆空）——
 *  對首戰對手塞足量 scouting 讓 oppFocus 過閘（盲注段才會渲染）。 */
function seedScoutingForNext(storage) {
  const raw = saveOf(storage);
  const oppId = raw.season.schedule.find((m) => m.round === 'pro').opponentId;
  raw.season.scouting = {
    ...(raw.season.scouting ?? {}),
    [oppId]: {
      zones: { line: 4, cross: 3, middle: 2, tip: 1 },
      routes: {}, feints: 0, spikes: 0,
    },
  };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  return oppId;
}

test('F4 intel＋樣本≥6＝槽①顯示真實分佈；未解鎖照舊；樣本不足另句', async () => {
  // 未解鎖：要用「交手過」的檔（槽①盲注句在 scouted 分支內；未交手另有一句）
  const plain = pendingY2Save();
  assert.ok(createCareerStore(plain).chooseProGrowth('rest'));
  seedScoutingForNext(plain);
  const t0 = await openMatchup(plain);
  assert.match(t0, /沒有對手攻擊路線的情報/, '未解鎖照舊');
  const storage = pendingY2Save();
  assert.ok(createCareerStore(storage).chooseProGrowth('intel'));
  const oppId = seedScoutingForNext(storage);
  const raw = saveOf(storage);
  raw.season.oppScouting = { [oppId]: { zones: { line: 5, cross: 3, middle: 1, tip: 1 } } };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  const t1 = await openMatchup(storage);
  assert.match(t1, /情報網：這隊的攻擊分佈——直線 5・斜線 3/, '真實分佈顯示');
  const low = pendingY2Save();
  assert.ok(createCareerStore(low).chooseProGrowth('intel'));
  seedScoutingForNext(low);
  // scouted 過閘但 oppScouting 未記帳＝情報樣本 0 <6
  const t2 = await openMatchup(low);
  assert.match(t2, /交手樣本還不夠/, '樣本不足另句');
});
