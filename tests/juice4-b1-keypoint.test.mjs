// 大作感四卷 批1（J2 賽點視覺）——驗收凍結 docs/kickoffs/juice4-kickoff-20260831.md。
// 池底卷 批1（P4 局點/賽點分兩級）——驗收凍結
// docs/kickoffs/poolbottom-kickoff-20260831.md：細化加嚴，原判準「局點即全版」改為
// 「只有賽點才呼吸/變紅，普通局點徽章靜態顯示」（series 非決勝局的局點不是賽點；
// series 為 null 的單局賽局點即賽點，沿用 J2 舊語意不變）。
// ①scorebug 局點徽章呼吸（賽點才呼吸，普通局點不呼吸）②LED 跑馬燈警示色（死球後
// 不再是賽點要還原）③教學局不觸發。賽點判定沿用既有 isSetPoint/keyPointOf 判局點，
// isMatchPointOf 疊加「series 內拿下此局是否達 setsToWin」——scorebug 與 marquee
// 共用同一個純函式 keyPointVisualOn（presentation.js），本檔直測這個共用判準＋
// scoreboard.setPointBadgeState（純函式）＋ arena.js 的真實 InstancedMesh/CanvasTexture
// 換色路徑（withDomStub，同 kit-batch3 慣例）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { keyPointOf, keyPointVisualOn, isMatchPointOf } from '../src/ui/presentation.js';
import { setPointBadgeState, setPointTeam } from '../src/ui/scoreboard.js';
import {
  createArena, MARQUEE_NORMAL_BG, MARQUEE_NORMAL_FG, MARQUEE_ALERT_BG, MARQUEE_ALERT_FG,
} from '../src/render/arena.js';

function mkGame(score, target = 25, phase = 'rally', series = null) {
  return { match: { score, target }, phase, series };
}

function mkSeries({ bestOf = 3, setsToWin = 2, setsWon = { A: 0, B: 0 } } = {}) {
  return { bestOf, setsToWin, setsWon };
}

// ---- keyPointVisualOn（單一事實來源：scorebug 與 marquee 都吃這個）----

test('keyPointVisualOn：單局賽（series=null）與 keyPointOf 同值——局點即賽點', () => {
  const g1 = mkGame({ A: 24, B: 22 }, 25); // 賽點
  const g2 = mkGame({ A: 10, B: 8 }, 25); // 非賽點
  assert.equal(keyPointVisualOn(g1, false), keyPointOf(g1));
  assert.equal(keyPointVisualOn(g1, false), true);
  assert.equal(keyPointVisualOn(g2, false), keyPointOf(g2));
  assert.equal(keyPointVisualOn(g2, false), false);
});

// ---- 池底卷 P4：isMatchPointOf 兩級判準 ----

test('isMatchPointOf：bestOf3 第一局局點（雙方 setsWon 皆 0）——是局點但不是賽點', () => {
  const g = mkGame({ A: 24, B: 20 }, 25, 'rally', mkSeries({ setsWon: { A: 0, B: 0 } }));
  assert.equal(keyPointOf(g), true, '前提：分數上確實是局點');
  assert.equal(isMatchPointOf(g), false, '拿下這局只會 1-0，還不能收下整場');
  assert.equal(keyPointVisualOn(g, false), false, '呼吸/警示色只認賽點，首局局點不觸發');
});

test('isMatchPointOf：bestOf3 決勝局局點（1-1 進第三局）——是賽點', () => {
  const g = mkGame({ A: 24, B: 20 }, 25, 'rally', mkSeries({ setsWon: { A: 1, B: 1 } }));
  assert.equal(isMatchPointOf(g), true, '拿下這局即 2-1 收下整場');
  assert.equal(keyPointVisualOn(g, false), true, '賽點＝呼吸＋變紅');
});

test('isMatchPointOf：bestOf3 第二局局點——若拿下即可 2-0 收下整場，也算賽點', () => {
  const g = mkGame({ A: 24, B: 20 }, 25, 'rally', mkSeries({ setsWon: { A: 1, B: 0 } }));
  assert.equal(isMatchPointOf(g), true, 'A 已贏第一局，這局再贏即 2-0 收下整場');
  const g2 = mkGame({ A: 20, B: 24 }, 25, 'rally', mkSeries({ setsWon: { A: 1, B: 0 } }));
  assert.equal(isMatchPointOf(g2), false, 'B 就算贏這局也只追平 1-1，還不是賽點');
});

