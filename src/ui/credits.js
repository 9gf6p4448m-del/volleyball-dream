// 大作感二卷 批7（2026-08-30）：遊戲內製作名單——CC-BY 素材的標注義務正式落在
// 玩家看得到的地方（與 public/audio/ATTRIBUTION.md 同一份事實，改素材兩處都要動）。
// overlay 範式照 howToPlay.js。
const SECTIONS = [
  {
    head: '音效素材（CC-BY，依授權須標注）',
    rows: [
      '得分歡呼／關鍵分聲浪 — "Free Crowd Cheering Sounds" by Gregor Quendel（OpenGameArt），CC-BY 4.0',
    ],
  },
  {
    head: '音樂',
    rows: [
      '主題曲三首與比賽氛圍層 — Google Flow Music（Lyria）生成',
      '製作人：Sawmah（2026-08-30）',
    ],
  },
  {
    head: '音效素材（CC0）',
    rows: [
      '擊球／落地系 — Kenney「Impact Sounds」(kenney.nl)',
      '觸網 — ezduzziteh（OpenGameArt）',
      '群眾底噪 — starninjas（OpenGameArt）',
      '鞋底摩擦 — shakaharu（Freesound #88502）',
    ],
  },
  {
    head: '引擎與技術',
    rows: ['three.js — 3D 渲染', 'Vite ＋ PWA — 建置與離線', '模擬核心：自研決定論 60Hz sim'],
  },
  {
    head: '特別感謝',
    rows: ['Sawmah — 監製・首席試玩員・所有拍板', 'Claude — 程式與演出'],
  },
];

export function showCredits() {
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:37', 'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:safe center', 'gap:14px', 'overflow-y:auto',
    'background:rgba(10,12,18,0.95)', 'color:#eef2fa', 'font-family:system-ui,sans-serif',
    'padding:calc(env(safe-area-inset-top, 0px) + 28px) 20px 40px', 'text-align:center',
  ].join(';');
  overlay.addEventListener('pointerdown', (e) => e.stopPropagation());

  const title = document.createElement('div');
  title.style.cssText = 'font-size:24px;font-weight:900;letter-spacing:6px;color:#ffd166;';
  title.textContent = '排球夢';
  overlay.appendChild(title);
  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:11px;letter-spacing:0.5em;text-indent:0.5em;opacity:0.7;margin-top:-8px;';
  sub.textContent = 'VOLLEYBALL DREAM — 製作名單';
  overlay.appendChild(sub);

  for (const sec of SECTIONS) {
    const head = document.createElement('div');
    head.style.cssText = 'font-size:13px;font-weight:800;color:#ffd166;letter-spacing:2px;margin-top:10px;';
    head.textContent = sec.head;
    overlay.appendChild(head);
    for (const row of sec.rows) {
      const line = document.createElement('div');
      line.style.cssText = 'font-size:12px;opacity:0.85;line-height:1.7;max-width:min(420px,90vw);';
      line.textContent = row;
      overlay.appendChild(line);
    }
  }

  const close = document.createElement('button');
  close.className = 'vd-btn-gold';
  close.style.cssText = 'min-width:180px;height:46px;border-radius:4px;font-size:15px;cursor:pointer;touch-action:manipulation;letter-spacing:2px;margin-top:14px;';
  close.textContent = '關閉';
  close.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    overlay.remove();
  });
  overlay.appendChild(close);
  document.body.appendChild(overlay);
}
