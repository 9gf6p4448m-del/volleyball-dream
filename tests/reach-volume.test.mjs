// Phase 5 §十 階段一：可及體（reach.js）與攔網帶（blockBand.js）的單測。
//
// 這兩個模組是本卷的地基接縫——階段一它們被**實例化在等價值**上（行為與 fa7e3f4
// 逐值相同，由 tools/sim-hash-probe.mjs 證明），階段五才換上真幾何與目標值。
// 本檔釘住兩件事：
//   ① 抽象本身的語意（聯集不是加總、縫怎麼算、三態怎麼分、球半徑吃在哪）
//      ——這些是**行為斷言**，階段五換數值時一條都不該動
//   ② 退化實例化確實逐值重現改制前的四條舊規則
//      ——這些是**數值斷言**，階段五會整組更新（見 phase5-section10-test-triage.md）
import test from 'node:test';
import assert from 'node:assert/strict';
import { TUNING } from '../src/sim/game.js';
import { createPlayer, standingReach, spikeReach } from '../src/sim/player.js';
import { BALL } from '../src/sim/constants.js';
import { reachVolumeFor, ballInReach, REACH_ACTION, SET_CEILING_BONUS } from '../src/sim/reach.js';
import {
  BLOCK_HALF_WIDTH, blockerInterval, buildBand, bandSpan, bandContact,
  overBlockerHands, blockOutcome,
} from '../src/sim/blockBand.js';

const P = createPlayer({ id: 'T1', name: '測', teamId: 'A', height: 1.85 });
const ACTOR = { x: 2, z: -1 };
const volFor = (action, opts = {}) => reachVolumeFor({
  player: P, actor: ACTOR, action, tuning: TUNING, ...opts,
});

// ---------------- reach.js：可及體 ----------------

test('可及體：軸心跟著球員走，水平半徑與垂直帶都是實數（結構完整）', () => {
  const v = volFor(REACH_ACTION.RECEIVE);
  assert.equal(v.cx, ACTOR.x);
  assert.equal(v.cz, ACTOR.z);
  for (const k of ['r', 'yMin', 'yMax']) assert.ok(Number.isFinite(v[k]), `${k} 應為實數`);
  assert.ok(v.yMax > v.yMin, '垂直帶不得倒置');
});

test('可及體：四個動作的垂直頂端各不相同——這正是本卷要收掉的不一致', () => {
  const recv = volFor(REACH_ACTION.RECEIVE).yMax;
  const set = volFor(REACH_ACTION.SET).yMax;
  const setJump = volFor(REACH_ACTION.SET, { jump: true }).yMax;
  const spike = volFor(REACH_ACTION.SPIKE).yMax;
  const dive = volFor(REACH_ACTION.DIVE).yMax;
  // 退化實例化＝逐值重現改制前的四條規則（數值斷言，階段五整組更新）
  assert.equal(recv, standingReach(P) + SET_CEILING_BONUS);
  assert.equal(set, standingReach(P) + SET_CEILING_BONUS);
  assert.equal(spike, spikeReach(P, 1));
  assert.equal(dive, TUNING.DIVE_MAX_Y);
  // §5 A3 跳舉：唯一吃 intent.jump 的地方——可及頂端從站立摸高抬到起跳摸高
  assert.equal(setJump, spikeReach(P, 1));
  assert.ok(setJump > set, '跳舉的可及頂端必須高於站舉');
  assert.ok(dive < recv, '魚躍只救低球');
});

test('可及體：魚躍水平延伸吃 DIVE_REACH_MUL，其餘動作不吃', () => {
  const normal = volFor(REACH_ACTION.RECEIVE).r;
  const dive = volFor(REACH_ACTION.DIVE).r;
  assert.equal(normal, TUNING.REACH_RADIUS);
  assert.equal(dive, TUNING.REACH_RADIUS * TUNING.DIVE_REACH_MUL);
  assert.ok(dive > normal, '魚躍是一次性大延伸');
});

test('可及體：體力折損讓扣球可及頂端下降（W7 累了跳不高，經 jumpMul 進來）', () => {
  const fresh = volFor(REACH_ACTION.SPIKE, { jumpMul: 1 }).yMax;
  const tired = volFor(REACH_ACTION.SPIKE, { jumpMul: 0.8 }).yMax;
  assert.ok(tired < fresh, `疲勞後可及頂端應下降：${tired} vs ${fresh}`);
});

test('地板閘：球心低於球半徑＝球已在地上，不算「構不到」也不算構得到', () => {
  const v = volFor(REACH_ACTION.RECEIVE);
  assert.equal(v.yMin, BALL.RADIUS);
  assert.equal(ballInReach({ x: 2, y: BALL.RADIUS - 1e-9, z: -1 }, v).ok, false);
  assert.equal(ballInReach({ x: 2, y: BALL.RADIUS, z: -1 }, v).ok, true, '邊界含入');
});

