// 大作感卷 批3：後處理包裝層——主場景渲染的單一出口（驗收 A3）。
// 預設檔（fx=off）＝直渲 passthrough，零後處理成本（A2）；`?fx=high` 才建
// EffectComposer＋UnrealBloomPass（鐵律 2：降規/升規只走 URL 參數，禁止自我調檔）。
// 紀律同 08-28 音訊事故：光效初始化失敗永不致死——composer 建不起來就退回直渲（A4）。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// 【試玩必調】threshold 拉高＝只有高亮像素（球發光/金色火花/燈帶）起光暈，場景整體不糊
export const BLOOM = { strength: 0.55, radius: 0.4, threshold: 0.82 };

function defaultComposerFactory(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    BLOOM.strength, BLOOM.radius, BLOOM.threshold,
  ));
  composer.addPass(new OutputPass()); // tone mapping/色彩空間在這一段做（composer 內部走線性 HDR）
  return composer;
}

// factory 參數＝測試注入點（A2/A4：off 檔斷言不被呼叫、丟例外斷言退回直渲）
export function createPostFx(renderer, scene, camera, quality, factory = defaultComposerFactory) {
  const plain = {
    enabled: false,
    render(sc = scene, cam = camera) { renderer.render(sc, cam); },
  };
  if (quality.fx !== 'high') return plain;
  let composer;
  try {
    composer = factory(renderer, scene, camera);
  } catch {
    return plain; // A4：光效失敗＝沒有光效，不准炸
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      composer.setSize(window.innerWidth, window.innerHeight);
    });
  }
  return {
    enabled: true,
    render(sc = scene, cam = camera) {
      // composer 的 RenderPass 綁建構時的主場景；別的場景（防呆）走直渲
      if (sc !== scene || cam !== camera) { renderer.render(sc, cam); return; }
      composer.render();
    },
  };
}
