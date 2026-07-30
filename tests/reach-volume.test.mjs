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
import {
  reachVolumeFor, ballInReach, REACH_ACTION, reachRadiusFor,
  RECEIVE_HANDPOINT_H_RATIO, SET_HANDPOINT_H_RATIO,
} from '../src/sim/reach.js';
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

// ★★ 2026-07-30 基準 A：可及體由退化圓柱遷移為**球體** ★★
// 授權＝手點裁定 v4（取代 v3 手點部分）＋裁定書 v3 §一 白名單補列三項。
// 以下這一組原本描述**圓柱**（`yMax` 天花板／垂直帶），現改寫為描述**球體**（`cy` 手點／單一半徑）。
// **每一條的意圖逐條保留**，只把「垂直帶上緣」換成「球心高度」；並補三條球體專屬斷言。
// 測試數：8 → 11（v4 §四「不應減測」）。

test('可及體：球心跟著球員走（水平），手點高度與半徑都是實數（結構完整）', () => {
  const v = volFor(REACH_ACTION.RECEIVE);
  assert.equal(v.kind, 'sphere', '已遷移為球體');
  assert.equal(v.cx, ACTOR.x);
  assert.equal(v.cz, ACTOR.z, '手點 x/z 維持 actor（v4 §七：x/z 作法不動）');
  for (const k of ['r', 'cy', 'yMin']) assert.ok(Number.isFinite(v[k]), `${k} 應為實數`);
  assert.equal(v.yMax, undefined, '球體沒有天花板欄位——上界由 cy + r 隱含');
});

test('可及體：四個動作的**手點高度**各不相同（語意皆為接觸點，非上界）', () => {
  const recv = volFor(REACH_ACTION.RECEIVE).cy;
  const set = volFor(REACH_ACTION.SET).cy;
  const setJump = volFor(REACH_ACTION.SET, { jump: true }).cy;
  const spike = volFor(REACH_ACTION.SPIKE).cy;
  const dive = volFor(REACH_ACTION.DIVE).cy;
  // 手點裁定 v4 §二 的表，逐列對應（數值斷言，原點一律為地面）
  assert.equal(recv, RECEIVE_HANDPOINT_H_RATIO * P.height.current, '接球＝前臂平台接觸點');
  assert.equal(set, SET_HANDPOINT_H_RATIO * P.height.current, '舉球＝額前上方觸球點');
  assert.equal(spike, spikeReach(P, 1), '扣球＝擊球點（語意本來就是接觸點）');
  assert.equal(dive, TUNING.DIVE_MAX_Y, '魚躍暫沿用（v4 §2.3 標記未驗證，待 n≥30）');
  // §5 A3 跳舉：唯一吃 intent.jump 的地方——手點從額前上方抬到起跳擊球點
  assert.equal(setJump, spikeReach(P, 1));
  assert.ok(setJump > set, '跳舉的手點必須高於站舉');
  assert.ok(recv < set, '接球的平台接觸點低於舉球的額前上方');
  assert.ok(dive > recv, '魚躍手點（低球上限 1.15）高於接球平台——兩者語意不同，見 v4 §2.3');
});

test('可及體：手點高度隨**當前身高**即時變動，不得快取（成長期身高必須生效）', () => {
  // v4 §2.1：身高是時變屬性（height.timeline 的成長曲線），創角時算一次＝成長期失效
  const grown = { ...P, height: { current: P.height.current + 0.10 } };
  const before = volFor(REACH_ACTION.RECEIVE).cy;
  const after = reachVolumeFor({
    player: grown, actor: ACTOR, action: REACH_ACTION.RECEIVE, tuning: TUNING,
  }).cy;
  assert.ok(after > before, `長高 10cm 後接球手點必須跟著上升：${before} → ${after}`);
  // 浮點：0.48×1.95 − 0.48×1.85 與 0.48×0.10 有 ULP 級差異，故用容差不用精確相等
  assert.ok(Math.abs((after - before) - RECEIVE_HANDPOINT_H_RATIO * 0.10) < 1e-12,
    `比例關係成立：Δ手點 ${after - before} vs 0.48×0.10`);
});

test('可及體：魚躍的可及半徑遠大於其餘動作（一次性大延伸），且與 reachRadiusFor 同源', () => {
  const normal = volFor(REACH_ACTION.RECEIVE).r;
  const dive = volFor(REACH_ACTION.DIVE).r;
  // ★ 不再斷言 t=0 的字面式子（`REACH_RADIUS`／`×DIVE_REACH_MUL`）——
  // 基準 B 的收斂進度 `TUNING.CONVERGE_T` 會把兩者都往 §1.3 目標值移動。
  // 改為斷言**結構**：可及體的 r 與 `reachRadiusFor` 逐值同源，且魚躍恆大於一般動作。
  assert.equal(normal, reachRadiusFor(REACH_ACTION.RECEIVE, TUNING, P.height.current),
    '一般動作：vol.r 與 reachRadiusFor 同源（未膨脹時逐值相等）');
  assert.equal(dive, reachRadiusFor(REACH_ACTION.DIVE, TUNING, P.height.current),
    '魚躍：同源');
  assert.ok(dive > normal, '魚躍是一次性大延伸（t 全程成立）');
});

