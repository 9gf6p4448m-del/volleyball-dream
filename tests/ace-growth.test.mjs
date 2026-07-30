// 試玩回饋 0730 §四 D1（黑松/青嵐 ace 降年級）＋§五 N2（宿敵吃成長系統）
// 驗收軸：①兩隊 ace 基準年級 1＝與玩家同期、第二三屆都在（不再登場即畢業）
// ②跨屆走成長期身高曲線（沿用 heightGrowth 那一套）＋能力逐屆上修
// ③情蒐/建隊/挖角三處讀「當屆值」而非建檔常數（單一真相）
// ④第 1 屆逐值零漂移（sim-hash 基準不動的前置條件）
// ⑤耦合：ace 年級改動＝挖角目標「畢業即作廢」時點跟著變（recruitment.js recruitTargetGone）
import test from 'node:test';
import assert from 'node:assert/strict';
import { OPPONENTS, opponentById } from '../src/career/opponents.js';
import {
  applySeasonRoster, buildOpponentTeam, careerMatchSetup, currentGrade,
  createCareer, createCareerPlayer,
} from '../src/career/careerState.js';
import {
  aceGrows, aceGrowthAt, aceHeightPlanCm, withAceGrowth, ACE_ATTR_CURVE,
} from '../src/career/aceGrowth.js';
import { buildHeightPlan, growthBandOf } from '../src/career/heightGrowth.js';
import {
  recruitGradeOf, recruitCurrentGrade, recruitTargetGone, buildRecruitMember, recruitDefOf,
} from '../src/career/recruitment.js';
import { buildStarterMembers } from '../src/career/roster.js';

const GROWN = ['gale-shore', 'black-pine'];

// ---- D1 年級與敘事 ----

test('D1：黑松/青嵐 ace 基準年級降為 1（與玩家同期）——第 2、3 屆都還在，不再登場即畢業', () => {
  for (const id of GROWN) {
    const def = opponentById(id);
    const slot = def.ace.slot;
    assert.equal(def.grades[slot], 1, `${id} ace 基準年級須為 1–2`);
    for (const season of [1, 2, 3]) {
      const g = currentGrade(def.grades[slot], season);
      assert.ok(g <= 3, `${id} ace 第 ${season} 屆年級 ${g} ＝已畢業，第二三屆再戰不成立`);
      assert.equal(applySeasonRoster(def, season).ace.name, def.ace.name,
        `${id} ace 第 ${season} 屆不得被遞補換臉`);
    }
    assert.equal(currentGrade(def.grades[slot], 3), 3, `${id} ace 第 3 屆恰為三年級（完成版）`);
  }
});

test('D1：persona／稱號／播報全面改成長線口徑——舊悲壯字樣一律不得殘留', () => {
  const BANNED = ['三年級最後一屆', '最後的牆', '牆不想再輸'];
  const texts = [
    ...GROWN.map((id) => recruitDefOf(id).persona),
    ...GROWN.map((id) => opponentById(id).ace.title),
  ];
  for (const t of texts) {
    for (const bad of BANNED) {
      assert.ok(!t.includes(bad), `殘留舊悲壯敘事：「${bad}」 in ${t}`);
    }
  }
  // 成長線關鍵字（同期／再戰／一年一次）在兩人 persona 各要看得到
  assert.ok(recruitDefOf('black-pine').persona.includes('同一屆'));
  assert.ok(recruitDefOf('gale-shore').persona.includes('同一屆'));
  assert.equal(opponentById('black-pine').ace.title, '未完成的牆');
});

test('D1 耦合：ace 降年級＝挖角目標「畢業即作廢」時點跟著變（三屆都招得到）', () => {
  for (const id of GROWN) {
    assert.equal(recruitGradeOf(id), 1, `${id} 招募目標年級須由來源隊 grades 導出＝1`);
    for (const season of [1, 2, 3]) {
      assert.equal(recruitTargetGone(id, season), false,
        `${id} 第 ${season} 屆不得作廢（降年級前：第 2 屆起即作廢）`);
      assert.equal(recruitCurrentGrade(id, season), season);
    }
  }
  // 對照組：詹子曜仍是三年級招募目標——第 2 屆起照樣作廢（「只能用一年」取捨還在）
  assert.equal(recruitGradeOf('obsidian'), 3);
  assert.equal(recruitTargetGone('obsidian', 1), false);
  assert.equal(recruitTargetGone('obsidian', 2), true);
});

