// Phase 4.6 §6 — 小白事件二「位置示意」：靜態俯視半場圖（SVG，零圖檔資產）。
//
// 為什麼是示意圖不是重演（拍板 B，理由入卷）：事件二的觸發源是 settleCareerMatch
// 賽末掃描 scanChaseLost 推導的**統計**（lbChase/lbWho 兩個數字），**沒有那顆球的
// rally 快照**——要重演得為劇情事件新增整條錄製鏈，擴散不成比例。而且事件二的敘事點
// 是**「位置讓出來了」**，不是「他撲得多慘」：重演把注意力給動作，示意圖給的是空間。
//
// 固定構圖、不讀真實座標（沒有座標可讀）——示意圖是手繪規格。
// 讓出的區域＝**空白亮區**（不是紅色警示，是「沒有人」）。
const NS = 'http://www.w3.org/2000/svg';

const W = 300;
const H = 190;
// 半場框（上緣＝網、下緣＝端線）
const COURT = { x: 30, y: 18, w: 240, h: 150 };

function node(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}

function label(x, y, text, color = '#9fb0cc', size = 11, anchor = 'middle') {
  return node('text', {
    x, y, fill: color, 'font-size': size, 'text-anchor': anchor,
    'font-family': 'system-ui, sans-serif',
  }, text);
}

// 人形記號（俯視：圓＋短肩線）——幾何角色路線的平面版
function figure(x, y, color, dim = false) {
  const g = node('g', { opacity: dim ? 0.45 : 1 });
  g.appendChild(node('circle', { cx: x, cy: y, r: 5.5, fill: color }));
  g.appendChild(node('line', {
    x1: x - 7, y1: y + 7, x2: x + 7, y2: y + 7, stroke: color, 'stroke-width': 2,
  }));
  return g;
}

// variant：'court'＝上場版（主體＝小白）／'mentor'＝師徒版（主體＝你）／
// 'sideline'＝場邊保底版（他數落地的球——同一張圖改標多點落地痕）
export function createChaseDiagram({ variant = 'court', subjectName = '小白' } = {}) {
  const svg = node('svg', {
    viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img',
    style: 'display:block;max-width:420px;margin:0 auto;background:#070b14;border-radius:12px',
  });

  // 場地
  svg.appendChild(node('rect', {
    x: COURT.x, y: COURT.y, width: COURT.w, height: COURT.h,
    fill: '#101a2e', stroke: '#2c3a58', 'stroke-width': 1.5, rx: 3,
  }));
  // 網（上緣）＋三米線
  svg.appendChild(node('line', {
    x1: COURT.x - 8, y1: COURT.y, x2: COURT.x + COURT.w + 8, y2: COURT.y,
    stroke: '#d8e2f4', 'stroke-width': 3, opacity: 0.8,
  }));
  svg.appendChild(node('line', {
    x1: COURT.x, y1: COURT.y + 50, x2: COURT.x + COURT.w, y2: COURT.y + 50,
    stroke: '#2c3a58', 'stroke-width': 1, 'stroke-dasharray': '4 4',
  }));
  svg.appendChild(label(COURT.x + COURT.w / 2, COURT.y - 6, '網', '#6ee7ff', 10));

  const start = { x: 150, y: 128 };     // 自由人起點（後排中央）
  const landing = { x: 58, y: 92 };     // 撲出去落地的位置（左翼深處）
  const hole = { x: 168, y: 118 };      // 讓出來的區域中心

  if (variant === 'sideline') {
    // 場邊保底版：他不在場上——場外一個人，場內是他數過的、落地的球
    const marks = [[92, 62], [150, 96], [212, 74], [128, 140], [196, 132]];
    for (const [x, y] of marks) {
      const g = node('g', { opacity: 0.9 });
      g.appendChild(node('circle', { cx: x, cy: y, r: 9, fill: '#ffd166', opacity: 0.14 }));
      g.appendChild(node('path', {
        d: `M${x - 4} ${y - 4} L${x + 4} ${y + 4} M${x + 4} ${y - 4} L${x - 4} ${y + 4}`,
        stroke: '#ffd166', 'stroke-width': 1.8,
      }));
      svg.appendChild(g);
    }
    svg.appendChild(figure(14, 150, '#9fb0cc', true));
    svg.appendChild(label(14, 172, '場邊', '#9fb0cc', 10));
    svg.appendChild(label(W / 2, H - 6, `${subjectName}數過的：落地的球`, '#ffd166', 11));
    return svg;
  }

  // 讓出的區域＝空白亮區（沒有人；不是警示紅）
  svg.appendChild(node('ellipse', {
    cx: hole.x, cy: hole.y, rx: 58, ry: 40, fill: '#eef2fa', opacity: 0.1,
  }));
  svg.appendChild(node('ellipse', {
    cx: hole.x, cy: hole.y, rx: 58, ry: 40, fill: 'none',
    stroke: '#eef2fa', 'stroke-width': 1, 'stroke-dasharray': '3 5', opacity: 0.35,
  }));
  svg.appendChild(label(hole.x, hole.y + 4, '沒有人', '#eef2fa', 12));

  // 起點 →（虛線）→ 撲救落地點
  svg.appendChild(node('path', {
    d: `M${start.x} ${start.y} Q${(start.x + landing.x) / 2} ${start.y - 26} ${landing.x} ${landing.y}`,
    fill: 'none', stroke: '#6ee7ff', 'stroke-width': 2, 'stroke-dasharray': '5 4',
  }));
  svg.appendChild(figure(start.x, start.y, '#6ee7ff', true));
  svg.appendChild(label(start.x, start.y + 24, '起點', '#6ee7ff', 10));
  svg.appendChild(figure(landing.x, landing.y, '#6ee7ff'));
  svg.appendChild(label(landing.x, landing.y + 24, variant === 'mentor' ? '你撲出去' : `${subjectName}撲出去`, '#6ee7ff', 10));

  // 對手的球落在亮區裡
  svg.appendChild(node('circle', { cx: hole.x + 18, cy: hole.y - 16, r: 6, fill: '#ffd166' }));
  svg.appendChild(node('circle', {
    cx: hole.x + 18, cy: hole.y - 16, r: 12, fill: 'none', stroke: '#ffd166',
    'stroke-width': 1, opacity: 0.5,
  }));
  svg.appendChild(label(hole.x + 18, hole.y - 26, '對手的球', '#ffd166', 10));
  svg.appendChild(label(W / 2, H - 6, '那幾分，是從讓出來的地方進的', '#9fb0cc', 11));
  return svg;
}
