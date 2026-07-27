// Phase 4 W2 — 「你長高了」屆間儀式（儀式演出框架的首發消費者）
// 規格（工單 B4）：①暗場聚光——主角獨站光池 ②身高尺動畫——舊刻度→數字滾動爬升→
// 新身高定格＋公分差彈出 ③幾何關節模型即時長高（鏡頭前長給你看）④參數刻度爬升
// ——攔網觸及／扣球點同步視覺化 ⑤跨帶評語（A3）由呼叫端接在演出後（dialogPlay）。
// 插入點：careerScreen 屆間鏈 advanceSeason 之後、新生入學之前。
// 防炸原則：WebGL 建場失敗＝退化為純數字演出（儀式不得 crash 屆間流程）；
// prefers-reduced-motion＝跳過補間直接定格。
import { createRitualStage, tween } from '../render/ritualStage.js';
import { blockReach, spikeReach } from '../sim/player.js';

const RULER_MIN = 140;
const RULER_MAX = 220;

function el(tag, styles, text) {
  const node = document.createElement(tag);
  node.style.cssText = styles.join(';');
  if (text !== undefined) node.textContent = text;
  return node;
}

function reduceMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

// 參數刻度用：以揭曉後的屬性、指定身高，算攔網觸及／扣球點（sim 即時推導公式）
function reachAt(player, cm) {
  const probe = { height: { current: cm / 100 }, attributes: player.attributes };
  return { block: blockReach(probe), spike: spikeReach(probe) };
}

