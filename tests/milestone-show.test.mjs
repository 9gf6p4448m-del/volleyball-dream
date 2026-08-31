// 大作感四卷 批2（J1）：里程碑全螢幕演出——純函式層測試。
// 驗收凍結：docs/kickoffs/juice4-kickoff-20260831.md「J1 里程碑當下演出」①
// 「同一里程碑演出恰一次（存檔重進不重播），純函式測試蓋「該不該演」判定」——
// 「該不該演」的判定核心＝milestoneShowContent(id)：認得的三個里程碑 id 才回內容，
// 其餘 id（其他賽前事件——宿敵線/王勝翔線/教學局邀請等）一律回 null＝不演。
// 「存檔重進不重播」本身是 proMilestonePreEvents 的既有 dedup 職責（career.events
// 一生一次旗標），已在 tests/milestone-rival-batch1.test.mjs M3 覆蓋，本檔不重測。
import test from 'node:test';
import assert from 'node:assert/strict';

import { milestoneShowContent } from '../src/ui/milestoneShow.js';
import {
  MILESTONE_VETERAN_EV, MILESTONE_DYNASTY_EV, MILESTONE_FINAL_PUSH_EV,
} from '../src/career/proMilestones.js';

test('J1① milestoneShowContent：三個已知里程碑 id 各自回傳非空的 {icon,title,sub}', () => {
  for (const id of [MILESTONE_VETERAN_EV, MILESTONE_DYNASTY_EV, MILESTONE_FINAL_PUSH_EV]) {
    const c = milestoneShowContent(id);
    assert.ok(c, `${id} 要有演出內容`);
    assert.equal(typeof c.icon, 'string');
    assert.ok(c.icon.length > 0, 'icon 不得為空字串');
    assert.equal(typeof c.title, 'string');
    assert.ok(c.title.length > 0, 'title 不得為空字串');
    assert.equal(typeof c.sub, 'string');
    assert.ok(c.sub.length > 0, 'sub 不得為空字串');
  }
});

test('J1① 三張卡的 title 各不相同（不是同一份內容貼三個 id）', () => {
  const titles = [MILESTONE_VETERAN_EV, MILESTONE_DYNASTY_EV, MILESTONE_FINAL_PUSH_EV]
    .map((id) => milestoneShowContent(id).title);
  assert.equal(new Set(titles).size, 3, '三個里程碑的全螢幕卡標題必須互異');
});

test('J1① 該不該演：不認得的 id 一律回 null（其他賽前事件不得誤觸發全螢幕卡）', () => {
  for (const id of [
    'pro-wang-rival', 'pro-wang-teammate', 'teach-call', 'old-team-oldschool',
    '', 'pro-milestone-veteranX', // 近似字串也不得誤命中（防子字串誤判）
  ]) {
    assert.equal(milestoneShowContent(id), null, `${JSON.stringify(id)} 不應被判定為里程碑演出`);
  }
});

test('J1① 純函式：多次呼叫同一 id 回傳內容逐值相同（決定論，非隨機生成）', () => {
  const a = milestoneShowContent(MILESTONE_DYNASTY_EV);
  const b = milestoneShowContent(MILESTONE_DYNASTY_EV);
  assert.deepEqual(a, b);
});

// ── J1③ 可跳過，跳過與播畢殊途同歸：showMilestoneShow 本身的點擊收口 ──
// 最小假 DOM（含 getElementById，championBanner 等既有卡片慣例沒有的那一塊，
// 這裡補上才驗得到 ensureStyle 之後的真實建卡路徑，不是靠自我停用繞過）。
function fakeDom() {
  const byId = new Map();
  const make = (tag = 'div') => {
    let _id = '';
    const node = {
      tag, className: '', textContent: '', innerHTML: '', children: [],
      handlers: {},
      get id() { return _id; },
      set id(v) { _id = v; if (v) byId.set(v, node); },
      appendChild(c) { this.children.push(c); c.parent = this; return c; },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); },
      addEventListener(ev, fn) { (this.handlers[ev] ||= []).push(fn); },
      removeEventListener(ev, fn) {
        this.handlers[ev] = (this.handlers[ev] ?? []).filter((f) => f !== fn);
      },
    };
    return node;
  };
  globalThis.document = {
    createElement: (t) => make(t),
    getElementById: (id) => byId.get(id) ?? null,
    body: make('body'),
    head: make('head'),
  };
}

test('J1③ showMilestoneShow：點擊卡片恰呼叫一次 onDismiss，dispose 冪等不重觸發', async () => {
  fakeDom();
  const { showMilestoneShow } = await import('../src/ui/milestoneShow.js');
  let calls = 0;
  const card = showMilestoneShow(
    { icon: '🎖️', title: '老兵之年', sub: '測試' },
    () => { calls += 1; },
  );
  assert.equal(globalThis.document.body.children.includes(card.el), true, '卡片要掛進 body');
  // 模擬點擊：觸發 pointerdown handler
  for (const fn of [...(card.el.handlers.pointerdown ?? [])]) fn({ stopPropagation() {} });
  assert.equal(calls, 1, '點擊要呼叫一次 onDismiss');
  assert.equal(globalThis.document.body.children.includes(card.el), false, '點擊後卡片要從 DOM 移除');
  // 播畢路徑（呼叫端 timeout 到期直接 dispose，不經過 onDismiss）：dispose 冪等
  card.dispose();
  assert.equal(calls, 1, 'dispose() 本身不得觸發 onDismiss（timeout 路徑與點擊路徑各自呼叫一次收口，不重複計數）');
});
