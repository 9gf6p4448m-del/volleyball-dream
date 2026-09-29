// 寫實球員卷 第一階段驗收治具（docs/real-player-stage1-acceptance.md A1–A12，含加嚴紀錄四批、A2(d) 腿段使用者裁定與修正紀錄）。
// 用法：先起 dev server（npm run dev -- --host 127.0.0.1 --port 5176 --strictPort），再
//   node tools/real-player-browser.mjs
// 環境變數：REAL_BASE_URL（預設 http://127.0.0.1:5176）、PLAYWRIGHT_MODULE（既有 Playwright 安裝路徑）、
//   A7_BASELINE_LOG（基準 npm test 輸出，預設 docs/experiments/real-player-evidence/npm-test-baseline-e0dd285.log）、
//   A7_TEST_LOG（改用已存在的 npm test 輸出；未給＝治具自己跑 npm test 並存成 npm-test-after.log）、
//   A7_SKIP_TESTS=1／A7_SKIP_BUILD=1（不跑 npm test／npm run build，A7 判不過，只供除錯與紅燈取證）、
//   REPORT_NAME（報告檔名，預設 report.json）、SKIP_SHOTS=1（不拍截圖）。
// 輸出：docs/experiments/real-player-evidence/<REPORT_NAME>＋截圖。任何一條 FAIL＝exit 1。
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.REAL_BASE_URL || 'http://127.0.0.1:5176';
const output = resolve('docs/experiments/real-player-evidence');
const reportName = process.env.REPORT_NAME || 'report.json';
const skipShots = process.env.SKIP_SHOTS === '1';
const a11Only = process.env.A11_ONLY === '1'; // 只跑 A11（取紅燈證據用）
await mkdir(output, { recursive: true });

