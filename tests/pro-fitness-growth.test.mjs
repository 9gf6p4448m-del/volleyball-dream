// 職業屆間體能格（2026-08-27 拍板）
// 驗收＝docs/kickoffs/acceptance-pro-fitness-growth.md（FIT-1～FIT-5，動手前凍結）。
// 數值（+2/80/75）全部經 trainingCamp.js 的 campAttrOptions／applyCampAttrTraining
// 單一來源，本檔只用來斷言結果、不代表 careerStore 可以另抄常數。
// 治具沿 tests/multiyear-pro-batch4b.test.mjs（store 鏈）與 tests/foreign-batch3.test.mjs
// （screenAtGrowthCard DOM 手法）照抄，自建同源、不 import 私有函式。
//
// ════════════════════════════════════════════════════════════════
// FIT-5 突變實測紀錄（★真的跑過★，指令＝`node --test tests/pro-fitness-growth.test.mjs`，
// 基準＝本檔 10 測全綠；兩組突變都在 careerStore.js 動手、跑完即用 Edit 逐字還原，
// 最後 `diff` 對比還原前後檔案逐位元組相同，再重跑一次確認回到 10/0）
// ════════════════════════════════════════════════════════════════
// ① cap 守衛拿掉：chooseProGrowth 外層守衛
//    `if (!opt?.ready) return false;` 改成 `if (!opt || opt.gain == null) return false;`
//    （只留「未解鎖」判斷、放行「已到頂」），writeSave 內 fitness 分支的
//    `if (!opt?.ready) return prev;` 同步改成同一條件
//    → 實測紅 2／10＝「FIT-2 耐力到頂 80 拒絕」＋「FIT-2 控球解鎖後可練…（含到頂
//    75 拒絕那段）」——兩者皆因 careerStore 的護欄被拿掉、放行呼叫進
//    `applyCampAttrTraining`，而 trainingCamp.js 自己的 cap 檢查（單一來源、本次
//    未動）丟出 `Error: applyCampAttrTraining：xxx 已達上限 xx` 未被接住，兩個
//    測試都以未捕捉例外收場。★實測結果是 2 條紅、不是原先預期的「恰紅一條」★——
//    stamina 與 control 共用同一段 cap 護欄邏輯，兩個「到頂拒絕」測試本來就會被
//    同一顆突變同時擊中；如實記錄，不假裝只紅一條。其餘 8 條（含兩條 DOM 測試）
//    不受影響——UI 端的 not-ready 判定走 careerScreen.js 直接呼叫 campAttrOptions，
//    不經過 careerStore 這段被突變的守衛。
// ② unlockControl 閘拿掉：careerStore.js 兩處 `unlockControl` 全部改成恆 `true`
//    （外層守衛與 writeSave 內重算處，practice 讀值整段繞過）
//    → 實測紅 1／10＝「FIT-2 控球未解鎖拒絕」（`chooseProGrowth` 回傳 true 而非
//    預期 false），其餘 9 條（含耐力到頂／控球解鎖後可練／兩條 DOM 測試）不受影響
//    ——UI 的 unlockControl 同樣走 careerScreen.js 直讀 `store.loadPractice()`，
//    不吃 chooseProGrowth 內部這份被突變的值，這條突變確實恰紅一條。
// 兩組突變都還原後，diff 對照突變前備份逐位元組相同；重跑本檔 10/10 全綠。
//
// ════════════════════════════════════════════════════════════════
// FS-5 突變實測紀錄（職業屆間體能格「不互斥」改制，acceptance-pro-fitness-split.md，
// 2026-08-27，★真的跑過★，指令＝`node --test tests/pro-fitness-growth.test.mjs`，
// 基準＝本檔跑到這批新增鏈測（FIT-6/FIT-7）後 12 測全綠；兩組突變都在
// careerStore.js 動手、跑完即用 Edit 逐字還原，最後 `diff` 對比還原前後檔案逐位
// 元組相同，再重跑一次確認回到 12/0）
// ════════════════════════════════════════════════════════════════
// ①fitness 成功後不清 proFitnessPending：chooseProGrowth 的 writeSave 內
//   `nextCareer = isFitnessOption ? { ...prev.career, proFitnessPending: null } : ...`
//   把 fitness 分支改成 `{ ...prev.career }`（不清任何欄位）
//   → 實測紅 3／12＝「FIT-2 成功：耐力 +2」（斷言體能 pending 清除失敗）＋
//   「FIT-6 同一屆間…」（斷言體能 pending 清了失敗，測試在碰到「同屆重複 +2」
//   那段斷言前就先紅——鑑別力仍然成立：旗標不清＝防重複的第一道線就已經破了）＋
//   「FIT-7（FS-6）海外…」（海外存檔同一顆守衛，斷言 proFitnessPending 應為
//   null 卻讀到屆數 11）。其餘 9 條不受影響。
// ②路線選項誤連清 proFitnessPending：nextCareer 的路線分支改成
//   `{ ...prev.career, proGrowthPending: null, proFitnessPending: null }`
//   （模擬「選路線時手滑把體能旗標也一起寫進 nextCareer」）
//   → 實測紅 2／12＝「FIT-6 同一屆間…」（斷言「選聲望後體能 pending 還在」
//   失敗——路線一清、體能被連坐清空，正是「路線後仍可練體能」這條防線被打破）＋
//   「FIT-7（FS-6）海外…」（同一顆守衛，斷言「路線清完後體能段未完成前仍不放行」
//   失敗）。其餘 10 條（含 FIT-2 系列、FIT-3/FIT-4 DOM 測試）不受影響——它們不
//   走「先選路線再選體能」這條鏈，測不到路線分支的旗標外溢。
// 兩組突變都還原後，diff 對照突變前備份逐位元組相同；重跑本檔全綠（12/12）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { OFFSEASON } from '../src/career/growth.js';
import { CAMP_CONTROL_UNLOCKED } from '../src/career/trainingCamp.js';

