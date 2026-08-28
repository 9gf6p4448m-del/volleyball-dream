// 大作感卷 批1＋2（acceptance-juice-batch12-20260828.md）：混合音效架構單元測試。
// 最小 fake AudioContext（chainable no-op node、記錄 gain 目標值／排程呼叫）＋
// stub global window/localStorage/fetch——不開真瀏覽器，node --test 直測。
//
// fake node 的 connect() 依真實 WebAudio 語意回傳「目的地」節點（讓 a.connect(b).connect(c)
// 的鏈式呼叫成立）；bufferSource→gain 的連線額外記一個 `_fromBufferMarker`（＝來源
// buffer 的內容），讓測試能認出「這個 gain 節點餵的是哪個取樣」而不必真的聽聲音。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSfx } from '../src/ui/sfx.js';
import { loadSamples, resetSamplesForTest } from '../src/ui/sfxSamples.js';
import {
  computeTension, tensionVolume, BGM_TRACKS,
} from '../src/ui/bgm.js';
import { get as getAudioPrefs, set as setAudioPrefs } from '../src/ui/audioPrefs.js';

// ---- fake WebAudio ----
function fakeGainParam(initial, onSchedule) {
  const p = {
    value: initial,
    setValueAtTime(v) { p.value = v; },
    exponentialRampToValueAtTime(v) { p.value = v; },
    setTargetAtTime(v, t, tc) { p.value = v; onSchedule?.(v, t, tc); },
  };
  return p;
}

function makeFakeAudioContext() {
  const ctx = {
    _now: 0,
    get currentTime() { return ctx._now; },
    sampleRate: 44100,
    state: 'running',
    oscillatorCount: 0,
    bufferSourcesCreated: [],
    gainNodesCreated: [],
    targetAtTimeLog: [], // {value,time} —— setTargetAtTime 全專案只有 crowdGain 這條線在用
    resume() { return Promise.resolve(); },
    close() {},
    createBuffer(_ch, len) {
      return { getChannelData: () => new Float32Array(len) };
    },
    async decodeAudioData(arr) {
      if (arr?.__fail) throw new Error('decode 失敗（模擬壞檔）');
      return { __decodedName: arr?.__sampleName ?? null };
    },
    destination: { connect(d) { return d; } },
    createGain() {
      const gain = fakeGainParam(1, (v, t, tc) => ctx.targetAtTimeLog.push({ value: v, time: t, tc }));
      const node = {
        gain,
        _fromBufferMarker: null,
        connect(dest) { return dest; },
      };
      ctx.gainNodesCreated.push(node);
      return node;
    },
    createBufferSource() {
      const node = {
        buffer: null,
        loop: false,
        playbackRate: { value: 1 },
        started: false,
        stopped: false,
        connect(dest) {
          if (node.buffer && dest?.gain !== undefined) dest._fromBufferMarker = node.buffer;
          return dest;
        },
        start() { node.started = true; },
        stop() { node.stopped = true; },
      };
      ctx.bufferSourcesCreated.push(node);
      return node;
    },
    createBiquadFilter() {
      return {
        type: 'lowpass', frequency: { value: 0 }, Q: { value: 0 }, connect(dest) { return dest; },
      };
    },
    createOscillator() {
      ctx.oscillatorCount += 1;
      return {
        type: 'sine',
        frequency: fakeGainParam(0),
        connect(dest) { return dest; },
        start() {},
        stop() {},
      };
    },
  };
  return ctx;
}

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 全程監看未接 rejection（A1b／A2 要求：模擬取樣全滅時零 unhandledRejection）
const unhandled = [];
process.on('unhandledRejection', (reason) => unhandled.push(reason));

