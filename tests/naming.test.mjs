// 命名工程（2026-07-25）名單一致性測試：
// ①七隊 squad 六人名非空且隊內唯一（含自由人） ②ace slot 有效且指向本人
// ③全專案全名不撞名（七隊＋我方） ④招募生 fullName＝對手名單同一人、role 對得上槽位
// ⑤buildOpponentTeam 實際吃 squad ⑥我方 STARTER_DEFS 全員有 fullName
import test from 'node:test';
import assert from 'node:assert/strict';
import { OPPONENTS, opponentById } from '../src/career/opponents.js';
import { STARTER_DEFS, buildStarterMembers } from '../src/career/roster.js';
import {
  RECRUIT_CONDS, recruitDefOf, buildRecruitMember, recruitGradeOf,
} from '../src/career/recruitment.js';
import {
  buildOpponentTeam, applyPoaching, careerMatchSetup, createCareer, createCareerPlayer, nextMatch,
} from '../src/career/careerState.js';
import { FRESHMAN_HANDWRITTEN, FRESHMAN_NAME_POOL } from '../src/career/graduation.js';

// 槽序鏡射 careerState ROLE_ORDER（債清批 2026-08-26 起已 export＝lineup.SLOT_ROLES；
// 本鏡射刻意保留硬編碼不改 import——序變仍會被本測試抓到，import 的話就自動跟著變、失去守衛力）
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

test('naming：全專案全名不撞名（七隊 49 人＋替補 28 人＋我方 6 人＋新生）', () => {
  const names = [];
  for (const o of OPPONENTS) {
    // W4 題6：天鷹 5 名（周羽辰讓位宿敵移板凳）；其餘 4 名（W1 板凳擴充）
    assert.equal(o.reserves?.length, o.id === 'sky-hawk' ? 5 : 4,
      `${o.id} 遞補人數不符（W1 擴充 4；sky-hawk 宿敵改編 5）`);
    names.push(...o.squad, o.libero, ...o.reserves.map((r) => r.name));
  }
  for (const d of STARTER_DEFS) names.push(d.fullName);
  // W1(P4)：手寫新生＋程序生成名池一併入檢（新生入隊不得與任何具名球員撞名）
  for (const def of Object.values(FRESHMAN_HANDWRITTEN)) names.push(def.fullName);
  names.push(...FRESHMAN_NAME_POOL);
  assert.equal(new Set(names).size, names.length, '跨隊全名重複');
});

// W1(P4)：遞補物件欄位齊全（板凳/遞補雙系統吃同一批資料的形狀合約）
test('naming：reserves 物件形狀——name/role/grade/drop 齊全、隊內含遞補不撞名', () => {
  const ROLES = new Set(['setter', 'outside', 'middle', 'opposite']);
  for (const o of OPPONENTS) {
    for (const r of o.reserves) {
      assert.ok(typeof r.name === 'string' && r.name.length >= 2, `${o.id} 遞補缺名`);
      assert.ok(ROLES.has(r.role), `${o.id} 遞補 ${r.name} 角色非法`);
      assert.ok([1, 2].includes(r.grade), `${o.id} 遞補 ${r.name} 年級須 1-2`);
      assert.ok(Number.isFinite(r.drop) && r.drop > 0, `${o.id} 遞補 ${r.name} 缺 drop`);
    }
    const all = [...o.squad, o.libero, ...o.reserves.map((r) => r.name)];
    assert.equal(new Set(all).size, all.length, `${o.id} 隊內（含遞補）撞名`);
  }
});

test('naming：挖角除名——招募生不再現身原隊、槽位遞補、王牌被挖=ace 拔除', () => {
  const obsidian = opponentById('obsidian');
  const p = applyPoaching(obsidian, ['詹子曜']);
  assert.ok(!p.squad.includes('詹子曜'));
  assert.equal(p.squad[2], obsidian.reserves[0].name); // MB 槽由遞補頂上（W1：物件遞補）
  assert.equal(p.grades[2], obsidian.reserves[0].grade); // 年級隨人同步
  assert.equal(p.reserves.length, 3); // 被消耗者自板凳移除（剩餘者＝該場板凳）
  assert.equal(p.ace, null); // 王牌被挖＝稱號播報消失
  assert.equal(obsidian.ace?.name, '詹子曜'); // 原參數檔不可變
  assert.equal(obsidian.reserves.length, 4);
  const wave = applyPoaching(opponentById('white-wave'), ['蔡沐恩']); // 自由人被挖
  assert.equal(wave.libero, opponentById('white-wave').reserves[0].name);
  assert.equal(wave.ace, null);
  const same = applyPoaching(obsidian, ['沒這個人']);
  assert.equal(same, obsidian); // 無命中＝原物件（零擾動）
});

