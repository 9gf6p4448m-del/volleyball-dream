// 大作感二卷 批4（J4-2）：聯賽冠軍判定純函式——雙向直測
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLeagueFinaleEntry, leagueChampionshipTitleOf } from '../src/career/championship.js';
import { UNI_ROUNDS } from '../src/career/uniSchedule.js';
import { CORP_ROUNDS } from '../src/career/corpSchedule.js';

const UNI_FINALE = { id: `uni-r${UNI_ROUNDS}` };
const CORP_FINALE = { id: `corp-r${CORP_ROUNDS}` };

test('最終輪＋榜首＋賽程完整 → 冠軍標題（大學/企業各自）', () => {
  assert.equal(leagueChampionshipTitleOf(UNI_FINALE, 1, true), '大學聯賽冠軍');
  assert.equal(leagueChampionshipTitleOf(CORP_FINALE, 1, true), '企業聯賽冠軍');
});

test('反向：非榜首不慶祝（第 2 名也不行）', () => {
  assert.equal(leagueChampionshipTitleOf(UNI_FINALE, 2, true), null);
  assert.equal(leagueChampionshipTitleOf(CORP_FINALE, 4, true), null);
});

test('反向：非最終輪即使榜首也不慶祝（季中領先不算封王）', () => {
  assert.equal(leagueChampionshipTitleOf({ id: 'uni-r3' }, 1, true), null);
  assert.equal(leagueChampionshipTitleOf({ id: 'corp-r1' }, 1, true), null);
  assert.equal(isLeagueFinaleEntry({ id: 'uni-r3' }), false);
});

test('反向：積分表不完整（complete=false）不慶祝', () => {
  assert.equal(leagueChampionshipTitleOf(UNI_FINALE, 1, false), null);
});

test('單場決勝的 id（national-final/pro-final）不歸這支管', () => {
  assert.equal(leagueChampionshipTitleOf({ id: 'national-final' }, 1, true), null);
  assert.equal(isLeagueFinaleEntry({ id: 'pro-final-y1' }), false);
});

test('防呆：無 entry/無 id 一律 false/null', () => {
  assert.equal(isLeagueFinaleEntry(null), false);
  assert.equal(leagueChampionshipTitleOf({}, 1, true), null);
});
