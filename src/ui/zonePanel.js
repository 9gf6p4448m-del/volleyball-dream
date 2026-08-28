// 通用決策面板：攻擊選區／發球選區／攔網選線共用（同一套點按語言）
// items: [{ key, label, color?('green'|'red'|'neutral') }]；點選回呼 onChoose(item)
// 大作感卷 批4：按鈕改「黑底金框」同語彙換皮——底盤統一黑（theme.js 的 COLORS.bg2），照 it.color
// 分類的語意保留成邊框/文字強調色（原本是整塊填色），不然攻擊分區的安全/危險色碼、
// 發球飄浮/跳躍分類、W3 S 分配的低 trust「猶豫」變暗這些既有資訊會被本批全部併成金色、
// 玩家瞬間分不出按鈕差異。neutral（預設分類）沒有特別語意，直接吃金色（凍結檔範圍
// item 3 舉例的「黑底金框」）。
import { COLORS as THEME, FONTS } from './theme.js';

const ZONE_ACCENTS = {
  green: '#7ee787',
  red: '#ff6b6b',
  orange: '#ffb04c', // 跳躍發球
  cyan: '#6ee7ff',  // 飄浮發球
  neutral: THEME.gold,
  dim: THEME.textDim,   // W3 S 分配：低 trust 快攻「猶豫」（可選但變暗）
};

export function createZonePanel() {
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:calc(env(safe-area-inset-bottom, 0px) + 90px)',
    'transform:translateX(-50%)', 'z-index:18', 'display:none',
    'gap:10px', 'flex-wrap:wrap', 'justify-content:center', 'max-width:92vw',
  ].join(';');
  document.body.appendChild(wrap);

  const title = document.createElement('div');
  title.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:calc(env(safe-area-inset-bottom, 0px) + 168px)',
    'transform:translateX(-50%)', 'z-index:18', 'display:none',
    `color:${THEME.gold}`, `font-family:${FONTS.zh}`, 'font-size:18px', 'font-weight:700',
    'text-shadow:0 2px 6px rgba(0,0,0,0.7)', 'pointer-events:none',
  ].join(';');
  document.body.appendChild(title);

  // 進場動畫 keyframes（注入一次）：按鈕自下滑入、逐顆錯開。大作感卷 批4：
  // skewX(-8deg) 斜切要跟著烤進 from/to 兩個 keyframe——CSS animation 的 fill:both
  // 在動畫跑完後仍持續覆寫 transform，只在 inline cssText 上寫死斜切會在動畫播完後被蓋掉
  if (!document.getElementById('vd-pop-style')) {
    const st = document.createElement('style');
    st.id = 'vd-pop-style';
    st.textContent = '@keyframes vd-pop{from{opacity:0;'
      + 'transform:skewX(-8deg) translateY(16px) scale(0.92)}'
      + 'to{opacity:1;transform:skewX(-8deg) translateY(0) scale(1)}}';
    document.head.appendChild(st);
  }

  let btns = [];
  let shownKey = '';

  // onFake（可選）：按住 A 鈕滑到 B 鈕放開＝假動作（onFake(A,B)）；原地點放＝onChoose(A)
  // ——攻擊面板的「看A打B」手勢；未傳 onFake 的面板維持點下即選（發球/攔網要快）
  function rebuild(items, onChoose, onFake) {
    for (const b of btns) b.remove();
    btns = items.map((it, i) => {
      const b = document.createElement('button');
      b.textContent = it.label;
      b.dataset.zoneKey = it.key;
      const accent = ZONE_ACCENTS[it.color ?? 'neutral'];
      b.style.cssText = [
        'min-width:74px', 'height:60px', 'border-radius:4px',
        `border:2px solid ${accent}`,
        `background:${THEME.bg2}e6`,
        `color:${accent}`, 'font-size:17px', 'font-weight:800',
        `font-family:${FONTS.zh}`, 'touch-action:none', 'cursor:pointer',
        'box-shadow:0 2px 10px rgba(0,0,0,0.4)',
        `animation:vd-pop 0.2s ease-out ${i * 0.04}s both`,
      ].join(';');
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (!onFake) {
          onChoose(it);
          hide();
          return;
        }
        e.preventDefault();
        b.style.transform = 'scale(1.12)';
        const up = (ev) => {
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          b.style.transform = '';
          const el = document.elementFromPoint(ev.clientX, ev.clientY);
          const endKey = el?.closest?.('button')?.dataset?.zoneKey ?? null;
          const target = endKey && endKey !== it.key
            ? items.find((z) => z.key === endKey) : null;
          if (target) onFake(it, target);
          else onChoose(it);
          hide();
        };
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
      wrap.appendChild(b);
      return b;
    });
  }

  // layout（07-27 試玩回饋）：'low'＝貼底模式——MB 攔網第一視角要讀穿網對面，
  // 預設 bottom 90px 在手機橫向（螢幕高僅 ~390 CSS px）會落在畫面正中擋視線；
  // 貼底＝拇指位＋視線區淨空。其他面板維持預設（零擾動）
  function show(titleText, items, onChoose, onFake = null, layout = 'default') {
    const low = layout === 'low';
    const base = low ? 22 : 90;
    wrap.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${base}px)`;
    title.textContent = titleText;
    const key = titleText + items.map((i) => i.key + (i.color ?? '')).join(',');
    if (key !== shownKey) {
      shownKey = key;
      rebuild(items, onChoose, onFake);
    }
    wrap.style.display = 'flex';
    title.style.display = 'block';
    // 08-28 表單審視：標題抬到按鈕群「實際高度」之上——原本定死 +168px，
    // 按鈕一疊到第二排就把標題蓋掉（發球面板 7 顆在手機橫式必疊兩排，試玩截圖抓到）
    title.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${base + wrap.offsetHeight + 10}px)`;
  }
  function hide() {
    wrap.style.display = 'none';
    title.style.display = 'none';
    shownKey = '';
  }

  return { show, hide };
}