// ---- N2 成長曲線 ----

test('N2：只有掛 grows 旗標的 ace 吃成長（天鷹宿敵與其餘五隊零改動）', () => {
  for (const o of OPPONENTS) {
    assert.equal(aceGrows(o), GROWN.includes(o.id), `${o.id} grows 判定不符`);
    if (!GROWN.includes(o.id)) {
      assert.equal(aceGrowthAt(o, 2), null, `${o.id} 不得產生成長值`);
      assert.equal(withAceGrowth(o, 3), o, `${o.id} 須回原物件（零擾動）`);
    }
  }
  // 天鷹（宿敵三幕劇本）一行不碰：三屆皆恆等
  const hawk = opponentById('sky-hawk');
  for (const s of [1, 2, 3]) assert.equal(applySeasonRoster(hawk, s), hawk);
});

test('N2：身高曲線＝沿用玩家那一套 heightGrowth（反比幅度帶、逐屆遞增、第 1 屆＝建檔值）', () => {
  for (const id of GROWN) {
    const def = opponentById(id);
    const baseCm = Math.round(def.heights[def.ace.slot] * 100);
    const plan = aceHeightPlanCm(def);
    assert.equal(plan.length, 3);
    assert.equal(plan[0], baseCm, '第 1 屆＝建檔身高（零漂移）');
    assert.ok(plan[1] > plan[0] && plan[2] >= plan[1], '曲線須單調不遞減、第一次成長 ≥1cm');
    // 幅度帶：總成長落在該身高帶的區間內（矮的長多、高的長少）
    const band = growthBandOf(baseCm);
    const total = plan[2] - plan[0];
    assert.ok(total >= band.total[0] && total <= band.total[1],
      `${id} 總成長 ${total} 不在 ${band.key} 帶 ${band.total} 內`);
    // 與 heightGrowth.buildHeightPlan 逐值相同＝真的沿用同一條公式（不是另造一套）
    const g2 = aceGrowthAt(def, 2);
    const g3 = aceGrowthAt(def, 3);
    assert.equal(g2.heightCm, plan[1]);
    assert.equal(g3.heightCm, plan[2]);
    assert.equal(g3.grewCm, plan[2] - plan[1]);
    // 能力曲線：逐屆累積、增量遞減
    assert.equal(aceGrowthAt(def, 1).attrBonus, 0);
    assert.deepEqual([g2.attrBonus, g3.attrBonus], [ACE_ATTR_CURVE[1], ACE_ATTR_CURVE[2]]);
    assert.ok(g3.attrBonus - g2.attrBonus < g2.attrBonus, '增量須逐屆遞減（成長期曲線）');
  }
  // 反比幅度帶的實例：179cm 的小嵐長得比 201cm 的老松多
  const galeTotal = aceHeightPlanCm(opponentById('gale-shore')).at(-1)
    - aceHeightPlanCm(opponentById('gale-shore'))[0];
  const pineTotal = aceHeightPlanCm(opponentById('black-pine')).at(-1)
    - aceHeightPlanCm(opponentById('black-pine'))[0];
  assert.ok(galeTotal > pineTotal, '矮的長得多＝與主角同一條反比規則');
  // 決定論：種子綁 ace 全名（不隨存檔變）——同一個宿敵在任何存檔都同一條曲線
  const def = opponentById('black-pine');
  assert.deepEqual(aceHeightPlanCm(def), aceHeightPlanCm({ ...def }));
  assert.deepEqual(
    aceHeightPlanCm(def),
    buildHeightPlan({ seed: hashName(def.ace.name), heightCm: 201 }),
  );
});