test('ballInReach：回傳水平距離供品質計算（走到球正下方＝穩、勉強搆＝飄）', () => {
  const v = volFor(REACH_ACTION.RECEIVE);
  const onPoint = ballInReach({ x: 2, y: 1.5, z: -1 }, v);
  assert.equal(onPoint.dist, 0, '球在正上方＝零到位落差');
  const stretched = ballInReach({ x: 2 + 0.6, y: 1.5, z: -1 + 0.8 }, v);
  assert.ok(Math.abs(stretched.dist - 1.0) < 1e-12, '3-4-5 直角三角形');
  assert.ok(stretched.ok, '1.0m < REACH_RADIUS 應構得到');
});

test('ballInReach：水平出界或高過頂端都算構不到（垂直不再被忽略）', () => {
  const v = volFor(REACH_ACTION.RECEIVE);
  assert.equal(ballInReach({ x: 2 + v.r + 1e-9, y: 1.5, z: -1 }, v).ok, false, '水平超出');
  assert.equal(ballInReach({ x: 2 + v.r, y: 1.5, z: -1 }, v).ok, true, '水平邊界含入');
  assert.equal(ballInReach({ x: 2, y: v.yMax + 1e-9, z: -1 }, v).ok, false, '高過頂端');
  assert.equal(ballInReach({ x: 2, y: v.yMax, z: -1 }, v).ok, true, '頂端邊界含入');
});

test('inflate：可及體整體長大，不是距離變短——球面碰到手就算', () => {
  const plain = volFor(REACH_ACTION.RECEIVE);
  const puffed = volFor(REACH_ACTION.RECEIVE, { inflate: BALL.RADIUS });
  assert.equal(puffed.r, plain.r + BALL.RADIUS, '水平半徑長大');
  assert.equal(puffed.yMax, plain.yMax + BALL.RADIUS, '垂直頂端一起長大');
  assert.equal(puffed.yMin, plain.yMin, '地板閘不受影響');
  // 剛好落在膨脹殼層裡的球：不膨脹構不到、膨脹後構得到
  const shell = { x: 2 + plain.r + BALL.RADIUS / 2, y: 1.5, z: -1 };
  assert.equal(ballInReach(shell, plain).ok, false);
  assert.equal(ballInReach(shell, puffed).ok, true);
  // dist 是**未膨脹**的實際水平距離——品質計算要的是真實到位程度
  assert.equal(ballInReach(shell, puffed).dist, ballInReach(shell, plain).dist);
});

// ---------------- blockBand.js：攔網帶 ----------------

test('陷阱 1：攔網半寬只有一份真相——sim 的 TUNING 與面板判定同源', () => {
  assert.equal(TUNING.BLOCK_REACH_X, BLOCK_HALF_WIDTH,
    'TUNING.BLOCK_REACH_X 與 BLOCK_HALF_WIDTH 分岔＝面板會對玩家說謊');
});

test('區間：一名攔網手涵蓋 x ± 半寬', () => {
  const iv = blockerInterval(1.5, 0.5);
  assert.equal(iv.lo, 1.0);
  assert.equal(iv.hi, 2.0);
});

test('帶＝聯集不是加總：兩人靠在一起，總寬小於兩人寬度相加', () => {
  const band = buildBand([{ id: 'a', x: 0 }, { id: 'b', x: 0.5 }], 0.5);
  // 各自全寬 1.0，加總會是 2.0；聯集實際只有 [−0.5, 1.0] ＝ 1.5
  assert.equal(bandSpan(band), 1.5);
});

test('帶：站得太開就斷開＝留縫，縫不計進總寬（階段三關牆行為的量尺）', () => {
  const closed = buildBand([{ id: 'a', x: 0 }, { id: 'b', x: 0.9 }], 0.5); // 站距 0.9 < 全寬 1.0
  assert.equal(bandSpan(closed), 1.9, '關得起來＝一段連續的帶');
  const gapped = buildBand([{ id: 'a', x: 0 }, { id: 'b', x: 2.0 }], 0.5); // 站距 2.0 > 全寬 1.0
  assert.equal(bandSpan(gapped), 2.0, '斷開＝兩段各 1.0，中間 1.0m 的縫不算涵蓋');
  // 縫寬＝實際站距 − 全寬（憲法 §三.2）
  assert.equal(2.0 - 1.0, 1.0);
});

test('帶：成員順序不影響總寬（聯集與輸入順序無關）', () => {
  const xs = [{ id: 'a', x: 3 }, { id: 'b', x: 0 }, { id: 'c', x: 1.2 }];
  const forward = bandSpan(buildBand(xs, 0.7));
  const backward = bandSpan(buildBand([...xs].reverse(), 0.7));
  assert.equal(forward, backward);
});