// ════════════════════════════════════════════════════════════════
// 共用治具（照抄 tests/multiyear-pro-batch4b.test.mjs 同款正式鏈）
// ════════════════════════════════════════════════════════════════
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function playRoundRobin(storage, round, results = null) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const games = c.schedule.filter((m) => m.round === round);
  s.saveCareer({
    ...c,
    results: results ?? games.map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
}

function loseOutSeason(storage) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  playRoundRobin(storage, 'pro', c.schedule
    .filter((m) => m.round === 'pro')
    .map((m) => ({
      matchId: m.id, opponentId: m.opponentId, won: false,
      scoreFor: 0, scoreAgainst: 2, gp: 1,
    })));
}

function winLeague(storage, round) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const games = c.schedule.filter((m) => m.round === round);
  s.saveCareer({
    ...c,
    results: games.map((m) => ({
      matchId: m.id, opponentId: m.opponentId, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3,
    })),
  });
}

function playPlayoff(storage, round, won = true) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const m = c.schedule.find((x) => x.round === round);
  assert.ok(m, `fixture 前提：${round} 場次已長出`);
  s.saveCareer({
    ...c,
    results: [...c.results, {
      matchId: m.id, opponentId: m.opponentId, won,
      scoreFor: won ? 2 : 0, scoreAgainst: won ? 0 : 2, gp: 3,
    }],
  });
  return m;
}

function settledUniSave(schoolId = 'meixi') {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 101, playerName: '小夢' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 3;
  raw.roster = { capacity: 12, members: buildStarterMembers(), alumni: [] };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  createCareerStore(storage).enterUniversity(schoolId);
  for (let y = 1; y < 4; y += 1) {
    playRoundRobin(storage, 'league');
    assert.ok(createCareerStore(storage).advanceSeason(), `fixture 前提：第 ${y} 年推進成功`);
  }
  playRoundRobin(storage, 'league');
  assert.ok(createCareerStore(storage).settleUniFinale(), 'fixture 前提：U4 結算成功');
  return storage;
}