test('isMatchPointOf：單局賽（series=null）局點即賽點——沿用 J2 舊語意', () => {
  const g = mkGame({ A: 24, B: 20 }, 25, 'rally', null);
  assert.equal(isMatchPointOf(g), true);
});

test('isMatchPointOf：非局點分數／教學局／局終——恆 false', () => {
  assert.equal(isMatchPointOf(mkGame({ A: 10, B: 8 }, 25)), false, '非局點');
  const g = mkGame({ A: 24, B: 20 }, 25, 'rally', mkSeries({ setsWon: { A: 1, B: 1 } }));
  assert.equal(keyPointVisualOn(g, true), false, '教學局恆 false（J2③沿舊）');
  const gOver = mkGame({ A: 25, B: 20 }, 25, 'set_over', mkSeries({ setsWon: { A: 1, B: 1 } }));
  assert.equal(keyPointVisualOn(gOver, false), false, '局終恆 false（沿舊）');
});

test('keyPointVisualOn：教學局恆 false（即使分數上是賽點）', () => {
  const g = mkGame({ A: 24, B: 22 }, 25);
  assert.equal(keyPointOf(g), true, '前提：這個分數確實是賽點');
  assert.equal(keyPointVisualOn(g, true), false);
});

test('keyPointVisualOn：局終（set_over）恆 false，即使分數殘留賽點狀態', () => {
  const g = mkGame({ A: 25, B: 22 }, 25, 'set_over');
  assert.equal(keyPointVisualOn(g, false), false);
});

test('keyPointVisualOn：deuce 連續賽點——雙向都追得到（24-24 非賽點；25-24／26-25 賽點）', () => {
  assert.equal(keyPointVisualOn(mkGame({ A: 24, B: 24 }, 25), false), false, '24-24 deuce 尚未到賽點');
  assert.equal(keyPointVisualOn(mkGame({ A: 25, B: 24 }, 25), false), true, '25-24 A 賽點');
  assert.equal(keyPointVisualOn(mkGame({ A: 25, B: 25 }, 25), false), false, '25-25 又進 deuce');
  assert.equal(keyPointVisualOn(mkGame({ A: 26, B: 25 }, 25), false), true, '26-25 A 賽點');
  assert.equal(keyPointVisualOn(mkGame({ A: 25, B: 26 }, 25), false), true, '25-26 B 賽點');
});

// ---- setPointBadgeState（純函式，scoreboard.js）----

test('setPointBadgeState：非局點分數＝不顯示', () => {
  const g = mkGame({ A: 10, B: 8 }, 25);
  assert.equal(setPointTeam(g), null, '前提：這個分數不是局點');
  assert.deepEqual(setPointBadgeState(g, 'A'), { show: false, text: '', mine: false, breathe: false });
});

test('setPointBadgeState：我方賽點＝顯示金字「局點」且呼吸；對方賽點＝顯示「對方局點」', () => {
  const g = mkGame({ A: 24, B: 20 }, 25);
  const mine = setPointBadgeState(g, 'A');
  assert.equal(mine.show, true);
  assert.equal(mine.text, '🔥 局點');
  assert.equal(mine.mine, true);
  assert.equal(mine.breathe, true, '賽點才呼吸');
  const theirs = setPointBadgeState(g, 'B');
  assert.equal(theirs.show, true);
  assert.equal(theirs.text, '⚠ 對方局點');
  assert.equal(theirs.mine, false);
  assert.equal(theirs.breathe, true, '呼吸只看是不是賽點，跟站哪隊無關');
});

test('setPointBadgeState：教學局——徽章文字照舊顯示，但呼吸關閉（J2③教學局不觸發）', () => {
  const g = mkGame({ A: 24, B: 20 }, 25);
  const badge = setPointBadgeState(g, 'A', true);
  assert.equal(badge.show, true, '徽章本體不是本批新行為，教學局不必連帶隱藏');
  assert.equal(badge.breathe, false, '呼吸是本批新行為，教學局恆不觸發');
});

test('setPointBadgeState：set_over 不顯示（沿用既有規則）', () => {
  const g = mkGame({ A: 25, B: 20 }, 25, 'set_over');
  assert.deepEqual(setPointBadgeState(g, 'A'), { show: false, text: '', mine: false, breathe: false });
});

// ---- LED 跑馬燈警示色（真實路徑：createArena→setVenue→setMarqueeAlert，讀真實
// CanvasTexture 換色時實際餵給 2d context 的 fillStyle，不是只驗資料層回傳值）----

