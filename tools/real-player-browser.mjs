// 寫實球員卷 第一階段驗收治具（docs/real-player-stage1-acceptance.md A1–A9，含加嚴紀錄兩批與修正紀錄）。
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
await mkdir(output, { recursive: true });

const report = {
  createdAt: new Date().toISOString(),
  base,
  head: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  dirty: execSync('git status --porcelain -- src tools', { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  device: 'Desktop headless Chromium（SwiftShader/WebGL）；FPS 非真機數字',
  variants: {},
  a7: null,
  a8: { screenshots: [], extra: [] },
  pass: {},
};

// ---- 頁內量測（全部走 window.__realPreview 暴露的真實 SkinnedMesh；期望值另外 import 正式模組）----
async function measureStatic(page) {
  return page.evaluate(async () => {
    const rp = window.__realPreview;
    const { THREE } = rp;
    const gc = await import('/src/render/geoCharacter.js');
    const out = { players: [] };
    // 綁定姿勢的關節世界座標：由 skeleton.boneInverses 反推（不讀實作宣稱的地標表）
    const p0 = rp.players[0].mesh;
    const bindPos = {};
    p0.skeleton.bones.forEach((bone, bi) => {
      const m = p0.skeleton.boneInverses[bi].clone().invert();
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
    const contra = /^(r|l)(Shoulder|Elbow|Wrist|Hip|Knee)$/;
    for (const pl of rp.players) {
      const g = pl.mesh.geometry;
      const pos = g.attributes.position;
      const si = g.attributes.skinIndex;
      const sw = g.attributes.skinWeight;
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
    const g = mesh.geometry;
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
      for (const i of idx) { mesh.getVertexPosition(i, v); c.add(v); } // CPU 蒙皮
      return c.divideScalar(idx.length);
    };
    const soleMin = () => {
      let m = Infinity;
      for (const i of soles) { mesh.getVertexPosition(i, v); if (v.y < m) m = v.y; }
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
    const dirAngles = () => {
      ref.root.updateMatrixWorld(true);
      const res = {};
      for (const [a, b] of SEGS) {
        const d1 = wp(pl.joints[b]).sub(wp(pl.joints[a])).normalize();
        const d2 = wp(ref.joints[b]).sub(wp(ref.joints[a])).normalize();
        res[`${a}>${b}`] = THREE.MathUtils.radToDeg(d1.angleTo(d2));
      }
      return res;
    };
    const dt = 1 / 60;
    rp.step(dt, 30); // 待命（未觸發任何序列）0.5 秒
    const rest = measure();
    const idleDirs = dirAngles();
    const idleSole = soleMin();

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
    for (const [a, b] of SEGS) {
      const k = `${a}>${b}`;
      segMax[k] = Math.max(idleDirs[k], ...out.map((o) => o.dirs[k]));
    }
    const a2d = { idle: idleDirs, segMax, maxAngle: Math.max(...Object.values(segMax)), calls };
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
    return { seq, playerIndex, samples: out.length, times: out.map((o) => o.t), summary, a2d, a2e, a9 };
  }, { playerIndex, seq, samples });
}

// A2(c)：擺回算 boneInverses 當下的姿勢（含 root 單位變換）後，CPU 蒙皮頂點＝載入後未蒙皮頂點
async function measureBindRestore(page) {
  return page.evaluate(() => {
    const rp = window.__realPreview;
    const { THREE } = rp;
    rp.resetAll();
    const v = new THREE.Vector3();
    const out = [];
    for (let i = 0; i < rp.playerCount; i += 1) {
      rp.bindPose(i, true);
      const mesh = rp.players[i].mesh;
      const pos = mesh.geometry.attributes.position;
      let maxErr = 0; let minY = Infinity; let maxY = -Infinity;
      for (let k = 0; k < pos.count; k += 1) {
        mesh.getVertexPosition(k, v);
        maxErr = Math.max(maxErr, Math.hypot(v.x - pos.getX(k), v.y - pos.getY(k), v.z - pos.getZ(k)));
        minY = Math.min(minY, pos.getY(k)); maxY = Math.max(maxY, pos.getY(k));
      }
      // 「載入後（縮放、貼地後）」的旁證：未蒙皮頂點腳底 y=0、身高＝BASE_H
      out.push({ id: rp.players[i].playerId, maxErr, minY, height: maxY - minY });
      rp.resetAll();
    }
    return out;
  });
}

const in01 = (x, lo, hi) => x >= lo && x <= hi;
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] });
const allErrors = [];
try {
  for (const [variant, query, expectFaces] of [['20k', '?mode=realpreview', 20000], ['5k', '?mode=realpreview&faces=5k', 5000]]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.goto(`${base}/${query}&quality=high&dpr=1`, { timeout: 120000 });
    await page.waitForFunction(() => Boolean(window.__realPreview), null, { timeout: 60000 });
    await page.evaluate(() => window.__realPreview.pause());
    const info = await page.evaluate(() => ({
      playerCount: window.__realPreview.playerCount,
      faces: window.__realPreview.faces,
      variant: window.__realPreview.variant,
      bridgeTris: window.__realPreview.bridgeTris,
    }));
    // A6：HUD 的 FPS 須為實測數值 > 0（等 HUD 至少刷新出一個數字，最多 20 秒）
    const fpsOf = (t) => { const m = /FPS\s+(\d+(?:\.\d+)?)/.exec(t); return m ? Number(m[1]) : null; };
    await page.waitForFunction(() => {
      const t = document.getElementById('real-hud')?.textContent ?? '';
      const m = /FPS\s+(\d+(?:\.\d+)?)/.exec(t);
      return m && Number(m[1]) > 0;
    }, null, { timeout: 20000 }).catch(() => {});
    const hud = await page.evaluate(() => document.getElementById('real-hud')?.textContent ?? '');
    const stat = await measureStatic(page);
    const bindRestore = await measureBindRestore(page);
    const motion = [];
    for (const pi of [0, 7, 13]) { // A 隊一般、B 隊一般、B 隊自由人
      for (const seq of ['bump', 'spike', 'block']) motion.push(await measureMotion(page, pi, seq, 8));
    }
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
      && Math.abs(b.minY) <= 1e-3 && Math.abs(b.height - 1.85) <= 1e-3);
    const a2d = motion.every((m) => m.a2d.maxAngle <= 10 && m.a2d.calls.update > 0 && m.a2d.calls.trigger.length > 0);
    const a2e = motion.every((m) => m.a2e.max <= 0.15 && m.a2e.handVerts.r > 0 && m.a2e.handVerts.l > 0);
    const a2f = ['r', 'l'].every((s) => {
      const f = stat.a2f[s];
      return in01(f.hipY, 0.87, 1.04) && in01(f.kneeY, 0.48, 0.57) && in01(f.upperArm, 0.28, 0.39) && in01(f.forearm, 0.22, 0.31);
    });
    const a2 = a2ab && a2c && a2d && a2e && a2f;
    const a3 = stat.players.every((p) => p.a3.sumBad === 0 && p.a3.contraBad === 0);
    const a4 = stat.players.every((p) => p.a4.ratio <= 0.01);
    const a5 = stat.players.every((p) => p.a5.torsoOk && p.a5.headOk);
    const a6faces = Math.abs(info.faces - expectFaces) <= expectFaces * 0.01;
    const hudFps = fpsOf(hud);
    const hudOk = hudFps != null && hudFps > 0 && hud.includes(info.faces.toLocaleString('en-US'));
    const a9 = motion.every((m) => m.a9.backToIdle && m.a9.minY >= -0.03 && in01(m.a9.idleMin, -0.01, 0.02) && m.a9.soleVerts > 0);
    report.variants[variant] = {
      info, hud, hudFps, errors, teamCounts: stat.teamCounts, bindPos: stat.bindPos, zone: stat.zone,
      a2: motion.map((m) => ({ seq: m.seq, player: m.playerIndex, samples: m.samples, times: m.times, ...m.summary })),
      a2MaxDev: Math.max(...motion.flatMap((m) => ['rWrist', 'lWrist', 'rKnee'].map((bn) => m.summary[bn].maxDev))),
      a2MinWristMove: Math.min(...motion.flatMap((m) => ['rWrist', 'lWrist'].map((bn) => m.summary[bn].maxMove))),
      a2c: bindRestore,
      a2cMaxErr: Math.max(...bindRestore.map((b) => b.maxErr)),
      a2d: motion.map((m) => ({ seq: m.seq, player: m.playerIndex, ...m.a2d })),
      a2dMaxAngle: Math.max(...motion.map((m) => m.a2d.maxAngle)),
      a2dIdleMaxAngle: Math.max(...motion.map((m) => Math.max(...Object.values(m.a2d.idle)))),
      a2e: motion.map((m) => ({ seq: m.seq, player: m.playerIndex, ...m.a2e })),
      a2eMax: Math.max(...motion.map((m) => m.a2e.max)),
      a2f: stat.a2f,
      a3: stat.players.map((p) => ({ id: p.playerId, ...p.a3 })),
      a4: stat.players.map((p) => ({ id: p.playerId, ...p.a4 })),
      a4MaxRatio: Math.max(...stat.players.map((p) => p.a4.ratio)),
      a5: stat.players.map((p) => ({ id: p.playerId, libero: p.isLibero, ...p.a5 })),
      a9: motion.map((m) => ({ seq: m.seq, player: m.playerIndex, ...m.a9 })),
      a9MinY: Math.min(...motion.map((m) => m.a9.minY)),
      a9IdleRange: [Math.min(...motion.map((m) => m.a9.idleMin)), Math.max(...motion.map((m) => m.a9.idleMin))],
      pass: {
        A1: a1, A2: a2, A2ab: a2ab, A2c: a2c, A2d: a2d, A2e: a2e, A2f: a2f,
        A3: a3, A4: a4, A5: a5, A6faces: a6faces, A6hud: hudOk, A9: a9,
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
if (process.env.A7_TEST_LOG) {
  const p = resolve(process.env.A7_TEST_LOG);
  testLog = await readFile(p, 'utf8');
  a7.testLogSource = { provided: p, mtime: (await stat(p)).mtime.toISOString() };
} else if (process.env.A7_SKIP_TESTS !== '1') {
  const t0 = Date.now();
  try { testLog = sh('npm test', { timeout: 60 * 60 * 1000 }); } catch (e) { testLog = `${e.stdout ?? ''}\n${e.stderr ?? ''}`; }
  const p = resolve(output, 'npm-test-after.log');
  await writeFile(p, testLog);
  a7.testLogSource = { ranInTool: p, seconds: Math.round((Date.now() - t0) / 1000) };
}
if (testLog != null) {
  const after = parseTestLog(testLog);
  a7.npmTest = {
    ...after, baselinePath, baselinePass: baseline.pass, baselineFailing: baseline.failing,
    newFailures: after.failing.filter((f) => !baseline.failing.includes(f)),
    sameFailingAsBaseline: JSON.stringify(after.failing) === JSON.stringify(baseline.failing),
  };
  a7.npmTestOk = Number.isFinite(after.pass) && Number.isFinite(baseline.pass)
    && a7.npmTest.sameFailingAsBaseline && after.fail === baseline.fail && after.pass >= baseline.pass;
} else {
  a7.npmTest = 'not run（A7_SKIP_TESTS=1）';
  a7.npmTestOk = null;
}
if (process.env.A7_SKIP_BUILD !== '1') {
  try { sh('npm run build'); a7.buildOk = true; } catch (e) { a7.buildOk = false; a7.buildError = String(e.stderr || e).slice(-2000); }
} else a7.buildOk = null;
a7.pass = a7.protectedDiff === '' && a7.geoCharacterOk && a7.mainOk && a7.npmTestOk === true && a7.buildOk === true;
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
  A3: all('A3'),
  A4: all('A4'),
  A5: all('A5'),
  A6: V.every((v) => v.pass.A6faces && v.pass.A6hud && v.pass.A1 && v.pass.A2 && v.pass.A3 && v.pass.A4 && v.pass.A5),
  A7: a7.pass,
  A8: report.a8.pass,
  A9: all('A9'),
};
report.allErrors = allErrors;
await writeFile(resolve(output, reportName), JSON.stringify(report, null, 2));
const r3 = (x) => Math.round(x * 1000) / 1000;
console.log(JSON.stringify({
  pass: report.pass,
  a2MaxDev: V.map((v) => r3(v.a2MaxDev)), a2MinWristMove: V.map((v) => r3(v.a2MinWristMove)),
  a2cMaxErr: V.map((v) => v.a2cMaxErr), a2dMaxAngle: V.map((v) => r3(v.a2dMaxAngle)),
  a2eMax: V.map((v) => r3(v.a2eMax)),
  a2f: V.map((v) => Object.fromEntries(Object.entries(v.a2f).map(([s, f]) => [s, Object.fromEntries(Object.entries(f).map(([k, x]) => [k, r3(x)]))]))),
  a9MinY: V.map((v) => r3(v.a9MinY)), a9IdleRange: V.map((v) => v.a9IdleRange.map(r3)),
  hudFps: V.map((v) => v.hudFps), bridgeTris: V.map((v) => v.info.bridgeTris),
  a4MaxRatio: V.map((v) => v.a4MaxRatio), faces: V.map((v) => v.info.faces), errors: allErrors.length,
  a7: { npmTestOk: a7.npmTestOk, buildOk: a7.buildOk, diffEmpty: a7.protectedDiff === '', gc: a7.geoCharacterOk, main: a7.mainOk },
}));
process.exit(Object.values(report.pass).every((x) => x === true) ? 0 : 1);
