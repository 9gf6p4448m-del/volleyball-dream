// 練習賽卷 — 純函式地基測試（紅白拆隊／科目生成／賽末判定／存檔回退）
//
// ★ 本檔的反向對照原則 ★（`02 §6.1` 條 1 的反面）：每個科目都要有一組「剛好達標」
//   與一組「差一次」的合成事件流。只驗綠燈證明不了判定式真的在數東西——一個
//   `return 999` 的假判定器也會全綠。
//
// ★ 台詞是規格的機械守衛 ★：候選池每一項的 `label` 必須含 `target` 的數字，
//   且每一項都要被判定測試覆蓋到（漏測＝喊得出來但沒人驗過判不判得到）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRILL_DEFS, DRILLS_MIN, DRILLS_MAX, TUTORIAL_DRILL_IDS,
  drillsFor, tutorialDrills, drillGainFor, drillDefOf,
  settlePractice, normalizePractice, practiceRecordOf,
  splitSquads,
} from '../src/career/practiceMatch.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { checkRoleStructure, validateLineup } from '../src/career/lineup.js';

const PID = 'A2';
const TEAM = 'A';

// ════════════════════════════════════════════════════════════
// 合成事件流小工具（形狀逐欄對照 src/sim/game.js 的 ev.push）
// ════════════════════════════════════════════════════════════
const touch = (o) => ({ type: 'TOUCH', tick: 0, team: TEAM, ...o });
const score = (team = TEAM) => ({ type: 'SCORE', tick: 0, team, score: { A: 1, B: 0 } });
const blockTouch = (playerId = PID) => ({ type: 'BLOCK_TOUCH', tick: 0, team: TEAM, playerId });

// n 次「玩家扣球得分」（power > TIP_POWER ⇒ 記 kills）
const kills = (n) => Array.from({ length: n }, () => [
  touch({ playerId: PID, kind: 'spike', touches: 3, power: 0.9 }), score(),
]).flat();
// n 次「玩家吊球得分」（power ≤ 0.45 ⇒ 記 tipKills）
const tips = (n) => Array.from({ length: n }, () => [
  touch({ playerId: PID, kind: 'spike', touches: 3, power: 0.3 }), score(),
]).flat();
// n 次「玩家舉球 → 隊友扣球 → 我方得分」＝助攻
const assists = (n) => Array.from({ length: n }, () => [
  touch({ playerId: PID, kind: 'set', touches: 2 }),
  touch({ playerId: 'A5', kind: 'spike', touches: 3, power: 0.9 }),
  score(),
]).flat();
const digs = (n) => Array.from({ length: n }, () => touch({
  playerId: PID, kind: 'receive', touches: 1, power: 0.8,
}));
const dives = (n) => Array.from({ length: n }, () => touch({
  playerId: PID, kind: 'dive', touches: 1, power: 0.6,
}));
const blocks = (n) => Array.from({ length: n }, () => blockTouch());
const serves = (n) => Array.from({ length: n }, () => (
  { type: 'SERVE', tick: 0, team: TEAM, playerId: PID }));
// n 次我方三擊組織（接—舉—攻）；每次以 DEAD_BALL 收尾重置擊數
const threeTouch = (n) => Array.from({ length: n }, () => [
  touch({ playerId: 'AL', kind: 'receive', touches: 1, power: 0.8 }),
  touch({ playerId: 'A1', kind: 'set', touches: 2 }),
  touch({ playerId: 'A5', kind: 'spike', touches: 3, power: 0.9 }),
  { type: 'DEAD_BALL', tick: 0, reason: 'x' },
]).flat();

// ════════════════════════════════════════════════════════════
// 一、判定：每個科目一紅一綠（綠＝剛好達標、紅＝差一次）
// ════════════════════════════════════════════════════════════
// 表的鍵＝科目 id；值＝(n) => 事件流，n 為「要做到幾次」。
// 綠＝f(target)、紅＝f(target − 1) ⇒ 差一次就是差一次，不是差一個數量級。
const STREAM_OF = {
  tip: tips,
  dive: dives,
  'basic-setter': assists,
  'basic-middle': blocks,
  'basic-libero': digs,
  'basic-attack': kills,
  points: kills,
  'tut-receive': digs,
  'tut-handle': (n) => Array.from({ length: n }, () => touch({
    playerId: PID, kind: 'set', touches: 2,
  })),
  'tut-block': blocks,
  'tut-serve': serves,
  'tut-three': threeTouch,
  'tut-point': kills,
};

