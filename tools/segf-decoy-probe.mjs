// 組合攻擊卷 段 F 前置補量 —— 「誘餌帶走 commit」發生率量測（**零 `src/` 改動**）
//
// 用法：node tools/segf-decoy-probe.mjs [局數=40] [對手id=obsidian]
//   SEGF_ARMS=obsidian,white-wave  node tools/segf-decoy-probe.mjs 40
//
// ★ 這支探針要回答的（段 F 停手條款）★
//   Q1 commit 的計畫**鎖定到誰**？鎖到玩家（A2）的比例是多少？
//      —— 若 commit 從來不鎖玩家，「玩家助跑帶走攔中」這條回饋沒有東西可顯示。
//   Q2 玩家的助跑造成 commit **改瞄**（replant）的比例？
//   Q3 **可觀察判準**下的「誘餌帶走攔中」發生率——回饋層真正能用的那一個
//      （回饋只能用玩家看得到的東西，不得讀 blockPlan）。
//
// ★ 兩套口徑刻意分開 ★
//   god／上帝視角（Q1、Q2）＝直接讀 `ai.blockPlan`（AI 的私有狀態）。**只用來量測**，
//     用途是回答「機制到底有沒有在動」，回饋層不得使用。
//   obs／可觀察（Q3）＝只用擊球那一 tick 的公開量：對方前排各人的 x 與是否在攔網空中
//     （`blockUntil`／`blockStartTick`＝場上看得見「誰跳了」）、球的位置、我方本波誰跑了助跑。
//     兩套口徑的一致率（下方 agree）本身就是「可觀察判準抓不抓得到真機制」的證據。
//
// tick↔秒：SIM_HZ = 60 ⇒ 1 tick = 1/60 s。
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { isFrontRow, TEAM_SIDE } from '../src/sim/rotation.js';
import { BLOCK_HALF_WIDTH } from '../src/sim/blockBand.js';
import { BLOCK_COMMIT } from '../src/sim/blockRead.js';
import { createCareer, createCareerPlayer, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { opponentById } from '../src/career/opponents.js';

const SETS = Number.parseInt(process.argv[2] ?? '40', 10);
const ARMS = (process.env.SEGF_ARMS ?? process.argv[3] ?? 'obsidian').split(',');
const HERO = 'A2';           // 生涯主角固定 A2（careerState.js:182）
const MAX_TICKS = 400000;
// 「這隻手構得到球」的既有真相＝攔網帶半寬（blockBand.js:41）。**不另立常數**：
// 判準用的每一個距離門檻都是它。
const HW = BLOCK_HALF_WIDTH;
// 門檻敏感度三檔：HW／2HW／3HW。0% 若是門檻造出來的，放寬就該長出東西。
const THRESHOLDS = [HW, HW * 2, HW * 3];

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : 'n/a');
// 二項比例標準誤（百分點）
const se = (a, b) => (b ? `${(100 * Math.sqrt(((a / b) * (1 - a / b)) / b)).toFixed(1)}pp` : 'n/a');
const line = (label, a, b) => `  ${label.padEnd(34)} ${String(a).padStart(5)} / ${String(b).padStart(5)}  ${pct(a, b).padStart(7)} ±${se(a, b)}`;

// 玩家位置（預設 outside＝createCareerPlayer 的出廠值）。段 F 要問「OH 的助跑進不進得了
// commit 的偵測窗」，就必須有一條「MB 玩家」的對照臂——否則量到的 0% 分不出
// 「機制不會發生」與「這個位置不會發生」。
const HERO_ROLE = process.env.SEGF_ROLE ?? 'outside';

function setupMatch(run, oppId) {
  const career = createCareer({ seed: 700000 + run * 6997, playerName: '探針' });
  const player = createCareerPlayer('探針');
  if (HERO_ROLE !== 'outside') player.currentRole = HERO_ROLE;
  const roster = { capacity: 12, members: buildStarterMembers() };
  const entry = { id: 'group-3', stage: 'group', opponentId: oppId, label: '' };
  return careerMatchSetup(career, player, entry, roster, null);
}

