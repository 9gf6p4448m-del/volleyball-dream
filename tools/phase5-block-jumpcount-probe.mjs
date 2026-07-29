// Phase 5 §十 階段二 v2 —— **單次攻擊內起跳次數分佈**探針（裁定書 §一.7）
//
// ★ 為什麼要這支（這一項阻塞一切）★
// v2 裁定書 §一.7 指出兩份既有量測互相矛盾：
//   §三 時序表（`phase5-block-timing-probe.mjs`）說 read 面對兩翼在 `set+14` 起跳；
//   §二 E 表（`phase5-block-geometry-probe.mjs`）說球在 `set+88` 過網那一刻，
//   該攔網手的頂邊完成度是 94.6%（地板＝站立摸高÷頂點＝80.4%，不是 0%）。
// 若只跳一次、窗長 AIR_TICKS=24，`set+14` 起跳者在 `set+38` 就該回到站立
//   ⇒ `set+88` 的完成度應**恰為地板**。實測遠高於地板 ⇒ 他當時在空中。
// 只有兩種可能：
//   (a) 一次攻擊裡**反覆起跳**，E 表量到的是最後一次   ⇒ 第五個超人能力，題 1 全部重談
//   (b) 兩支探針對「起跳」的**定義不一致**              ⇒ 時序表不得用於推論，題 1 照常
//
// ★ 判準：本探針在同一次執行裡同時量兩種定義，讓 (a)/(b) 機械可判 ★
//   定義 A「窗開著」＝ `actor.blockUntil >= tick`（時序表 `winOpen` 用的就是這個）
//     ——注意它**不要求是新窗**：上一波留下的舊窗只要還沒過期，這個條件當下就成立。
//   定義 B「新窗開啟」＝ `actor.blockStartTick` 換值（game.js:436-439，一新窗＝一跳，
//     體力也在此扣 `COST_JUMP_BLOCK`）——E 表的頂邊相位 `t` 是從這個值起算的。
//
//   ⇒ jumps（定義 B 的計數）p50 ≥ 2  ⇒ **(a)**
//   ⇒ jumps p50 ≤ 1                  ⇒ **(b)**（差異另有來源，見下）
//
// ★ 2026-07-29 實測結論：**(b)**，且來源比裁定書設想的更單純 ★
// 三個 build 各跑本探針（12 局／臂，main 總樣本 800）：
//
//   build                起跳(定義B) p50   球過網 p50   過網時滯空   頂邊完成度 p50   起跳次數
//   main       @72bcb53      set+81        set+88          7            100.0%        p50=1 max=1
//   2-A  feat/…stage2        set+15        set+88         74            100.0%        p50=1 max=1
//   2-B  feat/…stage2b       set+81        set+88          7           **94.6%**      p50=1 max=1
//
// ⇒ 三個 build **沒有任何一個**出現一次攻擊內起跳 ≥2 次（0/800、0/261、0/294）。
// ⇒ 兩支探針在**同一個 build 上量出來的起跳時點是一致的**（main 上都是 set+82）。
// ⇒ 真正的成因：裁定書 §一.7 交叉的兩份數據**來自不同分支**——
//    §三 時序表的 `set+14` 是 **2-A**（拆掉起跳閘門後，攔網窗自 set+15 起被逐 tick 續期
//    到 74 tick，故該 build 的「起跳很早」是真的）；
//    §二 E 表的 `94.6%` 是 **2-B**（未含 2-A 的拆閘，起跳仍在 set+81）。
//    在各自的 build 內兩者都自洽，矛盾只存在於把兩個 build 的數字放在同一張表上比。
// ⇒ 因此**沒有第五個超人能力**，裁定書題 1 照常執行。
//
// ★ 量測窗 ★
//   一次攻擊 ＝ A 隊二傳觸球（TOUCH/set/team A/touches 2）→ DEAD_BALL。
//   `jumpsToCross` 只數到球過網那一 tick（＝ E 表的取樣時點），
//   `jumpsToDead` 數到死球（含攔網後的二次起跳），兩個都報。
//
// 跑法：node tools/phase5-block-jumpcount-probe.mjs [局數=12]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { blockReach, blockTopEdge } from '../src/sim/player.js';
import { staminaPerfMul } from '../src/sim/stamina.js';
import { AIR_TICKS } from '../src/sim/approach.js';

