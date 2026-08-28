// 大作感卷 批2（2026-08-28）：BGM 串流層——HTMLAudio（不進 WebAudio、不 decode，
// 串流播放省記憶體/CPU；sfx.js 的取樣走 WebAudio decode 是另一條路，兩者不共用）。
// 模組頂層不得碰 window/Audio（node --test 要能 import 本檔跑純函式測試）；
// Audio 元素一律 lazy 建立，失敗永遠靜音、不 throw、不留未接 rejection
// ——沿 sfx.js ensure() 的同一條紀律（見該檔檔頭 2026-08-28 真機事故）。
import { get as getAudioPrefs, subscribe as subscribeAudioPrefs, set as setAudioPrefs } from './audioPrefs.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

// 換檔即生效（Q2 拍板：曲風未定案，先用 CC0 demo 拼方向，之後可能用 Gemini/Suno
// 生成音樂整批替換）——只要覆蓋 public/audio/bgm/ 下同名檔即可，這裡的路徑不必改。
export const BGM_TRACKS = {
  menu: [
    `${BASE}audio/bgm/bgm_menu_01.m4a`,
    `${BASE}audio/bgm/bgm_menu_02.m4a`,
    `${BASE}audio/bgm/bgm_menu_03.m4a`,
  ],
  match: `${BASE}audio/bgm/bgm_match_tension.m4a`,
};

let menuEl = null;
let matchEl = null;
let tensionTarget = 0;
let smoothTimer = null;

function makeAudio() {
  try {
    const a = new Audio();
    a.loop = true;
    a.preload = 'none'; // 串流優先，不預抓——BGM 目錄本來就刻意不進 SW precache（A5b）
    return a;
  } catch {
    return null; // Audio 建構失敗（極罕見環境）＝這輪沒有 BGM，比賽照打
  }
}

// autoplay 政策擋下 play()＝綁一次性手勢重試（同 sfx.ensure 精神：失敗不鎖死，
// 下一次使用者手勢自然重試）
function armRetry(a) {
  const retry = () => {
    window.removeEventListener('pointerdown', retry);
    try { a.play()?.catch(() => {}); } catch { /* 仍失敗＝靜音，等下一次呼叫重武裝 */ }
  };
  window.addEventListener('pointerdown', retry, { once: true });
}

function safePlay(a) {
  try {
    const p = a.play();
    if (p?.catch) p.catch(() => armRetry(a));
  } catch { armRetry(a); }
}

function baseVolume() {
  const prefs = getAudioPrefs();
  return prefs.muted ? 0 : Math.max(0, Math.min(1, prefs.bgm));
}

function applyMenuVolume() {
  if (menuEl) menuEl.volume = baseVolume();
}

// 比賽氛圍層音量＝tensionVolume(緊張度) × bgm 音量／靜音——prefs 變更（拖滑桿／
// 按靜音）要立即反映在正在播的那一軌，不必等下一次 setTension
subscribeAudioPrefs(() => {
  applyMenuVolume();
  if (matchEl) matchEl.volume = tensionTarget * baseVolume();
});

function ensureSmoothing() {
  if (smoothTimer || typeof setInterval === 'undefined') return;
  smoothTimer = setInterval(() => {
    if (!matchEl) return;
    const target = tensionTarget * baseVolume();
    const diff = target - matchEl.volume;
    if (Math.abs(diff) < 0.003) { matchEl.volume = target; return; }
    matchEl.volume += diff * 0.15; // 平滑步進【試玩必調】
  }, 100);
  smoothTimer?.unref?.(); // node --test 環境：不讓這個 interval 卡住行程結束
}

export function playMenu() {
  try {
    if (matchEl) matchEl.pause();
    menuEl = menuEl ?? makeAudio();
    if (!menuEl) return;
    const prefs = getAudioPrefs();
    const idx = ((prefs.menuTrack % BGM_TRACKS.menu.length) + BGM_TRACKS.menu.length)
      % BGM_TRACKS.menu.length;
    const src = BGM_TRACKS.menu[idx];
    if (menuEl.dataset.src !== src) {
      menuEl.src = src;
      menuEl.dataset.src = src;
    }
    applyMenuVolume();
    safePlay(menuEl);
  } catch { /* 起不來＝安靜的主選單，遊戲照跑 */ }
}

export function playMatch() {
  try {
    if (menuEl) menuEl.pause();
    matchEl = matchEl ?? makeAudio();
    if (!matchEl) return;
    if (matchEl.dataset.src !== BGM_TRACKS.match) {
      matchEl.src = BGM_TRACKS.match;
      matchEl.dataset.src = BGM_TRACKS.match;
    }
    matchEl.volume = tensionTarget * baseVolume();
    safePlay(matchEl);
  } catch { /* 起不來＝安靜的比賽，遊戲照跑 */ }
}

export function stop() {
  try { menuEl?.pause(); } catch { /* 已停或不支援＝無事可做 */ }
  try { matchEl?.pause(); } catch { /* 已停或不支援＝無事可做 */ }
  if (smoothTimer) { clearInterval(smoothTimer); smoothTimer = null; }
}

// 純函式（A4b）：分差／局點賽點 → 緊張度 0..1。setPoint 恆 1；分差越小越緊張。
export function computeTension({ gapAbs = 0, setPoint = false } = {}) {
  if (setPoint) return 1;
  if (gapAbs <= 2) return 0.6; // 【試玩必調】
  return 0.25; // 【試玩必調】分差夠大時比賽氣氛較鬆
}

// 純函式（A4b）：緊張度 → 氛圍層目標音量。單調遞增。
export function tensionVolume(t01) {
  const t = Math.max(0, Math.min(1, t01));
  return 0.25 + 0.55 * t; // 【試玩必調】0（無感）→0.25；1（局點/賽點）→0.80
}

export function setTension(t01) {
  tensionTarget = tensionVolume(t01);
  ensureSmoothing();
}

// 選單曲切換鈕：換下一首候選、存 prefs、立即播放試聽
export function cycleMenuTrack() {
  const prefs = getAudioPrefs();
  const next = (prefs.menuTrack + 1) % BGM_TRACKS.menu.length;
  setAudioPrefs({ menuTrack: next });
  playMenu();
}
