// 屆間養成卷 — 默契「載體」候選的可行性量測（2026-08-08）
//
// 用法：node tools/offseason-chemistry-carrier-probe.mjs [每臂局數=12]
//
// ★ 零 `src/` 改動、零數值改動 ★ 本檔對 `src/`、`tests/` 一個位元組都不寫。
//
// ── 要回答的一題 ────────────────────────────────────────────
// 主對話提案：把默契的載體從「B 快成立率」放大成
//   **「玩家與 MB 完成的組合攻擊配合」**，理由＝三型組合的誘餌恆為 MB 的快攻線
//   （`approach.js:667` COMBO_PARTNER_KIND 全 'quick'；`ai.js:764` 只有前排 middle
//    才拿得到 'quick'）⇒ 玩家站 S／OPP／OH 都有機會累積，不會像 B 快那樣只在 S 位有數字。
// 本探針的任務＝**驗證這個推論**：三個位置各自，玩家真的參與到的組合次數是多少？
// 有沒有哪一格又是空集合（本專案第 11 次空集合預檢）。
//
// ── 證據取得路徑（`02 §6.1` 條 4：真實路徑，不重建模型）───────────
// · 生涯建隊走真實 `careerMatchSetup`（同 `tools/camp-bquick-baseline-probe.mjs`），
//   `comboScale` 由 career 層自己算，本檔不硬填。
// · 組合的成立與否**不自己判**：直接讀 sim 自己寫的 `aiState.attackCombo`
//   （`ai.js:467`／`1512` 寫入、`ai.js:341`／`558` 清空），逐 flightId 去重。
// · 誘餌是誰**不自己推**：讀 `combo.partnerId` 回查 `game.players[pid].currentRole`。
//
// ── ★ 量測位置：為什麼用純 AI vs AI ★ ────────────────────────
// ① 受控玩家治具在 S 位是壞的（`camp-bquick-baseline-probe.mjs` 檔頭：受控 S 打成
//    0:25、永不輪轉），而「玩家這一輪在不在前排」正是決定組合資格的量 ⇒ 不能用。
// ② 組合的自動排程（`planCombination`）**不看某人是不是受控**：它吃輪轉、站位、
//    passTier 與型別骰。所以 AI vs AI 局裡「A2 這個角色參與了幾次組合」與真人操作時
//    的**結構性上限**同源。⚠ 誠實界線 ⚠ 玩家「主動叫」的那條路（OPP 夾塞鈕、
//    OH 內切鈕、S 指令面板）本檔量不到，那是**加在這個底線之上**的量，不是取代它。
//    因此本檔的數字要讀成「**下限／結構性可得量**」。
//
// ── 輸出的三個欄位怎麼讀 ──────────────────────────────────
// · 「玩家＝主攻」：玩家跑組合的主線、MB 當誘餌（OH 的交叉／OPP 的夾塞／兩者的時間差）
// · 「玩家＝誘餌」：玩家自己是跑快攻的那個（只有玩家站 MB 時才可能）
// · 「同隊有組合但玩家沒份」：組合發生在隊友之間（玩家站 S 時的唯一候選——他是舉球的人）

const SETS = Number.parseInt(process.argv[2] ?? '12', 10);
const ME = 'A2';
const MAX_TICKS = 400000;

const { createGame, stepGame } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
const {
  createCareer, createCareerPlayer, careerMatchSetup,
} = await import('../src/career/careerState.js');
const { buildStarterMembers } = await import('../src/career/roster.js');
const { defaultLineup } = await import('../src/career/lineup.js');
const { COMBO_TYPES, COMBO_RATE } = await import('../src/sim/approach.js');

const pct = (k, n) => `${(100 * k / (n || 1)).toFixed(1)}%`;

function careerGameFactory({ seasonIndex, opponentId, role, seed }) {
  const career = createCareer({ seed });
  const player = createCareerPlayer('探針', { seed });
  player.naturalRole = role;
  player.currentRole = role;
  player.techniques = { ...player.techniques, callPlay: 1 };
  const members = buildStarterMembers();
  const lineup = defaultLineup(members, player.id, player.currentRole);
  const setup = careerMatchSetup(
    career, player, { id: 'group-1', opponentId },
    { capacity: 12, members, alumni: [] }, lineup, seasonIndex,
  );
  return {
    setup,
    make: () => createGame({
      seed: setup.seed,
      teams: setup.teams,
      aiProfiles: setup.aiProfiles,
      liberos: setup.liberos,
      benches: setup.benches,
      stamina: { A: {}, B: { costMul: 1.0 } },
      momentum: true,
      setTarget: 25,
      comboScale: setup.comboScale,
    }),
  };
}

