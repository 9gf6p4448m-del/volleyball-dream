// 體育館環境（純視覺，不碰 sim）：環繞看台＋觀眾剪影＋場邊 LED 廣告板
// W4(P4) Q10 三館制：常規館（現有夜賽館）／關鍵戰館（縣立競技場：更貼場環繞＋桁架＋
// 地板換色）／冠軍館（挑高穹頂＋上下兩層看台＋滿場觀眾）。零模型檔程序化路線——
// 三館共用同一套建築函式，差異全在 VENUES 規格（幾何結構＋氛圍參數）。
// 效能約定：看台為靜態 box、觀眾單一 InstancedMesh（1 draw call）、廣告板共用少量材質。
// 降規把手（60 FPS 未達標時逐項降）：attendance（出席率）→ 上層看台 count → 桁架/穹頂
import * as THREE from 'three';
import { COURT } from '../sim/constants.js';
// 配色卷階段二 E4：opts.teamName 缺席時的字面值預設——只借單一事實來源的常數
// （不重複刻字面值，見 acceptance V4 grep 名單），不是在這裡自查章節/學校狀態；
// 章節判定本身仍一律由呼叫端（matchConfig.currentTeamName）算好再遞進來
import { OUR_TEAM_NAME } from '../career/roster.js';

function hash01(n) {
  let x = Math.imul(n | 0, 2654435761);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// 三館規格（單一事實源）：tiers＝看台環（可多環＝上下兩層）；attendance＝出席率；
// floor＝地板換色（null＝不動 court 預設）；truss/dome＝頂部結構
export const VENUES = {
  regular: {
    label: '市立體育館',
    tiers: [{ x0: 13.2, z0: 15.6, step: 2.0, rise: 1.15, y0: 0.5, count: 4 }],
    attendance: 0.88,
    standColor: 0x131a2c,
    crowdColors: [0x2a3352, 0x3a2f4a, 0x27354a, 0x40304a, 0x223047, 0x4a3a30],
    truss: false,
    dome: false,
    // 配色卷階段二 E4：{TEAM} 為隊名佔位符，setVenue 時用 opts.teamName 代入
    // （render 層不 import career 狀態自查；「★ 主場之夜」字樣保留）
    adTexts: ['排球夢 VOLLEYBALL DREAM', 'SAWMAH SPORTS', '{TEAM} ★ 主場之夜'],
    adColors: [['#0b1430', '#6ee7ff'], ['#301010', '#ff9d7a'], ['#101f14', '#8dffb0']],
    floor: null,
  },
  key: {
    label: '縣立競技場',
    // 四面環繞更貼場（x0/z0 內移）＋五層階梯（包圍感）＋頂部桁架＋地板換色系
    tiers: [{ x0: 11.8, z0: 13.9, step: 1.75, rise: 1.3, y0: 0.5, count: 5 }],
    attendance: 0.95,
    standColor: 0x18202f,
    crowdColors: [0x33406a, 0x4a3a5e, 0x2f4360, 0x523c5e, 0x2a3d5a, 0x5e4a3a],
    truss: true,
    dome: false,
    adTexts: ['全國高中排球錦標賽', 'COUNTY ARENA 縣立競技場', '排球夢 VOLLEYBALL DREAM'],
    adColors: [['#101a30', '#ffd166'], ['#141426', '#9db2ff'], ['#0b1430', '#6ee7ff']],
    floor: { zone: 0x35455a, court: 0x3d7a99 }, // 藍灰競技場膠地（與常規暖木區隔）
  },
  final: {
    label: '冠軍體育館',
    // 挑高穹頂＋上下兩層看台＋滿場觀眾；決賽燈光秀開場由 lights/rig 驅動
    tiers: [
      { x0: 12.6, z0: 14.8, step: 1.8, rise: 1.2, y0: 0.5, count: 4 },
      { x0: 16.8, z0: 19.0, step: 1.7, rise: 1.45, y0: 8.4, count: 3 }, // 上層第二環
    ],
    attendance: 1.0,
    standColor: 0x1c2138,
    crowdColors: [0x3a4a7a, 0x5a4070, 0x35506e, 0x64466e, 0x304868, 0x6e563a],
    truss: true,
    dome: true,
    adTexts: ['全國大賽 CHAMPIONSHIP FINAL', '頂點之夜 THE SUMMIT', '排球夢 VOLLEYBALL DREAM'],
    adColors: [['#1a1405', '#ffd166'], ['#140b20', '#d0a2ff'], ['#0b1430', '#6ee7ff']],
    floor: { zone: 0x2c3550, court: 0xc9803d }, // 國際賽配色：藍自由區＋暖木場地
  },
};

// 建館（回傳可切館把手）：venue 切換＝整組 dispose 重建（比賽開場一次，非熱路徑）。
// opts.awayBanner＝主客場氛圍（關鍵戰館打宿敵：客隊橫幅＋客隊應援色塊；冠軍館中立不帶）
// opts.teamName＝現在的隊名（配色卷階段二 E4：常規館「★ 主場之夜」看板用）
export function createArena(scene, venueKey = 'regular') {
  let group = null;
  let currentSig = null;

  const api = {
    setVenue(key, opts = {}) {
      const spec = VENUES[key] ?? VENUES.regular;
      const teamName = opts.teamName ?? OUR_TEAM_NAME;
      const sig = `${key}|${opts.awayBanner?.name ?? ''}|${teamName}`;
      if (sig === currentSig) return spec; // 同館同氛圍同隊名＝免重建
      if (group) disposeGroup(scene, group);
      group = new THREE.Group();
      buildStands(group, spec);
      buildCrowd(group, spec, opts);
      buildAdBoards(group, spec, teamName);
      if (spec.truss) buildTruss(group, spec);
      if (spec.dome) buildDome(group, spec);
      if (opts.awayBanner) buildAwayBanner(group, spec, opts.awayBanner);
      group.traverse((o) => { if (o.isMesh) o.matrixAutoUpdate = false; });
      scene.add(group);
      currentSig = sig;
      return spec;
    },
    venueLabel() {
      return currentSig ? (VENUES[currentSig.split('|')[0]] ?? VENUES.regular).label : '';
    },
  };
  api.setVenue(venueKey);
  return api;
}

function disposeGroup(scene, group) {
  const geos = new Set();
  const mats = new Set();
  group.traverse((o) => {
    if (o.isMesh) {
      geos.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
    }
  });
  scene.remove(group);
  for (const g of geos) g.dispose();
  for (const m of mats) {
    if (m.map) m.map.dispose();
    m.dispose();
  }
}

// 環繞看台：每環 count 層階梯（長邊沿 z、短邊沿 x），越外越高；多環＝上下兩層看台
function buildStands(group, spec) {
  const mat = new THREE.MeshStandardMaterial({ color: spec.standColor, roughness: 0.95 });
  for (const ring of spec.tiers) {
    const longLen = ring.z0 * 2 + 3;
    const shortLen = ring.x0 * 2 - 2;
    for (let t = 0; t < ring.count; t += 1) {
      const y = ring.y0 + t * ring.rise;
      const longGeo = new THREE.BoxGeometry(ring.step, 1.0, longLen);
      for (const sx of [1, -1]) {
        const m = new THREE.Mesh(longGeo, mat);
        m.position.set(sx * (ring.x0 + t * ring.step), y, 0);
        m.updateMatrix();
        group.add(m);
      }
      const shortGeo = new THREE.BoxGeometry(shortLen, 1.0, ring.step);
      for (const sz of [1, -1]) {
        const m = new THREE.Mesh(shortGeo, mat);
        m.position.set(0, y, sz * (ring.z0 + t * ring.step));
        m.updateMatrix();
        group.add(m);
      }
    }
  }
}

// 觀眾剪影：單一 InstancedMesh；決定論散佈（hash，非亂數）＋輕微高低與色彩變化。
// awayBanner 主客場氛圍：客隊側（B＝z<0）短邊看台整塊染客隊色＝「他們的應援團」可視化
function buildCrowd(group, spec, opts = {}) {
  const spots = []; // [x, y, z, isAwayBlock]
  for (const ring of spec.tiers) {
    for (let t = 0; t < ring.count; t += 1) {
      const y = ring.y0 + t * ring.rise + 0.75;
      const lx = ring.x0 + t * ring.step;
      const longN = Math.floor((ring.z0 * 2 + 1) / 0.61);
      for (let i = 0; i < longN; i += 1) {
        const z = -(ring.z0 - 0.3) + i * 0.61;
        spots.push([lx, y, z, false], [-lx, y, z, false]);
      }
      const sz = ring.z0 + t * ring.step;
      const shortN = Math.floor((ring.x0 * 2 - 3) / 0.62);
      for (let i = 0; i < shortN; i += 1) {
        const x = -(ring.x0 - 2) + i * 0.62;
        // 客隊應援區＝z<0 短邊（B 隊側；TEAM_SIDE.B=-1）
        spots.push([x, y, sz, false], [x, y, -sz, !!opts.awayBanner]);
      }
    }
  }
  const geo = new THREE.CapsuleGeometry(0.17, 0.36, 3, 8);
  const mat = new THREE.MeshStandardMaterial({ roughness: 1 });
  const crowd = new THREE.InstancedMesh(geo, mat, spots.length);
  const m4 = new THREE.Matrix4();
  const color = new THREE.Color();
  const awayColor = new THREE.Color(opts.awayBanner?.color ?? '#5a7dd8');
  spots.forEach(([x, y, z, away], i) => {
    // 決定論變化：出席率（缺席者移到地下）、身高與左右微偏
    const h = hash01(i * 7919 + 13);
    const present = h < spec.attendance;
    const jx = (hash01(i * 104729 + 7) - 0.5) * 0.22;
    const jy = (hash01(i * 1301 + 3) - 0.5) * 0.14;
    m4.makeTranslation(present ? x + jx : 0, present ? y + jy : -50, z);
    crowd.setMatrixAt(i, m4);
    if (away && hash01(i * 271 + 5) < 0.8) {
      color.copy(awayColor).multiplyScalar(0.55 + hash01(i * 33 + 1) * 0.3);
    } else {
      color.setHex(spec.crowdColors[Math.floor(h * spec.crowdColors.length) % spec.crowdColors.length]);
    }
    crowd.setColorAt(i, color);
  });
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  group.add(crowd);
}

// 場邊 LED 廣告板：自由區外緣、面向球場；MeshBasic（不受光）＝自發光 LED 感
// teamName：代入 adTexts 裡的 {TEAM} 佔位符（其餘無佔位符的文字 replace 為 no-op）
function buildAdBoards(group, spec, teamName) {
  const adTexts = spec.adTexts.map((t) => t.replace('{TEAM}', teamName));
  const texs = adTexts.map((t, i) => makeBannerTexture(t, spec.adColors[i][0], spec.adColors[i][1]));
  const mats = texs.map((map) => new THREE.MeshBasicMaterial({ map, toneMapped: false }));
  const geo = new THREE.PlaneGeometry(7.2, 0.85);
  const edgeX = COURT.WIDTH / 2 + COURT.FREE_ZONE + 0.6;
  const edgeZ = COURT.LENGTH / 2 + COURT.FREE_ZONE + 0.6;
  const put = (x, z, ry, mi) => {
    const m = new THREE.Mesh(geo, mats[mi % mats.length]);
    m.position.set(x, 0.46, z);
    m.rotation.y = ry;
    m.updateMatrix();
    group.add(m);
  };
  // 長邊各 2 面、短邊各 1 面（面向球場中央）
  put(edgeX, 5.5, -Math.PI / 2, 0);
  put(edgeX, -5.5, -Math.PI / 2, 1);
  put(-edgeX, 5.5, Math.PI / 2, 2);
  put(-edgeX, -5.5, Math.PI / 2, 0);
  put(0, edgeZ, Math.PI, 1);
  put(0, -edgeZ, 0, 2);
}

// 頂部桁架（關鍵戰館/冠軍館）：縱橫工字樑剪影——縣立競技場的鋼構氣質
function buildTruss(group, spec) {
  const top = spec.tiers[spec.tiers.length - 1];
  const h = top.y0 + top.count * top.rise + 4.2;
  const mat = new THREE.MeshStandardMaterial({ color: 0x232a3e, roughness: 0.8 });
  const spanX = (top.x0 + top.count * top.step) * 2 + 2;
  const spanZ = (top.z0 + top.count * top.step) * 2 + 2;
  const beamX = new THREE.BoxGeometry(spanX, 0.45, 0.45);
  const beamZ = new THREE.BoxGeometry(0.45, 0.45, spanZ);
  for (const z of [-8, 0, 8]) {
    const m = new THREE.Mesh(beamX, mat);
    m.position.set(0, h, z);
    m.updateMatrix();
    group.add(m);
  }
  for (const x of [-7, 7]) {
    const m = new THREE.Mesh(beamZ, mat);
    m.position.set(x, h, 0);
    m.updateMatrix();
    group.add(m);
  }
}

// 挑高穹頂（冠軍館）：高處環樑＋放射肋——穹頂骨架剪影（夜色＋霧裡的輪廓暗示）
function buildDome(group, spec) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x262d44, roughness: 0.85 });
  const ringY = 17.5;
  const apexY = 22;
  const R = 24;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.32, 6, 40), mat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = ringY;
  ring.updateMatrix();
  group.add(ring);
  const ribLen = Math.hypot(R, apexY - ringY);
  const ribGeo = new THREE.CylinderGeometry(0.14, 0.2, ribLen, 6);
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    const rib = new THREE.Mesh(ribGeo, mat);
    // 肋樑：環上點 → 頂點（中點擺位＋朝向）
    const mx = (Math.cos(a) * R) / 2;
    const mz = (Math.sin(a) * R) / 2;
    rib.position.set(mx, (ringY + apexY) / 2, mz);
    rib.lookAt(Math.cos(a) * R, ringY, Math.sin(a) * R);
    rib.rotateX(Math.PI / 2);
    rib.updateMatrix();
    group.add(rib);
  }
}

// 主客場氛圍（Q10）：客隊學校橫幅——掛在客隊側（z<0）短邊看台上方、面向球場
function buildAwayBanner(group, spec, banner) {
  const tex = makeBannerTexture(`${banner.name}　必勝`, '#131a30', banner.color ?? '#7db2ff');
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const geo = new THREE.PlaneGeometry(9, 1.3);
  const ring = spec.tiers[0];
  const y = ring.y0 + ring.count * ring.rise + 1.6;
  const z = -(ring.z0 + ring.count * ring.step * 0.6);
  for (const x of [-5.2, 5.2]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.updateMatrix(); // 面向 +z（球場側）＝預設朝向即可
    group.add(m);
  }
}

function makeBannerTexture(text, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 128);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 1012, 116);
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.fillText(text, 512, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
