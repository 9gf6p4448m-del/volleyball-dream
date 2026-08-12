// 常駐「怎麼玩」頁：接線驗收 ＋ 文案守衛
//
// ★ 為什麼要這一檔 ★ 本專案兩次踩的都是**接線**（`bquickButton` 定義了、接了，漏加
//   matchStage 的 return 清單 ⇒ 從上線起一次沒出現；⚡指令鈕匯出時漏掉、出廠隱形）。
//   一份沒有入口的說明頁＝沒有說明頁。所以上半場用假 DOM **真的從主選單點進去**，
//   不掃源碼字串。
//
// ★ 文案守衛 ★ 下半場守的是「過時的句子復活」。`tutorial.js` 的魚躍句曾經寫著
//   「右側大鈕亮起＝搆得到→拍下去飛身救球」——那顆鈕 07-24 就撤掉了，文案卻活了
//   兩週多。同型的錯誤在這份長很多的說明頁只會更容易發生，用機械檢查釘住。
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOW_TO_PLAY } from '../src/ui/howToPlay.js';

// ── 極簡 DOM 替身（沿 recruit-alt-path-wiring.test.mjs 的形狀）──
function fakeDom() {
  const make = (tag = 'div') => ({
    tag,
    style: { cssText: '' },
    textContent: '',
    children: [],
    listeners: null,
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(ev, fn) {
      this.listeners ??= {};
      (this.listeners[ev] ??= []).push(fn);
    },
    removeEventListener() {},
    replaceChildren() { this.children = []; },
    remove() {
      for (const parent of [globalThis.document.body, globalThis.document.head]) {
        const i = parent.children.indexOf(this);
        if (i >= 0) parent.children.splice(i, 1);
      }
    },
    focus() {},
    setAttribute() {},
    getAttribute() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() {
      return {
        top: 0, left: 0, width: 100, height: 100, bottom: 0, right: 0,
      };
    },
    classList: { add() {}, remove() {}, toggle() {} },
  });
  globalThis.document = {
    createElement: (t) => make(t),
    body: make('body'),
    head: make('head'),
    createTextNode: (t) => ({ textContent: t }),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = {
    addEventListener() {}, removeEventListener() {}, innerWidth: 800, innerHeight: 600,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: {
      getItem: () => null, setItem() {}, removeItem() {},
    },
  };
  globalThis.requestAnimationFrame = () => 0;
}

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

const subtreeText = (n) => [n.textContent || '', ...(n.children ?? []).map(subtreeText)].join(' ');

// 點下「文字包含 label 且自己掛了 pointerdown」的最內層節點（＝真人會點的那顆）
function tapByText(root, label) {
  const all = [];
  const collect = (n) => { if (n) { all.push(n); (n.children ?? []).forEach(collect); } };
  collect(root);
  const node = all.reverse().find((n) => n.listeners?.pointerdown && subtreeText(n).includes(label));
  if (!node) return false;
  node.listeners.pointerdown.forEach((fn) => fn({ stopPropagation() {}, preventDefault() {} }));
  return true;
}

function allTexts(root) {
  const out = [];
  const walk = (n) => { if (n) { if (n.textContent) out.push(n.textContent); (n.children ?? []).forEach(walk); } };
  walk(root);
  return out;
}

// ════════════════════════════════════════════════════════════
// 一、接線：主選單真的點得進去、每個分頁真的有東西、關得掉
// ════════════════════════════════════════════════════════════

async function openFromHome() {
  fakeDom();
  const { createSlotStoreProxy } = await import('../src/career/careerStore.js');
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const store = createSlotStoreProxy(fakeStorage(), 1);
  const screen = createCareerScreen(store, { onPlay() {}, onQuick() {}, primeSlot: null });
  screen.show();
  assert.equal(tapByText(document.body, '❓ 怎麼玩'), true,
    '主選單沒有「❓ 怎麼玩」可點＝說明頁沒有入口，等於不存在');
  return screen;
}

test('主選單 →「❓ 怎麼玩」→ 頁面真的開起來（假 DOM、真 UI 路徑）', async () => {
  await openFromHome();
  const texts = allTexts(document.body);
  assert.ok(texts.includes('❓ 怎麼玩'), '標題沒渲染');
  // 四個分頁的頁籤都在
  for (const tab of HOW_TO_PLAY) {
    assert.ok(texts.includes(tab.title), `頁籤「${tab.title}」沒渲染出來`);
  }
});

test('每個分頁都點得動，而且點進去有內容（不是空殼）', async () => {
  for (let i = 0; i < HOW_TO_PLAY.length; i += 1) {
    const tab = HOW_TO_PLAY[i];
    await openFromHome();
    assert.equal(tapByText(document.body, tab.title), true, `頁籤「${tab.title}」點不動`);
    const texts = allTexts(document.body);
    // 這一頁每個 section 的標題與每一條 term/desc 都要真的出現在畫面上
    for (const sec of tab.sections) {
      assert.ok(texts.includes(sec.heading), `「${tab.title}」的「${sec.heading}」沒渲染`);
      for (const item of sec.items) {
        assert.ok(texts.includes(item.term), `「${sec.heading}」的「${item.term}」沒渲染`);
        assert.ok(texts.includes(item.desc), `「${item.term}」有標題沒內文`);
      }
    }
    // 反向對照：別的分頁的內容不該同時出現（分頁真的在切換，不是全部一起倒出來）
    const other = HOW_TO_PLAY[(i + 1) % HOW_TO_PLAY.length];
    if (other !== tab) {
      assert.equal(texts.includes(other.sections[0].heading), false,
        `切到「${tab.title}」時「${other.title}」的內容也在畫面上＝分頁沒在切`);
    }
  }
});

test('關得掉：按「關閉」之後說明頁從 body 消失（回得去主選單）', async () => {
  await openFromHome();
  assert.ok(allTexts(document.body).includes('基本操作'), '前提沒成立：頁面沒開起來');
  assert.equal(tapByText(document.body, '關閉'), true, '沒有「關閉」鈕＝手機上出不去');
  const texts = allTexts(document.body);
  assert.equal(texts.includes('基本操作'), false, '按了關閉，內容還在畫面上');
  // 反向對照：主選單本身還在（不是把整個畫面一起關掉了）
  assert.ok(texts.includes('▶ 生涯'), '關掉說明頁把主選單也一起關掉了');
});

test('生涯畫面也有同一個入口（存檔中途想查玩法，不必退回主選單）', async () => {
  fakeDom();
  const { createSlotStoreProxy } = await import('../src/career/careerStore.js');
  const { createCareer, createCareerPlayer } = await import('../src/career/careerState.js');
  const { ensureStarterRoster } = await import('../src/career/roster.js');
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const store = createSlotStoreProxy(fakeStorage(), 1);
  store.saveCareer(createCareer({ seed: 42, playerName: '測試員' }));
  store.savePlayer(createCareerPlayer('測試員'));
  ensureStarterRoster(store);
  const screen = createCareerScreen(store, { onPlay() {}, onQuick() {}, primeSlot: null });
  screen.show();
  assert.equal(tapByText(document.body, '▶ 生涯'), true);
  assert.equal(tapByText(document.body, '測試員'), true, '存檔槽卡點不進去');
  assert.ok(allTexts(document.body).includes('📊 生涯數據'), '前提沒成立：不在生涯畫面');
  assert.equal(tapByText(document.body, '❓ 怎麼玩'), true, '生涯畫面沒有「❓ 怎麼玩」入口');
  assert.ok(allTexts(document.body).includes('基本操作'), '點了沒開');
});

// ════════════════════════════════════════════════════════════
// 二、文案守衛（純資料，不碰 DOM）
// ════════════════════════════════════════════════════════════

const everyLine = () => HOW_TO_PLAY.flatMap(
  (t) => t.sections.flatMap((s) => s.items.flatMap((i) => [i.term, i.desc])),
);

test('四個分頁都在，而且每一頁都不是空的', () => {
  assert.deepEqual(HOW_TO_PLAY.map((t) => t.id), ['basics', 'roles', 'screen', 'career']);
  for (const tab of HOW_TO_PLAY) {
    assert.ok(tab.sections.length > 0, `「${tab.title}」一個段落都沒有`);
    for (const sec of tab.sections) {
      assert.ok(sec.items.length > 0, `「${sec.heading}」是空的`);
      for (const item of sec.items) {
        assert.ok(item.term?.trim(), `${sec.heading} 有空的 term`);
        assert.ok(item.desc?.trim(), `「${item.term}」沒有說明`);
      }
    }
  }
});

// ★ 魚躍：07-24 已撤掉手動鈕（matchStage.js:606-608），改為自動（matchControls.js:488-518）★
// `tutorial.js` 的舊句「右側大鈕亮起＝搆得到→拍下去飛身救球」活了兩週多才被真人抓到。
test('魚躍句不得復活成「按鈕」——它是自動的', () => {
  const dive = HOW_TO_PLAY.find((t) => t.id === 'basics')
    .sections.find((s) => s.heading === '魚躍');
  assert.ok(dive, '基本操作裡沒有魚躍段');
  const text = dive.items.map((i) => `${i.term}${i.desc}`).join('');
  assert.ok(/自動/.test(text), `魚躍段沒講「自動」：${text}`);
  assert.equal(/大鈕|按鈕|拍下去/.test(text), false,
    `魚躍段又寫成要按鈕了（07-24 已撤掉那顆鈕）：${text}`);
});

// ★ 要球型 vs 改線型：ai.js:1358-1362 把三顆鈕的語意寫死。內切與夾塞**不改球權**
//   （實測：內切按了 379/379 波都沒改球權；夾塞 73% 的波球不是他打的）。說明頁若寫成
//   「按了球就是你的」＝文案承諾程式不做的事，本專案的頭號事故型態。★
test('內切／夾塞不得被寫成「球會給你」', () => {
  const roles = HOW_TO_PLAY.find((t) => t.id === 'roles');
  const lines = roles.sections.flatMap((s) => s.items).filter(
    (i) => i.term.includes('內切') || i.term.includes('夾塞'),
  );
  assert.equal(lines.length, 2, `內切與夾塞應各有一條，實際 ${lines.length} 條`);
  for (const line of lines) {
    assert.equal(/球給你|球就是你|保證/.test(line.desc), false,
      `${line.term} 被寫成要球型了：${line.desc}`);
    assert.ok(/不改球權|不動球權|不是要球|仍看二傳|仍由二傳/.test(line.desc),
      `${line.term} 沒有講清楚它不改球權：${line.desc}`);
  }
  // 反向對照：真的會改球權的那兩顆要講出來（不是全部都寫成「不改球權」）
  const claim = roles.sections.flatMap((s) => s.items).find((i) => i.term.includes('要 B 快'));
  assert.ok(/改球權|給你打/.test(claim.desc), `🖐 要 B 快 是要球型，要講明：${claim.desc}`);
});

// ★ ⚡跟上！＝CALL_GRANT 0.7（matchLoop.js:2183）——不是保證 ★
test('⚡跟上！不得寫成「喊了球一定給你」', () => {
  const call = HOW_TO_PLAY.find((t) => t.id === 'roles')
    .sections.flatMap((s) => s.items).find((i) => i.term.includes('跟上'));
  assert.ok(call, '沒有 ⚡跟上！ 這一條');
  assert.ok(/七成|不是保證/.test(call.desc), `機率要講出來：${call.desc}`);
});

// ★ 集訓默契目前零效果（trainingCamp.js:8-9,232-239 明寫「本卷零效果」）★
test('默契不得被寫成有作用', () => {
  const chem = HOW_TO_PLAY.find((t) => t.id === 'career')
    .sections.flatMap((s) => s.items).find((i) => i.term.includes('默契'));
  assert.ok(chem, '生涯系統沒講默契');
  assert.ok(/還沒有實際作用|只是記錄|零效果/.test(`${chem.term}${chem.desc}`),
    `默契目前沒有效果，文案不得暗示有：${chem.desc}`);
});

// ★ 落點圈畫的是球落地處，不是你該站的地方（08-10 真人踩坑：13.4% 人到了卻搆不到）★
test('落點圈那條必須講清楚它畫的是落地點', () => {
  const ring = HOW_TO_PLAY.find((t) => t.id === 'screen')
    .sections.find((s) => s.heading === '地上那個圈');
  assert.ok(ring, '看懂畫面沒有落點圈那一段');
  const cyan = ring.items.find((i) => i.term.includes('青圈'));
  assert.ok(/落地/.test(cyan.desc), `要講明是落地點：${cyan.desc}`);
  assert.ok(/不是你該站/.test(cyan.desc), `這正是玩家踩過的坑，要點破：${cyan.desc}`);
});

// 全域：不得出現「應該／大概／理論上」這類含糊詞——說明頁講的是規則，不是猜測
test('全篇不得出現含糊詞', () => {
  for (const line of everyLine()) {
    assert.equal(/理論上|應該可以|大概是/.test(line), false, `含糊詞：${line}`);
  }
});

// ★ 這些字串一律走 `textContent`（careerScreen.js:2 的專案鐵則：動態文字不走 innerHTML）★
//   ⇒ 寫 `**粗體**` 或 `<b>` 不會變粗，會**原樣印出星號與角括號**給玩家看。
//   本檔初稿真的犯過一次（內切那條寫了 `**只改路線，不改球權**`）。
test('文案不得夾帶 markdown／HTML 標記（textContent 會原樣印出來）', () => {
  for (const line of everyLine()) {
    assert.equal(/\*\*|<[a-zA-Z/]/.test(line), false,
      `這串會被原樣印出標記：${line}`);
  }
});