function runArm(opts, seedOffset) {
  const { make, setup } = careerGameFactory({ ...opts, seed: seedOffset });
  const game = make();
  const ai = createAiState();
  const seen = new Set();       // 已計數的 flightId（組合逐波只算一次）
  const seenFlights = new Set(); // 我方所有規劃過的波（分母）
  const out = {
    myFlights: 0, combos: 0, asMain: 0, asPartner: 0, asNeither: 0,
    byType: new Map(), myByType: new Map(), partnerRole: new Map(),
    onCourt: 0, onCourtFront: 0, tick: 0,
    setterIsMe: 0, comboWhileIAmSetter: 0,
    score: null, comboScale: setup.comboScale,
  };
  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const intents = aiCollectIntents(game, ai); // 全 AI：無 excludeIds
    const r = game.rally;
    if (ai.landingTeam === 'A' && r && r.flightId != null && ai.approach?.team === 'A') {
      if (!seenFlights.has(r.flightId)) {
        seenFlights.add(r.flightId);
        out.myFlights += 1;
        const rot = game.match.rotations.A;
        const idx = rot.indexOf(ME);
        if (idx >= 0) {
          out.onCourt += 1;
          // isFrontRow 的口徑：rotations 陣列前三格＝前排（與 ai.js 同源，見下方自檢）
          if (idx < 3) out.onCourtFront += 1;
        }
        if (ai.claimId === ME) out.setterIsMe += 1;
      }
      const c = ai.attackCombo;
      if (c && !seen.has(r.flightId)) {
        seen.add(r.flightId);
        out.combos += 1;
        out.byType.set(c.type, (out.byType.get(c.type) ?? 0) + 1);
        const prole = game.players[c.partnerId]?.currentRole ?? '(none)';
        out.partnerRole.set(prole, (out.partnerRole.get(prole) ?? 0) + 1);
        if (c.mainId === ME) {
          out.asMain += 1;
          out.myByType.set(c.type, (out.myByType.get(c.type) ?? 0) + 1);
        } else if (c.partnerId === ME) {
          out.asPartner += 1;
          out.myByType.set(c.type, (out.myByType.get(c.type) ?? 0) + 1);
        } else {
          out.asNeither += 1;
          if (ai.claimId === ME) out.comboWhileIAmSetter += 1;
        }
      }
    }
    stepGame(game, intents);
  }
  out.tick = game.tick;
  out.score = { ...game.match.score };
  return out;
}

function agg(opts) {
  const a = {
    myFlights: 0, combos: 0, asMain: 0, asPartner: 0, asNeither: 0,
    onCourt: 0, onCourtFront: 0, setterIsMe: 0, comboWhileIAmSetter: 0,
    byType: new Map(), myByType: new Map(), partnerRole: new Map(),
    ptsFor: 0, ptsAgainst: 0, comboScale: null,
  };
  for (let i = 0; i < SETS; i += 1) {
    const r = runArm(opts, 1000 + i * 101);
    for (const k of ['myFlights', 'combos', 'asMain', 'asPartner', 'asNeither',
      'onCourt', 'onCourtFront', 'setterIsMe', 'comboWhileIAmSetter']) a[k] += r[k];
    for (const key of ['byType', 'myByType', 'partnerRole']) {
      for (const [k, v] of r[key]) a[key].set(k, (a[key].get(k) ?? 0) + v);
    }
    a.ptsFor += r.score.A; a.ptsAgainst += r.score.B;
    a.comboScale = r.comboScale;
  }
  return a;
}

const mapStr = (m) => [...m.entries()].sort((x, y) => y[1] - x[1])
  .map(([k, v]) => `${k}=${v}`).join(' ') || '—';

console.log(`== 屆間養成卷：默契載體候選量測 ==  每臂 ${SETS} 局（純 AI vs AI 生涯局）`);
console.log(`COMBO_TYPES=[${COMBO_TYPES.join(', ')}]  COMBO_RATE=`
  + `${COMBO_TYPES.map((t) => `${t}:${COMBO_RATE[t]}`).join(' ')}\n`);