function runSet(run, oppId, acc) {
  const setup = setupMatch(run, oppId);
  const game = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
    liberos: setup.liberos, setTarget: 25,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
    ...(setup.benches ? { benches: setup.benches } : {}),
  });
  const ai = createAiState();

  // A 隊場上非二傳非自由人（＝攻擊池的候選；角色是公開資訊）
  const aPool = () => game.match.rotations.A.filter((pid) => {
    const r = game.players[pid]?.currentRole;
    return r !== 'setter' && r !== 'libero';
  });
  const xOf = (pid) => game.actors[pid]?.x ?? null;
  // template.x 逐值等於某個 A 隊 actor 的 x（blockCommitRead 回傳的就是 best.x）
  // ⇒ 用逐值相等回推「鎖到誰」。這是**真實路徑取得**，不是重刻判斷式。
  const whoIsAt = (x) => {
    if (x == null) return null;
    for (const pid of game.match.rotations.A) if (game.actors[pid]?.x === x) return pid;
    return null;
  };

  let seenReplant = {};   // pid → 上次看到的 replantUntil
  let prevPlan = null;
  let curLock = null;     // 本波 B 隊計畫鎖到誰（god，供 god↔obs 對齊用）

  while (game.phase !== 'set_over' && game.phase !== 'matchover' && acc.ticks < MAX_TICKS) {
    acc.ticks += 1;
    const intents = aiCollectIntents(game, ai);

    // ── god Q1：計畫建立的那一刻鎖到誰 ──────────────────────
    const plan = ai.blockPlan;
    if (plan && plan !== prevPlan) {
      if (plan.team === 'B') {
        acc.plans += 1;
        if (plan.template.blind) { acc.planBlind += 1; curLock = { pid: null, blind: true }; } else {
          const pid = whoIsAt(plan.template.x);
          acc.planLocked += 1;
          curLock = { pid, blind: false };
          if (pid == null) acc.planUnmatched += 1;
          else {
            acc.lockBy[pid] = (acc.lockBy[pid] ?? 0) + 1;
            if (pid === HERO) acc.lockHero += 1;
          }
        }
      }
      // 診斷：計畫建立的那一 tick，玩家有沒有落在 blockCommitRead 的候選條件內？
      //（條件抄自 blockRead.js:195-198——這裡是**診斷**不是判準，重刻可接受並註明）
      if (plan.team === 'B') {
        const a = game.actors[HERO];
        if (a) {
          const side = TEAM_SIDE.A;
          const lz = side * a.z;
          const approaching = (side * a.pz) - lz > BLOCK_COMMIT.APPROACH_EPS;
          acc.lockTicks += 1;
          acc.heroLz.push(lz);
          if (lz <= BLOCK_COMMIT.DEPTH_LZ) acc.heroInDepth += 1;
          if (approaching) acc.heroApproaching += 1;
          if (lz <= BLOCK_COMMIT.DEPTH_LZ && approaching) acc.heroEligible += 1;
        }
      }
      prevPlan = plan;
      seenReplant = {};
    }
    // ── god Q2：改瞄（replant）事件與歸因 ────────────────────
    if (plan && plan.team === 'B') {
      for (const pid of Object.keys(plan.byPid)) {
        const c = plan.byPid[pid];
        const prev = seenReplant[pid];
        if (prev !== undefined && c.replantUntil > prev) {
          acc.replants += 1;
          const who = whoIsAt(c.pendingX);
          if (who == null) acc.replantUnmatched += 1;
          else {
            acc.replantBy[who] = (acc.replantBy[who] ?? 0) + 1;
            if (who === HERO) acc.replantHero += 1;
          }
        }
        seenReplant[pid] = c.replantUntil;
      }
    }

    // ── 攻擊池：本波誰跑了助跑（在 stepGame 之前取，攻擊 tick 上還在）──
    const routes = ai.approach?.team === 'A' ? (ai.approach.routes ?? []) : [];
    const poolRan = routes.map((r) => r.pid);
    const atkId = ai.attackerId ?? null;

    const ev = stepGame(game, intents);
    const tick = game.tick;

    for (const e of ev) {
      if (e.type !== 'TOUCH' || e.kind !== 'spike' || e.team !== 'A') continue;
      acc.spikes += 1;
      const spiker = e.playerId;
      const contactX = game.ball.x;

      // 誘餌＝本波跑了助跑、但不是這一球攻擊手的人（湧現式，sim 沒有旗標）
      const pool = poolRan.length ? poolRan : aPool();
      const decoys = pool.filter((pid) => pid !== spiker);
      if (decoys.includes(HERO)) acc.heroDecoyWaves += 1;
      if (spiker === HERO) acc.heroAtkWaves += 1;

      // 對方前排：誰在攔網空中、站在哪（公開量）
      const rotB = game.match.rotations.B;
      const front = rotB.filter((pid) => isFrontRow(rotB, pid));
      const air = front.filter((pid) => game.actors[pid].blockUntil >= tick)
        .map((pid) => ({ pid, x: game.actors[pid].x }));
      if (air.length) acc.wavesWithAir += 1;

      // ── god 對齊：本波的計畫鎖到誰 vs 真正扣球的是誰 ──────
      if (curLock) {
        if (curLock.blind) acc.waveBlind += 1;
        else if (curLock.pid === spiker) acc.lockHitAttacker += 1;
        else if (curLock.pid != null) {
          acc.lockOnDecoy += 1;
          if (curLock.pid === HERO) acc.lockOnHeroDecoy += 1;
        }
        if (curLock.pid === HERO && decoys.includes(HERO)) acc.lockHeroWhileDecoy += 1;
      }

      // ── obs Q3：可觀察判準 ────────────────────────────────
      // (a) 空門：擊球點 T 內沒有任何在空中的攔網手
      // (b) 有人跳空了：離擊球點 > T
      // (c) 跳空的人黏在某個誘餌身上（|blocker.x − decoy.x| ≤ T）
      // T 掃三檔（HW／2HW／3HW）＝門檻敏感度，確認 0% 不是門檻造出來的
      for (let ti = 0; ti < THRESHOLDS.length; ti += 1) {
        const T = THRESHOLDS[ti];
        const covered = air.some((b) => Math.abs(b.x - contactX) <= T);
        const missed = air.filter((b) => Math.abs(b.x - contactX) > T);
        let pulledBy = null;
        for (const b of missed) {
          for (const d of decoys) {
            const dx = xOf(d);
            if (dx != null && Math.abs(b.x - dx) <= T) { pulledBy = d; break; }
          }
          if (pulledBy) break;
        }
        const t = acc.thr[ti];
        const blindNow = !!(curLock && curLock.blind);
        if (!covered) t.openNet += 1;
        if (pulledBy) t.pulled += 1;
        // 判準乙（無歸因版）：有人賭了、賭錯了、你面前是空門——不宣稱「誰把他帶走」
        if (!covered && missed.length) {
          t.betMissed += 1;
          if (blindNow) t.betMissedBlind += 1;
          if (spiker === HERO) t.betMissedHeroAtk += 1;
        }
        if (!covered && pulledBy != null) {
          t.deceived += 1;
          t.deceivedBy[pulledBy] = (t.deceivedBy[pulledBy] ?? 0) + 1;
          if (pulledBy === HERO) {                            // ① 玩家助跑帶走攔中
            t.deceivedHeroDecoy += 1;
            // 誤歸因：obs 說「你帶走了他」，god 說這份計畫根本沒鎖任何人／鎖的不是你
            if (blindNow) t.heroDecoyBlind += 1;
            else if (!curLock || curLock.pid !== HERO) t.heroDecoyWrongLock += 1;
          }
          if (spiker === HERO) {                              // ② 玩家是受益者（空門）
            t.deceivedHeroAtk += 1;
            if (blindNow) t.heroAtkBlind += 1;
          }
          // god↔obs 一致：可觀察判準說「被誘餌帶走」時，god 的計畫是不是真的鎖在誘餌上
          if (curLock && !curLock.blind && curLock.pid != null && curLock.pid !== spiker) t.agree += 1;
          if (curLock && curLock.blind) t.agreeBlind += 1;
        }
      }
    }
  }
}

