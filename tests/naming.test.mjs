// 命名工程（2026-07-25）名單一致性測試：
// ①七隊 squad 六人名非空且隊內唯一（含自由人） ②ace slot 有效且指向本人
// ③全專案全名不撞名（七隊＋我方） ④招募生 fullName＝對手名單同一人、role 對得上槽位
// ⑤buildOpponentTeam 實際吃 squad ⑥我方 STARTER_DEFS 全員有 fullName
import test from 'node:test';
import assert from 'node:assert/strict';
import { OPPONENTS, opponentById } from '../src/career/opponents.js';
import { STARTER_DEFS } from '../src/career/roster.js';
import { RECRUIT_CONDS, recruitDefOf, buildRecruitMember } from '../src/career/recruitment.js';
import { buildOpponentTeam } from '../src/career/careerState.js';

// 槽序鏡射 careerState ROLE_ORDER（該常數未 export；序變會被本測試抓到）
const ROLE_ORDER = ['setter', 'outside', 'middle', 'opposite', 'outside', 'middle'];

test('naming：七隊 squad 六人名非空、隊內唯一（含自由人）', () => {
  for (const o of OPPONENTS) {
    assert.equal(o.squad?.length, 6, `${o.id} squad 須六人`);
    for (const n of o.squad) assert.ok(typeof n === 'string' && n.length >= 2, `${o.id} 有空名`);
    assert.ok(typeof o.libero === 'string' && o.libero.length >= 2, `${o.id} 缺自由人名`);
    const all = [...o.squad, o.libero];
    assert.equal(new Set(all).size, all.length, `${o.id} 隊內撞名`);
  }
});

test('naming：ace slot 有效且 name 指向該槽位本人、title 非空', () => {
  for (const o of OPPONENTS) {
    const ace = o.ace;
    assert.ok(ace && ace.name && ace.title, `${o.id} 缺 ace`);
    if (ace.slot === 'L') {
      assert.equal(ace.name, o.libero, `${o.id} ace(L) 名不符自由人`);
    } else {
      assert.ok(Number.isInteger(ace.slot) && ace.slot >= 0 && ace.slot <= 5, `${o.id} ace.slot 超界`);
      assert.equal(ace.name, o.squad[ace.slot], `${o.id} ace 名不符槽位`);
    }
  }
});

test('naming：全專案全名不撞名（七隊 49 人＋我方 6 人）', () => {
  const names = [];
  for (const o of OPPONENTS) names.push(...o.squad, o.libero);
  for (const d of STARTER_DEFS) names.push(d.fullName);
  assert.equal(new Set(names).size, names.length, '跨隊全名重複');
});

test('naming：招募生 fullName＝對手名單同一人、role 對應槽位', () => {
  for (const [key, cond] of Object.entries(RECRUIT_CONDS)) {
    const team = opponentById(cond.opponentId);
    assert.ok(team, `${key} 來源隊不存在`);
    const def = recruitDefOf(key);
    assert.ok(def?.name && def?.fullName, `${key} 缺 name/fullName`);
    if (cond.role === 'libero') {
      assert.equal(def.fullName, team.libero, `${key} 自由人全名不符`);
    } else {
      const slots = ROLE_ORDER
        .map((r, i) => (r === cond.role ? i : -1))
        .filter((i) => i >= 0);
      assert.ok(
        slots.some((i) => team.squad[i] === def.fullName),
        `${key} 全名 ${def.fullName} 不在 ${cond.opponentId} 的 ${cond.role} 槽位`,
      );
    }
  }
});

test('naming：buildOpponentTeam 實際輸出 squad 名；無 squad 回退 N號', () => {
  for (const o of OPPONENTS) {
    const team = buildOpponentTeam(o);
    assert.deepEqual(team.map((p) => p.name), o.squad, `${o.id} 建隊名不符 squad`);
  }
  const legacy = buildOpponentTeam({ id: 'x', name: '測試隊', level: 50, heights: [1.8, 1.8, 1.8, 1.8, 1.8, 1.8] });
  assert.equal(legacy[0].name, '測試隊1號');
});

test('naming：我方 STARTER_DEFS 全員 fullName 非空唯一、隊長帶稱號', () => {
  const fulls = STARTER_DEFS.map((d) => d.fullName);
  assert.ok(fulls.every((n) => typeof n === 'string' && n.length >= 2));
  assert.equal(new Set(fulls).size, fulls.length);
  const captain = STARTER_DEFS.find((d) => d.captain);
  assert.ok(captain?.title, '隊長缺稱號');
  // 招募生入隊帶 fullName（隊友卡顯示）
  const m = buildRecruitMember('obsidian', 7, 'R1');
  assert.equal(m.fullName, '詹子曜');
  assert.equal(m.name, '阿曜');
});
