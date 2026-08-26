// 職業章 批 3「賽季迴圈＋季後賽＋ATTR_CAP」— DOM 接線（2026-08-26）
// 驗收＝docs/kickoffs/acceptance-pro-batch3.md（C1/C4/C5 的真實 UI 行為）。
//
// ★ 為什麼走真的 UI 路徑 ★ 同 tests/pro-entry-wiring.test.mjs：純函式測試證明不了
// 「畫面真的會依季後賽場次改變」「收尾卡真的會呼叫 settleProFinale」。
// 假 DOM 形狀沿 tests/pro-entry-wiring.test.mjs（帶參數 replaceChildren 版，
// 債清批 2026-08-26 教訓：原版丟參數＝內容憑空消失）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { PLAYOFF_ROUND } from '../src/career/proSchedule.js';

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

/** U4 打滿、謝幕已結算的存檔（沿 pro-entry-wiring.test.mjs 的 u4Save 手法）。 */
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

/** 簽入企業隊＋打滿企業那一季＋結算＋簽入職業隊（尚未打職業任何一場）。 */
function proSave(teamId = 'cangyu-titans', corpId = 'panshi-heavy') {
  const storage = u4Save();
  const s = createCareerStore(storage);
  assert.ok(s.enterCorporate(corpId), 'fixture 前提：簽企業隊成功');
  const c = s.loadCareer();
  const corpGames = c.schedule.filter((m) => m.round === 'corp');
  s.saveCareer({
    ...c,
    results: corpGames.map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
  assert.ok(s.settleCorpFinale(), 'fixture 前提：企業季結算成功');
  assert.ok(s.enterPro(teamId), 'fixture 前提：簽職業隊成功');
  return storage;
}

/** 職業聯賽打 `n` 場（全勝或全敗，決定進不進四強）。 */
function playProLeague(storage, { wins = true } = {}) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  s.saveCareer({
    ...c,
    results: c.schedule.map((m) => ({
      matchId: m.id, opponentId: m.opponentId, won: wins,
      scoreFor: wins ? 2 : 0, scoreAgainst: wins ? 0 : 2, gp: wins ? 3 : 1,
    })),
  });
}

function playMatch(storage, matchId, won) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const entry = c.schedule.find((m) => m.id === matchId);
  s.saveCareer({
    ...c,
    results: [...c.results, {
      matchId, opponentId: entry.opponentId, won,
      scoreFor: won ? 2 : 0, scoreAgainst: won ? 0 : 2, gp: won ? 3 : 1,
    }],
  });
}

async function renderAndGetText(storage) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const { createCareerStore: mkStore } = await import('../src/career/careerStore.js');
  const screen = createCareerScreen(mkStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
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
  return allText(globalThis.document.body);
}

// ════════════════════════════════════════════════════════════════
// C1：職業聯賽名次表顯示
// ════════════════════════════════════════════════════════════════
test('C1① 職業聯賽打了幾場後：單循環區塊＋名次表出現（含玩家列）', async () => {
  const storage = proSave();
  playMatch(storage, createCareerStore(storage).loadCareer().schedule[0].id, true);
  const text = await renderAndGetText(storage);
  assert.match(text, /職業聯賽・單循環（7 場・每場三戰兩勝）/);
  assert.match(text, /前 4 名晉級季後賽/);
});

test('C1② 循環未打完：季後賽區塊不出現（賽程還沒長出來）', async () => {
  const storage = proSave();
  playMatch(storage, createCareerStore(storage).loadCareer().schedule[0].id, true);
  const text = await renderAndGetText(storage);
  assert.doesNotMatch(text, /職業季後賽・四強單淘汰/);
});

test('C1③ 循環 7/7 全勝：季後賽區塊出現、「準決賽」場次可見、可「▶ 出戰」', async () => {
  const storage = proSave();
  playProLeague(storage, { wins: true });
  const text = await renderAndGetText(storage);
  assert.match(text, /職業季後賽・四強單淘汰/);
  assert.match(text, /準決賽/);
  assert.match(text, /▶ 出戰/, '準決賽要能出戰，不是鎖住的死賽程');
});

