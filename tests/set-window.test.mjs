// 4.6 追修（07-28 試玩）：S 分配窗兩段式——遠段唯讀、近段才可下指令。
// 定值依據＝tools/setter-reach-probe.mjs 實測（開窗當下 p50 要跑 2.72m、p90 5.97m）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setStageOf, setPreviewTitle, setPanelTitle, SET_READY_M } from '../src/input/setOptions.js';

test('setStageOf：門檻內＝可下指令、門檻外＝唯讀預覽', () => {
  assert.equal(setStageOf(0), 'ready');
  assert.equal(setStageOf(SET_READY_M), 'ready');
  assert.equal(setStageOf(SET_READY_M + 0.01), 'preview');
  assert.equal(setStageOf(6), 'preview');
});

test('setStageOf：算不出接觸點＝不擋操作（寧可早開也不吞掉決策權）', () => {
  assert.equal(setStageOf(null), 'ready');
  assert.equal(setStageOf(undefined), 'ready');
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
