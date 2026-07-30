// §十-4 立卷前置量測 —— 扣球彈道「夾限綁定率」與「幾何可行域」探針
//
// 背景（docs/phase5-decisions-RESOLVED.md:266-341）：全 sim 扣球只有一個
// NET_CLEARANCE = NET_HEIGHT + BALL.RADIUS + 0.12（flight.js:41）常數管過網高度，
// 已知 1861 顆扣球過網 p50 2.64-2.65、sd 2.6cm——本探針要證的是「這是不是因為
// 幾乎全部扣球都貼著這個夾限下限」，以及「幾何上還有多少自由度可用」。
//
// 本探針嚴禁改動 src/ 下任何檔案；只 import 既有純函式重算，不碰 sim 決定論基準。
//
// ==== 重建法（不需要碰 game.js 內部 target 變數） ====
// M1 對每一顆扣球重建「若無網口夾限，本來會怎麼飛」：
//   from  = 觸球瞬間球心位置——executeTouch 的 `from`（game.js:516）就是觸球前一刻的
//           ball.{x,y,z}；探針在呼叫 stepGame 前先讀一次 game.ball，即為此值
//   vHit  = 擊球瞬間速度向量——stepGame 同一 tick 內 tryAction 先設定 ball.vx/vy/vz
//           （game.js:566-571），stepRally 才呼叫 stepBall 做 1 次半隱式 Euler 積分
//           （ball.js:14-23：只有 vy += GRAVITY*dt，vx/vz 在碰撞前不變——已讀 ball.js
//           全文確認無阻力/衰減）。探針在 stepGame 回傳後讀 game.ball.vx/vy/vz，
//           反解回擊球瞬間：vHit.vy = post.vy − BALL.GRAVITY×SIM_DT，vx/vz 不變
//   to    = 落點——spikeVelocity 保證球在時間 T 時恰好在 to（to.y=BALL.RADIUS 恆定，
//           game.js:568），故用 flight.js 的 predictLanding 對「複製球體＋vHit」重放
//           （不影響真實 sim），純物理落地點就是 to
//   speed = 重建 game.js:564-565 原公式：spikeSpeed(player)×staminaPerfMul×
//           (TIP_SPEED_MIN+(1-TIP_SPEED_MIN)×timing)；timing 直接讀 TOUCH 事件的
//           e.power（executeTouch 算出的 clamp 後 timing，就是塞進事件的那個值，
//           game.js:608）
//   d     = |to − from|（幾何直線距離，與 T 是否被夾限抬升無關）
//   T_natural = max(d/speed, SPIKE_MIN_TIME)　←　未夾限前的飛行時間
//   v0    = velocityForTime(from, to, T_natural)　←　純函式，未夾限的初速
//   naturalHeight = heightAtNet(from, v0)　←　若不夾限，本來會在幾米過網
//   bound = naturalHeight < NET_CLEARANCE　←　夾限是否真的被觸發（source 判準同款）
//
// 跑法：node tools/t10-4-ballistic-probe.mjs [局數=40]
import { createGame, stepGame, TUNING, spikeSpeed } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { velocityForTime, heightAtNet, predictLanding } from '../src/sim/flight.js';
import { staminaPerfMul } from '../src/sim/stamina.js';
import { BALL, COURT, SIM_DT } from '../src/sim/constants.js';

const SETS = Number(process.argv[2] ?? 40);

// flight.js:41 的原公式（該常數未 export，探針端鏡射同一算法，不得另立數值）
const NET_CLEARANCE = COURT.NET_HEIGHT + BALL.RADIUS + 0.12;
const G = -BALL.GRAVITY; // 正值重力，與 flight.js 內部 G 同一約定

const GROUP = {
  quick: 'quick', left: 'wing', right: 'wing', pipe: 'back', dball: 'back',
};
const GROUP_LABEL = { quick: '快攻', wing: '兩翼', back: '後排攻擊' };

