// 大作感二卷 批6（2026-08-30）：獎盃房頁——以「獎盃」為單位的展演（與 📊 生涯數據
// 的逐屆數據表互斥分工：那頁看數字，這頁看榮耀）。獨立模組 overlay 範式照
// howToPlay.js：z-index 37、stopPropagation 防背景誤觸、明鈕關閉。只讀存檔。
import { collectTrophies } from '../career/trophies.js';

export function showTrophyRoom(store) {
  const trophies = collectTrophies({ seasons: store.loadSeasonArchive?.() ?? [] });
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:37', 'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:safe center', 'gap:16px', 'overflow-y:auto',
    'background:rgba(10,12,18,0.94)', 'color:#eef2fa', 'font-family:system-ui,sans-serif',
    'padding:calc(env(safe-area-inset-top, 0px) + 28px) 20px 40px',
  ].join(';');
  overlay.addEventListener('pointerdown', (e) => e.stopPropagation());

  const title = document.createElement('div');
  title.style.cssText = 'font-size:26px;font-weight:900;letter-spacing:6px;color:#ffd166;';
  title.textContent = '🏆 獎盃房';
  overlay.appendChild(title);

  if (!trophies.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:14px;opacity:0.75;line-height:1.9;text-align:center;max-width:min(340px,88vw);';
    empty.textContent = '獎盃櫃還空著——全國賽、聯賽與季後賽的每一座冠軍，拿下的那天都會收進這裡。';
    overlay.appendChild(empty);
  } else {
    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-width:min(560px,94vw);';
    for (const t of trophies) {
      const card = document.createElement('div');
      card.className = 'vd-chip-gold';
      card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;width:150px;padding:16px 10px;border-radius:10px;text-align:center;';
      const icon = document.createElement('div');
      icon.style.cssText = 'font-size:34px;';
      icon.textContent = t.icon;
      const name = document.createElement('div');
      name.style.cssText = 'font-size:15px;font-weight:800;color:#ffd166;';
      name.textContent = t.title;
      const sub = document.createElement('div');
      sub.style.cssText = 'font-size:11px;opacity:0.75;';
      sub.textContent = t.sub;
      card.append(icon, name, sub);
      grid.appendChild(card);
    }
    overlay.appendChild(grid);
    const count = document.createElement('div');
    count.style.cssText = 'font-size:12px;opacity:0.6;';
    count.textContent = `共 ${trophies.length} 座`;
    overlay.appendChild(count);
  }

  const close = document.createElement('button');
  close.className = 'vd-btn-gold';
  close.style.cssText = 'min-width:180px;height:46px;border-radius:4px;font-size:15px;cursor:pointer;touch-action:manipulation;letter-spacing:2px;';
  close.textContent = '關閉';
  close.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    overlay.remove();
  });
  overlay.appendChild(close);
  document.body.appendChild(overlay);
}
