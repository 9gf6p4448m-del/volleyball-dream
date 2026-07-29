// Phase 5 W1 §8「第二擊備援追球者」——驗收 ⑤⑥。
//
// ★ 本檔同時是一份**前提更正**的證據（07-29）：
//   `docs/phase4_6-status.md:223`／`docs/kickoffs/phase5-w1-prompt.md:223` 記載
//   「第二擊沒有 backupId」。實際上 `ai.js` 的備援指派閘是 `r.touches >= 1`
//   ——**第二擊本來就在保護範圍內**（不在範圍內的是 touches===0 的來球，那是刻意的，
//   防守自有責任區仲裁＋dig＋魚躍體系）。
//   4.6 量到的 0.12%（7/5764）是「claim 者沒有自己舉到」，不是「沒人補球」；
//   `tools/d2-probe.mjs` 實測（60 場×2 臂）「沒人補球落地」＝**0.00%**，
//   那些球全部由既有備援接住。故本輪 §8 **不新增 sim 決策面**，改以本檔把
//   ⑤⑥ 兩條行為鎖進回歸測試（沒有測試守著的行為，下一輪就會被改掉）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

// 一傳噴到深角、二傳（A1）被拉到對角＝追不到；球拋高＝備援有時間接力
function rigSecondTouch(ball = { x: 2.5, y: 2.0, z: 7.5, vx: 0, vy: 3.5, vz: 0 }) {
  const g = createGame({ seed: 9 });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'arc', possession: 'A', touches: 1, lastTouchTeam: 'A', lastToucherId: 'A5',
  });
  Object.assign(g.ball, ball);
  g.ball.px = g.ball.x; g.ball.py = g.ball.y; g.ball.pz = g.ball.z;
  g.actors.A1.x = -4; g.actors.A1.z = 0.6; // 二傳在網前左側，離噴點約 7m
  return g;
}

test('§8⑤：二傳真的追不到第二球時，第二追球者接手把球舉起來（不是沒人補球落地）', () => {
  for (const ball of [
    { x: 2.5, y: 2.0, z: 7.5, vx: 0, vy: 3.5, vz: 0 },
    { x: 3.2, y: 2.0, z: 7.8, vx: 0, vy: 4.5, vz: 0 },
    { x: 0, y: 2.0, z: 8.2, vx: 0, vy: 4.5, vz: 0 },
  ]) {
    const g = rigSecondTouch(ball);
    const ai = createAiState();
    aiCollectIntents(g, ai);
    assert.equal(ai.claimId, 'A1', '前置：一傳後主追＝二傳（職責制）');
    assert.ok(ai.backupId, '主追追不到＝加派第二追球者');
    assert.ok(ai.backupId !== 'A1' && ai.backupId !== 'A5', '備援不得是主追或剛觸球者');

    let result = null;
    for (let i = 0; i < 400 && !result; i += 1) {
      for (const e of stepGame(g, aiCollectIntents(g, ai))) {
        if (e.type === 'TOUCH') { result = { pid: e.playerId, touches: e.touches }; break; }
        if (e.type === 'DEAD_BALL') { result = { pid: null }; break; }
      }
    }
    assert.equal(result.touches, 2, '這一觸就是第二擊');
    assert.equal(result.pid, ai.backupId, `第二擊由備援接手（實得 ${result.pid}）`);
  }
});

test('§8⑥：備援禮讓——主追本 tick 自己搆得到時，備援不搶球、也不造成同 tick 雙觸', () => {
  const g = rigSecondTouch();
  const ai = createAiState();
  aiCollectIntents(g, ai);
  const claim = ai.claimId;
  const backup = ai.backupId;
  assert.ok(backup, '前置：本球有備援');

  // 推進到球下墜段（不下指令＝球自由飛行）
  for (let i = 0; i < 120; i += 1) {
    stepGame(g, []);
    if (g.ball.vy < 0 && g.ball.y < 2.4) break;
  }
  // 主追與備援同時站到球邊（＝禮讓條款唯一會被檢驗的局面）
  g.actors[claim].x = g.ball.x + 0.3; g.actors[claim].z = g.ball.z;
  g.actors[backup].x = g.ball.x - 0.3; g.actors[backup].z = g.ball.z;
  ai.planTick = g.tick - 40; // 過反應延遲

  const intents = aiCollectIntents(g, ai);
  const claimIt = intents.find((i) => i.playerId === claim);
  const backupIt = intents.find((i) => i.playerId === backup);
  assert.equal(claimIt.action, 'set', '主追照常出手舉球');
  assert.equal(backupIt.action ?? null, null, '備援只跟著壓落點，不出手（禮讓）');

  const touches = stepGame(g, intents).filter((e) => e.type === 'TOUCH');
  assert.equal(touches.length, 1, '同 tick 不得雙觸');
  assert.equal(touches[0].playerId, claim);
  assert.equal(g.rally.touches, 2, '觸球數不得被灌成 3');
});

test('§8：主追追得上就零加派（回歸閘——備援不是每球都派）', () => {
  const g = rigSecondTouch({ x: 2, y: 6, z: 2, vx: 0, vy: 3, vz: 0 });
  g.actors.A1.x = 2; g.actors.A1.z = 2.5; // 二傳就站在落點旁
  const ai = createAiState();
  aiCollectIntents(g, ai);
  assert.equal(ai.backupId, null);
});
