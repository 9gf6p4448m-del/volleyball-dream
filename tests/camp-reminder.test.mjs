// 2026-08-09 試玩前補強 — 兩個「靜默漏掉」的洞
//
// ★ 洞一：集訓沒做完就離場 ★ 舊碼的耐力 +2 是無條件發的；屆間養成卷改成玩家自己按，
//   於是多出一條舊碼沒有的失敗路徑——整個冬天沒按任何一格就按「▶ 結束集訓」，
//   畫面不攔、不提醒，那一屆的加值就過去了。第二次集訓的默契更嚴重：一生只有這一次。
//
// ★ 洞二：學會叫戰術**之後**才轉位的人沒有補課 ★ `teach-call` 是 once 事件、掛在
//   第一次集訓，播的是**當下**那個位置的 `roleLines`。第 3 屆才轉任 OPP 的玩家於是
//   永遠聽不到夾塞那段，卻在比賽裡看得到那顆 🤝 紫鈕。
//
// ★ 量測位置（`02 §6.1` 條 5）★ 提醒這件事的價值**全部在接線上**——判斷式寫對了
//   但沒接到那顆鈕，玩家一樣會漏掉。所以下半場不是掃原始碼字串，而是用假 DOM
//   （沿 replay-vault.test.mjs 的替身形狀）真的跑 `showTrainingCamp`、真的按那顆鈕，
//   斷言的是「`onDone` 有沒有被呼叫」——與玩家會遇到的事同一件。
//
// ★ 反向對照（`02 §6.1` 條 1 的反面）★ 每個「會攔」的斷言都配一個「不該攔就別攔」：
//   耐力已達上限那格本來就不能按，這時再喊「你還沒練」就是恆真的假警報。
import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingCampSlots, campPlanFor, CAMP_ATTR_TRAINING } from '../src/career/trainingCamp.js';
import { positionTalkFor, transferTalkFor } from '../src/career/positionEvents.js';
import { CALL_PLAY_ROLE_LINES, callPlayBriefFor } from '../src/career/callPlayBrief.js';
import { EVENT_DEFS } from '../src/career/events.js';

const MB = { id: 'A6', name: '阿岩', role: 'middle' };
const playerAt = (over = {}) => ({
  id: 'A2',
  currentRole: 'outside',
  height: { current: 1.85 },
  attributes: { stamina: 60, control: 50 },
  techniques: {},
  ...over,
});

// ════════════════════════════════════════════════════════════
// 一、未完成清單（資料層）
// ════════════════════════════════════════════════════════════

test('屬性特訓沒按＝未完成；按過就不再提', () => {
  const plan = campPlanFor(2);
  const pend = pendingCampSlots({ player: playerAt(), plan, members: [MB], attrTrained: false });
  assert.deepEqual(pend.map((p) => p.key), ['attr']);
  const after = pendingCampSlots({ player: playerAt(), plan, members: [MB], attrTrained: true });
  assert.deepEqual(after, [], '按過之後不得再喊');
});

test('★反向★ 耐力已達上限＝那格本來就不能按，不得提醒（恆真的提醒等於沒有提醒）', () => {
  const cap = CAMP_ATTR_TRAINING.stamina.cap;
  assert.ok(cap > 0, '上限必須是拍板過的實值，不得為 null');
  const maxed = playerAt({ attributes: { stamina: cap, control: 50 } });
  const pend = pendingCampSlots({ player: maxed, plan: campPlanFor(2), members: [MB], attrTrained: false });
  assert.deepEqual(pend, [], '沒有任何可選項時提醒玩家「你還沒練」＝假警報');
});

test('默契格只在第二次集訓算未完成，挑過就不再提', () => {
  const first = pendingCampSlots({
    player: playerAt(), plan: campPlanFor(2), members: [MB], attrTrained: true,
  });
  assert.deepEqual(first, [], '第一次集訓沒有默契格');

  const second = pendingCampSlots({
    player: playerAt(), plan: campPlanFor(3), members: [MB], attrTrained: true,
  });
  assert.deepEqual(second.map((p) => p.key), ['chemistry']);

  const picked = pendingCampSlots({
    player: playerAt({ chemistry: { pairs: {}, focusId: 'A6' } }),
    plan: campPlanFor(3),
    members: [MB],
    attrTrained: true,
  });
  assert.deepEqual(picked, [], '挑過人之後不得再喊');
});

