// Phase 4.6 §5 — 典藏牆入口卡＋重演檢視器（生涯結算流程內）。
//
// 現況是一行點不開的靜態文字；本檔把它換成四格典藏牆：冠軍點＋天鷹三屆掛點場。
// 顯示哲學沿 W8：**空槽不出現、四槽全空＝整張卡不出現**（不給玩家看空欄）。
// 不自動插播（拍板）——畢業結算已經很長，強制插播＝把儀式變成關卡；典藏牆的
// 情感邏輯是「你自己回去翻」。播完回結算流程原位，不打斷後續節拍。
import { isPlayableTape } from '../app/rallyTape.js';
import { narrateTape } from '../render/replayDirector.js';

const COLOR = {
  text: '#eef2fa', dim: '#9fb0cc', gold: '#ffd166', red: '#ff8a8a', cyan: '#6ee7ff',
  card: 'rgba(18,24,40,0.85)',
};

function el(tag, css, text) {
  const node = document.createElement(tag);
  node.style.cssText = css.join(';');
  if (text !== undefined) node.textContent = text;
  return node;
}

// 槽 → 顯示條目（純函式：空槽不出現、順序固定＝冠軍點在前、宿敵依屆數）。
// 標籤例：「冠軍點」「第 1 屆・決賽・敗」
export function vaultEntries(vault) {
  const out = [];
  const champ = vault?.champion;
  if (champ && isPlayableTape(champ.tape)) {
    out.push({
      key: 'champion',
      title: '冠軍點',
      sub: `第 ${champ.seasonIndex} 屆・決賽`,
      won: true,
      entry: champ,
    });
  }
  for (const k of Object.keys(vault?.rival ?? {}).sort()) {
    const r = vault.rival[k];
    if (!r || !isPlayableTape(r.tape)) continue;
    out.push({
      key: `rival-${k}`,
      title: `第 ${r.seasonIndex} 屆・${r.label || '天鷹戰'}`,
      sub: r.won ? '勝' : '敗',
      won: !!r.won,
      entry: r,
    });
  }
  return out;
}

// 入口卡：四格並排。無可播內容＝回 null（整張卡不出現）
export function createVaultCard(vault, onOpen) {
  const items = vaultEntries(vault);
  if (!items.length) return null;
  const card = el('div', [
    'background:rgba(18,24,40,0.85)', 'border-radius:12px', 'border:1px solid #2c3a58',
    'padding:10px 14px', 'width:min(340px, 94vw)', 'text-align:left',
  ]);
  card.appendChild(el('div', [
    'font-size:13px', 'font-weight:800', `color:${COLOR.gold}`, 'margin-bottom:6px',
  ], '🎬 關鍵球典藏'));
  const grid = el('div', ['display:flex', 'flex-wrap:wrap', 'gap:6px']);
  for (const it of items) {
    const cell = el('button', [
      'flex:1 1 46%', 'min-width:132px', 'padding:8px 8px 7px', 'border-radius:9px',
      `border:1px solid ${it.key === 'champion' ? COLOR.gold : '#2c3a58'}`,
      'background:linear-gradient(180deg, rgba(10,14,24,0.95), rgba(22,30,50,0.95))',
      'cursor:pointer', 'touch-action:manipulation', 'text-align:left', 'display:block',
    ]);
    // 靜幀＝膠捲標籤（§5-3 裁量：不為縮圖另建第二套 renderer——見結案快照）
    const strip = el('div', [
      'height:26px', 'border-radius:4px', 'margin-bottom:5px',
      `background:repeating-linear-gradient(90deg, #0a0f1c 0 8px, ${it.key === 'champion' ? '#3b3316' : '#16233c'} 8px 16px)`,
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-size:13px',
    ], it.key === 'champion' ? '🏆' : '🎞');
    cell.appendChild(strip);
    cell.appendChild(el('div', [
      'font-size:12px', 'font-weight:800', `color:${COLOR.text}`,
    ], it.title));
    cell.appendChild(el('div', [
      'font-size:11px', `color:${it.won ? COLOR.cyan : COLOR.red}`,
    ], it.sub));
    cell.addEventListener('pointerdown', (e) => { e.stopPropagation(); onOpen(it); });
    grid.appendChild(cell);
  }
  card.appendChild(grid);
  card.appendChild(el('div', [
    'font-size:11px', `color:${COLOR.dim}`, 'margin-top:6px',
  ], '點一格重看那顆球'));
  return card;
}

