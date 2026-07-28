// 4.5B §3 招牌演出——武裝/解除/起鏡純函式（主角視角條款：只在 SCORE 起鏡）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  armSignature, trackSignature, signatureFire, planSignatureBeat, sigKey, SIG_FULL_MS,
  lineKillDistance, SIG_LINE_M,
  timingVerdict,
} from '../src/ui/signatureBeats.js';
import { timingQualityMul } from '../src/sim/game.js';
import { SHORT_BEAT_MS } from '../src/ui/presentation.js';

const MY = 'A';

test('主角視角條款：武裝後只有 SCORE 能起鏡；rally 進行中的任何事件都不起鏡', () => {
  let p = armSignature('oh', { focusId: 'B3' });
  // 武裝存續期間，非 SCORE 事件一律不發放（攔網擦手/死球都不解除——那一拍仍在終結中）
  for (const e of [
    { type: 'BLOCK_TOUCH', team: 'B' },
    { type: 'DEAD_BALL', reason: 'floor' },
  ]) {
    p = trackSignature(p, e, MY);
    assert.equal(signatureFire(p, e, MY), null, `${e.type} 不得起鏡`);
  }
  assert.ok(p, '攔網擦手/死球不解除武裝');
  const fired = signatureFire(p, { type: 'SCORE', team: MY }, MY);
  assert.equal(fired.kind, 'oh');
  assert.equal(fired.focusId, 'B3');
});

test('任何後續觸球＝那一拍沒有直接終結＝解除（07-27 追修：不相干得分不得冒領演出）', () => {
  // 對手救起
  let p = trackSignature(armSignature('mb', { focusId: 'B2' }),
    { type: 'TOUCH', team: 'B', kind: 'receive' }, MY);
  assert.equal(p, null, '對手把球救起＝解除');
  // 我方後續觸球（攔到彈回我方、重新組織）——同樣解除：之後的得分不屬於這一拍
  p = trackSignature(armSignature('mb', { focusId: 'B2' }),
    { type: 'TOUCH', team: MY, kind: 'receive' }, MY);
  assert.equal(p, null, '我方接續處理＝成因那一拍未終結＝解除');
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

test('seenSignature 鍵：四道演出各自獨立計數', () => {
  const keys = ['oh', 'mb', 'opp', 'line'].map(sigKey);
  assert.equal(new Set(keys).size, 4);
  for (const k of keys) assert.match(k, /^sig-/);
});

test('「邊線是我的」（07-28 A 案）：離線距離／出界 null／門檻與武裝透傳', () => {
  // 場地 9×18（半場 x±4.5、z±9）：貼邊線/貼底線/場中央/出界
  assert.ok(Math.abs(lineKillDistance({ x: 4.4, z: -5 }) - 0.1) < 1e-9, '貼邊線');
  assert.ok(Math.abs(lineKillDistance({ x: 0, z: -8.9 }) - 0.1) < 1e-9, '貼底線');
  assert.ok(lineKillDistance({ x: 0, z: -5 }) > 3, '場中央離線遠');
  assert.equal(lineKillDistance({ x: 4.6, z: -5 }), null, '出界＝null（咬線只認 BALL_IN）');
  assert.equal(lineKillDistance(null), null);
  assert.ok(SIG_LINE_M > 0 && SIG_LINE_M <= 0.5, '門檻在 probe 量測帶內');
  // 武裝透傳 at 座標（鏡頭取景用）＋計畫時長就位
  const p = armSignature('line', { at: { x: 4.4, z: -5 } });
  assert.deepEqual(p.at, { x: 4.4, z: -5 });
  const plan = planSignatureBeat({ kind: 'line', pref: 'on', seen: false, keyPoint: false, now: 0 });
  assert.equal(plan.until, SIG_FULL_MS.line);
  // 咬線武裝同樣走「任何後續觸球即解除」（冒領防護一體適用）
  assert.equal(trackSignature(p, { type: 'TOUCH', team: 'A' }, 'A'), null);
});

// 4.6 §7 準度可讀性：時機三檔與 sim 的 timingQualityMul 同門檻（顯示真值不是安慰話）
test('timingVerdict：甜蜜區/早了/放太晚，與 sim 散佈乘數同一組門檻', () => {
  const T = { SWEET_LO: 0.7, SWEET_HI: 1.05 };
  assert.equal(timingVerdict(0.5, T), 'early');
  assert.equal(timingVerdict(0.7, T), 'sweet');
  assert.equal(timingVerdict(1.05, T), 'sweet');
  assert.equal(timingVerdict(1.3, T), 'late', '超蓄＝放太晚（TOUCH.power 夾到 0.85 分不出來）');
  assert.equal(timingVerdict(null, T), null);
  // 與 sim 實作對齊：甜蜜區＝散佈乘數優於 1
  assert.ok(timingQualityMul(0.9) < 1);
  assert.equal(timingQualityMul(0.5), 1);
  assert.ok(timingQualityMul(1.3) > 1);
});
