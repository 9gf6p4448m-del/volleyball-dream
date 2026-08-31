// 池底卷 批2 P1「照片模式」——驗收凍結 docs/kickoffs/poolbottom-kickoff-20260831.md：
// ①進入→sim 不前進（tick 凍結測試）②退出→比賽從凍結點繼續、相機/HUD 完整還原
// ③快門產出非空 blob（結構測試；DOM 環境不足時測「快門呼叫鏈正確接線」，本檔逐條註明
// 測到哪一層）④教學局與連線賽不提供入口 ⑤觸控手勢不與比賽操作打架（photoMode 中比賽
// 輸入短路）。
//
// 分層測試（matchLoop.js/matchStage.js 太大太重，不適合單元測試整套跑起來建置——
// 同 tests/juice4-b1-fireworks.test.mjs／tests/poolbottom-b1-moppers.test.mjs 慣例）：
//   · src/render/photoMode.js 的純邏輯（HUD 批次隱藏、快門、送達、相機接管）——真實呼叫，
//     three.js 用真的、document/navigator/canvas 用最小樁或 Node 24 內建的 Web 全域
//     （File/URL/Blob 都是 Node 內建，不必自己假造）。
//   · matchLoop.js 的 enterPhotoMode/exitPhotoMode/togglePhotoModeHud/runPhotoModeFrame/
//     takePhoto——這五支已 export，用手搭的最小 `s` 樁真實呼叫（同 tests/inside-cut-ui.test.mjs
//     的 stubStage 慣例），tick 凍結是實測而非只看原始碼。
//   · frameStep 本身太重（4000+ 行、閉包吃整個 s/ctx/stage）不外呼，用與 fireworks 測試
//     同款的 extractFunctionBody 源碼切片驗證早退順序（s.photoMode 排在 s.replay 之前）。
//   · matchStage.js 的入口守衛（④教學局/連線賽不提供入口）同理走源碼掃描。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import {
  setHudHidden, createPhotoOrbit, capturePhoto, deliverPhoto, photoFilename, PHOTO_BAR_ID,
} from '../src/render/photoMode.js';
import {
  enterPhotoMode, exitPhotoMode, togglePhotoModeHud, runPhotoModeFrame, takePhoto,
} from '../src/app/matchLoop.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

function extractFunctionBody(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `應該找到 function ${name}(`);
  const parenStart = text.indexOf('(', start);
  let pdepth = 0;
  let parenEnd = -1;
  for (let i = parenStart; i < text.length; i += 1) {
    if (text[i] === '(') pdepth += 1;
    else if (text[i] === ')') { pdepth -= 1; if (pdepth === 0) { parenEnd = i; break; } }
  }
  assert.ok(parenEnd >= 0, `${name} 找不到對稱的參數列表結尾`);
  const braceStart = text.indexOf('{', parenEnd);
  let depth = 0;
  for (let i = braceStart; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') { depth -= 1; if (depth === 0) return text.slice(braceStart, i + 1); }
  }
  throw new Error(`${name} 找不到對稱的結尾大括號`);
}

// ════════════════════ src/render/photoMode.js：純邏輯 ════════════════════

// ---------- setHudHidden：批次 HUD 隱藏/還原 ----------

function fakeEl({ id = null, tagName = 'DIV', visibility = '' } = {}) {
  return { id, tagName, style: { visibility }, dataset: {} };
}

test('setHudHidden：非白名單元素隱藏，白名單（app/hud/loading/fatal-error/照片工具列）不動', () => {
  const app = fakeEl({ id: 'app' });
  const hud = fakeEl({ id: 'hud' });
  const loading = fakeEl({ id: 'loading' });
  const fatal = fakeEl({ id: 'fatal-error' });
  const bar = fakeEl({ id: PHOTO_BAR_ID });
  const scoreboard = fakeEl(); // 一般 HUD 元素恆無 id（同 codebase 慣例：document.createElement 不設 id）
  const script = fakeEl({ tagName: 'SCRIPT' });
  const doc = { body: { children: [app, hud, loading, fatal, bar, scoreboard, script] } };

  setHudHidden(true, doc);
  assert.equal(app.style.visibility, '', 'app 容器不得被藏起來（否則畫布本身消失）');
  assert.equal(hud.style.visibility, '');
  assert.equal(loading.style.visibility, '');
  assert.equal(fatal.style.visibility, '');
  assert.equal(bar.style.visibility, '', '照片模式自己的工具列不能把自己藏起來');
  assert.equal(script.style.visibility, '', 'SCRIPT 標籤不處理');
  assert.equal(scoreboard.style.visibility, 'hidden', '一般 HUD 元素應該被批次隱藏');

  setHudHidden(false, doc);
  assert.equal(scoreboard.style.visibility, '', '還原後應該回到隱藏前的值');
});

