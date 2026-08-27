// 4.5B §3 招牌演出——武裝/解除/起鏡純函式（主角視角條款：只在 SCORE 起鏡）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  armSignature, trackSignature, signatureFire, planSignatureBeat, sigKey, SIG_FULL_MS,
  lineKillDistance, SIG_LINE_M,
  timingVerdict, netDuelQualify, netDuelFire,
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

// ---- 網口對決（第五道簽名演出，2026-08-27 開卷批1，acceptance-netduel-batch1.md）----
// ND-6 突變實測紀錄（真的做過，2026-08-27）：
//   ①在 trackSignature 註解掉 `if (e.type === 'TOUCH') return null;` 後單跑本檔，
//     下面「球被救起＝解除」那個 netduel 斷言由綠轉紅（p 不再是 null）；還原後轉綠。
//   ②把 netDuelQualify 改成不論 reason 一律 `return { ...pending, outcome: 'tool',
//     winner: otherTeam(pending.blockerTeam) };`（略過 reason 分岔）後單跑本檔，
//     下面「其餘 reason 一律解除」那個斷言由綠轉紅（FOUR_HITS 等也冒充 tool）；
//     還原後轉綠。兩次都只改對應那一行，其餘程式碼不動。

test('武裝：BLOCK_TOUCH 記攔網方 team/playerId（focusId=攔網者、spikerId=扣球者透傳）', () => {
  const p = armSignature('netduel', { focusId: 'B2', spikerId: 'A4', blockerTeam: 'B' });
  assert.equal(p.kind, 'netduel');
  assert.equal(p.focusId, 'B2');
  assert.equal(p.spikerId, 'A4');
  assert.equal(p.blockerTeam, 'B');
});

test('網口對決：武裝後球被救起（TOUCH）或新發球（SERVE）＝解除（主角視角條款同款，沿用泛用 trackSignature）', () => {
  const armed = () => armSignature('netduel', { blockerTeam: 'B' });
  assert.equal(trackSignature(armed(), { type: 'TOUCH', team: 'A', kind: 'receive' }, 'A'), null, '對手救起＝解除');
  assert.equal(trackSignature(armed(), { type: 'TOUCH', team: 'B', kind: 'receive' }, 'A'), null, '任何隊伍接續觸球都算成因未直接終結');
  assert.equal(trackSignature(armed(), { type: 'SERVE', team: 'A' }, 'A'), null, '發球＝操作開始＝解除');
  // 死球本身不解除（那一拍仍在終結中，解除與否要等 netDuelQualify 定性）
  const p = trackSignature(armed(), { type: 'DEAD_BALL', reason: 'OUT' }, 'A');
  assert.ok(p, 'DEAD_BALL 不經 trackSignature 解除——定性另有 netDuelQualify');
});

test('netDuelQualify：reason=OUT＝打手出界，攻方（攔網方的對手）得分', () => {
  const p = armSignature('netduel', { blockerTeam: 'B' });
  const q = netDuelQualify(p, { type: 'DEAD_BALL', reason: 'OUT' });
  assert.equal(q.outcome, 'tool');
  assert.equal(q.winner, 'A', '攔網方=B ⇒ 出界失分的是 B ⇒ 贏家是攻方 A');
});

test('netDuelQualify：reason=BALL_IN 且落點在攻方半場＝攔網蓋死，攔網方得分', () => {
  const p = armSignature('netduel', { blockerTeam: 'B' });
  // 攻方=A 佔 z>=0（見 rotation.js landedCourtTeam）：球蓋落在攻方半場
  const q = netDuelQualify(p, { type: 'DEAD_BALL', reason: 'BALL_IN', at: { x: 0, z: 5 } });
  assert.equal(q.outcome, 'stuff');
  assert.equal(q.winner, 'B', '攔網方=B 蓋死攻方=A ⇒ 贏家是攔網方 B');
});

