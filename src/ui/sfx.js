// H4 擊球音效：三種音色可辨即達標——爆裂（扣/發）、悶短（攔網/輕吊）、脆彈（墊/舉）
// WebAudio 程序合成，零外部音檔；首次手勢解鎖 AudioContext（瀏覽器政策）
export function createSfx() {
  let ctx = null;

  let crowdStarted = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (!crowdStarted) startCrowd();
    return ctx;
  }
  window.addEventListener('pointerdown', ensure);

  // 球場氛圍：低音量群眾雜訊底（loop），得分時 cheer 疊上去
  function startCrowd() {
    crowdStarted = true;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let acc = 0;
    for (let i = 0; i < len; i += 1) {
      acc = acc * 0.98 + (Math.random() * 2 - 1) * 0.02; // 布朗雜訊≈人聲嗡嗡底
      d[i] = acc;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(lp).connect(g).connect(ctx.destination);
    src.start();
    crowdGain = g;
  }

  // 群眾音量目標（局點發球前屏息＝壓低；得分後回常態）——平滑過渡
  let crowdGain = null;
  function setCrowdLevel(level) {
    if (!ctx || !crowdGain) return;
    crowdGain.gain.setTargetAtTime(level, ctx.currentTime, 0.5);
  }

  // 裁判哨音：高頻方波＋顫音（比賽儀式感——死球長哨、發球前短哨）
  function whistle(durMs = 450) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const dur = durMs / 1000;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 2650;
    const trill = ctx.createOscillator(); // 顫音（豆哨滾珠感）
    trill.frequency.value = 55;
    const trillGain = ctx.createGain();
    trillGain.gain.value = 320;
    trill.connect(trillGain).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.setValueAtTime(0.16, t + dur - 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    trill.start(t);
    osc.stop(t + dur);
    trill.stop(t + dur);
  }

  // 得分歡呼：帶通雜訊湧起再退（~1.2 秒）；scale＝強度（長 rally 歡呼加倍）
  function cheer(scale = 1) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * (1.1 + 0.35 * scale));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * scale, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.05 + 0.35 * scale);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
  }

  // 觸網音：中低頻悶「啪」帶餘震（配網面波動視覺）
  function netHit(power = 1) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 320;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3 * Math.min(power, 1), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    noise.connect(bp).connect(g).connect(ctx.destination);
    noise.start(t);
  }

  // 地板落球：深沉短擊（死球的「結束感」）
  function floorThud() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  }

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

  // 局點心跳：低頻 lub-dub 循環（張力時開），音量克制不搶戲
  let heartTimer = null;
  function thump(t, freq, gain) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  }
  function setHeartbeat(on) {
    if (on && !heartTimer) {
      heartTimer = setInterval(() => {
        if (!ensure()) return;
        const t = ctx.currentTime;
        thump(t, 62, 0.12);        // lub
        thump(t + 0.22, 55, 0.08); // dub
      }, 1150);
    } else if (!on && heartTimer) {
      clearInterval(heartTimer);
      heartTimer = null;
    }
  }

  // 比賽事件 → 音色映射（閉眼能分：扣=爆裂、攔/輕吊=悶短、墊/舉=脆彈）
  return {
    whistle,
    setHeartbeat,
    setCrowdLevel,
    netHit,
    cheer, // W7 C3②：COMEBACK_SPARK 觀眾爆聲外呼——matchLoop 直接加碼一次（獨立於 DEAD_BALL 自動歡呼）
    onEvents(events, opts = {}) {
      for (const e of events) {
        if (e.type === 'SERVE') crack(0.7);
        else if (e.type === 'BLOCK_TOUCH') thud();
        else if (e.type === 'DEAD_BALL') {
          // 音層：落地悶擊 → 哨音 → 歡呼（長 rally 歡呼加倍）
          floorThud();
          whistle(480);
          cheer(Math.min(1 + (opts.rallyFlights ?? 0) / 10, 1.8));
        }
        else if (e.type === 'TOUCH') {
          if (e.kind === 'spike') {
            if ((e.power ?? 1) < 0.45) thud(); // 輕吊＝悶短
            else crack(1);                     // 重扣＝爆裂
          } else if (e.kind === 'receive' && (e.power ?? 0) >= 0.95) ping(980); // Perfect！
          else if (e.kind === 'receive' && e.touches === 3) thud(); // 第三擊安全球
          else if (e.kind === 'set') ping(760);
          else ping(600);
        }
      }
    },
  };
}
