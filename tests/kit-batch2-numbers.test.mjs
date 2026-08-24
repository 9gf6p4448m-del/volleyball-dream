// 隊伍配色卷批 2（背號＋trim）—— N2/N3/N4 的機械守門（acceptance-kit-batch2.md）
// N2 決定論＋同隊不撞號、N3 可讀性 redmean≥150（含鑑別力對照）、N4 trim 新增池數／
// 背號面片上限／貼圖快取身分。真實路徑優先：能用 createGame()/careerMatchSetup() 建出
// 的場景一律用真實引擎，不用重建的模型（02 §6.1 第 4 條）。
//
// 2026-08-24 對抗覆審 F1/F2/F3 修正：
// F1（HIGH）：原本只給「開場上場 7 人」配號，賽中換人上場的板凳球員沒有背號。
//   改為全名冊配號（numbersForRoster，涵蓋板凳）——N2 凍結的是「決定論＋同隊不撞
//   號」，不是任何特定號碼區間，這裡的測試值跟著從 [1..7] 改成「全名冊人數」，
//   唯一性與決定論斷言原封不動。
// F2（MEDIUM）：名冊重建＋配號邏輯原本在測試檔手抄一份，現在改為呼叫
//   src/career/teamKit.js 匯出的 numbersForRoster／initialOnCourtIds，與 matchView.js
//   共用同一份實作，不再有「測試量不到實作漂移」的縫。
// F3（HIGH）：trim 幾何數值改過（sideStripe 移到真側面、collar 換成 cuff），
//   新增用真實 THREE 幾何參數（geometries().*.parameters）計算凸出量的測試，
//   不是手抄數字自證。
//
// 2026-08-24/25 兩件事（fresh 覆驗判 F1–F3 真的修好之後）：
// ① N4 修訂（02 §2.1 使用者明確同意）：原文「全場 ≤30」與 F1 的惰性補建自相矛盾，
//   改成「開場 ≤30＋全場累計 ≤2×雙方名冊總人數」兩段上限，新增守門測試用真實
//   applySubstitution 把板凳全部換上場一次來驗（不是自報數字）。
// ② 使用者裁定號碼規則改「散號」：id 決定論雜湊映射到 1–25、同隊撞號往上遞補，
//   取代原本「名冊序→1 起連號」（驗收檔「號碼分配規則」段本來就寫明可改規則、
//   不動門檻）。連帶更新：原本斷言具體 1..N 序列的測試改斷言「範圍 1–25＋決定論
//   ＋同隊唯一」，並新增鑑別力測試證明真的散了（不是舊規則換皮）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  numberTextColor, colorDistance, READABILITY_MIN, kitFor,
  numbersForRoster, initialOnCourtIds,
} from '../src/career/teamKit.js';
import {
  createGeoCharacter, createGeoPool, getNumberTexture, geometries,
} from '../src/render/geoCharacter.js';
import { OPPONENTS } from '../src/career/opponents.js';
import { UNIVERSITIES } from '../src/career/universities.js';
import { createGame, applySubstitution } from '../src/sim/game.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';

// ---- 共用治具：真實生涯路徑建一場（雙方各 6 先發＋1 自由人＋板凳）----
function buildRealMatch(opponentId = OPPONENTS[0].id, seed = 1) {
  const career = createCareer({ seed, playerName: '測試' });
  const player = createCareerPlayer('測試');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const setup = careerMatchSetup(career, player, { opponentId, stage: 'group-1' }, roster, null);
  return createGame({ seed, ...setup });
}

function numbersFor(game) {
  return numbersForRoster(Object.values(game.players));
}