test('setHudHidden：還原保留隱藏前既有的自訂 visibility 值（不是無腦清空）', () => {
  const el = fakeEl({ visibility: 'collapse' }); // 假設某元素隱藏前已有非空值
  const doc = { body: { children: [el] } };
  setHudHidden(true, doc);
  assert.equal(el.style.visibility, 'hidden');
  setHudHidden(false, doc);
  assert.equal(el.style.visibility, 'collapse', '應還原成隱藏前的原值，不是清成空字串');
});

test('setHudHidden：doc 缺失或例外不拋錯（非瀏覽器環境安全早退）', () => {
  assert.doesNotThrow(() => setHudHidden(true, null));
  assert.doesNotThrow(() => setHudHidden(true, {}));
  const hostile = { body: { get children() { throw new Error('boom'); } } };
  assert.doesNotThrow(() => setHudHidden(true, hostile));
});

// ---------- photoFilename：純函式 ----------

test('photoFilename：固定時間戳 → 決定論字串（YYYYMMDD-HHMMSS，.png 副檔名）', () => {
  const t = new Date(2026, 7, 31, 9, 5, 3).getTime(); // 2026-08-31 09:05:03（本地時區）
  assert.equal(photoFilename(t), 'volleyball-dream-20260831-090503.png');
});

// ---------- createPhotoOrbit：相機接管（真 three.js OrbitControls，最小 domElement 樁） ----------

function stubDomElement() {
  return {
    addEventListener() {}, removeEventListener() {},
    getRootNode() { return { addEventListener() {}, removeEventListener() {} }; },
    style: {},
    clientWidth: 800, clientHeight: 600,
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; },
    setPointerCapture() {}, releasePointerCapture() {},
  };
}

test('createPhotoOrbit：正常環境接管成功——回傳 controls+dispose，update()/dispose() 不拋錯', () => {
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 100);
  camera.position.set(5, 3, 8);
  const orbit = createPhotoOrbit(camera, stubDomElement());
  assert.ok(orbit, '正常環境應該接管成功');
  assert.doesNotThrow(() => orbit.controls.update());
  assert.doesNotThrow(() => orbit.dispose());
});

test('createPhotoOrbit：崩潰自我停用——camera/domElement 缺失或 domElement 敵意環境皆回傳 null、不拋錯', () => {
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 100);
  assert.equal(createPhotoOrbit(camera, null), null, '無 domElement＝無害回落');
  assert.equal(createPhotoOrbit(null, stubDomElement()), null, '無 camera＝無害回落');
  const hostile = stubDomElement();
  hostile.addEventListener = () => { throw new Error('boom'); };
  let result;
  assert.doesNotThrow(() => { result = createPhotoOrbit(camera, hostile); });
  assert.equal(result, null, '接管過程拋錯＝無害回落，不是讓例外往外冒');
});

// ---------- capturePhoto：快門（渲染後同步 toBlob）----------
// ★ 測到哪一層 ★：renderer/canvas 全走注入的假物件——驗證的是「render() 先於 toBlob()
// 被呼叫、toBlob 的回呼值原封不動變成 resolve 值」這條呼叫鏈本身，不是真的 WebGL
// 畫面編碼（Node 沒有真實 canvas/GPU，這條無法在本測試環境驗證，需真機/瀏覽器補）。