test('幾何閘門：球落在任一人涵蓋內＝碰到手；落在縫裡＝穿過去', () => {
  const band = buildBand([{ id: 'a', x: 0 }, { id: 'b', x: 2.0 }], 0.5);
  assert.equal(bandContact(band, 0.3).inside, true, '在 a 的涵蓋內');
  assert.equal(bandContact(band, 1.8).inside, true, '在 b 的涵蓋內');
  assert.equal(bandContact(band, 1.0).inside, false, '正落在縫裡＝穿過去');
  assert.equal(bandContact(buildBand([], 0.5), 0).inside, false, '沒人在窗內＝沒有牆');
});

test('幾何閘門：接觸者＝離球最近者；平手取 id 字典序（決定論）', () => {
  const band = buildBand([{ id: 'z', x: -0.4 }, { id: 'a', x: 0.4 }], 1.1);
  assert.equal(bandContact(band, 0.3).contact.id, 'a', '離 0.3 較近的是 a');
  const tie = buildBand([{ id: 'z', x: -1 }, { id: 'a', x: 1 }], 1.1);
  assert.equal(bandContact(tie, 0).contact.id, 'a', '等距時取字典序小者');
  assert.equal(bandContact(tie, 0).contact.dx, 1);
});

test('幾何閘門：涵蓋邊界含入（dx 恰等於半寬算碰到）', () => {
  const band = buildBand([{ id: 'a', x: 0 }], 1.1);
  assert.equal(bandContact(band, 1.1).inside, true);
  assert.equal(bandContact(band, 1.1 + 1e-9).inside, false);
});

test('多人加成由幾何湧現：牆越寬，能穿過去的落點越少（無任何加成係數）', () => {
  const solo = buildBand([{ id: 'a', x: 0 }], 0.5);
  const pair = buildBand([{ id: 'a', x: 0 }, { id: 'b', x: 0.55 }], 0.5);
  let soloThrough = 0;
  let pairThrough = 0;
  for (let x = -2; x <= 2; x += 0.01) {
    if (!bandContact(solo, x).inside) soloThrough += 1;
    if (!bandContact(pair, x).inside) pairThrough += 1;
  }
  assert.ok(pairThrough < soloThrough,
    `雙人牆應更難穿過（單人可穿 ${soloThrough} 格 vs 雙人 ${pairThrough} 格）`);
  assert.ok(bandSpan(pair) > bandSpan(solo));
});

test('高度閘：頂邊吃球半徑——球面碰到手就算（與觸球判定同一標準）', () => {
  assert.equal(overBlockerHands(2.5, 2.5), false, '球心恰在手高＝碰得到');
  assert.equal(overBlockerHands(2.5 + BALL.RADIUS, 2.5), false, '球面剛好擦到手頂＝碰得到');
  assert.equal(overBlockerHands(2.5 + BALL.RADIUS + 1e-9, 2.5), true, '再高就過去了');
});

test('三態分類：攔死／擦手／乾淨過網依單一 roll 切三段（rand 恆消耗一次）', () => {
  const args = { chance: 0.3, edgeWidth: 0.22 };
  assert.equal(blockOutcome({ roll: 0, ...args }), 'solid');
  assert.equal(blockOutcome({ roll: 0.29, ...args }), 'solid');
  assert.equal(blockOutcome({ roll: 0.3, ...args }), 'graze', '攔死帶上邊界＝進擦手帶');
  assert.equal(blockOutcome({ roll: 0.51, ...args }), 'graze');
  assert.equal(blockOutcome({ roll: 0.52, ...args }), 'clean', '擦手帶上邊界＝乾淨過網');
  assert.equal(blockOutcome({ roll: 0.99, ...args }), 'clean');
});

test('三態分類：邊緣區寬度為 0＝只剩攔死與乾淨過網（擦手可被關掉）', () => {
  const args = { chance: 0.3, edgeWidth: 0 };
  assert.equal(blockOutcome({ roll: 0.29, ...args }), 'solid');
  assert.equal(blockOutcome({ roll: 0.3, ...args }), 'clean');
});

test('屬性語意：block 屬性只搬動攔死／擦手的分界，搬不動「有沒有碰到手」', () => {
  // 有沒有碰到手是第一層幾何的事——blockOutcome 根本拿不到位置資訊，
  // 這條測試靠簽章本身把語意釘住（憲法 §三.1 的核心）
  const weak = blockOutcome({ roll: 0.4, chance: 0.2, edgeWidth: 0.22 });
  const strong = blockOutcome({ roll: 0.4, chance: 0.5, edgeWidth: 0.22 });
  assert.equal(weak, 'graze', '弱攔網手：碰到了，但只擦到');
  assert.equal(strong, 'solid', '強攔網手：同一顆球攔死');
  // 兩者都「碰到了」——屬性沒有把球變成乾淨過網的能力
  assert.ok(weak !== 'clean' && strong !== 'clean');
});