// 2026-08-25 使用者裁定「散號」：號碼規則從「名冊序→1 起連號」改成「id 決定論雜湊
// 映射到 1–25、同隊撞號往上遞補」。驗收檔「號碼分配規則」段本來就寫明這段是提案版、
// 使用者看圖後可改規則、改規則不動上述門檻——這裡的斷言跟著從「1 起連號」的具體值
// 改成「決定論＋同隊唯一＋落在 1–25」，唯一性與決定論兩條判準本身沒有放寬。
test('N2 numbersForRoster：散號規則下純函式決定論（純陣列輸入，同一份名冊兩次呼叫同結果）', () => {
  const roster = [
    { id: 'A2', teamId: 'A' }, { id: 'A5', teamId: 'A' },
    { id: 'A1', teamId: 'A' }, { id: 'AL', teamId: 'A' },
  ];
  const first = numbersForRoster(roster);
  const second = numbersForRoster(roster);
  assert.deepEqual(first, second, '同一份名冊陣列兩次呼叫應回傳同一份結果');
  for (const v of Object.values(first)) {
    assert.ok(Number.isInteger(v) && v >= 1 && v <= 25, `號碼 ${v} 應落在 1–25`);
  }
});

// N6 瀏覽器覆驗抓到的不變量缺陷（2026-08-25，MEDIUM）：修前的撞號遞補是無界
// `while (taken.has(candidate)) candidate = (candidate % MAX_NUMBER) + 1`——同隊人數
// 一旦 > MAX_NUMBER(25)，25 個號全被占滿後這個 while 永遠成立、主執行緒卡死。
// ?devkit 把 16 個預覽隊全掛在 teamId:'B'（32 人）就是這樣觸發的；node 單測沒抓到是
// 因為真實名冊 ≤19 人/隊，本來就在 25 以下摸不到這個邊界——這是「特定合法輸入下才
// 卡住」的不變量缺陷，不是資料量不夠。這裡直接用 32 人（同隊）驗證終止＋唯一性，
// 並用 node:test 的 timeout 選項上限（5s）當安全網：修復前的程式碼跑這條會撞
// timeout 失敗（而不是真的把測試進程卡住 2 分鐘），修復後應在毫秒等級內完成。
test('N2 不變量：同隊人數 > MAX_NUMBER(25) 時仍保證終止（32 人同隊，撞號遞補改用有界迴圈＋溢出號）', { timeout: 5000 }, () => {
  const roster = Array.from({ length: 32 }, (_, i) => ({ id: `stress-${i}`, teamId: 'stress-team' }));
  const start = Date.now();
  const numbers = numbersForRoster(roster);
  const elapsedMs = Date.now() - start;
  assert.ok(elapsedMs < 1000, `應瞬間完成（實測 ${elapsedMs}ms）——修前的無界 while 在這個輸入下永遠不會走到這一行`);
  const values = Object.values(numbers);
  assert.equal(values.length, 32, '32 個 id 都該拿到號碼（沒有半途卡住漏配）');
  assert.equal(new Set(values).size, values.length, '32 人（含溢出號）仍不得撞號');
  // 前 25 個（雜湊落點決定，不保證是哪些 id）落在 1–25，其餘 7 個是溢出號（26 起）
  const overflow = values.filter((v) => v > 25);
  assert.equal(overflow.length, 32 - 25, `32-25=7 人應落在溢出區（實測 ${overflow.length} 人）`);
  assert.deepEqual(overflow.slice().sort((a, b) => a - b), [26, 27, 28, 29, 30, 31, 32]);
});

test('N2 同隊不撞號＋落在 1–25：真實生涯場景全名冊（F1：涵蓋板凳，不只上場 7 人）', () => {
  const game = buildRealMatch();
  const numberMap = numbersFor(game);
  for (const team of ['A', 'B']) {
    const teamIds = Object.values(game.players).filter((p) => p.teamId === team).map((p) => p.id);
    assert.ok(teamIds.length > 7, `${team} 隊應含板凳（全名冊 > 7 人上場）`);
    const values = teamIds.map((id) => numberMap[id]);
    assert.ok(values.every((v) => Number.isInteger(v)), `${team} 隊每個人（含板凳）都該有號碼`);
    assert.equal(new Set(values).size, values.length, `${team} 隊不得撞號（含板凳）`);
    assert.ok(
      values.every((v) => v >= 1 && v <= 25),
      `${team} 隊號碼應全部落在 1–25（散號規則，不再要求 1 起連號覆滿）`,
    );
  }
});

