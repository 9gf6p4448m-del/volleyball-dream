// 叫戰術重做卷 段 4 ／ 集訓卷 題 2（Sawmah 2026-08-01 跨卷共用裁定）：**組合獎金**
//
// 「獎勵跟角色走，不跟位置走」——得分者只拿既有的 KILL（不重複賺），
// 本波的**配合者（誘餌）**帶走了牆，組合獎金全額給他。
//
// ★ 幅度是策略數值（CLAUDE.md 硬規則 3）★ 出廠 `COMBO_ASSIST = 0`＝機制上線、
// 數字待 Sawmah 拍板。下面的行為測試**就地覆寫**成非 0 才問得出「機制有沒有接上」，
// 每一條都在 finally 裡還原——不還原的話後面的測試會吃到被改過的常數。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { TRUST_DYN, applyComboAssist } from '../src/sim/trust.js';

const BONUS = 7; // 測試用的可辨識值（不是提案值——提案要看探針基準）

// 就地覆寫幅度跑一段，跑完必還原
function withBonus(v, fn) {
  const prev = TRUST_DYN.COMBO_ASSIST;
  TRUST_DYN.COMBO_ASSIST = v;
  try { return fn(); } finally { TRUST_DYN.COMBO_ASSIST = prev; }
}

// 佈置：一波剛結束、配合者是 A3 且他實際起跳過、得分者是 A2
function rig({ assist = { pid: 'A3', team: 'A' }, team = 'A' } = {}) {
  const g = createGame({ seed: 5 });
  g.rally.comboAssist = assist;
  g.rally.lastTouchTeam = team;
  return g;
}

test('段4 出廠值是 0（幅度未定案前不得有人偷填數字）', () => {
  assert.equal(TRUST_DYN.COMBO_ASSIST, 0,
    '組合獎金幅度是策略數值（硬規則 3），未經 Sawmah 拍板不得為非 0');
});

test('段4：配合者實際起跳＋該波得分 → 拿到組合獎金', () => {
  withBonus(BONUS, () => {
    const g = rig();
    applyComboAssist(g, 'A2', true);
    assert.equal(g.trustDyn.A3, BONUS, '配合者沒拿到獎金＝機制沒接上');
  });
});

test('段4：配合者沒起跳 → 一格不加（不跑＝放棄資格，但也不扣）', () => {
  withBonus(BONUS, () => {
    // 沒起跳＝ai.js 的 applyRouteCommit 根本不會寫 comboAssist
    const g = rig({ assist: null });
    applyComboAssist(g, 'A2', true);
    assert.deepEqual(g.trustDyn, {}, '沒跑的人不該有任何 trustDyn 變動（含負向）');
  });
});

test('段4：該波沒得分 → 一格不加（賞不是罰，也沒有安慰獎）', () => {
  withBonus(BONUS, () => {
    const g = rig();
    applyComboAssist(g, 'A2', false);
    assert.deepEqual(g.trustDyn, {}, '沒得分卻發了獎金');
  });
});

test('段4：沒有組合的普通攻擊 → 一格不加', () => {
  withBonus(BONUS, () => {
    const g = rig({ assist: null });
    applyComboAssist(g, 'A2', true);
    assert.deepEqual(g.trustDyn, {});
  });
});

test('段4：得分者不重複賺——他身兼配合者時也只拿既有那一份', () => {
  withBonus(BONUS, () => {
    const g = rig({ assist: { pid: 'A2', team: 'A' } });
    applyComboAssist(g, 'A2', true);
    assert.deepEqual(g.trustDyn, {},
      '得分者又拿了一次組合獎金＝重複賺（反滾雪球紅線）');
  });
});

test('段4：跨隊殘帳不發（配合者掛在另一隊的帳上）', () => {
  withBonus(BONUS, () => {
    const g = rig({ assist: { pid: 'B3', team: 'B' }, team: 'A' });
    applyComboAssist(g, 'A2', true);
    assert.deepEqual(g.trustDyn, {}, '把獎金發給了對手隊的人');
  });
});

test('段4：獎金走既有的 CLAMP 夾限，不得繞過', () => {
  withBonus(BONUS, () => {
    const g = rig();
    g.trustDyn.A3 = TRUST_DYN.CLAMP; // 已經頂到上限
    applyComboAssist(g, 'A2', true);
    assert.equal(g.trustDyn.A3, TRUST_DYN.CLAMP,
      '組合獎金把 trustDyn 推過了 ±CLAMP＝繞過了唯一寫入路徑的夾限');
  });
});

test('段4：出廠 0 時整支是 no-op（sim-hash 逐值不變的程式面背書）', () => {
  const g = rig();
  applyComboAssist(g, 'A2', true);
  assert.deepEqual(g.trustDyn, {}, 'COMBO_ASSIST 為 0 時仍寫了 trustDyn＝行為不是零改動');
});