test('netDuelQualify：其餘 reason／落點不在攻方半場的 BALL_IN 一律解除，不冒充 tool/stuff', () => {
  const p = armSignature('netduel', { blockerTeam: 'B' });
  assert.equal(netDuelQualify(p, { type: 'DEAD_BALL', reason: 'FOUR_HITS' }), null);
  assert.equal(netDuelQualify(p, { type: 'DEAD_BALL', reason: 'BACK_ROW_ATTACK' }), null);
  assert.equal(netDuelQualify(p, { type: 'DEAD_BALL', reason: 'POSITIONAL_FAULT' }), null);
  // BALL_IN 但落在攔網方自己半場（z<0＝B 半場）＝不是「攔網蓋死攻方」那個故事
  assert.equal(netDuelQualify(p, { type: 'DEAD_BALL', reason: 'BALL_IN', at: { x: 0, z: -5 } }), null);
  // 非 DEAD_BALL／非本道演出的 pending 透傳不動
  assert.equal(netDuelQualify(null, { type: 'DEAD_BALL', reason: 'OUT' }), null);
  assert.deepEqual(netDuelQualify(p, { type: 'TOUCH', team: 'A' }), p, '非 DEAD_BALL 事件不定性，原樣透傳');
});

test('netDuelFire：只認 SCORE，且 team 須等於 qualify 定出的 winner（未定性/team 不符一律不發放）', () => {
  const toolWin = { kind: 'netduel', outcome: 'tool', winner: 'A' };
  assert.equal(netDuelFire(toolWin, { type: 'SCORE', team: 'A' }), toolWin);
  assert.equal(netDuelFire(toolWin, { type: 'SCORE', team: 'B' }), null);
  assert.equal(netDuelFire(toolWin, { type: 'DEAD_BALL', reason: 'OUT' }), null, '非 SCORE 不發放');
  assert.equal(netDuelFire({ kind: 'netduel' }, { type: 'SCORE', team: 'A' }), null, '未經 qualify（無 outcome）不發放');
  assert.equal(netDuelFire(null, { type: 'SCORE', team: 'A' }), null);
});

test('planSignatureBeat：netduel 對面得手（mine=false）恆短版，不受 seen/關鍵分放大（甲播放方拍板 1）', () => {
  const base = { kind: 'netduel', pref: 'on', now: 1000, mine: false };
  assert.equal(planSignatureBeat({ ...base, seen: false, keyPoint: false }).mode, 'short');
  assert.equal(planSignatureBeat({ ...base, seen: false, keyPoint: true }).mode, 'short', '對面得手就算逢關鍵分也不給全版');
  assert.equal(planSignatureBeat({ ...base, pref: 'off' }), null, '演出全關時對面得手也不放');
});

test('planSignatureBeat：netduel 我方得手（mine 預設 true）＝走既有頻率經濟（首次全版/之後短版/關鍵分恆全版）', () => {
  const base = { kind: 'netduel', pref: 'on', now: 1000 };
  const first = planSignatureBeat({ ...base, seen: false, keyPoint: false });
  assert.equal(first.mode, 'full');
  assert.equal(first.dur, SIG_FULL_MS.netduel);
  assert.equal(first.until, 1000 + SIG_FULL_MS.netduel);
  assert.equal(planSignatureBeat({ ...base, seen: true, keyPoint: false }).mode, 'short');
  assert.equal(planSignatureBeat({ ...base, seen: true, keyPoint: true }).mode, 'full', '關鍵分恆全版');
  assert.ok(SIG_FULL_MS.netduel > SHORT_BEAT_MS, 'netduel 全版長於短版');
});

test('sigKey：netduel 自成一鍵，與既有四道不衝突', () => {
  const keys = ['oh', 'mb', 'opp', 'line', 'netduel'].map(sigKey);
  assert.equal(new Set(keys).size, 5);
  assert.equal(sigKey('netduel'), 'sig-netduel');
});