const SETS = Number(process.argv[2] ?? 12);
const GROUP = {
  quick: 'quick', left: 'wing', right: 'wing', pipe: 'back', dball: 'back',
};

function mbOf(game, team) {
  const rot = game.match.rotations[team];
  return rot.find((id) => isFrontRow(rot, id) && game.players[id].currentRole === 'middle') ?? null;
}

function runSet(seed, blockPersona) {
  const game = createGame({ seed, setTarget: 25, aiProfiles: { B: { blockPersona } } });
  const ai = createAiState();
  const rows = [];
  let cur = null;
  let guard = 0;
  // 'set_over' ＝ 單局結束（game.js:1103）。發球局數用 guard 兜底，與既有探針同範式。
  while (game.phase !== 'set_over' && guard < 400000) {
    guard += 1;
    const zBefore = game.ball.z;
    const ev = stepGame(game, aiCollectIntents(game, ai, []));

    for (const e of ev) {
      if (e.type === 'TOUCH' && e.kind === 'set' && e.team === 'A' && e.touches === 2) {
        const mb = mbOf(game, 'B');
        cur = mb ? {
          mb,
          setTick: game.tick,
          kind: null,
          // 定義 B：起跳＝新窗開啟。開窗那一刻的 blockStartTick 就是本次攻擊起算的基準
          prevStart: game.actors[mb].blockStartTick,
          jumpTicks: [],          // 每次新窗開啟的 tick（定義 B）
          crossTick: null,
          jumpsToCross: null,
          // 定義 A：窗開著（時序表 winOpen 的定義）
          winOpenLag: null,
          winOpenStale: null,     // 該 tick 的窗是不是本次攻擊之前就開著的舊窗
          airAtCross: null,
          topPctAtCross: null,
        } : null;
      }
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A' && cur && cur.kind == null) {
        cur.kind = ai.attackKind;
      }
      if (e.type === 'DEAD_BALL' && cur) {
        if (cur.kind && cur.crossTick != null) {
          rows.push({
            kind: cur.kind,
            jumpsToCross: cur.jumpsToCross,
            jumpsToDead: cur.jumpTicks.length,
            firstJumpLag: cur.jumpTicks.length ? cur.jumpTicks[0] - cur.setTick : null,
            lastJumpLagToCross: cur.jumpsToCross
              ? cur.jumpTicks[cur.jumpsToCross - 1] - cur.setTick : null,
            winOpenLag: cur.winOpenLag,
            winOpenStale: cur.winOpenStale,
            crossLag: cur.crossTick - cur.setTick,
            airAtCross: cur.airAtCross,
            topPctAtCross: cur.topPctAtCross,
          });
        }
        cur = null;
      }
    }

    if (!cur) continue;
    const a = game.actors[cur.mb];

    // 定義 B：blockStartTick 換值 ＝ 開了一個新窗 ＝ 起跳一次
    if (a.blockStartTick !== cur.prevStart) {
      cur.jumpTicks.push(a.blockStartTick);
      cur.prevStart = a.blockStartTick;
    }
    // 定義 A：本次攻擊開始後，第一個「窗開著」的 tick
    if (cur.winOpenLag == null && a.blockUntil >= game.tick) {
      cur.winOpenLag = game.tick - cur.setTick;
      cur.winOpenStale = a.blockStartTick < cur.setTick;
    }
    // 球過網那一 tick（z 由正轉負）＝ E 表取樣時點
    if (cur.crossTick == null && zBefore > 0 && game.ball.z <= 0) {
      cur.crossTick = game.tick;
      cur.jumpsToCross = cur.jumpTicks.length;
      const p = game.players[cur.mb];
      const jumpMul = staminaPerfMul(game, p);
      const inWin = a.blockUntil >= game.tick;
      const t = inWin ? game.tick - a.blockStartTick : null;
      cur.airAtCross = t;
      const apex = blockReach(p, jumpMul);
      cur.topPctAtCross = apex > 0 ? blockTopEdge(p, t, jumpMul) / apex : null;
    }
  }
  return rows;
}

function arm(persona) {
  const rows = [];
  for (let s = 1; s <= SETS; s += 1) rows.push(...runSet(s * 101, persona));
  return rows;
}

