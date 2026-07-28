// Phase 4.6 §5／§9-2 — 典藏牆四槽的顯示語意：空槽不出現、全空＝整張卡不出現
//（顯示哲學沿 W8：不給玩家看空欄）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vaultEntries, createVaultCard } from '../src/ui/replayVault.js';

const tape = { v: 2, snapshot: { players: {} }, ai: {}, steps: [{ p: [] }] };
const slot = (seasonIndex, label, won) => ({
  matchId: 'x', seasonIndex, label, won, opponentId: 'sky-hawk', tape,
});

// 極簡 DOM 替身（本專案 UI 走 inline cssText，不需要真 DOM）
function fakeDom() {
  const make = () => ({
    style: { cssText: '' }, textContent: '', children: [],
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {},
    replaceChildren() { this.children = []; },
  });
  globalThis.document = { createElement: make, body: make() };
}

test('vaultEntries：冠軍點在前、宿敵依屆數，空槽不出現', () => {
  const items = vaultEntries({
    champion: { seasonIndex: 3, tape },
    rival: { 2: slot(2, '準決賽', true), 1: slot(1, '決賽', false) },
  });
  assert.deepEqual(items.map((i) => i.key), ['champion', 'rival-1', 'rival-2']);
  assert.equal(items[1].title, '第 1 屆・決賽');
  assert.equal(items[1].sub, '敗', '勝敗皆錄——敗點是三幕結構的視覺回收');
  assert.equal(items[2].sub, '勝');
});

test('vaultEntries：無資料／不可播的卷一律不出現', () => {
  assert.deepEqual(vaultEntries(undefined), []);
  assert.deepEqual(vaultEntries({ champion: null, rival: {} }), []);
  // 缺快照或零步數＝不可播（舊存檔單筆讀成空牆時的同一道防線）
  assert.deepEqual(vaultEntries({ champion: { seasonIndex: 1, tape: { v: 2, steps: [] } }, rival: {} }), []);
});

test('入口卡：四槽全空＝整張卡不出現（回 null）', () => {
  fakeDom();
  assert.equal(createVaultCard({ champion: null, rival: {} }, () => {}), null);
  const card = createVaultCard({ champion: { seasonIndex: 3, tape }, rival: { 1: slot(1, '決賽', false) } }, () => {});
  assert.ok(card, '有資料就要出現');
  // 標題列＋格子容器＋說明列
  assert.equal(card.children.length, 3);
  assert.equal(card.children[1].children.length, 2, '兩槽有料＝兩格');
});