// 重演檢視器 overlay。WebGL 失敗／reduced-motion＝文字紀錄卡（不留空白、不報錯）。
// createStage＝可注入（測試替身）；預設動態載入重演舞台（three 只在真要播時才進場）
export function openReplayViewer({
  item, reduceMotion = false, createStage = null, onClose = null, doc = document,
} = {}) {
  const tape = item.entry.tape;
  const overlay = el('div', [
    'position:fixed', 'inset:0', 'z-index:40', 'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:center', 'gap:10px',
    'background:rgba(3,5,10,0.96)', 'padding:18px 12px',
  ]);
  overlay.appendChild(el('div', [
    'font-size:13px', 'font-weight:800', `color:${COLOR.gold}`, 'letter-spacing:2px',
  ], `${item.title}・${item.sub}`));
  // 07-28 試玩（Sawmah：「不夠實境」）：一顆球要有脈絡才有份量——這是幾比幾的球。
  // 資料就在快照裡（發球前的比分），轉播一定會標。玩家恆 A 隊
  const sc = tape.snapshot?.match?.score;
  if (sc && Number.isFinite(sc.A) && Number.isFinite(sc.B)) {
    overlay.appendChild(el('div', [
      'font-size:22px', 'font-weight:900', `color:${COLOR.text}`, 'letter-spacing:3px',
      'font-variant-numeric:tabular-nums',
    ], `${sc.A} – ${sc.B}`));
    overlay.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'margin-top:-4px'],
      item.entry.won ? '這一球拿下了' : '這一球輸掉了'));
  }
  const body = el('div', ['width:min(640px, 96vw)', 'min-height:60px']);
  overlay.appendChild(body);
  const bar = el('div', ['display:flex', 'gap:8px', 'align-items:center']);
  overlay.appendChild(bar);

  let stage = null;
  const close = () => {
    stage?.dispose();   // 離開典藏牆即拆：第二套 renderer/材質/幾何不得殘留
    stage = null;
    overlay.remove();
    onClose?.();
  };

  const ctrl = (label, onTap) => {
    const b = el('button', [
      'height:40px', 'padding:0 16px', 'border-radius:20px', 'border:1px solid #2c3a58',
      'background:rgba(30,40,64,0.9)', `color:${COLOR.text}`, 'font-size:14px',
      'cursor:pointer', 'touch-action:manipulation',
    ], label);
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); onTap(b); });
    return b;
  };

  // 退化路徑（§2-3）：不建舞台，改給該球的文字紀錄卡
  const degrade = (why) => {
    const nameOf = (id) => tape.snapshot?.players?.[id]?.name ?? id;
    const lines = narrateTape(tape, nameOf);
    const cardEl = el('div', [
      'background:rgba(18,24,40,0.85)', 'border-radius:12px', 'border:1px solid #2c3a58',
      'padding:12px 16px', 'line-height:1.9', 'font-size:13px', `color:${COLOR.text}`,
    ]);
    for (const line of lines) cardEl.appendChild(el('div', [], `・${line}`));
    cardEl.appendChild(el('div', ['font-size:11px', `color:${COLOR.dim}`, 'margin-top:6px'], why));
    body.replaceChildren(cardEl);
    bar.replaceChildren(ctrl('關閉', close));
  };

  (async () => {
    if (reduceMotion) { degrade('（已依系統設定關閉動態演出——這球的紀錄）'); return; }
    try {
      const make = createStage
        ?? (await import('../render/replayStage.js')).createReplayStage;
      stage = await make({ tape, onDone: () => { playBtn.textContent = '↺ 重播'; } });
      body.replaceChildren(stage.el);
      stage.play();
    } catch {
      degrade('（這台裝置的 3D 舞台開不起來——這球的紀錄）');
      return;
    }
    bar.replaceChildren(
      playBtn,
      ctrl('⏭ 跳過', () => { stage?.skip(); playBtn.textContent = '↺ 重播'; }),
      ctrl('關閉', close),
    );
  })();

  // 07-28 試玩抓到：跳過（或播完）之後點「↺ 重播」沒反應——play() 被 done 擋住。
  // 播完/跳過＝重來一次整卷；播放中＝暫停；暫停中＝續播
  const playBtn = ctrl('⏸ 暫停', (b) => {
    if (!stage) return;
    if (stage.done) { stage.restart(); stage.play(); b.textContent = '⏸ 暫停'; return; }
    if (stage.playing) { stage.pause(); b.textContent = '▶ 播放'; }
    else { stage.play(); b.textContent = '⏸ 暫停'; }
  });

  doc.body.appendChild(overlay);
  return { el: overlay, close, get stage() { return stage; } };
}
