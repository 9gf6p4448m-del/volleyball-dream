// 配色卷批 1 治具（?devkit=1）：全隊球衣預覽——16 隊＋我方對照，一次看完。
// 題 3 色票裁定工具兼驗收 K6 量測工具；純瀏覽器模組（動態 import，不進 node 測試）。
//
// 手法：複用 ctx 的主 renderer/scene/camera（真球場地板＋賽場燈光下看球衣，
// 也避開「每隊一個 WebGL context」的瀏覽器上限雷——recruitPortrait 檔頭那顆）。
// 每隊兩個 rig（場員＋自由人）全數建好，未選中的停在地板下 y=-60；
// 選隊＝把那一對搬到鏡頭前，零重建、零 dispose。
import { createGeoPool, createGeoCharacter, BASE_H } from './geoCharacter.js';
import { applyPortraitPose, pickPortraitPose } from './recruitPortrait.js';
import { OPPONENTS } from '../career/opponents.js';
import { UNIVERSITIES } from '../career/universities.js';
import { kitFor, cssColor } from '../career/teamKit.js';

const PARK_Y = -60; // 未選中隊伍的停車場（地板下，永不入鏡）

export function runKitPreview(ctx) {
  ctx.loadingEl.remove();
  try { ctx.court.setFloorPalette(ctx.arena.setVenue('regular', {}).floor); } catch { /* 場館裝飾失敗不擋預覽 */ }

  const teams = [
    { id: 'our-team', name: '我方（恆定對照）', kit: null, teamId: 'A' },
    ...OPPONENTS.map((d) => ({ id: d.id, name: `${d.name}（高中）`, kit: kitFor(d), teamId: 'B' })),
    ...UNIVERSITIES.map((d) => ({ id: d.id, name: `${d.name}（大學）`, kit: kitFor(d), teamId: 'B' })),
  ];

  const pool = createGeoPool(ctx.scene, false, teams.length * 2);
  const entries = teams.map((t) => {
    const field = createGeoCharacter(pool, `${t.id}-f`, t.teamId, BASE_H, false, '', t.kit);
    const libero = createGeoCharacter(pool, `${t.id}-l`, t.teamId, BASE_H - 0.1, true, '', t.kit);
    applyPortraitPose(field.joints, pickPortraitPose('outside'));
    applyPortraitPose(libero.joints, pickPortraitPose('libero'));
    for (const rig of [field, libero]) rig.root.position.set(0, PARK_Y, 0);
    return { ...t, field, libero };
  });
  pool.finishColors();

  ctx.camera.position.set(0, 1.55, 4.7);
  ctx.camera.lookAt(0, 1.15, 1.6);

  let selected = -1;
  const title = document.createElement('div');
  title.style.cssText = 'position:fixed;top:12px;left:0;right:0;text-align:center;color:#eef2fa;'
    + 'font:800 20px/1.4 system-ui;text-shadow:0 2px 8px #000;pointer-events:none;z-index:40';
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;display:flex;gap:8px;overflow-x:auto;'
    + 'padding:10px 12px;background:rgba(7,10,18,0.82);z-index:40;-webkit-overflow-scrolling:touch';
  const dot = (c) => `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;`
    + `background:${c};border:1px solid rgba(255,255,255,0.35);margin-right:3px"></span>`;
  const cards = entries.map((t, i) => {
    const el = document.createElement('button');
    const k = t.kit;
    const sw = k
      ? dot(cssColor(k.jersey)) + dot(cssColor(k.shorts)) + dot(cssColor(k.libero.jersey))
      : dot('#2e7bff') + dot('#16223f') + dot('#ffc531');
    el.innerHTML = `<div style="white-space:nowrap">${sw}</div><div style="white-space:nowrap;margin-top:4px">${t.name}</div>`;
    el.style.cssText = 'flex:0 0 auto;padding:8px 10px;border-radius:10px;border:2px solid #2a3352;'
      + 'background:#131a2c;color:#dfe6f5;font:600 12px/1.3 system-ui;cursor:pointer';
    el.addEventListener('click', () => select(i));
    bar.appendChild(el);
    return el;
  });
  document.body.append(title, bar);

  function select(i) {
    if (selected >= 0) {
      const prev = entries[selected];
      prev.field.root.position.set(0, PARK_Y, 0);
      prev.libero.root.position.set(0, PARK_Y, 0);
      cards[selected].style.borderColor = '#2a3352';
    }
    selected = i;
    const t = entries[i];
    t.field.root.position.set(-0.55, 0, 1.6);
    t.libero.root.position.set(0.55, 0, 1.6);
    t.field.root.rotation.y = Math.PI; // 面向鏡頭（模型正面＝+Z，鏡頭在更遠的 +Z 往回看）
    t.libero.root.rotation.y = Math.PI;
    cards[i].style.borderColor = '#ffd166';
    title.textContent = t.name;
  }
  select(0);

  function frame() {
    for (const t of entries) {
      for (const rig of [t.field, t.libero]) {
        rig.root.updateMatrixWorld(true);
        for (const part of rig.parts) pool.writeMatrix(part, part.node.matrixWorld);
      }
    }
    pool.markDirty();
    ctx.renderer.render(ctx.scene, ctx.camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
