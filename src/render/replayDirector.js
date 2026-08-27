// Phase 4.6 §4 — 重演自動導播（純函式、零 three／DOM：node 可測）。
//
// 硬要求＝**導播決定論**：同一顆球每次觀看，鏡頭腳本逐格一致。切鏡點由 Intent 流的
// 事件型別驅動（SERVE／TOUCH／BLOCK_TOUCH／DEAD_BALL），不吃時間隨機、不吃牆鐘抖動。
// 理由入卷：回放要能當敘事素材反覆使用（宿敵典藏尤其），鏡頭必須是「被導演過的」
// 而非每次不同；且與 sim 決定論同一條紀律。
//
// 鏡位語彙全部取自既有資產（cameraRig 的 third／sset／sig 三構圖＋sig 'line'），
// **不新增第五模板**（沿 4.5B 矩陣紀律）。導播只決定「何時、錨在誰、看哪一顆」。
import { SIM_DT } from '../sim/constants.js';
import { createRallyPlayer } from '../app/rallyTape.js';

export const SLOW_SPEED = 0.35;   // 決定性一拍～落點：重用既有慢動作倍率語彙
export const OPEN_SPEED = 2.5;    // 發球前佈陣：快帶過（等哨的 tick 不是戲）
export const OPEN_MAX_STEPS = 90; // 開場最多播 1.5 秒；更早的佈陣直接快轉不計時
// B/C 債清批（2026-08-27）A1：touch out／關鍵得分重播視角太低——可視時長幾乎全在
// 兩個低鏡位（sig oh y=1.75、sig line y=0.5 貼地）。修法＝只在慢動作兩鏡位宣告
// 抬高量，由消費端（matchLoop/replayStage）套用；cameraRig 現場招牌演出構圖零改動。
// 【試玩必調】兩顆值可各自微調，互不牽動。
export const DECISIVE_LIFT = 0.9; // 決定性一拍（sig oh/mb/opp）抬高量（m）
export const LINE_LIFT = 1.1;     // 落點收尾（sig line，貼地機位）抬高量（m）——貼地鏡位更低，抬更多
const ROLE_SIG = { outside: 'oh', middle: 'mb', opposite: 'opp' };

// 掃一次卷，收「每一步發生了什麼」——導播與退化文字卡共用這份事實
function scanTape(tape) {
  const player = createRallyPlayer(tape);
  const touches = [];   // [{ step, playerId, team, kind, type }]
  let dead = null;      // { step, at, reason }
  let step = 0;
  while (!player.done) {
    const events = player.step();
    for (const e of events) {
      if (e.type === 'SERVE') touches.push({ step, playerId: e.playerId, team: e.team, kind: 'serve', type: e.type });
      else if (e.type === 'TOUCH') touches.push({ step, playerId: e.playerId, team: e.team, kind: e.kind ?? 'bump', type: e.type });
      else if (e.type === 'BLOCK_TOUCH') touches.push({ step, playerId: e.playerId, team: e.team, kind: 'block', type: e.type });
      else if (e.type === 'DEAD_BALL' && !dead) dead = { step, at: e.at ?? null, reason: e.reason ?? null };
    }
    step += 1;
  }
  return { touches, dead, total: step };
}

// 決定性一拍＝最後一次攻擊性觸球（扣/吊/攔）。之前的攻擊不給特寫——
// 鏡頭噪音是 4.5B 砍「rally 終結鏡頭」時就立過的規矩，一顆球只有一個高潮。
function decisiveOf(touches) {
  for (let i = touches.length - 1; i >= 0; i -= 1) {
    const t = touches[i];
    if (t.kind === 'spike' || t.kind === 'tip' || t.kind === 'block') return t;
  }
  return touches[touches.length - 1] ?? null;
}

function otherTeam(team) { return team === 'A' ? 'B' : 'A'; }