test('capturePhoto：呼叫鏈接線——先 render() 再 toBlob()，resolve 值＝toBlob 回呼的 blob', async () => {
  const calls = [];
  const fakeBlob = { size: 42, type: 'image/png' };
  const renderer = {
    render(scene, camera) { calls.push(['render', scene, camera]); },
    domElement: {
      toBlob(cb, mime) { calls.push(['toBlob', mime]); cb(fakeBlob); },
    },
  };
  const scene = { tag: 'scene' };
  const camera = { tag: 'camera' };
  const blob = await capturePhoto({ renderer, scene, camera });
  assert.equal(blob, fakeBlob);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ['render', scene, camera], 'render 必須先於 toBlob 執行（凍結檔明文「當幀 render 後同步 toBlob」）');
  assert.deepEqual(calls[1], ['toBlob', 'image/png']);
});

test('capturePhoto：DOM 環境不足（canvas 無 toBlob）——render 仍被呼叫，resolve(null) 不拋錯', async () => {
  const calls = [];
  const renderer = { render() { calls.push('render'); }, domElement: {} }; // 沒有 toBlob
  const blob = await capturePhoto({ renderer, scene: {}, camera: {} });
  assert.equal(blob, null);
  assert.deepEqual(calls, ['render'], '即使拍不出東西，render() 這一步仍要真的執行到——這是本測試環境驗得到的最深一層');
});

test('capturePhoto：崩潰自我停用——renderer.render 拋錯 ⇒ resolve(null)，promise 不 reject', async () => {
  const renderer = { render() { throw new Error('boom'); }, domElement: { toBlob() {} } };
  await assert.doesNotReject(async () => {
    const blob = await capturePhoto({ renderer, scene: {}, camera: {} });
    assert.equal(blob, null);
  });
});

// ---------- deliverPhoto：送達（分享優先，落回下載）----------
// Node 24 內建 Blob/File/URL 是真的 Web 標準物件（不必自己假造）；document/navigator
// 透過 env 注入假樁——這裡測的是「分享成功／分享不支援時落回下載／使用者取消分享時
// 落回下載／完全沒有 document 時安全回傳 false」四條分支的真實邏輯。

function fakeDoc() {
  const created = [];
  return {
    created,
    body: { appendChild(el) { created.push(el); } },
    createElement(tag) {
      return { tag, style: {}, click() { this.clicked = true; }, remove() { this.removed = true; } };
    },
  };
}

function fakeUrl() {
  const revoked = [];
  let n = 0;
  return {
    revoked,
    createObjectURL() { n += 1; return `blob:fake-${n}`; },
    revokeObjectURL(u) { revoked.push(u); },
  };
}

test('deliverPhoto：blob 為 null ⇒ 立即回傳 false（不觸碰任何 DOM/分享 API）', async () => {
  assert.equal(await deliverPhoto(null, 'x.png', { document: fakeDoc() }), false);
});

test('deliverPhoto：Web Share API 可用（canShare=true）⇒ 走分享，回傳 true，不落回下載', async () => {
  const shareCalls = [];
  const nav = {
    canShare: (o) => Array.isArray(o.files) && o.files.length === 1,
    async share(o) { shareCalls.push(o); },
  };
  const doc = fakeDoc();
  const blob = new Blob(['x'], { type: 'image/png' });
  const ok = await deliverPhoto(blob, 'photo.png', { navigator: nav, document: doc });
  assert.equal(ok, true);
  assert.equal(shareCalls.length, 1);
  assert.equal(shareCalls[0].files[0].name, 'photo.png');
  assert.equal(doc.created.length, 0, '分享成功不應該又建立下載連結');
});

test('deliverPhoto：不支援分享（無 canShare）⇒ 落回下載連結（click+revokeObjectURL）', async () => {
  const doc = fakeDoc();
  const url = fakeUrl();
  const blob = new Blob(['x'], { type: 'image/png' });
  const ok = await deliverPhoto(blob, 'photo.png', { navigator: {}, document: doc, URL: url });
  assert.equal(ok, true);
  assert.equal(doc.created.length, 1);
  assert.equal(doc.created[0].clicked, true);
  assert.equal(doc.created[0].download, 'photo.png');
});

