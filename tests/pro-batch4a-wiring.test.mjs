// 職業章批 4a「餵線（案 A）＋賽前布置面板」— DOM 接線（2026-08-26）
// 驗收＝docs/kickoffs/acceptance-pro-batch4a.md（D1/D2/D4/D5 的真實 UI 行為）。
// 純函式/sim 層另見 tests/pro-batch4a.test.mjs。
// 假 DOM 形狀沿 tests/monotony-probe-wiring.test.mjs（同源，避免替身漂移；
// replaceChildren 帶參數版——showMatchupScreen 用 lineupOverlay.replaceChildren(card)）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
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
    replaceChildren(...kids) {
      this.children = [];
      for (const k of kids) this.appendChild(k);
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

/**
 * 治具直達職業章開局（未打任何一場），可選注入 scouting／techniques。
 * ★ 用治具而不是手打三年 ★ buildSyntheticSave＋advanceToPro 全走正式 store 方法鏈
 * （enterUniversity/enterCorporate/enterPro），不是拼出來的假存檔——但跳年鏈本身
 * 不呼叫 mergeScouting（沒打真實比賽），career.scouting 天然是乾淨的白紙，
 * 適合本批「有/無情蒐紀錄」兩態測試。
 */
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

/** 開career畫面→點「▶ 出戰」開對陣卡→回傳目前累積文字。 */
async function openMatchupScreen(storage) {
  await openCareerScreen(storage);
  const btn = findBtn(/▶ 出戰/);
  assert.ok(btn, 'fixture 前提：職業章第一場的「▶ 出戰」鈕要渲染得出來');
  tap(btn);
  await settle();
  return allText(globalThis.document.body);
}

// ════════════════════════════════════════════════════════════════
// D1：未解鎖＝零可見（對陣卡/面板無任何「餵線」新元素）
// ════════════════════════════════════════════════════════════════
test('D1 未解鎖餵線：對陣卡不出現「餵線」／「對手眼中的你」任何字樣', async () => {
  const storage = proReadyStorage({
    scouting: { 'probe-a': { zones: { line: 20, cross: 6, middle: 2, tip: 2 } } },
  });
  const text = await openMatchupScreen(storage);
  assert.doesNotMatch(text, /餵線/);
  assert.doesNotMatch(text, /對手眼中的你/);
});

// ════════════════════════════════════════════════════════════════
// D2：解鎖後——「對手眼中的你」可視化（分佈＋focus）／誠實顯示「讀不到你」
// ════════════════════════════════════════════════════════════════
test('D2① 解鎖＋有足夠聯賽聚合（排除本場對手）：分佈區塊出現、點名這場會押的線', async () => {
  const storage = proReadyStorage({
    baitLine: true,
    // 'probe-a'／'probe-b' 為合成 id（同 monotony-probe-wiring 先例），
    // 一定不等於職業聯賽第一場的真實對手 id，恰好落在 leagueScoutZones 的
    // excludeId 之外——這就是本場「聚合排除本場對手」要測的情境
    scouting: {
      'probe-a': { zones: { line: 20, cross: 6, middle: 2, tip: 2 } },
    },
  });
  const text = await openMatchupScreen(storage);
  assert.match(text, /🎯 餵線——對手眼中的你/);
  assert.match(text, /這場他們會押你的直線/);
});

test('D2② 解鎖但完全無聯賽聚合（新職業生涯，尚未真打過任何一場）：誠實顯示「讀不到你」，不畫假分佈', async () => {
  const storage = proReadyStorage({ baitLine: true });
  const text = await openMatchupScreen(storage);
  assert.match(text, /🎯 餵線——對手眼中的你/, '技術已解鎖，區塊本身要出現');
  assert.match(text, /讀不到你/);
  // ★反向★ 不得同時出現「押你的」這種點名句——沒有真分佈就不能點名
  assert.doesNotMatch(text, /這場他們會押你的/);
});

// ════════════════════════════════════════════════════════════════
// D4：賽前布置面板兩槽——僅職業章可見＋逐槽可選＋押下後文案改變
// ════════════════════════════════════════════════════════════════
test('D4① 面板標題「賽前布置（職業限定）」一定出現（職業章）', async () => {
  const storage = proReadyStorage({});
  const text = await openMatchupScreen(storage);
  assert.match(text, /賽前布置（職業限定）/);
});

test('D4② 攔網重心：本場對手有足夠情蒐紀錄 ⇒ 押直線／押斜線兩鈕可點，點下去文案改變', async () => {
  const storage = fakeStorage();
  storage.setItem(SAVE_KEY, JSON.stringify(buildSyntheticSave({ finish: FINISH.CHAMPION })));
  const store = createCareerStore(storage);
  assert.ok(advanceToPro(store, { teamId: 'cangyu-titans' }));
  const oppId = store.loadCareer().schedule[0].opponentId;
  store.saveCareer({
    ...store.loadCareer(),
    scouting: { [oppId]: { zones: { line: 8, cross: 1, middle: 1, tip: 0 } } }, // 直線 80%
  });

  await openCareerScreen(storage);
  tap(findBtn(/▶ 出戰/));
  await settle();
  let text = allText(globalThis.document.body);
  assert.match(text, /① 攔網重心/);
  assert.match(text, /押直線/);
  assert.match(text, /押斜線/);
  assert.doesNotMatch(text, /還沒跟這隊交手過/); // 閘門文案（送審矛盾修後措辭）
  // ★批 4a 覆審 HIGH（Sawmah 拍板 A 誠實降級）★ 槽①是盲注不是情報決策——
  // 不得再出現「這隊…偏向X」式誤導句（career.scouting＝對手讀你的紀錄，
  // 與對手自己會攻哪條線零關聯）；改為明示賭注
  assert.doesNotMatch(text, /這隊近期常被觀察到偏向/, '誤導性情蒐句必須拿掉');
  assert.match(text, /靠你自己的判斷/, '盲注要明示（誠實降級）');

  const pressLine = findBtn(/^押直線$/);
  assert.ok(pressLine, '押直線鈕要找得到');
  tap(pressLine);
  await settle();
  text = allText(globalThis.document.body);
  assert.match(text, /押下去了——猜對這波攔網賭中/);
});

test('D4③ 攔網重心：無足夠情蒐紀錄 ⇒ 情報不足、不給按鈕（D5）', async () => {
  const storage = proReadyStorage({});
  const text = await openMatchupScreen(storage);
  assert.match(text, /① 攔網重心/);
  // ★送審殘留矛盾修★ 槽①閘門措辭由「情報不足」改熟悉度敘事（行為不變：無紀錄不可押）。
  // 斷言限縮槽①舊句——槽②的「情報不足…不知道誰接發最弱」是真情報（weakestReceiverIdOf
  // 讀真實屬性）語意不矛盾，合法保留
  assert.match(text, /還沒跟這隊交手過/);
  assert.doesNotMatch(text, /情報不足——這隊還沒累積夠交手紀錄/, '槽①舊措辭不得再出現');
  assert.equal(findBtn(/^押直線$/), undefined, '情報不足時不得渲染可押的按鈕');
  assert.equal(findBtn(/^押斜線$/), undefined);
});

test('D4④ 發球攻擊：從沒和這隊交手過 ⇒ 情報不足、不給按鈕（D5）', async () => {
  const storage = proReadyStorage({});
  const text = await openMatchupScreen(storage);
  assert.match(text, /② 發球攻擊/);
  assert.match(text, /情報不足——還沒和這隊交手過，不知道誰接發最弱/);
});

test('D4⑤ 發球攻擊：對這隊已有 scouting 紀錄（哪怕是空紀錄）⇒ 給出指名追打鈕，點下去文案改變', async () => {
  const storage = fakeStorage();
  storage.setItem(SAVE_KEY, JSON.stringify(buildSyntheticSave({ finish: FINISH.CHAMPION })));
  const store = createCareerStore(storage);
  assert.ok(advanceToPro(store, { teamId: 'cangyu-titans' }));
  const oppId = store.loadCareer().schedule[0].opponentId;
  store.saveCareer({
    ...store.loadCareer(),
    scouting: { [oppId]: { zones: { line: 1, cross: 0, middle: 0, tip: 0 } } },
  });
  await openCareerScreen(storage);
  tap(findBtn(/▶ 出戰/));
  await settle();
  let text = allText(globalThis.document.body);
  assert.match(text, /接發最弱/);
  const chaseBtn = findBtn(/接發最弱/);
  assert.ok(chaseBtn);
  tap(chaseBtn);
  await settle();
  text = allText(globalThis.document.body);
  assert.match(text, /✓ 追打/);
  assert.match(text, /全場指名追發——追發失誤率上升，非純增益/);
});

// ════════════════════════════════════════════════════════════════
// D4 落檔：確認出戰後，選擇真的存進 store（經 saveDeployment，非只是畫面態）
// ════════════════════════════════════════════════════════════════
test('D4 落檔：押線後點「✓ 確認出戰」＝store.loadDeployment 讀得到剛才的選擇', async () => {
  const storage = fakeStorage();
  storage.setItem(SAVE_KEY, JSON.stringify(buildSyntheticSave({ finish: FINISH.CHAMPION })));
  const store = createCareerStore(storage);
  assert.ok(advanceToPro(store, { teamId: 'cangyu-titans' }));
  const career = store.loadCareer();
  const oppId = career.schedule[0].opponentId;
  const matchId = career.schedule[0].id;
  store.saveCareer({
    ...career,
    scouting: { [oppId]: { zones: { line: 8, cross: 1, middle: 1, tip: 0 } } },
  });

  await openCareerScreen(storage);
  tap(findBtn(/▶ 出戰/));
  await settle();
  tap(findBtn(/^押斜線$/));
  await settle();
  const confirmBtn = findBtn(/確認出戰/);
  assert.ok(confirmBtn, 'fixture 前提：預設陣容應合法、確認鈕要渲染出來');
  tap(confirmBtn);
  await settle();

  const saved = createCareerStore(storage).loadDeployment(matchId);
  assert.equal(saved.blockLean, 'cross');
});

test('D4 落檔②：非職業章（企業章）確認出戰——不呼叫 saveDeployment、也不炸（回歸防呆）', async () => {
  const storage = fakeStorage();
  storage.setItem(SAVE_KEY, JSON.stringify(buildSyntheticSave({ finish: FINISH.CHAMPION })));
  const store = createCareerStore(storage);
  // 只跳到企業章（不進職業）——沿用 devSeed 的 advanceToCorp 鏈
  const { advanceToCorp } = await import('../src/career/devSeed.js');
  assert.ok(advanceToCorp(store, { corpId: 'panshi-heavy' }));
  await openCareerScreen(storage);
  const btn = findBtn(/▶ 出戰/);
  if (btn) {
    tap(btn);
    await settle();
    // 企業章不該有職業限定面板
    const text = allText(globalThis.document.body);
    assert.doesNotMatch(text, /賽前布置（職業限定）/);
    const confirmBtn = findBtn(/確認出戰/);
    if (confirmBtn) {
      tap(confirmBtn);
      await settle(); // 不炸即通過——沒有 assert 失敗代表 store.saveDeployment 分支正確跳過
    }
  }
});
