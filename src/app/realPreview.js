// 寫實球員卷 第一階段：?mode=realpreview（別名 ?devreal=1）獨立預覽場景。
// 14 名 Modly 寫實白模（預設 20k；&faces=5k 切減面版）以 geo 關節樹當骨架、
// geoAnimator 驅動，輪播 bump／spike／block。不碰正式賽場（matchView 完全不參與）。
// window.__realPreview＝治具介面（tools/real-player-browser.mjs）。
import * as THREE from 'three';
import { createGeoAnimator, hitLeadTicks } from '../render/geoAnimator.js';
import { BASE_H } from '../render/geoCharacter.js';
import { loadRealPlayerAsset, createRealPlayer, BONES, LANDMARKS } from '../render/realPlayer.js';

const DT = 1 / 60;
// spike＝完整三段序列：windup（起跳，自動接 spikeHold）→ 滯空 → spike 擊球弧
const SPIKE_HIT_DELAY = 0.3; // windup 觸發後幾秒接 spike（落在 spikeHold 滯空期內）
export const ACTION_DUR = { bump: 0.6, spike: 1.2, block: 1.0 };
const LOOP = ['bump', 'spike', 'block'];

// 兩隊各 6 名一般＋1 名自由人（id 沿用 sim 慣例 A1..A6／AL）
function roster() {
  const out = [];
  for (const team of ['A', 'B']) {
    for (let i = 1; i <= 6; i += 1) out.push({ playerId: `${team}${i}`, teamId: team, isLibero: false });
    out.push({ playerId: `${team}L`, teamId: team, isLibero: true });
  }
  return out;
}
const HEIGHTS = [1.92, 1.86, 1.98, 1.8, 1.9, 1.95, 1.76];