function processSpike(game, e, preFrom, rows, ai) {
  const player = game.players[e.playerId];
  const from = { x: preFrom.x, y: preFrom.y, z: preFrom.z };
  const post = { vx: game.ball.vx, vy: game.ball.vy, vz: game.ball.vz };
  const vHit = { vx: post.vx, vy: post.vy - BALL.GRAVITY * SIM_DT, vz: post.vz };

  const speed = spikeSpeed(player) * staminaPerfMul(game, player)
    * (TUNING.TIP_SPEED_MIN + (1 - TUNING.TIP_SPEED_MIN) * e.power);

  const clone = { x: from.x, y: from.y, z: from.z, vx: vHit.vx, vy: vHit.vy, vz: vHit.vz };
  const landing = predictLanding(clone);
  if (!landing) return; // 900 tick 上限，理論上不會發生

  const to = { x: landing.x, y: BALL.RADIUS, z: landing.z };
  if ((from.z > 0) === (to.z > 0)) return; // 沒跨網（理論上扣球必跨網，防呆）

  const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const Tactual = landing.ticks * SIM_DT;
  const Tnatural = Math.max(d / speed, TUNING.SPIKE_MIN_TIME);

  const v0 = velocityForTime(from, to, Tnatural);
  const naturalHeight = heightAtNet(from, v0);
  const actualHeight = heightAtNet(from, vHit);
  if (naturalHeight == null || actualHeight == null) return;

  rows.push({
    kind: ai.attackKind,
    from, to, speed, d,
    Tactual, Tnatural,
    naturalHeight, actualHeight,
    bound: naturalHeight < NET_CLEARANCE - 1e-6,
    power: e.power,
    tip: e.power <= 0.45, // 沿用 game.js:331 classifySpikeZone 的吊球門檻
  });
}

function runSet(seed, rows) {
  const game = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'set_break' && guard < 400000) {
    guard += 1;
    const preFrom = { x: game.ball.x, y: game.ball.y, z: game.ball.z };
    const intents = aiCollectIntents(game, ai);
    const ev = stepGame(game, intents);
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A') {
        processSpike(game, e, preFrom, rows, ai);
      }
    }
  }
}

const rows = [];
for (let s = 1; s <= SETS; s += 1) runSet(s * 101, rows);

// ---- 統計工具 ----
function pct(arr, p) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN; }
function sd(arr) {
  if (arr.length < 2) return NaN;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}
function fmt(n) { return Number.isFinite(n) ? n.toFixed(3) : '  -  '; }

console.log(`=== §十-4 彈道自由度量測（${SETS} 局，A 隊扣球；NET_CLEARANCE=${NET_CLEARANCE.toFixed(3)}m）===`);
console.log(`總樣本：${rows.length}（tip/吊球另計，quick/wing/back 三組見下）`);

// ---- M1：夾限綁定率 + 自然過網高度分佈 ----
console.log('\n--- M1 夾限綁定率 + 自然過網高度（若不夾限本來會飛多高） ---');
const groups = { quick: [], wing: [], back: [], tip: [] };
for (const r of rows) {
  if (r.tip) { groups.tip.push(r); continue; }
  const g = GROUP[r.kind];
  if (g) groups[g].push(r);
}
console.log('組       n     綁定率%   自然高度min   p50    max    sd     實際高度p50   sd');
for (const key of ['quick', 'wing', 'back', 'tip']) {
  const g = groups[key];
  const label = key === 'tip' ? '輕吊(timing<=0.45)' : GROUP_LABEL[key];
  if (!g.length) { console.log(`${label.padEnd(18)}   0`); continue; }
  const bound = g.filter((r) => r.bound).length;
  const nat = g.map((r) => r.naturalHeight).sort((a, b) => a - b);
  const act = g.map((r) => r.actualHeight);
  console.log(
    `${label.padEnd(18)} ${String(g.length).padStart(4)}   ${((bound / g.length) * 100).toFixed(1).padStart(5)}%   `
    + `${fmt(nat[0])}       ${fmt(pct(nat, 0.5))}  ${fmt(nat[nat.length - 1])}  ${fmt(sd(nat))}   `
    + `${fmt(pct([...act].sort((a, b) => a - b), 0.5))}       ${fmt(sd(act))}`,
  );
}

