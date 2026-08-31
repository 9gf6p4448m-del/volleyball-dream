// 候補池卷（P1-P4）——機械斷言；凍結檔：docs/kickoffs/pool-kickoff-20260831.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { derivePointInfo } from '../src/ui/pointBanner.js';
import { pickInterviewLine } from '../src/ui/interviewCard.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

// ---------- P3 發球計時 ----------

test('P3-2 反向臂：AI 對局全場零發球逾時（AI 發球 ~1-2s 結構上不觸發）', () => {
  for (let seed = 1; seed <= 5; seed += 1) {
    const g = createGame({ seed, setTarget: 25 });
    const ai = createAiState();
    while (g.phase !== 'set_over' && g.tick < 300000) {
      for (const e of stepGame(g, aiCollectIntents(g, ai))) {
        assert.notEqual(e.reason, 'SERVE_CLOCK', `seed ${seed} AI 竟然發球逾時`);
      }
    }
  }
});

test('P3-1 正向臂：擺爛不發球＝逾時判給接發方；tutorial（serveClockTicks:0）擺爛不判', () => {
  const stall = (opts) => {
    const g = createGame({ seed: 7, setTarget: 25, ...opts });
    const receiver = g.match.servingTeam === 'A' ? 'B' : 'A';
    for (let i = 0; i < (TUNING.SERVE_CLOCK_TICKS + TUNING.SERVE_DEAD_TICKS + 60) && g.phase === 'serve'; i += 1) {
      const events = stepGame(g, []); // 零意圖＝沒人發球
      const dead = events.find((e) => e.type === 'DEAD_BALL');
      if (dead) return { reason: dead.reason, winner: events.find((e) => e.type === 'SCORE')?.team, receiver };
    }
    return null;
  };
  const r = stall({});
  assert.ok(r, '逾時窗過了卻沒有死球＝計時沒接上');
  assert.equal(r.reason, 'SERVE_CLOCK');
  assert.equal(r.winner, r.receiver, '逾時要判給接發方');
  assert.equal(stall({ serveClockTicks: 0 }), null, 'tutorial 關閉臂：擺爛也不得判');
});

test('P3-2 字卡消費端：SERVE_CLOCK 有專屬文案不漏內部代號', () => {
  const info = derivePointInfo({
    reason: 'SERVE_CLOCK', winner: 'B', myTeam: 'A',
    lastTouch: null, controlledId: null, score: { A: 0, B: 1 },
  });
  assert.ok(info.title.includes('逾時'), `字卡=${info.title}`);
});

// ---------- P2 演出 ----------

test('P2-2 採訪台詞決定論：同 seedish 同句、不同 seedish 至少出現兩種句', () => {
  assert.deepEqual(pickInterviewLine(42), pickInterviewLine(42));
  const distinct = new Set(Array.from({ length: 12 }, (_, i) => pickInterviewLine(i).a));
  assert.ok(distinct.size >= 2);
});

test('P1/P2 接線鎖：跑馬燈雙驅動、拍手掛關鍵分窗、換人舉牌、採訪鏈與跳過通道', () => {
  const ml = src('src/app/matchLoop.js');
  assert.ok(ml.includes('ctx.arena?.tickMarquee?.(delta)'), 'P1-2 比賽中驅動');
  assert.ok(src('src/render/attract.js').includes('ctx.arena?.tickMarquee?.'), 'P1-2 選單背景驅動');
  assert.ok(src('src/ui/sfx.js').includes('rhythmClaps(CHEER_DELAY + 0.15'), 'P2-1 掛 keyPoint 爆炸窗');
  assert.ok(ml.includes("e.type === 'SUBSTITUTION'"), 'P2-3 換人舉牌讀事件流');
  assert.ok(ml.includes('if (s.interview) { endInterview(s); return; }'), 'P2-2 跳過通道');
});

test('P1-1 球旋轉：轉速吃球速、飄浮球維持近停（真飄招牌不得說謊）', () => {
  const bv = src('src/render/ballView.js');
  assert.ok(bv.includes('Math.hypot(ball.vx ?? 0, ball.vz ?? 0)'));
  assert.ok(bv.includes("floatFlight ? 0.25"), '飄浮球近停保留');
});