test('C1④ 循環 7/7 全敗：未進四強，不長季後賽、直接落到賽季落幕', async () => {
  const storage = proSave();
  playProLeague(storage, { wins: false });
  const text = await renderAndGetText(storage);
  assert.doesNotMatch(text, /職業季後賽・四強單淘汰/);
  assert.match(text, /賽季落幕——職業元年/);
  assert.match(text, /聯賽第 8 名/);
});

// ════════════════════════════════════════════════════════════════
// C5：章末收尾卡——settleProFinale 接線＋佔位文案＋重入不重複結算
// ════════════════════════════════════════════════════════════════
test('C5① 未進四強直接賽季落幕：點擊後結算成功、佔位文案出現、無「前往下一個舞台」', async () => {
  const storage = proSave();
  playProLeague(storage, { wins: false });
  await renderAndGetText(storage);
  tap(findBtn(/賽季落幕——職業元年/));
  await settle();
  const text = allText(globalThis.document.body);
  assert.match(text, /職業元年・完/);
  assert.match(text, /續約談判・敬請期待/);
  assert.doesNotMatch(text, /前往下一個舞台/, '職業章目前是生涯終章，不該冒出下一章入口');
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(save.career.proFinaleSettled, true);
  assert.ok(Number.isInteger(save.career.seasons.at(-1)?.proRank), '封存筆要帶 proRank');
});

test('C5② 打進季後賽並奪冠：收尾卡顯示冠軍文案', async () => {
  const storage = proSave();
  playProLeague(storage, { wins: true });
  const afterLeague = createCareerStore(storage).loadCareer();
  const semi = afterLeague.schedule.find((m) => m.round === PLAYOFF_ROUND.SEMI);
  playMatch(storage, semi.id, true);
  const afterSemi = createCareerStore(storage).loadCareer();
  const final = afterSemi.schedule.find((m) => m.round === PLAYOFF_ROUND.FINAL);
  playMatch(storage, final.id, true);
  const text = await renderAndGetText(storage);
  assert.match(text, /🏆 職業聯賽冠軍！/);
  tap(findBtn(/賽季落幕——職業元年/));
  await settle();
  const text2 = allText(globalThis.document.body);
  assert.match(text2, /站上職業聯賽之巔/);
});

test('C5③ 打進季後賽但準決賽落敗：收尾卡顯示「止步季後賽」文案（不是循環名次文案）', async () => {
  const storage = proSave();
  playProLeague(storage, { wins: true });
  const afterLeague = createCareerStore(storage).loadCareer();
  const semi = afterLeague.schedule.find((m) => m.round === PLAYOFF_ROUND.SEMI);
  playMatch(storage, semi.id, false);
  const text = await renderAndGetText(storage);
  assert.match(text, /止步季後賽/);
  tap(findBtn(/賽季落幕——職業元年/));
  await settle();
  const text2 = allText(globalThis.document.body);
  assert.match(text2, /季後賽止步——循環第 1 名的證明/);
});

test('C5④ 重入不重複結算：先用 store 提前結算過，UI 再點一次仍看得到佔位卡（冪等不影響顯示）', async () => {
  const storage = proSave();
  playProLeague(storage, { wins: false });
  const s = createCareerStore(storage);
  assert.ok(s.settleProFinale(), 'fixture 前提：已提前結算過一次');
  await renderAndGetText(storage);
  tap(findBtn(/賽季落幕——職業元年/));
  await settle();
  const text = allText(globalThis.document.body);
  assert.match(text, /職業元年・完/);
  assert.match(text, /續約談判・敬請期待/);
});