function proSaveInProgress(teamId = 'cangyu-titans') {
  const storage = settledUniSave();
  assert.ok(createCareerStore(storage).enterCorporate('chaoxi-marine'), 'fixture 前提：入企業章成功');
  playRoundRobin(storage, 'corp');
  assert.ok(createCareerStore(storage).settleCorpFinale(), 'fixture 前提：企業季結算成功');
  assert.ok(createCareerStore(storage).enterPro(teamId), 'fixture 前提：入職業章成功');
  return storage;
}

function settledProYear1(teamId = 'cangyu-titans') {
  const storage = proSaveInProgress(teamId);
  loseOutSeason(storage);
  assert.ok(createCareerStore(storage).settleProFinale(), 'fixture 前提：職業首季結算成功');
  return storage;
}

/** 國內職業首季奪冠且已結算＝海外門檻已解鎖。 */
function unlockedProSave(teamId = 'cangyu-titans') {
  const storage = proSaveInProgress(teamId);
  winLeague(storage, 'pro');
  playPlayoff(storage, 'semi', true);
  playPlayoff(storage, 'final', true);
  assert.ok(createCareerStore(storage).settleProFinale(), 'fixture 前提：國內首季結算成功');
  return storage;
}

/** 已結算→推進到 Y2（pending=Y2 屆數）。 */
function pendingY2Save() {
  const storage = settledProYear1();
  assert.ok(createCareerStore(storage).advanceSeason(), '前提：推進 Y2');
  return storage;
}

/** 已轉隊入海外、海外首季開局並結算，再推進到下一屆（pending 在海外）。 */
function pendingForeignSave(foreignId = 'aurora-orion') {
  const storage = unlockedProSave();
  assert.ok(createCareerStore(storage).transferPro(foreignId), 'fixture 前提：轉隊入海外成功');
  winLeague(storage, 'foreign');
  playPlayoff(storage, 'semi', true);
  playPlayoff(storage, 'final', true);
  assert.ok(createCareerStore(storage).settleProFinale(), 'fixture 前提：海外季結算成功');
  assert.ok(createCareerStore(storage).advanceSeason(), '前提：海外季推進成功');
  return storage;
}

const saveOf = (storage) => JSON.parse(storage.getItem(SAVE_KEY));

/** 直接改存檔 player.attributes[key]（不經 store，逼近臨界值治具）。 */
function setAttr(storage, key, value) {
  const raw = saveOf(storage);
  raw.player.attributes[key] = value;
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
}

/** 直接改存檔 practice.unlockControl（控球格解鎖訊號）。 */
function setUnlockControl(storage, unlockControl) {
  const raw = saveOf(storage);
  raw.practice = {
    seasonIndex: raw.season.index ?? 0, completed: unlockControl ? 2 : 0,
    total: 2, unlockControl,
  };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
}

// ════════════════════════════════════════════════════════════════
// FIT-2：chooseProGrowth('fitness', attrKey) 單元
// ════════════════════════════════════════════════════════════════
// 新預期行為（職業屆間體能格「不互斥」改制，2026-08-27 拍板）：體能與路線
// 各自一顆 pending——選 fitness 只清 proFitnessPending，proGrowthPending（路線）
// 原封不動，語意欄位換成 proFitnessPending。
test('FIT-2 成功：耐力 +2（幅度來自 OFFSEASON，非本檔另抄）', () => {
  const storage = pendingY2Save();
  const before = saveOf(storage).player.attributes.stamina;
  assert.ok(createCareerStore(storage).chooseProGrowth('fitness', 'stamina'));
  assert.equal(saveOf(storage).player.attributes.stamina, before + OFFSEASON.STAMINA_GAIN);
  assert.equal(createCareerStore(storage).proFitnessPending(), false, '體能 pending 清除');
  assert.equal(createCareerStore(storage).proGrowthPending(), true,
    '路線 pending 不受影響（新語意：兩段各自一顆旗標，不互斥）');
});