const report = {
  createdAt: new Date().toISOString(),
  base,
  head: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  // 證據產生順序（加嚴・第四批 LOW-3）：記錄產生當下的 HEAD 與整個工作區是否乾淨
  dirty: execSync('git status --porcelain', { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  device: 'Desktop headless Chromium（SwiftShader/WebGL）；FPS 非真機數字',
  variants: {},
  a7: null,
  a8: { screenshots: [], extra: [] },
  pass: {},
};

// ---- 驗收修訂 R12：量尺改讀畫面實際畫出的網格 ----
// 頁內安裝 window.__rulerRead：
//  ・SkinnedMesh（舊錨點）：蒙皮位置＝mesh.getVertexPosition；綁定位置／權重＝mesh.geometry；骨架＝mesh.skeleton。
//  ・一般 Mesh（R12 起，CPU 蒙皮）：蒙皮位置＝mesh.geometry.attributes.position（畫面這一幀的陣列）×mesh.matrixWorld；
//    綁定位置／權重／骨架：預覽頁沒有對外暴露 bindGeometry／skeleton，改在頁內用同一個模組
//    （/src/render/realPlayer.js 的 loadRealPlayerAsset＋createRealPlayer）重建一份，並斷言它的 index 與每位球員
//    畫面網格的 index 逐值相同；畫面網格須為一般 Mesh、屬性只有 position／normal／color、無 morph、無子物件、可見、
//    自身變換為單位。不符即丟錯（量測中止）。
async function installRulerRead(page) {
  return page.evaluate(async () => {
    const rp = window.__realPreview;
    const { THREE } = rp;
    const m0 = rp.players[0].mesh;
    const rendered = !m0.isSkinnedMesh;
    const R = { rendered };
    if (rendered) {
      const mod = await import('/src/render/realPlayer.js');
      const asset = await mod.loadRealPlayerAsset(new URL(`models/real/player_${rp.variant}.glb`, location.href).href);
      const bindGeo = asset.geometry;
      // S12 審查 MEDIUM（加嚴）：同模組重建的資產必須讀到烘焙權重與距離場（頁面本身的讀取失敗另由 console 警告攔截）
      if (asset.weightsSource !== 'baked' || asset.sdfSource !== 'baked' || !asset.collide) throw new Error(`[ruler] 權重來源 ${asset.weightsSource}／距離場來源 ${asset.sdfSource}（應皆為 baked）`);
      const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
      for (const pl of rp.players) {
        const m = pl.mesh; const G = m.geometry;
        if (!m.isMesh || m.isSkinnedMesh || m.isInstancedMesh) throw new Error(`[ruler] ${pl.playerId} 不是一般 Mesh`);
        if (Object.keys(G.attributes).sort().join(',') !== 'color,normal,position') throw new Error(`[ruler] ${pl.playerId} 屬性 ${Object.keys(G.attributes)}`);
        if (Object.keys(G.morphAttributes).length || m.morphTargetInfluences) throw new Error(`[ruler] ${pl.playerId} 有 morph`);
        if (m.children.length || m.visible === false || (Array.isArray(m.material) ? m.material : [m.material]).some((x) => !x || x.visible === false)) throw new Error(`[ruler] ${pl.playerId} 子物件或不可見`);
        if (m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || m.onAfterRender !== THREE.Object3D.prototype.onAfterRender) throw new Error(`[ruler] ${pl.playerId} 有渲染 hook`);
        m.updateMatrixWorld(true);
        if (!m.matrixWorld.equals(new THREE.Matrix4())) throw new Error(`[ruler] ${pl.playerId} 網格自身變換非單位`);
        if (!same(G.index.array, bindGeo.index.array) || G.attributes.position.count !== bindGeo.attributes.position.count) throw new Error(`[ruler] ${pl.playerId} index／頂點數與重建的綁定幾何不同`);
      }
      const fresh = mod.createRealPlayer(asset, { playerId: rp.players[0].playerId, teamId: rp.players[0].teamId, height: rp.players[0].height, isLibero: rp.players[0].isLibero });
      if (fresh.skinStats().collide !== true) throw new Error('[ruler] 碰撞修正未啟用（skinStats().collide≠true）');
      window.__rulerBind = { mod, asset, bindGeo, skeleton: fresh.skeleton };
    }
    window.__rulerRead = {
      rendered,
      bindAttrs: (mesh) => (rendered ? window.__rulerBind.bindGeo.attributes : mesh.geometry.attributes),
      skeleton: (mesh) => (rendered ? window.__rulerBind.skeleton : mesh.skeleton),
      getV: (mesh, i, v) => (rendered ? v.fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld) : mesh.getVertexPosition(i, v)),
    };
    return R;
  });
}

// ---- 頁內量測（走 window.__realPreview 暴露的真實網格；讀法見 installRulerRead；期望值另外 import 正式模組）----
async function measureStatic(page) {
  return page.evaluate(async () => {
    const rp = window.__realPreview;
    const { THREE } = rp;
    const gc = await import('/src/render/geoCharacter.js');
    const out = { players: [] };
    // 綁定姿勢的關節世界座標：由 skeleton.boneInverses 反推（不讀實作宣稱的地標表）
    const p0 = rp.players[0].mesh;
    const bindPos = {};
    const sk0 = window.__rulerRead.skeleton(p0);
    sk0.bones.forEach((bone, bi) => {
      const m = sk0.boneInverses[bi].clone().invert();
      const v = new THREE.Vector3().setFromMatrixPosition(m);
      bindPos[rp.boneNames[bi]] = [v.x, v.y, v.z];
    });
    out.bindPos = bindPos;
    const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    // A2(f) 關節解剖位置（綁定姿勢、BASE_H 空間，左右都驗）
    out.a2f = {};
    for (const s of ['r', 'l']) {
      out.a2f[s] = {
        hipY: bindPos[`${s}Hip`][1],
        kneeY: bindPos[`${s}Knee`][1],
        upperArm: d3(bindPos[`${s}Shoulder`], bindPos[`${s}Elbow`]),
        forearm: d3(bindPos[`${s}Elbow`], bindPos[`${s}Wrist`]),
      };
    }
    const shX = Math.min(Math.abs(bindPos.rShoulder[0]), Math.abs(bindPos.lShoulder[0])) - 0.03;
    const hipY = Math.max(bindPos.rHip[1], bindPos.lHip[1]);
    const shY = Math.min(bindPos.rShoulder[1], bindPos.lShoulder[1]);
    const neckY = bindPos.neck[1];
    out.zone = { shX, hipY, shY, neckY };
    const inTorso = (x, y) => Math.abs(x) <= shX && y >= hipY && y <= shY;
    const hexOf = (r, g, b) => new THREE.Color().setRGB(r, g, b).getHex();
    const ch = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
    const near = (a, b) => ch(a).every((v, k) => Math.abs(v - ch(b)[k]) <= 2);
    const contra = /^(r|l)(Shoulder|Elbow|Wrist|Hip|Knee|Ankle)$/; // 含本卷自加的腳骨（加嚴紀錄・第四批）
    for (const pl of rp.players) {
      const g = pl.mesh.geometry;
      const ba = window.__rulerRead.bindAttrs(pl.mesh);
      const pos = ba.position;
      const si = ba.skinIndex;
      const sw = ba.skinWeight;
      const col = g.attributes.color;
      const n = pos.count;
      let sumBad = 0; let sumMaxErr = 0; let contraBad = 0; let sideVerts = 0;
      let zone = 0; let zoneArm = 0;
      const torsoCols = new Map(); const headCols = new Map();
      for (let i = 0; i < n; i += 1) {
        const x = pos.getX(i); const y = pos.getY(i);
        let s = 0; let best = -1; let bw = -1; let cw = 0;
        const bad = x < 0 ? 'l' : 'r';
        for (let k = 0; k < 4; k += 1) {
          const w = sw.getComponent(i, k);
          const b = si.getComponent(i, k);
          s += w;
          if (w > bw) { bw = w; best = b; }
          const nm = rp.boneNames[b];
          if (w > 0 && contra.test(nm) && nm[0] === bad) cw += w;
        }
        sumMaxErr = Math.max(sumMaxErr, Math.abs(s - 1));
        if (Math.abs(s - 1) > 1e-4) sumBad += 1;
        if (Math.abs(x) > 0.10) { sideVerts += 1; if (cw !== 0) contraBad += 1; }
        if (inTorso(x, y)) {
          zone += 1;
          if (/^(r|l)(Elbow|Wrist)$/.test(rp.boneNames[best])) zoneArm += 1;
          const h = hexOf(col.getX(i), col.getY(i), col.getZ(i));
          torsoCols.set(h, (torsoCols.get(h) || 0) + 1);
        }
        if (y > neckY) {
          const h = hexOf(col.getX(i), col.getY(i), col.getZ(i));
          headCols.set(h, (headCols.get(h) || 0) + 1);
        }
      }
      const mode = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const expectJersey = pl.isLibero ? gc.LIBERO_KIT[pl.teamId].jersey : gc.resolveKit(pl.teamId, false, null).jersey;
      const h = gc.idHash(pl.playerId);
      const skin = gc.SKINS[h % gc.SKINS.length];
      const hair = gc.HAIRS[(h >> 3) % gc.HAIRS.length];
      const torsoMode = mode(torsoCols); const headMode = mode(headCols);
      out.players.push({
        playerId: pl.playerId, teamId: pl.teamId, isLibero: pl.isLibero, verts: n,
        a3: { sumBad, sumMaxErr, sideVerts, contraBad },
        a4: { zone, zoneArm, ratio: zoneArm / zone },
        a5: {
          expectJersey: expectJersey.toString(16), torsoMode: torsoMode?.toString(16),
          torsoOk: torsoMode != null && near(torsoMode, expectJersey),
          skin: skin.toString(16), hair: hair.toString(16), headMode: headMode?.toString(16),
          headOk: headMode != null && (near(headMode, skin) || near(headMode, hair)),
        },
      });
    }
    out.teamCounts = {
      A: rp.players.filter((p) => p.teamId === 'A' && !p.isLibero).length,
      AL: rp.players.filter((p) => p.teamId === 'A' && p.isLibero).length,
      B: rp.players.filter((p) => p.teamId === 'B' && !p.isLibero).length,
      BL: rp.players.filter((p) => p.teamId === 'B' && p.isLibero).length,
    };
    return out;
  });
}

// A2(a)(b)(d)(e)＋A9：一名球員、一個序列。待命 0.5 秒（＝A2(b) 的 C_rest、A2(d)(e)／A9 的待命量測）
// → 觸發 → 逐幀推進到回到待命；A2 取樣點＝動作時長內均勻 samples 點；A9 每一幀都量
async function measureMotion(page, playerIndex, seq, samples) {
  return page.evaluate(async ({ playerIndex, seq, samples }) => {
    const rp = window.__realPreview;
    const { THREE } = rp;
    const gc = await import('/src/render/geoCharacter.js');
    const ga = await import('/src/render/geoAnimator.js');
    rp.resetAll();
    const pl = rp.players[playerIndex];
    const mesh = pl.mesh;
    const g = { attributes: window.__rulerRead.bindAttrs(mesh) }; // 綁定位置／權重（讀法見 installRulerRead）
    const pos = g.attributes.position;
    const bonesToCheck = ['rWrist', 'lWrist', 'rKnee'];
    // A2(a)(b)：靜止綁定時主權重屬於該骨的頂點群
    const groups = {};
    for (const bn of bonesToCheck) groups[bn] = [];
    const si = g.attributes.skinIndex; const sw = g.attributes.skinWeight;
    for (let i = 0; i < pos.count; i += 1) {
      let best = -1; let bw = -1;
      for (let k = 0; k < 4; k += 1) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      const nm = rp.boneNames[best];
      if (groups[nm]) groups[nm].push(i);
    }
    // A2(e)：綁定姿勢幾何選取的手（該側 |x| ≥ max|x| − 0.10），不讀權重、不讀地標
    const hands = { r: [], l: [] };
    let maxR = 0; let maxL = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      if (x < 0) maxR = Math.max(maxR, -x); else maxL = Math.max(maxL, x);
    }
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      if (x < 0 && -x >= maxR - 0.10) hands.r.push(i);
      if (x > 0 && x >= maxL - 0.10) hands.l.push(i);
    }
    // A9：綁定姿勢 y ≤ 0.03 的頂點（鞋底，幾何選取）
    const soles = [];
    for (let i = 0; i < pos.count; i += 1) if (pos.getY(i) <= 0.03) soles.push(i);

    const v = new THREE.Vector3();
    const wp = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
    const centroid = (idx) => {
      const c = new THREE.Vector3();
      for (const i of idx) { window.__rulerRead.getV(mesh, i, v); c.add(v); } // CPU 蒙皮
      return c.divideScalar(idx.length);
    };
    const soleMin = () => {
      let m = Infinity;
      for (const i of soles) { window.__rulerRead.getV(mesh, i, v); if (v.y < m) m = v.y; }
      return m;
    };
    const measure = () => {
      rp.step(0, 0); // 只更新 matrixWorld
      const res = {};
      for (const bn of bonesToCheck) res[bn] = { C: centroid(groups[bn]).toArray(), J: wp(pl.joints[bn]).toArray() };
      res.hand = {
        r: centroid(hands.r).distanceTo(wp(pl.joints.rWrist)),
        l: centroid(hands.l).distanceTo(wp(pl.joints.lWrist)),
      };
      return res;
    };

    // A2(d)：參考 geo 人（createGeoCharacter＋createGeoAnimator、同身高同 root 位置朝向），
    // 包住預覽實際驅動該球員的 animator，使參考人收到逐次相同的 trigger／update 呼叫
    const ref = gc.createGeoCharacter({ claim: (key) => ({ key, index: 0 }) },
      pl.playerId, pl.teamId, pl.height, pl.isLibero, '', null, null);
    ref.root.position.copy(pl.root.position);
    ref.root.quaternion.copy(pl.root.quaternion);
    const refAnim = ga.createGeoAnimator(ref);
    const anim = rp.animOf(playerIndex);
    const origTrigger = anim.trigger; const origUpdate = anim.update;
    const calls = { trigger: [], update: 0 };
    anim.trigger = (...a) => { calls.trigger.push(a[0]); refAnim.trigger(...a); return origTrigger(...a); };
    anim.update = (...a) => {
      calls.update += 1;
      ref.root.position.y = refAnim.update(...a) * ref.root.scale.y;
      return origUpdate(...a);
    };
    const SEGS = [['rShoulder', 'rElbow'], ['rElbow', 'rWrist'], ['lShoulder', 'lElbow'], ['lElbow', 'lWrist'], ['rHip', 'rKnee'], ['lHip', 'lKnee']];
    // A2(d)（使用者裁定甲，2026-09-27）：手臂四段比最終世界方向 ≤10°；腿兩段 IK 前（animator 寫入後）
    // ≤10° 且 IK 後（最終）≤15°。腿段以 `rHip>rKnee`＝IK 前、`rHip>rKnee@post`＝IK 後分列
    const LEG_SEG = new Set(['rHip>rKnee', 'lHip>lKnee']);
    const dirAngles = () => {
      ref.root.updateMatrixWorld(true);
      const pre = rp.legPreIK(playerIndex);
      const res = {};
      for (const [a, b] of SEGS) {
        const k = `${a}>${b}`;
        const d2 = wp(ref.joints[b]).sub(wp(ref.joints[a])).normalize();
        const fin = wp(pl.joints[b]).sub(wp(pl.joints[a])).normalize();
        if (LEG_SEG.has(k)) {
          const d1 = new THREE.Vector3(...pre[b]).sub(new THREE.Vector3(...pre[a])).normalize();
          res[k] = THREE.MathUtils.radToDeg(d1.angleTo(d2));
          res[`${k}@post`] = THREE.MathUtils.radToDeg(fin.angleTo(d2));
        } else {
          res[k] = THREE.MathUtils.radToDeg(fin.angleTo(d2));
        }
      }
      return res;
    };
    // A2(d) 膝不內外翻：膝到「含髖→踝（腳骨原點）連線與角色前向」之平面的距離
    const kneeLateral = () => {
      const out = {};
      const fwd = pl.root.getWorldDirection(new THREE.Vector3());
      for (const s of ['r', 'l']) {
        const H = wp(pl.joints[`${s}Hip`]); const K = wp(pl.joints[`${s}Knee`]); const A = wp(pl.joints[`${s}Ankle`]);
        const u = A.clone().sub(H).normalize();
        const n = new THREE.Vector3().crossVectors(u, fwd).normalize();
        out[s] = Math.abs(K.clone().sub(H).dot(n));
      }
      return out;
    };
    // 加嚴・第四批 LOW-1：鞋底離地 > 1cm 的那隻腳，腳骨相對小腿（膝骨）的角度須為 0（±0.5°）
    const solesBy = { r: [], l: [] };
    for (let i = 0; i < pos.count; i += 1) if (pos.getY(i) <= 0.03) (pos.getX(i) < 0 ? solesBy.r : solesBy.l).push(i);
    const footAir = { frames: 0, maxAngle: 0 };
    const checkAirFoot = () => {
      for (const s of ['r', 'l']) {
        let m = Infinity;
        for (const i of solesBy[s]) { window.__rulerRead.getV(mesh, i, v); if (v.y < m) m = v.y; }
        if (m > 0.01) {
          const q = pl.joints[`${s}Ankle`].quaternion; // 父＝膝骨：局部旋轉即相對小腿
          const ang = THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, Math.abs(q.w))));
          footAir.frames += 1;
          footAir.maxAngle = Math.max(footAir.maxAngle, ang);
        }
      }
    };
    // A2(g)：膝到「髖→踝連線」的有號距離（角色前方為正）。踝＝綁定姿勢 0.10 ≤ y ≤ 0.16 的該側
    // 頂點（小腿下段／腳踝一圈，幾何選取、不讀權重與地標）的蒙皮質心
    const ankles = { r: [], l: [] };
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      if (y >= 0.10 && y <= 0.16) (pos.getX(i) < 0 ? ankles.r : ankles.l).push(i);
    }
    const kneeSigned = () => {
      const out = {};
      const fwd = pl.root.getWorldDirection(new THREE.Vector3());
      for (const s of ['r', 'l']) {
        const H = wp(pl.joints[`${s}Hip`]); const K = wp(pl.joints[`${s}Knee`]); const A = centroid(ankles[s]);
        const u = A.clone().sub(H).normalize();
        const hk = K.clone().sub(H);
        const perp = hk.sub(u.clone().multiplyScalar(hk.dot(u)));
        const f = fwd.clone().sub(u.clone().multiplyScalar(fwd.dot(u))).normalize();
        out[s] = perp.dot(f);
      }
      return out;
    };
    const dt = 1 / 60;
    rp.step(dt, 30); // 待命（未觸發任何序列）0.5 秒
    const rest = measure();
    const idleDirs = dirAngles();
    const idleSole = soleMin();
    const kneeTrace = [];
    const idleKnee = kneeSigned();
    kneeTrace.push(idleKnee.r, idleKnee.l);
    const latTrace = [];
    const idleLat = kneeLateral();
    latTrace.push(idleLat.r, idleLat.l);
    // A2(d) 腿段 IK 後逐幀（加嚴・第五批）：觸發到回待命的每一幀＋待命，取兩腿最大
    const legPostNow = () => { const d = dirAngles(); return Math.max(d['rHip>rKnee@post'], d['lHip>lKnee@post']); };
    let legPostFrameMax = legPostNow(); let legPostFrameAt = 0;
    checkAirFoot();
    // A10：骨盆世界 y 相對待命的最大下沉（寫實球員 vs 同步驅動的參考 geo 人）
    const pelvisY = () => { ref.root.updateMatrixWorld(true); return [wp(pl.joints.pelvis).y, wp(ref.joints.pelvis).y]; };
    const [idlePelvis, idleRefPelvis] = pelvisY();
    let maxSink = 0; let maxRefSink = 0;

    rp.play(playerIndex, seq);
    const dur = rp.actionDur[seq];
    const targets = [];
    for (let s = 1; s <= samples; s += 1) targets.push((dur * s) / (samples + 1)); // 均勻落在 (0, dur) 內部
    const out = [];
    const soleTrace = [];
    let t = 0; let frames = 0; let backToIdle = false;
    while (frames < 360) { // 上限 6 秒
      rp.step(dt, 1); t += dt; frames += 1;
      soleTrace.push(soleMin());
      const ks = kneeSigned();
      kneeTrace.push(ks.r, ks.l);
      const kl = kneeLateral();
      latTrace.push(kl.r, kl.l);
      const lp = legPostNow();
      if (lp > legPostFrameMax) { legPostFrameMax = lp; legPostFrameAt = frames; }
      checkAirFoot();
      const [py, ry] = pelvisY();
      maxSink = Math.max(maxSink, idlePelvis - py);
      maxRefSink = Math.max(maxRefSink, idleRefPelvis - ry);
      if (targets.length && t + 1e-9 >= targets[0]) {
        targets.shift();
        out.push({ t, ...measure(), dirs: dirAngles() });
      }
      if (!targets.length && t >= dur && rp.animOf(playerIndex).isIdle()) { backToIdle = true; break; }
    }
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const summary = {};
    for (const bn of bonesToCheck) {
      const r0 = dist(rest[bn].C, rest[bn].J);
      let maxDev = 0; let maxMove = 0;
      for (const o of out) {
        maxDev = Math.max(maxDev, Math.abs(dist(o[bn].C, o[bn].J) - r0));
        maxMove = Math.max(maxMove, dist(o[bn].C, rest[bn].C));
      }
      summary[bn] = { groupSize: groups[bn].length, restCJ: r0, maxDev, maxMove };
    }
    const segMax = {};
    for (const k of Object.keys(idleDirs)) segMax[k] = Math.max(idleDirs[k], ...out.map((o) => o.dirs[k]));
    const arms = Object.keys(segMax).filter((k) => !k.includes('Hip'));
    const a2d = {
      idle: idleDirs, segMax, calls,
      armMax: Math.max(...arms.map((k) => segMax[k])),
      legPreMax: Math.max(segMax['rHip>rKnee'], segMax['lHip>lKnee']),
      legPostMax: Math.max(segMax['rHip>rKnee@post'], segMax['lHip>lKnee@post'], legPostFrameMax),
      legPostSampleMax: Math.max(segMax['rHip>rKnee@post'], segMax['lHip>lKnee@post']),
      legPostFrameMax, legPostFrameAt,
      kneeLateralMax: Math.max(...latTrace), lateralFrames: latTrace.length / 2,
    };
    const handAll = [rest.hand.r, rest.hand.l, ...out.flatMap((o) => [o.hand.r, o.hand.l])];
    const a2e = {
      handVerts: { r: hands.r.length, l: hands.l.length },
      idle: rest.hand, max: Math.max(...handAll),
    };
    let minFrame = 0;
    soleTrace.forEach((y, k) => { if (y < soleTrace[minFrame]) minFrame = k; });
    const a9 = {
      soleVerts: soles.length, idleMin: idleSole, frames, backToIdle,
      minY: Math.min(...soleTrace), minFrame: minFrame + 1,
    };
    rp.resetAll();
    const a10 = { maxSink, maxRefSink, ratio: maxRefSink > 0 ? maxSink / maxRefSink : null };
    const a2g = { ankleVerts: { r: ankles.r.length, l: ankles.l.length }, idle: idleKnee, min: Math.min(...kneeTrace), frames: kneeTrace.length / 2 };
    return { seq, playerIndex, samples: out.length, times: out.map((o) => o.t), summary, a2d, a2e, a9, a10, a2g, footAir };
  }, { playerIndex, seq, samples });
}

