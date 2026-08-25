// 隊伍配色卷批 3（acceptance-kit-batch3.md B2–B5）——對陣色條／賽程色塊／beatStage
// 穿隊色／觀眾席客隊應援色的機械守門。UI 層（careerScreen.js/main.js）本身無 DOM
// 測試基礎設施（比照專案既有慣例，這兩檔不進 node --test），這裡守住它們消費的
// 純函式單一入口：色源運算式（teamKit.js）、beatStage 的 subject→kit 決策
// （beatStage.js）、宿敵三幕的 opponentKit 資料源（rivalArc.js）。真實路徑優先——
// 端到端色測讀真實 THREE InstancedMesh instanceColor，不重建模型自證（02 §6.1 第 4 條）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { defaultSubjects, subjectTeamKit } from '../src/render/beatStage.js';
import { createGeoCharacter, createGeoPool, geometries } from '../src/render/geoCharacter.js';
import {
  kitFor, cssColor, kitAccentColor, opponentAccentColor, OUR_ANCHORS,
} from '../src/career/teamKit.js';
import { opponentById } from '../src/career/opponents.js';
import { universityById } from '../src/career/universities.js';
import { rivalPreEvents, rivalPostEvents } from '../src/career/rivalArc.js';
import { RIVAL_TEAM_ID, buildSchedule } from '../src/career/schedule.js';
import {
  createCareer, createCareerPlayer, recordResult, careerMatchSetup,
} from '../src/career/careerState.js';
import { createArena } from '../src/render/arena.js';

const RIVAL_KIT = kitFor(opponentById(RIVAL_TEAM_ID));

// ---- B5 真實路徑輔助：讀 createArena/setVenue 建出的真實 InstancedMesh 實色 ----
// （覆審 MEDIUM：資料層 kitAccentColor 單測不足以代表 buildCrowd 真的吃到這個值，
// 這裡直接呼叫 createArena→setVenue，讀真實 THREE InstancedMesh.instanceColor）
function crowdMeshesOf(scene) {
  const meshes = [];
  scene.traverse((o) => { if (o.isInstancedMesh) meshes.push(o); });
  return meshes;
}
function allInstanceColors(scene) {
  const [mesh] = crowdMeshesOf(scene);
  const c = new THREE.Color();
  const out = [];
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getColorAt(i, c);
    out.push(c.getHex());
  }
  return out;
}

// arena.js 的 buildAdBoards/buildAwayBanner 用 canvas 2d 畫橫幅貼圖（makeBannerTexture）
// ——node 沒有 document，這裡裝一個最小 canvas 樁只給這個測試檔用（不改 arena.js
// 行為，也不外流到其他測試檔：呼叫完就還原/刪除全域）。THREE.CanvasTexture 在建構
// 當下只是把 canvas 存成 image 來源，node 端不會真的觸發 GPU 上傳，樁的 2d context
// 只要接得住 arena.js 實際呼叫的那幾個 API（fillRect/strokeRect/fillText 等）即可。
function withDomStub(fn) {
  const ctx2d = {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
    fillRect() {}, strokeRect() {}, fillText() {},
  };
  const had = 'document' in globalThis;
  const prev = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
  try {
    return fn();
  } finally {
    if (had) globalThis.document = prev; else delete globalThis.document;
  }
}

function playUpTo(career, targetId) {
  let c = career;
  for (const m of c.schedule) {
    if (m.id === targetId) break;
    c = recordResult(c, { matchId: m.id, won: true, scoreFor: 25, scoreAgainst: 20 });
  }
  return c;
}
const P = (h = 1.75, role = 'outside') => ({
  id: 'A2', currentRole: role, height: { current: h, plan: [Math.round(h * 100)] },
});

// ---- B2/B3/B5 共用色源：kitAccentColor／opponentAccentColor ----

test('kitAccentColor：banner 優先、缺 banner 退 jersey、無 kit 回傳 fallback', () => {
  assert.equal(kitAccentColor({ jersey: 1, banner: 2 }), 2, 'banner 優先');
  assert.equal(kitAccentColor({ jersey: 1 }), 1, '缺 banner 退 jersey');
  assert.equal(kitAccentColor(null), null, '無 kit＝預設 fallback null（不炸）');
  assert.equal(kitAccentColor(null, 0x5a7dd8), 0x5a7dd8, '無 kit＝自訂 fallback（main.js 客隊應援色用）');
});