// 新預期行為：拒絕不清 pending，但那顆 pending 換成 proFitnessPending
// （原本沿用共用旗標的斷言已不成立——體能有自己的欄位）。
test('FIT-2 耐力到頂 80 拒絕（cap 守衛拿掉＝FIT-5①這裡紅）', () => {
  const storage = pendingY2Save();
  setAttr(storage, 'stamina', OFFSEASON.STAMINA_CAP);
  assert.equal(createCareerStore(storage).chooseProGrowth('fitness', 'stamina'), false);
  assert.equal(saveOf(storage).player.attributes.stamina, OFFSEASON.STAMINA_CAP, '不得超頂');
  assert.equal(saveOf(storage).career.proFitnessPending, saveOf(storage).season.index,
    '拒絕不清體能 pending（沒選成功；新語意欄位＝proFitnessPending）');
});

test('FIT-2 控球未解鎖拒絕（unlockControl 閘拿掉＝FIT-5②這裡紅）', () => {
  const storage = pendingY2Save();
  const before = saveOf(storage).player.attributes.control;
  assert.equal(createCareerStore(storage).chooseProGrowth('fitness', 'control'), false);
  assert.equal(saveOf(storage).player.attributes.control, before, '未解鎖不得偷練');
});

test('FIT-2 控球解鎖後可練、幅度 +2、上限 75（CAMP_CONTROL_UNLOCKED 單一來源）', () => {
  const storage = pendingY2Save();
  setUnlockControl(storage, true);
  const before = saveOf(storage).player.attributes.control;
  assert.ok(createCareerStore(storage).chooseProGrowth('fitness', 'control'));
  assert.equal(saveOf(storage).player.attributes.control,
    before + CAMP_CONTROL_UNLOCKED.gain);
  // 到頂拒絕（同一把鎖：解鎖不等於無上限）
  const storage2 = pendingY2Save();
  setUnlockControl(storage2, true);
  setAttr(storage2, 'control', CAMP_CONTROL_UNLOCKED.cap);
  assert.equal(createCareerStore(storage2).chooseProGrowth('fitness', 'control'), false);
});

test('FIT-2 壞 attrKey／null 拒絕（白名單只有集訓屬性池 stamina/control）', () => {
  const storage = pendingY2Save();
  assert.equal(createCareerStore(storage).chooseProGrowth('fitness', 'power'), false, '逐場面板屬性不在池內');
  assert.equal(createCareerStore(storage).chooseProGrowth('fitness', null), false, 'null 拒絕');
  assert.equal(createCareerStore(storage).chooseProGrowth('fitness', 123), false, '非字串拒絕');
  assert.equal(createCareerStore(storage).chooseProGrowth('fitness'), false, '缺參數拒絕');
});

test('FIT-2 無一次性旗標：下一屆間可再選（到頂前皆可重複）', () => {
  const storage = pendingY2Save();
  assert.ok(createCareerStore(storage).chooseProGrowth('fitness', 'stamina'));
  const afterY2 = saveOf(storage).player.attributes.stamina;
  loseOutSeason(storage);
  assert.ok(createCareerStore(storage).settleProFinale());
  assert.ok(createCareerStore(storage).advanceSeason());
  assert.ok(createCareerStore(storage).chooseProGrowth('fitness', 'stamina'), '下一屆間可再選');
  assert.equal(saveOf(storage).player.attributes.stamina, afterY2 + OFFSEASON.STAMINA_GAIN);
});

// ════════════════════════════════════════════════════════════════
// FIT-4：既有四選項零漂移（錨定）
// ════════════════════════════════════════════════════════════════
test('FIT-4 錨定：聲望仍 +6 封頂 100（新增體能格不得動到既有路徑）', () => {
  const storage = pendingY2Save();
  const raw = saveOf(storage);
  raw.player.trust.fromSetter = 97;
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  assert.ok(createCareerStore(storage).chooseProGrowth('prestige'));
  assert.equal(saveOf(storage).player.trust.fromSetter, 100, '封頂 100（不得 103）');
});