test('naming：careerMatchSetup 整場接線——已招募者從對手隊消失', () => {
  const career = createCareer({ seed: 7, playerName: '小夢' });
  const player = createCareerPlayer('小夢');
  const recruit = buildRecruitMember('north-tech', 7, 'R1'); // 杜品澄（北原王牌 S）
  const roster = { capacity: 12, members: [...buildStarterMembers(), recruit] };
  const entry = nextMatch(career); // group-1＝北原工商
  assert.equal(entry.opponentId, 'north-tech');
  const setup = careerMatchSetup(career, player, entry, roster, null);
  const bNames = setup.teams.B.map((x) => x.name);
  assert.ok(!bNames.includes('杜品澄'), '被挖角者仍在原隊名單');
  assert.equal(setup.teams.B[0].name, opponentById('north-tech').reserves[0].name);
  assert.equal(setup.opponent.ace, null);
  // W1(P4) A1：對手板凳＝剩餘遞補（4 名被挖角消耗 1 名→3 名），具名建隊
  assert.equal(setup.benches.B.length, 3);
  assert.ok(setup.benches.B.every((b) => b.teamId === 'B' && b.name.length >= 2));
});

// W1(P4)：年級資料不變式＋招募年級導出一致（憲法 Q1/Q3/Q4）
test('naming：grades 不變式——非 ace 基準年級 ≤2、三年級 ace 恰為拍板四人、接班人年級 1', () => {
  const gradeThreeAces = [];
  for (const o of OPPONENTS) {
    assert.equal(o.grades?.length, 6, `${o.id} 缺 grades`);
    assert.ok(o.grades.every((g) => [1, 2, 3].includes(g)), `${o.id} grades 值非法`);
    assert.ok([1, 2].includes(o.liberoGrade) || (o.ace?.slot === 'L' && o.liberoGrade === 3),
      `${o.id} liberoGrade 非法`);
    for (let i = 0; i < 6; i += 1) {
      if (o.ace?.slot !== i) {
        // 還魂防線：無 49 人輪替＝非 ace 不得三年級（畢業了卻繼續出賽的矛盾）
        assert.ok(o.grades[i] <= 2, `${o.id} 非 ace 槽 ${i} 不得三年級`);
      }
    }
    const aceGrade = o.ace?.slot === 'L' ? o.liberoGrade : o.grades[o.ace.slot];
    if (aceGrade === 3) {
      gradeThreeAces.push(o.ace.name);
      // 接班人（title 持有者）＝drop 最小、基準年級 1（三屆內不二次畢業）
      const heir = o.reserves.reduce((a, r) => (a == null || r.drop < a.drop ? r : a), null);
      assert.ok(heir?.title, `${o.id} 三年級 ace 缺具稱號接班人`);
      assert.equal(heir.grade, 1, `${o.id} 接班人 ${heir.name} 年級須 1`);
    }
  }
  // 拍板名單（2026-07-26 曜/鷹/嵐/松 → 07-27 宿敵拍板：天鷹 ace 換莊敬嶺 grade 1＋
  // rival 豁免、王勝翔降 grade 2 → 07-30 D1：黑松曾家松/青嵐簡子嵐降 grade 1＝與玩家
  // 同期成長、第二三屆再戰）＝三年級 ace 只剩詹子曜（第 1 屆末畢業→換臉仍在）
  assert.deepEqual(gradeThreeAces, ['詹子曜']);
  // 宿敵 ace 不變式：rival 旗標＋與玩家同屆（grade 1）＝第 3 屆同屆畢業自然收束
  const hawk = OPPONENTS.find((o) => o.id === 'sky-hawk');
  assert.equal(hawk.ace.rival, true);
  assert.equal(hawk.grades[hawk.ace.slot], 1, '宿敵與玩家同屆（grade 1）');
});

test('naming：招募目標年級由來源隊導出——逐鍵可解析、配比符合 Q3（≥1 三年級、≥2 一年級）', () => {
  let g1 = 0;
  let g3 = 0;
  for (const key of Object.keys(RECRUIT_CONDS)) {
    const g = recruitGradeOf(key);
    assert.ok([1, 2, 3].includes(g), `${key} 年級無法導出`);
    if (g === 1) g1 += 1;
    if (g === 3) g3 += 1;
  }
  assert.ok(g3 >= 1, '至少 1 名三年級招募目標（展示「只能用一年」）');
  assert.ok(g1 >= 2, '至少 2 名一年級招募目標');
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
