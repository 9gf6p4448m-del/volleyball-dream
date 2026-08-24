// 配色卷批 1 —— 驗收 K2/K3/K4/K5 的機械守門（acceptance-kit-batch1.md）
// K2 identity ≥100、K3 可讀性/自由人對比 ≥150：checkKitPalette 永久斷言；
// 內建鑑別力對照（壞色票必被抓）——「檢查函式恆空」的壞實作在此變紅。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  kitFor, cssColor, colorDistance, checkKitPalette, OUR_ANCHORS,
} from '../src/career/teamKit.js';
import { resolveKit } from '../src/render/geoCharacter.js';
import { OPPONENTS } from '../src/career/opponents.js';
import { UNIVERSITIES, universityById } from '../src/career/universities.js';
import { opponentById } from '../src/career/opponents.js';
import { careerMatchSetup, createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { resolveMatchConfig } from '../src/app/matchConfig.js';

const ALL_TEAMS = [...OPPONENTS, ...UNIVERSITIES];
const entries = ALL_TEAMS.map((d) => ({ id: d.id, kit: kitFor(d) }));

test('K2/K3：16 隊色票全門檻通過（identity≥100、對我方兩色與隊內對比≥150）', () => {
  assert.equal(ALL_TEAMS.length, 16); // 高中 7＋大學 9——隊數變了要回來重審色票
  assert.deepEqual(checkKitPalette(entries), []);
});

test('K2 鑑別力對照：壞色票必被 checkKitPalette 抓到（恆空的檢查器在此變紅）', () => {
  // ①兩隊同球衣色 → identity 違規
  const dup = entries.map((e) => ({ ...e, kit: { ...e.kit, libero: { ...e.kit.libero } } }));
  dup[1].kit.jersey = dup[0].kit.jersey;
  assert.ok(checkKitPalette(dup).some((v) => v.startsWith('identity')));
  // ②球衣撞我方藍 → 可讀性違規
  const clash = structuredClone(entries);
  clash[2].kit.jersey = OUR_ANCHORS.jersey;
  assert.ok(checkKitPalette(clash).some((v) => v.includes('我方球衣')));
  // ③自由人穿隊色 → 隊內對比違規
  const flat = structuredClone(entries);
  flat[3].kit.libero.jersey = flat[3].kit.jersey;
  assert.ok(checkKitPalette(flat).some((v) => v.includes('隊內自由人對比')));
  // ⑤部分缺欄位（覆審 MEDIUM）：缺 shorts 會靜默變白，必須在資料層被抓
  const holey = structuredClone(entries);
  delete holey[4].kit.shorts;
  assert.ok(checkKitPalette(holey).some((v) => v.includes('缺 shorts')));
  // ④參照組：已知「該撞」的距離都在門檻下（門檻不是恆真式）
  assert.ok(colorDistance(0xf4f7ff, 0xfff1c9) < 100); // 白 vs 米白
  assert.ok(colorDistance(0xffc531, 0xf59d1e) < 100); // 金 vs 橙金
});

test('K5 回退安全：無 kit 的隊回落側別預設（resolveKit／kitFor）', () => {
  assert.equal(kitFor({}), null);
  assert.equal(kitFor(null), null);
  // 側別預設值＝geoCharacter 現行 TEAM_KIT/LIBERO_KIT（K4 錨定：A 藍/金不動）
  assert.equal(resolveKit('A', false, null).jersey, 0x2e7bff);
  assert.equal(resolveKit('A', true, null).jersey, 0xffc531);
  assert.equal(resolveKit('B', false, null).jersey, 0xff5340);
  assert.equal(resolveKit('B', true, null).jersey, 0xf2f4f8);
  // kit 覆寫：場員穿 kit 本體、自由人穿 kit.libero；kit 缺 libero＝回側別預設（防呆）
  const kit = kitFor(opponentById('sky-hawk'));
  assert.equal(resolveKit('B', false, kit).jersey, 0xf4f7ff);
  assert.equal(resolveKit('B', true, kit).jersey, 0x1b2b52);
  assert.equal(resolveKit('B', true, { jersey: 1 }).jersey, 0xf2f4f8);
});

test('接線：careerMatchSetup 產出 kits.B＝該對手 kit（高中與大學同一條入口）', () => {
  const career = createCareer({ seed: 123, playerName: '測試' });
  const player = createCareerPlayer('測試');
  const hs = careerMatchSetup(career, player, career.schedule[0], null, null, 1);
  assert.deepEqual(hs.kits.B, opponentById(career.schedule[0].opponentId).kit);
  const uni = careerMatchSetup(
    career, player, { id: 'uni-test-1', opponentId: 'north-ridge' }, null, null, 4,
  );
  assert.deepEqual(uni.kits.B, universityById('north-ridge').kit);
});

test('K4：快速比賽 kits 為空＝雙方維持現行預設藍/紅', () => {
  const quick = resolveMatchConfig({
    params: new URLSearchParams(''), careerCtx: null, randomSeed: 7,
  });
  assert.equal(quick.kits, null);
});

test('天鷹橫幅錨：kit.banner 保住既有 #7db2ff', () => {
  const hawk = kitFor(opponentById('sky-hawk'));
  assert.equal(cssColor(hawk.banner), '#7db2ff');
});

// ---- 配色卷階段二 E6（v2 B 案，2026-08-24）----
// 題 2 主裁定：READABILITY_MIN(150) 不再作為 9 校色票的通過門檻（改由 UI 語意
// 通道——球網／球員標籤／對陣抬頭／記分板固定側——承擔可讀性）。色距硬門檻只剩
// identity（IDENTITY_MIN=100，jersey 對 jersey）：checkKitPalette 的 K2/K3 測試
// 已用 ALL_TEAMS（16 隊，含 9 校）永久蓋住這條，本測試是**明示版**——只針對 9 校
// 兩兩 identity 逐對斷言，與 checkKitPalette 冗餘但把「9 校」這個分母說清楚。
// ★不得對 150 加任何斷言★——<150 的對只印出來當資訊，不構成 gate（B 案裁定）。
test('E6：9 校兩兩 identity（redmean）逐對 ≥100（B 案唯一硬門檻）', () => {
  assert.equal(UNIVERSITIES.length, 9); // 分母變了要回來重審
  for (let i = 0; i < UNIVERSITIES.length; i += 1) {
    for (let k = i + 1; k < UNIVERSITIES.length; k += 1) {
      const a = UNIVERSITIES[i];
      const b = UNIVERSITIES[k];
      const d = colorDistance(a.kit.jersey, b.kit.jersey);
      assert.ok(
        d >= 100,
        `identity ${a.id}×${b.id} ${d.toFixed(2)} < 100（9 校 identity 是 B 案唯一硬門檻）`,
      );
    }
  }
});

test('E6：9 校兩兩 <150（READABILITY_MIN）名單——資訊性輸出（v2 B 案）：不構成 gate', () => {
  const below = [];
  for (let i = 0; i < UNIVERSITIES.length; i += 1) {
    for (let k = i + 1; k < UNIVERSITIES.length; k += 1) {
      const a = UNIVERSITIES[i];
      const b = UNIVERSITIES[k];
      const d = colorDistance(a.kit.jersey, b.kit.jersey);
      if (d < 150) below.push(`${a.id}×${b.id} ${d.toFixed(2)}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(
    '資訊性輸出（v2 B 案）：不構成 gate——9 校兩兩 <150（READABILITY_MIN）的對：',
    below.length ? below.join('、') : '（無）',
  );
  // 永久註記（V7）：北陵×海硯薄餘裕對（102.44，距 identity 底線僅 2.44）——未來
  // 任何一校色票變動時必須重量測。這裡只斷言這對「存在於量測結果裡」（迴歸哨兵：
  // 若哪天色票被動過而這對消失/變樣，測試會紅，提醒回頭重讀這條永久註記）；
  // 不對 150 這個數字本身斷言（B 案：150 只是資訊性輸出）。
  const beiling = universityById('north-ridge');
  const haiyan = universityById('haiyan');
  assert.ok(beiling && haiyan, '薄餘裕對的兩校 id 需存在（id 對不上要回頭核對凍結稿）');
});
