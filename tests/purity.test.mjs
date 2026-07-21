// 架構鐵律驗收：src/sim 零 three.js/DOM 依賴、零非決定論來源（驗收單 A1/B2）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIM_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'sim');

const FORBIDDEN = [
  [/from\s+['"]three/, 'import three.js'],
  [/require\(\s*['"]three/, 'require three.js'],
  [/\bwindow\./, 'window'],
  [/\bdocument\./, 'document'],
  [/Math\.random\(/, 'Math.random（須走種子 PRNG）'],
  [/Date\.now\(/, 'Date.now'],
  [/performance\.now\(/, 'performance.now'],
  [/new Date\(/, 'new Date'],
];

test('src/sim 無 three.js/DOM/非決定論來源', () => {
  const files = readdirSync(SIM_DIR).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 8, `sim 模組數異常：${files.length}`);
  for (const f of files) {
    const src = readFileSync(join(SIM_DIR, f), 'utf8');
    for (const [re, label] of FORBIDDEN) {
      assert.ok(!re.test(src), `${f} 含禁用符號：${label}`);
    }
  }
});
