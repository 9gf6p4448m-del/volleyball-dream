// Phase 4 W2 — 身高創角＋三年成長曲線（heightGrowth.js＋careerStore 揭曉鏈）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampHeightCm, growthBandOf, buildHeightPlan, initialHeightState, revealHeightForSeason,
  HEIGHT_MIN_CM, HEIGHT_MAX_CM,
} from '../src/career/heightGrowth.js';
import { createCareer, createCareerPlayer, recordResult } from '../src/career/careerState.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { ensureStarterRoster } from '../src/career/roster.js';
import { standingReach, blockReach, spikeReach } from '../src/sim/player.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function endSeason(career) {
  let c = career;
  for (const m of c.schedule) {
    if (m.stage === 'group') c = recordResult(c, { matchId: m.id, won: true, scoreFor: 25, scoreAgainst: 10 });
  }
  const qf = c.schedule.find((m) => m.id === 'national-qf');
  c = recordResult(c, { matchId: qf.id, won: false, scoreFor: 20, scoreAgainst: 25 });
  return c;
}

test('clamp：140/220 通過、超界夾限、垃圾輸入回預設——UI 軟提示不 crash 的資料面', () => {
  assert.deepEqual(clampHeightCm(140), { cm: 140, clamped: false });
  assert.deepEqual(clampHeightCm(220), { cm: 220, clamped: false });
  assert.deepEqual(clampHeightCm(100), { cm: HEIGHT_MIN_CM, clamped: true });
  assert.deepEqual(clampHeightCm(300), { cm: HEIGHT_MAX_CM, clamped: true });
  assert.equal(clampHeightCm('abc').clamped, true);
  assert.equal(clampHeightCm('175.6').cm, 176); // 四捨五入到整數公分
});

test('身高→sim 參數映射（140/175/220 邊界值）：誠實線性、單調遞增、不鉗制', () => {
  const heights = [140, 175, 220];
  const players = heights.map((cm) => createCareerPlayer('測', { heightCm: cm, seed: 7 }));
  for (let i = 0; i < heights.length; i += 1) {
    assert.equal(players[i].height.current, heights[i] / 100);
    // 站立摸高＝height×1.31（誠實映射，極端值不美化）
    assert.ok(Math.abs(standingReach(players[i]) - (heights[i] / 100) * 1.31) < 1e-9);
  }
  // 單調：越高攔網觸及/扣球點越高
  assert.ok(blockReach(players[0]) < blockReach(players[1]));
  assert.ok(blockReach(players[1]) < blockReach(players[2]));
  assert.ok(spikeReach(players[0]) < spikeReach(players[1]));
  assert.ok(spikeReach(players[1]) < spikeReach(players[2]));
});

test('幅度帶不變式：全範圍起點×多種子——總成長落拍板區間、第一次成長 ≥1、前多後少', () => {
  for (let cm = HEIGHT_MIN_CM; cm <= HEIGHT_MAX_CM; cm += 1) {
    for (const seed of [1, 42, 987654321, 31337]) {
      const plan = buildHeightPlan({ seed, heightCm: cm });
      assert.equal(plan.length, 3);
      assert.equal(plan[0], cm);
      const total = plan[2] - plan[0];
      const s1 = plan[1] - plan[0];
      const s2 = plan[2] - plan[1];
      const band = growthBandOf(cm);
      assert.ok(total >= band.total[0] && total <= band.total[1],
        `${cm}cm seed=${seed} 總成長 ${total} 溢出帶 ${band.total}`);
      assert.ok(s1 >= 1, '下限保底：第一次成長至少 1cm');
      assert.ok(s2 >= 0);
      assert.ok(s1 >= s2, '青春期曲線：第 1→2 屆分配偏多');
    }
  }
  // 帶邊界語意：≤165＝5-12、(165,185)＝3-8、≥185＝1-4
  assert.deepEqual(growthBandOf(165).total, [5, 12]);
  assert.deepEqual(growthBandOf(166).total, [3, 8]);
  assert.deepEqual(growthBandOf(184).total, [3, 8]);
  assert.deepEqual(growthBandOf(185).total, [1, 4]);
});