export async function runRealPreview(ctx) {
  const { renderer, scene, camera, loadingEl, params } = ctx;
  const variant = params.get('faces') === '5k' ? '5k' : '20k';
  const url = `${import.meta.env.BASE_URL}models/real/player_${variant}.glb`;
  const asset = await loadRealPlayerAsset(url);
  if (loadingEl) loadingEl.remove();

  const castShadow = (ctx.quality?.shadowSize ?? 0) > 0;
  const players = roster().map((r, i) => {
    const slot = i % 7;
    const height = HEIGHTS[slot];
    const p = createRealPlayer(asset, { ...r, height });
    const side = r.teamId === 'A' ? -1 : 1; // A 在 -Z 半場、面向 +Z（網）
    const col = slot % 3;
    const row = Math.floor(slot / 3);
    const x = slot === 6 ? 3.6 : (col - 1) * 2.6;
    const z = side * (slot === 6 ? 6.8 : 1.6 + row * 3.2);
    p.rig.root.position.set(x, 0, z);
    p.rig.root.rotation.y = side < 0 ? 0 : Math.PI;
    p.home = { x, z, ry: p.rig.root.rotation.y };
    p.mesh.castShadow = castShadow;
    p.mesh.receiveShadow = false;
    scene.add(p.rig.root);
    scene.add(p.mesh);
    p.anim = createGeoAnimator(p.rig);
    p.action = null; // { type, t, spikeFired }
    p.loopIdx = i % LOOP.length;
    p.loopWait = 0.3 + (i % 5) * 0.35;
    return p;
  });

  camera.position.set(9.5, 5.2, 11.5);
  camera.lookAt(0, 1.1, 0);

  function play(p, type) {
    p.action = { type, t: 0, spikeFired: false };
    if (type === 'spike') p.anim.trigger('windup');
    else p.anim.trigger(type);
  }
  let auto = true;
  function stepPlayer(p, dt) {
    if (p.action) {
      p.action.t += dt;
      if (p.action.type === 'spike' && !p.action.spikeFired && p.action.t >= SPIKE_HIT_DELAY) {
        p.action.spikeFired = true;
        p.anim.trigger('spike');
      }
      if (p.action.t >= ACTION_DUR[p.action.type]) p.action = null;
    } else if (auto) {
      p.loopWait -= dt;
      if (p.loopWait <= 0) {
        play(p, LOOP[p.loopIdx]);
        p.loopIdx = (p.loopIdx + 1) % LOOP.length;
        p.loopWait = 0.9;
      }
    }
    const bodyY = p.anim.update(dt, 0, 0, 1);
    p.rig.root.position.y = bodyY * p.rig.root.scale.y;
    // 接地（A9）：geoAnimator 的下蹲／落地緩衝只把 root 往下壓，沒有腳鎖；鞋底入地時才把
    // root 往上補到剛好貼地——只補不壓，騰空（跳躍弧）時鞋底在地面上，完全不動
    const low = p.soleMinY();
    if (low < 0) p.rig.root.position.y -= low;
  }
  function stepAll(dt) { for (const p of players) stepPlayer(p, dt); }

  // HUD：FPS＋目前面數
  const hudEl = document.createElement('div');
  hudEl.id = 'real-hud';
  hudEl.style.cssText = 'position:fixed;right:max(10px,env(safe-area-inset-right));top:max(10px,env(safe-area-inset-top));'
    + 'z-index:20;padding:8px 12px;border-radius:10px;background:rgba(12,16,26,.7);color:#eef2fa;'
    + 'font:600 14px/1.4 ui-monospace,Consolas,monospace;pointer-events:none;white-space:pre';
  document.body.appendChild(hudEl);
  let fps = null; // 第一個量測窗（0.5 秒）前不顯示數字
  const fmtFps = () => (fps == null ? '—' : (fps < 10 ? fps.toFixed(1) : String(Math.round(fps))));
  const fmtHud = () => `FPS ${fmtFps()}\n面數 ${asset.faces.toLocaleString()}／人（${variant}）\n${players.length} 人`;
  hudEl.textContent = fmtHud();

  let paused = false;
  let last = performance.now();
  let frames = 0;
  let fpsT = last;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!paused) stepAll(dt);
    if (ctx.postFx) ctx.postFx.render(scene, camera);
    else renderer.render(scene, camera);
    ctx.hud?.frame?.(now, dt, 0);
    frames += 1;
    if (now - fpsT >= 500) {
      fps = (frames * 1000) / (now - fpsT);
      frames = 0;
      fpsT = now;
      hudEl.textContent = fmtHud();
    }
  }
  requestAnimationFrame(frame);

  window.__realPreview = {
    THREE,
    variant,
    faces: asset.faces,
    bridgeTris: asset.bridgeTris, // 接縫拆分處理的三角形數（見 realPlayer.js splitBridges）
    soleVerts: asset.sole.n, // 逐幀接地補償用的鞋底頂點數
    playerCount: players.length,
    baseH: BASE_H,
    boneNames: BONES.slice(),
    landmarks: LANDMARKS,
    actionDur: { ...ACTION_DUR },
    // spike 擊球關鍵幀距 play() 的秒數（windup 後 SPIKE_HIT_DELAY 接 spike，再走到 spike.hit）
    spikeHitTime: SPIKE_HIT_DELAY + hitLeadTicks('spike') / 60,
    players: players.map((p) => ({
      playerId: p.playerId, teamId: p.teamId, isLibero: p.isLibero, height: p.height,
      mesh: p.mesh, joints: p.rig.joints, root: p.rig.root,
    })),
    // 治具：目前驅動該球員的 geoAnimator 實例（resetAll 會換新，取用時再拿）
    animOf(i) { return players[i].anim; },
    hudText: () => hudEl.textContent,
    pause() { paused = true; auto = false; },
    resume() { paused = false; auto = true; },
    // 治具：全員回動畫零姿勢、清動畫狀態（新 animator）、回原位原縮放
    resetAll() {
      for (const p of players) {
        p.resetPose();
        p.anim = createGeoAnimator(p.rig);
        p.action = null;
        p.rig.root.position.set(p.home.x, 0, p.home.z);
        p.rig.root.rotation.set(0, p.home.ry, 0);
        p.rig.root.scale.setScalar(p.rootScale);
      }
      scene.updateMatrixWorld(true);
    },
    // 治具（A2(c)／A2 靜止量測）：該球員擺回算 boneInverses 當下的姿勢
    bindPose(i, atOrigin = false) {
      players[i].applyBindPose({ atOrigin });
      scene.updateMatrixWorld(true);
    },
    play(i, type) { play(players[i], type); },
    step(dt = DT, n = 1) {
      for (let k = 0; k < n; k += 1) stepAll(dt);
      scene.updateMatrixWorld(true);
    },
    render() { renderer.render(scene, camera); },
    setCamera(pos, look) { camera.position.set(...pos); camera.lookAt(...look); },
  };
}
