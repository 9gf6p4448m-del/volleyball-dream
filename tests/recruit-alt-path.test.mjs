// 2026-08-11 替代路徑卷 —— 二傳／自由人的招募軸
//
// ★ 病灶 ★ 12 個招募槽的 9 條 feat 軸裡，攻擊向 6、防守接發向 3、**組織向 0**。
//   玩二傳的人推不動任何一條（治具實測：S 每場起球 0.66、接發恆 0）、玩自由人的人
//   推不動攻擊那 6 條（不能攻不能攔）。使用者原話：「而這件事遊戲沒告訴你」。
//
// ★ 修法 ★ `altFeats`（替代路徑 OR）：原條件一字不動，另外接受助攻軸／起球軸，
//   **feat 與任一 altFeat 達成即算**。攻擊型玩家零影響。
//
// ★ 這一檔守的三件事 ★
//   ① 判定語意：OR 只放在壯舉軸，wins/stage 不跟著鬆（那兩軸本來就人人可達）
//   ② 門檻數值：逐槽對齊各自窗口（`tools/recruit-axis-distribution-probe.mjs` 實測），
//      防止日後有人「順手調整」把它改回不相稱的數字——`218130e` 的同族陷阱
//   ③ **結構守衛（按效果寫、不按入口寫）**：任何走攻擊向 feat 的招募槽都必須帶
//      兩條替代軸。日後新增招募對象時漏掛，這條會紅——否則結構性排除會靜悄悄回來
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECRUIT_CONDS, progressOf, featGainFor, altFeatsOf, altGainsFor, altProgressOf,
  accrueRecruitProgress, conditionMet, altFeatAvailableTo, altFeatRoleOf,
} from '../src/career/recruitment.js';
import { countSetAssistKills } from '../src/career/boxScore.js';

const touch = (team, playerId, kind, power = 1) => ({ type: 'TOUCH', team, playerId, kind, power });
const serve = (team, playerId) => ({ type: 'SERVE', team, playerId });
const blockTouch = (team, playerId) => ({ type: 'BLOCK_TOUCH', team, playerId });
const score = (team) => ({ type: 'SCORE', team });
const dead = () => ({ type: 'DEAD_BALL' });

// 我方一次完整得分波：對方發球 → 隊友一傳 → 我（A2）舉 → 隊友扣 → 得分
const assistRally = (attacker = 'A4') => [
  serve('B', 'B1'), touch('A', 'A5', 'receive', 0.8),
  touch('A', 'A2', 'set', 0.9), touch('A', attacker, 'spike', 1),
  dead(), score('A'),
];

// ════════════════════════════════════════════════════════════
// 一、助攻計數器（countSetAssistKills）
// ════════════════════════════════════════════════════════════

test('助攻：我舉→隊友扣→我方得分＝1；同一場多波各記各的', () => {
  assert.equal(countSetAssistKills(assistRally(), 'A2', 'A'), 1);
  assert.equal(
    countSetAssistKills([...assistRally('A4'), ...assistRally('A6')], 'A2', 'A'), 2,
  );
});

test('助攻：扣球沒得分就不算（被攔、被救起、對方得分）', () => {
  // 被攔死：BLOCK_TOUCH 蓋掉 lastTouch ⇒ 最後觸球不是那記扣球
  assert.equal(countSetAssistKills([
    serve('B', 'B1'), touch('A', 'A5', 'receive', 0.8),
    touch('A', 'A2', 'set', 0.9), touch('A', 'A4', 'spike', 1),
    blockTouch('B', 'B3'), dead(), score('B'),
  ], 'A2', 'A'), 0);
  // 被救起後我方失分
  assert.equal(countSetAssistKills([
    touch('A', 'A2', 'set', 0.9), touch('A', 'A4', 'spike', 1),
    touch('B', 'B5', 'receive', 0.7), dead(), score('B'),
  ], 'A2', 'A'), 0);
});

