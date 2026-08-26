// 債清批 2026-08-26 M3：stands 接線——止步旁觀的天鷹剪影穿天鷹球衣
//（配色卷 B4 範圍外掛帳「stands 無 cameraOpts 通道」的補接；改前紅：
//  ①事件無 cameraOpts ②stands B 隊 subjects 無 kit 欄）
// 附帶 M2 收斂守衛：career 層槽序三個出口必須是同一參照。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rivalSpectatorEvents } from '../src/career/rivalArc.js';
import { createCareer, recordResult } from '../src/career/careerState.js';
import { defaultSubjects, subjectTeamKit } from '../src/render/beatStage.js';
import { kitFor } from '../src/career/teamKit.js';
import { opponentById } from '../src/career/opponents.js';
import { RIVAL_TEAM_ID } from '../src/career/schedule.js';
// M2 的三個出口用動態 import（見該測）——改前紅驗證時 SLOT_ROLES 不存在，
// 靜態 import 會讓整檔載入失敗、把 M3 的行為級紅遮成旁枝錯誤（02 §6.1 第 1 條）。

// 同 beat-wiring 的局部治具（各測試檔慣例自帶）
function playUpTo(career, targetId) {
  let c = career;
  for (const m of c.schedule) {
    if (m.id === targetId) break;
    c = recordResult(c, { matchId: m.id, won: true, scoreFor: 25, scoreAgainst: 20 });
  }
  return c;
}

test('M3① 止步旁觀事件帶 cameraOpts.opponentKit＝天鷹 kit（stands 接線本體）', () => {
  // 止步治具＝beat-wiring 同款：八強循環三場全敗
  let c = playUpTo(createCareer({ seed: 13 }), 'national-qf');
  for (const m of c.schedule.filter((x) => x.round === 'rr')) {
    c = recordResult(c, { matchId: m.id, won: false, scoreFor: 20, scoreAgainst: 25 });
  }
  const evs = rivalSpectatorEvents({ career: c, seasonIndex: 1 });
  assert.equal(evs.length, 1);
  assert.equal(evs[0].camera, 'stands');
  const rivalKit = kitFor(opponentById(RIVAL_TEAM_ID));
  assert.ok(rivalKit, '天鷹必須有 kit 資料（否則本測失去意義）');
  assert.deepEqual(evs[0].cameraOpts?.opponentKit, rivalKit,
    '止步旁觀必須把天鷹 kit 從事件級 cameraOpts 傳下去');
});

test('M3② stands 模板：B 隊剪影經 subjectTeamKit 吃 opponentKit，A 隊（匿名對手）不吃', () => {
  const rivalKit = kitFor(opponentById(RIVAL_TEAM_ID));
  const subjects = defaultSubjects('stands', { opponentKit: rivalKit });
  const bs = subjects.filter((s) => s.teamId === 'B');
  const as = subjects.filter((s) => s.teamId === 'A');
  assert.ok(bs.length >= 2 && as.length >= 2, 'stands 是兩隊剪影');
  for (const s of bs) {
    assert.deepEqual(subjectTeamKit(s, { opponentKit: rivalKit }), rivalKit,
      'B 隊（奪冠方＝天鷹）必須穿 RIVAL_KIT');
  }
  for (const s of as) {
    assert.equal(subjectTeamKit(s, { opponentKit: rivalKit }), null,
      'A 隊＝匿名決賽對手：不吃 opponentKit、kitA 未傳＝回落預設');
  }
});

test('M2 收斂守衛：ROLE_ORDER／UNI_ROLE_ORDER／SLOT_ROLES 三者為同一參照', async () => {
  const { ROLE_ORDER } = await import('../src/career/careerState.js');
  const { UNI_ROLE_ORDER } = await import('../src/career/uniTeam.js');
  const { SLOT_ROLES } = await import('../src/career/lineup.js');
  assert.equal(ROLE_ORDER, SLOT_ROLES, 'careerState 必須 re-export lineup.SLOT_ROLES，不得另抄');
  assert.equal(UNI_ROLE_ORDER, SLOT_ROLES, 'uniTeam 必須 re-export 同一參照');
  assert.deepEqual(SLOT_ROLES, ['setter', 'outside', 'middle', 'opposite', 'outside', 'middle']);
});
