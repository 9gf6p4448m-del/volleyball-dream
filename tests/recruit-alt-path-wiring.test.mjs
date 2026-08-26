// 接線驗收：替代路徑「有沒有真的講給玩家看」
//
// ★ 為什麼要這一檔 ★ 純函式測只證明「判定對了」。本專案兩次踩的是**接線**：
//   `bquickButton` 定義了、接了，漏加 matchStage 的 return 清單 ⇒ 從上線起一次沒出現；
//   落點圈畫的是球落地處而不是相遇點 ⇒ 提示與真正的判準脫鉤。替代路徑同樣有兩條
//   線要接：① 生涯畫面的招募進度列 ② 賽中達成的壯舉字卡。任一沒接上，「玩二傳
//   推不動招募」就只修了一半——玩家仍然看不到路。
//
// ★ 量測位置 ★ 兩段都跑**真正的**產品函式：上半場用假 DOM 真的把 `createCareerScreen`
//   從主選單點進生涯畫面（不是掃源碼字串），下半場直接呼叫真正的 `buildRecruitWatch`
//   ＋`checkRecruitFeats`（不是重抄一份判定）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecruitWatch, checkRecruitFeats } from '../src/app/matchLoop.js';
import { RECRUIT_CONDS } from '../src/career/recruitment.js';