// arena.js 用 canvas 2d 畫跑馬燈貼圖——node 沒有 document，這裡裝一個記錄 fillStyle
// 的最小 canvas 樁（同 tests/stands-kit-wiring.test.mjs 的 withDomStub 慣例）。
// 一館會建出多張 canvas（廣告板橫幅×3＋跑馬燈×1，寬度不同：橫幅 1024／跑馬燈
// 4096）——每張 canvas 各自配一份獨立 log，不共用同一個 2d context，才不會把橫幅
// 的畫布動作誤算進跑馬燈的斷言裡；用 canvas.width===4096 認出跑馬燈那張。
function withDomStub(fn) {
  const canvases = []; // [{ canvas, log }]
  const had = 'document' in globalThis;
  const prev = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const log = [];
      const ctx2d = {
        fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
        fillRect() { log.push(this.fillStyle); },
        strokeRect() {},
        fillText() { log.push(this.fillStyle); },
      };
      const canvas = { width: 0, height: 0, getContext: () => ctx2d };
      canvases.push({ canvas, log });
      return canvas;
    },
  };
  try {
    return fn(canvases);
  } finally {
    if (had) globalThis.document = prev; else delete globalThis.document;
  }
}

function marqueeLogOf(canvases) {
  const found = canvases.find((c) => c.canvas.width === 4096);
  assert.ok(found, '應該建出一張跑馬燈畫布（寬 4096）');
  return found.log;
}

test('LED 警示色：setMarqueeAlert(true) 真的把跑馬燈畫布重繪成警示色，(false) 還原常態色', () => {
  withDomStub((canvases) => {
    const scene = new THREE.Scene();
    const arena = createArena(scene, 'regular');
    assert.equal(arena.isMarqueeAlert(), false, '建館剛畫好＝常態色');
    const log = marqueeLogOf(canvases);
    const normalCalls = log.length;
    assert.equal(log[0], MARQUEE_NORMAL_BG, '首繪背景＝常態色');
    assert.ok(log.slice(1).every((c) => c === MARQUEE_NORMAL_FG), '首繪文字全是常態金');

    arena.setMarqueeAlert(true);
    assert.equal(arena.isMarqueeAlert(), true);
    assert.ok(log.length > normalCalls, '真的重繪了（多了新的 fillStyle 紀錄）');
    const alertCalls = log.slice(normalCalls);
    assert.equal(alertCalls[0], MARQUEE_ALERT_BG, '警示重繪背景＝警示紅');
    assert.ok(alertCalls.slice(1).every((c) => c === MARQUEE_ALERT_FG), '警示重繪文字全是警示紅');

    // 死球後若不再是賽點要還原：setMarqueeAlert(false) 必須重繪回常態色，不是留在警示色
    const afterAlertCalls = log.length;
    arena.setMarqueeAlert(false);
    assert.equal(arena.isMarqueeAlert(), false);
    assert.ok(log.length > afterAlertCalls, '還原也是一次真的重繪，不是只改旗標');
    const restoreCalls = log.slice(afterAlertCalls);
    assert.equal(restoreCalls[0], MARQUEE_NORMAL_BG);
    assert.ok(restoreCalls.slice(1).every((c) => c === MARQUEE_NORMAL_FG));
  });
});

test('LED 警示色：狀態未變動時 setMarqueeAlert 不重繪（節流，不是每幀都畫布重畫）', () => {
  withDomStub((canvases) => {
    const scene = new THREE.Scene();
    const arena = createArena(scene, 'regular');
    const log = marqueeLogOf(canvases);
    arena.setMarqueeAlert(true);
    const afterFirstOn = log.length;
    arena.setMarqueeAlert(true); // 已經是 on，重複呼叫不該再畫
    arena.setMarqueeAlert(true);
    assert.equal(log.length, afterFirstOn, '狀態沒變＝不重繪');
  });
});

test('LED 警示色：換館重建後把手狀態自動歸零（新館剛畫好就是常態色）', () => {
  withDomStub(() => {
    const scene = new THREE.Scene();
    const arena = createArena(scene, 'regular');
    arena.setMarqueeAlert(true);
    assert.equal(arena.isMarqueeAlert(), true);
    arena.setVenue('key'); // 真的換館（key !== regular）＝重建
    assert.equal(arena.isMarqueeAlert(), false, '新館剛畫好的跑馬燈本來就是常態色');
  });
});