test('★守衛★ 候選池每一項都被判定測試覆蓋（漏測＝喊得出來卻沒驗過判不判得到）', () => {
  assert.deepEqual(
    Object.keys(DRILL_DEFS).sort(),
    Object.keys(STREAM_OF).sort(),
    '新增科目就要補一組紅綠對照，不得只加定義',
  );
});

test('★守衛★ 每個科目的 label 都含目標數字（台詞是規格）', () => {
  for (const [id, def] of Object.entries(DRILL_DEFS)) {
    assert.equal(def.id, id, `${id}：定義表的鍵與 id 必須一致`);
    assert.ok(Number.isInteger(def.target) && def.target > 0, `${id}：target 要是正整數`);
    assert.match(def.label, new RegExp(String(def.target)),
      `${id}：喊「${def.label}」卻沒說出目標數字 ${def.target}`);
    assert.equal(typeof def.count, 'function', `${id}：label 與判定必須同源`);
  }
});

for (const [id, def] of Object.entries(DRILL_DEFS)) {
  test(`判定「${def.label}」：剛好達標＝綠、差一次＝紅`, () => {
    const gen = STREAM_OF[id];
    const green = drillGainFor(gen(def.target), PID, TEAM, def);
    assert.ok(green >= def.target, `${id}：做滿 ${def.target} 次卻沒判到（實得 ${green}）`);
    const red = drillGainFor(gen(def.target - 1), PID, TEAM, def);
    assert.ok(red < def.target,
      `★反向★ ${id}：只做了 ${def.target - 1} 次也判達標（實得 ${red}）＝判定式沒在數東西`);
  });
}

test('drillGainFor：未知科目一律回 0（呼叫端手捏的科目不得繞過定義表）', () => {
  assert.equal(drillGainFor(kills(9), PID, TEAM, { id: '不存在的科目' }), 0);
  assert.equal(drillGainFor(kills(9), PID, TEAM, null), 0);
  assert.equal(drillGainFor(kills(9), PID, TEAM, { id: 'basic-attack', target: 0, count: () => 99 }), 9,
    '自帶的 count 不得生效（99 是它的答案，9 才是定義表數出來的）——判定一律回查定義表');
  assert.equal(drillDefOf('不存在的科目'), null);
});

test('★反向★ 事件流是對手做的／別人做的都不算', () => {
  const other = [touch({ playerId: 'A5', kind: 'dive', touches: 1 }),
    touch({ playerId: 'A5', kind: 'dive', touches: 1 })];
  assert.equal(drillGainFor(other, PID, TEAM, DRILL_DEFS.dive), 0, '別人魚躍不記在我頭上');
  const oppTeam = dives(2).map((e) => ({ ...e, team: 'B' }));
  assert.equal(drillGainFor(oppTeam, PID, TEAM, DRILL_DEFS.dive), 0, '對面的事件不記');
});

// ════════════════════════════════════════════════════════════
// 二、科目生成
// ════════════════════════════════════════════════════════════
const playerAt = (over = {}) => ({ id: PID, currentRole: 'outside', techniques: {}, ...over });

test('學了吊球 ⇒ 科目含吊球；學了魚躍 ⇒ 科目含魚躍', () => {
  const one = drillsFor({ player: playerAt(), seasonIndex: 2, techniques: ['tip'] });
  assert.ok(one.some((d) => d.id === 'tip'), '這屆學的東西要出現在科目裡');
  const two = drillsFor({ player: playerAt(), seasonIndex: 2, techniques: { tip: 1, dive: 1 } });
  assert.deepEqual(two.map((d) => d.id).slice(0, 2), ['tip', 'dive'], '順序決定論');
  const none = drillsFor({ player: playerAt(), seasonIndex: 2, techniques: { tip: 0 } });
  assert.ok(!none.some((d) => d.id === 'tip'), '★反向★ 沒學會就不得喊');
});

test('無素材的技術不生成科目（跳發／飄浮／pipe／叫戰術）', () => {
  const ds = drillsFor({
    player: playerAt(),
    seasonIndex: 2,
    techniques: ['jumpServe', 'floatServe', 'pipe', 'callPlay'],
  });
  for (const d of ds) {
    assert.ok(!/跳發|飄浮|後排|戰術/.test(d.label),
      `喊了判不到的科目：「${d.label}」——事件流沒有素材（見 practiceMatch.js 檔頭）`);
  }
});

