// 4.6 追修（07-28 試玩）：S 分配窗兩段式——遠段唯讀、近段才可下指令。
// 卷五裁定 3（2026-08-02）：判準從空間（公尺）換成時間（距我接觸剩餘 tick）。
// 定值依據＝tools/set-window-eta-probe.mjs 實測（60 局 4843 波，窗長 p50 95 tick）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  setStageOf, setEtaOf, setPreviewTitle, setPanelTitle, SET_READY_TICKS,
} from '../src/input/setOptions.js';

test('setStageOf：球快到手上＝可下指令、還在飛＝唯讀預覽', () => {
  assert.equal(setStageOf(0), 'ready', '球已到手上');
  assert.equal(setStageOf(SET_READY_TICKS), 'ready', '門檻上恰好算近段');
  assert.equal(setStageOf(SET_READY_TICKS + 1), 'preview');
  assert.equal(setStageOf(95), 'preview', '實測窗長 p50＝開窗當下必為遠段');
});

// ★ 非恆真／非恆假（02 §6.1 條 6）★ 這條判準是**逐 tick 求值**的：同一波球
// 從開窗（p50 95 tick）遞減到接觸（0），必然跨過門檻一次 ⇒ 兩個分支在同一顆球上
// 都會出現。若哪天門檻被調到 ≥93（實測窗長最小值那一帶），'preview' 就再也不會
// 出現＝遠段恆假，那正是本卷要修掉的病（現制 48.6% 的球開窗即近段）。
test('setStageOf：門檻兩側都有合法樣本，且門檻值不得吃掉遠段', () => {
  assert.equal(setStageOf(SET_READY_TICKS + 1), 'preview', 'preview 側要取得到');
  assert.equal(setStageOf(SET_READY_TICKS - 1), 'ready', 'ready 側要取得到');
  assert.ok(SET_READY_TICKS < 93,
    `門檻 ${SET_READY_TICKS} ≥ 實測窗長下限 93 ⇒ 每一球都是近段，遠段恆假`);
  assert.ok(SET_READY_TICKS > 0, '門檻 ≤0 ⇒ 近段恆假，玩家永遠選不了人');
});

// ★★ 卷五最重要的一道護欄（2026-08-02，修一個自己引入的 CRITICAL）★★
//
// `ensureFlightPlan` 有 **flight 級呼叫鎖定**（ai.js:317
// `if (aiState.flightId === game.rally.flightId) return`）⇒ `setContactPoint.ticks`
// 是**規劃那一刻**距接觸的 tick 數，整波固定不變、**不會自己遞減**。
// 把它直接拿去比門檻的話它恆為 ~95 ⇒ setStageOf 恆回 'preview'
// ⇒ **近段永遠不開始、玩家永遠選不了人**。
//
// ★ 零替身 ★ 走真實 game loop 拿真實 `aiState`，呼叫**真實的** `setEtaOf`——
// 那支就是 UI 唯一的換算來源（matchLoop:851），所以這條測試量到的位置和玩家看到的
// 現象是同一件事（02 §6.1 條 5）。測試自己重抄一份換算式就會失去鑑別力：
// 那樣不管 `setEtaOf` 對不對，測試都會綠。
test('ETA 不變量：setEtaOf 真的會遞減，並跨過門檻進入近段', async () => {
  const { createGame, stepGame } = await import('../src/sim/game.js');
  const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
  let windows = 0;
  let crossed = 0;
  let sawPreview = 0;
  for (let seed = 1; seed <= 6; seed += 1) {
    const g = createGame({ seed, setTarget: 25 });
    const ai = createAiState();
    let cur = null;
    let guard = 0;
    while (g.phase !== 'set_over' && guard < 60000) {
      guard += 1;
      const intents = aiCollectIntents(g, ai);
      const eta = setEtaOf(ai, g.tick);
      if (g.phase === 'rally' && g.rally.touches === 1 && Number.isFinite(eta)) {
        if (!cur || cur.flightId !== g.rally.flightId) {
          cur = { flightId: g.rally.flightId, first: eta, min: eta, sawPreview: false };
          windows += 1;
        }
        cur.min = Math.min(cur.min, eta);
        if (setStageOf(eta) === 'preview') cur.sawPreview = true;
        if (cur.sawPreview && setStageOf(eta) === 'ready' && !cur.counted) {
          cur.counted = true; crossed += 1;
        }
        if (cur.sawPreview && !cur.previewCounted) { cur.previewCounted = true; sawPreview += 1; }
      }
      stepGame(g, intents);
    }
  }
  assert.ok(windows >= 20, `樣本不足（${windows} 個分配窗）＝這條測試沒有解析力`);
  // 遠段側：開窗當下必為 preview（窗長 p50 95 ≫ 門檻 55）
  assert.ok(sawPreview / windows > 0.9,
    `只有 ${(100 * sawPreview / windows).toFixed(1)}% 的窗出現過遠段＝時間判準沒生效`);
  // 近段側：**這一條就是那個 CRITICAL 的行為載體**——不扣 planTick 時 ETA 恆為 ~95，
  // 永遠跨不過門檻，這裡會是 0%
  assert.ok(crossed / windows > 0.9,
    `只有 ${(100 * crossed / windows).toFixed(1)}% 的窗從遠段跨進近段`
    + '＝ETA 沒有遞減（多半是漏扣 planTick），玩家選不了人');
});

test('ETA 不變量・呼叫端：matchLoop 必須走 setEtaOf，不得自己算一份', () => {
  // 上一條已經是真正的行為測試（走真實 setEtaOf）。這一條補的是**另一個失敗態**：
  // UI 繞過 setEtaOf 自己算一份 ⇒ 上一條照樣綠，但玩家看到的是另一套。
  // DOM 元件在 node --test 下建不起來（無 jsdom），沿既有先例用靜態源碼掃描守；
  // 走 stripComments，否則會被本卷自己的說明註解打綠。
  const src = readFileSync(new URL('../src/app/matchLoop.js', import.meta.url), 'utf8')
    .replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
  assert.match(src, /setEtaOf\(aiState,\s*game\.tick\)/,
    'matchLoop 沒走 setEtaOf＝換算有第二份真相');
  assert.ok(!/setContactPoint\?\.ticks/.test(src),
    'matchLoop 又自己去掏 setContactPoint.ticks＝繞過了單一真相');
});

test('setStageOf：算不出接觸點＝不擋操作（寧可早開也不吞掉決策權）', () => {
  assert.equal(setStageOf(null), 'ready');
  assert.equal(setStageOf(undefined), 'ready');
  assert.equal(setStageOf(NaN), 'ready', 'NaN 也走同一條退路，不得判成 preview 鎖住面板');
});

test('遠段標題仍給真值（一傳品質＋建議打誰），且與近段標題不同', () => {
  const preview = setPreviewTitle('perfect', '小飛·左翼');
  assert.ok(preview.includes('一傳到位'), '一傳品質是真值，遠段不得省略');
  assert.ok(preview.includes('小飛·左翼'), '協調層建議要看得到');
  assert.ok(preview.includes('先跑到位'));
  assert.notEqual(preview, setPanelTitle('perfect'));
  // 無建議時不留空欄
  assert.ok(!setPreviewTitle('ok', null).includes('建議'));
});