test('opponentAccentColor：走 kitFor 單一入口，與 main.js 客隊橫幅同回退序（banner→jersey）', () => {
  const rival = opponentById(RIVAL_TEAM_ID);
  assert.equal(opponentAccentColor(rival), rival.kit.banner, '天鷹有 banner，取 banner');
  const noKitDef = { id: 'x', name: '無 kit 隊' }; // 無 kit 欄位的防呆情境
  assert.equal(opponentAccentColor(noKitDef), null, '無 kit 資料的隊：不畫色、不炸');
  assert.equal(opponentAccentColor(null), null, 'def 本身 null（如練習賽 opponentId=null）不炸');
});

test('視覺結果與現行等值：main.js 客隊應援色套宿敵 kit＝原本 awayBanner 色 #7db2ff（B5，資料層）', () => {
  assert.equal(cssColor(kitAccentColor(RIVAL_KIT, 0x5a7dd8)), '#7db2ff');
});

// ---- B5 真實路徑（acceptance-kit-batch3.md 43-44 行）：直接呼叫 createArena/setVenue，
// 讀真實 InstancedMesh.instanceColor——不是只驗資料層 kitAccentColor 的回傳值 ----

// venueKey=key 下，新色源（kitAccentColor 算出的 #7db2ff）建出的客隊看台，與舊寫死
// #7db2ff 建出的客隊看台，逐 instance 顏色是否完全相同（視覺結果與現行等值）
test('B5 真實路徑・宿敵等值：新色源與舊寫死 #7db2ff 建出的客隊看台逐 instance 顏色相同', () => {
  const oldColor = '#7db2ff'; // 批 3 前 main.js 的寫死回退值（rival 專用）
  const newColor = cssColor(kitAccentColor(RIVAL_KIT, 0x5a7dd8)); // 批 3 後的新色源
  assert.equal(newColor, oldColor, '前提：兩者本該算出同一個色碼字串');

  const sceneOld = new THREE.Scene();
  const sceneNew = new THREE.Scene();
  withDomStub(() => {
    createArena(sceneOld, 'key').setVenue('key', { awayBanner: { name: '天鷹學園', color: oldColor } });
    createArena(sceneNew, 'key').setVenue('key', { awayBanner: { name: '天鷹學園', color: newColor } });
  });

  assert.deepEqual(
    allInstanceColors(sceneNew), allInstanceColors(sceneOld),
    '新路徑建出的客隊看台（含應援區＋其餘氛圍盤）逐 instance 顏色與舊寫死路徑相同',
  );
});

// 同一組 awayBanner 輸入分別建兩個獨立 arena，逐 instance 顏色是否相同；
// 且各自仍是單一 InstancedMesh（1 draw call，結構不變量）
test('B5 真實路徑・決定論＋單一 InstancedMesh：兩個獨立 arena 同輸入逐 instance 顏色相同', () => {
  const opts = { awayBanner: { name: '天鷹學園', color: cssColor(kitAccentColor(RIVAL_KIT, 0x5a7dd8)) } };

  const scene1 = new THREE.Scene();
  const scene2 = new THREE.Scene();
  withDomStub(() => {
    createArena(scene1, 'key').setVenue('key', opts);
    createArena(scene2, 'key').setVenue('key', opts); // 獨立第二次建館，不是快取命中
  });

  assert.equal(crowdMeshesOf(scene1).length, 1, '仍單一 InstancedMesh（1 draw call）');
  assert.equal(crowdMeshesOf(scene2).length, 1);
  assert.deepEqual(
    allInstanceColors(scene1), allInstanceColors(scene2),
    '同一組輸入分別建兩次，逐 instance 顏色完全相同（決定論 hash，非亂數）',
  );
});

test('B2/B4「同源」：careerScreen.js ourSchoolKit() 用的表達式與 careerMatchSetup 算出的 kits.A 同一組函式', () => {
  const career = createCareer({ seed: 1, playerName: '測' });
  const player = createCareerPlayer('測');
  const setup = careerMatchSetup(
    career, player, { id: 'uni-test-1', opponentId: 'north-ridge' }, null, null, 4, 'haiyan',
  );
  // careerScreen.js ourSchoolKit()：`school ? kitFor(universityById(school)) : null`——
  // 與 careerState.js:747 uniSchoolKit 同一組函式（kitFor/universityById），不得另抄
  const ourSchoolKitEquivalent = (school) => (school ? kitFor(universityById(school)) : null);
  assert.deepEqual(ourSchoolKitEquivalent('haiyan'), setup.kits.A);
  assert.equal(ourSchoolKitEquivalent(null), null, '高中章／大學未選校＝null＝B2 回落 OUR_ANCHORS');
});

