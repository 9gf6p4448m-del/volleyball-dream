// Phase 4 W3 — OPP 微調（工單 §5）：後排 D 球 rowFactor 0.65（高於 OH pipe 0.5）、
// 共用 OH 攻擊決策架構（玩家=OPP 的攻擊時刻由 claim 判定、不看角色——結構驗證）、
// 接發豁免照現況（S/前排 MB 不接的規則不因玩家轉位改變——由既有 formation 測試背書）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { attackPointsOf } from '../src/sim/ai.js';
import { createCareer, createCareerPlayer, careerTeams } from '../src/career/careerState.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { ensureStarterRoster } from '../src/career/roster.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

test('D 球權重：全局維持 0.5 保 175 錨點（0.65 實測出帶——treatment 見 ai.js 註解）', () => {
  const game = createGame({ seed: 1 });
  // 預設輪轉：後排＝index 0/4/5。B 隊後排含 OH(B5)與 MB(B6)、A 隊同構——
  // 轉半輪讓 OPP 落後排：直接查兩隊全輪轉的池組成
  for (const team of ['A', 'B']) {
    // 旋轉輪轉序模擬 6 輪：每輪檢查後排點的 rowFactor
    const rot = game.match.rotations[team];
    for (let k = 0; k < 6; k += 1) {
      game.match.rotations[team] = [...rot.slice(k), ...rot.slice(0, k)];
      const pts = attackPointsOf(game, team, null, 'perfect');
      for (const pt of pts) {
        if (pt.kind === 'dball') assert.equal(pt.rowFactor, 0.5, `${team} D球 rowFactor`);
        if (pt.kind === 'pipe') assert.equal(pt.rowFactor, 0.5, `${team} pipe rowFactor`);
        if (['left', 'quick', 'right'].includes(pt.kind)) assert.equal(pt.rowFactor, 1);
      }
    }
    game.match.rotations[team] = rot;
  }
});

test('玩家=OPP 共用 OH 攻擊架構：careerTeams 建隊後玩家在攻擊池、kind 隨前後排正確', () => {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed: 11, playerName: '測' }));
  store.savePlayer(createCareerPlayer('測'));
  ensureStarterRoster(store);
  store.applyPositionChange('opposite');
  const player = store.loadPlayer();
  const teams = careerTeams(player, null, store.loadRoster().members, store.loadLineup());
  const game = createGame({ seed: 11, teams });
  const rot = game.match.rotations.A;
  // 生涯新人 pipe=0：後排不進池（既有誠實閘門——D 球同受後排攻擊技術閘）
  game.match.rotations.A = [...rot.slice(3), ...rot.slice(0, 3)]; // 玩家轉到後排
  assert.equal(
    attackPointsOf(game, 'A', null, 'perfect').filter((p) => p.pid === 'A2').length,
    0, '未解鎖後排攻擊＝後排不進池',
  );
  // 解鎖後排攻擊 → 全六輪：前排＝right、後排＝dball（一傳品質 perfect 全池）
  game.players.A2.techniques.pipe = 1;
  for (let k = 0; k < 6; k += 1) {
    game.match.rotations.A = [...rot.slice(k), ...rot.slice(0, k)];
    const mine = attackPointsOf(game, 'A', null, 'perfect').filter((p) => p.pid === 'A2');
    assert.equal(mine.length, 1, `第 ${k} 輪玩家應在攻擊池`);
    const idx = game.match.rotations.A.indexOf('A2');
    const front = [1, 2, 3].includes(idx);
    assert.equal(mine[0].kind, front ? 'right' : 'dball', `第 ${k} 輪 kind`);
  }
});
