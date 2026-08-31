// 候補池卷 P2-2：賽後採訪字卡（純演出）——MVP 演出後接一張記者 Q&A，
// 可跳過、播畢/跳過都落回既有 overlay 流程（殊途同歸零改動）。
// 台詞決定論抽選（比分+種子 hash）＝同一場重看同一句，不吃 rng。

const LINES = [
  { q: '今天這場勝利的關鍵是什麼？', a: '全隊的串聯。球不落地，我們就還有機會。' },
  { q: '關鍵分那一球，當下在想什麼？', a: '什麼都沒想，手比腦快。' },
  { q: '對手給了很大的壓力？', a: '對，但壓力是我們自己選的——想贏就得扛。' },
  { q: '下一場的目標？', a: '同一件事：把球送到地板上，比對面多一次。' },
  { q: '想對支持你們的人說什麼？', a: '聲音我們都聽到了。下一場也拜託了。' },
  { q: '今天的表現給自己打幾分？', a: '教練說滿分是留給下一場的。' },
];

export function pickInterviewLine(seedish) {
  const i = Math.abs((seedish | 0) * 2654435761 % 2147483647) % LINES.length;
  return LINES[i];
}

const STYLE_ID = 'vd-interview-style';
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
@keyframes vdIvIn { 0% { opacity: 0; transform: translateY(18px); }
  100% { opacity: 1; transform: translateY(0); } }
.vd-iv-wrap { position: fixed; inset: 0; z-index: 23; display: flex; flex-direction: column;
  align-items: center; justify-content: flex-end; padding-bottom: 12vh; pointer-events: none;
  font-family: var(--vd-font-zh, system-ui, sans-serif); }
.vd-iv-card { max-width: min(520px, 86vw); padding: 16px 22px; animation: vdIvIn 0.5s ease-out both; }
.vd-iv-tag { color: var(--vd-gold, #ffd166); font-size: 11px; letter-spacing: 0.3em;
  text-indent: 0.3em; font-weight: 700; margin-bottom: 6px; }
.vd-iv-q { color: var(--vd-text-dim, #9aa3b5); font-size: clamp(13px, 3.2vw, 15px); }
.vd-iv-a { color: var(--vd-text, #eef2fa); font-size: clamp(15px, 4vw, 19px); font-weight: 700;
  margin-top: 8px; line-height: 1.5; animation: vdIvIn 0.5s 0.5s ease-out both; }
.vd-iv-hint { color: var(--vd-text-dim, #9aa3b5); font-size: 12px; margin-top: 10px; opacity: 0.7; }
`;
  document.head.appendChild(st);
}

// name＝受訪者（MVP）；回傳 { el, dispose }（與冠軍字卡同約；點擊穿透給跳過通道）
export function showInterviewCard(name, line) {
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'vd-iv-wrap';
  el.innerHTML = `
    <div class="vd-iv-card vd-panel-gold">
      <div class="vd-iv-tag">🎤 賽後採訪</div>
      <div class="vd-iv-q">記者：「${line.q}」</div>
      <div class="vd-iv-a">${name}：「${line.a}」</div>
      <div class="vd-iv-hint">點擊任意處繼續</div>
    </div>`;
  document.body.appendChild(el);
  return { el, dispose() { el.remove(); } };
}
