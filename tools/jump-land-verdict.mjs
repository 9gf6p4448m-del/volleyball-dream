#!/usr/bin/env node
// 跳躍前飄卷 J11「落地不瞬降」判定（docs/kickoffs/jump-drift-acceptance.md 修訂 R5）。
//
// 用法：node tools/jump-land-verdict.mjs <measure-raw.json> [--main] [--label x] [--json out.json]
//   <measure-raw.json>＝tools/jump-drift-measure.mjs 寫出的 *-raw.json（走真實 matchView／geoAnimator
//   鏈路逐幀錄下的 root.position.y；本檔不重算任何動畫公式，只讀錄到的數字）。
//
// 定義：
//   episode＝量測治具的跳躍段（animator.probe().jumpY>0 那一幀起跳，jumpY 回 0 那一幀＝落地幀）。
//   窗口＝起跳幀 → 落地幀後累計 dt ≤0.2 s 的最後一幀（落地後錄不滿 0.2 s 的，取到錄到的最後一幀）。
//   單幀下降＝ry[i−1]−ry[i]（i 為窗口內第 2 幀起）；條件：每幀 ≤0.08 m。
//   分類（R5 列的六類，另外其餘跳躍也照算、單列）：
//     jumpServe  發球 style=power
//     back       扣球觸球 routeKind=pipe/dball 或攻擊者在後排
//     setterAtk  舉球員第二觸攻擊（修訂 R4）：扣球觸球那一幀 rally.touches=2 且 routeKind=null
//     spike      其餘扣球
//     jumpSet    跳舉（set 觸球帶 jumpSet）
//     block      攔網
//     其他       decoy（誘餌起跳）、other:<起跳幀序列>
//   得分後重新佈陣（sim 單幀瞬移 >0.3 m）落在窗口內的，照判、另標 teleport。
//   精華重演：兩個比賽幀之間若播了重演（治具 frame.nl 計數增加），畫面上這兩幀並不相鄰
//   （中間是另一段畫面），不算「單幀」下降；逐筆列在 [重演剪接]，不靜默丟棄。
import { readFileSync, writeFileSync } from 'node:fs';

const LIMIT = 0.08;
const POST_S = 0.2;
const TELEPORT = 0.3;
const args = process.argv.slice(2);
const rawPath = args[0];
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const label = getArg('--label', rawPath);
const jsonOut = getArg('--json', null);
// --main：只取正式比賽主場次（場次名不含 #J8；與 jump-drift-verdict.mjs 的 J2–J7 樣本同一組）
const sessions = JSON.parse(readFileSync(rawPath, 'utf8')).filter((s) => !args.includes('--main') || !String(s.seed).includes('#'));

function classify(ep) {
  if (ep.serve && ep.serve.style === 'power') return 'jumpServe';
  const sh = ep.hits.find((h) => h.kind === 'spike');
  if (sh) {
    if (sh.routeKind === 'pipe' || sh.routeKind === 'dball' || ep.backRow) return 'back';
    if (sh.routeKind == null && ep.frames[sh.idx]?.touches === 2) return 'setterAtk';
    return 'spike';
  }
  if (ep.hits.some((h) => h.kind === 'set' && h.jumpSet)) return 'jumpSet';
  if (ep.block || /^block/.test(ep.seqAtTakeoff ?? '')) return 'block';
  if (/^windup|^approach|^spike/.test(ep.seqAtTakeoff ?? '')) return 'decoy';
  return `other:${ep.seqAtTakeoff}`;
}

const rows = [];
for (const s of sessions) {
  for (const ep of s.episodes) {
    const F = ep.frames;
    let last = F.length - 1;
    if (ep.landIdx != null) {
      let t = 0;
      last = ep.landIdx;
      for (let i = ep.landIdx + 1; i < F.length; i += 1) {
        t += F[i].dt;
        if (t > POST_S + 1e-9) break;
        last = i;
      }
    }
    let maxDrop = -Infinity; let at = null;
    let teleport = false;
    const cuts = []; // 兩個比賽幀之間夾了精華重演畫面（frame.nl 增加）＝畫面上不相鄰，不算「單幀」，另列
    for (let i = 1; i <= last; i += 1) {
      const d = F[i - 1].ry - F[i].ry;
      if (Math.hypot(F[i].sx - F[i - 1].sx, F[i].sz - F[i - 1].sz) > TELEPORT) teleport = true;
      if (F[i].nl != null && F[i - 1].nl != null && F[i].nl !== F[i - 1].nl) {
        cuts.push({ frame: i, drop: d, replayFrames: F[i].nl - F[i - 1].nl });
        continue;
      }
      if (d > maxDrop) { maxDrop = d; at = i; }
    }
    if (at == null) { maxDrop = 0; at = 0; }
    const f = F[at]; const p = F[Math.max(at - 1, 0)];
    rows.push({
      seed: s.seed, id: ep.id, takeoffTick: ep.takeoffTick, cat: classify(ep), seq0: ep.seqAtTakeoff,
      frames: last + 1, landed: ep.landIdx != null, landIdx: ep.landIdx,
      maxDrop, dropFrame: at, dropTick: f.tick, dropSeqPrev: p.seq, dropSeq: f.seq,
      ryPrev: p.ry, ry: f.ry, jumpYPrev: p.jumpY, jumpY: f.jumpY, dropAfterLand: ep.landIdx != null ? at - ep.landIdx : null,
      teleport, cuts, fail: maxDrop > LIMIT,
    });
  }
}

