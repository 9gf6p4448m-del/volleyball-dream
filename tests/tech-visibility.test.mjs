// 教學可見性批（2026-08-27）：壓手／二段變向專屬字卡＋改叫結算字卡分流。
// 拍板紀錄在 callPlay.js CALL_MODES 的 08-27 註記；howToPlay 的五招新句由既有
// how-to-play.test.mjs 的渲染與文案守衛自動涵蓋，本檔只驗字卡層。
import test from 'node:test';
import assert from 'node:assert/strict';
import { heroCardFor } from '../src/ui/heroCards.js';
import { callFeedbackOf } from '../src/input/callPlay.js';

const ctx = { controlledId: 'A3', playerName: '小夢' };

test('壓手賭贏有專屬卡：BLOCK_TOUCH pressed → ✋卡，且不喊得分', () => {
  const card = heroCardFor(
    { type: 'BLOCK_TOUCH', playerId: 'A3', zone: 'top', pressed: true }, ctx,
  );
  assert.ok(card, '★紅法＝改動前★ pressed 事件沒有專屬卡，賭贏與普通攔死分不出來');
  assert.ok(card.text.includes('壓手'), `字卡看不出是壓手：${card.text}`);
  assert.ok(!card.text.includes('得分'), '球回攻方半場仍是活球，文案不得喊得分');
});

test('反向對照：沒 pressed 的 BLOCK_TOUCH 兩張既有卡逐字不變', () => {
  assert.equal(heroCardFor({ type: 'BLOCK_TOUCH', playerId: 'A3' }, ctx).text,
    '🧱 攔網拍回！');
  assert.equal(heroCardFor({ type: 'BLOCK_TOUCH', playerId: 'A3', graze: true }, ctx).text,
    '👆 擦到了——快補！');
});

test('二段變向有專屬卡：TOUCH spike retarget → 卡；無 retarget 不出卡', () => {
  const card = heroCardFor(
    { type: 'TOUCH', kind: 'spike', retarget: true, playerId: 'A3' }, ctx,
  );
  assert.ok(card, '★紅法＝改動前★ retarget 旗標（game.js:913）沒人消費，變向成不成看不見');
  assert.ok(card.text.includes('二段變向'), card.text);
  assert.equal(heroCardFor({ type: 'TOUCH', kind: 'spike', playerId: 'A3' }, ctx), null,
    '普通扣球不得出這張卡');
});

test('別人的事件不出卡（controlledId 過濾照舊）', () => {
  assert.equal(heroCardFor({ type: 'BLOCK_TOUCH', playerId: 'B1', pressed: true }, ctx), null);
  assert.equal(
    heroCardFor({ type: 'TOUCH', kind: 'spike', retarget: true, playerId: 'B1' }, ctx), null,
  );
});

test('改叫結算字卡：opts.audible → 「📢改叫・」開頭，成功/失敗共用同一條路', () => {
  const out = { type: 'cross', mode: 'command', outcome: 'command', flightId: 7 };
  const ok = callFeedbackOf(out, null, { audible: true });
  assert.ok(ok.text.startsWith('📢改叫・'), `★紅法＝改動前★ 按📢得到⚡：${ok.text}`);
  const fail = callFeedbackOf(
    { ...out, outcome: 'infeasible', reason: 'tier' }, null, { audible: true },
  );
  assert.ok(fail.text.startsWith('📢改叫・'), `失敗卡也要掛📢：${fail.text}`);
});

test('反向對照：S 路徑（無 opts）逐字維持「⚡指令・」', () => {
  const out = { type: 'cross', mode: 'command', outcome: 'command', flightId: 7 };
  assert.equal(callFeedbackOf(out).text, '⚡指令・交叉攻擊——照跑！');
  assert.equal(callFeedbackOf(out, null, null).text, '⚡指令・交叉攻擊——照跑！');
});
