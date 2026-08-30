// 大作感三卷 批3「發行商開場 logo」——驗收 K3-1～K3-4 的機械斷言
// 凍結檔：docs/kickoffs/juice3-kickoff-20260830.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { logoDone, LOGO_MS } from '../src/ui/bootLogo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

test('K3-4 純函式雙向：未滿且未點擊→留、滿→走、點擊隨時→走', () => {
  assert.equal(logoDone(0, false), false);
  assert.equal(logoDone(LOGO_MS - 1, false), false);
  assert.equal(logoDone(LOGO_MS, false), true);
  assert.equal(logoDone(LOGO_MS + 500, false), true);
  assert.equal(logoDone(100, true), true, '點擊＝隨時可跳');
  assert.equal(logoDone(-5, false), false, '負 elapsed 不得提前走');
});

test('K3-2 接線：main.js 在 renderer 建立前演 logo、包 try/catch、bench 不演', () => {
  const s = src('src/main.js');
  const at = s.indexOf('showBootLogo()');
  assert.ok(at > 0);
  assert.ok(at < s.indexOf('createRenderer(container'), 'logo 先於 renderer（開機最前）');
  const around = s.slice(at - 200, at + 100);
  assert.ok(around.includes('try {'), 'K3-2 建立失敗不得擋開機');
  assert.ok(around.includes("params.get('mode') !== 'bench'"), 'bench 基準場景不演');
});

test('K3-1/K3-3 樣式：z-index 高於 #loading(20)、點擊/播畢皆走 dismiss 移除', () => {
  const s = src('src/ui/bootLogo.js');
  assert.ok(s.includes('z-index: 30'));
  assert.ok(s.includes('el.remove()'), '消失＝整塊移除，不殘留擋選單');
  // 兩條路都過 logoDone（同一判定來源）
  assert.ok(s.includes('logoDone(performance.now() - t0, clicked)'));
});