test('散號鑑別力：號碼不是「名冊序 index+1」的偽裝——若整隊剛好等於名冊序，代表散號沒真的生效', () => {
  const game = buildRealMatch();
  const numberMap = numbersFor(game);
  for (const team of ['A', 'B']) {
    const teamIds = Object.values(game.players).filter((p) => p.teamId === team).map((p) => p.id);
    const sequential = teamIds.every((id, i) => numberMap[id] === i + 1);
    assert.ok(
      !sequential,
      `${team} 隊號碼恰好等於「名冊序 index+1」——這代表底層還是舊的 1 起連號規則，` +
      '散號沒有真的生效（雜湊分佈下純巧合機率極低，出現即代表退回舊規則）',
    );
  }
});

test('N2 主控球員（A2）：號碼由其身分決定論推導、與隊友不撞號（散號規則下不再等於名冊序）', () => {
  const game = buildRealMatch();
  const numberMap = numbersFor(game);
  const teamAIds = Object.values(game.players).filter((p) => p.teamId === 'A').map((p) => p.id);
  assert.ok(teamAIds.includes('A2'), '主角 A2 出道即先發，應在名冊中');
  assert.ok(Number.isInteger(numberMap.A2) && numberMap.A2 >= 1 && numberMap.A2 <= 25);
  // 同一份名冊重算一次，A2 號碼不變（決定論落在「這個人」身上，不是槽位）
  assert.equal(numbersFor(game).A2, numberMap.A2);
});

test('N2 決定論（真實引擎兩次進場）：同名冊/對手兩次建 game，同一人同號', () => {
  const career = createCareer({ seed: 1, playerName: '測試' });
  const player = createCareerPlayer('測試');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const buildNumbers = () => {
    const setup = careerMatchSetup(
      career, player, { opponentId: OPPONENTS[0].id, stage: 'group-1' }, roster, null,
    );
    return numbersFor(createGame({ seed: 1, ...setup }));
  };
  assert.deepEqual(buildNumbers(), buildNumbers());
});

test('F1 回歸：板凳球員在建 game 當下就已有背號，賽中換人上場沿用同號、不臨時現配', () => {
  const game = buildRealMatch();
  const numberMap = numbersFor(game);
  const benchIdA = game.bench.A[0];
  assert.ok(benchIdA, '這場應有板凳（roster capacity 12 > 6 先發＋1 自由人）');
  assert.ok(
    Number.isInteger(numberMap[benchIdA]),
    `板凳球員 ${benchIdA} 在開場（尚未替補上場）就該已有號碼——F1 修前這裡是 undefined`,
  );
  // 真實 sim 路徑換人上場（applySubstitution，唯一寫入路徑，見 sim/game.js:1650）
  const outId = game.match.rotations.A.find((id) => id !== game.liberos.A.liberoId);
  const r = applySubstitution(game, { team: 'A', outId, inId: benchIdA });
  assert.equal(r.ok, true, `applySubstitution 應成功換人：${r.reason}`);
  assert.ok(game.match.rotations.A.includes(benchIdA), '替補應已站上輪轉');
  // 換人不改號碼（號碼是名冊屬性，不是「現在站不站在場上」的函數）
  const numberMapAfter = numbersFor(game);
  assert.equal(
    numberMapAfter[benchIdA], numberMap[benchIdA],
    '換人上場前後號碼應相同（不臨時現配新號）',
  );
  // 換人後場上仍不撞號
  const onCourtNumbers = game.match.rotations.A.map((id) => numberMapAfter[id]);
  assert.equal(new Set(onCourtNumbers).size, onCourtNumbers.length, '換人後場上仍不得撞號');
});