// ★這條守的是 08-11 覆審的 MEDIUM 修補★（第二輪實測：把 `boxScore.js` 的打斷分支
// 退回舊行為，其餘 30 條測試全綠——這個修補原本零守衛，而它的語意直接決定 9 個槽的
// 助攻門檻校準）。多轉換 rally：我舉的那球被救起，rally 繼續，**別人**舉的球才得分。
test('助攻：多轉換 rally 只記給真正舉那球的人（我舉的那球已經失敗了）', () => {
  const events = [
    serve('B', 'B1'), touch('A', 'A5', 'receive', 0.8),
    touch('A', 'A2', 'set', 0.9), touch('A', 'A4', 'spike', 1), // 我舉→A4 扣
    touch('B', 'B5', 'receive', 0.7), touch('B', 'B3', 'set', 0.8),
    touch('B', 'B4', 'spike', 1), // 對方救起並回擊
    touch('A', 'A6', 'receive', 0.7), touch('A', 'A3', 'set', 0.9), // ★這球是 A3 舉的★
    touch('A', 'A4', 'spike', 1), dead(), score('A'),
  ];
  assert.equal(countSetAssistKills(events, 'A2', 'A'), 0, '得分那球不是我舉的');
  assert.equal(countSetAssistKills(events, 'A3', 'A'), 1, '功勞歸真正舉那球的人');
});

test('助攻：自舉自扣不算（那是二次球，記在 dumpKills）', () => {
  assert.equal(countSetAssistKills([
    touch('A', 'A2', 'set', 0.9), touch('A', 'A2', 'spike', 1), dead(), score('A'),
  ], 'A2', 'A'), 0);
});

test('助攻：隊友舉的球不算我的、對方的舉球不算我的', () => {
  assert.equal(countSetAssistKills([
    touch('A', 'A3', 'set', 0.9), touch('A', 'A4', 'spike', 1), dead(), score('A'),
  ], 'A2', 'A'), 0);
  assert.equal(countSetAssistKills([
    touch('B', 'A2', 'set', 0.9), touch('B', 'B4', 'spike', 1), dead(), score('B'),
  ], 'A2', 'A'), 0);
});

// ════════════════════════════════════════════════════════════
// 二、替代軸的本場增量（altGainsFor）
// ════════════════════════════════════════════════════════════

const rallies = (n) => Array.from({ length: n }, () => assistRally()).flat();
// touches===1 才是起球（`boxScoreLFor` 的定義）
const dig = (kind) => [{
  type: 'TOUCH', team: 'A', playerId: 'AL', kind, power: 0.6, touches: 1,
}, dead()];
const digs = (n) => Array.from({ length: n }, (_, i) => dig(i % 2 ? 'dive' : 'receive')).flat();

test('assistMatch：單場助攻達 perMatch＝記 1 場，差一球＝0', () => {
  const cond = RECRUIT_CONDS['iron-mist-2']; // perMatch 17
  assert.equal(altGainsFor(rallies(17), 'A2', 'A', cond, 'setter').assistMatch, 1);
  assert.equal(altGainsFor(rallies(16), 'A2', 'A', cond, 'setter').assistMatch, 0);
});

test('saveMatch：單場起球達 perMatch＝記 1 場（第一觸 receive/dive 都算）', () => {
  const cond = RECRUIT_CONDS['obsidian-2']; // perMatch 4
  assert.equal(altGainsFor(digs(4), 'AL', 'A', cond, 'libero').saveMatch, 1);
  assert.equal(altGainsFor(digs(3), 'AL', 'A', cond, 'libero').saveMatch, 0);
});

// ★這一組守的是 08-11 對抗覆審抓到的 HIGH★：治具實測 OH 每場起球 12.84 次（比自由人
// 臂的 7.08 還高——自由人只在後排輪次上場）⇒ 不綁位置的話，「給自由人的替代路徑」
// 對主攻手近乎恆真，4 個槽會從 0% 跳到 33/50/92/33%，等於把那些槽的壯舉軸廢掉。
test('替代軸綁位置：主攻手的起球不算、二傳的起球也不算（只有自由人算）', () => {
  const cond = RECRUIT_CONDS['obsidian-2'];
  const plenty = digs(20); // 遠超門檻 4
  assert.equal(altGainsFor(plenty, 'AL', 'A', cond, 'libero').saveMatch, 1);
  for (const role of ['outside', 'opposite', 'middle', 'setter']) {
    assert.equal(altGainsFor(plenty, 'AL', 'A', cond, role).saveMatch, 0,
      `${role} 不該靠起球拿到自由人的替代路徑`);
  }
});

