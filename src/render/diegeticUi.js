// 4.5B §4 — diegetic 介面（DOM 熱點 + three 投影）：
// S「全場等你的一秒」＝點隊友模型本身＝分配（熱點錨在球員 3D 位置的螢幕投影上）；
// L「暗號手勢」＝背後手勢列（一指/二指/握拳）錨在自己背後腰位。
// 取代舊 zonePanel（S/L 兩情境限定；攻擊/發球/MB 面板不動）；?panel=classic＝退路。
// 純表現層：onPick 透傳原 zone 物件，指令路徑與舊面板逐字相同（sim 零改動）。
import * as THREE from 'three';

const V = new THREE.Vector3();

// 投影：世界座標 → 螢幕 CSS px（回傳 null＝在鏡頭後方，熱點藏起）
function project(camera, x, y, z) {
  V.set(x, y, z).project(camera);
  if (V.z > 1) return null;
  return {
    x: (V.x * 0.5 + 0.5) * window.innerWidth,
    y: (-V.y * 0.5 + 0.5) * window.innerHeight,
  };
}

export function createDiegeticUi() {
  const wrap = document.createElement('div');
  wrap.id = 'vd-diegetic'; // E2E/Playwright 定位用
  wrap.style.cssText = 'position:fixed;inset:0;z-index:16;pointer-events:none;display:none';
  document.body.appendChild(wrap);

  const title = document.createElement('div');
  title.style.cssText = [
    'position:absolute', 'top:88px', 'left:50%', 'transform:translateX(-50%)',
    'font-size:14px', 'font-weight:800', 'color:#ffd166', 'letter-spacing:1px',
    'text-shadow:0 2px 8px rgba(0,0,0,0.8)', 'white-space:nowrap',
  ].join(';');
  wrap.appendChild(title);

  let mode = null; // 'set' | 'dig' | null
  let spots = []; // [{ el, item }]
  let digOwnId = null; // L 手勢列的錨定者（自己）
  let curKey = null; // 決策窗識別（flightId）——換窗才重建 DOM；同窗逐幀只換 item 參照
                     //（選項的 aim/座標每幀重算，tap 時讀最新 item＝與舊面板逐幀重繪同語意）

  function clearSpots() {
    for (const sp of spots) sp.el.remove();
    spots = [];
  }

  function baseSpot() {
    const b = document.createElement('button');
    b.style.cssText = [
      'position:absolute', 'transform:translate(-50%,-50%)', 'pointer-events:auto',
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:2px',
      'background:none', 'border:none', 'cursor:pointer', 'padding:0',
      'touch-action:manipulation', '-webkit-tap-highlight-color:transparent',
    ].join(';');
    return b;
  }

  // S 熱點：光圈（身上亮起）＋玩法標籤。
  // 07-28 追修（Sawmah：「每次都在找是哪個球員」「二次球不明顯」）：
  // loud＝金圈放大＋「🙋 這球給我！」徽章（揮手的人一眼可辨，不必找背號）；
  // dump＝膠囊按鈕（畫面下緣中央的明確動作鈕，不再是小光圈）
  function buildSetSpot(item, onPick) {
    const b = baseSpot();
    if (item.kind === 'dump') {
      const pill = document.createElement('div');
      pill.style.cssText = [
        'height:46px', 'padding:0 22px', 'border-radius:23px', 'display:flex',
        'align-items:center', 'font-size:16px', 'font-weight:900', 'letter-spacing:1px',
        'color:#ffd166', 'background:rgba(14,12,4,0.85)', 'border:2.5px solid #ffd166',
        'box-shadow:0 0 18px #ffd16655', 'white-space:nowrap',
      ].join(';');
      pill.textContent = '🎯 二次球';
      b.appendChild(pill);
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); onPick(item); });
      return b;
    }
    const ringColor = item.loud ? '#ffd166' : item.hesitant ? '#5a6a8a' : '#6ee7ff';
    const size = item.loud ? 76 : 58;
    if (item.loud) {
      const badge = document.createElement('div');
      badge.style.cssText = [
        'font-size:13px', 'font-weight:900', 'white-space:nowrap', 'color:#0a0c14',
        'background:#ffd166', 'border-radius:10px', 'padding:2px 10px',
        'box-shadow:0 0 14px #ffd166aa', 'letter-spacing:1px',
      ].join(';');
      badge.textContent = '🙋 這球給我！';
      b.appendChild(badge);
    }
    const ring = document.createElement('div');
    ring.style.cssText = [
      `width:${size}px`, `height:${size}px`, 'border-radius:50%',
      `border:${item.loud ? 4 : 3}px solid ${ringColor}`,
      `box-shadow:0 0 ${item.loud ? 26 : 18}px ${ringColor}${item.loud ? '99' : '66'}, inset 0 0 14px ${ringColor}33`,
      item.loud ? 'animation:vd-diegetic-pulse 0.9s ease-in-out infinite' : '',
    ].join(';');
    const tag = document.createElement('div');
    tag.style.cssText = [
      'font-size:12px', 'font-weight:800', 'white-space:nowrap',
      `color:${item.hesitant ? '#9fb0cc' : item.loud ? '#ffd166' : '#eef2fa'}`,
      'text-shadow:0 1px 6px rgba(0,0,0,0.9)', 'padding:1px 6px',
      'background:rgba(8,10,18,0.55)', 'border-radius:8px',
    ].join(';');
    tag.textContent = item.hesitant ? `${item.label}·猶豫` : item.label;
    b.appendChild(ring);
    b.appendChild(tag);
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); onPick(item); });
    return b;
  }

  // L 手勢鈕：手勢字形＋配套小字；建議＝金圈◎（1 秒自動照建議在 matchLoop 原地）
  function buildDigSpot(item, onPick) {
    const b = baseSpot();
    const hand = document.createElement('div');
    hand.style.cssText = [
      'width:52px', 'height:52px', 'border-radius:50%', 'font-size:26px',
      'display:flex', 'align-items:center', 'justify-content:center',
      `border:3px solid ${item.suggested ? '#ffd166' : '#3a4a6a'}`,
      'background:rgba(8,10,18,0.72)',
      item.suggested ? 'box-shadow:0 0 16px #ffd16688' : '',
    ].join(';');
    hand.textContent = item.glyph;
    const tag = document.createElement('div');
    tag.style.cssText = [
      'font-size:11px', 'font-weight:700', 'white-space:nowrap',
      `color:${item.suggested ? '#ffd166' : '#9fb0cc'}`,
      'text-shadow:0 1px 6px rgba(0,0,0,0.9)',
    ].join(';');
    tag.textContent = item.suggested ? `${item.label}◎` : item.label;
    b.appendChild(hand);
    b.appendChild(tag);
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); onPick(item); });
    return b;
  }

  // 脈動動畫（一次性注入樣式表）
  if (!document.getElementById('vd-diegetic-style')) {
    const st = document.createElement('style');
    st.id = 'vd-diegetic-style';
    st.textContent = '@keyframes vd-diegetic-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.18);opacity:0.75}}';
    document.head.appendChild(st);
  }

  return {
    isOpen() { return mode !== null; },
    activeMode() { return mode; },
    showSet(items, titleText, onPick, key = null) {
      title.textContent = titleText;
      if (mode === 'set' && curKey === key && spots.length === items.length) {
        for (let i = 0; i < items.length; i += 1) spots[i].item = items[i]; // 逐幀換最新選項
        return;
      }
      clearSpots();
      mode = 'set';
      curKey = key;
      for (const item of items) {
        const sp = { el: null, item };
        sp.el = buildSetSpot(item, () => onPick(sp.item));
        wrap.appendChild(sp.el);
        spots.push(sp);
      }
      wrap.style.display = 'block';
    },
    showDig(items, titleText, onPick, ownId = null, key = null) {
      digOwnId = ownId;
      title.textContent = titleText;
      if (mode === 'dig' && curKey === key && spots.length === items.length) {
        for (let i = 0; i < items.length; i += 1) spots[i].item = items[i];
        return;
      }
      clearSpots();
      mode = 'dig';
      curKey = key;
      for (const item of items) {
        const sp = { el: null, item };
        sp.el = buildDigSpot(item, () => onPick(sp.item));
        wrap.appendChild(sp.el);
        spots.push(sp);
      }
      wrap.style.display = 'block';
    },
    hide() {
      if (mode === null) return;
      mode = null;
      curKey = null;
      clearSpots();
      wrap.style.display = 'none';
    },
    // 每幀重錨（rAF 驅動、與 sim 脫鉤）：S＝各熱點跟各自隊友（胸口高度）、
    // 二次球跟自己；L＝手勢列排在自己背後腰位（鏡頭在背後＝「背後的手」入鏡語意）
    sync(game, camera) {
      if (mode === null) return;
      if (mode === 'set') {
        for (const sp of spots) {
          // 二次球＝自己出手：sset 鏡頭就架在 S 身位——自己的投影常在鏡外，
          // 固定錨畫面下緣中央（「我自己」在鏡頭這一側的 diegetic 語意）
          if (sp.item.kind === 'dump') {
            sp.el.style.display = 'flex';
            sp.el.style.left = `${window.innerWidth / 2}px`;
            sp.el.style.top = `${window.innerHeight - 110}px`;
            continue;
          }
          const a = game.actors[sp.item.pid];
          const p = game.players[sp.item.pid];
          if (!a || !p) { sp.el.style.display = 'none'; continue; }
          const h = (p.height?.current ?? 1.85) * 0.72;
          const pt = project(camera, a.x, h, a.z);
          if (!pt) { sp.el.style.display = 'none'; continue; }
          // 07-27 追修保底：投影落在畫面外＝夾回螢幕邊緣——選項永遠點得到
          //（「看不到所有攻擊手」的第二道防線；第一道＝sset 鏡位全員入鏡）
          const pad = 36;
          sp.el.style.display = 'flex';
          sp.el.style.left = `${Math.min(Math.max(pt.x, pad), window.innerWidth - pad)}px`;
          sp.el.style.top = `${Math.min(Math.max(pt.y, pad + 18), window.innerHeight - pad)}px`;
        }
        return;
      }
      // dig：手勢列錨在自己（L）背後腰位——鏡頭在背後＝「背後的手」入鏡語意
      const a = digOwnId ? game.actors[digOwnId] : null;
      const center = a ? project(camera, a.x, 0.65, a.z) : null;
      const cx = center?.x ?? window.innerWidth / 2;
      const cy = center?.y ?? window.innerHeight - 150;
      spots.forEach((sp, i) => {
        const off = (i - (spots.length - 1) / 2) * 78;
        sp.el.style.display = 'flex';
        sp.el.style.left = `${cx + off}px`;
        sp.el.style.top = `${Math.min(cy, window.innerHeight - 96)}px`;
      });
    },
    dispose() {
      clearSpots();
      wrap.remove();
    },
  };
}