// ---- M4：常數盤點（先印，M2 要用） ----
console.log('\n--- M4 常數盤點 ---');
console.log(`NET_HEIGHT          = ${COURT.NET_HEIGHT}   （src/sim/constants.js:16）`);
console.log(`BALL.RADIUS         = ${BALL.RADIUS}  （src/sim/constants.js:22）`);
console.log(`BALL.GRAVITY        = ${BALL.GRAVITY}  （src/sim/constants.js:23）`);
console.log(`SPIKE_MIN_TIME      = ${TUNING.SPIKE_MIN_TIME}  （src/sim/game.js:80）`);
console.log(`TIP_SPEED_MIN       = ${TUNING.TIP_SPEED_MIN}  （src/sim/game.js:81）`);
const ATTR_MIN = 30;
const ATTR_MAX = 85; // src/career/recruitment.js:22-23（生涯球員屬性 clamp 範圍，最弱/最強球員的界）
const speedMin = TUNING.SPIKE_SPEED_BASE + ATTR_MIN * TUNING.SPIKE_SPEED_PER;
const speedMax = TUNING.SPIKE_SPEED_BASE + ATTR_MAX * TUNING.SPIKE_SPEED_PER;
console.log(`spikeSpeed(player)  = SPIKE_SPEED_BASE(${TUNING.SPIKE_SPEED_BASE}) + power×SPIKE_SPEED_PER(${TUNING.SPIKE_SPEED_PER})`
  + `  （src/sim/game.js:761-763，常數見 game.js:78-79）`);
console.log(`power 屬性範圍       = [${ATTR_MIN}, ${ATTR_MAX}]  （src/career/recruitment.js:22-23，clampAttr）`);
console.log(`⇒ 滿力(timing=1)扣球速度範圍 ≈ [${speedMin.toFixed(2)}, ${speedMax.toFixed(2)}] m/s（未計 staminaPerfMul/疲勞折損）`);
console.log(`⇒ 含輕吊下限(TIP_SPEED_MIN)的最低速度 ≈ ${(speedMin * TUNING.TIP_SPEED_MIN).toFixed(2)} m/s（最弱球員×輕吊）`);

// ---- M2：幾何可行域 ----
console.log('\n--- M2 幾何可行域（代表性接觸點；掃過網目標高度 2.50→3.20，步長 0.05）---');
console.log('取樣法：各組依 actualHeight 取 p50 索引，該筆的 {from,to} 當代表幾何（見下方座標）');
const SWEEP_MIN = 2.50;
const SWEEP_MAX = 3.20;
const SWEEP_STEP = 0.05;
const maxSpeed = speedMax; // 滿力最強球員、無疲勞折損、timing=1 的理論速度上限

function representative(g) {
  if (!g.length) return null;
  const sorted = [...g].sort((a, b) => a.actualHeight - b.actualHeight);
  return sorted[Math.floor(sorted.length / 2)];
}