test('替代軸綁位置：助攻只有二傳算', () => {
  const cond = RECRUIT_CONDS['iron-mist-2'];
  const plenty = rallies(40);
  assert.equal(altGainsFor(plenty, 'A2', 'A', cond, 'setter').assistMatch, 1);
  for (const role of ['outside', 'opposite', 'middle', 'libero']) {
    assert.equal(altGainsFor(plenty, 'A2', 'A', cond, role).assistMatch, 0);
  }
});

test('位置缺值＝一律 0（安全預設往「不承諾」倒，不是往「送給你」倒）', () => {
  const cond = RECRUIT_CONDS['iron-mist-2'];
  assert.equal(altGainsFor(rallies(40), 'A2', 'A', cond).assistMatch, 0);
  assert.equal(altGainsFor(digs(20), 'AL', 'A', cond, null).saveMatch, 0);
});

test('原壯舉軸不綁位置（攻擊軸本來就人人可打，綁了反而是新的排除）', () => {
  const kills = Array.from({ length: 5 }, () => [
    touch('A', 'A2', 'spike', 1), score('A'),
  ]).flat();
  assert.equal(featGainFor(kills, 'A2', 'A', RECRUIT_CONDS['sky-hawk-2']), 1);
});

test('沒有 altFeats 的槽＝空物件（不憑空長出替代路徑）', () => {
  // 純 wins／stage 軸的三槽本來就人人可達，不需要也不該有替代路徑
  for (const key of ['north-tech', 'gale-shore', 'sky-hawk']) {
    assert.deepEqual(altFeatsOf(RECRUIT_CONDS[key]), [], key);
    assert.deepEqual(altGainsFor(assistRally(), 'A2', 'A', RECRUIT_CONDS[key], 'setter'), {}, key);
  }
});

// ════════════════════════════════════════════════════════════
// 三、進度累加與 OR 判定
// ════════════════════════════════════════════════════════════

const EMPTY_REC = { progress: {}, recruited: [] };

test('替代軸進度跨場累加，且與原 feat 各記各的', () => {
  let rec = EMPTY_REC;
  for (let i = 0; i < 2; i += 1) {
    rec = accrueRecruitProgress(rec, {
      opponentId: 'iron-mist', matchId: 'group-1', won: false,
      events: rallies(17), playerId: 'A2', myTeam: 'A', role: 'setter',
    });
  }
  assert.equal(altProgressOf(rec, 'iron-mist-2', 'assistMatch'), 2);
  assert.equal(progressOf(rec, 'iron-mist-2').feat, 0, '原 ACE 軸沒動');
  assert.equal(progressOf(rec, 'iron-mist-2').wins, 0);
});

test('OR 語意：原壯舉軸 0 但替代軸達標＝條件成立', () => {
  // iron-mist-2 是純壯舉軸（無 wins/stage）⇒ 替代軸達標即可入隊
  const rec = {
    progress: { 'iron-mist-2': { wins: 0, feat: 0, alts: { assistMatch: 2 } } },
    recruited: [],
  };
  assert.equal(conditionMet(rec, 'iron-mist-2'), true);
});

test('OR 只放寬壯舉軸——wins 沒到還是不算（替代路徑不是無差別降門檻）', () => {
  const rec = {
    progress: { 'gale-shore-2': { wins: 0, feat: 0, alts: { assistMatch: 2, saveMatch: 1 } } },
    recruited: [],
  };
  assert.equal(RECRUIT_CONDS['gale-shore-2'].wins, 1);
  assert.equal(conditionMet(rec, 'gale-shore-2'), false, 'wins 未達＝仍不成立');
  const withWin = {
    progress: { 'gale-shore-2': { wins: 1, feat: 0, alts: { saveMatch: 1 } } },
    recruited: [],
  };
  assert.equal(conditionMet(withWin, 'gale-shore-2'), true);
});

test('替代軸未達 count 不算（差一場也是不算）', () => {
  const rec = {
    progress: { 'iron-mist-2': { wins: 0, feat: 0, alts: { assistMatch: 1, saveMatch: 1 } } },
    recruited: [],
  };
  assert.equal(conditionMet(rec, 'iron-mist-2'), false);
});