// A12：resume() 打開預覽自己的輪播排程，在同一段同步程式裡逐幀 step（rAF 插不進來），結束前 pause()
async function measureContinuity(page, seconds = 21) {
  return page.evaluate((seconds) => {
    const rp = window.__realPreview;
    rp.resetAll();
    rp.resume();
    const n = Math.round(seconds * 60);
    const prev = rp.players.map((p) => p.root.getWorldPosition(new rp.THREE.Vector3()).y);
    let maxJump = 0; let at = null;
    const triggers = new Array(rp.playerCount).fill(0);
    for (let f = 1; f <= n; f += 1) {
      rp.step(1 / 60, 1);
      rp.players.forEach((p, i) => {
        const y = p.root.getWorldPosition(new rp.THREE.Vector3()).y;
        const d = Math.abs(y - prev[i]);
        if (d > maxJump) { maxJump = d; at = { player: p.playerId, frame: f, from: prev[i], to: y }; }
        prev[i] = y;
        if (rp.animOf(i).peek()?.t <= 1 / 60 + 1e-9) triggers[i] += 1;
      });
    }
    rp.pause();
    rp.resetAll();
    return { seconds, frames: n, maxJump, at, minTriggersPerPlayer: Math.min(...triggers) };
  }, seconds);
}

// A2(c)：擺回算 boneInverses 當下的姿勢（含 root 單位變換）後，CPU 蒙皮頂點＝載入後未蒙皮頂點
async function measureBindRestore(page) {
  return page.evaluate(() => {
    const rp = window.__realPreview;
    const { THREE } = rp;
    rp.resetAll();
    // 先讓全員進入接地 IK 生效的狀態（bump 下蹲），確認腳骨已被轉動，再逐人直接呼叫綁定姿勢函式
    rp.step(1 / 60, 30);
    for (let i = 0; i < rp.playerCount; i += 1) rp.play(i, 'bump');
    rp.step(1 / 60, 5);
    const v = new THREE.Vector3();
    const out = [];
    for (let i = 0; i < rp.playerCount; i += 1) {
      const j = rp.players[i].joints;
      const footAngle = Math.max(...['rAnkle', 'lAnkle'].map((b) => (j[b]
        ? THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, Math.abs(j[b].quaternion.w)))) : 0)));
      rp.bindPose(i, true);
      let mesh = rp.players[i].mesh;
      let pos = mesh.geometry.attributes.position;
      if (window.__rulerRead.rendered) {
        // R12：預覽頁沒有對外暴露 updateSkin，畫面網格在下一次 groundLegs 前不會重算；改用同模組重建的同參數球員
        // 擺回綁定姿勢（含 root 單位變換）後呼叫 updateSkin，量 CPU 蒙皮輸出（renderedPositions）＝綁定位置
        const B = window.__rulerBind; const pl = rp.players[i];
        const f = B.mod.createRealPlayer(B.asset, { playerId: pl.playerId, teamId: pl.teamId, height: pl.height, isLibero: pl.isLibero });
        f.applyBindPose({ atOrigin: true });
        f.rig.root.updateMatrixWorld(true);
        f.updateSkin();
        mesh = f.mesh; pos = B.bindGeo.attributes.position;
      }
      let maxErr = 0; let minY = Infinity; let maxY = -Infinity;
      for (let k = 0; k < pos.count; k += 1) {
        window.__rulerRead.getV(mesh, k, v);
        maxErr = Math.max(maxErr, Math.hypot(v.x - pos.getX(k), v.y - pos.getY(k), v.z - pos.getZ(k)));
        minY = Math.min(minY, pos.getY(k)); maxY = Math.max(maxY, pos.getY(k));
      }
      // 「載入後（縮放、貼地後）」的旁證：未蒙皮頂點腳底 y=0、身高＝BASE_H
      out.push({ id: rp.players[i].playerId, maxErr, minY, height: maxY - minY, footAngleBefore: footAngle });
    }
    rp.resetAll();
    return out;
  });
}