const order = ['spike', 'back', 'jumpServe', 'jumpSet', 'block', 'setterAtk'];
const cats = [...new Set([...order, ...rows.map((r) => r.cat)])];
const f3 = (v) => Number(v).toFixed(3);
const tag = (r) => `${r.seed}/${r.id}@${r.takeoffTick}`;
console.log(`== J11 ${label}（${sessions.length} 場：${sessions.map((s) => s.seed).join(', ')}；上限 ${LIMIT} m／幀，落地後 ${POST_S} s）`);
const summary = {};
for (const c of cats) {
  const rs = rows.filter((r) => r.cat === c);
  if (!rs.length && !order.includes(c)) continue;
  const fails = rs.filter((r) => r.fail);
  const worst = rs.reduce((a, r) => (a == null || r.maxDrop > a.maxDrop ? r : a), null);
  summary[c] = { n: rs.length, seeds: new Set(rs.map((r) => r.seed)).size, fail: fails.length, maxDrop: worst?.maxDrop ?? null, worst: worst ? tag(worst) : null };
  console.log(`[${order.includes(c) ? 'R5' : '其他'}:${c}] n=${rs.length}（${summary[c].seeds} 場）單幀最大下降 ${worst ? f3(worst.maxDrop) : '—'} m`
    + `${worst ? `（${tag(worst)} 第 ${worst.dropFrame} 幀 tick ${worst.dropTick}，落地後 ${worst.dropAfterLand} 幀，${worst.dropSeqPrev}→${worst.dropSeq}，ry ${f3(worst.ryPrev)}→${f3(worst.ry)}，jumpY ${f3(worst.jumpYPrev)}→${f3(worst.jumpY)}${worst.teleport ? '，窗口含瞬移' : ''}）` : ''}`
    + `；>0.08 共 ${fails.length} 筆`);
  for (const r of fails.slice(0, 5)) {
    console.log(`    ${tag(r)} drop ${f3(r.maxDrop)} 第 ${r.dropFrame} 幀（落地後 ${r.dropAfterLand}）${r.dropSeqPrev}→${r.dropSeq} jumpY ${f3(r.jumpYPrev)}→${f3(r.jumpY)}${r.teleport ? ' 瞬移' : ''}`);
  }
}
const cutRows = rows.filter((r) => r.cuts.length);
const hasNl = sessions.some((s) => s.episodes.some((e) => e.frames.some((f) => f.nl != null)));
console.log(`[重演剪接] ${hasNl ? `窗口內夾精華重演的幀對 ${cutRows.reduce((a, r) => a + r.cuts.length, 0)} 處（不算單幀，另列）${cutRows.length ? '：' : ''}${cutRows.slice(0, 8).map((r) => r.cuts.map((c) => `${tag(r)}[${r.cat}] 第 ${c.frame} 幀 落差 ${f3(c.drop)} m（中間 ${c.replayFrames} 個重演畫面）`).join('；')).join('；')}` : '原始檔無 nl 欄位（舊版治具），無法辨識，全部幀對都當相鄰幀判'}`);
const all = rows.filter((r) => order.includes(r.cat));
const maxAll = Math.max(...all.map((r) => r.maxDrop));
const failAll = all.filter((r) => r.fail).length;
const short = order.filter((c) => (summary[c]?.n ?? 0) < 5);
console.log(`[J11] R5 六類合計 n=${all.length}，單幀最大下降 ${f3(maxAll)} m，>0.08 共 ${failAll} 筆；每類 ≥5 筆：${short.length ? `不足 ${short.map((c) => `${c}=${summary[c]?.n ?? 0}`).join('、')}` : '全達'}`);
console.log(`[J11 判定] ${failAll === 0 ? '過（全部 ≤0.08）' : '不過（有 >0.08）'}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ label, limit: LIMIT, summary, maxAll, failAll, rows }, null, 1));