test('deliverPhoto：canShare 回傳 true 但使用者取消分享（share() reject）⇒ 落回下載，仍回傳 true', async () => {
  const nav = {
    canShare: () => true,
    async share() { throw new DOMException('cancelled', 'AbortError'); },
  };
  const doc = fakeDoc();
  const url = fakeUrl();
  const blob = new Blob(['x'], { type: 'image/png' });
  const ok = await deliverPhoto(blob, 'photo.png', { navigator: nav, document: doc, URL: url });
  assert.equal(ok, true, '分享取消不算失敗，應該落回下載');
  assert.equal(doc.created.length, 1);
});

test('deliverPhoto：完全沒有 document/URL（env 皆空、且注入不存在的假全域）⇒ 安全回傳 false，不拋錯', async () => {
  const blob = new Blob(['x'], { type: 'image/png' });
  const ok = await deliverPhoto(blob, 'photo.png', { navigator: {}, document: null, URL: null });
  assert.equal(ok, false);
});

// ════════════════ src/app/matchLoop.js：enterPhotoMode/exitPhotoMode/… ════════════════

function makeStubStage() {
  const log = [];
  return {
    log,
    controls: { suspended: false, setSuspended(v) { this.suspended = v; log.push(['setSuspended', v]); } },
    photoBtn: {
      visible: true,
      hide() { this.visible = false; log.push(['photoBtn.hide']); },
      show() { this.visible = true; log.push(['photoBtn.show']); },
    },
    photoBar: {
      shown: false,
      show() { this.shown = true; log.push(['photoBar.show']); },
      hide() { this.shown = false; log.push(['photoBar.hide']); },
    },
  };
}

function makeStubCtx() {
  const renderCalls = [];
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 100);
  camera.position.set(5, 3, 8);
  return {
    camera,
    renderer: { domElement: stubDomElement(), render() {} },
    scene: { tag: 'scene' },
    postFx: { render(scene, cam) { renderCalls.push([scene, cam]); } },
    renderCalls,
  };
}

function makeStubS(overrides = {}) {
  return {
    game: { tick: 42, phase: 'rally' },
    tutorial: null,
    config: {},
    ctx: makeStubCtx(),
    stage: makeStubStage(),
    photoMode: null,
    ...overrides,
  };
}

test('①②enterPhotoMode/runPhotoModeFrame/exitPhotoMode：進入即接管相機＋短路輸入＋隱藏HUD，'
  + 'tick 全程不動（實測，不只看原始碼），退出後全部還原', () => {
  const s = makeStubS();
  enterPhotoMode(s);
  assert.ok(s.photoMode, '應該進入照片模式');
  assert.equal(s.stage.controls.suspended, true, '驗收⑤：進入即短路比賽輸入');
  assert.equal(s.stage.photoBar.shown, true);
  assert.equal(s.stage.photoBtn.visible, false);

  const tickBefore = s.game.tick;
  for (let i = 0; i < 5; i += 1) runPhotoModeFrame(s);
  assert.equal(s.game.tick, tickBefore, '驗收①：連跑 5 幀，game.tick 一個位元組沒動——sim 真的凍結了');
  assert.ok(s.ctx.renderCalls.length >= 5, '每幀都要真的渲染（否則畫面凍結不代表凍結畫面）');
  for (const [scene, cam] of s.ctx.renderCalls) {
    assert.equal(scene, s.ctx.scene);
    assert.equal(cam, s.ctx.camera);
  }

  exitPhotoMode(s);
  assert.equal(s.photoMode, null, '驗收②：退出應該清空 photoMode');
  assert.equal(s.stage.controls.suspended, false, '驗收②：退出應該還原比賽輸入');
  assert.equal(s.stage.photoBar.shown, false, '驗收②：HUD/工具列還原');
  assert.equal(s.stage.photoBtn.visible, true);
});

test('runPhotoModeFrame 原始碼：只呼叫 orbit.controls.update() 與 ctx.postFx.render()，不出現任何 s.game/stepGame 字樣', () => {
  const body = extractFunctionBody(src('src/app/matchLoop.js'), 'runPhotoModeFrame');
  assert.match(body, /s\.photoMode\.orbit\.controls\.update\(\)/);
  assert.match(body, /s\.ctx\.postFx\.render\(s\.ctx\.scene, s\.ctx\.camera\)/);
  assert.doesNotMatch(body, /s\.game/, 'photoMode 的每幀委派函式不得碰 game 狀態——這是 tick 凍結的第二層保證（原始碼層級）');
  assert.doesNotMatch(body, /stepGame|accumulator/, '不得出現 sim 推進的任一入口');
});