// 與 aceGrowth.js 同一條 FNV-1a（測試端獨立實作＝公式對得上才過）
function hashName(str) {
  let h = 0x811c9dc5 >>> 0;
  for (const ch of String(str)) {
    h = (h ^ ch.codePointAt(0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

test('N2：建隊讀當屆值——ace 身高與能力逐屆上修，其餘五人與板凳一律不動', () => {
  const def = opponentById('black-pine');
  const slot = def.ace.slot;
  const s1 = buildOpponentTeam(applySeasonRoster(def, 1));
  const s2 = buildOpponentTeam(applySeasonRoster(def, 2));
  const s3 = buildOpponentTeam(applySeasonRoster(def, 3));
  assert.equal(s1[slot].height.current, def.heights[slot], '第 1 屆＝建檔常數（零漂移）');
  assert.ok(s2[slot].height.current > s1[slot].height.current);
  assert.ok(s3[slot].height.current > s2[slot].height.current);
  assert.equal(s2[slot].attributes.block, s1[slot].attributes.block + ACE_ATTR_CURVE[1]);
  assert.equal(s3[slot].attributes.jump, s1[slot].attributes.jump + ACE_ATTR_CURVE[2]);
  // 同隊其他五人逐值不動（屬性表除 ace 成長外不動）
  for (let i = 0; i < 6; i += 1) {
    if (i === slot) continue;
    assert.equal(s3[i].height.current, s1[i].height.current, `槽 ${i} 身高被動了`);
    assert.deepEqual(s3[i].attributes, s1[i].attributes, `槽 ${i} 屬性被動了`);
  }
  // 對手板凳吃 heights 槽（RESERVE_HEIGHT_SLOT）——ace 長高不得連帶把同角色板凳墊高
  const career = createCareer({ seed: 5, playerName: '測' });
  const player = createCareerPlayer('測');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const entry = { id: 'group-1', opponentId: 'black-pine' };
  const b1 = careerMatchSetup(career, player, entry, roster, null, 1).benches.B;
  const b3 = careerMatchSetup(career, player, entry, roster, null, 3).benches.B;
  assert.deepEqual(
    b3.map((p) => [p.name, p.height.current]),
    b1.map((p) => [p.name, p.height.current]),
    '板凳身高不得跟著 ace 長高',
  );
});

test('N2：情蒐顯示端與 sim 讀同一個當屆值（aceHeight 單一真相，非建檔常數）', () => {
  for (const id of GROWN) {
    const base = opponentById(id);
    const slot = base.ace.slot;
    for (const season of [2, 3]) {
      // 情蒐畫面（careerScreen showMatchupScreen）吃的就是 applySeasonRoster 的輸出
      const shown = applySeasonRoster(base, season);
      const growth = aceGrowthAt(base, season);
      assert.equal(shown.aceHeight, growth.heightM, `${id} 第 ${season} 屆情蒐身高不是當屆值`);
      assert.notEqual(shown.aceHeight, base.heights[slot], '情蒐仍在讀建檔常數');
      assert.equal(shown.aceAttrBonus, growth.attrBonus);
      // heights 陣列本體不得被改寫（板凳與其餘顯示端共用它）
      assert.deepEqual(shown.heights, base.heights);
      // sim 建隊讀到的與畫面顯示的是同一個數
      const built = buildOpponentTeam(shown)[slot];
      assert.equal(built.height.current, shown.aceHeight);
    }
  }
});

test('N2：挖到成長型 ace＝入隊身高取當屆值（情蒐 2.03m 不會變回隊友卡 2.01m）', () => {
  const def = opponentById('black-pine');
  const base = def.heights[def.ace.slot];
  assert.equal(buildRecruitMember('black-pine', 42, 'R1', null, 1).height, base);
  for (const season of [2, 3]) {
    const m = buildRecruitMember('black-pine', 42, 'R1', null, season);
    assert.equal(m.height, aceGrowthAt(def, season).heightM, `第 ${season} 屆入隊身高不是當屆值`);
  }
  // 非 ace 的招募目標（同隊第二人大柏）照舊吃建檔槽位常數
  const second = buildRecruitMember('black-pine-2', 42, 'R2', null, 3);
  assert.equal(second.height, def.heights[3]);
});