// ---- B4：beatStage subjectTeamKit／defaultSubjects ----

test('subjectTeamKit：teamId A（含未標示）恆吃 opts.kitA，未傳＝null＝現行預設', () => {
  assert.equal(subjectTeamKit({ teamId: 'A' }, {}), null);
  assert.equal(subjectTeamKit({}, {}), null, '未標示 teamId 預設視為 A');
  const kit = { jersey: 1, shorts: 2, trim: 3 };
  assert.equal(subjectTeamKit({ teamId: 'A' }, { kitA: kit }), kit);
  assert.equal(subjectTeamKit({}, { kitA: kit }), kit);
});

test('subjectTeamKit：非我方僅在 subject 自帶 .kit 才換裝，未帶＝null（逐值不變）', () => {
  assert.equal(subjectTeamKit({ teamId: 'B' }, {}), null);
  assert.equal(subjectTeamKit({ teamId: 'B', kit: null }, { opponentKit: { jersey: 9 } }), null);
  const kit = { jersey: 9 };
  assert.equal(
    subjectTeamKit({ teamId: 'B', kit }, {}),
    kit,
    '自訂 subjects 清單（opts.subjects）可直接在 subject 上帶 kit，走同一個決策點',
  );
});

test('defaultSubjects confront/exit/rimlight-solo：B 側吃 opts.opponentKit，未傳＝undefined??null＝現行預設', () => {
  const kit = { jersey: 0x123456 };
  const confrontNo = defaultSubjects('confront', {});
  assert.equal(subjectTeamKit(confrontNo.find((s) => s.teamId === 'B'), {}), null);
  const confrontYes = defaultSubjects('confront', { opponentKit: kit });
  assert.equal(subjectTeamKit(confrontYes.find((s) => s.teamId === 'B'), { opponentKit: kit }), kit);

  const exitYes = defaultSubjects('exit', { opponentKit: kit });
  assert.ok(exitYes.every((s) => s.kit === kit), 'exit 三名 B 側演員皆換裝');

  const rimNo = defaultSubjects('rimlight-solo', {});
  assert.equal(rimNo[0].kit ?? null, null);
  const rimYes = defaultSubjects('rimlight-solo', { opponentKit: kit });
  assert.equal(rimYes[0].kit, kit);
});

test('defaultSubjects confront-trio／stands：不受 opponentKit 影響（trio 全我方、stands 本卷未接線）', () => {
  const trio = defaultSubjects('confront', { formation: 'trio', opponentKit: { jersey: 1 } });
  assert.ok(trio.every((s) => s.teamId === 'A' && s.kit === undefined));
  const stands = defaultSubjects('stands', { opponentKit: { jersey: 1 } });
  assert.ok(stands.every((s) => s.kit === undefined), 'B4 盤點：stands（止步旁觀）本卷未接線，維持現行');
});

// ---- 端到端：createGeoCharacter 實際吃到的球衣色（讀真實 InstancedMesh instanceColor）----
function torsoColorOf(scene, pool, id, teamId, kit) {
  const rig = createGeoCharacter(pool, id, teamId, 1.85, false, '', kit);
  pool.finishColors();
  const part = rig.parts.find((p) => p.key === 'torso');
  const mesh = scene.children.find((c) => c.isInstancedMesh && c.geometry === geometries().torso);
  const out = new THREE.Color();
  mesh.getColorAt(part.index, out);
  return out.getHex();
}

test('端到端：opts.kitA 傳入時我方球衣色真的變成校色；未傳＝現行硬編碼 TEAM_KIT.A 不變', () => {
  const scene = new THREE.Scene();
  const pool = createGeoPool(scene, false, 2);
  assert.equal(
    torsoColorOf(scene, pool, 'p1', 'A', null), 0x2e7bff,
    '未傳 kitA＝現行硬編碼 TEAM_KIT.A（高中章／大學未選校行為不變）',
  );
  const schoolKit = { jersey: 0xabcdef, shorts: 0x111111, trim: 0x222222 };
  assert.equal(torsoColorOf(scene, pool, 'p2', 'A', schoolKit), 0xabcdef, '傳入校色 kitA＝球衣真的換色');
});

