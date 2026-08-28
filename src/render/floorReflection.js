// 大作感卷 批3：夜賽球場地板反光——半透明 Reflector 疊在比賽場地上（NBA 亮面地板感）。
// 只在 `?fx=high`（Q5 拍板：真機 60FPS 過閘前不進預設檔）；Reflector 每幀多渲一次場景，
// 成本用 textureSize 512 壓住。任何失敗（shader 形狀變/建構丟例外）＝不加反光回 null，
// 永不致死（驗收 A4）。
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { COURT } from '../sim/constants.js';

// 【試玩必調】opacity 越高鏡面越明顯；刺眼就壓
export const REFLECT = { opacity: 0.26, textureSize: 512 };

// Reflector 原版 shader 輸出 alpha 恆 1（純鏡面）；補丁成 uniform 透明度才能疊在木地板上。
// 錨定字串對不上（three 升版改了 shader）＝回 false，呼叫端放棄加反光——寧可沒效果不賭壞畫面。
export function patchReflectorAlpha(material, opacity) {
  const target = 'gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );';
  const anchor = 'uniform vec3 color;';
  if (!material.fragmentShader.includes(target) || !material.fragmentShader.includes(anchor)) {
    return false;
  }
  material.fragmentShader = material.fragmentShader
    .replace(anchor, `${anchor}\n\t\tuniform float uOpacity;`)
    .replace(target, 'gl_FragColor = vec4( blendOverlay( base.rgb, color ), uOpacity );');
  material.uniforms.uOpacity = { value: opacity };
  material.transparent = true;
  material.depthWrite = false;
  return true;
}

export function createFloorReflection(scene, quality) {
  if (quality.fx !== 'high') return null;
  try {
    const reflector = new Reflector(
      new THREE.PlaneGeometry(COURT.WIDTH, COURT.LENGTH),
      {
        textureWidth: REFLECT.textureSize,
        textureHeight: REFLECT.textureSize,
        color: 0x889099,
        clipBias: 0.003,
      },
    );
    if (!patchReflectorAlpha(reflector.material, REFLECT.opacity)) return null;
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = 0.008; // 場地面 0.005 之上、界線 0.011 之下——線永遠壓在反光上
    scene.add(reflector);
    return reflector;
  } catch {
    return null;
  }
}
