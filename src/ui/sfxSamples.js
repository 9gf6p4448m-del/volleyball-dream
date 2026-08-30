// 大作感卷 批1（2026-08-28）：取樣註冊表——真實音效優先、合成 fallback（sfx.js 消費）。
// ★ 音檔本身還沒進 repo ★（Q1 拍板：開音檔閘，但先用 CC0 demo 素材拼方向，Sawmah
// 之後可能用 Gemini/Suno 生成音樂整批替換）。這代表本檔在「檔案全缺」（fetch 全部
// 404）下必須完全正常運作、resolve 而非 reject——這正是本卷的架構本體，不是邊角案例。
//
// 名稱固定（sfx.js 按名稱查表，不猜檔名）；trim＝響度校正倍率，之後試玩拿到真實
// 素材再逐項調（每項都標【試玩必調】——校正值現在全是佔位的 1）。

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

export const SAMPLE_MANIFEST = {
  spike_hard: { file: 'spike_hard.m4a', trim: 1 }, // 【試玩必調】重扣
  spike_mid: { file: 'spike_mid.m4a', trim: 1 }, // 【試玩必調】發球
  spike_soft: { file: 'spike_soft.m4a', trim: 1 }, // 【試玩必調】輕吊
  block: { file: 'block.m4a', trim: 1 }, // 【試玩必調】攔網觸球
  receive: { file: 'receive.m4a', trim: 1 }, // 【試玩必調】接球（含第三擊安全球）
  set_touch: { file: 'set_touch.m4a', trim: 1 }, // 【試玩必調】舉球
  net: { file: 'net.m4a', trim: 1 }, // 【試玩必調】觸網
  floor: { file: 'floor.m4a', trim: 1 }, // 【試玩必調】落地
  crowd_loop: { file: 'crowd_loop.m4a', trim: 1 }, // 【試玩必調】群眾底噪（loop）
  cheer: { file: 'cheer.m4a', trim: 1 }, // 【試玩必調】一般得分歡呼
  cheer_big: { file: 'cheer_big.m4a', trim: 1 }, // 【試玩必調】關鍵分／大聲量歡呼
  squeak: { file: 'squeak.m4a', trim: 1 }, // 【試玩必調】鞋底摩擦（急停/變向）；檔案未進 repo＝走合成 fallback
};

const buffers = new Map(); // name -> AudioBuffer（跨 AudioContext 可重用，dispose 重建 ctx 不必重抓）
let loadState = 'idle'; // idle | loading | done
let loadPromise = null;

// 逐檔 fetch + decodeAudioData；個別檔案失敗（404／decode 錯）只 warn，不擋其他檔、
// 不讓整體 promise reject——呼叫端（sfx.js ensure()）不 await 這個 promise，若會
// reject 就是留一個未接 rejection的地雷（main.js 的 unhandledrejection 會蓋死屏）。
// 只載一次：進行中或已完成都回同一個 promise，重覆呼叫（每場比賽 createSfx 都會
// 呼叫一次）不重抓。
export function loadSamples(ctx) {
  if (!ctx) return Promise.resolve();
  if (loadState === 'done') return Promise.resolve();
  if (loadState === 'loading') return loadPromise;
  loadState = 'loading';
  const names = Object.keys(SAMPLE_MANIFEST);
  loadPromise = Promise.all(names.map(async (name) => {
    const { file } = SAMPLE_MANIFEST[name];
    try {
      const res = await fetch(`${BASE}audio/sfx/${file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(arr);
      buffers.set(name, buf);
    } catch (err) {
      // 這一顆沒聲音，其餘照載——音檔本身還沒進 repo 時這裡全部落 catch，是預期路徑
      console.warn('[audio-nonfatal]', `取樣 "${name}" 載入失敗，走合成 fallback`, err);
    }
  })).then(() => { loadState = 'done'; });
  return loadPromise;
}

// 有 buffer→建 source 接上 dest 播放、回傳 source（truthy，loop 版供呼叫端 stop）；
// 無 buffer 或播放本身出錯→回傳 false，呼叫端據此走合成 fallback。
// delay＝延後幾秒開播（WebAudio 排程，非 setTimeout）；fadeIn＝淡入秒數（>0 時
// 用指數包絡從近零爬到目標音量——得分歡呼「湧起」而非「拍臉」的關鍵，08-29 試玩回饋）；
// maxDur＝只播取樣的前幾秒（尾端 40ms 淡出防喀）——短哨等「取樣比需要長」的情境用
// （08-30 試玩回饋：發球短哨播了整段哨音、跟得分長哨一樣吵）
export function playSample(ctx, dest, name, {
  gain = 1, rate = 1, loop = false, delay = 0, fadeIn = 0, maxDur = 0,
} = {}) {
  const buf = buffers.get(name);
  if (!ctx || !dest || !buf) return false;
  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    if (rate !== 1) src.playbackRate.value = rate;
    const trim = SAMPLE_MANIFEST[name]?.trim ?? 1;
    const g = ctx.createGain();
    const target = Math.max(0, gain * trim);
    const t0 = ctx.currentTime + Math.max(0, delay);
    if (fadeIn > 0 && target > 0) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(target, t0 + fadeIn);
    } else {
      g.gain.value = target;
    }
    if (maxDur > 0 && !loop) {
      const cut = Math.max(0.06, maxDur);
      g.gain.setValueAtTime(target, t0 + cut - 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + cut);
      src.stop(t0 + cut + 0.01);
    }
    src.connect(g).connect(dest);
    src.start(t0);
    return src;
  } catch {
    return false; // 起不來＝這一下沒聲音，維持靜默、不擋其他事件
  }
}

// 僅供測試重置模組層快取（生產路徑不呼叫——buffers 跨 ctx 重用是刻意設計，見檔頭）
export function resetSamplesForTest() {
  buffers.clear();
  loadState = 'idle';
  loadPromise = null;
}
