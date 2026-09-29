// 跳躍前飄卷：J2／J7 與 J3 的可行性下界（與前飄實作無關，只讀改前原始資料的 sim 位置、擊球點、幀時間）
// 用法：node tools/jump-drift-measure.mjs --label before（產生 *-raw.json）→ node tools/jump-drift-feasibility.mjs <raw.json> [1＝列出前 12 筆]
// J2×J3：起跳→擊球共 N 幀、每幀 ≤0.05 m ⇒ root 最多走 0.05N；0.8·d_sim 大於它＝任何實作都過不了
// J7×J3：擊球幀 root 沿 u 至少到 P0+0.8·d_sim、之後滯空只准前進 ⇒ 落地時與 sim 的差下界；落地後 0.5 s 內每幀 ≤0.05 併不完＝過不了
import { readFileSync } from 'node:fs';
const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let n = 0, infJ2 = 0, infJ7 = 0, infEither = 0; const rows = [];
for (const s of raw) for (const e of s.episodes) {
  const h = e.hits.find((x) => x.kind === 'spike'); if (!h) continue;
  const F = e.frames; let end = F.length - 1;
  for (let i = 1; i < F.length; i++) if (Math.hypot(F[i].sx - F[i-1].sx, F[i].sz - F[i-1].sz) > 0.3) { end = i - 1; break; }
  if (h.idx > end) continue;
  n++;
  const f0 = F[0]; const H = [h.ballAt[0], h.ballAt[2]];
  const d = Math.hypot(H[0] - f0.sx, H[1] - f0.sz); const u = [(H[0] - f0.sx) / d, (H[1] - f0.sz) / d];
  const STEP = Number(process.env.STEP_MAX) || 0.07; // R1：每幀上限 0.07 m（原 0.05，可用 STEP_MAX=0.05 重現改前結論）
  const j2 = 0.8 * d > STEP * h.idx; // 起跳→擊球幀數內每幀 ≤0.05 走不到 0.8·d_sim
  // J7：擊球幀 root 沿 u 至少在 P0+0.8d；之後滯空只准前進（J3 單調）⇒ 落地時 root·u ≥ 那個值
  let land = e.landIdx != null && e.landIdx <= end ? e.landIdx : null; let j7 = false; let gap = null; let frames05 = null;
  if (land != null) {
    const fl = F[land];
    gap = (f0.sx * u[0] + f0.sz * u[1] + 0.8 * d) - (fl.sx * u[0] + fl.sz * u[1]);
    let t = 0; frames05 = 0;
    for (let i = land + 1; i <= end && t + F[i].dt <= 0.5 + 1e-9; i++) { t += F[i].dt; frames05++; }
    // 落地後 0.5 s 內每幀 ≤0.05 可併回的最大量（sim 那 0.5 s 之後若還在動另計，這裡只算下界）
    j7 = gap > STEP * frames05 + 0.01 && t >= 0.5 - 0.02;
  }
  if (j2) infJ2++; if (j7) infJ7++; if (j2 || j7) infEither++;
  rows.push({ seed: s.seed, id: e.id, tick: e.takeoffTick, d: +d.toFixed(3), hitFrames: h.idx, j2, gap: gap && +gap.toFixed(3), frames05, j7 });
}
console.log(JSON.stringify({ n, infeasibleJ2vsJ3: infJ2, infeasibleJ7vsJ3: infJ7, either: infEither }));
if (process.argv[3]) console.log(rows.filter((r) => r.j2 || r.j7).slice(0, 12).map((r) => JSON.stringify(r)).join('\n'));
