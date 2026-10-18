// 「🆕 有新版，點這裡更新」更新列（2026-10-18，比照妖市 index.html checkForUpdate／applyUpdate）。
// 問題：製作人用 iPhone 主畫面 App 試玩；App 從背景切回前景不會重新導覽，SW 不會去查新版，
// GitHub Pages 對 index.html 又送 max-age=600 ⇒ 部署後他常常看不到新版本。
// 解法：開頁約 1.5 秒、pageshow、visibilitychange 回到前景時，用 `?upd=<時間戳>`＋
// cache:"no-store" 抓一次線上 index.html，讀出裡面的 build 戳記；比手上這版新就亮 #updBar，
// 點了才用 `?v=<新版>` 重載（不自動切換——比賽中不能被打斷）。節流 60 秒一次。
// 單一事實來源＝vite.config.js 的 BUILD_ID：同一個值經 define 編進 JS（__BUILD_ID__，主選單
// 右下角那行 build 戳記也是它）、經 transformIndexHtml 寫進 index.html 的 <meta name="vd-build">。
// SW：`?upd=` 不在 precache 清單 ⇒ 直接走網路；`?v=` 的導覽由 vite.config.js 的
// navigateFallbackDenylist 排除在 SW 導覽路由之外 ⇒ 一定拿網路上的新 index.html，不會卡在舊 SW。
// 純演出層：不碰 sim、不耗任何隨機源；所有路徑包 try，探針失敗只是不亮按鈕。

const BUILD_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/; // YYYY-MM-DD HH:mm（台北時間），字串比較即時間先後
const META_RE = /<meta name="vd-build" content="([^"]+)"/;
const THROTTLE_MS = 60000;

// 掛在 window.__vdUpdate 供真機偵錯與驗收（覆寫 current 即可模擬「手上是舊版」）
const state = {
  current: typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__,
  latest: null,
  lastCheck: 0,
  check: (force) => checkForUpdate(force),
};

export function checkForUpdate(force = false) {
  try {
    if (typeof fetch !== 'function' || !/^https?:$/.test(location.protocol)) return;
    if (!BUILD_RE.test(state.current)) return; // dev／測試環境沒有 build 戳記可比
    const now = Date.now();
    if (!force && now - state.lastCheck < THROTTLE_MS) return;
    state.lastCheck = now;
    const url = `${location.pathname.replace(/[^/]*$/, '')}index.html?upd=${now}`;
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((html) => {
        const m = META_RE.exec(html);
        if (!m || !BUILD_RE.test(m[1]) || m[1] <= state.current) return;
        state.latest = m[1];
        const bar = document.getElementById('updBar');
        if (!bar) return;
        bar.textContent = `🆕 有新版 v${state.latest}，點這裡更新`;
        bar.classList.add('on');
      })
      .catch(() => {});
  } catch { /* 探針失敗＝不亮按鈕，永不致死 */ }
}

export function applyUpdate() {
  if (!state.latest) return;
  location.replace(`${location.pathname}?v=${encodeURIComponent(state.latest)}`);
}

// 這一頁就是按了更新列、剛從網路拿到的那一版（?v= 等於自己的 build 戳記）。
// main.js 用它跳過「新 SW 接管就重載」——這頁本來就是最新版，再重載一次只會打斷玩家。
export function isFreshUpdateLoad() {
  try { return new URLSearchParams(location.search).get('v') === state.current; } catch { return false; }
}

export function installUpdateBar() {
  try {
    window.__vdUpdate = state;
    document.getElementById('updBar')?.addEventListener('click', applyUpdate);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate(false);
    });
    window.addEventListener('pageshow', () => checkForUpdate(false));
    setTimeout(() => {
      checkForUpdate(true);
      // 剛按更新導過來：舊 SW 不一定會自己去查新版（本機實測過舊 SW 放著 56 秒都沒換），
      // 不換的話下次從主畫面開 App 又會拿到舊 SW 預快取的舊版 ⇒ 這裡主動叫它更新
      try {
        if (isFreshUpdateLoad()) navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
      } catch { /* 同上 */ }
    }, 1500);
  } catch { /* 同上 */ }
}