function runArm(oppId) {
  const acc = {
    ticks: 0, spikes: 0, plans: 0, planBlind: 0, planLocked: 0, planUnmatched: 0,
    lockHero: 0, lockBy: {}, replants: 0, replantHero: 0, replantUnmatched: 0, replantBy: {},
    heroDecoyWaves: 0, heroAtkWaves: 0, wavesWithAir: 0,
    waveBlind: 0, lockHitAttacker: 0, lockOnDecoy: 0, lockOnHeroDecoy: 0, lockHeroWhileDecoy: 0,
    lockTicks: 0, heroLz: [], heroInDepth: 0, heroApproaching: 0, heroEligible: 0,
    thr: THRESHOLDS.map(() => ({
      openNet: 0, pulled: 0, deceived: 0, deceivedHeroDecoy: 0, deceivedHeroAtk: 0,
      deceivedBy: {}, agree: 0, agreeBlind: 0,
      betMissed: 0, betMissedBlind: 0, betMissedHeroAtk: 0,
      heroDecoyBlind: 0, heroDecoyWrongLock: 0, heroAtkBlind: 0,
    })),
  };
  for (let s = 0; s < SETS; s += 1) runSet(s, oppId, acc);
  return acc;
}

for (const arm of ARMS) {
  const def = opponentById(arm);
  const a = runArm(arm);
  console.log(`\n═══ 對手 ${arm}（blockPersona=${def?.ai?.blockPersona}）  ${SETS} 局  ${a.ticks} ticks ═══`);
  console.log(`  A 隊扣球波數 ${a.spikes}｜玩家(${HERO})當誘餌 ${a.heroDecoyWaves}｜玩家當攻擊手 ${a.heroAtkWaves}`);
  console.log('\n  ── god 口徑（讀 blockPlan，僅量測用）──');
  console.log(`  B 隊建計畫次數 ${a.plans}（blind 退路 ${a.planBlind}＝${pct(a.planBlind, a.plans)}）`);
  console.log(line('計畫鎖定到某個 A 隊員', a.planLocked - a.planUnmatched, a.planLocked));
  console.log(line('　其中鎖到玩家 A2', a.lockHero, a.planLocked));
  console.log(`  鎖定對象分佈：${JSON.stringify(a.lockBy)}`);
  console.log(`  改瞄(replant) 次數 ${a.replants}｜歸因不到人 ${a.replantUnmatched}`);
  console.log(line('　改瞄瞄向玩家 A2', a.replantHero, a.replants));
  console.log(`  改瞄對象分佈：${JSON.stringify(a.replantBy)}`);
  console.log('\n  ── god 對齊（每一波扣球：計畫鎖到誰 vs 真的誰扣）──');
  console.log(line('本波計畫是 blind（沒鎖任何人）', a.waveBlind, a.spikes));
  console.log(line('鎖對了＝鎖到真正的攻擊手', a.lockHitAttacker, a.spikes));
  console.log(line('鎖錯了＝鎖在誘餌身上', a.lockOnDecoy, a.spikes));
  console.log(line('　其中誘餌＝玩家 A2', a.lockOnHeroDecoy, a.spikes));
  console.log(`  玩家當誘餌的波裡「計畫鎖到玩家」：${pct(a.lockHeroWhileDecoy, a.heroDecoyWaves)} ±${se(a.lockHeroWhileDecoy, a.heroDecoyWaves)}  (${a.lockHeroWhileDecoy}/${a.heroDecoyWaves})`);
  const lzs = [...a.heroLz].sort((x, y) => x - y);
  const qq = (p) => (lzs.length ? lzs[Math.min(lzs.length - 1, Math.floor(lzs.length * p))].toFixed(2) : 'n/a');
  console.log(`  【診斷】建計畫那一 tick，玩家是否在 blockCommitRead 的候選條件內（DEPTH_LZ=${BLOCK_COMMIT.DEPTH_LZ}）：`);
  console.log(line('  玩家 lz ≤ DEPTH_LZ', a.heroInDepth, a.lockTicks));
  console.log(line('  玩家正在朝網推進', a.heroApproaching, a.lockTicks));
  console.log(line('  ★ 兩條同時成立＝進得了候選池', a.heroEligible, a.lockTicks));
  console.log(`  玩家 lz 分位：p10=${qq(0.1)} p50=${qq(0.5)} p90=${qq(0.9)}（越小＝越靠網）`);
  console.log('\n  ── obs 口徑（只用可觀察量；回饋層要用的就是這一組）──');
  console.log(line('扣球那刻有人在攔網空中', a.wavesWithAir, a.spikes));
  for (let ti = 0; ti < THRESHOLDS.length; ti += 1) {
    const t = a.thr[ti];
    console.log(`  [門檻 T=${THRESHOLDS[ti].toFixed(2)}m]`);
    console.log(line('  空門（擊球點 T 內無空中攔網手）', t.openNet, a.spikes));
    console.log(line('  有攔網手跳空且黏在誘餌上', t.pulled, a.spikes));
    console.log(line('  ★ 誘餌帶走攔中（空門∧黏誘餌）', t.deceived, a.spikes));
    console.log(line('  　① 誘餌＝玩家（你帶走了）', t.deceivedHeroDecoy, a.spikes));
    console.log(line('  　② 攻擊手＝玩家（你吃到空門）', t.deceivedHeroAtk, a.spikes));
    console.log(`    ① 條件機率（玩家當誘餌的波）：${pct(t.deceivedHeroDecoy, a.heroDecoyWaves)} ±${se(t.deceivedHeroDecoy, a.heroDecoyWaves)}  (${t.deceivedHeroDecoy}/${a.heroDecoyWaves})`);
    console.log(`    ② 條件機率（玩家當攻擊手的波）：${pct(t.deceivedHeroAtk, a.heroAtkWaves)} ±${se(t.deceivedHeroAtk, a.heroAtkWaves)}  (${t.deceivedHeroAtk}/${a.heroAtkWaves})`);
    console.log(`    god↔obs 一致（obs 說被帶走時 god 計畫確實鎖在誘餌）：${pct(t.agree, t.deceived)}｜其中 god 是 blind：${pct(t.agreeBlind, t.deceived)}`);
    console.log(`    ★① 誤歸因：blind ${t.heroDecoyBlind}／鎖的不是玩家 ${t.heroDecoyWrongLock}（共 ${t.deceivedHeroDecoy} 次宣稱）＝誤判率 ${pct(t.heroDecoyBlind + t.heroDecoyWrongLock, t.deceivedHeroDecoy)}`);
    console.log(`    ★② 誤歸因：god 是 blind ${t.heroAtkBlind}／${t.deceivedHeroAtk}＝${pct(t.heroAtkBlind, t.deceivedHeroAtk)}`);
    console.log(line('  判準乙（無歸因）他賭了且賭錯＝空門', t.betMissed, a.spikes));
    console.log(`    　其中攻擊手＝玩家：${t.betMissedHeroAtk}／${a.heroAtkWaves}＝${pct(t.betMissedHeroAtk, a.heroAtkWaves)} ±${se(t.betMissedHeroAtk, a.heroAtkWaves)}｜god blind 佔 ${pct(t.betMissedBlind, t.betMissed)}`);
    console.log(`    誘餌分佈：${JSON.stringify(t.deceivedBy)}`);
  }
  console.log(`  HW=${HW.toFixed(3)}m`);
}
