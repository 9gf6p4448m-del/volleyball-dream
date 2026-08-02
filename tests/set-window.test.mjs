// 4.6 追修（07-28 試玩）：S 分配窗兩段式——遠段唯讀、近段才可下指令。
// 卷五裁定 3（2026-08-02）：判準從空間（公尺）換成時間（距我接觸剩餘 tick）。
// 定值依據＝tools/set-window-eta-probe.mjs 實測（60 局 4843 波，窗長 p50 95 tick）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  setStageOf, setPreviewTitle, setPanelTitle, SET_READY_TICKS,
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