test('可及體：體力折損讓扣球**手點**下降（W7 累了跳不高，經 jumpMul 進來）', () => {
  const fresh = volFor(REACH_ACTION.SPIKE, { jumpMul: 1 }).cy;
  const tired = volFor(REACH_ACTION.SPIKE, { jumpMul: 0.8 }).cy;
  assert.ok(tired < fresh, `疲勞後扣球手點應下降：${tired} vs ${fresh}`);
});

test('地板閘：球心低於球半徑＝球已在地上，不算「構不到」也不算構得到', () => {
  const v = volFor(REACH_ACTION.RECEIVE);
  assert.equal(v.yMin, BALL.RADIUS);
  // 手點在 0.48H，貼地球在球體內（這正是 v4 §2.2 要保住的），故以地板閘擋掉
  assert.equal(ballInReach({ x: 2, y: BALL.RADIUS - 1e-9, z: -1 }, v).ok, false);
  assert.equal(ballInReach({ x: 2, y: BALL.RADIUS, z: -1 }, v).ok, true, '邊界含入');
});

test('ballInReach：回傳**水平**距離供品質計算（本輪不動品質模型）', () => {
  const v = volFor(REACH_ACTION.RECEIVE);
  const onPoint = ballInReach({ x: 2, y: v.cy, z: -1 }, v);
  assert.equal(onPoint.dist, 0, '球在手點正上下方＝零水平落差');
  const stretched = ballInReach({ x: 2 + 0.6, y: v.cy, z: -1 + 0.8 }, v);
  assert.ok(Math.abs(stretched.dist - 1.0) < 1e-12, '3-4-5 直角三角形（水平分量）');
  // ok 斷言不得用絕對公尺——1.0m 會被收斂旋鈕移過半徑（A-9：治具硬編碼會動的量）
  const inside = ballInReach({ x: 2 + v.r * 0.54, y: v.cy, z: -1 + v.r * 0.72 }, v);
  assert.ok(inside.ok, '球與手點同高、水平 0.9r < 半徑 ⇒ 構得到');
});

test('ballInReach：球體是**單一**判定——垂直與水平互相吃（圓柱時代的兩條閘已收掉）', () => {
  const v = volFor(REACH_ACTION.RECEIVE);
  // 同高度：略內側成立、略外側不成立
  // （不踩「恰等於半徑」：`2 + r − 2` 與 `r` 差 1 ULP，踩邊界的測試會隨數值改變而閃爍）
  assert.equal(ballInReach({ x: 2 + v.r * (1 - 1e-9), y: v.cy, z: -1 }, v).ok, true, '水平略內側');
  assert.equal(ballInReach({ x: 2 + v.r * (1 + 1e-9), y: v.cy, z: -1 }, v).ok, false, '水平略外側');
  // ★ 球體的正字標記：水平 0.8r ＋ 垂直 0.8r 的球，圓柱時代兩條閘都過，球體不過
  const diagH = v.r * 0.8;
  const diag = { x: 2 + diagH, y: v.cy + v.r * 0.8, z: -1 };
  assert.ok(Math.hypot(diagH, v.r * 0.8) > v.r, '前提：對角距離確實超過半徑');
  assert.equal(ballInReach(diag, v).ok, false,
    '對角線上的球構不到——這是圓柱→球體最實質的行為差異');
});

test('ballInReach：離手點越高，水平能構的越少（球體的必然推論）', () => {
  const v = volFor(REACH_ACTION.RECEIVE);
  const reachAt = (dy) => {
    // 該垂直落差下仍構得到的最大水平距離（同樣不踩精確邊界，見上一條的理由）
    const max = Math.sqrt(Math.max(0, v.r * v.r - dy * dy));
    assert.equal(ballInReach({ x: 2 + max * (1 - 1e-9), y: v.cy + dy, z: -1 }, v).ok, true);
    assert.equal(ballInReach({ x: 2 + max + 1e-6, y: v.cy + dy, z: -1 }, v).ok, false);
    return max;
  };
  const flat = reachAt(0);
  const high = reachAt(v.r * 0.5);
  assert.ok(high < flat, `垂直落差越大水平越窄：${high} < ${flat}`);
});

test('inflate：可及體整體長大，不是距離變短——球面碰到手就算', () => {
  const plain = volFor(REACH_ACTION.RECEIVE);
  const puffed = volFor(REACH_ACTION.RECEIVE, { inflate: BALL.RADIUS });
  assert.equal(puffed.r, plain.r + BALL.RADIUS, '半徑長大');
  assert.equal(puffed.cy, plain.cy, '★ 手點位置不受膨脹影響——長大的是可及體，不是手移動了');
  assert.equal(puffed.yMin, plain.yMin, '地板閘不受影響');
  // 剛好落在膨脹殼層裡的球：不膨脹構不到、膨脹後構得到
  const shell = { x: 2 + plain.r + BALL.RADIUS / 2, y: plain.cy, z: -1 };
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
