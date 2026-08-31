// 排球的畫面呈現：讀取模擬狀態＋插值，不寫入任何模擬資料
import * as THREE from 'three';
import { SIM_DT } from '../sim/constants.js';
import { COLORS } from '../ui/theme.js';

const TRAIL_N = 10;       // 尾跡取樣點數
const TRAIL_SPEED = 9;    // 球速高於此（m/s）才顯示尾跡（重扣/強發球）
const SPARK_N = 56;       // 批3 金色火花池槽數（循環使用；死粒子藏到地下）

// 批3：每幀火花生成數——速度越快越密，封頂 3（【試玩必調】）。
// 純函式獨立匯出＝驗收 A5 的紅綠測試點。
export function sparkSpawnCount(speed) {
  if (speed <= TRAIL_SPEED) return 0;
  return Math.min(3, 1 + Math.floor((speed - TRAIL_SPEED) / 6));
}

const _spinAxis = new THREE.Vector3();
const _spinQ = new THREE.Quaternion();

export function createBallView(scene, quality) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 24, 18),
    new THREE.MeshStandardMaterial({
      map: makeBallTexture(),
      roughness: 0.55,
      // 丙3（接球微回饋批2，NJ-4）：完美接球短暫發光——emissive 常駐、intensity
      // 平時 0（零視覺成本），glow>0 才亮（見 sync 的 glow 參數）
      emissive: new THREE.Color(0xffd873),
      emissiveIntensity: 0,
    }),
  );
  mesh.castShadow = quality.shadowSize > 0;
  scene.add(mesh);

  // 落點視覺線索：貼地圓影（設計要求「球的即時影子」，即使關閉即時陰影也存在）
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.14, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  scene.add(blob);

  // 高速球尾跡（重扣的速度感）：最近 N 個位置連線
  const trailPos = new Float32Array(TRAIL_N * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Line(
    trailGeo,
    // 批3：色值單一來源＝theme.js 批4 金色（A5）
    new THREE.LineBasicMaterial({ color: new THREE.Color(COLORS.goldLight), transparent: true, opacity: 0.55 }),
  );
  trail.visible = false;
  trail.frustumCulled = false;
  scene.add(trail);

  // 批3 金色火花拖尾（預設檔輕量升級）：單一 Points、加法混色——高速球後方
  // 灑出漸滅的金色餘燼；fx=high 時這些高亮像素天然吃 bloom。決定論偽亂數
  // （同 matchView 塵土手法），不碰 sim rng。
  const sparkPos = new Float32Array(SPARK_N * 3).fill(-100);
  const sparkVel = new Float32Array(SPARK_N * 3);
  const sparkLife = new Float32Array(SPARK_N);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: new THREE.Color(COLORS.goldLight), size: 0.13, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false, // 【試玩必調】size/opacity
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkCursor = 0;
  let sparkSeed = 2166136261; // 決定論偽亂數（視覺層）
  const sparkRnd = () => {
    sparkSeed = Math.imul(sparkSeed ^ (sparkSeed >>> 15), 2246822519);
    return ((sparkSeed >>> 0) % 1000) / 1000;
  };

  return {
    // alpha = 累積器剩餘時間 / SIM_DT，於上一步與當前步之間插值；dt＝幀時間（視覺滾動用）
    // floatFlight＝飄浮發球飛行中（07-24）：不轉＋不規則小幅飄移（knuckle 亂流視覺）——
    // 純渲染偏移不動 sim 落點；「殺傷」本體仍是 sim 接發品質懲罰，這裡補「看得到的飄」
    // glow＝丙3 完美接球發光強度 0..1（matchLoop 依 ballGlowUntil 時窗算好餵進來，
    // 這裡只管畫；省略＝0＝不亮，回放模式不傳這個參數，天生不受影響）
    sync(ball, alpha, dt = 1 / 60, floatFlight = false, glow = 0) {
      const x = ball.px + (ball.x - ball.px) * alpha;
      const y = ball.py + (ball.y - ball.py) * alpha;
      const z = ball.pz + (ball.z - ball.pz) * alpha;
      let fx = 0;
      let fy = 0;
      if (floatFlight) {
        // 以軌跡位置驅動相位（決定論、不吃牆鐘）：雙頻疊加＝不規則抖動
        const t = (x + z) * 7.3 + y * 3.1;
        fx = (Math.sin(t * 2.7) + Math.sin(t * 6.1 + 1.7)) * 0.035;
        fy = (Math.sin(t * 3.9 + 0.6) + Math.sin(t * 8.3)) * 0.03;
      }
      mesh.position.set(x + fx, y + fy, z);
      // 候補池卷 P1-1：轉速∝球速、轉軸垂直於水平行進方向（上旋視覺）——重扣狂轉、
      // 慢球慢滾；飄浮球維持近停（真飄的招牌，轉了等於視覺說謊）。純視覺不碰 sim。
      const spd = Math.hypot(ball.vx ?? 0, ball.vz ?? 0);
      if (floatFlight || spd < 0.5) {
        mesh.rotation.x += (floatFlight ? 0.25 : 1.2) * dt;
      } else {
        _spinAxis.set(ball.vz, 0, -ball.vx).normalize();
        _spinQ.setFromAxisAngle(_spinAxis, Math.min(18, 2 + spd * 0.9) * dt); // 【試玩必調】
        mesh.quaternion.premultiply(_spinQ);
      }
      mesh.material.emissiveIntensity = glow * 1.6; // 丙3：短暫發光（強度隨時窗衰減）
      blob.position.x = x;
      blob.position.z = z;

      // 尾跡：往後平移取樣點、插入當前位置；只在高速時顯示
      for (let i = TRAIL_N - 1; i > 0; i -= 1) {
        trailPos[i * 3] = trailPos[(i - 1) * 3];
        trailPos[i * 3 + 1] = trailPos[(i - 1) * 3 + 1];
        trailPos[i * 3 + 2] = trailPos[(i - 1) * 3 + 2];
      }
      trailPos[0] = x; trailPos[1] = y; trailPos[2] = z;
      trailGeo.attributes.position.needsUpdate = true;
      const speed = Math.hypot(ball.x - ball.px, ball.y - ball.py, ball.z - ball.pz) / SIM_DT;
      trail.visible = speed > TRAIL_SPEED;

      // 批3 火花：高速時在球位灑餘燼（微抖動＋緩慢飄散），逐幀老化漸滅
      for (let k = sparkSpawnCount(speed); k > 0; k -= 1) {
        const i = sparkCursor;
        sparkCursor = (sparkCursor + 1) % SPARK_N;
        sparkPos[i * 3] = x + (sparkRnd() - 0.5) * 0.12;
        sparkPos[i * 3 + 1] = y + (sparkRnd() - 0.5) * 0.12;
        sparkPos[i * 3 + 2] = z + (sparkRnd() - 0.5) * 0.12;
        sparkVel[i * 3] = (sparkRnd() - 0.5) * 0.6;
        sparkVel[i * 3 + 1] = 0.2 + sparkRnd() * 0.5;
        sparkVel[i * 3 + 2] = (sparkRnd() - 0.5) * 0.6;
        sparkLife[i] = 0.18 + sparkRnd() * 0.14; // 【試玩必調】餘燼壽命
      }
      let sparkAlive = false;
      for (let i = 0; i < SPARK_N; i += 1) {
        if (sparkLife[i] <= 0) continue;
        sparkAlive = true;
        sparkLife[i] -= dt;
        if (sparkLife[i] <= 0) { sparkPos[i * 3 + 1] = -100; continue; }
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      }
      if (sparkAlive) sparkGeo.attributes.position.needsUpdate = true;
      const h = Math.min(Math.max(y, 0), 8) / 8;
      blob.material.opacity = 0.4 * (1 - h * 0.8);
      const s = 1 + h * 1.5;
      blob.scale.set(s, s, 1);
    },
  };
}

// 程序化藍黃排球貼圖（不依賴外部圖檔）
function makeBallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const bands = ['#f7d117', '#1a4fa0', '#f7d117', '#ffffff', '#1a4fa0', '#f7d117'];
  const bandH = canvas.height / bands.length;
  bands.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, i * bandH, canvas.width, bandH + 1);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
