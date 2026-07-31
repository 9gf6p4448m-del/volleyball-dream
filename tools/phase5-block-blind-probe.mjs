// Phase 5 §十 階段二 v3 —— **冷讀 §丁-2 查核：blind 退路計畫到底會不會起跳？**
//
// ★ 為什麼要這支 ★
// v3 裁定書冷讀 §丁-2 問：「§2.1 退路建起的『無鎖定』計畫，其**起跳觸發吃的是誰的下降沿**？」
// 並要求：「實作時若發現此處語意未定，**回報，不要自行選一個**」（§四 停下回報條件 5）。
//
// 讀碼的事實（`src/sim/ai.js`）：
//   1083-1086  blind 計畫建起時 `seen: false`
//   1149-1153  起跳判定與非 blind **完全共用**：`touches>=2 ∧ c.seen ∧ liveRead==null`
//   1157       `blind` 旗標只管「不得改瞄」，**不影響起跳判定**
// ⇒ blind 計畫要起跳，仍然需要 `blockCommitRead` **先看到有人在往網跑**（把 seen 翻真）。
//   但 blind 計畫被建起來的前提，正是「截止前一次都沒讀到人」（`aimX == null`）。
//   註解自稱「唯一的行為差異是**這一波會起跳**」（ai.js:1078）——這句話沒有任何程式碼保證。
//
// ★ 量什麼（B 隊 commit 臂；blind 只可能出現在 commit，見 ai.js:1082）★
//   blindRate       這一波建起的是 blind 計畫的比例
//   blind→jumped    blind 計畫最後有沒有寫下 jumpTick（＝真的起跳了）
//   normal→jumped   非 blind 計畫的同一個比例（對照組）
//   jumpLag         起跳 tick − 二傳觸球 tick（p50）；過網 tick 一併印，看時序合不合理
//
// 機械判準：`blind→jumped` 若明顯低於 100%，代表 ai.js:1078 的承諾在該比例的攻擊上
//   **不成立**（建了計畫但整波仍不起跳）⇒ 冷讀 §丁-2 的「語意未定」是實質缺口，不只是文字問題。
//
// 跑法：node tools/phase5-block-blind-probe.mjs [局數=8]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

const SETS = Number(process.argv[2] ?? 8);
const GROUP = { quick: 'quick', left: 'wing', right: 'wing', pipe: 'back', dball: 'back' };

const rows = [];
for (let s = 1; s <= SETS; s += 1) {
  const game = createGame({ seed: s * 101, setTarget: 25, aiProfiles: { B: { blockPersona: 'commit' } } });
  const ai = createAiState();
  let cur = null;
  let guard = 0;
  while (game.phase !== 'set_over' && guard < 400000) {
    guard += 1;
    const zBefore = game.ball.z;
    const ev = stepGame(game, aiCollectIntents(game, ai, []));
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.kind === 'set' && e.team === 'A' && e.touches === 2) {
        cur = {
          setTick: game.tick, kind: null, created: false, blind: null,
          jumpTick: null, spikeTick: null, crossTick: null,
        };
      }
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A' && cur && !cur.spikeTick) {
        cur.spikeTick = game.tick;
        cur.kind = ai.attackKind;
      }
      if (e.type === 'DEAD_BALL' && cur) {
        if (cur.kind && cur.created) rows.push(cur);
        cur = null;
      }
    }
    if (!cur) continue;
    if (cur.spikeTick != null && cur.crossTick == null && zBefore > 0 && game.ball.z <= 0) {
      cur.crossTick = game.tick;
    }
    // 攔網分工卷 step1（07-31）：計畫拆成 per-blocker，`latest`＝最近步進的那一份
    //（本步三人逐 tick 同步 ⇒ 與拆分前的共用物件逐值相同）
    const c = ai.blockPlan?.team === 'B' ? ai.blockPlan.latest : null;
    if (c) {
      if (!cur.created) { cur.created = true; cur.blind = !!c.blind; }
      if (c.jumpTick != null && cur.jumpTick == null) cur.jumpTick = c.jumpTick;
    }
  }
}

const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '－');
const f = (v) => (Number.isFinite(v) ? String(v) : '－');

console.log(`=== 冷讀 §丁-2 查核：blind 退路計畫的起跳觸發（${SETS} 局，commit 臂）===`);
console.log(`全部有建起計畫的攻擊 n=${rows.length}`
  + `　其中 blind ${pct(rows.filter((r) => r.blind).length, rows.length)}\n`);

for (const g of ['quick', 'wing', 'back']) {
  const rs = rows.filter((r) => GROUP[r.kind] === g);
  if (!rs.length) continue;
  const label = { quick: '快攻', wing: '兩翼', back: '後排' }[g];
  console.log(`-- 面對 ${label}（n=${rs.length}）--`);
  for (const [name, set] of [['blind ', rs.filter((r) => r.blind)], ['normal', rs.filter((r) => !r.blind)]]) {
    if (!set.length) { console.log(`   ${name} 無樣本`); continue; }
    const jumped = set.filter((r) => r.jumpTick != null);
    console.log(`   ${name} n=${String(set.length).padStart(4)}`
      + `  佔比 ${pct(set.length, rs.length).padStart(6)}`
      + `  ｜**走到起跳 ${pct(jumped.length, set.length).padStart(6)}**`
      + `  ｜起跳 p50 = set+${f(med(jumped.map((r) => r.jumpTick - r.setTick)))}`
      + `  過網 p50 = set+${f(med(set.filter((r) => r.crossTick != null).map((r) => r.crossTick - r.setTick)))}`);
  }
  console.log('');
}
console.log('判準：blind 那一列的「走到起跳」若明顯低於 100%，'
  + '代表 ai.js:1078「這一波會起跳」的承諾對該比例的攻擊不成立。');
