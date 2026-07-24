// 浮動字卡（Perfect!、回放中…）：主角個人字卡帶，畫面下緣彈出、上浮淡出
// W6.1 疊排（拍板 07-24 Q1-P1）：原版無佇列——連續字卡釘同座標完全重合疊字；
// 改為新卡進場時把在場舊卡各上推一格（transition 順勢補間），越舊越高、各自倒數消失
// W7.1 四輪 #1（上下分區拍板）：從螢幕中段移到下緣帶——上方泡泡（scoreboard）留給轉播層，
// 下緣留給「你」的個人回饋。基準位 24%（其餘 UI 都用固定 px，唯獨這個跟 zonePanel 決策鈕
// 一樣得在矮視窗守住淨空——用 max() 在矮螢幕上換算成固定 px 下限，蓋過 zonePanel 標題
// （bottom+168，見 zonePanel.js）與底部對話框（teachDialog/coachOptionDialog bottom+26、
// comebackBtn bottom+18），這幾個字卡活躍時 sim 多半已凍結、真正撞上的機率低，但淨空仍留好。
const STACK_STEP = 48; // 舊卡上推格距（px）
const BASE_BOTTOM = 'max(24%, calc(env(safe-area-inset-bottom, 0px) + 210px))';
export function createFloatText() {
  const live = []; // 在場字卡 [{ el, lift }]
  return {
    show(text, color = '#60ffa0', durMs = 900) {
      for (const c of live) {
        c.lift += STACK_STEP;
        c.el.style.transform = `translateX(-50%) translateY(${-60 - c.lift}px)`;
      }
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = [
        'position:fixed', 'left:50%', `bottom:${BASE_BOTTOM}`, 'z-index:20',
        'transform:translateX(-50%)',
        `color:${color}`, 'font-family:system-ui,sans-serif',
        'font-size:34px', 'font-weight:800', 'letter-spacing:2px',
        'text-shadow:0 2px 8px rgba(0,0,0,0.6)',
        'pointer-events:none', 'user-select:none',
        'transition:transform 0.8s ease-out, opacity 0.8s ease-out',
        'opacity:1',
      ].join(';');
      document.body.appendChild(el);
      const card = { el, lift: 0 };
      live.push(card);
      requestAnimationFrame(() => {
        el.style.transform = `translateX(-50%) translateY(${-60 - card.lift}px)`;
        el.style.opacity = '0';
      });
      setTimeout(() => {
        el.remove();
        const i = live.indexOf(card);
        if (i >= 0) live.splice(i, 1);
      }, durMs);
    },
  };
}