test('曲線預生成決定論：同 seed 同起點兩次建構逐值 deepEqual；不同 seed 可分歧', () => {
  assert.deepEqual(
    buildHeightPlan({ seed: 12345, heightCm: 172 }),
    buildHeightPlan({ seed: 12345, heightCm: 172 }),
  );
  const spread = new Set(
    [1, 2, 3, 4, 5, 6, 7, 8].map((s) => buildHeightPlan({ seed: s, heightCm: 172 })[2]),
  );
  assert.ok(spread.size > 1, '不同種子應產生不同曲線（帶內取值有變化）');
});

test('揭曉鏈：initialHeightState→逐屆 reveal——current 恆等 timeline 末項、冪等、舊檔容錯', () => {
  const state = initialHeightState({ seed: 99, heightCm: 160 });
  assert.deepEqual(state.timeline, [{ season: 1, height: 1.6 }]);
  assert.equal(state.current, 1.6);
  let p = { id: 'A2', height: state };
  const r2 = revealHeightForSeason(p, 2);
  assert.ok(r2.reveal && r2.reveal.season === 2 && r2.reveal.grewCm >= 1);
  p = r2.player;
  assert.equal(p.height.current, p.height.timeline[1].height);
  // 冪等：同屆再揭曉＝原樣返回
  const again = revealHeightForSeason(p, 2);
  assert.equal(again.player, p);
  assert.equal(again.reveal, null);
  const r3 = revealHeightForSeason(p, 3);
  p = r3.player;
  assert.equal(Math.round(p.height.current * 100), p.height.plan[2]);
  assert.equal(p.height.timeline.length, 3);
  // 超界（第 4 屆）與舊檔（無 plan）容錯：no-op
  assert.equal(revealHeightForSeason(p, 4).reveal, null);
  const legacy = { id: 'A2', height: { current: 1.88, timeline: [] } };
  assert.equal(revealHeightForSeason(legacy, 2).player, legacy);
});

test('store.advanceSeason 揭曉整合：timeline push、current 同步、heightReveal 回傳', () => {
  const store = createCareerStore(fakeStorage());
  const career = createCareer({ seed: 555, playerName: '測' });
  store.saveCareer(endSeason(career));
  store.savePlayer(createCareerPlayer('測', { heightCm: 158, aspiration: 'libero', seed: career.seed }));
  ensureStarterRoster(store);
  const adv = store.advanceSeason();
  assert.ok(adv && adv.ok);
  assert.ok(adv.heightReveal, 'advanceSeason 應回傳 heightReveal 供儀式消費');
  assert.equal(adv.heightReveal.season, 2);
  assert.equal(adv.heightReveal.fromCm, 158);
  const p = store.loadPlayer();
  assert.equal(p.height.timeline.length, 2);
  assert.equal(p.height.current, p.height.timeline[1].height);
  assert.equal(Math.round(p.height.current * 100), adv.heightReveal.toCm);
  assert.equal(p.aspiration, 'libero'); // 志願欄位入檔
});

test('成長決定論：同 seed 快進三屆兩次——timeline 逐值 deepEqual', () => {
  const run = (seed) => {
    const store = createCareerStore(fakeStorage());
    let career = createCareer({ seed, playerName: '測' });
    store.saveCareer(endSeason(career));
    store.savePlayer(createCareerPlayer('測', { heightCm: 163, seed: career.seed }));
    ensureStarterRoster(store);
    assert.ok(store.advanceSeason());
    store.saveCareer(endSeason(store.loadCareer()));
    assert.ok(store.advanceSeason());
    return store.loadPlayer().height;
  };
  const a = run(2026);
  const b = run(2026);
  assert.deepEqual(a.timeline, b.timeline);
  assert.deepEqual(a.plan, b.plan);
  assert.equal(a.timeline.length, 3);
  // 揭曉值恆取自預生成曲線（單一事實源）
  for (let i = 0; i < 3; i += 1) {
    assert.equal(Math.round(a.timeline[i].height * 100), a.plan[i]);
  }
});