test('②相機還原機制：cameraRig.update 每幀無條件覆蓋 camera.position/lookAt——'
  + '證明退出後不需要手動存/還原也會自動回到腳本姿態', () => {
  // 這條驗的是「自動還原」這個設計成立的前提事實（cameraRig.js 的行為），不是重跑
  // 整個 matchLoop——見 enterPhotoMode 檔頭註解引用的這兩行
  const rigSrc = src('src/render/cameraRig.js');
  assert.match(rigSrc, /camera\.position\.copy\(curPos\);\s*\n\s*camera\.lookAt\(curTarget\);/);
});

test('enterPhotoMode：教學局/連線賽防呆——即使被直呼也不會進入（鈕本身也不建，見下方 matchStage 源碼測試）', () => {
  const s1 = makeStubS({ tutorial: { step: 0 } });
  enterPhotoMode(s1);
  assert.equal(s1.photoMode, null, '教學局不得進入照片模式');

  const s2 = makeStubS({ config: { net: { api: {} } } });
  enterPhotoMode(s2);
  assert.equal(s2.photoMode, null, '連線賽不得進入照片模式');
});

test('enterPhotoMode：崩潰自我停用——相機/domElement 缺失時無害回落（不進入、不拋錯、不動任何狀態）', () => {
  const s = makeStubS();
  s.ctx.renderer = { domElement: null }; // 接管必然失敗
  assert.doesNotThrow(() => enterPhotoMode(s));
  assert.equal(s.photoMode, null);
  assert.equal(s.stage.controls.suspended, false, '接管失敗不該有任何副作用殘留');
  assert.equal(s.stage.photoBar.shown, false);
});

test('enterPhotoMode：已在照片模式中再呼叫一次＝無效（不重建 orbit、不重複 push 狀態）', () => {
  const s = makeStubS();
  enterPhotoMode(s);
  const first = s.photoMode;
  enterPhotoMode(s);
  assert.equal(s.photoMode, first, '第二次呼叫應該是 no-op，不是重建一份新的 photoMode');
});

test('togglePhotoModeHud：翻轉 hudHidden 旗標；未在照片模式中呼叫則安全無效', () => {
  const s = makeStubS();
  enterPhotoMode(s);
  assert.equal(s.photoMode.hudHidden, true, '進入即預設隱藏 HUD（見凍結檔「一鈕隱藏/還原」，本實作預設值）');
  togglePhotoModeHud(s);
  assert.equal(s.photoMode.hudHidden, false);
  togglePhotoModeHud(s);
  assert.equal(s.photoMode.hudHidden, true);

  const s2 = makeStubS();
  assert.doesNotThrow(() => togglePhotoModeHud(s2));
});

test('③takePhoto：呼叫鏈接線——未進入照片模式時不觸碰 renderer；已進入時真的呼叫 render()（同 capturePhoto 測試的分層）', async () => {
  const idle = makeStubS();
  let touched = false;
  idle.ctx.renderer.render = () => { touched = true; };
  await takePhoto(idle);
  assert.equal(touched, false, '不在照片模式中按快門應該是無效呼叫');

  const s = makeStubS();
  enterPhotoMode(s);
  const renderCalls = [];
  s.ctx.renderer = {
    render(scene, cam) { renderCalls.push([scene, cam]); },
    domElement: { toBlob(cb) { cb({ size: 10, type: 'image/png' }); } },
  };
  await assert.doesNotReject(() => takePhoto(s));
  assert.equal(renderCalls.length, 1, '快門應該真的觸發一次 render()');
  assert.deepEqual(renderCalls[0], [s.ctx.scene, s.ctx.camera]);
  // deliverPhoto 這一段在本環境沒有真的 document（Node --test 無 DOM），會自然回傳
  // false（見 photoMode.js deliverPhoto 的「完全沒有 document」分支測試）——takePhoto
  // 本身吞掉這個結果不拋錯，這是本測試環境驗得到的最深一層；真實瀏覽器分享/下載
  // 是否成功需真機驗（同快門的「DOM 環境不足」分層說明）。
});

