// Phase 4 W3 — 快速比賽選位置（07-27 Sawmah 拍板：位置遊樂場；生涯轉位 gate 不動）
// buildQuickSetup 純函式：最小變換建隊、L 走 liberos 通道、未知/預設角色零擾動；
// resolveMatchConfig 整合：quickRole/?role= 只作用於快速比賽、生涯場忽略。
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuickSetup, resolveMatchConfig } from '../src/app/matchConfig.js';
import { createGame } from '../src/sim/game.js';

const params = (obj = {}) => ({ get: (k) => obj[k] ?? null });

test('buildQuickSetup：null/outside/未知角色＝null（照舊預設建隊零擾動）', () => {
  assert.equal(buildQuickSetup(null), null);
  assert.equal(buildQuickSetup('outside'), null);
  assert.equal(buildQuickSetup('coach'), null);
});

test('S/MB/OPP：玩家（A2）與目標槽互換、被換者改打 OH、六人無重複、B 隊不動', () => {
  for (const [role, idx] of [['setter', 0], ['middle', 2], ['opposite', 3]]) {
    const q = buildQuickSetup(role);
    assert.equal(q.liberoA, null);
    const me = q.teams.A[idx];
    assert.equal(me.id, 'A2', `${role}：玩家應在槽 ${idx}`);
    assert.equal(me.currentRole, role);
    const displaced = q.teams.A[1];
    assert.equal(displaced.currentRole, 'outside', `${role}：被換者改打 OH`);
    assert.equal(new Set(q.teams.A.map((p) => p.id)).size, 6);
    assert.deepEqual(q.teams.B.map((p) => p.id), ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
    // sim 可直接吃（開賽不炸）
    const g = createGame({ seed: 3, teams: q.teams });
    assert.ok(g.players.A2.currentRole === role);
  }
});

test('L：玩家不入先發（A8 頂上）、liberoA=玩家（防守專才屬性、異色通道）', () => {
  const q = buildQuickSetup('libero');
  assert.ok(!q.teams.A.some((p) => p.id === 'A2'), '玩家不得在先發');
  assert.equal(q.teams.A[1].id, 'A8');
  assert.equal(q.liberoA.id, 'A2');
  assert.equal(q.liberoA.currentRole, 'libero');
  assert.ok(q.liberoA.attributes.reaction > q.teams.A[1].attributes.reaction, '防守專才');
  const g = createGame({ seed: 3, teams: q.teams, liberos: { A: q.liberoA } });
  assert.equal(g.players.A2.currentRole, 'libero');
});

test('resolveMatchConfig 整合：quickRole 進 gameOptions；?role= 同效；生涯場忽略', () => {
  const cfg = resolveMatchConfig({ params: params(), randomSeed: 7, quickRole: 'setter' });
  assert.equal(cfg.gameOptions.teams.A[0].id, 'A2');
  assert.equal(cfg.gameOptions.liberos.A.id, 'AL'); // 非 L＝預設自由人
  const cfgUrl = resolveMatchConfig({ params: params({ role: 'libero' }), randomSeed: 7 });
  assert.equal(cfgUrl.gameOptions.liberos.A.id, 'A2'); // L＝玩家穿異色
  assert.ok(!cfgUrl.gameOptions.teams.A.some((p) => p.id === 'A2'));
  // 預設（無 role）＝不帶 teams（createGame 內建預設，行為與 W3 前逐位一致）
  const cfgPlain = resolveMatchConfig({ params: params(), randomSeed: 7 });
  assert.equal(cfgPlain.gameOptions.teams, undefined);
});
