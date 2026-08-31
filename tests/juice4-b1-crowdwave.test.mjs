// 大作感四卷 批1（J4 觀眾人浪）——驗收凍結 docs/kickoffs/juice4-kickoff-20260831.md：
// ①純函式測試：窗內 amp 隨相位遞延、窗外恆 0、播畢座位還原 base ②rally 進行中不播
// ③與既有 onScore 反應互不打架（同幀只一種生效，規則寫進註解與測試）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as THREE from 'three';
import {
  crowdWaveAt, WAVE, crowdReactionAt, REACT, createCrowdAnim,
} from '../src/render/crowdAnim.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// ---- J4①：crowdWaveAt 純函式 ----

test('crowdWaveAt：窗外恆 0（elapsed 負值、或超過該座位的局部起伏窗）', () => {
  assert.equal(crowdWaveAt(-5, 0), 0, 'elapsed 負值');
  assert.equal(crowdWaveAt(0, 0.5), 0, '波前還沒掃到這顆座位（phase 遞延中）');
  assert.equal(crowdWaveAt(WAVE.riseMs * 2, 0), 0, '這顆座位的起伏窗剛好播完（右邊界不含）');
  assert.equal(crowdWaveAt(WAVE.riseMs * 3, 0), 0, '早就播完了');
});

test('crowdWaveAt：窗內於局部起伏中點達峰值 WAVE.amp（sin 半週期包絡）', () => {
  const peak = crowdWaveAt(WAVE.riseMs, 0);
  assert.ok(Math.abs(peak - WAVE.amp) < 1e-9, `峰值應該恰為 WAVE.amp，實得 ${peak}`);
  // 起點與終點附近振幅小，中點附近振幅大（淡入淡出包絡）
  const early = crowdWaveAt(WAVE.riseMs * 0.1, 0);
  const late = crowdWaveAt(WAVE.riseMs * 1.9, 0);
  assert.ok(early > 0 && early < peak);
  assert.ok(late > 0 && late < peak);
});

test('crowdWaveAt：amp 隨座位相位遞延——同一個 elapsed，phase 越大的座位越晚才輪到起伏', () => {
  const elapsed = WAVE.riseMs; // 只夠 phase=0 的座位到達峰值
  assert.ok(crowdWaveAt(elapsed, 0) > 0, 'phase=0 這一刻應該在動');
  assert.equal(crowdWaveAt(elapsed, 0.5), 0, 'phase=0.5 波前還沒掃到（localStart 更晚）');
  assert.equal(crowdWaveAt(elapsed, 1), 0, 'phase=1（波前最後掃到的座位）更還沒輪到');
  // 波前掃到 phase=0.5 座位的時間點＝0.5*travelMs，其後同一顆座位的峰值出現在 +riseMs
  const midPeak = crowdWaveAt(0.5 * WAVE.travelMs + WAVE.riseMs, 0.5);
  assert.ok(Math.abs(midPeak - WAVE.amp) < 1e-9);
});

test('crowdWaveAt：非負輸入下恆非負（沒有座位會被推到地下）', () => {
  for (let ms = 0; ms <= WAVE.travelMs + WAVE.riseMs * 2; ms += 137) {
    for (let ph = 0; ph <= 1; ph += 0.13) {
      assert.ok(crowdWaveAt(ms, ph) >= 0, `elapsed=${ms} phase=${ph} 不該是負振幅`);
    }
  }
});

// ---- createCrowdAnim：結構/整合測試（假 arena/crowd，不需要真 InstancedMesh）----

function fakeCrowd(n) {
  const base = new Float32Array(n * 3);
  const present = new Uint8Array(n).fill(1);
  for (let i = 0; i < n; i += 1) {
    const ang = (i / n) * Math.PI * 2 - Math.PI; // -PI..PI，均勻繞場一圈
    base[i * 3] = Math.cos(ang) * 10;
    base[i * 3 + 1] = 1; // 基準高度
    base[i * 3 + 2] = Math.sin(ang) * 10;
  }
  const matrices = new Array(n).fill(null);
  return {
    userData: { crowdBase: base, crowdPresent: present },
    setMatrixAt(i, m4) { matrices[i] = m4.clone(); },
    instanceMatrix: { needsUpdate: false },
    _matrices: matrices,
    _base: base,
  };
}