for (const key of ['tip', 'quick', 'wing', 'back']) {
  const g = groups[key];
  const rep = representative(g);
  const label = key === 'tip' ? '輕吊' : GROUP_LABEL[key];
  if (!rep) { console.log(`\n-- ${label}：無樣本，跳過 --`); continue; }
  const { from, to } = rep;
  const f = from.z / (from.z - to.z);
  const chordHeight = from.y + f * (to.y - from.y); // T→0 極限＝直線弦高＝此幾何下可達的最低過網高度
  const denom = 0.5 * G * f * (1 - f);
  console.log(`\n-- ${label}（代表樣本：from=(${from.x.toFixed(2)},${from.y.toFixed(2)},${from.z.toFixed(2)}) `
    + `to=(${to.x.toFixed(2)},${to.y.toFixed(2)},${to.z.toFixed(2)})　d=${rep.d.toFixed(2)}m　`
    + `弦高地板(T→0 極限)=${chordHeight.toFixed(3)}m）--`);
  console.log('目標過網高度  幾何可行  所需T(s)  等效速度d/T(m/s)  相對滿力衰減%  速度在可用範圍內  landing界內');
  for (let h = SWEEP_MIN; h <= SWEEP_MAX + 1e-9; h += SWEEP_STEP) {
    const need = h - from.y - f * (to.y - from.y);
    const feasible = need >= 0 && denom > 1e-9;
    if (!feasible) {
      console.log(`  ${h.toFixed(2)}m       否      -         -                 -              -                -`);
      continue;
    }
    const T = Math.sqrt(need / denom);
    const speedEquiv = rep.d / T;
    const decayPct = (1 - speedEquiv / maxSpeed) * 100;
    // 速度可用範圍：不得超過理論最大速度（超過＝物理上沒人打得出這麼平的球）；
    // 低速端不設下限（比 TIP_SPEED_MIN 更慢的球現行遊戲機制不產生，但物理上合法）
    const speedOk = speedEquiv <= maxSpeed;
    const inBounds = Math.abs(to.z) <= COURT.LENGTH / 2 + COURT.FREE_ZONE;
    console.log(`  ${h.toFixed(2)}m       是      ${T.toFixed(3)}     ${speedEquiv.toFixed(2).padStart(6)}            `
      + `${decayPct.toFixed(1).padStart(6)}%        ${speedOk ? '是' : '否（超出可用速度）'}      ${inBounds ? '是' : '否'}`);
  }
}

// ---- M3：同型病查證（原文見腳本內硬編字串，來源 docs/kickoffs/phase5-section10-stage2-v4-discussion-brief.md:251）
console.log('\n--- M3 同型病查證 ---');
console.log('來源檔案實際路徑：docs/kickoffs/phase5-section10-stage2-v4-discussion-brief.md');
console.log('（原始任務指定路徑 docs/stage2-v4-discussion-brief.md 在本 repo 不存在，經 Glob 比對，'
  + '唯一匹配是上面這份帶 kickoffs/phase5-section10- 前綴的檔案；行號 251 對得上）');
console.log('第 246-251 行原文（§5.2 附題一：R4 第 3 款現況已不成立這件事怎麼記帳？）：');
console.log('  > §3.1 顯示款 3 在改動之前就是壞的（read 離開地板 92.1% vs commit 55.9%）。二選一：');
console.log('  > - 記為既有缺陷，由本輪改動一併修好（甲案下款 3 會恢復）——實作端傾向這個');
console.log('  > - 另立一筆進 §十 病表（與十-4 同型：機制存在但方向反了），獨立追蹤');
console.log('注意：這條講的是 R4 款 3（攔網 read/commit 離地率），不是「後排攻擊過網高度」本身。');
console.log('「後排攻擊過網比快攻更低」這句真正的出處是 docs/phase5-decisions-RESOLVED.md:271,300-304：');
console.log('  > 十-4 | 扣球彈道只有單一過網高度…且後排攻擊過網比快攻更低（RESOLVED.md:271）');
console.log('  > 最強的單一證據是那個倒轉：sim 的後排攻擊過網 2.63 m，是三組裡最低。');
console.log('  > 真實排球裡後排攻擊過網最高……幾何上不可能貼網過（RESOLVED.md:300-302）');
if (groups.back.length && groups.quick.length) {
  const backP50 = pct(groups.back.map((r) => r.actualHeight).sort((a, b) => a - b), 0.5);
  const quickP50 = pct(groups.quick.map((r) => r.actualHeight).sort((a, b) => a - b), 0.5);
  const stillReversed = backP50 <= quickP50;
  console.log(`本次實測覆核：後排 actualHeight p50=${backP50.toFixed(3)}m vs 快攻 p50=${quickP50.toFixed(3)}m `
    + `⇒ 方向反轉現在${stillReversed ? '仍然成立' : '已不成立'}（後排${stillReversed ? '≤' : '>'}快攻）`);
} else {
  console.log('本次實測樣本不足（quick 或 back 組為空），無法覆核。');
}