// ════════════════════════════════════════════════════════════════
// C4：ATTR_CAP 章節感知——UI 顯示
// ════════════════════════════════════════════════════════════════
test('C4① 職業章：成長區塊顯示天花板 100（傳奇解鎖）', async () => {
  const storage = proSave();
  const text = await renderAndGetText(storage);
  assert.match(text, /職業章屬性天花板 100——傳奇解鎖/);
});

test('C4② 非職業章（企業章）：不顯示天花板訊息（維持 90，逐值不變）', async () => {
  const storage = u4Save();
  const s = createCareerStore(storage);
  assert.ok(s.enterCorporate('panshi-heavy'));
  const text = await renderAndGetText(storage);
  assert.doesNotMatch(text, /屬性天花板.*傳奇解鎖/);
});

// ════════════════════════════════════════════════════════════════
// 回歸：企業章既有行為不因批 3 改動而壞
// ════════════════════════════════════════════════════════════════
test('回歸：企業季顯示與收尾卡不受職業章批 3 新增分支影響', async () => {
  const storage = u4Save();
  const s = createCareerStore(storage);
  assert.ok(s.enterCorporate('panshi-heavy'));
  const c = s.loadCareer();
  s.saveCareer({
    ...c,
    results: c.schedule.map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
  const text = await renderAndGetText(storage);
  assert.match(text, /賽季落幕——企業元年/);
  tap(findBtn(/賽季落幕——企業元年/));
  await settle();
  const text2 = allText(globalThis.document.body);
  assert.match(text2, /企業元年・完/);
  assert.match(text2, /前往下一個舞台/, '企業章仍要有下一章入口（職業章批 3 不得動到）');
});

// ════════════════════════════════════════════════════════════════
// 批 3 覆審 HIGH 修：棄賽路徑的本地 career 要吃 saveCareer 之後重新讀出的版本
// （saveCareer 起有內部副作用：growProSchedule 在 RMW 裡長季後賽場次）
// 改前紅：settled 停在「長之前」形狀 ⇒ seasonConcluded 對無 semi 列誤判已收束
// ⇒ 畫面直接落「賽季落幕」、看不到準決賽
// ════════════════════════════════════════════════════════════════
test('覆審H修 棄賽湊滿循環末場且晉級：同輪 render 看得到準決賽，不誤判賽季落幕', async () => {
  const storage = proSave();
  const s = createCareerStore(storage);
  let c = s.loadCareer();
  const league = c.schedule.filter((m) => m.round === 'pro');
  // 前 6 場全勝（穩進前四）
  s.saveCareer({
    ...c,
    results: league.slice(0, 6).map((m) => ({
      matchId: m.id, opponentId: m.opponentId, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3,
    })),
  });
  // 第 7 場開賽落 pending 後「中途離開」（loadMidMatch()=null ⇒ midValid=false ⇒ 棄賽裁決）。
  // ★預燒 first-loss（一生一次的敗場對話）★——真實玩家到職業章早在高中就播過它；
  // 不燒的話棄賽敗會觸發對話，onDone＝renderCareer() 整個重來＝重新 loadCareer 自我修復，
  // HIGH 的錯誤畫面被對話洗掉、測試量不到（實測抓到的無鑑別力路徑）。
  c = s.loadCareer();
  s.saveCareer({
    ...c,
    pendingMatch: league[6].id,
    events: [...new Set([...(c.events ?? []), 'first-loss'])],
  });
  // ★不走 renderAndGetText★ 它會點掉對話觸發重繪＝第二輪 loadCareer 自我修復，
  // 把第一輪的錯誤畫面洗掉（壞版下照樣綠＝無鑑別力，實測抓到）。
  // HIGH 的症狀只在**第一輪 render**：這裡 render 完直接驗畫面、不點任何對話。
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const { createCareerStore: mkStore } = await import('../src/career/careerStore.js');
  const screen = createCareerScreen(mkStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
  const text = allText(globalThis.document.body);
  assert.match(text, /6 勝 1 敗|6勝1敗/, 'fixture 前提：棄賽敗已入帳（6 勝 1 敗）');
  assert.match(text, /準決賽/, '第一輪 render 就要看得到長出的準決賽（不是等下一輪自我修復）');
  assert.doesNotMatch(text, /賽季落幕/, '第一輪不得誤判賽季已收束（semi 未打）');
});

// ════════════════════════════════════════════════════════════════
// 送審反例修（第二輪）：存檔寫入失敗時不得靜默撤銷棄賽判定
// 改前紅：無條件 loadCareer 重讀＝讀回未棄賽舊檔，畫面出現「▶ 出戰 第7場」＝可白嫖重打
// ════════════════════════════════════════════════════════════════
test('送審修 寫入失敗的棄賽：當輪仍顯示棄賽已判（第7輪不得回到可出戰）', async () => {
  const storage = proSave();
  const s = createCareerStore(storage);
  let c = s.loadCareer();
  const league = c.schedule.filter((m) => m.round === 'pro');
  s.saveCareer({
    ...c,
    results: league.slice(0, 6).map((m) => ({
      matchId: m.id, opponentId: m.opponentId, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3,
    })),
  });
  c = s.loadCareer();
  s.saveCareer({
    ...c,
    pendingMatch: league[6].id,
    events: [...new Set([...(c.events ?? []), 'first-loss'])],
  });
  // 包一層「從現在起 setItem 一律拋錯」的 storage（私密模式語意）
  const failingStorage = {
    getItem: (k) => storage.getItem(k),
    setItem: () => { throw new Error('QuotaExceededError（模擬私密模式）'); },
    removeItem: (k) => storage.removeItem(k),
  };
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const { createCareerStore: mkStore } = await import('../src/career/careerStore.js');
  const screen = createCareerScreen(mkStore(failingStorage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
  const text = allText(globalThis.document.body);
  // 棄賽當輪仍要「已判」：第 7 輪顯示負場，不得出現「▶ 出戰」第 7 場對手的按鈕
  assert.match(text, /6 勝 1 敗|6勝1敗/, '寫入失敗當輪畫面仍要顯示棄賽敗已判（settled 兜底）');
  assert.doesNotMatch(text, /▶ 出戰 鐵骨戰王/, '不得讓玩家重打棄賽場次（反白嫖規則 07-22）');
  // ★第三輪修的反向斷言（第二輪送審抓到的復活路徑）★ 失敗兜底也要看得到季後賽——
  // 6 勝 1 敗＝晉級，畫面不得誤判賽季落幕（兜底 career 經記憶體端 growProSchedule 補長）
  assert.match(text, /準決賽/, '寫入失敗＋晉級：兜底畫面也要看得到長出的準決賽');
  assert.doesNotMatch(text, /賽季落幕/, '寫入失敗不得讓假「賽季落幕」復活（第一輪 HIGH 同款）');
  // ★第三輪送審裁定 (a)（Sawmah 2026-08-26）★ 兜底賽程的季後賽場次不在硬碟上，
  // 開打會在結算 recordResult 炸例外（送審實測）——degraded 當輪出戰鈕必須停用＋明示
  const playBtn = walk(globalThis.document.body)
    .find((n) => n.tag === 'button' && /▶ 出戰/.test(n.textContent ?? ''));
  assert.ok(playBtn, 'degraded 畫面仍要有出戰鈕（看得到、按不了——不是憑空消失）');
  assert.equal(playBtn.disabled, true, '裁定 (a)：存檔壞掉的當輪出戰鈕必須停用');
  assert.match(text, /存檔空間異常/, '裁定 (a)：要誠實明示存檔異常與復原方法');
});

// ════════════════════════════════════════════════════════════════
// 裁定 (a) 補全（確認審反例 1）：degraded＋同輪有到期賽後事件（不預燒 first-loss）
// 改前紅：對話無限重播（每輪重讀舊碟重推同一事件），警示畫面永遠到不了
// ════════════════════════════════════════════════════════════════
test('裁定(a)補全 degraded＋到期事件：跳過對話直達警示，不得無限重播', async () => {
  const storage = proSave();
  const s = createCareerStore(storage);
  let c = s.loadCareer();
  const league = c.schedule.filter((m) => m.round === 'pro');
  s.saveCareer({
    ...c,
    results: league.slice(0, 6).map((m) => ({
      matchId: m.id, opponentId: m.opponentId, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3,
    })),
  });
  // ★不預燒 first-loss★——棄賽敗＝生涯首敗，事件到期（確認審重現輸入）
  c = s.loadCareer();
  s.saveCareer({ ...c, pendingMatch: league[6].id });
  const failingStorage = {
    getItem: (k) => storage.getItem(k),
    setItem: () => { throw new Error('QuotaExceededError（模擬私密模式）'); },
    removeItem: (k) => storage.removeItem(k),
  };
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const { createCareerStore: mkStore } = await import('../src/career/careerStore.js');
  const screen = createCareerScreen(mkStore(failingStorage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
  const text = allText(globalThis.document.body);
  assert.doesNotMatch(text, /別背著。輸球是全隊的事/,
    'degraded 輪不得播事件對話（入帳落不了碟＝會無限重播）');
  assert.match(text, /存檔空間異常/, 'degraded＋到期事件也要直達警示畫面');
  const playBtn = walk(globalThis.document.body)
    .find((n) => n.tag === 'button' && /▶ 出戰/.test(n.textContent ?? ''));
  assert.equal(playBtn?.disabled, true, '出戰鈕停用（裁定 a 的承諾在此輪也成立）');
});

// ════════════════════════════════════════════════════════════════
// 裁定 (a) 最終形（最終確認審反例）：degraded＋不晉級＝季收束——
// 改前紅：走 proSeasonDone 分支，「▶ 賽季落幕」可點→「資料解不開」失敗卡循環，
// 警示永遠缺席
// ════════════════════════════════════════════════════════════════
test('裁定(a)最終形 degraded＋不晉級：鏈頂攔下，落幕鈕停用＋警示可見、無資料解不開卡', async () => {
  const storage = proSave();
  const s = createCareerStore(storage);
  let c = s.loadCareer();
  const league = c.schedule.filter((m) => m.round === 'pro');
  // 前 6 場全敗（確定不晉級）
  s.saveCareer({
    ...c,
    results: league.slice(0, 6).map((m) => ({
      matchId: m.id, opponentId: m.opponentId, won: false, scoreFor: 0, scoreAgainst: 2, gp: 1,
    })),
  });
  c = s.loadCareer();
  s.saveCareer({
    ...c,
    pendingMatch: league[6].id,
    events: [...new Set([...(c.events ?? []), 'first-loss'])],
  });
  const failingStorage = {
    getItem: (k) => storage.getItem(k),
    setItem: () => { throw new Error('QuotaExceededError（模擬私密模式）'); },
    removeItem: (k) => storage.removeItem(k),
  };
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const { createCareerStore: mkStore } = await import('../src/career/careerStore.js');
  const screen = createCareerScreen(mkStore(failingStorage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
  const text = allText(globalThis.document.body);
  assert.match(text, /存檔空間異常/, 'degraded＋不晉級也要看到統一警示（鏈頂分流）');
  assert.doesNotMatch(text, /資料解不開/, '不得落入措辭錯誤的既有結算失敗卡');
  const closingBtn = walk(globalThis.document.body)
    .find((n) => n.tag === 'button' && /賽季落幕/.test(n.textContent ?? ''));
  assert.ok(closingBtn, '季末情境要有落幕鈕（看得到按不了）');
  assert.equal(closingBtn.disabled, true, '落幕鈕必須停用（結算讀磁碟舊值必失敗）');
});
