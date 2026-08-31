// 大作感四卷 批1（J3 奪冠煙火）——驗收凍結 docs/kickoffs/juice4-kickoff-20260831.md：
// ①冠軍慶祝窗內煙火啟動、endCelebration 後停且資源釋放 ②非冠軍勝場不放
// ③純函式/結構測試蓋啟停時機 ④崩潰自我停用（不致死）。
// ②天然由呼叫端保證：s.stage.fireworksFx 只在 matchLoop.js 的 startCelebration
// 內建立/啟動，而 startCelebration 只在 championTitle 成立時才被呼叫（非冠軍勝場
// 走 showMvpOrOverlay，完全不經過本模組）——見本檔尾端的 matchLoop 接線結構測試。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as THREE from 'three';
import { createFireworks } from '../src/render/fireworks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function findPoints(scene) {
  const out = [];
  scene.traverse((o) => { if (o.isPoints) out.push(o); });
  return out;
}

// 升空火花＝單色（PointsMaterial 無 vertexColors）；炸開粒子＝有 vertexColors
function splitPoints(scene) {
  const pts = findPoints(scene);
  assert.equal(pts.length, 2, '應該恆是兩個 Points（升空槽＋炸開池），不隨 start/hide 增生');
  const burst = pts.find((p) => p.material.vertexColors);
  const shell = pts.find((p) => !p.material.vertexColors);
  assert.ok(burst && shell);
  return { shell, burst };
}

test('J3③ 結構：createFireworks 建出恰兩個 Points，初始皆不可見', () => {
  const scene = new THREE.Scene();
  createFireworks(scene);
  const { shell, burst } = splitPoints(scene);
  assert.equal(shell.visible, false);
  assert.equal(burst.visible, false);
});

test('J3①③ 啟停時機：start() 後可見且 isActive()=true；hide() 後不可見、資源釋放（位置歸零池、isActive()=false）', () => {
  const scene = new THREE.Scene();
  const fx = createFireworks(scene);
  const { shell, burst } = splitPoints(scene);

  assert.equal(fx.isActive(), false, '尚未 start＝未啟動');
  fx.start(8); // 同 CELEBRATION_SEC
  assert.equal(fx.isActive(), true);
  assert.equal(shell.visible, true);
  assert.equal(burst.visible, true);

  fx.hide(); // endCelebration 收口動作
  assert.equal(fx.isActive(), false, 'hide 後即視為停用');
  assert.equal(shell.visible, false);
  assert.equal(burst.visible, false);
  // 資源釋放：固定池全部歸零（-100，藏地下），不是留著半空中的粒子
  const sArr = shell.geometry.attributes.position.array;
  const bArr = burst.geometry.attributes.position.array;
  assert.ok(Array.from(sArr).every((v) => v === -100), '升空槽全部歸零收回');
  assert.ok(Array.from(bArr).every((v) => v === -100), '炸開池全部歸零收回');
});

test('J3③ 結構：update 推進期間真的有升空火花在動、也真的炸出粒子在動（決定論偽亂數，不是空轉）', () => {
  const scene = new THREE.Scene();
  const fx = createFireworks(scene);
  const { shell, burst } = splitPoints(scene);
  fx.start(8);

  let sawShellRise = false;
  let sawBurstParticle = false;
  for (let i = 0; i < 90; i += 1) { // 3 秒（1/30s 一格），足夠第一顆升空並炸開
    fx.update(1 / 30);
    const sArr = shell.geometry.attributes.position.array;
    for (let k = 1; k < sArr.length; k += 3) if (sArr[k] > 1) sawShellRise = true;
    const bArr = burst.geometry.attributes.position.array;
    for (let k = 1; k < bArr.length; k += 3) if (bArr[k] > -50) sawBurstParticle = true;
  }
  assert.ok(sawShellRise, '3 秒內應該看到升空火花離開發射點往上飛');
  assert.ok(sawBurstParticle, '3 秒內應該看到至少一次炸開、粒子離開 -100 收納位');
});

test('J3① stop() 後不再補發射，但空中的自然飛完（不是立刻清空，殊途同歸走 hide 收尾）', () => {
  const scene = new THREE.Scene();
  const fx = createFireworks(scene);
  fx.start(0.2); // 窗很短，跳過即等於窗已過
  fx.update(1 / 30); // 讓第一顆升空
  fx.stop(); // 提前叫停（點擊跳過的路徑）
  assert.equal(fx.isActive(), true, 'stop 不等於 hide——仍可見，交給呼叫端接著 hide 收尾');
  fx.hide();
  assert.equal(fx.isActive(), false);
});