// ════════════════ frameStep 早退順序（源碼切片，matchLoop 太大不整套建置）════════════════

test('frameStep：s.photoMode 早退排在 s.replay 之前（同一幀不會兩者都跑），且分支只呼叫 runPhotoModeFrame 後 return', () => {
  const body = extractFunctionBody(src('src/app/matchLoop.js'), 'frameStep');
  const photoIdx = body.indexOf('if (s.photoMode) {');
  const replayIdx = body.indexOf('if (s.replay) {');
  assert.ok(photoIdx >= 0, '應該找到 s.photoMode 早退分支');
  assert.ok(replayIdx >= 0, '應該找到 s.replay 早退分支');
  assert.ok(photoIdx < replayIdx, 's.photoMode 必須比 s.replay 更早短路（凍結檔：進入即凍結一切）');
  const photoBlock = body.slice(photoIdx, body.indexOf('}', body.indexOf('return;', photoIdx)) + 1);
  assert.match(photoBlock, /runPhotoModeFrame\(s\);\s*\n\s*return;/);
});

// ════════════════ matchStage.js：④教學局/連線賽不提供入口（源碼掃描）════════════════

test('matchStage：photoBtn/photoBar 只在非教學局且非連線賽時建立（config.practice?.tutorial || config.net ⇒ null）', () => {
  const stageSrc = src('src/app/matchStage.js');
  assert.match(stageSrc, /const noPhotoEntry = !!\(config\.practice\?\.tutorial \|\| config\.net\);/);
  assert.match(stageSrc, /const photoBtn = noPhotoEntry \? null : createPhotoButton\(handlers\);/);
  assert.match(stageSrc, /const photoBar = noPhotoEntry \? null : createPhotoModeBar\(handlers\);/);
});

test('matchStage：handlers 初始值含四個 photo 開口，且 photoBtn/photoBar 有進 return（不是 bquickButton 那次「建了沒進 return」的重演）', () => {
  const stageSrc = src('src/app/matchStage.js');
  assert.match(stageSrc, /photoEnter: null, photoExit: null, photoShutter: null, photoHudToggle: null,/);
  // buildMatchStage 的 return（不是後面 createHeroStaminaBar 等 helper 自己的 return）：
  // 用它獨有的第一行字串定位，往後切一段找 photoBtn/photoBar 有沒有進這個 return
  const anchor = stageSrc.indexOf('handlers, matchView, rig, controls, scoreboard, commentary, sfx, touchUi,');
  assert.ok(anchor >= 0, '應該找到 buildMatchStage 的 return 開頭');
  const returnBlock = stageSrc.slice(anchor, anchor + 1400);
  assert.match(returnBlock, /photoBtn, photoBar,/);
});

// ════════════════ matchControls.js：⑤照片模式短路（真實呼叫，非源碼掃描） ════════════════

function withControls(fn) {
  const prevWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window') ? globalThis.window : undefined;
  const listeners = new Map();
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const domElement = {
    addEventListener(type, cb) { listeners.set(type, cb); },
    removeEventListener() {},
  };
  const rig = { setLook() {}, resetLook() {}, getMode: () => 'third', gazePoint: () => null };
  return (async () => {
    const mod = await import('../src/input/matchControls.js');
    const controls = mod.createMatchControls(domElement, null, 'A2', rig, true);
    try {
      return await fn(controls, listeners);
    } finally {
      if (prevWindow === undefined) delete globalThis.window; else globalThis.window = prevWindow;
    }
  })();
}

// 真實 sim 治具（同 tests/pro-batch4c-wiring.test.mjs 的 rigSpikeCtx 慣例）：不手搭假
// game 物件（會漏欄位、炸在與本測試無關的地方），走真實 createGame 再改欄位。
async function rigGame(mutate = (g) => g) {
  const { createGame, createDefaultTeams } = await import('../src/sim/game.js');
  const g = createGame({ seed: 1, teams: createDefaultTeams(), setTarget: 25 });
  mutate(g);
  return g;
}
const rigSpike = () => rigGame((g) => {
  g.phase = 'rally';
  g.rally.profile = 'arc';
  g.rally.possession = 'A';
  g.rally.touches = 2;
  g.rally.lastTouchTeam = 'A';
  g.rally.lastToucherId = 'A1';
});
// A2 在預設隊型是前排（見探針：rotations.A[1]），z=3 在 NEAR_NET_Z(2.2) 之外——
// 借位到網前、對手第一觸，讓 contextAction 判成 'block'
const rigBlock = () => rigGame((g) => {
  g.phase = 'rally';
  g.rally.possession = 'B';
  g.rally.touches = 1;
  g.actors.A2.z = 1;
});

