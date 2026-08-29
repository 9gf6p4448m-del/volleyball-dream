// H4 擊球音效：三種音色可辨即達標——爆裂（扣/發）、悶短（攔網/輕吊）、脆彈（墊/舉）
// WebAudio 程序合成，零外部音檔；首次手勢解鎖 AudioContext（瀏覽器政策）
//
// 大作感卷 批1（2026-08-28）：混合架構——取樣優先、合成 fallback。音檔本身還沒進
// repo（見 sfxSamples.js 檔頭），所以本檔在「取樣全缺」下必須維持原本的純合成行為，
// 這是驗收 A1b 的核心。所有輸出改接 `busGain`（音量匯流排，音效總音量／靜音鈕的
// 唯一把手）而不是直連 `ctx.destination`——原本 12 處 `.connect(ctx.destination)`
// 機械改成 `.connect(busGain)`，合成路徑一格邏輯都沒變。
import { loadSamples, playSample } from './sfxSamples.js';
import { get as getAudioPrefs, subscribe as subscribeAudioPrefs } from './audioPrefs.js';
import { detectSqueak } from './squeakDetect.js';
import { SIM_DT } from '../sim/constants.js';

export function createSfx() {
  let ctx = null;
  let busGain = null; // 音效總音量匯流排：ctx 建立時同時建、prefs 變更即時反映在這裡

  let crowdStarted = false;
  let crowdSampleSrc = null; // crowd_loop 取樣成功時的 loop source（供 stop/重建）

  function applyBusGain() {
    if (!busGain) return;
    const prefs = getAudioPrefs();
    busGain.gain.value = prefs.muted ? 0 : Math.max(0, Math.min(1, prefs.sfx));
  }
  // 每個 createSfx() 實例各自訂閱一次；dispose() 時取消，避免舊實例（上一場比賽）
  // 的訂閱在下一場繼續存活、對著已關閉的 ctx 空寫
  const unsubscribePrefs = subscribeAudioPrefs(applyBusGain);

  // ★ 音效失敗＝這一下沒聲音，永遠不准往外丟 ★（2026-08-28 Sawmah 真機事故）
  // iOS 的音訊硬體會偶發起不來（剛講完電話/LINE 語音後常見）：new AudioContext 或
  // resume() 丟「InvalidStateError: Failed to start the audio device」。本函式綁在
  // **每一次 pointerdown** 上，裸奔的 rejection 會被 main.js 的 unhandledrejection
  // 接去畫全螢幕 fatal 簾幕——遊戲明明還在跑，畫面卻整個被錯誤蓋死。
  // 失敗不鎖死：ctx 留著/歸零，下一次手勢自然重試（iOS 的暫時狀態會自己好）。
  function ensure() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        busGain = ctx.createGain();
        busGain.connect(ctx.destination);
        applyBusGain();
        loadSamples(ctx); // 背景載入取樣（永不 reject）；載完前後 onEvents 都能正常運作
      }
      if (ctx.state === 'suspended') ctx.resume()?.catch(() => {});
      if (!crowdStarted) startCrowd();
      return ctx;
    } catch {
      ctx = null;
      busGain = null;
      return null; // 這一下靜音；下一次手勢重試
    }
  }
  window.addEventListener('pointerdown', ensure);

  // 球場氛圍：低音量群眾雜訊底（loop），得分時 cheer 疊上去。
  // 批1：取樣優先——第一次手勢當下 crowd_loop 多半還沒 fetch 完（非同步），所以
  // 永遠先墊合成布朗噪音，loadSamples 完成後若真的拿到取樣才換上、把合成噪音停掉；
  // crowdGain 這個音量把手全程不變，setCrowdLevel／gaspCheer 兩處屏息邏輯零改動。
  let crowdSynthSrc = null;
  function startCrowdSynth() {
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
    src.connect(lp).connect(crowdGain);
    src.start();
    crowdSynthSrc = src;
  }
  function startCrowd() {
    crowdStarted = true; // 失敗也標記：氛圍底不重試（單次性），擊球音效照走 ensure
    try {
      crowdGain = ctx.createGain();
      crowdGain.gain.value = 0.05;
      crowdGain.connect(busGain);
      startCrowdSynth();
      loadSamples(ctx).then(() => {
        if (crowdSampleSrc || !crowdGain) return; // 已換過取樣／這個 sfx 實例已 dispose
        const src = playSample(ctx, crowdGain, 'crowd_loop', { loop: true });
        if (src) {
          crowdSampleSrc = src;
          try { crowdSynthSrc?.stop(); } catch { /* 已停或環境不支援＝無事可做 */ }
          crowdSynthSrc = null;
        }
      });
    } catch { /* 氛圍底起不來＝安靜的場館，比賽照打 */ }
  }

  // 群眾音量目標（局點發球前屏息＝壓低；得分後回常態）——平滑過渡
  let crowdGain = null;
  // 關鍵分聲浪爆炸（A3）：DEAD_BALL 期間短暫蓋過 matchLoop 逐幀灌進來的常態值——
  // matchLoop 每幀都呼叫 setCrowdLevel，若不設這道窗，爆炸的 setTargetAtTime
  // 下一幀（~16ms 後）就會被常態值的排程蓋掉，整個爆炸聽不出來
  let crowdExplodeUntil = 0;
  function setCrowdLevel(level) {
    if (!ctx || !crowdGain) return;
    if (ctx.currentTime < crowdExplodeUntil) return; // 爆炸視窗內：忽略常態呼叫，讓爆炸撐滿視窗
    crowdGain.gain.setTargetAtTime(level, ctx.currentTime, 0.5);
  }

  // 大作感二卷 批1：長時間群眾聲浪（奪冠慶祝）——衝高並鎖住爆炸視窗 seconds 秒，
  // 讓 matchLoop 逐幀灌進來的常態值整段被忽略（同 keyPoint 爆炸的既有機制，只是窗更長）
  function crowdSurge(seconds = 1.5, level = 0.14) {
    if (!ensure() || !crowdGain) return;
    const t = ctx.currentTime;
    crowdGain.gain.setTargetAtTime(level, t, 0.1);
    crowdExplodeUntil = t + seconds;
  }

  // W4(P4) Q10 主客場氛圍：{A:mul, B:mul} 得分歡呼偏向（null＝中立）——
  // 關鍵戰館打宿敵＝對手得分聲量放大、我方縮（「他們的主場」的聽覺事實）
  let crowdBias = null;
  function setCrowdBias(bias) {
    crowdBias = bias;
  }

  // 裁判哨音：高頻方波＋顫音（比賽儀式感——死球長哨、發球前短哨）
  // 批1：取樣優先——單一 'whistle' 取樣涵蓋長短兩種呼叫（真實哨音不像合成版能調
  // durMs 拉長縮短，取樣播出來就是原長度；沒取樣才退回下面原本按 durMs 合成的版本）
  // delaySec：08-29 試玩回饋「得分突兀」——死球三層改成落地→哨音→歡呼的真實時序，
  // 哨音由呼叫端（onEvents DEAD_BALL）延後排程；其他呼叫端（發球短哨）不帶延遲、零改動
  function whistle(durMs = 450, delaySec = 0) {
    if (!ensure()) return;
    if (playSample(ctx, busGain, 'whistle', { delay: delaySec })) return;
    const t = ctx.currentTime + delaySec;
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
    osc.connect(g).connect(busGain);
    osc.start(t);
    trill.start(t);
    osc.stop(t + dur);
    trill.stop(t + dur);
  }

  // 得分歡呼：帶通雜訊湧起再退（~1.2 秒）；scale＝強度（長 rally 歡呼加倍）。
  // 批1：取樣優先——scale≥1.4 或呼叫端明講 forceBig（onEvents 的 DEAD_BALL keyPoint
  // 用這個把手，不吃 scale 門檻，因為 biasMul 可能把 scale 壓低到 1.4 以下）才用
  // cheer_big，其餘用 cheer；沒取樣才退回下面原本的合成版本（scale 仍決定其強度）
  // delaySec/fadeInSec：得分歡呼「湧起」而非同刻拍臉（08-29 試玩回饋）；合成路徑
  // 本來就有 0.18s 起漲包絡，只需平移起點；取樣路徑把淡入交給 playSample 的 fadeIn
  function cheer(scale = 1, { forceBig = false, delaySec = 0, fadeInSec = 0 } = {}) {
    if (!ensure()) return;
    const big = forceBig || scale >= 1.4;
    if (playSample(ctx, busGain, big ? 'cheer_big' : 'cheer', {
      gain: Math.min(scale, 1.6), delay: delaySec, fadeIn: fadeInSec,
    })) return;
    const t = ctx.currentTime + delaySec;
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
    src.connect(bp).connect(g).connect(busGain);
    src.start(t);
  }

  // W3(P4) L 魚躍演出（附錄 A4①）：觀眾倒抽氣→爆歡呼——群眾底噪瞬間收斂（屏息）、
  // 0.45 秒後大聲量 cheer、底噪回常態。合成範式同 cheer（零音檔架構）
  function gaspCheer() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    if (crowdGain) {
      crowdGain.gain.setTargetAtTime(0.006, t, 0.05); // 屏息
      crowdGain.gain.setTargetAtTime(0.05, t + 0.9, 0.4); // 回常態
    }
    const len = Math.floor(ctx.sampleRate * 1.6);
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
    g.gain.setValueAtTime(0.001, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.62);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
    src.connect(bp).connect(g).connect(busGain);
    src.start(t + 0.45);
  }

  // 觸網音：中低頻悶「啪」帶餘震（配網面波動視覺）。批1：取樣優先（'net'）
  function netHit(power = 1) {
    if (!ensure()) return;
    if (playSample(ctx, busGain, 'net', { gain: Math.min(power, 1) })) return;
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
    noise.connect(bp).connect(g).connect(busGain);
    noise.start(t);
  }

  // 地板落球：深沉短擊（死球的「結束感」）。批1：取樣優先（'floor'）
  function floorThud() {
    if (!ensure()) return;
    if (playSample(ctx, busGain, 'floor')) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g).connect(busGain);
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
    noise.connect(ng).connect(busGain);
    noise.start(t);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.45 * gainScale, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(og).connect(busGain);
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
    osc.connect(lp).connect(g).connect(busGain);
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
    osc.connect(g).connect(busGain);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  // 丙3（接球微回饋批2，NJ-4）：完美接球「亮」音——短促雙泛音，疊在基底觸球音
  // 之上（不是取代）。單一來源＝sim 外露的 e.perfect（receivePerfectMul／t≥0.95
  // 同一判定），這裡不再另算門檻。
  function perfectChime() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    for (const [freq, delay, gain] of [[1400, 0, 0.16], [2100, 0.03, 0.1]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delay);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(gain, t + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.22);
      osc.connect(g).connect(busGain);
      osc.start(t + delay);
      osc.stop(t + delay + 0.24);
    }
  }

  // 鞋底摩擦「唧」：急停/急變向時的排球館空間感底味，音量刻意壓低不搶戲；
  // 音高每次隨機微變，12 人同場才不會像同一顆按鍵音。
  // ★取樣專屬、無合成 fallback★（08-29 二修）：第一版的合成 chirp（鋸齒波過高 Q
  // 帶通）聽起來是電子「叮」不是鞋聲，得分瞬間急煞群聚連發成「叮叮叮」被打槍。
  // 合成鞋聲是聽感題、無法離線驗證——沒放真實 squeak.m4a 之前這裡就是靜默，
  // 這是刻意行為不是漏接（與其他音效「合成 fallback 保底」的慣例相反）
  function squeak(intensity = 1) {
    if (!ctx || !busGain) return; // 只在已解鎖的 ctx 上響；不為底味音效硬 ensure
    const rate = 0.9 + Math.random() * 0.25;
    playSample(ctx, busGain, 'squeak', { gain: 0.45 + 0.35 * intensity, rate });
  }

  // 逐幀觀測 actors 位移（matchLoop 每 render 幀呼叫；只讀 x/z/px/pz，不碰 sim）。
  // 同一 sim tick 只判一次；每人冷卻＋全場最小間隔雙重節流——rally 中 12 人都在跑，
  // 不節流會變蟲鳴。門檻依 08-29 探針收緊：原值（stop 同門檻 1.6/冷卻 0.5/間隔 0.12）
  // 實測 21.9 次/rally、死球前 0.6s 連發 2.6 響＝叮叮叮的元凶；收緊後 7.9 次/rally、死球前 0.79 響
  let squeakLastTick = -1;
  let squeakGlobalGateT = 0;
  const squeakMemo = new Map(); // actorId -> { dx, dz, coolUntil }
  const SQUEAK_SPEED_THRESH = 1.6 * SIM_DT; // 變向門檻 m/s → m/tick【試玩必調】
  const SQUEAK_STOP_THRESH = 3.8 * SIM_DT; // 急煞門檻：全速衝刺才算【試玩必調】
  function onCourtMotion(game) {
    if (!ctx || !busGain) return;
    if (!game?.actors || game.phase !== 'rally') {
      squeakMemo.clear(); // 死球/發球站定期間歸零，下一段 rally 重新起算
      return;
    }
    if (game.tick === squeakLastTick) return;
    squeakLastTick = game.tick;
    const t = ctx.currentTime;
    for (const [id, a] of Object.entries(game.actors)) {
      const cur = { dx: a.x - a.px, dz: a.z - a.pz };
      const memo = squeakMemo.get(id);
      if (memo) {
        if (t >= memo.coolUntil && t >= squeakGlobalGateT) {
          const hit = detectSqueak(memo, cur, {
            speedThresh: SQUEAK_SPEED_THRESH, stopSpeedThresh: SQUEAK_STOP_THRESH,
          });
          if (hit) {
            memo.coolUntil = t + 1.5; // 【試玩必調】同一人冷卻
            squeakGlobalGateT = t + 0.5; // 【試玩必調】全場最小間隔
            squeak(hit.intensity);
          }
        }
        memo.dx = cur.dx;
        memo.dz = cur.dz;
      } else {
        squeakMemo.set(id, { dx: cur.dx, dz: cur.dz, coolUntil: 0 });
      }
    }
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
    osc.connect(g).connect(busGain);
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

  // 批1：SERVE／BLOCK_TOUCH／TOUCH 三種事件共用 crack/thud/ping 這幾個合成 primitive，
  // 同一個 primitive 在不同事件語意下對到不同取樣名稱（例如 thud 同時是 spike_soft／
  // block／receive 三種語意的 fallback），所以取樣攔截寫在呼叫端（onEvents）而不是
  // 塞進 primitive 本體——whistle/floorThud/netHit/cheer 是單一語意，攔截寫在函式內部
  // （見上）。ensure() 已經冪等，這裡不吃額外的手勢限制。
  function tryPlay(name, opts) {
    return playSample(ensure(), busGain, name, opts);
  }

  // 比賽事件 → 音色映射（閉眼能分：扣=爆裂、攔/輕吊=悶短、墊/舉=脆彈）
  return {
    // 4.6：重演舞台是第二個消費者，離開時要能把觀眾底噪一起收掉
    //（賽中整場都在響，沒有收的需求；回放關掉後還響就是殘留）
    dispose() {
      unsubscribePrefs();
      try { ctx?.close(); } catch { /* 已關或不支援＝無事可做 */ }
      ctx = null;
      busGain = null;
      crowdStarted = false;
      crowdGain = null;
      crowdSampleSrc = null;
      crowdSynthSrc = null;
      crowdExplodeUntil = 0;
      squeakMemo.clear();
      squeakLastTick = -1;
      squeakGlobalGateT = 0;
    },
    whistle,
    crowdSurge, // 大作感二卷 批1：奪冠慶祝長聲浪
    onCourtMotion, // 08-29：鞋底摩擦聲——matchLoop 逐幀餵 game，純觀測 actors 位移
    setHeartbeat,
    setCrowdLevel,
    setCrowdBias, // W4(P4) Q10 主客場氛圍：得分歡呼按隊伍偏向縮放（宿敵客場感）
    netHit,
    cheer, // W7 C3②：COMEBACK_SPARK 觀眾爆聲外呼——matchLoop 直接加碼一次（獨立於 DEAD_BALL 自動歡呼）
    gaspCheer, // W3(P4) L 魚躍演出：倒抽氣→爆歡呼
    onEvents(events, opts = {}) {
      for (const e of events) {
        if (e.type === 'SERVE') {
          if (!tryPlay('spike_mid')) crack(0.7);
        } else if (e.type === 'BLOCK_TOUCH') {
          if (!tryPlay('block')) thud();
        } else if (e.type === 'DEAD_BALL') {
          // 音層：落地悶擊 → 哨音 → 歡呼（長 rally 歡呼加倍）；floorThud/whistle
          // 內部自己會先嘗試取樣，這裡不必另外攔截。
          // 08-29 試玩回饋「得分音效突兀」：原本三層同一瞬間齊發＝音牆拍臉。改成
          // 真實球場時序——球落地、裁判反應半拍才鳴哨、觀眾再晚半拍湧起歡呼（帶淡入）
          const WHISTLE_DELAY = 0.22; // 【試玩必調】哨音延後秒數
          const CHEER_DELAY = 0.42; // 【試玩必調】歡呼延後秒數
          const CHEER_FADE = 0.25; // 【試玩必調】歡呼淡入秒數
          floorThud();
          whistle(480, WHISTLE_DELAY);
          // W4(P4) Q10：應援偏向——得分隊決定歡呼聲量倍率（同批事件裡撈 SCORE）
          const scorer = events.find((s2) => s2.type === 'SCORE')?.team ?? null;
          const biasMul = scorer && crowdBias ? (crowdBias[scorer] ?? 1) : 1;
          // A3 關鍵分聲浪爆炸：keyPoint 時歡呼再放大＋群眾底噪短暫衝高
          const keyPoint = !!opts.keyPoint;
          let scale = Math.min(1 + (opts.rallyFlights ?? 0) / 10, 1.8) * biasMul;
          if (keyPoint) scale *= 1.6; // 【試玩必調】關鍵分加碼倍率
          // forceBig：biasMul 壓低 scale 時仍保底 cheer_big
          cheer(scale, { forceBig: keyPoint, delaySec: CHEER_DELAY, fadeInSec: CHEER_FADE });
          if (keyPoint && ctx && crowdGain) {
            const t = ctx.currentTime;
            // 爆炸排程對齊延後的歡呼；視窗仍從死球起算 1.5s（含延遲前段——那段也要
            // 擋住 matchLoop 的常態呼叫，否則排程好的爆炸會被搶先蓋掉）
            crowdGain.gain.setTargetAtTime(0.14, t + CHEER_DELAY, 0.05); // 爆炸值【試玩必調】
            crowdExplodeUntil = t + 1.5; // 視窗內 setCrowdLevel 忽略常態值，撐滿爆炸
          }
        } else if (e.type === 'TOUCH') {
          if (e.kind === 'spike') {
            const hard = (e.power ?? 1) >= 0.45; // 重扣＝爆裂／輕吊＝悶短
            if (!tryPlay(hard ? 'spike_hard' : 'spike_soft')) {
              if (hard) crack(1); else thud();
            }
          } else if (e.kind === 'receive' && e.touches === 3) {
            if (!tryPlay('receive')) thud(); // 第三擊安全球
          } else if (e.kind === 'set') {
            if (!tryPlay('set_touch')) ping(760);
          } else if (!tryPlay('receive')) ping(600);
          // 丙3：完美接球疊層音（receive／dive 皆涵蓋——原本只有 receive 才響，
          // 且用 power≥0.95 另算門檻；現在直接讀 sim 外露的單一來源欄位）
          if (e.perfect) perfectChime();
        }
      }
    },
  };
}
