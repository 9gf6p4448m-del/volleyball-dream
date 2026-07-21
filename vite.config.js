import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './', // 相對路徑：GitHub Pages 子路徑或任何靜態主機都能跑
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,glb,webmanifest}'],
        // soldier.glb 約 2.2MB，放寬單檔預快取上限讓模型可離線
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
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
        background_color: '#1c2230',
        theme_color: '#1c2230',
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
