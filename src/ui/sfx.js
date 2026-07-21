// H4 擊球音效：三種音色可辨即達標——爆裂（扣/發）、悶短（攔網/輕吊）、脆彈（墊/舉）
// WebAudio 程序合成，零外部音檔；首次手勢解鎖 AudioContext（瀏覽器政策）
export function createSfx() {
  let ctx = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  window.addEventListener('pointerdown', ensure);

  // 爆裂：白噪音爆點＋低頻搥擊
  function crack(gainScale = 1) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, 2600, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    }
    noise.buffer = buf;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5 * gainScale, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    noise.connect(ng).connect(ctx.destination);
    noise.start(t);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.45 * gainScale, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(og).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  // 悶短：低頻短音、低通悶住
  function thud() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(210, t);
    osc.frequency.exponentialRampToValueAtTime(95, t + 0.07);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(lp).connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  // 脆彈：三角波短促上揚 ping
  function ping(pitch = 640) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, t);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.35, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  // 比賽事件 → 音色映射（閉眼能分：扣=爆裂、攔/輕吊=悶短、墊/舉=脆彈）
  return {
    onEvents(events) {
      for (const e of events) {
        if (e.type === 'SERVE') crack(0.7);
        else if (e.type === 'BLOCK_TOUCH') thud();
        else if (e.type === 'TOUCH') {
          if (e.kind === 'spike') crack(1);
          else if (e.kind === 'receive' && e.touches === 3) thud(); // 第三擊安全球＝輕吊
          else if (e.kind === 'set') ping(760);
          else ping(600);
        }
      }
    },
  };
}
