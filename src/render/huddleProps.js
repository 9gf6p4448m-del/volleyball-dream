// 暫停演出道具：教練（幾何拼裝，深色 polo 與球員區隔）＋手持戰術板（CanvasTexture
// 程序化白板，同 LED 廣告板技術、零素材）。兩隊各一組，鏡射擺位；只在暫停圍圈時可見。
// 純表現層：不讀不寫 sim；建立一次、show/hide 切換（暫停頻率低，不進 InstancedMesh 池）
import * as THREE from 'three';
import { coachPos } from './huddleLayout.js';

const BOARD_W = 0.78;
const BOARD_H = 0.54;
const CANVAS_W = 512;
const CANVAS_H = 354;

// 戰術板繪製：白板底＋球場線稿；play＝null 基本陣型 / 'calm' 防守收攏 / 'fire' 進攻箭頭
function drawBoard(ctx, play) {
  const W = CANVAS_W;
  const H = CANVAS_H;
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#c9c2b0';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, H - 10);
  // 球場框＋中線（網）＋攻擊線
  const cx = 70;
  const cy = 52;
  const cw = W - 140;
  const ch = H - 104;
  ctx.strokeStyle = '#2a3247';
  ctx.lineWidth = 5;
  ctx.strokeRect(cx, cy, cw, ch);
  ctx.beginPath();
  ctx.moveTo(cx, cy + ch / 2);
  ctx.lineTo(cx + cw, cy + ch / 2);
  ctx.stroke();
  ctx.setLineDash([12, 10]);
  ctx.lineWidth = 3;
  for (const dy of [-ch / 6, ch / 6]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + ch / 2 + dy);
    ctx.lineTo(cx + cw, cy + ch / 2 + dy);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // 我方 O（下半）／敵方 X（上半）
  ctx.lineWidth = 5;
  const oy = cy + ch * 0.78;
  const xy = cy + ch * 0.22;
  for (let i = 0; i < 3; i += 1) {
    const px = cx + cw * (0.25 + i * 0.25);
    ctx.strokeStyle = '#1d78b8';
    ctx.beginPath();
    ctx.arc(px, oy, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#b83a2a';
    ctx.beginPath();
    ctx.moveTo(px - 11, xy - 11);
    ctx.lineTo(px + 11, xy + 11);
    ctx.moveTo(px + 11, xy - 11);
    ctx.lineTo(px - 11, xy + 11);
    ctx.stroke();
  }
  if (play === 'calm') {
    // 🧘 穩住：防守收攏——藍色弧線把 O 圈成一體＋回位小箭頭
    ctx.strokeStyle = '#1d78b8';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx + cw / 2, oy + 4, cw * 0.34, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    for (let i = 0; i < 3; i += 1) {
      const px = cx + cw * (0.25 + i * 0.25);
      arrow(ctx, px, oy - 28, px, oy - 52, '#1d78b8', 5);
    }
  } else if (play === 'fire') {
    // 🔥 燃起來：進攻箭頭——兩翼斜線＋中路直取，紅筆重描過網
    arrow(ctx, cx + cw * 0.25, oy - 8, cx + cw * 0.72, xy + 6, '#b83a2a', 7);
    arrow(ctx, cx + cw * 0.75, oy - 8, cx + cw * 0.3, xy + 6, '#b83a2a', 7);
    arrow(ctx, cx + cw * 0.5, oy - 8, cx + cw * 0.5, xy - 2, '#b83a2a', 7);
  }
  // 角落隊名小字（板子是遊隼的）
  ctx.fillStyle = '#8a8474';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('遊隼高中', W - 22, H - 18);
}

function arrow(ctx, x0, y0, x1, y1, color, w) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x1 + Math.cos(a) * 14, y1 + Math.sin(a) * 14);
  ctx.lineTo(x1 + Math.cos(a + 2.5) * 12, y1 + Math.sin(a + 2.5) * 12);
  ctx.lineTo(x1 + Math.cos(a - 2.5) * 12, y1 + Math.sin(a - 2.5) * 12);
  ctx.closePath();
  ctx.fill();
}

