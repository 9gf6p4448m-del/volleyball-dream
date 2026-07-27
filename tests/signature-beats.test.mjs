// 4.5B §3 招牌演出——武裝/解除/起鏡純函式（主角視角條款：只在 SCORE 起鏡）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  armSignature, trackSignature, signatureFire, planSignatureBeat, sigKey, SIG_FULL_MS,
} from '../src/ui/signatureBeats.js';
import { SHORT_BEAT_MS } from '../src/ui/presentation.js';

const MY = 'A';

test('主角視角條款：武裝後只有 SCORE 能起鏡；rally 進行中的任何事件都不起鏡', () => {
  let p = armSignature('oh', { focusId: 'B3' });
  // 武裝存續期間，非 SCORE 事件一律不發放
  for (const e of [
    { type: 'TOUCH', team: MY, kind: 'set' },
    { type: 'BLOCK_TOUCH', team: 'B' },
    { type: 'DEAD_BALL', reason: 'floor' },
  ]) {
    p = trackSignature(p, e, MY);
    assert.equal(signatureFire(p, e, MY), null, `${e.type} 不得起鏡`);
  }
  assert.ok(p, '我方觸球/死球不解除武裝');
  const fired = signatureFire(p, { type: 'SCORE', team: MY }, MY);
  assert.equal(fired.kind, 'oh');
  assert.equal(fired.focusId, 'B3');
});

test('對手救起＝勝負未定＝解除；對手得分＝空手', () => {
  let p = armSignature('mb', { focusId: 'B2' });
  p = trackSignature(p, { type: 'TOUCH', team: 'B', kind: 'receive' }, MY);
  assert.equal(p, null, '對手把球救起＝解除');
  const q = armSignature('opp', {});
  assert.equal(signatureFire(q, { type: 'SCORE', team: 'B' }, MY), null, '對方得分＝不起鏡');
});

test('SERVE＝操作開始＝解除（發球前武裝必清）', () => {
  const p = trackSignature(armSignature('oh', { focusId: 'B1' }), { type: 'SERVE', team: MY }, MY);
  assert.equal(p, null);
});

test('節拍計畫：off＝null；首次/關鍵分＝全版；已看過＝短版 ≤1.5s；全版時長各就位', () => {
  const base = { kind: 'oh', pref: 'on', seen: false, keyPoint: false, now: 1000 };
  assert.equal(planSignatureBeat({ ...base, pref: 'off', keyPoint: true }), null);
  const first = planSignatureBeat(base);
  assert.equal(first.mode, 'full');
  assert.equal(first.until, 1000 + SIG_FULL_MS.oh);
  const rerun = planSignatureBeat({ ...base, seen: true });
  assert.equal(rerun.mode, 'short');
  assert.ok(rerun.dur <= 1500);
  assert.equal(rerun.dur, SHORT_BEAT_MS);
  const clutch = planSignatureBeat({ ...base, seen: true, keyPoint: true });
  assert.equal(clutch.mode, 'full', '關鍵分恆全版（看過也全版）');
  for (const kind of ['oh', 'mb', 'opp']) {
    assert.ok(SIG_FULL_MS[kind] > SHORT_BEAT_MS, `${kind} 全版長於短版`);
  }
});

test('seenSignature 鍵：三道演出各自獨立計數', () => {
  const keys = ['oh', 'mb', 'opp'].map(sigKey);
  assert.equal(new Set(keys).size, 3);
  for (const k of keys) assert.match(k, /^sig-/);
});