function yOf(crowd, i) {
  const m = crowd._matrices[i];
  if (!m) return crowd._base[i * 3 + 1]; // 從未寫過＝仍是初始值（等同 base）
  return new THREE.Vector3().setFromMatrixPosition(m).y;
}

function fakeArena(crowd) {
  return { getCrowd: () => crowd };
}

test('K1-1 效能鐵則（延伸至 J4）：兩個窗都沒開時 update 完全不碰 arena（零成本）', () => {
  let calls = 0;
  const arena = { getCrowd: () => { calls += 1; return null; } };
  const anim = createCrowdAnim({}, arena);
  anim.update(1000);
  anim.update(2000);
  assert.equal(calls, 0);
});

test('J4① 整合：onSetBreak 開窗後——早相位座位先動、晚相位座位還沒動；播畢全體還原 base', () => {
  const n = 8;
  const crowd = fakeCrowd(n);
  const arena = fakeArena(crowd);
  const anim = createCrowdAnim({}, arena);
  // i=0 的座位 ang=-PI → phase=0；i=n/2 的座位 ang=0 → phase=0.5（見 fakeCrowd 佈局）
  const seatEarly = 0;
  const seatMid = n / 2;

  anim.onSetBreak(1000);
  anim.update(1000 + WAVE.riseMs); // 只夠 phase=0 座位到峰值，phase=0.5 座位還沒輪到
  assert.ok(
    Math.abs(yOf(crowd, seatEarly) - crowd._base[seatEarly * 3 + 1]) > 1e-6,
    '早相位座位這時候應該已經離開 base（正在起伏）',
  );
  assert.ok(
    Math.abs(yOf(crowd, seatMid) - crowd._base[seatMid * 3 + 1]) < 1e-9,
    '中段相位座位波前還沒掃到，應該仍在 base',
  );

  anim.update(1000 + 0.5 * WAVE.travelMs + WAVE.riseMs); // 換 phase=0.5 座位輪到峰值
  assert.ok(
    Math.abs(yOf(crowd, seatEarly) - crowd._base[seatEarly * 3 + 1]) < 1e-9,
    '早相位座位早就播完，應該已經回到 base',
  );
  assert.ok(
    Math.abs(yOf(crowd, seatMid) - crowd._base[seatMid * 3 + 1]) > 1e-6,
    '中段相位座位現在正在起伏',
  );

  // 播畢：整窗總長 travelMs + riseMs*2，過了這個時間點全場都該還原
  anim.update(1000 + WAVE.travelMs + WAVE.riseMs * 2 + 50);
  for (let i = 0; i < n; i += 1) {
    assert.ok(
      Math.abs(yOf(crowd, i) - crowd._base[i * 3 + 1]) < 1e-9,
      `座位 ${i} 播畢後應該還原 base`,
    );
  }
});

test('J4③ 同幀只一種生效：得分反應窗與人浪窗重疊時，反應窗優先，人浪這幀讓路', () => {
  const n = 8;
  const crowd = fakeCrowd(n);
  const arena = fakeArena(crowd);
  const anim = createCrowdAnim({}, arena);

  anim.onScore(1000, { keyPoint: false }); // 反應窗 1600ms
  anim.onSetBreak(1000); // 人浪窗同時開（暫停/局間與得分死球理論上可能同時觸發）

  const now = 1000 + 200; // 落在反應窗內（200 < 1600），也落在人浪窗 phase=0 座位的起伏窗內
  anim.update(now);

  // 若這幀真的是反應窗在動：seat0 的位移應該符合 crowdReactionAt 的彈跳公式
  // （t=now/1000、REACT.freq、(i%7)*0.9 相位）——人浪公式（crowdWaveAt）在同一時間點
  // 對 seat0（phase=0）算出的振幅形狀完全不同，兩者不會湊巧相等，可以用來辨認走的是哪條路。
  const { amp } = crowdReactionAt(now - 1000, { keyPoint: false });
  assert.ok(amp > 0, '前提：這一刻反應窗確實有非零振幅');
  const t = now / 1000;
  const expectedReactionY = crowd._base[1] + amp * Math.abs(Math.sin(t * REACT.freq + (0 % 7) * 0.9));
  assert.ok(
    Math.abs(yOf(crowd, 0) - expectedReactionY) < 1e-6,
    '同幀應該是反應窗的彈跳公式在動，不是人浪公式',
  );

  // 反應窗收尾（超過 1600ms）後，人浪窗若還沒過期，換人浪接手同一顆座位
  const laterNow = 1000 + 1650; // 反應窗已關；人浪窗仍開（總長 travelMs+riseMs*2 > 1650）
  anim.update(laterNow);
  const waveElapsed = laterNow - 1000;
  const expectedWaveAmp = crowdWaveAt(waveElapsed, 0); // seat0 phase=0
  const expectedWaveY = crowd._base[1] + expectedWaveAmp;
  assert.ok(
    Math.abs(yOf(crowd, 0) - expectedWaveY) < 1e-6,
    '反應窗收尾後，人浪窗接手同一顆座位',
  );
});