const in01 = (x, lo, hi) => x >= lo && x <= hi;
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] });
const allErrors = [];
// A11 PWA 可達：直式 390×844 從主選單實際點「寫實球員預覽（測試）」→ 預覽 14 人 → 點「返回」→ 主選單按鈕列可見
const ENTRY_TEXT = '寫實球員預覽（測試）';
async function checkA11() {
  const res = { steps: [], errors: [] };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (e) => res.errors.push(`pageerror: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') res.errors.push(`console: ${m.text()}`); });
  const inView = async (loc) => {
    const box = await loc.boundingBox();
    return Boolean(box) && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844
      && box.width >= 32 && box.height >= 32;
  };
  try {
    await page.goto(`${base}/`, { timeout: 120000 });
    await page.waitForFunction(() => !document.getElementById('vd-boot-logo'), null, { timeout: 30000 });
    const entry = page.getByRole('button', { name: ENTRY_TEXT });
    await entry.waitFor({ state: 'visible', timeout: 20000 });
    res.entryInView = await inView(entry);
    res.steps.push('menu entry visible');
    // 點擊逾時 60s：headless 下預覽／主選單渲染可慢到約 1 FPS（2026-09-27 實測 3 個 rAF 2.7 秒），
    // Playwright 的可點檢查（可見、穩定兩幀、命中測試未被遮擋）照做，只是等久一點
    await entry.click({ timeout: 60000 });
    await page.waitForFunction(() => Boolean(window.__realPreview), null, { timeout: 120000 });
    res.previewUrl = page.url();
    res.playerCount = await page.evaluate(() => window.__realPreview.playerCount);
    res.steps.push('preview loaded');
    await page.waitForFunction(() => !document.getElementById('vd-boot-logo'), null, { timeout: 30000 });
    const back = page.getByRole('button', { name: /返回/ });
    await back.waitFor({ state: 'visible', timeout: 10000 });
    res.backInView = await inView(back);
    // 返回鈕不得擋 HUD（FPS＋面數）
    const hb = await page.locator('#real-hud').boundingBox(); const bb = await back.boundingBox();
    res.backOverlapsHud = Boolean(hb && bb) && !(bb.x + bb.width <= hb.x || hb.x + hb.width <= bb.x
      || bb.y + bb.height <= hb.y || hb.y + hb.height <= bb.y);
    await back.click({ timeout: 60000 });
    await page.waitForURL((u) => !u.search.includes('mode=realpreview'), { timeout: 30000 });
    await page.waitForFunction(() => !document.getElementById('vd-boot-logo'), null, { timeout: 30000 });
    const entryAgain = page.getByRole('button', { name: ENTRY_TEXT });
    await entryAgain.waitFor({ state: 'visible', timeout: 20000 });
    res.menuBack = await page.getByRole('button', { name: '▶ 生涯' }).isVisible();
    res.steps.push('back to menu');
  } catch (e) {
    res.failure = String(e).split('\n')[0];
  }
  await context.close();
  res.pass = !res.failure && res.entryInView === true && res.playerCount === 14 && res.backInView === true
    && res.backOverlapsHud === false && res.menuBack === true && res.errors.length === 0;
  return res;
}

try {
  report.a11 = await checkA11();
  for (const [variant, query, expectFaces] of (a11Only ? [] : [['20k', '?mode=realpreview&faces=20k', 20000], ['5k', '?mode=realpreview&faces=5k', 5000]])) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      // S12 審查 MEDIUM（加嚴）：頁面讀烘焙權重／距離場失敗時 src 只發 [real-skin] 警告，這裡當錯誤攔下
      if (m.type() === 'warning' && m.text().includes('[real-skin]')) errors.push(`console warn: ${m.text()}`);
    });
    await page.goto(`${base}/${query}&quality=high&dpr=1`, { timeout: 120000 });
    await page.waitForFunction(() => Boolean(window.__realPreview), null, { timeout: 60000 });
    await page.evaluate(() => window.__realPreview.pause());
    const info = await page.evaluate(() => ({
      playerCount: window.__realPreview.playerCount,
      faces: window.__realPreview.faces,
      variant: window.__realPreview.variant,
      bridgeTris: window.__realPreview.bridgeTris,
    }));
    const ikStatsOf = () => page.evaluate(() => ({ ...window.__realPreview.ikStats }));
    // A6：HUD 的 FPS 須為實測數值 > 0（等 HUD 至少刷新出一個數字，最多 20 秒）
    const fpsOf = (t) => { const m = /FPS\s+(\d+(?:\.\d+)?)/.exec(t); return m ? Number(m[1]) : null; };
    await page.waitForFunction(() => {
      const t = document.getElementById('real-hud')?.textContent ?? '';
      const m = /FPS\s+(\d+(?:\.\d+)?)/.exec(t);
      return m && Number(m[1]) > 0;
    }, null, { timeout: 20000 }).catch(() => {});
    const hud = await page.evaluate(() => document.getElementById('real-hud')?.textContent ?? '');
    const rulerRead = await installRulerRead(page);
    const stat = await measureStatic(page);
    const bindRestore = await measureBindRestore(page);
    const continuity = await measureContinuity(page);
    const ikBefore = await ikStatsOf();
    const motion = [];
    for (const pi of [0, 7, 13]) { // A 隊一般、B 隊一般、B 隊自由人
      for (const seq of ['bump', 'spike', 'block']) motion.push(await measureMotion(page, pi, seq, 8));
    }
    const ikAfter = await ikStatsOf();
    // A8：只在預設（20k）變體拍
    if (variant === '20k' && !skipShots) {
      // 開機 logo（showBootLogo）會蓋住畫面：等它自己退場再拍，並把「沒被蓋住」列入 A8 判定
      await page.waitForFunction(() => !document.getElementById('vd-boot-logo'), null, { timeout: 30000 });
      for (const [name, w, h, cam] of [
        ['desktop', 1280, 720, [[9.5, 5.2, 11.5], [0, 1.1, 0]]],
        ['portrait', 390, 844, [[6.5, 4.2, 12.5], [0, 1.2, 0]]],
      ]) {
        await page.setViewportSize({ width: w, height: h });
        await page.evaluate((c) => { const rp = window.__realPreview; rp.resetAll(); rp.setCamera(c[0], c[1]); rp.step(1 / 60, 30); }, cam); // 靜止＝待命 0.5 秒
        await page.waitForTimeout(300);
        const covered = await page.evaluate(() => Boolean(document.getElementById('vd-boot-logo')));
        const still = resolve(output, `${name}-still.png`);
        await page.screenshot({ path: still });
        const hitT = await page.evaluate(() => {
          const rp = window.__realPreview;
          rp.resetAll();
          for (let i = 0; i < rp.playerCount; i += 1) rp.play(i, 'spike');
          // 擊球瞬間＝windup 後 spikeHitDelay 觸發 spike，再走 spike.hit×dur
          const n = Math.round(rp.spikeHitTime * 60);
          rp.step(1 / 60, n);
          return n / 60;
        });
        await page.waitForTimeout(300);
        const hit = resolve(output, `${name}-spike-hit.png`);
        await page.screenshot({ path: hit });
        report.a8.screenshots.push({ viewport: `${w}x${h}`, still, spikeHit: hit, spikeHitT: hitT, logoCovered: covered });
      }
      // 加拍兩張側面：bump 下蹲最深、spike 落地（landSoft）最深——看膝蓋彎的位置與腳有沒有入地。
      // 拍球員 2（A3，受光側、鏡頭不被網柱擋）；「最深」＝該球員右膝屈曲角（rKnee.rotation.x）最大的那一幀
      await page.setViewportSize({ width: 1280, height: 720 });
      for (const [name, seq, phase] of [['side-bump-deepest', 'bump', null], ['side-spike-land-deepest', 'spike', 'landSoft']]) {
        const shot = await page.evaluate(({ seq, phase }) => {
          const rp = window.__realPreview;
          const SIDE = 2;
          const run = (stopAt) => {
            rp.resetAll();
            rp.step(1 / 60, 30);
            for (let i = 0; i < rp.playerCount; i += 1) rp.play(i, seq);
            let best = -Infinity; let bestFrame = 0;
            for (let f = 1; f <= 300; f += 1) {
              rp.step(1 / 60, 1);
              const peek = rp.animOf(SIDE).peek();
              const k = rp.players[SIDE].joints.rKnee.rotation.x;
              if ((!phase || peek?.type === phase) && k > best) { best = k; bestFrame = f; }
              if (f === stopAt) return { frame: f, knee: k, phase: peek?.type ?? null };
              if (rp.animOf(SIDE).isIdle() && f > 30) break;
            }
            return { frame: bestFrame, knee: best };
          };
          const found = run(-1);
          const at = run(found.frame);
          const r = rp.players[SIDE].root.position;
          rp.setCamera([r.x + 3.0, 0.8, r.z + 0.8], [r.x, 0.8, r.z]); // 球員左前方低角度側面
          rp.step(0, 0);
          return { ...at, kneeDeg: at.knee * 180 / Math.PI };
        }, { seq, phase });
        await page.waitForTimeout(300);
        const path = resolve(output, `${name}.png`);
        await page.screenshot({ path });
        report.a8.extra.push({ name, path, ...shot });
      }
      // 別名 ?devreal=1 也要能開
      const alias = await context.newPage();
      alias.on('pageerror', (e) => errors.push(`alias pageerror: ${e}`));
      alias.on('console', (m) => { if (m.type() === 'error') errors.push(`alias console: ${m.text()}`); });
      await alias.goto(`${base}/?devreal=1&quality=high&dpr=1`, { timeout: 120000 });
      await alias.waitForFunction(() => Boolean(window.__realPreview), null, { timeout: 60000 });
      report.aliasPlayerCount = await alias.evaluate(() => window.__realPreview.playerCount);
      await alias.close();
    }
    await context.close();
    allErrors.push(...errors.map((e) => `[${variant}] ${e}`));

    const a1 = info.playerCount === 14 && stat.teamCounts.A === 6 && stat.teamCounts.AL === 1
      && stat.teamCounts.B === 6 && stat.teamCounts.BL === 1 && errors.length === 0;
    const a2ab = motion.every((m) => ['rWrist', 'lWrist', 'rKnee'].every((bn) => m.summary[bn].maxDev <= 0.05 && m.samples >= 5)
      && m.summary.rWrist.maxMove >= 0.30 && m.summary.lWrist.maxMove >= 0.30);
    const a2c = bindRestore.length === 14 && bindRestore.every((b) => b.maxErr <= 1e-3
      && Math.abs(b.minY) <= 1e-3 && Math.abs(b.height - 1.85) <= 1e-3
      && b.footAngleBefore > 1); // 加嚴・第五批：量測前腳骨確已被 IK 轉動
    const a2d = motion.every((m) => m.a2d.armMax <= 10 && m.a2d.legPreMax <= 10 && m.a2d.legPostMax <= 15
      && m.a2d.kneeLateralMax <= 0.02 && m.a2d.calls.update > 0 && m.a2d.calls.trigger.length > 0);
    const footAirOk = motion.every((m) => m.footAir.maxAngle <= 0.5) && motion.some((m) => m.footAir.frames > 0);
    const a12 = continuity.maxJump <= 0.05 && continuity.frames >= 1200;
    const a2e = motion.every((m) => m.a2e.max <= 0.15 && m.a2e.handVerts.r > 0 && m.a2e.handVerts.l > 0);
    const a2f = ['r', 'l'].every((s) => {
      const f = stat.a2f[s];
      return in01(f.hipY, 0.87, 1.04) && in01(f.kneeY, 0.48, 0.57) && in01(f.upperArm, 0.28, 0.39) && in01(f.forearm, 0.22, 0.31);
    });
    // A2(g)：A2 取樣點與 A9 每一幀（本治具逐幀量，含待命），膝有號距離 ≥ −0.01 m
    const a2g = motion.every((m) => m.a2g.min >= -0.01 && m.a2g.ankleVerts.r > 0 && m.a2g.ankleVerts.l > 0);
    const a2 = a2ab && a2c && a2d && a2e && a2f && a2g;
    const a3 = stat.players.every((p) => p.a3.sumBad === 0 && p.a3.contraBad === 0);
    const a4 = stat.players.every((p) => p.a4.ratio <= 0.01);
    const a5 = stat.players.every((p) => p.a5.torsoOk && p.a5.headOk);
    const a6faces = Math.abs(info.faces - expectFaces) <= expectFaces * 0.01;
    const hudFps = fpsOf(hud);
    const hudOk = hudFps != null && hudFps > 0 && hud.includes(info.faces.toLocaleString('en-US'));
    const a9 = motion.every((m) => m.a9.backToIdle && m.a9.minY >= -0.03 && in01(m.a9.idleMin, -0.01, 0.02) && m.a9.soleVerts > 0);
    // A10：bump／spike／block 骨盆最大下沉 ≥ 參考 geo 人的 80%（且 A9 同時過）
    const a10 = a9 && motion.every((m) => m.a10.maxRefSink > 0 && m.a10.maxSink >= 0.8 * m.a10.maxRefSink);
    report.variants[variant] = {
      info, rulerRead, hud, hudFps, errors, ikStats: ikAfter && ikBefore && { ikFrames: ikAfter.ikFrames - ikBefore.ikFrames, liftFrames: ikAfter.liftFrames - ikBefore.liftFrames, maxLift: ikAfter.maxLift }, teamCounts: stat.teamCounts, bindPos: stat.bindPos, zone: stat.zone,
      a2: motion.map((m) => ({ seq: m.seq, player: m.playerIndex, samples: m.samples, times: m.times, ...m.summary })),
      a2MaxDev: Math.max(...motion.flatMap((m) => ['rWrist', 'lWrist', 'rKnee'].map((bn) => m.summary[bn].maxDev))),
      a2MinWristMove: Math.min(...motion.flatMap((m) => ['rWrist', 'lWrist'].map((bn) => m.summary[bn].maxMove))),
      a2c: bindRestore,
      a2cMaxErr: Math.max(...bindRestore.map((b) => b.maxErr)),
      a2d: motion.map((m) => ({ seq: m.seq, player: m.playerIndex, ...m.a2d })),
      a2dArmMax: Math.max(...motion.map((m) => m.a2d.armMax)),
      a2dLegPreMax: Math.max(...motion.map((m) => m.a2d.legPreMax)),
      a2dLegPostMax: Math.max(...motion.map((m) => m.a2d.legPostMax)),
      a2dKneeLateralMax: Math.max(...motion.map((m) => m.a2d.kneeLateralMax)),
      footAir: { frames: motion.reduce((a, m) => a + m.footAir.frames, 0), maxAngle: Math.max(...motion.map((m) => m.footAir.maxAngle)) },
      continuity,
      a2dIdleMaxAngle: Math.max(...motion.map((m) => Math.max(...Object.values(m.a2d.idle)))),
      a2e: motion.map((m) => ({ seq: m.seq, player: m.playerIndex, ...m.a2e })),
      a2eMax: Math.max(...motion.map((m) => m.a2e.max)),
      a2f: stat.a2f,
      a2g: motion.map((m) => ({ seq: m.seq, player: m.playerIndex, ...m.a2g })),
      a2gMin: Math.min(...motion.map((m) => m.a2g.min)),
      a3: stat.players.map((p) => ({ id: p.playerId, ...p.a3 })),
      a4: stat.players.map((p) => ({ id: p.playerId, ...p.a4 })),
      a4MaxRatio: Math.max(...stat.players.map((p) => p.a4.ratio)),
      a5: stat.players.map((p) => ({ id: p.playerId, libero: p.isLibero, ...p.a5 })),
      a9: motion.map((m) => ({ seq: m.seq, player: m.playerIndex, ...m.a9 })),
      a9MinY: Math.min(...motion.map((m) => m.a9.minY)),
      a10: motion.map((m) => ({ seq: m.seq, player: m.playerIndex, ...m.a10 })),
      a10MinRatio: Math.min(...motion.map((m) => m.a10.ratio ?? 0)),
      a9IdleRange: [Math.min(...motion.map((m) => m.a9.idleMin)), Math.max(...motion.map((m) => m.a9.idleMin))],
      pass: {
        A1: a1, A2: a2, A2ab: a2ab, A2c: a2c, A2d: a2d, A2e: a2e, A2f: a2f, A2g: a2g,
        A3: a3, A4: a4, A5: a5, A6faces: a6faces, A6hud: hudOk, A9: a9, A9footAir: footAirOk, A10: a10, A12: a12,
      },
    };
  }
} finally {
  await browser.close();
}

// ---- A7：正式遊戲不動（修正紀錄版：失敗清單與基準逐項相同、通過數 ≥ 基準；機械判定）----
const sh = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024, ...opts });
const a7 = {};
a7.protectedDiff = sh('git diff 26593b7 -- src/render/matchView.js src/render/geoAnimator.js');
const gcDiff = sh('git diff -U0 26593b7 -- src/render/geoCharacter.js');
const gcChanged = gcDiff.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
a7.geoCharacterRemoved = gcChanged.filter((l) => l.startsWith('-'));
a7.geoCharacterAdded = gcChanged.filter((l) => l.startsWith('+'));
a7.geoCharacterOk = a7.geoCharacterRemoved.length === 0
  && a7.geoCharacterAdded.every((l) => /^\+\s*(export\b|\/\/|$)/.test(l));
const mainDiff = sh('git diff -U0 26593b7 -- src/main.js');
const mainChanged = mainDiff.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
a7.mainRemoved = mainChanged.filter((l) => l.startsWith('-'));
a7.mainAdded = mainChanged.filter((l) => l.startsWith('+'));
a7.mainOk = a7.mainRemoved.length === 0 && a7.mainAdded.every((l) => /realpreview|devreal|runRealPreview|^\+\s*(\/\/|\}\s*else if|$)/.test(l));
// A7 範圍補註：careerScreen.js 只允許新增「寫實球員預覽（測試）」這一顆按鈕（含註解），不得改動既有行
const csDiff = sh('git diff -U0 26593b7 -- src/ui/careerScreen.js');
const csChanged = csDiff.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
a7.careerScreenRemoved = csChanged.filter((l) => l.startsWith('-'));
a7.careerScreenAdded = csChanged.filter((l) => l.startsWith('+'));
a7.careerScreenOk = a7.careerScreenRemoved.length === 0 && a7.careerScreenAdded.length <= 4
  && a7.careerScreenAdded.every((l) => /^\+\s*(\/\/|inner\.appendChild\(button\('寫實球員預覽（測試）'|window\.location\.assign\(`\$\{window\.location\.pathname\}\?mode=realpreview`\);|\}\)\);)/.test(l));
const parseTestLog = (s) => ({
  tests: Number(/ℹ tests (\d+)/.exec(s)?.[1] ?? NaN),
  pass: Number(/ℹ pass (\d+)/.exec(s)?.[1] ?? NaN),
  fail: Number(/ℹ fail (\d+)/.exec(s)?.[1] ?? NaN),
  failing: [...new Set(s.split('\n').filter((l) => l.startsWith('✖ ') && !l.includes('failing tests'))
    .map((l) => l.replace(/\s*\([\d.]+ms\)\s*$/, '').trim()))].sort(),
});
const baselinePath = resolve(process.env.A7_BASELINE_LOG || 'docs/experiments/real-player-evidence/npm-test-baseline-e0dd285.log');
const baseline = parseTestLog(await readFile(baselinePath, 'utf8'));
let testLog = null;
// A7 證據來源（加嚴・第五批）：npm test log 須記錄執行時的 HEAD 與工作區是否乾淨，且須等於本報告的 HEAD、乾淨
const headNow = sh('git rev-parse HEAD').trim();
if (process.env.A7_TEST_LOG) {
  // 治具外另跑的 log：須附 tools/npm-test-with-provenance.mjs 寫的 <log>.json
  const p = resolve(process.env.A7_TEST_LOG);
  testLog = await readFile(p, 'utf8');
  let prov = null;
  try { prov = JSON.parse(await readFile(`${p}.json`, 'utf8')); } catch { prov = null; }
  a7.testLogSource = { provided: p, mtime: (await stat(p)).mtime.toISOString(), provenance: prov };
} else if (process.env.A7_SKIP_TESTS !== '1') {
  const t0 = Date.now();
  const dirtyAtStart = sh('git status --porcelain').trim().split('\n').filter(Boolean);
  try { testLog = sh('npm test', { timeout: 60 * 60 * 1000 }); } catch (e) { testLog = `${e.stdout ?? ''}\n${e.stderr ?? ''}`; }
  const p = resolve(output, 'npm-test-after.log');
  await writeFile(p, testLog);
  a7.testLogSource = {
    ranInTool: p, seconds: Math.round((Date.now() - t0) / 1000),
    provenance: { head: headNow, clean: dirtyAtStart.length === 0, dirty: dirtyAtStart, headAfter: sh('git rev-parse HEAD').trim() },
  };
}
const prov = a7.testLogSource?.provenance;
a7.testLogProvenanceOk = Boolean(prov) && prov.head === headNow && prov.clean === true && (prov.headAfter ?? prov.head) === headNow;
if (testLog != null) {
  const after = parseTestLog(testLog);
  a7.npmTest = {
    ...after, baselinePath, baselinePass: baseline.pass, baselineFailing: baseline.failing,
    newFailures: after.failing.filter((f) => !baseline.failing.includes(f)),
    sameFailingAsBaseline: JSON.stringify(after.failing) === JSON.stringify(baseline.failing),
  };
  a7.npmTestOk = Number.isFinite(after.pass) && Number.isFinite(baseline.pass)
    && a7.npmTest.sameFailingAsBaseline && after.fail === baseline.fail && after.pass >= baseline.pass
    && a7.testLogProvenanceOk;
} else {
  a7.npmTest = 'not run（A7_SKIP_TESTS=1）';
  a7.npmTestOk = null;
}
if (process.env.A7_SKIP_BUILD !== '1') {
  try { sh('npm run build'); a7.buildOk = true; } catch (e) { a7.buildOk = false; a7.buildError = String(e.stderr || e).slice(-2000); }
} else a7.buildOk = null;
a7.pass = a7.protectedDiff === '' && a7.geoCharacterOk && a7.mainOk && a7.careerScreenOk && a7.npmTestOk === true && a7.buildOk === true;
report.a7 = a7;

// ---- 彙總 ----
const V = Object.values(report.variants);
report.a8.pass = skipShots ? null
  : report.a8.screenshots.length === 2 && report.a8.screenshots.every((x) => !x.logoCovered) && report.a8.extra.length === 2;
const all = (k) => V.every((v) => v.pass[k]);
report.pass = {
  A1: all('A1') && (skipShots || report.aliasPlayerCount === 14) && allErrors.length === 0,
  A2: all('A2'),
  A2ab: all('A2ab'),
  A2c: all('A2c'),
  A2d: all('A2d'),
  A2e: all('A2e'),
  A2f: all('A2f'),
  A2g: all('A2g'),
  A3: all('A3'),
  A4: all('A4'),
  A5: all('A5'),
  A6: V.every((v) => v.pass.A6faces && v.pass.A6hud && v.pass.A1 && v.pass.A2 && v.pass.A3 && v.pass.A4 && v.pass.A5),
  A7: a7.pass,
  A8: report.a8.pass,
  A9: all('A9'),
  A9footAir: all('A9footAir'),
  A10: all('A10'),
  A12: all('A12'),
  A11: report.a11?.pass === true,
};
report.allErrors = allErrors;
await writeFile(resolve(output, reportName), JSON.stringify(report, null, 2));
const r3 = (x) => Math.round(x * 1000) / 1000;
console.log(JSON.stringify({
  pass: report.pass,
  a2MaxDev: V.map((v) => r3(v.a2MaxDev)), a2MinWristMove: V.map((v) => r3(v.a2MinWristMove)),
  a2cMaxErr: V.map((v) => v.a2cMaxErr),
  a2d: V.map((v) => ({ arm: r3(v.a2dArmMax), legPre: r3(v.a2dLegPreMax), legPost: r3(v.a2dLegPostMax), kneeLat: r3(v.a2dKneeLateralMax) })),
  footAir: V.map((v) => ({ frames: v.footAir.frames, maxAngle: r3(v.footAir.maxAngle) })),
  a2dLegPostFrame: V.map((v) => v.a2d.map((m) => `${m.seq}#${m.player}:${r3(m.legPostFrameMax)}@${m.legPostFrameAt}`).join(' ')),
  a2cFootBefore: V.map((v) => r3(Math.min(...v.a2c.map((b) => b.footAngleBefore)))),
  a12: V.map((v) => ({ maxJump: r3(v.continuity.maxJump), at: v.continuity.at && `${v.continuity.at.player}@${v.continuity.at.frame}`, trig: v.continuity.minTriggersPerPlayer })),
  a2eMax: V.map((v) => r3(v.a2eMax)),
  a2gMin: V.map((v) => r3(v.a2gMin)),
  a2f: V.map((v) => Object.fromEntries(Object.entries(v.a2f).map(([s, f]) => [s, Object.fromEntries(Object.entries(f).map(([k, x]) => [k, r3(x)]))]))),
  a10MinRatio: V.map((v) => r3(v.a10MinRatio)),
  a10: V.map((v) => v.a10.filter((m) => m.player === 0).map((m) => `${m.seq}:${r3(m.maxSink)}/${r3(m.maxRefSink)}`)),
  a9MinY: V.map((v) => r3(v.a9MinY)), a9IdleRange: V.map((v) => v.a9IdleRange.map(r3)),
  hudFps: V.map((v) => v.hudFps), bridgeTris: V.map((v) => v.info.bridgeTris),
  a4MaxRatio: V.map((v) => v.a4MaxRatio), faces: V.map((v) => v.info.faces), errors: allErrors.length,
  a11: report.a11 && { pass: report.a11.pass, failure: report.a11.failure, steps: report.a11.steps, entryInView: report.a11.entryInView, backInView: report.a11.backInView, backOverlapsHud: report.a11.backOverlapsHud, errors: report.a11.errors.length },
  a7: { provenanceOk: a7.testLogProvenanceOk, npmTestOk: a7.npmTestOk, buildOk: a7.buildOk, diffEmpty: a7.protectedDiff === '', gc: a7.geoCharacterOk, main: a7.mainOk, careerScreen: a7.careerScreenOk },
}));
process.exit(Object.values(report.pass).every((x) => x === true) ? 0 : 1);