test('N3 背號可讀性：16 隊全部球衣/自由人色＋geoCharacter 側別預設 A/B 面 redmean≥READABILITY_MIN', () => {
  const allTeams = [...OPPONENTS, ...UNIVERSITIES];
  assert.equal(allTeams.length, 16); // 隊數變了要回來重審
  const baseColors = allTeams.flatMap((def) => {
    const kit = kitFor(def);
    return [kit.jersey, kit.libero.jersey];
  });
  // geoCharacter 側別預設（TEAM_KIT/LIBERO_KIT A/B 面；批 1 team-kit.test.mjs 已知值）
  baseColors.push(0x2e7bff, 0xff5340, 0xffc531, 0xf2f4f8);
  for (const c of baseColors) {
    const textColor = numberTextColor(c);
    const d = colorDistance(textColor, c);
    assert.ok(
      d >= READABILITY_MIN,
      `底色 0x${c.toString(16)} 選出的號碼色 0x${textColor.toString(16)} 距離 ${d.toFixed(1)} < ${READABILITY_MIN}`,
    );
  }
});

test('N3 鑑別力：斷言對「號碼色恆白」的壞實作必抓到違規（近白底色）', () => {
  const allTeams = [...OPPONENTS, ...UNIVERSITIES];
  const baseColors = allTeams.flatMap((def) => {
    const kit = kitFor(def);
    return [kit.jersey, kit.libero.jersey];
  });
  baseColors.push(0x2e7bff, 0xff5340, 0xffc531, 0xf2f4f8);
  const badAlwaysWhite = 0xffffff;
  const violations = baseColors.filter((c) => colorDistance(badAlwaysWhite, c) < READABILITY_MIN);
  assert.ok(
    violations.length > 0,
    '恆白的壞實作應在至少一個淺色底（如 0xf2f4f8）違規——若這裡是 0 代表本斷言沒有鑑別力',
  );
  // 真實函式對同一批底色全過（上一條已驗），且對這個鑑別力色明確選黑
  assert.equal(numberTextColor(0xf2f4f8), 0x000000);
});

test('N4 trim 新增池數 ≤4：cuff/sideStripe 走既有 InstancedMesh 池模式', () => {
  const scene = new THREE.Scene();
  createGeoPool(scene, false, 1);
  const meshes = scene.children.filter((c) => c.isInstancedMesh);
  // 10 個既有部件池 + cuff + sideStripe = 12；新增數＝12-10=2 ≤4
  assert.equal(meshes.length, 12);
});

test('N4 開場背號面片 mesh 數上限：真實生涯場景（開場上場 14 人）恰為 28（F1：板凳惰性補建不計入這批）', () => {
  const game = buildRealMatch();
  const eagerIds = new Set([...initialOnCourtIds(game, 'A'), ...initialOnCourtIds(game, 'B')]);
  assert.equal(eagerIds.size, 14, '雙方各 6 先發＋1 自由人＝14 人（開場即建 Mesh 的名單）');
  assert.equal(eagerIds.size * 2, 28);
  assert.ok(eagerIds.size * 2 <= 30);
  const allPlayerIds = Object.keys(game.players);
  assert.ok(
    allPlayerIds.length > eagerIds.size,
    '真實場景應含板凳（全體人數 > 開場上場 14 人，對手 def 皆帶 reserves）',
  );
  // F1：板凳雖不在「開場就建 Mesh」名單裡，但在 numbersForRoster 仍有號碼
  // （只是 matchView 選擇晚一點才建 Mesh，見 F1 回歸測試）
  const numberMap = numbersFor(game);
  const benchIds = allPlayerIds.filter((id) => !eagerIds.has(id));
  assert.ok(benchIds.length > 0);
  for (const id of benchIds) {
    assert.ok(Number.isInteger(numberMap[id]), `板凳 ${id} 應已有號碼（只是還沒建 Mesh）`);
  }
});

