// 大作感三卷 批2「賽後 MVP 演出」——驗收 K2-1～K2-5 的機械斷言
// 凍結檔：docs/kickoffs/juice3-kickoff-20260830.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { selectMvp } from '../src/career/mvp.js';
import { createScene, createLights } from '../src/render/scene.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

// ---------- K2-2 純函式雙向 ----------

const row = (pid, points, kills = 0, blocks = 0) => ({
  pid, name: `P${pid}`, role: 'outside', points, kills, blocks,
});

test('K2-2 rows 空/非陣列＝null（null＝不演直接走現行流程）', () => {
  assert.equal(selectMvp([]), null);
  assert.equal(selectMvp(null), null);
  assert.equal(selectMvp(undefined), null);
});

test('K2-2 取最佳：得分最高者當選；平手比扣球得分、再比攔網', () => {
  assert.equal(selectMvp([row('A1', 5), row('A2', 12), row('A3', 8)]).pid, 'A2');
  assert.equal(selectMvp([row('A1', 10, 3), row('A2', 10, 7)]).pid, 'A2');
  assert.equal(selectMvp([row('A1', 10, 5, 1), row('A2', 10, 5, 4)]).pid, 'A2');
});

test('K2-2 產物形狀：pid/name/role/stats 三數據齊', () => {
  const m = selectMvp([{ pid: 'B4', name: '天鷹王牌', role: 'opposite', points: 20, kills: 15, blocks: 2 }]);
  assert.equal(m.name, '天鷹王牌');
  assert.equal(m.role, 'opposite');
  assert.deepEqual(m.stats, { points: 20, kills: 15, blocks: 2 });
});

// ---------- K2-4 燈暗與完全還原（真 THREE 場景，無 DOM）----------

function lightsFixture() {
  const scene = createScene();
  const lights = createLights(scene, { shadowSize: 0 });
  const hemi = scene.children.find((o) => o.isHemisphereLight);
  const dirs = scene.children.filter((o) => o.isDirectionalLight); // [key, rim]（加入序）
  const spots = scene.children.filter((o) => o.isSpotLight);
  return { lights, hemi, key: dirs[0], rim: dirs[1], spots };
}

test('K2-4 燈暗：MVP 演出中底光/主燈壓暗、聚光增強', () => {
  const { lights, hemi, key, spots } = lightsFixture();
  lights.startMvpDim(0, 4500);
  lights.updateMvpDim(2000); // dip 已到位
  assert.ok(hemi.intensity < 0.2, `hemi=${hemi.intensity}`);
  assert.ok(key.intensity < 1.0, `key=${key.intensity}`);
  assert.ok(spots[0].intensity > 260, '聚光要比常態亮（舞台感）');
});

test('K2-4 完全還原：stopMvpDim 後常態值分毫不差', () => {
  const { lights, hemi, key, rim, spots } = lightsFixture();
  lights.startMvpDim(0, 4500);
  lights.updateMvpDim(3000);
  lights.stopMvpDim();
  assert.equal(hemi.intensity, 0.5);
  assert.equal(key.intensity, 2.6);
  assert.equal(rim.intensity, 0.7);
  assert.equal(spots[0].intensity, 260);
});

test('K2-4 短路慣例：MVP 燈暗中 setTension/setMomentum 不得改燈（同燈光秀）', () => {
  const { lights, hemi, spots } = lightsFixture();
  lights.startMvpDim(0, 4500);
  lights.updateMvpDim(2000);
  const dimmed = hemi.intensity;
  const spotNow = spots[0].intensity;
  lights.setTension(true, 0.5);
  lights.setMomentum(1, false, 0.5);
  assert.equal(hemi.intensity, dimmed);
  assert.equal(spots[0].intensity, spotNow);
});

// ---------- 接線鎖（source 掃描）----------

test('K2-1/K2-3 matchLoop 接線：慶祝先 MVP 次之、普通勝負同路、生涯限定且連線不演', () => {
  const s = src('src/app/matchLoop.js');
  // endCelebration 收口改走 MVP 鏈（不再直呼 overlay）
  assert.ok(s.includes('showMvpOrOverlay(s, { winner: c.winner, score: c.score, hint: c.hint })'));
  // settleIfOver 普通勝負分支同路
  assert.ok(s.includes('showMvpOrOverlay(s, { winner, score, hint: overlayHint })'));
  // 生涯正式賽限定（練習/教學已早退）＋連線不演
  assert.ok(s.includes('if (s.careerCtx && !s.net)'));
});

test('K2-3 跳過通道：MVP 演出中點擊＝endMvpShow（與播畢殊途同歸落回 overlay）', () => {
  const s = src('src/app/matchLoop.js');
  assert.ok(s.includes('if (s.mvpShow) { endMvpShow(s); return; }'));
  // endMvpShow 收口必顯 overlay（燈還原失敗也不得擋）
  const fn = s.slice(s.indexOf('function endMvpShow'), s.indexOf('function endMvpShow') + 600);
  assert.ok(fn.includes('setOverOverlay.show'));
  assert.ok(fn.includes('stopMvpDim'));
});

test('K2-1 金字卡走 theme tokens：vd-panel-gold/vd-gold-text，不走寫死 hex 舊路', () => {
  const s = src('src/ui/mvpCard.js');
  assert.ok(s.includes('vd-panel-gold'));
  assert.ok(s.includes('vd-gold-text'));
  assert.ok(s.includes('var(--vd-gold'));
});