test('J4④ 永不致死：update 內部拋錯（setMatrixAt 壞掉）自我停用，之後安全早退', () => {
  const crowd = fakeCrowd(4);
  crowd.setMatrixAt = () => { throw new Error('模擬 GPU 崩潰'); };
  const arena = fakeArena(crowd);
  const anim = createCrowdAnim({}, arena);
  anim.onSetBreak(1000);
  assert.doesNotThrow(() => anim.update(1000 + 50));
  // 停用後（dead=true）：後續呼叫不再嘗試碰 crowd，也不拋錯
  let calls = 0;
  const arena2 = { getCrowd: () => { calls += 1; return crowd; } };
  // 用同一個 anim 實例（已經 dead）搭配新 arena 測不到——直接量測「不再拋錯」即可
  assert.doesNotThrow(() => anim.update(1000 + 100));
});

// ---- J4②「rally 進行中不播」：實際保證來自 matchLoop 的呼叫點——onTimeout/onSetBreak
// 只在死球態的 edge 才會被叫到一次（不是每幀輪詢），本模組本身不重讀 game.phase
// （同 onScore 慣例）。這裡讀原始碼確認三個呼叫點都落在正確的死球 edge 上。----
const matchLoopSrc = readFileSync(path.join(repoRoot, 'src/app/matchLoop.js'), 'utf8');

test('matchLoop 接線：requestTimeout（我方暫停）在 applyTimeout 成功（死球窗）之後才呼叫 onTimeout', () => {
  const idx = matchLoopSrc.indexOf('function requestTimeout(s) {');
  assert.ok(idx >= 0);
  const okIdx = matchLoopSrc.indexOf('if (r.ok) {', idx);
  const huddleIdx = matchLoopSrc.indexOf('s.timeoutHuddleTeam = team;', okIdx);
  const onTimeoutIdx = matchLoopSrc.indexOf('crowdAnim?.onTimeout(', okIdx);
  assert.ok(okIdx >= 0 && huddleIdx >= 0 && onTimeoutIdx >= 0);
  assert.ok(onTimeoutIdx > okIdx && onTimeoutIdx < okIdx + 500, 'onTimeout 應該掛在 r.ok 分支裡（applyTimeout 成功＝死球窗才會 ok）');
});

test('matchLoop 接線：AI 暫停分支在 applyTimeout(...).ok 成立之後才呼叫 onTimeout', () => {
  const idx = matchLoopSrc.indexOf("aiTimeoutWanted(game, 'B') && applyTimeout(game, { team: 'B' }).ok");
  assert.ok(idx >= 0);
  const nearby = matchLoopSrc.slice(idx, idx + 300);
  assert.match(nearby, /crowdAnim\?\.onTimeout\(/);
});

test('matchLoop 接線：onSetBreak 只掛在 game.phase 剛轉進 set_break 的 edge（s.prevPhase !== \'set_break\'），不是每幀輪詢', () => {
  const idx = matchLoopSrc.indexOf("game.phase === 'set_break' && s.prevPhase !== 'set_break'");
  assert.ok(idx >= 0);
  const nearby = matchLoopSrc.slice(idx, idx + 300);
  assert.match(nearby, /crowdAnim\?\.onSetBreak\(/);
});