const pctl = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const col = (g, key) => g.map((r) => r[key]).filter((v) => v != null);
const share = (n, d) => (d ? ((n / d) * 100).toFixed(1) : '-');

const arms = { read: arm('read'), commit: arm('commit') };

console.log(`=== §一.7 單次攻擊內起跳次數分佈（${SETS} 局／臂）===`);
console.log(`AIR_TICKS = ${AIR_TICKS}（跳躍相位窗長）`);
console.log('定義 A「窗開著」＝ blockUntil >= tick（時序表 winOpen）｜'
  + '定義 B「新窗開啟」＝ blockStartTick 換值（E 表相位起算點）');

for (const group of ['quick', 'wing', 'back']) {
  const label = { quick: '快攻（一速中路）', wing: '兩翼高球', back: '後排攻擊' }[group];
  console.log(`\n-- 面對 ${label} --`);
  for (const persona of ['read', 'commit']) {
    const g = arms[persona].filter((r) => GROUP[r.kind] === group);
    if (!g.length) { console.log(`${persona.padEnd(7)} 無樣本`); continue; }
    const jc = col(g, 'jumpsToCross');
    const jd = col(g, 'jumpsToDead');
    const hist = {};
    for (const v of jc) hist[v] = (hist[v] ?? 0) + 1;
    const histStr = Object.keys(hist).sort((a, b) => a - b)
      .map((k) => `${k}次:${share(hist[k], jc.length)}%`).join('  ');
    const wo = col(g, 'winOpenLag');
    const staleN = g.filter((r) => r.winOpenStale === true).length;
    const woN = g.filter((r) => r.winOpenStale != null).length;
    console.log(`${persona.padEnd(7)} n=${String(g.length).padStart(4)}`
      + `  過網前起跳次數 p50=${pctl(jc, 0.5)} p90=${pctl(jc, 0.9)} max=${Math.max(...jc)}`
      + `  ｜到死球 p50=${pctl(jd, 0.5)} max=${Math.max(...jd)}`);
    console.log(`        分佈（過網前）：${histStr}`);
    console.log(`        定義A winOpen 落點 p50=set+${pctl(wo, 0.5)}`
      + `  其中「量到的是舊窗」＝${share(staleN, woN)}%  (${staleN}/${woN})`);
    console.log(`        定義B 第一次新窗 p50=set+${pctl(col(g, 'firstJumpLag'), 0.5)}`
      + `  ｜過網前最後一次新窗 p50=set+${pctl(col(g, 'lastJumpLagToCross'), 0.5)}`
      + `  ｜球過網 p50=set+${pctl(col(g, 'crossLag'), 0.5)}`);
    const air = col(g, 'airAtCross');
    const top = col(g, 'topPctAtCross');
    console.log(`        過網時滯空 p50=${air.length ? pctl(air, 0.5) : '－'}`
      + `  ｜頂邊完成度 p50=${top.length ? (pctl(top, 0.5) * 100).toFixed(1) : '－'}%`
      + `  ｜過網時窗沒開＝${share(g.length - air.length, g.length)}%`);
  }
}

// ── 結論（機械判定，不由人解讀）──────────────────────────────
const all = [...arms.read, ...arms.commit];
const allJc = col(all, 'jumpsToCross');
const multi = allJc.filter((v) => v >= 2).length;
const staleAll = all.filter((r) => r.winOpenStale === true).length;
const woAll = all.filter((r) => r.winOpenStale != null).length;
console.log(`\n=== 機械判定（總樣本 ${all.length}）===`);
console.log(`過網前起跳 ≥2 次的攻擊：${share(multi, allJc.length)}%  (${multi}/${allJc.length})`
  + `　起跳次數 p50=${pctl(allJc, 0.5)}`);
console.log(`定義A winOpen 量到舊窗的比例：${share(staleAll, woAll)}%  (${staleAll}/${woAll})`);
console.log(`\n判定 ⇒ ${pctl(allJc, 0.5) >= 2
  ? '(a) 一次攻擊內反覆起跳 —— 停下回報，題 1 全部重談'
  : '(b) 非「反覆起跳」—— 時序表不得用於推論，題 1 照常執行'
    + '\n       （本 build 的兩支探針起跳時點一致；跨 build 差異見檔頭實測結論表）'}`);