test('舊存檔（沒有 alts 鍵）讀得動、不產生 NaN，且不會誤判達成', () => {
  const legacy = { progress: { 'iron-mist-2': { wins: 0, feat: 0 } }, recruited: [] };
  const p = progressOf(legacy, 'iron-mist-2');
  assert.deepEqual(p.alts, {});
  assert.equal(altProgressOf(legacy, 'iron-mist-2', 'assistMatch'), 0);
  assert.equal(conditionMet(legacy, 'iron-mist-2'), false);
  // 半殘條目（手改/匯入）：alts 有鍵但值是 undefined ⇒ 補 0，不得變成 NaN
  const broken = {
    progress: { 'iron-mist-2': { wins: 0, feat: 0, alts: { assistMatch: undefined } } },
    recruited: [],
  };
  assert.equal(altProgressOf(broken, 'iron-mist-2', 'assistMatch'), 0);
  assert.equal(Number.isNaN(altProgressOf(broken, 'iron-mist-2', 'assistMatch')), false);
});

test('攻擊型玩家零影響：原攻擊軸照舊可達成', () => {
  const kills = Array.from({ length: 5 }, () => [
    touch('A', 'A2', 'spike', 1), score('A'),
  ]).flat();
  const cond = RECRUIT_CONDS['sky-hawk-2'];
  assert.equal(featGainFor(kills, 'A2', 'A', cond), 1, '單場 5 殺＝原軸記 1 場');
  const rec = { progress: { 'sky-hawk-2': { wins: 0, feat: 1, alts: {} } }, recruited: [] };
  assert.equal(conditionMet(rec, 'sky-hawk-2'), true);
});

// ════════════════════════════════════════════════════════════
// 四、門檻守衛（改數字前先重跑探針）
// ════════════════════════════════════════════════════════════

// 這些 perMatch/count 是 08-11 逐槽量出來的（經驗達成率 40–59%，2453–2480 場/情境、
// 3 個 seed 家族）。**每一槽對齊的是它自己的窗口**——sky-hawk-2 的 31 看起來特別高，
// 是因為它的窗口全在淘汰賽（bo3/bo5、局數多），不是那一槽比較嚴。
const EXPECTED_ALTS = {
  obsidian: { assistMatch: [19, 2], saveMatch: [10, 1] },
  'obsidian-2': { assistMatch: [20, 2], saveMatch: [4, 2] },
  'iron-mist-2': { assistMatch: [17, 2], saveMatch: [5, 2] },
  'sky-hawk-2': { assistMatch: [31, 2], saveMatch: [13, 1] },
  'gale-shore-2': { assistMatch: [17, 3], saveMatch: [8, 1] },
  'black-pine': { assistMatch: [16, 3], saveMatch: [4, 3] },
  // 原軸就是防守／接發向的三槽：自由人走原軸即可，只補二傳那條路
  'white-wave': { assistMatch: [18, 3] },
  'iron-mist': { assistMatch: [17, 2] },
  'black-pine-2': { assistMatch: [16, 2] },
};

test('替代軸門檻守衛：逐槽數值與實測校準值一致', () => {
  for (const [key, want] of Object.entries(EXPECTED_ALTS)) {
    const got = Object.fromEntries(
      altFeatsOf(RECRUIT_CONDS[key]).map((f) => [f.type, [f.perMatch, f.count]]),
    );
    assert.deepEqual(got, want, `${key} 的替代軸門檻被改動——先重跑探針再改`);
  }
});

test('接發軸守衛：quality 0.70（0.71~0.79 那整段是空的）', () => {
  // 真人只產得出 {1.00, 0.70, 0.60, 0.50}（matchControls.js:198/468/472/514）、
  // 治具 AI 恆 0.75（ai.js:1773）⇒ 0.8＝只認完美接發、0.75＝真人零效果。
  for (const key of ['iron-mist', 'black-pine-2']) {
    assert.equal(RECRUIT_CONDS[key].feat.quality, 0.7,
      `${key} 的接發門檻只有 ≤0.70 對真人才有效果`);
  }
  // 反向：0.70 真的會納入「按了但沒抓到 Perfect」那一檔（0.7），而 0.6 仍不算
  const at = (power) => featGainFor(
    [serve('B', 'B1'), touch('A', 'AL', 'receive', power)], 'AL', 'A', RECRUIT_CONDS['iron-mist'],
  );
  assert.equal(at(1.0), 1, 'Perfect 接發照算');
  assert.equal(at(0.7), 1, '好接發（0.7 檔）現在也算');
  assert.equal(at(0.6), 0, '自動接（0.6 檔）仍不算');
});