test('端到端：teamId B 未帶 kit 時球衣色與現行預設（TEAM_KIT.B 紅）逐值相同', () => {
  const scene = new THREE.Scene();
  const pool = createGeoPool(scene, false, 1);
  assert.equal(torsoColorOf(scene, pool, 'p1', 'B', null), 0xff5340, 'resolveKit 現行 B 隊硬編碼預設，逐值不變');
});

test('端到端：opponentKit 傳入時對手球衣色真的變成該隊 kit', () => {
  const scene = new THREE.Scene();
  const pool = createGeoPool(scene, false, 1);
  const kit = { jersey: 0x654321, shorts: 1, trim: 1 };
  assert.equal(torsoColorOf(scene, pool, 'p1', 'B', kit), 0x654321);
});

// ---- rivalArc.js：宿敵三幕的 opponentKit 真的是天鷹的 kit（同一色源，不另抄）----

test('rivalArc：confront/exit/rimlight-solo 的 camOpts.opponentKit＝kitFor(opponentById(天鷹))', () => {
  assert.ok(RIVAL_KIT, '天鷹 def 必須有 kit（批 1 已保證）');

  let c = playUpTo(createCareer({ seed: 7 }), 'national-final');
  const pre = rivalPreEvents({ career: c, seasonIndex: 1, player: P(1.6) });
  assert.deepEqual(pre[0].lines[0].camOpts.opponentKit, RIVAL_KIT, 'confront（幕一賽前）');

  c = recordResult(c, { matchId: 'national-final', won: false, scoreFor: 20, scoreAgainst: 25 });
  const post1 = rivalPostEvents({ career: c, seasonIndex: 1, player: P(1.6) });
  assert.deepEqual(post1[0].lines[0].camOpts.opponentKit, RIVAL_KIT, 'exit（幕一賽後）');

  let c2 = playUpTo(createCareer({ seed: 9, seasonIndex: 2 }), 'national-sf');
  c2 = { ...c2, schedule: buildSchedule({ seed: 9, seasonIndex: 2 }) };
  c2 = recordResult(c2, { matchId: 'national-sf', won: true, scoreFor: 2, scoreAgainst: 0 });
  const post2 = rivalPostEvents({ career: c2, seasonIndex: 2, player: P(1.7) });
  assert.deepEqual(post2[0].lines[0].camOpts.opponentKit, RIVAL_KIT, 'rimlight-solo（幕二本人反應鏡）');

  let c3 = playUpTo(createCareer({ seed: 11, seasonIndex: 3 }), 'national-final');
  c3 = recordResult(c3, { matchId: 'national-final', won: true, scoreFor: 3, scoreAgainst: 1 });
  const post3 = rivalPostEvents({ career: c3, seasonIndex: 3, player: P(1.7) });
  const maLine = post3[0].lines.find((l) => l.speaker?.includes('馬振羽'));
  assert.deepEqual(maLine.camOpts.opponentKit, RIVAL_KIT, 'rimlight-solo（馬振羽句）');
});

test('rivalArc 反向對照：opponentKit 不是空殼——jersey/banner 逐值等於天鷹 def.kit', () => {
  const rivalDef = opponentById(RIVAL_TEAM_ID);
  let c = playUpTo(createCareer({ seed: 7 }), 'national-final');
  const pre = rivalPreEvents({ career: c, seasonIndex: 1, player: P(1.6) });
  const got = pre[0].lines[0].camOpts.opponentKit;
  assert.equal(got.jersey, rivalDef.kit.jersey);
  assert.equal(got.banner, rivalDef.kit.banner);
});

// ---- OUR_ANCHORS 仍是 B2 我方色條的錨定值來源（與 geoCharacter.TEAM_KIT.A 同步）----
test('OUR_ANCHORS.jersey 與 geoCharacter 硬編碼 TEAM_KIT.A 同步（未選校時 B2 色條＝這個值）', () => {
  const scene = new THREE.Scene();
  const pool = createGeoPool(scene, false, 1);
  assert.equal(torsoColorOf(scene, pool, 'anchor-check', 'A', null), OUR_ANCHORS.jersey);
});