// N4 修訂（02 §2.1 使用者明確同意，2026-08-24）：原文「全場 ≤30」與「賽中換人（F1
// 惰性補建）」自相矛盾——替補上場即合法超出 30。改為兩段上限：開場 ≤30（上一條測試
// 已守）＋含替補全場累計 ≤2×雙方名冊總人數。這條用**真實 applySubstitution**
// （唯一寫入路徑，sim/game.js:1650）把兩隊板凳全部真實換上場一次，鏡著 matchView
// 的惰性補建策略（「SUBSTITUTION 的 e.inId 若尚未建過 Mesh 才建，e.outId 不拆）
// 累計 builtIds，不是自己報一個數字。
test('N4 修訂守門：真實換人（全部板凳各上場一次）後，全場累計背號 mesh ≤ 2×雙方名冊總人數', () => {
  const game = buildRealMatch();
  const eagerIds = new Set([...initialOnCourtIds(game, 'A'), ...initialOnCourtIds(game, 'B')]);
  assert.equal(eagerIds.size, 14);
  assert.ok(eagerIds.size * 2 <= 30, '開場上限（N4 修訂保留這條，上一條測試也守）');

  // 惰性補建的模擬：跟 matchView.js routeEvents 的 SUBSTITUTION 分支同一個策略——
  // 已建過（在 builtIds 裡）就不重建；只有第一次進場才新增
  const builtIds = new Set(eagerIds);
  let substitutionCount = 0;
  for (const team of ['A', 'B']) {
    const benchIds = [...game.bench[team]]; // 開場板凳快照，逐一真實換上場
    for (const inId of benchIds) {
      const outId = game.match.rotations[team].find((id) => id !== game.liberos[team].liberoId);
      const r = applySubstitution(game, { team, outId, inId });
      assert.equal(r.ok, true, `${team} 隊換 ${inId} 上場應成功（真實 sim 規則）：${r.reason}`);
      substitutionCount += 1;
      if (!builtIds.has(inId)) builtIds.add(inId); // 惰性補建：只在首次進場時新增
    }
  }
  assert.ok(substitutionCount > 0, '這場真的要有板凳被換上場，不是空跑');
  assert.ok(builtIds.size > eagerIds.size, '應該真的有人被惰性補建（builtIds 比開場批次大）');

  const totalRosterCount = Object.keys(game.players).length;
  const totalMeshCount = builtIds.size * 2;
  assert.ok(
    totalMeshCount <= 2 * totalRosterCount,
    `全場累計 mesh ${totalMeshCount} 應 ≤ 2×雙方名冊總人數 ${2 * totalRosterCount}`,
  );
});

test('N4 貼圖快取：同（號碼,色）兩次取用回同一實例；號碼或色不同則不同實例', () => {
  const a1 = getNumberTexture(7, 0xffffff);
  const a2 = getNumberTexture(7, 0xffffff);
  assert.equal(a1, a2, '同號碼同色應命中快取回同一個 texture 物件');
  const diffColor = getNumberTexture(7, 0x000000);
  assert.notEqual(a1, diffColor);
  const diffNumber = getNumberTexture(8, 0xffffff);
  assert.notEqual(a1, diffNumber);
});

test('createGeoCharacter：number 建出 numberSlots（back/front）；number=null 不建', () => {
  const scene = new THREE.Scene();
  const pool = createGeoPool(scene, false, 2);
  const numbered = createGeoCharacter(pool, 'kb2-x1', 'A', 1.85, false, '', null, 4);
  assert.ok(numbered.numberSlots);
  assert.equal(numbered.numberSlots.back.number, 4);
  assert.equal(numbered.numberSlots.front.number, 4);
  assert.equal(numbered.numberSlots.back.color, numberTextColor(0x2e7bff)); // A 隊側別預設球衣色
  const unnumbered = createGeoCharacter(pool, 'kb2-x2', 'A', 1.85, false, '', null, null);
  assert.equal(unnumbered.numberSlots, null);
});