test('★反向★ 名冊湊不出默契對象＝那格本來就是空的，不得提醒', () => {
  // 自由人本卷零載體；OH 但名冊上一個欄中都不剩＝另一種空法。兩種都不算未完成。
  const libero = pendingCampSlots({
    player: playerAt({ currentRole: 'libero' }), plan: campPlanFor(3), members: [MB], attrTrained: true,
  });
  assert.deepEqual(libero, [], '自由人沒有默契格');
  const noMates = pendingCampSlots({
    player: playerAt(), plan: campPlanFor(3), members: [], attrTrained: true,
  });
  assert.deepEqual(noMates, [], '湊不出對象就不是玩家沒做');
});

test('兩格都沒做＝兩項都列出來（順序固定，決定論）', () => {
  const pend = pendingCampSlots({
    player: playerAt(), plan: campPlanFor(3), members: [MB], attrTrained: false,
  });
  assert.deepEqual(pend.map((p) => p.key), ['attr', 'chemistry']);
  for (const p of pend) {
    assert.ok(p.label && p.note, '每一項都要說得出「你正在放棄什麼」，不得只有標題');
  }
});

// ════════════════════════════════════════════════════════════
// 二、真的按那顆鈕（假 DOM 驅動正式 showTrainingCamp）
// ════════════════════════════════════════════════════════════

