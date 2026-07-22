import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './', // 相對路徑：GitHub Pages 子路徑或任何靜態主機都能跑
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
