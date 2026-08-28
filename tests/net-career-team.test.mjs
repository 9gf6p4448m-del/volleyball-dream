// 多人連線卷 批5 —— 生涯隊伍上線的 headless 驗收（A5-1／A5-2）
// 凍結檔＝docs/kickoffs/acceptance-multiplayer-20260828.md
//
// fixture＝真實引擎產得出的值（02 §6.1 第 3 條）：createCareerPlayer＋buildStarterMembers
// ——與 tests/lineup.test.mjs 同一組建材，不手捏假球員。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCareerPlayer, careerTeams } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { exportNetTeam, netTeamProblem, rebuildSide, TEAM_PAYLOAD_V } from '../src/career/netExport.js';
import { applyNetCareerTeams, buildNetSetup } from '../src/app/matchConfig.js';
import { createGame } from '../src/sim/game.js';

function fixture() {
  const player = createCareerPlayer('小夢', { seed: 7 });
  const members = buildStarterMembers();
  return { player, members, lineup: null };
}

test('A5-1 round-trip：匯出→JSON→重建，先發 6 人逐欄位與 careerTeams 原生建隊一致', () => {
  const fx = fixture();
  const payload = JSON.parse(JSON.stringify(exportNetTeam(fx))); // 走一遍線上序列化
  assert.equal(netTeamProblem(payload), null, '自己匯出的 payload 必須過自己的驗證');
  assert.equal(payload.v, TEAM_PAYLOAD_V);
  assert.equal(payload.starters.length, 6);
  // 重建到 B 隊（客機視角：id A→B 前綴）
  const side = rebuildSide(payload, 'B');
  const native = careerTeams(fx.player, null, fx.members, fx.lineup).A;
  for (let i = 0; i < 6; i += 1) {
    const re = side.starters[i];
    const na = native[i];
    assert.equal(re.id, 'B' + na.id.slice(1), `槽 ${i} id 前綴換錯`);
    assert.equal(re.teamId, 'B');
    assert.equal(re.name, na.name);
    assert.equal(re.currentRole, na.currentRole);
    assert.equal(re.height.current, na.height.current, `槽 ${i} 身高 round-trip 掉值`);
    assert.deepEqual(re.trust, na.trust, `槽 ${i} trust（含地板）round-trip 掉值`);
    assert.deepEqual(re.attributes, na.attributes, `槽 ${i} 屬性 round-trip 掉值`);
  }
  // 主角（非 L）＝starters 內；libero 帶名冊 L 成員資料
  assert.ok(side.starters.some((p) => p.id === 'B2'));
});

test('A5-1b 兩端重建決定論：同 payload 兩次 rebuildSide＋createGame 逐值相同', () => {
  const payload = JSON.parse(JSON.stringify(exportNetTeam(fixture())));
  const s1 = applyNetCareerTeams(buildNetSetup('outside', 'outside'), { A: null, B: payload });
  const s2 = applyNetCareerTeams(buildNetSetup('outside', 'outside'), { A: null, B: payload });
  const g1 = createGame({ seed: 9, setTarget: 25, teams: s1.teams });
  const g2 = createGame({ seed: 9, setTarget: 25, teams: s2.teams });
  assert.deepEqual(JSON.parse(JSON.stringify(g1)), JSON.parse(JSON.stringify(g2)));
  // B 隊真的被生涯隊伍覆蓋（名字來自名冊，不是預設 B 隊）
  const names = Object.values(g1.players).filter((p) => p.teamId === 'B').map((p) => p.name);
  const memberNames = buildStarterMembers().map((m) => m.name);
  assert.ok(names.some((n) => memberNames.includes(n)), `B 隊沒吃到生涯名冊：${names}`);
});

test('A5-2 版本／形狀不符＝明確拒絕（不靜默降級）', () => {
  const good = JSON.parse(JSON.stringify(exportNetTeam(fixture())));
  assert.match(netTeamProblem({ ...good, v: TEAM_PAYLOAD_V + 1 }) ?? '', /版本不符/);
  assert.match(netTeamProblem({ ...good, starters: good.starters.slice(0, 5) }) ?? '', /6 人/);
  const badHeight = JSON.parse(JSON.stringify(good));
  badHeight.starters[0].height = 3.5;
  assert.match(netTeamProblem(badHeight) ?? '', /身高不合法/);
  const badAttr = JSON.parse(JSON.stringify(good));
  badAttr.starters[2].attributes.jump = 'hax';
  assert.match(netTeamProblem(badAttr) ?? '', /屬性 jump 不合法/);
  const badRole = JSON.parse(JSON.stringify(good));
  badRole.starters[1].currentRole = 'coach';
  assert.match(netTeamProblem(badRole) ?? '', /位置不合法/);
  assert.equal(netTeamProblem(null), null, '沒帶隊伍＝標準隊＝合法');
});

test('A5 玩家=自由人：payload.libero.isPlayer 且先發不含主角、重建後自由人歸位', () => {
  const fx = fixture();
  fx.player.currentRole = 'libero';
  const payload = JSON.parse(JSON.stringify(exportNetTeam(fx)));
  assert.equal(netTeamProblem(payload), null);
  assert.equal(payload.libero?.isPlayer, true);
  assert.ok(!payload.starters.some((p) => p.id === 'A2'), '玩家=L 不入先發');
  const side = rebuildSide(payload, 'B');
  assert.equal(side.libero?.id, 'B2');
  assert.equal(side.libero?.currentRole, 'libero');
  assert.equal(side.starters.length, 6);
});
