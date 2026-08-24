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