test('轉位後首次集訓 ⇒ 該位置的基本科目', () => {
  const cases = {
    setter: 'basic-setter',
    middle: 'basic-middle',
    libero: 'basic-libero',
    outside: 'basic-attack',
    opposite: 'basic-attack',
  };
  for (const [role, drillId] of Object.entries(cases)) {
    const ds = drillsFor({
      player: playerAt({ currentRole: role }),
      seasonIndex: 2,
      techniques: ['tip'],
      flags: { roleChanged: true },
    });
    assert.ok(ds.some((d) => d.id === drillId), `${role} 轉位後要有 ${drillId}`);
  }
});

test('保底：沒有新東西也不得空手（2–3 個科目，且每個都判得到）', () => {
  for (const role of ['setter', 'middle', 'libero', 'outside', 'opposite']) {
    const ds = drillsFor({ player: playerAt({ currentRole: role }), seasonIndex: 3 });
    assert.ok(ds.length >= DRILLS_MIN && ds.length <= DRILLS_MAX,
      `${role}：科目數 ${ds.length} 不在 ${DRILLS_MIN}–${DRILLS_MAX}`);
    for (const d of ds) assert.equal(DRILL_DEFS[d.id], d, '回傳的必須是定義表裡那個物件本身');
  }
});

test('第一屆（seasonIndex ≤ 1）＝教學局；六步固定且都判得到', () => {
  assert.deepEqual(
    drillsFor({ player: playerAt(), seasonIndex: 1, techniques: ['tip'] }).map((d) => d.id),
    TUTORIAL_DRILL_IDS,
    '第一屆開場走教學局科目集（同一機制兩個掛點）',
  );
  const tut = tutorialDrills();
  assert.equal(tut.length, 6, '教學局固定六步');
  for (const d of tut) assert.ok(d && typeof d.count === 'function');
});

// ════════════════════════════════════════════════════════════
// 三、結算
// ════════════════════════════════════════════════════════════
test('settlePractice：逐項結果＋完成數＋全完成才 unlockControl', () => {
  const drills = [DRILL_DEFS.tip, DRILL_DEFS.dive];
  const half = settlePractice({
    events: [...tips(1), ...dives(1)], playerId: PID, myTeam: TEAM, drills,
  });
  assert.deepEqual(half.results.map((r) => [r.id, r.achieved, r.count, r.target]), [
    ['tip', true, 1, 1],
    ['dive', false, 1, 2],
  ]);
  assert.equal(half.completedCount, 1);
  assert.equal(half.unlockControl, false, '★反向★ 差一項就不得開控球格');

  const full = settlePractice({
    events: [...tips(1), ...dives(2)], playerId: PID, myTeam: TEAM, drills,
  });
  assert.equal(full.completedCount, 2);
  assert.equal(full.unlockControl, true);
  for (const r of full.results) {
    assert.equal(r.label, DRILL_DEFS[r.id].label, '結果帶的文案要與定義表同源');
  }
});

test('settlePractice：空清單不解鎖；未知科目恆不達標', () => {
  assert.equal(settlePractice({ events: [], playerId: PID, myTeam: TEAM, drills: [] })
    .unlockControl, false);
  const bogus = settlePractice({
    events: kills(9), playerId: PID, myTeam: TEAM, drills: [{ id: 'nope', target: 0 }],
  });
  assert.equal(bogus.results[0].achieved, false, '認不得的科目不得靜默算過');
  assert.equal(bogus.unlockControl, false);
});

test('normalizePractice：缺鍵逐鍵回退，舊存檔零遷移', () => {
  assert.deepEqual(normalizePractice(undefined),
    { seasonIndex: 0, completed: 0, total: 0, unlockControl: false });
  assert.deepEqual(normalizePractice({ completed: 2 }),
    { seasonIndex: 0, completed: 2, total: 0, unlockControl: false });
  assert.deepEqual(normalizePractice({ seasonIndex: 2, completed: 3, total: 3, unlockControl: 1 }),
    { seasonIndex: 2, completed: 3, total: 3, unlockControl: true });
  const rec = practiceRecordOf(2, settlePractice({
    events: [...tips(1), ...dives(2)], playerId: PID, myTeam: TEAM,
    drills: [DRILL_DEFS.tip, DRILL_DEFS.dive],
  }));
  assert.deepEqual(rec, { seasonIndex: 2, completed: 2, total: 2, unlockControl: true });
});