// reveal＝careerStore.advanceSeason 回傳的 heightReveal（{season, fromCm, toCm, grewCm}）
export function showHeightRitual({ player, reveal, onDone }) {
  const { fromCm, toCm, grewCm } = reveal;
  const motionOff = reduceMotion();
  const overlay = el('div', [
    'position:fixed', 'inset:0', 'z-index:39', 'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:safe center', 'gap:12px', 'overflow-y:auto',
    'background:rgba(2,4,9,0.96)', 'opacity:0', 'transition:opacity 0.35s ease',
    'padding:calc(env(safe-area-inset-top, 0px) + 20px) 16px 32px',
    'font-family:system-ui,sans-serif', 'user-select:none',
  ]);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });

  overlay.appendChild(el('div', [
    'font-size:13px', 'color:#9fb0cc', 'letter-spacing:6px',
  ], '屆 間 體 檢'));

  // ---- 舞台（three.js 暗場聚光；建場失敗＝純數字退化，不炸流程）----
  let stage = null;
  const stageW = Math.min(300, Math.floor(window.innerWidth * 0.8));
  try {
    stage = createRitualStage({
      playerId: player.id ?? 'A2',
      teamId: 'A',
      role: player.currentRole ?? 'outside',
      heightM: fromCm / 100,
      width: stageW,
      height: 360,
    });
  } catch { stage = null; }

  const stageRow = el('div', ['display:flex', 'align-items:stretch', 'gap:10px']);
  if (stage) stageRow.appendChild(stage.el);

  // ---- 身高尺（140–220 直尺；標記線＋數字隨補間爬升）----
  const ruler = el('div', [
    'position:relative', 'width:46px', 'height:360px', 'border-radius:10px',
    'background:linear-gradient(180deg, rgba(30,40,64,0.5), rgba(14,19,33,0.7))',
    'border:1px solid #2c3a58', 'overflow:hidden',
  ]);
  for (let cm = RULER_MIN; cm <= RULER_MAX; cm += 10) {
    const y = (1 - (cm - RULER_MIN) / (RULER_MAX - RULER_MIN)) * 100;
    const tick = el('div', [
      'position:absolute', 'left:0', 'right:26px', 'height:1px', `top:${y}%`,
      'background:#3a4a6e',
    ]);
    ruler.appendChild(tick);
    ruler.appendChild(el('div', [
      'position:absolute', 'right:2px', `top:calc(${y}% - 6px)`, 'font-size:8px',
      'color:#5a6c92',
    ], String(cm)));
  }
  // 4.5B §5-3 刻痕累積：尺上留前幾年的刻痕——第一次一道線、第三年三道線並排。
  // 份量自己長出來（B＋案：不加規格、加累積）；同時＝幕三長高變體
  // 「比對三年前的尺」的視覺基礎。資料源＝height.timeline（已揭曉的歷屆身高）。
  const pastMarks = (player.height?.timeline ?? [])
    .filter((t) => t.season < (reveal.season ?? Infinity));
  for (const mk of pastMarks) {
    const cm = mk.height * 100;
    const y = (1 - (cm - RULER_MIN) / (RULER_MAX - RULER_MIN)) * 100;
    ruler.appendChild(el('div', [
      'position:absolute', 'left:0', 'right:10px', 'height:1px', `top:${y}%`,
      'background:rgba(255,209,102,0.45)',
    ]));
    ruler.appendChild(el('div', [
      'position:absolute', 'left:3px', `top:calc(${y}% - 11px)`, 'font-size:8px',
      'color:rgba(255,209,102,0.7)', 'letter-spacing:1px',
    ], `${mk.season}屆`));
  }
  const marker = el('div', [
    'position:absolute', 'left:0', 'right:0', 'height:2px', 'background:#ffd166',
    'box-shadow:0 0 8px rgba(255,209,102,0.8)', 'top:50%',
  ]);
  ruler.appendChild(marker);
  stageRow.appendChild(ruler);
  overlay.appendChild(stageRow);

  // ---- 數字滾動列＋公分差彈出 ----
  const numRow = el('div', ['display:flex', 'align-items:baseline', 'gap:8px', 'min-height:52px']);
  const numEl = el('div', [
    'font-size:46px', 'font-weight:900', 'color:#eef2fa', 'letter-spacing:2px',
    'font-variant-numeric:tabular-nums',
  ], String(fromCm));
  numRow.appendChild(numEl);
  numRow.appendChild(el('div', ['font-size:16px', 'color:#9fb0cc'], 'cm'));
  const diffBadge = el('div', [
    'font-size:18px', 'font-weight:900', 'color:#ffd166', 'opacity:0',
    'transform:scale(0.6)', 'transition:opacity 0.3s ease, transform 0.3s cubic-bezier(0.2,1.6,0.4,1)',
  ], grewCm > 0 ? `＋${grewCm} cm` : '——');
  numRow.appendChild(diffBadge);
  overlay.appendChild(numRow);

  // ---- 參數刻度（攔網觸及／扣球點——身高尺上的視覺化同步）----
  const before = reachAt(player, fromCm);
  const after = reachAt(player, toCm);
  const paramBox = el('div', [
    'display:flex', 'flex-direction:column', 'gap:6px', `width:${stageW + 56}px`,
  ]);
  const paramRows = [];
  for (const [label, from, to] of [
    ['攔網觸及', before.block, after.block],
    ['扣球點', before.spike, after.spike],
  ]) {
    const row = el('div', ['display:flex', 'align-items:center', 'gap:8px']);
    row.appendChild(el('div', ['font-size:12px', 'color:#9fb0cc', 'width:56px', 'text-align:left'], label));
    const track = el('div', [
      'flex:1', 'height:8px', 'border-radius:4px', 'background:rgba(30,40,64,0.6)',
      'overflow:hidden',
    ]);
    const fill = el('div', [
      'height:100%', 'border-radius:4px', 'width:0%',
      'background:linear-gradient(90deg, #2e7bff, #6ee7ff)',
    ]);
    track.appendChild(fill);
    row.appendChild(track);
    const val = el('div', [
      'font-size:12px', 'font-weight:700', 'color:#6ee7ff', 'width:52px', 'text-align:right',
      'font-variant-numeric:tabular-nums',
    ], `${from.toFixed(2)}m`);
    row.appendChild(val);
    paramBox.appendChild(row);
    paramRows.push({ fill, val, from, to });
  }
  overlay.appendChild(paramBox);

  const caption = el('div', [
    'font-size:14px', 'font-weight:700', 'color:#ffd166', 'letter-spacing:2px',
    'opacity:0', 'transition:opacity 0.4s ease', 'min-height:20px',
  ], grewCm > 0 ? '你長高了' : '身體停下來了——但你的排球還在長');
  overlay.appendChild(caption);
  const hint = el('div', ['font-size:11px', 'color:#9fb0cc', 'opacity:0'], '▼ 點擊繼續');
  overlay.appendChild(hint);

  // 參數刻度基準：2.30m（低標）→ 3.60m（滿標）——爬升幅度看得見又不誇大
  const BAR_LO = 2.3;
  const BAR_HI = 3.6;
  const paint = (cm, t) => {
    numEl.textContent = String(Math.round(cm));
    const y = (1 - (cm - RULER_MIN) / (RULER_MAX - RULER_MIN)) * 100;
    marker.style.top = `${y}%`;
    if (stage) stage.setHeight(cm / 100);
    for (const r of paramRows) {
      const v = r.from + (r.to - r.from) * t;
      r.fill.style.width = `${Math.max(0, Math.min(1, (v - BAR_LO) / (BAR_HI - BAR_LO))) * 100}%`;
      r.val.textContent = `${v.toFixed(2)}m`;
    }
  };
  paint(fromCm, 0);

  let doneArmed = false;
  const finish = () => {
    if (!doneArmed) return;
    overlay.remove();
    if (stage) stage.dispose();
    onDone();
  };
  overlay.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    finish();
  });

  // ---- 演出序列：暗場→聚光亮起→定住→長高補間→定格＋公分差彈出→可離場 ----
  (async () => {
    const dur = (ms) => (motionOff ? 0 : ms);
    await tween(dur(700), (t) => { if (stage) stage.setSpot(t); });
    if (motionOff && stage) stage.setSpot(1);
    await tween(dur(500), () => {});
    await tween(dur(1800), (t) => paint(fromCm + (toCm - fromCm) * t, t));
    paint(toCm, 1);
    diffBadge.style.opacity = '1';
    diffBadge.style.transform = 'scale(1)';
    caption.style.opacity = '1';
    hint.style.opacity = '1';
    doneArmed = true;
  })();
}