// ════════════════════════════════════════════════════════════════
// FIT-3：屆間卡 UI（DOM 行為級，照抄 foreign-batch3 的 screenAtGrowthCard 手法）
// ════════════════════════════════════════════════════════════════
function fakeDom() {
  const make = (tag = 'div') => ({
    tag,
    style: { cssText: '' },
    textContent: '',
    value: '',
    dataset: {},
    children: [],
    handlers: {},
    disabled: false,
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    remove() { this.parent?.removeChild(this); },
    addEventListener(ev, fn) { (this.handlers[ev] ||= []).push(fn); },
    removeEventListener(ev, fn) {
      this.handlers[ev] = (this.handlers[ev] ?? []).filter((f) => f !== fn);
    },
    replaceChildren(...nodes) { this.children = []; for (const n of nodes) this.appendChild(n); },
    setAttribute() {},
    getAttribute() { return null; },
    focus() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() {
      return { top: 0, left: 0, width: 100, height: 100, bottom: 0, right: 0 };
    },
  });
  globalThis.document = {
    createElement: (t) => make(t),
    createTextNode: (t) => ({ textContent: t }),
    body: make('body'),
    head: make('head'),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = {
    innerWidth: 400,
    innerHeight: 700,
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 0; };
}

const tap = (node) => {
  for (const fn of [...(node.handlers?.pointerdown ?? [])]) fn({ stopPropagation() {} });
};
const walk = (node, out = []) => {
  out.push(node);
  for (const c of node.children ?? []) walk(c, out);
  return out;
};
const allText = () => walk(globalThis.document.body).map((n) => n.textContent ?? '').join('｜');
const settle = () => new Promise((r) => { setTimeout(r, 0); });
const findBtn = (re) => walk(globalThis.document.body)
  .find((n) => n.tag === 'button' && re.test(n.textContent ?? ''));

/** 停在屆間卡上（不像 makeScreen 那樣自動好好休息跳過）——照抄 foreign-batch3。 */
async function screenAtGrowthCard(storage) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const screen = createCareerScreen(createCareerStore(storage), {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
  for (let i = 0; i < 12; i += 1) {
    const cont = walk(globalThis.document.body).find((n) => /點擊繼續/.test(n.textContent ?? ''));
    if (!cont) break;
    let p = cont;
    while (p && !(p.handlers?.pointerdown ?? []).length) p = p.parent;
    if (p) tap(p); else break;
    await settle();
  }
  return screen;
}

test('FIT-3 國內屆間卡：有體能格；子選單現值→加後值', async () => {
  const storage = pendingY2Save();
  await screenAtGrowthCard(storage);
  assert.match(allText(), /這個冬天，你想怎麼過/, '前提：屆間卡有出');
  const fitBtn = findBtn(/體能特訓——把身體再往上推一格/);
  assert.ok(fitBtn, '體能格按鈕要在');
  tap(fitBtn);
  await settle();
  const stamina = saveOf(storage).player.attributes.stamina;
  const after = Math.min(OFFSEASON.STAMINA_CAP, stamina + OFFSEASON.STAMINA_GAIN);
  assert.ok(findBtn(new RegExp(`耐力 ${stamina} → ${after}（上限 ${OFFSEASON.STAMINA_CAP}）`)),
    '子選單顯示現值→加後值');
  // 控球未解鎖：灰字附 reason 原文，不可點
  assert.match(allText(), /控球68——尚未開放——紅白賽科目全完成才開/);
  assert.ok(!findBtn(/^控球68/), '未解鎖不得長成按鈕');
});

test('FIT-3 海外屆間卡：也有體能格（同一份資料層，不分國內海外）', async () => {
  const storage = pendingForeignSave();
  await screenAtGrowthCard(storage);
  assert.match(allText(), /這個冬天，你想怎麼過/, '前提：屆間卡有出');
  assert.ok(findBtn(/體能特訓——把身體再往上推一格/), '海外屆間卡也要有體能格');
});

test('FIT-3 全部 not ready：主卡灰字、不出子選單按鈕（裁定甲同款樣式）', async () => {
  const storage = pendingY2Save();
  setAttr(storage, 'stamina', OFFSEASON.STAMINA_CAP); // 耐力到頂
  // 控球預設未解鎖 ⇒ 兩項皆 not ready
  await screenAtGrowthCard(storage);
  assert.match(allText(), /這個冬天，你想怎麼過/, '前提：屆間卡有出');
  assert.ok(!findBtn(/體能特訓——把身體再往上推一格/), '全 not ready 不出按鈕');
  assert.match(allText(), /體能特訓——身體已到你能推的極限（耐力已達上限 80、控球尚未開放——紅白賽科目全完成才開）/,
    '主卡灰字標示（裁定甲同款：全 not ready 才不出按鈕改灰字）');
});

// ════════════════════════════════════════════════════════════════
// 新增鏈測（職業屆間體能格「不互斥」改制，2026-08-27 拍板，acceptance-pro-fitness-split
// FS-4③／FS-6）：路線與體能同屆各自都能拿到、體能同屆間僅一次、兩段皆清才放行出戰；
// 海外屆間卡同樣兩段。
// ════════════════════════════════════════════════════════════════
test('FIT-6 同一屆間：路線與體能各自一次——選聲望後仍可練體能；體能練完同屆不可再練；兩段皆清才放行出戰', async () => {
  const storage = pendingY2Save();
  // 路線先選聲望（不互斥：不動體能 pending）
  assert.ok(createCareerStore(storage).chooseProGrowth('prestige'));
  assert.equal(createCareerStore(storage).proGrowthPending(), false, '路線 pending 清了');
  assert.equal(createCareerStore(storage).proFitnessPending(), true,
    '體能 pending 還在——新語意：兩段互不影響');
  // 體能：選聲望後仍可練、+2 生效
  const before = saveOf(storage).player.attributes.stamina;
  assert.ok(createCareerStore(storage).chooseProGrowth('fitness', 'stamina'),
    '路線選過後仍可練體能（不互斥）');
  assert.equal(saveOf(storage).player.attributes.stamina, before + OFFSEASON.STAMINA_GAIN);
  assert.equal(createCareerStore(storage).proFitnessPending(), false, '體能 pending 也清了');
  // 同屆間再練一次：旗標已清＝拒絕（不是到頂拒絕，是「同屆只能一次」拒絕）
  const afterFirst = saveOf(storage).player.attributes.stamina;
  assert.equal(createCareerStore(storage).chooseProGrowth('fitness', 'stamina'), false,
    '同屆間體能只能執行一次');
  assert.equal(saveOf(storage).player.attributes.stamina, afterFirst, '拒絕不改值');
  // 兩段都清了——UI 出戰放行
  await screenAtGrowthCard(storage);
  assert.ok(findBtn(/▶ 出戰/), '兩段都完成後出戰放行');
});

test('FIT-7（FS-6）海外屆間卡也是兩段：路線與體能各自清空後才放行出戰', async () => {
  const storage = pendingForeignSave();
  await screenAtGrowthCard(storage);
  assert.match(allText(), /這個冬天，你想怎麼過/, '前提：海外屆間卡有出');
  assert.ok(!findBtn(/▶ 出戰/), '兩段都未完成前不放行出戰');
  // 路線段：好好休息跳過
  tap(findBtn(/好好休息/));
  await settle();
  assert.equal(saveOf(storage).career.proGrowthPending, null, '海外路線 pending 清了');
  assert.ok(!findBtn(/▶ 出戰/), '體能段未完成前仍不放行');
  // 體能段：卡片就地重畫成只剩體能段——先不練跳過
  const skipFit = findBtn(/這個冬天先不練/);
  assert.ok(skipFit, '路線清完後卡片就地重畫，應只剩體能段的跳過鈕');
  tap(skipFit);
  await settle();
  assert.equal(saveOf(storage).career.proFitnessPending, null, '海外體能 pending 也清了');
  assert.ok(findBtn(/▶ 出戰/), '兩段都完成後海外也放行出戰');
});