// ════════════════════════════════════════════════════════════
// 四、紅白拆隊
// ════════════════════════════════════════════════════════════
const extraMember = (id, role, n) => ({
  id,
  name: `補${n}`,
  fullName: `測試員${n}`,
  origin: 'starter',
  role,
  height: 1.85,
  attributes: {
    jump: 60, power: 60, reaction: 60, stamina: 60, speed: 60, control: 60, serve: 60, block: 60,
  },
  growth: { grade: 2, xp: {}, log: [] },
  dna: { teamId: 'A', style: 'balanced', tag: 'x' },
});

// 現況創隊名冊＝7 人（含自由人）＋玩家；再往上疊到 9／11 人（capacity 12 滿編）
const ROSTERS = {
  '7 人（創隊名冊）': buildStarterMembers(),
  '9 人': [...buildStarterMembers(),
    extraMember('X1', 'middle', 1), extraMember('X2', 'opposite', 2)],
  '11 人（滿編）': [...buildStarterMembers(),
    extraMember('X1', 'middle', 1), extraMember('X2', 'opposite', 2),
    extraMember('X3', 'setter', 3), extraMember('X4', 'outside', 4),
    extraMember('X5', 'libero', 5)],
};

for (const [label, members] of Object.entries(ROSTERS)) {
  test(`拆隊（${label}）：兩隊都排得出合法先發、玩家在紅隊、臨時球員標記正確`, () => {
    const { red, white } = splitSquads({ members, playerId: PID, playerRole: 'outside', seed: 7 });
    for (const squad of [red, white]) {
      assert.ok(squad.legal, `${squad.label} 陣容非法：${squad.errors.join('／')}`);
      assert.equal(squad.lineup.starters.length, 6, `${squad.label} 先發要 6 人`);
      // 不只信 squad.legal——直接對兩支正式驗證器再問一次
      assert.ok(validateLineup(squad.lineup, squad.members, squad.anchorId, squad.anchorRole).valid);
      assert.ok(checkRoleStructure(
        squad.lineup.starters, squad.members, squad.anchorId, squad.anchorRole,
      ).legal, `${squad.label} 對位結構不合 5-1`);
      assert.ok(squad.lineup.libero, `${squad.label} 要有自由人歸屬`);
      assert.ok(!squad.lineup.starters.includes(squad.lineup.libero), '自由人不得排進先發');
      for (const f of squad.fillIns) {
        assert.equal(f.practice, true, '臨時球員必須標記 practice:true（賽後不入名冊）');
        assert.equal(f.origin, 'practice');
      }
    }
    assert.equal(red.anchorId, PID, '玩家恆在紅隊');
    assert.ok(red.lineup.starters.includes(PID), '玩家必在紅隊先發');
    assert.ok(!white.members.some((m) => m.id === PID), '玩家不得同時在白隊');
    assert.notEqual(white.anchorId, PID);

    // 兩隊人不重疊、id 全域唯一（臨時球員重新編號的理由就是這條）
    const ids = [red.anchorId, ...red.members.map((m) => m.id),
      white.anchorId, ...white.members.map((m) => m.id)];
    assert.equal(new Set(ids).size, ids.length, `id 撞號：${ids.join(',')}`);
  });
}

test('拆隊：決定論（同 seed 同名冊 ⇒ 逐值相同；不同 seed 只換臨時球員）', () => {
  const args = { members: buildStarterMembers(), playerId: PID, playerRole: 'outside', seed: 7 };
  const a = splitSquads(args);
  const b = splitSquads({ ...args });
  assert.deepEqual(a, b, '同種子同名冊必須逐值一致');
  const c = splitSquads({ ...args, seed: 99 });
  assert.deepEqual(
    c.red.members.filter((m) => !m.practice).map((m) => m.id),
    a.red.members.filter((m) => !m.practice).map((m) => m.id),
    '拆法本身零 RNG——換種子不得改變真人的分隊',
  );
});

test('拆隊：玩家轉位後也拆得出合法兩隊（紅隊錨＝玩家的新位置）', () => {
  for (const role of ['setter', 'middle', 'opposite', 'libero']) {
    const { red, white } = splitSquads({
      members: buildStarterMembers(), playerId: PID, playerRole: role, seed: 3,
    });
    assert.equal(red.anchorRole, role);
    assert.ok(red.legal, `玩家=${role} 紅隊非法：${red.errors.join('／')}`);
    assert.ok(white.legal, `玩家=${role} 白隊非法：${white.errors.join('／')}`);
    if (role === 'libero') {
      assert.equal(red.lineup.libero, PID, '玩家是自由人時異色球衣是他的');
    } else {
      assert.ok(red.lineup.starters.includes(PID));
    }
  }
});
