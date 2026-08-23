// retract（縮手）價值探針 —— 大學卷批 7 前置調查
//
// ★ 目的 ★
// 決定「retract 這一檔攔網手要不要做」。全部走真實 sim 路徑
// （createGame / stepGame / aiCollectIntents，仿 tools/sim-hash-probe.mjs 的跑法），
// 不重寫任何攔網結算邏輯——本檔零判定邏輯抄寫，只讀 stepGame 吐出的事件流；
// 「這名攔網者退了、別人補不補得上」也不是重算幾何帶，是用 structuredClone 複製
// 當下 game/ai 狀態、把同一顆球在真實 tryBlock 上重跑一次（見下方「單人覆蓋檢查」）。
//
// ★ 怎麼跑 ★
//   node tools/retract-value-probe.mjs                 # 預設每隊 25 局（七隊 175 局）
//   node tools/retract-value-probe.mjs --matches 40     # 每隊場數
//   VD_SEED_BASE=99 node tools/retract-value-probe.mjs  # 換一組獨立樣本
//
// ★ 量的東西（2026-08-15 修正版）★
//   1. 基礎發生率：正常 AI 對打（blockHand 全程 'vertical'，與正式版現況相同）下，
//      BLOCK_TOUCH 事件的 zone 分佈（top/side/body），每個 zone 觸後的三分結局
//      （攔網方直接得分／直接失分／續打後才分勝負——判準＝下一個 SCORE 事件前有沒有
//      出現過 TOUCH，沒有就是「直接」，SCORE 記給誰就是誰贏），side 直接失分再拆
//      出界(OUT) vs 落地未接(BALL_IN)，並依「這一觸當下這名攔網者是不是唯一在場的
//      手」拆 solo/multi（見下方單人覆蓋檢查）。
//   2. retract 的機會成本（玩家單人視角，修正版）：**只把實際碰到球的那一個攔網者
//      （tryBlock 的 best.actor，game.js:1242）改成 retract，其餘前排隊友手態不動**。
//      量兩個數：(a) 這名攔網者退了之後，這一球還會不會被隊友碰到（覆蓋率）；
//      (b) 玩家縮手後這一分的攔網方勝率，對比自然狀態。
//      舊版（把整隊攔網者全改 retract）量的是「整面牆消失」，不是玩家一個人縮手會
//      遇到的事，量測位置錯了——保留在下面當對照組，不當結論用。
//   3. press 的增益：同一顆球「vertical 擦頂 vs 全隊強制 press」（press 只在 zone=top
//      分支動行為，其餘 zone 不受影響，全隊蓋或單人蓋在此不影響結論，故沿用全隊版）。
//
//   配對方法（2/3 共用）：決定論下換手態會讓 rand() 消費量分岔、全場走向跟著岔開，
//   因此只取每場**第一次「扣球觸網判定」**做配對比較——那一刻之前，intent.hand／
//   單人 retract 覆蓋是這場唯一被動過的欄位，且 blockHand 在 tryBlock 以外處處不讀，
//   所以自然版與 forced 版在第一次判定前必然逐 tick 全同。配對前實際比對兩版本在
//   那一 tick 的球狀態（x/y/z/vx/vy/vz）與 tick 數逐值相等，證據見下方「配對驗證」——
//   不是假設，是每一對都驗過。
//
// ★ 單人覆蓋檢查（新，回答「這一觸算不算這名攔網者一個人扛的」）★
//   在**每一次**真實 BLOCK_TOUCH 發生前一刻（不只第一次），把當時的 game/ai 狀態
//   structuredClone 起來存底；觸網事件一出現，用底稿重跑一次 aiCollectIntents +
//   stepGame，唯一差別是把「剛剛真的碰到球那個人」的 intent.hand 蓋成 retract，
//   看這一 tick 還有沒有人碰到球。有人碰到＝這一觸背後至少有 2 人在牆上（multi）；
//   沒人碰到＝這名攔網者是這一球唯一的手（solo）。全程呼叫真實 stepGame/tryBlock，
//   不算幾何、不猜牆有幾人——只是把同一 tick 的輸入換一份、看真實結算怎麼回。
//
// ★ 不改動 ★ src/ 任何檔案、既有 tools/ 腳本、sim-hash-baseline.json、任何測試檔。
import { createCareer, createCareerPlayer, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';
import { OPPONENTS } from '../src/career/opponents.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

const args = process.argv.slice(2);
const mi = args.indexOf('--matches');
const PER_OPPONENT = mi >= 0 ? Number.parseInt(args[mi + 1], 10) : 25;
const SEED_BASE = Number.parseInt(process.env.VD_SEED_BASE ?? '1', 10);
const MAX_TICKS = 400000;
const NET_CLONE_GATE = 1.5; // |ball.z| 小於這個值才在 wasSpike tick 上先存底（縮小窗口省 clone 次數，仍足夠涵蓋過網 tick）

function bump(obj, key) { obj[key] = (obj[key] ?? 0) + 1; }

function setupGame(seed, opponentId) {
  const career = createCareer({ seed });
  const player = createCareerPlayer('探針', { seed });
  const members = buildStarterMembers();
  const lineup = defaultLineup(members, player.id, player.currentRole);
  const roster = { capacity: 12, members, alumni: [] };
  const setup = careerMatchSetup(
    career, player, { id: 'group-1', opponentId }, roster, lineup, 1,
  );
  const g = createGame({
    seed: setup.seed,
    teams: setup.teams,
    aiProfiles: setup.aiProfiles,
    liberos: setup.liberos,
  });
  const ai = createAiState();
  return { g, ai };
}

function ballSnap(g) {
  const b = g.ball;
  return { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz };
}

function ballEqual(a, b) {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z
    && a.vx === b.vx && a.vy === b.vy && a.vz === b.vz;
}

function applyForce(intents, force) {
  if (!force) return;
  for (const it of intents) {
    if (it.action !== 'block') continue;
    if (force.mode === 'all') it.hand = force.hand;
    else if (force.mode === 'single' && it.playerId === force.playerId) it.hand = force.hand;
  }
}

// force=null → 自然（AI 現況恆 'vertical'）。
// force={mode:'all', hand} → 蓋掉全部攔網 intent 的 hand（測 3、以及量 2 的舊「整隊」對照組）。
// force={mode:'single', hand, playerId} → 只蓋掉那一個玩家的 hand（量 2 修正版）。
// fullRun=true 才收 zoneCounts/outcomeCounts 與單人覆蓋檢查（跑完整場）；
// fullRun=false 是配對用的短跑，抓到第一次判定的結局就跳出，省時間。
function runOne(seed, opponentId, force, { fullRun } = {}) {
  const { g, ai } = setupGame(seed, opponentId);
  const zoneCounts = { top: 0, side: 0, body: 0 };
  const outcomeCounts = { top: {}, side: {}, body: {} };
  let pending = null;
  let firstEncounter = null;
  let feOutcome = null;
  let ticks = 0;
  while (g.phase !== 'set_over' && g.tick < MAX_TICKS) {
    const wasSpike = g.rally.profile === 'spike';
    const nearNet = fullRun && wasSpike && Math.abs(g.ball.z) < NET_CLONE_GATE;
    // 單人覆蓋檢查用的底稿：必須在這個 tick 的 intents 產生**之前**存，
    // 這樣底稿上重放 aiCollectIntents 才會跟這一 tick 的真實決策逐值相同
    // （aiCollectIntents 會就地改 aiState，晚存就存到已經被改過的版本）。
    const preCloneG = nearNet ? structuredClone(g) : null;
    const preCloneAi = nearNet ? structuredClone(ai) : null;

    const intents = aiCollectIntents(g, ai);
    applyForce(intents, force);
    const tickNow = g.tick;
    const snap = wasSpike ? ballSnap(g) : null;
    const ev = stepGame(g, intents);
    ticks += 1;
    if (!firstEncounter && wasSpike) {
      const hit = ev.find((e) => e.type === 'BLOCK_TOUCH' || e.type === 'BALL_OVER_NET');
      if (hit) {
        const defTeam = hit.type === 'BLOCK_TOUCH' ? hit.team : hit.toTeam;
        firstEncounter = {
          tick: tickNow,
          ball: snap,
          defTeam,
          kind: hit.type,
          zone: hit.zone ?? null,
          playerId: hit.type === 'BLOCK_TOUCH' ? hit.playerId : null,
        };
      }
    }
    let deadBallReason = null;
    for (const e of ev) {
      if (e.type === 'DEAD_BALL') { deadBallReason = e.reason; continue; }
      if (e.type === 'BLOCK_TOUCH') {
        const zone = e.zone ?? 'body';
        if (fullRun) zoneCounts[zone] += 1;
        let sole = null;
        // 單人覆蓋檢查只做 side zone（協調者只問這個，也是唯一在乎的子集）——
        // top/body 略過省時間，preCloneG 仍是同一份、不影響其他邏輯。
        if (preCloneG && zone === 'side') {
          // 底稿重放：唯一差別是把剛剛真的碰到球那個人的 hand 蓋成 retract，
          // 看同一 tick 是否還有人碰到球（真實 stepGame 再跑一次，不是算幾何）。
          const gc = structuredClone(preCloneG);
          const aic = structuredClone(preCloneAi);
          const intents2 = aiCollectIntents(gc, aic);
          applyForce(intents2, { mode: 'single', hand: 'retract', playerId: e.playerId });
          const ev2 = stepGame(gc, intents2);
          const stillTouched = ev2.some((e2) => e2.type === 'BLOCK_TOUCH');
          sole = !stillTouched;
        }
        pending = {
          toTeam: e.team, zone, sole,
        };
        continue;
      }
      if (pending) {
        if (e.type === 'TOUCH') {
          if (fullRun) bump(outcomeCounts[pending.zone], 'continued');
          pending = null;
        } else if (e.type === 'SCORE') {
          if (fullRun) {
            const lossDirect = e.team !== pending.toTeam;
            const key = lossDirect ? 'block_loss_direct' : 'block_win_direct';
            bump(outcomeCounts[pending.zone], key);
            if (pending.sole !== null) bump(outcomeCounts[pending.zone], `${key}_${pending.sole ? 'solo' : 'multi'}`);
            // 出界（OUT，未觸地即判失） vs 落地未接（BALL_IN，落在防守方半場但沒人碰到）
            // ——game.js:1296 的「~6%」講的是前者，不是「直接失分」整體，兩者要分開比對
            if (lossDirect) {
              bump(outcomeCounts[pending.zone], deadBallReason === 'OUT' ? 'loss_out' : 'loss_ballin');
            }
          }
          pending = null;
        }
      }
      if (firstEncounter && !feOutcome && e.type === 'SCORE') {
        feOutcome = { winner: e.team, defWon: e.team === firstEncounter.defTeam };
      }
    }
    // 短跑模式（forced 版本）：拿到第一次判定的結局就夠了，不必跑完整場
    if (!fullRun && firstEncounter && feOutcome) break;
  }
  return {
    zoneCounts, outcomeCounts, firstEncounter, feOutcome, ticks,
  };
}

// 統計一律用 Agresti-Coull（加 z²個虛擬成功＋z²個虛擬失敗再算 Wald），
// 不用單純 k/n ± sqrt(p(1-p)/n) 的 Wald 區間——k=0 或 k=n 時 Wald 的 SE 會塌成 0，
// 看起來像「零誤差」，其實只是「這個樣本數下沒觀察到」，兩者意義完全不同。
const Z = 1.96;
function acStats(k, n) {
  if (n === 0) return null;
  const nAdj = n + Z * Z;
  const pAdj = (k + (Z * Z) / 2) / nAdj;
  const pRaw = k / n;
  const se = Math.sqrt((pAdj * (1 - pAdj)) / nAdj);
  return { pRaw, se };
}
function seStr(k, n) {
  const s = acStats(k, n);
  if (!s) return 'n/a';
  return `${(s.pRaw * 100).toFixed(1)}% ± ${(Z * s.se * 100).toFixed(1)}pp (n=${n}, Agresti-Coull)`;
}
function diffLine(kA, nA, kB, nB, labelSig = '顯著', labelNoise = '落在雜訊內，分不出來') {
  const sA = acStats(kA, nA);
  const sB = acStats(kB, nB);
  if (!sA || !sB) return '樣本不足，分不出來';
  const diff = (sB.pRaw - sA.pRaw) * 100;
  const seDiff = Math.sqrt(sA.se ** 2 + sB.se ** 2) * 100;
  const tag = Math.abs(diff) < Z * seDiff ? labelNoise : labelSig;
  return `差＝${diff.toFixed(1)}pp（合併標準誤 ±${(Z * seDiff).toFixed(1)}pp，Agresti-Coull）　→ ${tag}`;
}

// ---- 主跑 ----
const t0 = Date.now();
const zoneCounts = { top: 0, side: 0, body: 0 };
const outcomeCounts = { top: {}, side: {}, body: {} };
let totalTicks = 0;
let matches = 0;

// 量 2（修正版）：只縮單一實際觸球者
let single = {
  eligible: 0, // 自然首觸就是 BLOCK_TOUCH 的場數（有「這一位」可縮）
  n: 0, verified: 0, natDefWon: 0, forcedDefWon: 0, stillTouched: 0,
};
// 量 2（舊版，整隊棄攔）：保留當對照組，不當結論
let wholeTeam = { n: 0, verified: 0, natDefWon: 0, forcedDefWon: 0 };
// 量 3：press
let pairedPress = {
  n: 0, verified: 0, natDefWon: 0, forcedDefWon: 0, topOnlyN: 0, topOnlyNatWon: 0, topOnlyForcedWon: 0,
};

for (const opp of OPPONENTS) {
  for (let i = 0; i < PER_OPPONENT; i += 1) {
    const seed = SEED_BASE + i * 101 + OPPONENTS.indexOf(opp) * 7919;
    matches += 1;

    const nat = runOne(seed, opp.id, null, { fullRun: true });
    totalTicks += nat.ticks;
    for (const z of ['top', 'side', 'body']) {
      zoneCounts[z] += nat.zoneCounts[z];
      for (const [k, v] of Object.entries(nat.outcomeCounts[z])) {
        outcomeCounts[z][k] = (outcomeCounts[z][k] ?? 0) + v;
      }
    }

    if (nat.firstEncounter && nat.feOutcome) {
      // --- 量 2 修正版：只縮那一個實際觸球者 ---
      if (nat.firstEncounter.kind === 'BLOCK_TOUCH') {
        single.eligible += 1;
        const targetId = nat.firstEncounter.playerId;
        const sgl = runOne(
          seed, opp.id, { mode: 'single', hand: 'retract', playerId: targetId }, { fullRun: false },
        );
        single.n += 1;
        if (sgl.firstEncounter && ballEqual(nat.firstEncounter.ball, sgl.firstEncounter.ball)
            && nat.firstEncounter.tick === sgl.firstEncounter.tick) {
          single.verified += 1;
          if (sgl.firstEncounter.kind === 'BLOCK_TOUCH') single.stillTouched += 1;
          if (sgl.feOutcome) {
            single.natDefWon += nat.feOutcome.defWon ? 1 : 0;
            single.forcedDefWon += sgl.feOutcome.defWon ? 1 : 0;
          }
        }
      }

      // --- 量 2 舊版（整隊棄攔，對照組） ---
      const ret = runOne(seed, opp.id, { mode: 'all', hand: 'retract' }, { fullRun: false });
      wholeTeam.n += 1;
      if (ret.firstEncounter && ballEqual(nat.firstEncounter.ball, ret.firstEncounter.ball)
          && nat.firstEncounter.tick === ret.firstEncounter.tick) {
        wholeTeam.verified += 1;
        if (ret.feOutcome) {
          wholeTeam.natDefWon += nat.feOutcome.defWon ? 1 : 0;
          wholeTeam.forcedDefWon += ret.feOutcome.defWon ? 1 : 0;
        }
      }

      // --- 量 3：press（全隊蓋，press 只在 zone=top 分支動行為，蓋一人或全隊不影響結論）---
      const prs = runOne(seed, opp.id, { mode: 'all', hand: 'press' }, { fullRun: false });
      pairedPress.n += 1;
      if (prs.firstEncounter && ballEqual(nat.firstEncounter.ball, prs.firstEncounter.ball)
          && nat.firstEncounter.tick === prs.firstEncounter.tick) {
        pairedPress.verified += 1;
        if (prs.feOutcome) {
          pairedPress.natDefWon += nat.feOutcome.defWon ? 1 : 0;
          pairedPress.forcedDefWon += prs.feOutcome.defWon ? 1 : 0;
          if (nat.firstEncounter.zone === 'top') {
            pairedPress.topOnlyN += 1;
            pairedPress.topOnlyNatWon += nat.feOutcome.defWon ? 1 : 0;
            pairedPress.topOnlyForcedWon += prs.feOutcome.defWon ? 1 : 0;
          }
        }
      }
    }
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const totalTouch = zoneCounts.top + zoneCounts.side + zoneCounts.body;

console.log(`\n== retract 價值探針（2026-08-15 修正版）==  ${matches} 局（七隊 × ${PER_OPPONENT}，seedBase=${SEED_BASE}）`
  + `　共 ${totalTicks} tick　耗時 ${elapsed}s\n`);

console.log('--- 量 1：BLOCK_TOUCH zone 分佈與觸後結局（正常 AI 對打，blockHand 全程 vertical）---');
console.log(`  總 BLOCK_TOUCH 事件數：${totalTouch}`);
for (const z of ['top', 'side', 'body']) {
  const c = zoneCounts[z];
  const pct = totalTouch ? ((c / totalTouch) * 100).toFixed(1) : '0.0';
  const oc = outcomeCounts[z];
  const win = oc.block_win_direct ?? 0;
  const loss = oc.block_loss_direct ?? 0;
  const cont = oc.continued ?? 0;
  const resolved = win + loss + cont;
  console.log(`  ${z.padEnd(4)}  n=${String(c).padStart(4)} (${pct}%)　`
    + `直接得分=${win} 直接失分=${loss}（出界=${oc.loss_out ?? 0} 落地未接=${oc.loss_ballin ?? 0}）`
    + ` 續打後才分勝負=${cont}　(已結算樣本=${resolved})`);
  if (resolved > 0) {
    console.log(`        直接失分率＝${seStr(loss, resolved)}`);
  }
}
console.log('\n  ★ 擦側（zone=side）之後，攔網方直接失分的比率＋人數拆分 ★');
{
  const oc = outcomeCounts.side;
  const win = oc.block_win_direct ?? 0;
  const loss = oc.block_loss_direct ?? 0;
  const cont = oc.continued ?? 0;
  const lossOut = oc.loss_out ?? 0;
  const lossBallin = oc.loss_ballin ?? 0;
  const lossSolo = oc.block_loss_direct_solo ?? 0;
  const lossMulti = oc.block_loss_direct_multi ?? 0;
  const resolved = win + loss + cont;
  console.log(`  side 觸網樣本 n=${zoneCounts.side}，已結算 n=${resolved}`);
  console.log(`  直接失分（出界＋落地未接兩者合計）＝${seStr(loss, resolved)}`);
  console.log(`    其中純出界（OUT，對照 game.js:1296 的「~6%」）＝${seStr(lossOut, resolved)}`);
  console.log(`    其中落地未接（BALL_IN，球留在界內但沒人碰到）＝${seStr(lossBallin, resolved)}`);
  console.log(`  （對照：續打後才分勝負＝${seStr(cont, resolved)}，`
    + `攔網方反而直接得分＝${seStr(win, resolved)}）`);
  const soloTotal = lossSolo + lossMulti;
  console.log(`  ★ 這 ${loss} 個直接失分裡，觸網當下是「只有他一個人在牆上」(solo) `
    + `vs「還有隊友同時在牆上」(multi)（單人覆蓋檢查，soloTotal=${soloTotal}）：`);
  console.log(`    solo  ＝${seStr(lossSolo, soloTotal)}`);
  console.log(`    multi ＝${seStr(lossMulti, soloTotal)}`);
}

console.log('\n--- 量 2（修正版）：玩家單人縮手的機會成本（只縮實際觸球那一位，隊友手態不動）---');
{
  console.log(`  自然首觸就是「有人碰到球」的場數（有「這一位」可縮）＝${single.eligible} / ${matches}`);
  console.log(`  可配對樣本 n=${single.n}，通過逐值球況驗證 n=${single.verified}`);
  console.log('  (1) 這名攔網者退了之後，這一球還有沒有被隊友碰到：');
  console.log(`      仍被碰到（隊友補上）率＝${seStr(single.stillTouched, single.verified)}`);
  console.log('      （其餘即「沒人補上、球直接乾淨過網」＝這一球實際上只靠他一個人擋）');
  console.log('  (2) 這一分的攔網方勝率：');
  console.log(`      自然（那位手照攔）＝${seStr(single.natDefWon, single.verified)}`);
  console.log(`      他一人縮手（隊友不動）＝${seStr(single.forcedDefWon, single.verified)}`);
  console.log(`      ${diffLine(single.natDefWon, single.verified, single.forcedDefWon, single.verified)}`);
}

console.log('\n--- 量 2 舊版對照組（整隊棄攔＝牆整面消失，量錯位置，僅供對照、不作結論）---');
{
  console.log(`  可配對樣本 n=${wholeTeam.n}，驗證通過 n=${wholeTeam.verified}`);
  console.log(`  有牆＝${seStr(wholeTeam.natDefWon, wholeTeam.verified)}　`
    + `全隊棄攔（無牆）＝${seStr(wholeTeam.forcedDefWon, wholeTeam.verified)}`);
  console.log(`  ${diffLine(wholeTeam.natDefWon, wholeTeam.verified, wholeTeam.forcedDefWon, wholeTeam.verified)}`);
}

console.log('\n--- 量 3：press 的增益（同一顆球，vertical 擦頂 vs 全隊強制 press）---');
{
  const {
    n, verified, natDefWon, forcedDefWon, topOnlyN, topOnlyNatWon, topOnlyForcedWon,
  } = pairedPress;
  console.log(`  可配對樣本 n=${n}，通過逐值球況驗證 n=${verified}`);
  console.log('  全樣本（含 press 完全不影響的 side/body 首觸）：');
  console.log(`    vertical 防守方得分率：${seStr(natDefWon, verified)}`);
  console.log(`    press    防守方得分率：${seStr(forcedDefWon, verified)}`);
  console.log('  只看首次判定就是「擦頂」(zone=top) 的子樣本（press 真正生效的情境）：');
  console.log(`    vertical 防守方得分率：${seStr(topOnlyNatWon, topOnlyN)}`);
  console.log(`    press    防守方得分率：${seStr(topOnlyForcedWon, topOnlyN)}`);
  console.log(`    ${topOnlyN > 0 ? diffLine(topOnlyNatWon, topOnlyN, topOnlyForcedWon, topOnlyN) : 'top-only 子樣本量不足，分不出來'}`);
}

console.log('\n（探針結束——本檔案為留檔，不 git commit）\n');