// 鏡頭腳本：[{ step, cam }]，cam＝餵給 cameraRig 的宣告
//   { mode:'third'|'sset'|'sig', anchorId, sig?:{kind, focusId, mateId?, at?} }
export function buildDirectorScript(tape) {
  const { touches, dead, total } = scanTape(tape);
  const players = tape.snapshot?.players ?? {};
  const rotations = tape.snapshot?.match?.rotations ?? { A: [], B: [] };
  const anchorFor = (team) => rotations[team]?.[0] ?? Object.keys(players)[0] ?? null;
  const serve = touches.find((t) => t.kind === 'serve') ?? touches[0] ?? null;
  const decisive = decisiveOf(touches);

  const shots = [];
  const push = (step, cam) => {
    const prev = shots[shots.length - 1];
    if (prev && prev.step === step) shots[shots.length - 1] = { step, cam };
    else if (!prev || JSON.stringify(prev.cam) !== JSON.stringify(cam)) shots.push({ step, cam });
  };

  // ① 發球：發球員背後中景
  push(0, { mode: 'third', anchorId: serve?.playerId ?? anchorFor('A') });

  // ②③④ 每次擊球即切鏡，錨在「下一個碰到球的人」——跟球的鏡頭語言＝
  // 提前站到球要去的地方（導播預知未來＝決定論腳本的特權）
  for (let i = 0; i < touches.length; i += 1) {
    const cur = touches[i];
    const next = touches[i + 1];
    if (!next || (decisive && cur.step >= decisive.step)) break;
    if (next.step === decisive?.step) {
      // 決定性一拍：sig 三構圖依攻擊者位置擇一，錨在對面（鏡頭語意＝隔網看他）
      const sig = ROLE_SIG[players[next.playerId]?.currentRole] ?? 'oh';
      push(cur.step, {
        mode: 'sig',
        anchorId: anchorFor(otherTeam(next.team)),
        sig: { kind: sig, focusId: next.playerId, mateId: null },
        pullback: 2.6, // 重演拉遠（舞台層沿視線後退；見 replayStage 註解）
        slow: true,
        lift: DECISIVE_LIFT, // A1：sig oh/mb/opp 貼身低機位太低，重演抬高視角
      });
    } else if (next.kind === 'set') {
      // 舉球：sset 語彙的半場回望（網前定點回望自家半場）
      push(cur.step, { mode: 'sset', anchorId: next.playerId });
    } else {
      push(cur.step, { mode: 'third', anchorId: next.playerId });
    }
  }

  // ⑤ 落點收尾：貼地低機位，重用第四道招牌演出「邊線是我的」構圖
  if (dead?.at) {
    push(dead.step, {
      mode: 'sig',
      anchorId: decisive ? anchorFor(decisive.team) : anchorFor('A'),
      sig: { kind: 'line', at: { x: dead.at.x, z: dead.at.z } },
      pullback: 1.2,
      slow: true,
      lift: LINE_LIFT, // A1：sig line 貼地 y=0.5，重演幾乎全程停在這個低機位
    });
  }

  // 分段速率（決定論；慢動作＝重用既有 0.35 倍率語彙，不吃牆鐘）
  const slowFrom = shots.find((s) => s.cam.slow)?.step ?? total;
  const openTo = Math.min(serve?.step ?? 0, total);
  const skipTo = Math.max(0, openTo - OPEN_MAX_STEPS); // 更早的佈陣直接快轉、不計時
  const segments = [];
  const seg = (from, to, speed) => { if (to > from) segments.push({ from, to, speed }); };
  seg(skipTo, openTo, OPEN_SPEED);
  seg(openTo, slowFrom, 1);
  seg(slowFrom, total, SLOW_SPEED);
  if (!segments.length) seg(0, total, 1);
  const totalMs = segments.reduce((ms, s) => ms + ((s.to - s.from) * SIM_DT * 1000) / s.speed, 0);

  return { shots, segments, skipTo, totalSteps: total, totalMs, touches, dead };
}