const ARMS = [
  { label: 'S（二傳）', role: 'setter', seasonIndex: 2, opponentId: 'north-tech' },
  { label: 'OH（主攻）', role: 'outside', seasonIndex: 2, opponentId: 'north-tech' },
  { label: 'OPP（對角）', role: 'opposite', seasonIndex: 2, opponentId: 'north-tech' },
  { label: 'MB（欄中）', role: 'middle', seasonIndex: 2, opponentId: 'north-tech' },
  { label: 'L（自由人）', role: 'libero', seasonIndex: 2, opponentId: 'north-tech' },
  { label: 'S・第1屆', role: 'setter', seasonIndex: 1, opponentId: 'north-tech' },
  { label: 'OPP・第1屆', role: 'opposite', seasonIndex: 1, opponentId: 'north-tech' },
];

const res = ARMS.map((arm) => ({ arm, a: agg(arm) }));

console.log('════ ① 玩家參與組合攻擊的次數（★這就是「默契載體」的大小★）════');
console.log('位置          cScale 我方波數 同隊組合 玩家=主攻 玩家=誘餌 沒份  玩家有份/局');
for (const { arm, a } of res) {
  const mine = a.asMain + a.asPartner;
  console.log(
    `${arm.label.padEnd(13)}${String(a.comboScale).padStart(6)}`
    + `${String(a.myFlights).padStart(8)}${String(a.combos).padStart(9)}`
    + `${String(a.asMain).padStart(10)}${String(a.asPartner).padStart(10)}`
    + `${String(a.asNeither).padStart(6)}  ${(mine / SETS).toFixed(2)} 次/局`,
  );
}

console.log('\n════ ② 空集合預檢：兩種口徑各自會不會是空集合 ════');
console.log('  口徑甲＝「玩家自己跑在組合的兩條線之一」（主攻或誘餌）');
console.log('  口徑乙＝甲 ＋「玩家是本波舉球的人、而那一波組合成立了」（把 S 也算進來）');
const flagOf = (k) => (k === 0 ? '★空集合★' : (k / SETS < 1 ? '⚠稀薄(<1次/局)' : 'OK'));
for (const { arm, a } of res) {
  const mine = a.asMain + a.asPartner;
  const wide = mine + a.comboWhileIAmSetter;
  console.log(
    `  ${arm.label.padEnd(13)} 甲 ${String(mine).padStart(4)} 次（${(mine / SETS).toFixed(2)}/局）${flagOf(mine).padEnd(16)}`
    + ` 乙 ${String(wide).padStart(4)} 次（${(wide / SETS).toFixed(2)}/局）${flagOf(wide)}`,
  );
}

console.log('\n════ ③ 誘餌到底是不是恆為 MB（驗證提案的前提）════');
for (const { arm, a } of res) {
  console.log(`  ${arm.label.padEnd(13)} partnerId 的 currentRole 分佈： ${mapStr(a.partnerRole)}`);
}

console.log('\n════ ④ 組合型別分佈（全隊 / 玩家有份的那些）════');
for (const { arm, a } of res) {
  console.log(`  ${arm.label.padEnd(13)} 全隊：${mapStr(a.byType).padEnd(34)} 玩家有份：${mapStr(a.myByType)}`);
}

console.log('\n════ ⑤ 站位脈絡（為什麼某些格會稀薄）════');
console.log('位置          在場波數 其中前排 前排率   玩家=本波二傳 二傳時同隊有組合');
for (const { arm, a } of res) {
  console.log(
    `${arm.label.padEnd(13)}${String(a.onCourt).padStart(8)}${String(a.onCourtFront).padStart(9)}`
    + `  ${pct(a.onCourtFront, a.onCourt).padStart(7)}`
    + `${String(a.setterIsMe).padStart(14)}${String(a.comboWhileIAmSetter).padStart(16)}`,
  );
}

console.log('\n════ ⑥ 比分自檢（治具沒壞的證據：比分要是競爭性的）════');
for (const { arm, a } of res) {
  console.log(`  ${arm.label.padEnd(13)} 累計 ${a.ptsFor}:${a.ptsAgainst}（${SETS} 局）`);
}