function fakeDom() {
  const make = (tag = 'div') => ({
    tag,
    style: { cssText: '' },
    textContent: '',
    children: [],
    handlers: {},
    disabled: false,
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    remove() { this.parent?.removeChild(this); },
    addEventListener(ev, fn) { (this.handlers[ev] ||= []).push(fn); },
    removeEventListener(ev, fn) {
      this.handlers[ev] = (this.handlers[ev] ?? []).filter((f) => f !== fn);
    },
    replaceChildren() { this.children = []; },
  });
  globalThis.document = { createElement: (t) => make(t), body: make('body') };
  globalThis.window = { innerWidth: 400, matchMedia: () => ({ matches: true }) };
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
const findByText = (root, re) => walk(root).find((n) => re.test(n.textContent ?? ''));
const settle = () => new Promise((r) => { setTimeout(r, 0); });

// 開場演出＝逐句點擊推進；一路點到選擇面板出現為止（上限防呆，不用寫死句數）
async function openPanel(opts) {
  fakeDom();
  const { showTrainingCamp } = await import('../src/ui/trainingCamp.js');
  let donePlayer;
  let doneCalls = 0;
  showTrainingCamp({
    members: [MB], techPending: false, techNames: [], ...opts,
    onDone: (p) => { doneCalls += 1; donePlayer = p; },
  });
  await settle();
  const overlay = document.body.children[0];
  for (let i = 0; i < 10 && !findByText(overlay, /結束集訓/); i += 1) {
    tap(overlay);
    await settle();
  }
  const doneBtn = findByText(overlay, /結束集訓/);
  assert.ok(doneBtn, '開場演出之後必須走到選擇面板');
  return { overlay, doneBtn, calls: () => doneCalls, player: () => donePlayer };
}

test('UI：什麼都沒選就按「結束集訓」——不放行，改出確認卡', async () => {
  const ui = await openPanel({ player: playerAt(), seasonIndex: 2 });
  assert.match(ui.doneBtn.textContent, /還有 1 項沒做：屬性特訓/, '鈕面就要說出剩什麼');

  tap(ui.doneBtn);
  await settle();
  assert.equal(ui.calls(), 0, '★這一條是本檔的核心★ 沒做完就按，不得直接離場');

  const confirm = document.body.children[1];
  assert.ok(confirm, '要出現確認卡');
  const texts = walk(confirm).map((n) => n.textContent).filter(Boolean).join('｜');
  assert.match(texts, /屬性特訓/, '確認卡要指名是哪一項沒做');
  assert.match(texts, /回去選/);
  assert.match(texts, /就這樣結束/);
});

test('UI：確認卡「回去選」＝收掉卡片、留在集訓；「就這樣結束」才真的離場', async () => {
  const ui = await openPanel({ player: playerAt(), seasonIndex: 2 });
  tap(ui.doneBtn);
  await settle();

  const back = findByText(document.body.children[1], /回去選/);
  tap(back);
  await settle();
  assert.equal(document.body.children.length, 1, '確認卡要收掉');
  assert.equal(ui.calls(), 0, '回去選不得離場');

  tap(ui.doneBtn);
  await settle();
  const leave = findByText(document.body.children[1], /就這樣結束/);
  tap(leave);
  await settle();
  assert.equal(ui.calls(), 1, '玩家堅持要走就放行——這是提醒，不是牢籠');
});

test('UI：選了屬性特訓之後鈕面復原，按一下直接離場且加值真的入帳', async () => {
  const ui = await openPanel({ player: playerAt(), seasonIndex: 2 });
  const staminaBtn = findByText(ui.overlay, /^耐力 60 ＋/);
  assert.ok(staminaBtn, '耐力那格要是可選的');
  tap(staminaBtn);
  await settle();

  assert.equal(ui.doneBtn.textContent, '▶ 結束集訓', '做完了就不該再掛提示');
  tap(ui.doneBtn);
  await settle();
  assert.equal(ui.calls(), 1, '沒有未完成項時按一下就走，不得多一層確認');
  assert.equal(
    ui.player().attributes.stamina,
    60 + CAMP_ATTR_TRAINING.stamina.gain,
    '離場帶出去的必須是加過值的球員',
  );
});

test('★反向★ UI：耐力已達上限＝無事可做，按一下直接放行（不得攔）', async () => {
  const cap = CAMP_ATTR_TRAINING.stamina.cap;
  const ui = await openPanel({
    player: playerAt({ attributes: { stamina: cap, control: 50 } }),
    seasonIndex: 2,
  });
  assert.equal(ui.doneBtn.textContent, '▶ 結束集訓');
  tap(ui.doneBtn);
  await settle();
  assert.equal(ui.calls(), 1, '沒有可做的事還攔人＝假警報');
  assert.equal(document.body.children.length, 0, '離場後覆蓋層要收乾淨');
});

// ════════════════════════════════════════════════════════════
// 三、學會之後才轉位的補課
// ════════════════════════════════════════════════════════════

const OPP_LINE = CALL_PLAY_ROLE_LINES.opposite;

test('單一真相源：teach-call 的 roleLines 就是 CALL_PLAY_ROLE_LINES（同一個物件）', () => {
  const teachCall = EVENT_DEFS.find((e) => e.id === 'teach-call');
  assert.ok(teachCall, 'teach-call 必須還在事件表裡');
  assert.equal(
    teachCall.roleLines,
    CALL_PLAY_ROLE_LINES,
    '兩份文案分岔過一次（體力／控制 vs 耐力／控球）就夠了——這裡只能有一份',
  );
});

test('屆間轉位：已學會叫戰術的人轉任 OPP，接受對話尾端補上夾塞那段', () => {
  const talk = positionTalkFor({
    flags: { opposite: 'open' },
    player: playerAt({ techniques: { callPlay: 1 } }),
    members: [MB, { id: 'N2', name: '小翼', role: 'opposite' }],
  });
  assert.equal(talk.role, 'opposite');
  assert.equal(talk.acceptLines.at(-1).text, OPP_LINE.text, '最後一句要是新位置的說明');
  assert.match(talk.acceptLines.at(-1).text, /夾塞/, '★這顆鈕沒人介紹過正是本 finding★');
  assert.match(talk.acceptLines.at(-2).text, /換了位置/, '要有橋接句，不得突然插播');
});

test('★反向★ 還沒學會叫戰術的人不補課（他之後的第一次集訓會照常上）', () => {
  const base = positionTalkFor({
    flags: { opposite: 'open' },
    player: playerAt({ techniques: {} }),
    members: [MB],
  });
  assert.ok(
    base.acceptLines.every((l) => l.text !== OPP_LINE.text),
    '未解鎖就補課＝之後集訓再播一次＝重播',
  );
  const learned = positionTalkFor({
    flags: { opposite: 'open' },
    player: playerAt({ techniques: { callPlay: 1 } }),
    members: [MB],
  });
  assert.equal(
    learned.acceptLines.length,
    base.acceptLines.length + 2,
    '差別必須恰好是橋接句＋位置說明兩句',
  );
});

test('賽季中請調也走同一條補課路（兩個入口二選一，漏一個就有一半的人補不到）', () => {
  const talk = transferTalkFor({
    role: 'opposite',
    player: playerAt({ techniques: { callPlay: 1 } }),
    members: [MB],
  });
  assert.equal(talk.acceptLines.at(-1).text, OPP_LINE.text);
});

test('每個可轉任的位置都補得到自己的那句（不得只顧 OPP）', () => {
  for (const role of ['setter', 'middle', 'libero', 'opposite']) {
    const lines = callPlayBriefFor({ role, player: playerAt({ techniques: { callPlay: 1 } }) });
    assert.equal(lines.length, 2, `${role} 要有橋接句＋位置說明`);
    assert.equal(lines.at(-1).text, CALL_PLAY_ROLE_LINES[role].text, `${role} 的句子要對得上`);
  }
});