// 教練：幾何拼裝（藍 polo＋深灰長褲＋棒球帽＝一眼與球衣區隔、帽簷給出朝向）；
// 左手叉腰、右手舉板；附一盞暖色板凳燈（掛在 group 裡＝跟著 show/hide 開關）
function buildCoach(boardMesh) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xC68B59, roughness: 0.85 });
  const polo = new THREE.MeshStandardMaterial({ color: 0x3a5e94, roughness: 0.75 });
  const slacks = new THREE.MeshStandardMaterial({ color: 0x33363e, roughness: 0.85 });
  const capM = new THREE.MeshStandardMaterial({ color: 0x18202f, roughness: 0.9 });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  // 腿/軀幹/頭（比例對齊 geoCharacter BASE_H 1.85 的量級，教練 1.78）
  add(new THREE.BoxGeometry(0.13, 0.86, 0.15), slacks, -0.1, 0.43, 0);
  add(new THREE.BoxGeometry(0.13, 0.86, 0.15), slacks, 0.1, 0.43, 0);
  add(new THREE.BoxGeometry(0.4, 0.52, 0.24), polo, 0, 1.12, 0);
  add(new THREE.SphereGeometry(0.125, 16, 12), skin, 0, 1.53, 0);
  // 棒球帽：帽冠＋前伸帽簷（+z＝面向隊員側——朝向線索，光球頭會被讀成後腦勺）
  const crown = add(new THREE.SphereGeometry(0.132, 16, 12), capM, 0, 1.56, -0.01);
  crown.scale.set(1, 0.62, 1);
  add(new THREE.BoxGeometry(0.19, 0.02, 0.14), capM, 0, 1.585, 0.15);
  // 左臂叉腰（兩段折）；右臂前舉持板
  const armL = add(new THREE.BoxGeometry(0.09, 0.4, 0.09), polo, -0.26, 1.2, 0.02);
  armL.rotation.z = 0.9;
  const armR = add(new THREE.BoxGeometry(0.09, 0.46, 0.09), polo, 0.24, 1.22, 0.16);
  armR.rotation.x = -1.15;
  armR.rotation.z = -0.25;
  // 戰術板：胸前偏前、朝隊員微傾（隊員在 -z 側；group 建立時面向 -z）
  boardMesh.position.set(0.02, 1.22, 0.42);
  boardMesh.rotation.x = -0.18;
  g.add(boardMesh);
  // 板凳燈：暖色小點光——暗場館側邊把教練與板打亮（僅暫停時亮，隨 group 顯隱）
  const lamp = new THREE.PointLight(0xffd9a6, 1.6, 6.5, 1.8);
  lamp.position.set(0, 2.7, 0.9);
  g.add(lamp);
  return g;
}

// side＝TEAM_SIDE[team]（A=1/B=-1）：擺位鏡射、面向自家隊員（朝球場側）
export function createHuddleProps(scene, side) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  drawBoard(ctx, null);
  const tex = new THREE.CanvasTexture(canvas);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD_W, BOARD_H),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  const coach = buildCoach(board);
  const c = coachPos(side);
  coach.position.set(c.x, 0, c.z);
  coach.rotation.y = side === 1 ? Math.PI : 0; // 面向自家隊員（朝球場方向）
  coach.visible = false;
  scene.add(coach);
  let currentPlay = null;
  return {
    setVisible(v) {
      if (coach.visible === v) return;
      coach.visible = v;
      if (!v && currentPlay) { // 散場重置成基本陣型（下次暫停從乾淨的板開始）
        currentPlay = null;
        drawBoard(ctx, null);
        tex.needsUpdate = true;
      }
    },
    drawPlay(play) {
      if (play === currentPlay) return;
      currentPlay = play;
      drawBoard(ctx, play);
      tex.needsUpdate = true;
    },
  };
}