// 演出時間（0..1）→ 目標 step（決定論查表；t=1 恆為最後一步＝跳過與播完同終態）。
// Exact 版回浮點：整數部分推 sim、小數部分當插值 alpha（慢動作下才不會走成階梯）
export function stepAtExact(script, t) {
  const clamped = Math.max(0, Math.min(1, t));
  // t=1 直接回終步：逐段累減 ms 會有浮點殘差（實測某分段 ms=5285.7142857142835 vs
  // segMs=5285.714285714285，差 −1.8e-12），使最後一段的 `ms >= segMs` 為 false，
  // 於是走進插值分支回 510.99999999999994 → floor 後少一步。違反本函式上方自己
  // 寫明的契約「t=1 恆為最後一步＝跳過與播完同終態」（4.6 教訓同源）。
  // 07-29 D2 輪由測試抓到——分段長度變了才踩得到，屬既有潛伏 bug 非本輪回歸
  if (clamped >= 1) return script.totalSteps;
  let ms = clamped * script.totalMs;
  for (const s of script.segments) {
    const segMs = ((s.to - s.from) * SIM_DT * 1000) / s.speed;
    if (ms >= segMs) { ms -= segMs; continue; }
    return Math.min(script.totalSteps, s.from + (ms / segMs) * (s.to - s.from));
  }
  return script.totalSteps;
}

export function stepAt(script, t) {
  return Math.floor(stepAtExact(script, t));
}

// stepAtExact 的反函式：某一步落在演出時間軸的哪個 0..1（決定論查表）。
// 賽中即時 highlight（批3 HR-6）要「從決定性一拍起播」，而腳本只給得出 step——
// 分段速率把 sim 時間扭曲過（開場 2.5 倍快轉、決定性一拍後 0.35 倍慢動作），
// 拿 step/totalSteps 當 t 會差到好幾秒，必須逐段換算。
export function tAtStep(script, step) {
  if (!(script?.totalMs > 0)) return 0;
  let ms = 0;
  for (const s of script.segments) {
    if (step >= s.to) { ms += ((s.to - s.from) * SIM_DT * 1000) / s.speed; continue; }
    if (step > s.from) ms += ((step - s.from) * SIM_DT * 1000) / s.speed;
    break;
  }
  return Math.max(0, Math.min(1, ms / script.totalMs));
}

// 目前該用哪個鏡位（最後一個 step ≤ 目標步的 shot）
export function shotAt(script, step) {
  let cur = script.shots[0] ?? null;
  for (const s of script.shots) {
    if (s.step <= step) cur = s;
    else break;
  }
  return cur;
}

// §2-3 退化路徑的文字紀錄卡：誰發球→誰舉→誰扣→結果（不留空白、不報錯）。
// nameOf(playerId) 由呼叫端提供（名冊在 career 層）；缺名回退球員 id。
export function narrateTape(tape, nameOf = (id) => id) {
  const { touches, dead } = scanTape(tape);
  const serve = touches.find((t) => t.kind === 'serve');
  const decisive = decisiveOf(touches);
  const set = [...touches].reverse().find((t) => t.kind === 'set' && (!decisive || t.step <= decisive.step));
  const lines = [];
  if (serve) lines.push(`${nameOf(serve.playerId)} 發球`);
  if (set) lines.push(`${nameOf(set.playerId)} 舉球`);
  if (decisive) {
    const verb = decisive.kind === 'block' ? '攔網' : decisive.kind === 'tip' ? '輕吊' : '扣球';
    lines.push(`${nameOf(decisive.playerId)} ${verb}`);
  }
  if (dead) {
    const at = dead.at ? `（落點 ${dead.at.x.toFixed(1)}, ${dead.at.z.toFixed(1)}）` : '';
    lines.push(`球落地${at}`);
  }
  return lines;
}
