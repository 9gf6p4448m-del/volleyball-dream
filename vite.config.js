import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// 2026-08-07：build 戳記——真人回報「看不到新功能」時，第一件事要能分辨
// 「跑的是舊版」還是「邏輯真的沒觸發」。沒有這個字串，那兩件事在對話裡分不開，
// 08-07 為此來回獵了整輪（先誤判 SW 快取、再誤判位置閘，兩個都被實測推翻）。
// 台北時間，格式 YYYY-MM-DD HH:mm；顯示在主選單右下角（careerScreen renderHome）。
const BUILD_ID = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 16);

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  base: './', // 相對路徑：GitHub Pages 子路徑或任何靜態主機都能跑
  build: {
    // 08-24：真機（尤其手機）拿不到 console，排錯只能靠 fatal-error 疊層印出的
    // 極簡 stack；沒有 sourcemap 那串 minified 位置（Fl@...js:6:2356）等於無法定位。
    // 玩家不會主動載入 .map（只有接開發者工具才會抓），不影響一般載入體積。
    sourcemap: true,
    rollupOptions: {
      output: {
        // Phase 3 W1 bundle 分割：three（表現層最大宗）／sim 純核心／ui+career 面板層。
        // 動機＝高頻部署下的快取粒度——改 UI 不必重抓 three；全部 chunk 仍是
        // 首屏靜態 import（vite 自動 modulepreload，無瀑布延遲）、PWA 預快取照涵蓋
        manualChunks(id) {
          const p = id.replace(/\\/g, '/');
          if (p.includes('node_modules/three')) return 'three';
          if (p.includes('/src/sim/')) return 'sim';
          if (p.includes('/src/ui/') || p.includes('/src/career/')) return 'ui';
          return undefined; // render/app/input/入口 → 主 chunk
        },
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // 主遊戲零模型檔（幾何球員）；soldier.glb 只剩 ?mode=bench 用，改按需載入不預快取
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
      },
      manifest: {
        name: '排球夢',
        short_name: '排球夢',
        description: '玩法擬真的 3D 排球生涯遊戲（Phase 0 基準測試）',
        lang: 'zh-Hant',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#0b0e1a',
        theme_color: '#0b0e1a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