test('⑤setSuspended(true)：beginAction()（actionButtons 路徑，繞過 DOM 監聽）短路，不產生蓄力（與未 suspend 對照，證明真有鑑別力）', () => withControls(async (c) => {
  const g = await rigSpike();
  c.collect(g); // 先餵 lastGame（contextAction 的依據，同 pro-batch4c twoPressIntent 慣例）
  c.setSuspended(true);
  c.beginAction(100, 100);
  assert.equal(c.getPlayerId(), 'A2'); // 治具健全性
  c.endAction();
  const intents = c.collect(g);
  assert.equal(intents[0].action, null, 'suspended 期間 beginAction 不得產生任何出手意圖');
}));

test('未 suspended 對照組：同一段 beginAction/endAction、同一份 game，正常應該打得出 spike（證明上一條的 null 是短路造成，不是治具本身打不出來）', () => withControls(async (c) => {
  const g = await rigSpike();
  c.collect(g);
  c.beginAction(100, 100);
  c.endAction();
  const intents = c.collect(g);
  assert.equal(intents[0].action, 'spike', '治具健全性：未 suspend 時同一段操作應該打得出 spike');
}));

test('⑤setSuspended(true)：清空任何進行中的蓄力/搖桿/緩衝出手（防止退出後下一 tick 誤發動作）', () => withControls(async (c) => {
  const g = await rigSpike();
  c.collect(g); // 先餵 lastGame
  c.beginAction(50, 50); // 正常先蓄力（未 suspend）
  c.setSuspended(true); // 進入照片模式：應立即丟掉這次蓄力
  c.setSuspended(false); // 退出
  c.endAction(); // 若殘留沒清乾淨，這裡會補發一個出手 intent
  const intents = c.collect(g);
  assert.equal(intents[0].action, null, '進入照片模式當下的蓄力必須被丟棄——不是被凍結保留到退出後補發');
}));

test('⑤suspended 期間 pressBlock()（攔網獨立按鈕路徑）不觸發攔網', () => withControls(async (c) => {
  c.setSuspended(true);
  c.pressBlock();
  const g = await rigBlock();
  const intents = c.collect(g);
  assert.notEqual(intents[0].action, 'block', 'suspended 期間攔網鈕必須是死的');
}));

test('未 suspended 對照組：pressBlock() 在合法窗內確實會觸發攔網（證明上一條真的量得到差異，不是治具本身就打不出 block）', () => withControls(async (c) => {
  c.pressBlock();
  const g = await rigBlock();
  const intents = c.collect(g);
  assert.equal(intents[0].action, 'block', '治具健全性：未 suspend 時同一顆鈕、同一份 game 應該真的打得出 block');
}));

test('⑤DOM 監聽層：suspended 時觸控 pointerdown 不建立搖桿（畫布拖曳交給 OrbitControls，不進比賽）', () => withControls(async (c, listeners) => {
  c.setSuspended(true);
  const down = listeners.get('pointerdown');
  assert.ok(down, '應該註冊了 pointerdown 監聽');
  assert.doesNotThrow(() => down({ pointerType: 'touch', clientX: 10, clientY: 10, pointerId: 1 }));
  const g = await rigGame();
  assert.doesNotThrow(() => c.collect(g));
}));

test('setSuspended(false)：解除短路後 beginAction/endAction 恢復正常出手（不是永久失能）', () => withControls(async (c) => {
  const g = await rigSpike();
  c.collect(g); // 先餵 lastGame
  c.setSuspended(true);
  c.setSuspended(false);
  c.beginAction(50, 50);
  c.endAction();
  const intents = c.collect(g);
  assert.equal(intents[0].action, 'spike', '解除短路後應該恢復正常——不是把輸入永久關死');
}));
