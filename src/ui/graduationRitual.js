// Phase 4 W3 — 畢業儀式演出（儀式演出框架第二個消費者；工單 §7／乙5 拍板提進 W3）
// 演出構成：暗場 → 聚光亮起 → 畢業者幾何模型（球衣站姿）→ 具名台詞逐句（點擊推進）→
// 聚光收暗離場 → 下一位畢業者。多人畢業＝逐位聚光（每人自己的光池與台詞）。
// 防炸原則同 heightRitual：WebGL 建場失敗＝退化為台詞卡（無模型、流程照走）；
// prefers-reduced-motion＝跳過補間直接定格。
// 呼叫端（careerScreen）：opening 先走 dialogPlay → 本儀式吃 perGraduate →
// aceLines/closing 回 dialogPlay——三段同一事實源（events.graduationCeremonySegments）。
import { createRitualStage, tween } from '../render/ritualStage.js';

function el(tag, styles, text) {
  const node = document.createElement(tag);
  node.style.cssText = styles.join(';');
  if (text !== undefined) node.textContent = text;
  return node;
}

function reduceMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

// perGraduate＝graduationCeremonySegments().perGraduate（[{ member, lines }]）
export function showGraduationRitual({ perGraduate = [], onDone }) {
  if (!perGraduate.length) { onDone(); return; }
  const motionOff = reduceMotion();
  const dur = (ms) => (motionOff ? 0 : ms);

  const overlay = el('div', [
    'position:fixed', 'inset:0', 'z-index:39', 'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:safe center', 'gap:14px', 'overflow-y:auto',
    'background:rgba(2,4,9,0.96)', 'opacity:0', 'transition:opacity 0.35s ease',
    'padding:calc(env(safe-area-inset-top, 0px) + 20px) 16px 32px',
    'font-family:system-ui,sans-serif', 'user-select:none',
  ]);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });

  overlay.appendChild(el('div', [
    'font-size:13px', 'color:#9fb0cc', 'letter-spacing:6px',
  ], '畢 業 送 別'));

  const stageW = Math.min(300, Math.floor(window.innerWidth * 0.8));
  const stageSlot = el('div', [
    'display:flex', 'align-items:center', 'justify-content:center',
    `width:${stageW}px`, 'min-height:320px',
  ]);
  overlay.appendChild(stageSlot);

  const nameEl = el('div', [
    'font-size:22px', 'font-weight:900', 'color:#eef2fa', 'letter-spacing:4px', 'min-height:28px',
  ], '');
  overlay.appendChild(nameEl);

  const speakerEl = el('div', [
    'font-size:13px', 'font-weight:800', 'color:#ffd166', 'min-height:18px', 'letter-spacing:1px',
  ], '');
  const textEl = el('div', [
    'font-size:15px', 'color:#dfe7f5', 'line-height:1.7', 'min-height:52px',
    'max-width:min(420px, 88vw)', 'text-align:center',
  ], '');
  overlay.appendChild(speakerEl);
  overlay.appendChild(textEl);
  const hint = el('div', ['font-size:11px', 'color:#9fb0cc'], '▼ 點擊繼續');
  overlay.appendChild(hint);

  let stage = null;
  let gi = 0; // 第幾位畢業者
  let li = 0; // 該畢業者第幾句
  let transitioning = true; // 聚光補間中不吃點擊（防搶點）

  const disposeStage = () => {
    if (stage) { stage.dispose(); stage.el.remove(); stage = null; }
  };

  const paintLine = () => {
    const line = perGraduate[gi].lines[li];
    speakerEl.textContent = line.speaker;
    textEl.textContent = line.text;
  };

  // 進場一位畢業者：建模型（失敗＝台詞卡退化）→ 聚光亮起 → 首句
  const enterGraduate = async () => {
    transitioning = true;
    const { member } = perGraduate[gi];
    nameEl.textContent = member.name ?? '';
    disposeStage();
    try {
      stage = createRitualStage({
        playerId: member.id ?? 'A0',
        teamId: 'A',
        role: member.role ?? 'outside',
        heightM: member.height ?? 1.85,
        width: stageW,
        height: 320,
      });
      stageSlot.appendChild(stage.el);
    } catch { stage = null; }
    li = 0;
    paintLine();
    await tween(dur(700), (t) => { if (stage) stage.setSpot(t); });
    if (stage) stage.setSpot(1);
    transitioning = false;
  };

  // 一位講完：聚光收暗（離場）→ 下一位或收尾
  const exitGraduate = async () => {
    transitioning = true;
    speakerEl.textContent = '';
    textEl.textContent = '';
    await tween(dur(450), (t) => { if (stage) stage.setSpot(1 - t); });
    gi += 1;
    if (gi < perGraduate.length) {
      await enterGraduate();
    } else {
      overlay.remove();
      disposeStage();
      onDone();
    }
  };

  overlay.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (transitioning) return;
    li += 1;
    if (li < perGraduate[gi].lines.length) { paintLine(); return; }
    exitGraduate();
  });

  enterGraduate();
}