// ---- F3：trim 幾何凸出量——讀真實 THREE 幾何參數計算，不手抄數字自證 ----
test('F3 sideStripe 凸出軀幹表面（真側面 z=0）：讀真實幾何參數計算，凸出量介於 0.008–0.01m 且不懸空', () => {
  const scene = new THREE.Scene();
  const pool = createGeoPool(scene, false, 1);
  const rig = createGeoCharacter(pool, 'geom-check', 'A', 1.85, false, '', null, null);
  const torsoSlot = rig.parts.find((p) => p.key === 'torso');
  const stripeSlot = rig.parts.find((p) => p.key === 'sideStripe');
  const g = geometries();
  // 軀幹在 z=0 的 x 表面半徑＝capsule 半徑 × 該 slot 實際套用的 x 縮放
  const torsoSurfaceX = g.torso.parameters.radius * torsoSlot.node.scale.x;
  const centerX = Math.abs(stripeSlot.node.position.x);
  const halfThickness = g.sideStripe.parameters.width / 2;
  const outer = centerX + halfThickness;
  const inner = centerX - halfThickness;
  const protrusion = outer - torsoSurfaceX;
  assert.ok(protrusion > 0, `sideStripe 必須凸出軀幹表面，實測 ${protrusion.toFixed(4)}`);
  assert.ok(
    protrusion >= 0.008 && protrusion <= 0.01,
    `凸出量應在 0.008–0.01m（F3 覆審要求），實測 ${protrusion.toFixed(4)}`,
  );
  assert.ok(
    inner < torsoSurfaceX,
    `內緣應嵌入表面內側（不得整條懸空），內緣 ${inner.toFixed(4)} 應 < 表面 ${torsoSurfaceX.toFixed(4)}`,
  );
  // z 必須是真側面（F3 修前的 z=0.03 是埋在軀幹裡的病根之一）
  assert.equal(stripeSlot.node.position.z, 0);
  // y 落在軀幹圓柱段（非球冠端蓋），避免切到彎曲處
  const halfHeight = g.sideStripe.parameters.height / 2;
  assert.ok(stripeSlot.node.position.y - halfHeight >= 0.09);
  assert.ok(stripeSlot.node.position.y + halfHeight <= 0.43);
});

test('F3 cuff 凸出上臂表面（取代埋在軀幹裡的舊 collar）：讀真實幾何參數計算，凸出量正值且不懸空', () => {
  const scene = new THREE.Scene();
  const pool = createGeoPool(scene, false, 1);
  const rig = createGeoCharacter(pool, 'geom-check-2', 'A', 1.85, false, '', null, null);
  const cuffSlot = rig.parts.find((p) => p.key === 'cuff');
  const g = geometries();
  const armSurfaceR = g.upperArm.parameters.radius;
  const ringR = g.cuff.parameters.radius;
  const tube = g.cuff.parameters.tube;
  const outer = ringR + tube;
  const inner = ringR - tube;
  const protrusion = outer - armSurfaceR;
  assert.ok(protrusion > 0, `cuff 必須凸出上臂表面，實測 ${protrusion.toFixed(4)}`);
  assert.ok(
    inner < armSurfaceR,
    `內緣應嵌入臂面內側（不得整圈懸空），內緣 ${inner.toFixed(4)} 應 < 臂面 ${armSurfaceR.toFixed(4)}`,
  );
  // 位置應在袖端/前臂交界（同 elbow 關節 y），不是浮在半空
  const elbowY = rig.joints.rElbow.position.y;
  assert.equal(cuffSlot.node.position.y, elbowY);
});

test('F3 鑑別力：舊 collar 幾何數值（覆審抓到的埋沒案）在同一套算法下確實是負凸出量', () => {
  // 覆審給的舊參數：ring=0.1, tube=0.012（外緣 0.112）；該高度軀幹半徑量測值 0.131
  // （頭頸重疊處的有效半徑，非軀幹赤道半徑，覆審原文數字）
  const oldOuter = 0.1 + 0.012;
  const oldNeckR = 0.131;
  assert.ok(
    oldOuter - oldNeckR < 0,
    '舊 collar 在覆審給的高度上應是負凸出量（埋沒）——若這裡 ≥0 代表本測試沒有鑑別力',
  );
});