// ── 極簡 DOM 替身（沿 replay-vault.test.mjs 的形狀，加上可觸發的 listener 記錄）──
function fakeDom() {
  const make = (tag = 'div') => ({
    tag,
    style: { cssText: '' },
    textContent: '',
    children: [],
    listeners: null,
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(ev, fn) {
      this.listeners ??= {};
      (this.listeners[ev] ??= []).push(fn);
    },
    removeEventListener() {},
    // 債清批 2026-08-26：照真實 DOM 語意帶參數（原版丟參數＝replaceChildren(card) 內容憑空消失）
    replaceChildren(...nodes) { this.children = []; for (const n of nodes) this.appendChild(n); },
    remove() {},
    focus() {},
    setAttribute() {},
    getAttribute() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() {
      return {
        top: 0, left: 0, width: 100, height: 100, bottom: 0, right: 0,
      };
    },
    classList: { add() {}, remove() {}, toggle() {} },
  });
  globalThis.document = {
    createElement: (t) => make(t),
    body: make('body'),
    head: make('head'),
    createTextNode: (t) => ({ textContent: t }),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = {
    addEventListener() {}, removeEventListener() {}, innerWidth: 800, innerHeight: 600,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  globalThis.requestAnimationFrame = () => 0;
}

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

const subtreeText = (n) => [n.textContent || '', ...(n.children ?? []).map(subtreeText)].join(' ');

// 點下「文字包含 label 且自己掛了 pointerdown」的最內層節點（＝真人會點的那顆）
function tapByText(root, label) {
  const all = [];
  const collect = (n) => { if (n) { all.push(n); (n.children ?? []).forEach(collect); } };
  collect(root);
  const node = all.reverse().find((n) => n.listeners?.pointerdown && subtreeText(n).includes(label));
  if (!node) return false;
  node.listeners.pointerdown.forEach((fn) => fn({ stopPropagation() {}, preventDefault() {} }));
  return true;
}

function allTexts(root) {
  const out = [];
  const walk = (n) => { if (n) { if (n.textContent) out.push(n.textContent); (n.children ?? []).forEach(walk); } };
  walk(root);
  return out;
}

// ════════════════════════════════════════════════════════════
// 一、生涯畫面的招募進度列（假 DOM、真畫面、真的點進去）
// ════════════════════════════════════════════════════════════

// 用指定位置開一份生涯、點進生涯畫面，回傳畫面上所有文字節點
async function renderCareerAs(currentRole, seedProgress = null) {
  fakeDom();
  const { createSlotStoreProxy } = await import('../src/career/careerStore.js');
  const { createCareer, createCareerPlayer } = await import('../src/career/careerState.js');
  const { ensureStarterRoster } = await import('../src/career/roster.js');
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');

  const store = createSlotStoreProxy(fakeStorage(), 1);
  store.saveCareer(createCareer({ seed: 42, playerName: '測試員' }));
  store.savePlayer({ ...createCareerPlayer('測試員'), currentRole });
  ensureStarterRoster(store);
  if (seedProgress) seedProgress(store);

  const screen = createCareerScreen(store, { onPlay() {}, onQuick() {}, primeSlot: null });
  screen.show();
  assert.equal(tapByText(document.body, '▶ 生涯'), true, '主選單沒有「▶ 生涯」可點');
  assert.equal(tapByText(document.body, '測試員'), true, '存檔槽卡點不進去');
  const texts = allTexts(document.body);
  assert.ok(texts.some((t) => t.includes('招募')), '沒渲染到招募區塊＝這個測試的前提沒成立');
  return texts;
}

test('玩二傳：招募進度列寫出助攻替代路徑（主選單→存檔槽→生涯畫面，全程真實 UI 路徑）', async () => {
  const texts = await renderCareerAs('setter');
  const line = texts.find((t) => t.includes('攔死其攻擊') && t.includes('單場助攻'));
  assert.ok(line, `招募進度列沒寫出助攻替代路徑；實際渲染：${JSON.stringify(
    texts.filter((t) => t.includes('攔死其攻擊')),
  )}`);
  assert.ok(line.includes(' 或 '), `替代路徑要用「或」串接，實際：${line}`);
  // 進度分母＝條件表的 count（畫面與判準同一份數字，不是另寫死一個）
  const alt = RECRUIT_CONDS.obsidian.altFeats.find((f) => f.type === 'assistMatch');
  assert.ok(line.includes(`${alt.label} 0/${alt.count}`), `進度顯示與條件表對不上：${line}`);
  // ★不承諾走不到的路★：二傳的起球拿不到分（綁位置），畫面就不該列它
  assert.equal(texts.some((t) => t.includes('單場起球')), false,
    '二傳看到了自由人專屬的起球路＝畫面承諾了判定端不會給的東西');
});

test('玩自由人：列的是起球路，不是助攻路（同一份過濾器、反向對照）', async () => {
  const texts = await renderCareerAs('libero');
  const line = texts.find((t) => t.includes('攔死其攻擊') && t.includes('單場起球'));
  assert.ok(line, `自由人沒看到起球替代路徑；實際渲染：${JSON.stringify(
    texts.filter((t) => t.includes('攔死其攻擊')),
  )}`);
  assert.equal(texts.some((t) => t.includes('單場助攻')), false, '自由人不該看到二傳的路');
});

test('玩主攻手：一條替代路徑都不列（原軸本來就走得到，替代路徑不是通用捷徑）', async () => {
  const texts = await renderCareerAs('outside');
  assert.equal(texts.some((t) => t.includes('單場助攻') || t.includes('單場起球')), false);
  // 反向對照：原軸照常顯示（不是整段沒渲染出來）
  assert.ok(texts.some((t) => t.includes('攔死其攻擊')), '原壯舉軸不該跟著消失');
});

// ★08-11 第二輪覆審 N5★：二傳累積了替代軸進度之後轉回 OH，那些進度會從畫面消失、
// 卻仍計入 conditionMet ⇒ 玩家看到「條件達成」卻找不到是哪一條達成的；未達標的則是
// 兩屆的累積憑空不見、也不知道轉回二傳就能接著推。
test('轉位之後：已累積的替代軸進度照列，並標明要回到哪個位置才會繼續累加', async () => {
  const texts = await renderCareerAs('outside', (store) => {
    const rec = store.loadRecruitment();
    store.saveRecruitment({
      ...rec,
      progress: {
        ...(rec.progress ?? {}),
        'iron-mist-2': { wins: 0, feat: 0, alts: { assistMatch: 1 } },
      },
    });
  });
  const line = texts.find((t) => t.includes('單場助攻 17 次'));
  assert.ok(line, `轉位後那條有進度的替代軸不見了；實際：${JSON.stringify(
    texts.filter((t) => t.includes('ACE')),
  )}`);
  assert.ok(line.includes('1/2'), `進度值要照實顯示：${line}`);
  assert.ok(line.includes('（需S）'), `要講清楚回到哪個位置才會繼續累加：${line}`);
  // 反向對照：零進度的那條（起球）仍然不列——不是變成「什麼都列」
  assert.equal(texts.some((t) => t.includes('單場起球')), false);
});

// ════════════════════════════════════════════════════════════
// 二、賽中壯舉字卡（真的 buildRecruitWatch ＋ checkRecruitFeats）
// ════════════════════════════════════════════════════════════

const touch = (team, playerId, kind, power = 1) => ({ type: 'TOUCH', team, playerId, kind, power });
const serve = (team, playerId) => ({ type: 'SERVE', team, playerId });
const score = (team) => ({ type: 'SCORE', team });
const dead = () => ({ type: 'DEAD_BALL' });
const assistRally = () => [
  serve('B', 'B1'), touch('A', 'A5', 'receive', 0.8),
  touch('A', 'A2', 'set', 0.9), touch('A', 'A4', 'spike', 1),
  dead(), score('A'),
];

// iron-mist-2＝純壯舉軸（無 wins），替代軸 assistMatch perMatch 17 × count 2
const ctxFor = (recruitment) => ({
  matchEntry: { opponentId: 'iron-mist' },
  seasonIndex: 1,
  store: { loadRecruitment: () => recruitment },
});
const stateFor = (watch, events, role = 'setter') => ({
  recruitWatch: watch,
  playerId: 'A2',
  game: { players: { A2: { teamId: 'A', currentRole: role } }, events },
});

test('監看清單只收「這個位置走得到」的軸（二傳＝原軸＋助攻，沒有起球）', () => {
  const watch = buildRecruitWatch(ctxFor({ progress: {}, recruited: [] }), 'A2', 'setter');
  const entry = watch.find((w) => w.key === 'iron-mist-2');
  assert.ok(entry, 'iron-mist-2 沒被收進監看清單');
  assert.deepEqual(entry.axes.map((a) => a.f.type), ['aceMatch', 'assistMatch']);
  // 反向對照：自由人拿到的是另一條
  const asL = buildRecruitWatch(ctxFor({ progress: {}, recruited: [] }), 'A2', 'libero');
  assert.deepEqual(
    asL.find((w) => w.key === 'iron-mist-2').axes.map((a) => a.f.type),
    ['aceMatch', 'saveMatch'],
  );
  // 主攻手只監看原軸
  const asOH = buildRecruitWatch(ctxFor({ progress: {}, recruited: [] }), 'A2', 'outside');
  assert.deepEqual(
    asOH.find((w) => w.key === 'iron-mist-2').axes.map((a) => a.f.type), ['aceMatch'],
  );
});

test('走替代路徑達成時，賽中真的彈卡（卡面寫的是真正達成的那條路）', () => {
  // 已累積 1 場助攻達標 ⇒ 本場再一次就滿 count 2
  const rec = {
    progress: { 'iron-mist-2': { wins: 0, feat: 0, alts: { assistMatch: 1 } } },
    recruited: [],
  };
  const watch = buildRecruitWatch(ctxFor(rec), 'A2', 'setter');
  const events = Array.from({ length: 17 }, () => assistRally()).flat();
  const cards = [];
  checkRecruitFeats(stateFor(watch, events), cards);
  assert.equal(cards.length, 1, '達成了卻沒彈卡');
  assert.ok(cards[0].text.includes('單場助攻 17 次'),
    `卡面應寫真正達成的那條軸，實際：${cards[0].text}`);
});

test('反向對照：沒達成就別彈（差一球不彈、原軸也沒達成時不彈）', () => {
  const rec = {
    progress: { 'iron-mist-2': { wins: 0, feat: 0, alts: { assistMatch: 1 } } },
    recruited: [],
  };
  const watch = buildRecruitWatch(ctxFor(rec), 'A2', 'setter');
  const events = Array.from({ length: 16 }, () => assistRally()).flat(); // 差一球
  const cards = [];
  checkRecruitFeats(stateFor(watch, events), cards);
  assert.deepEqual(cards, [], '差一球就不該報達成（假警報會訓練玩家忽略這個提示）');
});

// ★08-11 對抗覆審 HIGH★：這張卡只驗壯舉軸，wins/stage 的完成點在賽末。08-09 真人
// 已經被它騙過一次（字卡照發、賽後零入隊）；替代軸讓卡變頻繁之後，那個誇大會變常態。
test('卡面誠實：wins 還沒到就不准說「招募條件達成」', () => {
  // gale-shore-2 需要 wins 1；助攻軸 17×3，已累積 2 場 ⇒ 這場達標即滿，但這場還沒贏
  const rec = {
    progress: { 'gale-shore-2': { wins: 0, feat: 0, alts: { assistMatch: 2 } } },
    recruited: [],
  };
  const ctx = {
    matchEntry: { opponentId: 'gale-shore' },
    seasonIndex: 1,
    store: { loadRecruitment: () => rec },
  };
  const watch = buildRecruitWatch(ctx, 'A2', 'setter');
  const events = Array.from({ length: 19 }, () => assistRally()).flat();
  const cards = [];
  checkRecruitFeats(stateFor(watch, events), cards);
  const card = cards.find((c) => c.text.includes('單場助攻'));
  assert.ok(card, '替代軸達成卻沒彈卡');
  assert.equal(card.text.includes('招募條件達成'), false,
    `wins 未達卻寫「招募條件達成」＝畫面說謊：${card.text}`);
  assert.ok(card.text.includes('壯舉達成'), card.text);
  assert.ok(card.text.includes('還需贏下這場'), `要把還缺什麼講出來：${card.text}`);
});

test('卡面誠實：還差 2 勝以上時寫出勝場數（不是只有「還需贏下這場」那一種）', () => {
  // white-wave 需要 wins 2；助攻軸 18×3 已累積 2 場，這場達標即滿
  const rec = {
    progress: { 'white-wave': { wins: 0, feat: 0, alts: { assistMatch: 2 } } },
    recruited: [],
  };
  const ctx = {
    matchEntry: { opponentId: 'white-wave' },
    seasonIndex: 1,
    store: { loadRecruitment: () => rec },
  };
  const watch = buildRecruitWatch(ctx, 'A2', 'setter');
  const cards = [];
  checkRecruitFeats(stateFor(watch, Array.from({ length: 18 }, () => assistRally()).flat()), cards);
  const card = cards.find((c) => c.text.includes('單場助攻'));
  assert.ok(card, '替代軸達成卻沒彈卡');
  assert.ok(card.text.includes('還差 2 勝'), `勝場數要寫出來：${card.text}`);
});

test('卡面誠實：反向對照——條件真的全到位時才說「招募條件達成」', () => {
  // iron-mist-2 是純壯舉軸（無 wins/stage）⇒ 壯舉達成＝條件真的成立
  const rec = {
    progress: { 'iron-mist-2': { wins: 0, feat: 0, alts: { assistMatch: 1 } } },
    recruited: [],
  };
  const watch = buildRecruitWatch(ctxFor(rec), 'A2', 'setter');
  const cards = [];
  checkRecruitFeats(stateFor(watch, Array.from({ length: 17 }, () => assistRally()).flat()), cards);
  assert.ok(cards[0].text.includes('招募條件達成'), cards[0].text);
  assert.equal(cards[0].text.includes('還'), false, `不該冒出多餘的但書：${cards[0].text}`);
});

test('已達標的軸不再監看（避免整場重複彈同一張）', () => {
  // gale-shore-2：助攻軸 17×3 已滿，但 wins 未達 ⇒ 整槽仍要監看（原軸還有機會），
  // 只有那條已滿的軸退出
  const rec = {
    progress: { 'gale-shore-2': { wins: 0, feat: 0, alts: { assistMatch: 3 } } },
    recruited: [],
  };
  const ctx = {
    matchEntry: { opponentId: 'gale-shore' },
    seasonIndex: 1,
    store: { loadRecruitment: () => rec },
  };
  const entry = buildRecruitWatch(ctx, 'A2', 'setter').find((w) => w.key === 'gale-shore-2');
  assert.ok(entry, '原軸還沒滿，這一槽仍該在清單裡');
  assert.equal(entry.axes.some((a) => a.f.type === 'assistMatch'), false,
    '已達標的助攻軸不該再被監看');
});

// ★這條守的是我自己引進的倒退（08-11 第二輪覆審 N1）★：把「整槽達標就不監看」的
// 短路改成逐軸過濾之後，**條件早就成立、只是卡在名冊滿編等候名單**的槽，會在往後
// 每一場重新彈「⭐ 招募條件達成」——08-09 真人被騙的那個現象換個入口回來。
test('條件早就成立的槽完全退出監看（滿編等候中也不再每場重彈）', () => {
  const rec = {
    progress: { 'iron-mist-2': { wins: 0, feat: 0, alts: { assistMatch: 2 } } },
    recruited: [], // 條件成立但還沒入隊＝名冊滿編、在等候名單裡
  };
  const watch = buildRecruitWatch(ctxFor(rec), 'A2', 'setter');
  assert.equal(watch.some((w) => w.key === 'iron-mist-2'), false,
    '條件已成立卻還在監看＝往後每場都會重彈「招募條件達成」');
  // 反向對照：差一場的話照樣要監看（不是把整條路關掉）
  const notYet = {
    progress: { 'iron-mist-2': { wins: 0, feat: 0, alts: { assistMatch: 1 } } },
    recruited: [],
  };
  assert.ok(buildRecruitWatch(ctxFor(notYet), 'A2', 'setter').some((w) => w.key === 'iron-mist-2'));
});