let lastCtx = null;
function installFakeAudio({ fetchImpl }) {
  lastCtx = null;
  global.window = {
    // ★ 必須是可 new 的一般 function，不能用物件字面量的方法簡寫 ★——ES6 method
    // shorthand（`{ foo() {} }`）產生的是 non-constructor function，`new AC()` 會直接
    // throw「AC is not a constructor」，跟真實瀏覽器的 AudioContext 語意不同
    AudioContext: function FakeAudioContextCtor() {
      const c = makeFakeAudioContext();
      lastCtx = c;
      return c;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  global.fetch = fetchImpl;
  global.localStorage = fakeStorage();
}

// 逐檔成功：依 URL 檔名回傳可被 fakeCtx.decodeAudioData 解出唯一標記的內容
function fetchAllOk(url) {
  const file = String(url).split('/').pop();
  const name = file.replace(/\.m4a$/, '');
  return Promise.resolve({
    ok: true,
    arrayBuffer: () => Promise.resolve({ __sampleName: name }),
  });
}

// 全滅：fetch 直接 reject（模擬離線／CDN 掛掉），涵蓋 A1b「fetch 拒絕」情境
function fetchAllFail() {
  return Promise.reject(new Error('network down'));
}

// 觸發 ensure()＋拿到 sfx 內部建的 ctx，並等 loadSamples 的 promise 真的跑完
// （loadSamples 冪等：拿到的是同一個 in-flight/已完成 promise，awaiting 它等於
// 等真正的載入結果，不是憑空 sleep）
async function wakeAndLoad(sfx) {
  sfx.whistle(1); // 任一會呼叫 ensure() 的公開方法即可，這裡順便建立 ctx
  assert.ok(lastCtx, 'ensure() 應該已經建立 fake AudioContext');
  await loadSamples(lastCtx);
  return lastCtx;
}

test('A1a 取樣路徑：載入成功時重扣事件走 sample buffer，不建立新的合成 oscillator', async () => {
  resetSamplesForTest();
  installFakeAudio({ fetchImpl: fetchAllOk });
  const sfx = createSfx();
  const ctx = await wakeAndLoad(sfx);
  const oscBefore = ctx.oscillatorCount;
  sfx.onEvents([{ type: 'TOUCH', kind: 'spike', power: 0.9 }]);
  assert.equal(ctx.oscillatorCount, oscBefore, '重扣走取樣時不該再建立合成 oscillator（crack 未被呼叫）');
  const played = ctx.bufferSourcesCreated.some(
    (n) => n.buffer?.__decodedName === 'spike_hard' && n.started,
  );
  assert.ok(played, '應該播放 spike_hard 取樣（source.start 被呼叫）');
  sfx.dispose();
});

test('A1b／A2 合成 fallback：取樣全滅（fetch 全部 reject）時 loadSamples 仍 resolve，'
  + '事件照常發出合成音、零未接 rejection', async () => {
  resetSamplesForTest();
  installFakeAudio({ fetchImpl: fetchAllFail });
  const sfx = createSfx();
  const before = unhandled.length;
  const ctx = await wakeAndLoad(sfx); // 不 throw、不掛——loadSamples 本身永不 reject
  const oscBefore = ctx.oscillatorCount;
  sfx.onEvents([
    { type: 'SERVE' },
    { type: 'TOUCH', kind: 'spike', power: 0.9 },
    { type: 'BLOCK_TOUCH' },
    { type: 'DEAD_BALL' },
  ]);
  assert.ok(ctx.oscillatorCount > oscBefore, '取樣全滅時應退回合成路徑（會建立 oscillator）');
  // A2：遊戲照跑——dispose 也不該炸
  assert.doesNotThrow(() => sfx.dispose());
  await Promise.resolve(); // 讓 microtask queue 走完，未接 rejection 若存在會在這裡浮現
  assert.equal(unhandled.length, before, '取樣載入失敗全程不該產生任何未接 rejection');
});

test('A3 關鍵分聲浪爆炸：keyPoint 的死球歡呼音量高於非關鍵分；群眾底噪短暫衝高'
  + '（爆炸值）且蓋過同一時刻的常態呼叫', async () => {
  resetSamplesForTest();
  installFakeAudio({ fetchImpl: fetchAllOk });
  const sfx = createSfx();
  const ctx = await wakeAndLoad(sfx);

  // 非關鍵分：death ball 不帶 keyPoint
  sfx.onEvents([{ type: 'DEAD_BALL' }, { type: 'SCORE', team: 'A' }], { rallyFlights: 0 });
  const normalCheerGain = ctx.gainNodesCreated
    .find((n) => n._fromBufferMarker?.__decodedName === 'cheer')?.gain.value;
  assert.ok(normalCheerGain > 0, '非關鍵分應該播 cheer（非 cheer_big）');

  // 關鍵分：死球後歡呼應該更大聲、走 cheer_big，且群眾底噪立刻衝高到爆炸值
  ctx._now = 10;
  sfx.setCrowdLevel(0.05); // 常態值，先設一個基準
  sfx.onEvents([{ type: 'DEAD_BALL' }, { type: 'SCORE', team: 'A' }], {
    rallyFlights: 0, keyPoint: true,
  });
  const keyCheerGain = ctx.gainNodesCreated
    .find((n) => n._fromBufferMarker?.__decodedName === 'cheer_big')?.gain.value;
  assert.ok(keyCheerGain > normalCheerGain, '關鍵分歡呼音量應高於非關鍵分');

  const explosionCall = ctx.targetAtTimeLog.at(-1);
  assert.equal(explosionCall.value, 0.14, '關鍵分應該把群眾底噪衝到爆炸值');

  // 爆炸視窗內：matchLoop 逐幀灌進來的常態值呼叫必須被忽略，撐滿爆炸視窗
  sfx.setCrowdLevel(0.05); // 模擬同一幀之後 matchLoop 馬上又呼叫一次常態值
  assert.equal(ctx.targetAtTimeLog.at(-1).value, 0.14, '爆炸視窗內常態呼叫應被忽略');

  // 視窗結束（1.5 秒後）：常態呼叫恢復生效
  ctx._now = 10 + 1.6;
  sfx.setCrowdLevel(0.05);
  assert.equal(ctx.targetAtTimeLog.at(-1).value, 0.05, '爆炸視窗結束後應回到常態值（設計裁定：靠下一次常態呼叫自然回落）');

  // 非關鍵分不觸發屏息／爆炸：緊接著再打一顆非關鍵分死球，不該再衝到 0.14
  sfx.onEvents([{ type: 'DEAD_BALL' }, { type: 'SCORE', team: 'B' }], { rallyFlights: 0 });
  assert.notEqual(ctx.targetAtTimeLog.at(-1).value, 0.14, '非關鍵分不應觸發聲浪爆炸');

  sfx.dispose();
});

test('A4b tensionVolume／computeTension 純函式：單調遞增、setPoint 恆最高', () => {
  assert.equal(tensionVolume(0), 0.25);
  assert.equal(tensionVolume(1), 0.8);
  assert.ok(tensionVolume(1) > tensionVolume(0.5));
  assert.ok(tensionVolume(0.5) > tensionVolume(0));
  assert.equal(tensionVolume(-1), tensionVolume(0), '超出範圍夾在 0');
  assert.equal(tensionVolume(2), tensionVolume(1), '超出範圍夾在 1');

  assert.equal(computeTension({ setPoint: true, gapAbs: 20 }), 1, '局點/賽點恆最高，不看分差');
  assert.ok(computeTension({ setPoint: false, gapAbs: 1 }) > computeTension({ setPoint: false, gapAbs: 5 }),
    '分差小比分差大緊張');
  assert.ok(BGM_TRACKS.menu.length >= 1 && typeof BGM_TRACKS.match === 'string');
});

test('A4d audioPrefs：set→get 往返；壞掉的 localStorage 不 throw（退記憶體）', () => {
  global.localStorage = fakeStorage();
  const written = setAudioPrefs({ muted: true, sfx: 0.4, bgm: 0.6, menuTrack: 2 });
  assert.deepEqual(written, { muted: true, sfx: 0.4, bgm: 0.6, menuTrack: 2 });
  assert.deepEqual(getAudioPrefs(), written);

  // 私密模式：連 getItem 都 throw
  global.localStorage = {
    getItem() { throw new Error('private mode'); },
    setItem() { throw new Error('private mode'); },
  };
  assert.doesNotThrow(() => setAudioPrefs({ muted: false }));
  assert.equal(getAudioPrefs().muted, false, '私密模式仍應該讀到剛寫入的值（記憶體 fallback）');
});
