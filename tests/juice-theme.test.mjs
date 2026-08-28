// 大作感卷 批4：UI 皮膚 tokens 單一來源守衛（驗收凍結
// docs/kickoffs/acceptance-juice-batch4-20260828.md A1/A4）
// ① tokens 匯出形狀與色值 ② installTheme 在各種殘缺 document 環境下不 throw、
// 重複呼叫冪等 ③ 本批觸及的樣式碼裡金色字面量不得重複寫死（一律引用 tokens）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { COLORS, FONTS, installTheme } from '../src/ui/theme.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// ── ① tokens 匯出形狀與色值（凍結檔逐字指定，見 acceptance-juice-batch4 視覺識別段）──
test('COLORS 匯出形狀與色值符合凍結檔', () => {
  assert.deepEqual(COLORS, {
    bg: '#0b0906',
    bg2: '#14100a',
    gold: '#d4af37',
    goldLight: '#f4e3ae',
    goldDark: '#9a7b1e',
    text: '#f0e2b6',
    textDim: '#cbb886',
  });
});

test('FONTS 匯出形狀符合凍結檔', () => {
  assert.deepEqual(FONTS, {
    zh: "'Noto Serif TC',serif",
    latin: "'Cinzel',serif",
  });
});

// ── ② installTheme：離線／殘缺 document／字體載入失敗一律不阻塞、不 throw；冪等 ──
// 極簡 document stub：只實作 installTheme 會摸到的那幾個 API
function makeDocStub({ throwOnAppend = false } = {}) {
  const headChildren = [];
  const head = {
    appendChild(elNode) {
      if (throwOnAppend) throw new Error('模擬 CDN/CSP 擋下注入（離線情境）');
      headChildren.push(elNode);
      return elNode;
    },
  };
  return {
    head,
    headChildren, // 測試專用：直接數 appendChild 實際被呼叫幾次，不只是「有沒有掛上」
    createElement(tag) {
      return {
        tagName: tag, id: '', rel: '', href: '', crossOrigin: '', textContent: '', onerror: null,
      };
    },
    getElementById(id) {
      return headChildren.find((c) => c.id === id) ?? null;
    },
  };
}

function withDocument(doc, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'document');
  const saved = globalThis.document;
  if (doc === undefined) delete globalThis.document;
  else globalThis.document = doc;
  try {
    fn();
  } finally {
    if (had) globalThis.document = saved;
    else delete globalThis.document;
  }
}

test('installTheme：完全沒有 document（非瀏覽器/測試殼層）不 throw', () => {
  withDocument(undefined, () => {
    assert.doesNotThrow(() => installTheme());
  });
});

test('installTheme：document 存在但沒有 head（殘缺殼層）不 throw、不掛任何東西', () => {
  withDocument({}, () => {
    assert.doesNotThrow(() => installTheme());
  });
});

test('installTheme：head.appendChild 拋錯（模擬離線/CSP 擋下字體與樣式注入）不 throw', () => {
  const doc = makeDocStub({ throwOnAppend: true });
  withDocument(doc, () => {
    assert.doesNotThrow(() => installTheme());
  });
});

test('installTheme：正常 document 下重複呼叫冪等——只掛一份 style 與一份 font link', () => {
  const doc = makeDocStub();
  withDocument(doc, () => {
    assert.doesNotThrow(() => installTheme());
    assert.doesNotThrow(() => installTheme());
    assert.doesNotThrow(() => installTheme());
  });
  // 直接數 appendChild 實際入帳幾次（不是只問「找不找得到」）——冪等的鑑別力
  // 在於「呼叫三次」跟「呼叫一次」的 appendChild 次數要一樣，不是元素存在與否
  const styleCount = doc.headChildren.filter((c) => c.id === 'vd-theme').length;
  const linkCount = doc.headChildren.filter((c) => c.id === 'vd-theme-font').length;
  const preconnectCount = doc.headChildren.filter((c) => c.rel === 'preconnect').length;
  assert.equal(styleCount, 1, '樣式表應該只掛一次');
  assert.equal(linkCount, 1, 'Google Fonts link 應該只掛一次');
  assert.equal(preconnectCount, 2, 'preconnect 也該只掛一輪（googleapis+gstatic），不隨呼叫次數累加');
});

test('installTheme：字體 link 掛載失敗（onerror 觸發）不影響樣式表已掛載、不 throw', () => {
  const doc = makeDocStub();
  withDocument(doc, () => {
    installTheme();
    const link = doc.getElementById('vd-theme-font');
    assert.ok(link, '字體 link 應該存在（用來掛 onerror degrade 邏輯）');
    assert.doesNotThrow(() => link.onerror?.({}));
    assert.ok(doc.getElementById('vd-theme'), '字體失敗不該連累樣式表被移除');
  });
});

// ── ③ A1：本批觸及的樣式碼裡，金色字面量只能出現在 theme.js（其他檔一律引用 tokens）──
// 範圍＝本批實際新增/修改樣式的檔案；refs 快照與本測試檔自身除外（凍結檔 A1 明文豁免）
const STYLE_FILES = [
  'src/ui/careerScreen.js',
  'src/ui/scoreboard.js',
  'src/ui/pointBanner.js',
  'src/ui/zonePanel.js',
  'src/app/matchStage.js',
  'src/main.js',
];

test('A1：金色字面量 #d4af37 不得在 theme.js 以外的本批樣式碼重複出現', () => {
  for (const rel of STYLE_FILES) {
    const content = readFileSync(path.join(repoRoot, rel), 'utf8');
    assert.doesNotMatch(
      content.toLowerCase(),
      /d4af37/,
      `${rel} 不應該寫死金色字面量——改用 theme.js 的 COLORS.gold / goldAlpha()`,
    );
  }
});

test('A1（正例）：theme.js 本身持有唯一一份金色字面量定義', () => {
  const content = readFileSync(path.join(repoRoot, 'src/ui/theme.js'), 'utf8');
  assert.match(content, /d4af37/i);
});