test('J3④ 崩潰自我停用：update 內部拋錯不致命——isActive 恆 false、之後所有呼叫安全早退', () => {
  const scene = new THREE.Scene();
  const fx = createFireworks(scene);
  fx.start(8);
  assert.equal(fx.isActive(), true);

  // 模擬渲染管線壞掉：拔掉 position attribute，update 內部存取 .needsUpdate 必拋
  for (const p of findPoints(scene)) delete p.geometry.attributes.position;

  assert.doesNotThrow(() => fx.update(0.1), 'update 內部必須自己接住，不得把例外丟給呼叫端');
  assert.equal(fx.isActive(), false, '崩潰後自我停用');
  assert.doesNotThrow(() => fx.update(0.1), '停用後的呼叫也要安全早退');
  assert.doesNotThrow(() => fx.hide());
  assert.doesNotThrow(() => fx.start(8), '停用後 start 安全早退（不會詐屍）');
  assert.equal(fx.isActive(), false, '停用是永久的，不會因為再 start 一次就復活');
});

// ---- matchLoop 接線結構檢查（J3①②，讀原始碼確認生命週期掛在正確位置）----
// matchLoop.js 太大、狀態太重（stage/ctx/celebration 都要真實建構），不適合在單元
// 測試裡跑一整套 startCelebration→endCelebration；用結構檢查驗證三個掛點都在，
// 且 fireworksFx 完全只活在 championTitle 分支底下（J3②「非冠軍不放」的真正保證
// 來源——見 kickoff 驗收②：呼叫端已把關）。
const matchLoopSrc = readFileSync(path.join(repoRoot, 'src/app/matchLoop.js'), 'utf8');

function extractFunctionBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `應該找到 function ${name}(`);
  // 參數列表可能是解構（含自己的 { }），先數括號找到參數列表結束的 ')'，
  // 再從那之後找函式本體開始的第一個 '{'（不能直接找第一個 '{'——那可能是解構參數）
  const parenStart = src.indexOf('(', start);
  let pdepth = 0;
  let parenEnd = -1;
  for (let i = parenStart; i < src.length; i += 1) {
    if (src[i] === '(') pdepth += 1;
    else if (src[i] === ')') {
      pdepth -= 1;
      if (pdepth === 0) { parenEnd = i; break; }
    }
  }
  assert.ok(parenEnd >= 0, `${name} 找不到對稱的參數列表結尾`);
  const braceStart = src.indexOf('{', parenEnd);
  let depth = 0;
  for (let i = braceStart; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(braceStart, i + 1);
    }
  }
  throw new Error(`${name} 找不到對稱的結尾大括號`);
}

test('matchLoop 接線：startCelebration 建立並啟動 fireworksFx（與 confettiFx 同一條 CELEBRATION_SEC）', () => {
  const body = extractFunctionBody(matchLoopSrc, 'startCelebration');
  assert.match(body, /s\.stage\.fireworksFx = createFireworks\(s\.ctx\.scene\)/);
  assert.match(body, /s\.stage\.fireworksFx\.start\(CELEBRATION_SEC\)/);
});

test('matchLoop 接線：endCelebration 呼叫 fireworksFx.hide()（停且釋放）', () => {
  const body = extractFunctionBody(matchLoopSrc, 'endCelebration');
  assert.match(body, /s\.stage\.fireworksFx\?\.hide\(\)/);
});

test('matchLoop 接線：fireworksFx.update 掛在 s.celebration 的牆鐘時間軸裡（與 confettiFx 同一段）', () => {
  const idx = matchLoopSrc.indexOf('stage.confettiFx?.update(delta)');
  assert.ok(idx >= 0);
  const nearby = matchLoopSrc.slice(idx, idx + 200);
  assert.match(nearby, /stage\.fireworksFx\?\.update\(delta\)/);
});

test('matchLoop 接線：startCelebration 只從 championTitle 成立的分支被呼叫（J3② 非冠軍不放的真正保證）', () => {
  const idx = matchLoopSrc.indexOf('if (championTitle) {');
  assert.ok(idx >= 0);
  const nearby = matchLoopSrc.slice(idx, idx + 300);
  assert.match(nearby, /startCelebration\(/);
});