// ════════════════════════════════════════════════════════════
// 五、結構守衛：按「危險的效果」寫，不按「已知的入口」寫
// ════════════════════════════════════════════════════════════

// ★這條守的是「效果」不是「入口」（08-11 覆審抓到第一版的錯）★
// 第一版寫成「攻擊向軸的槽要有兩條替代軸」——白名單只列 blockKill/blockKillMatch/
// aceMatch/killMatch，於是 `digMatch`／`strongReceive` 那三槽（對二傳同樣是死路：
// S 的接發在 `ai.js:719` 被仲裁排除、治具 2480 場逐場為 0）**恆綠**，等於守了一個
// 沒有敵人的門。改成直接問那個真正要防的效果：**每一個帶壯舉軸的招募槽，玩二傳的人
// 與玩自由人的人是不是都至少有一條路走得到**。日後新增招募對象漏掛，這條會紅。
//
// 「原軸這個位置走不走得到」的判準（依 sim 結構，不是印象）：
//   blockKill/blockKillMatch＝要攔網，自由人不能攔；二傳只有前排輪次偶爾攔
//   killMatch＝要扣球得分，自由人不能攻；二傳的二次球不計入 kills
//   aceMatch＝要發球得分（此表保守處理：兩個位置都不當作可靠路徑）
//   digMatch＝敵方扣球後的救球，自由人可；二傳 P(單場≥3)=4.4%
//   strongReceive＝接發，自由人可；二傳結構性恆 0
const BASE_FEAT_REACHABLE = {
  blockKill: [],
  blockKillMatch: [],
  aceMatch: [],
  killMatch: [],
  digMatch: ['libero'],
  strongReceive: ['libero'],
};

test('結構守衛：每個帶壯舉軸的槽，二傳與自由人都至少有一條走得到的路', () => {
  const blocked = [];
  for (const [key, cond] of Object.entries(RECRUIT_CONDS)) {
    if (!cond.feat) continue;
    const baseRoles = BASE_FEAT_REACHABLE[cond.feat.type];
    assert.ok(baseRoles, `未知壯舉軸型 ${cond.feat.type}——新增軸型時要一起想「誰走得到」`);
    for (const role of ['setter', 'libero']) {
      const viaBase = baseRoles.includes(role);
      const viaAlt = altFeatsOf(cond).some((f) => altFeatAvailableTo(f, role));
      if (!viaBase && !viaAlt) blocked.push(`${key}(${role})`);
    }
  }
  assert.deepEqual(blocked, [],
    '這些槽對該位置沒有任何可達路徑＝結構性排除又回來了；請補 altFeats（門檻要重量窗口）');
});

// ★軸型打錯字是靜默失效（08-11 第二輪覆審 N4）★：`gainOfAxis` 對認不得的型別回 0，
// 於是 `assistMach`（少一個 t）會讓判定端永遠給 0。判定端與顯示端現在都對未知型別
// 回「不可用」，這條再從資料面把它擋在出廠前。
test('結構守衛：每條替代軸的型別都是判定端認得的（防打錯字靜默失效）', () => {
  for (const [key, cond] of Object.entries(RECRUIT_CONDS)) {
    for (const f of altFeatsOf(cond)) {
      assert.ok(altFeatRoleOf(f), `${key} 掛了判定端認不得的軸型「${f.type}」＝永遠推不動`);
      assert.equal(altFeatAvailableTo(f, altFeatRoleOf(f)), true);
    }
  }
  // 反向對照：這條守衛對打錯字真的會紅
  assert.equal(altFeatRoleOf({ type: 'assistMach' }), null);
  assert.equal(altFeatAvailableTo({ type: 'assistMach' }, 'setter'), false,
    '未知軸型必須對所有位置都不可用——回 true 的話畫面會承諾一條推不動的路');
});

test('結構守衛：每條替代軸都有 label（進度列要把路講給玩家看）', () => {
  for (const [key, cond] of Object.entries(RECRUIT_CONDS)) {
    for (const f of altFeatsOf(cond)) {
      assert.equal(typeof f.label, 'string', `${key}/${f.type} 缺 label`);
      assert.ok(f.label.length > 0, `${key}/${f.type} 的 label 是空字串`);
      assert.ok(String(f.label).includes(String(f.perMatch)),
        `${key}/${f.type} 的 label「${f.label}」沒寫出門檻數字＝畫面與判準脫鉤`);
    }
  }
});
