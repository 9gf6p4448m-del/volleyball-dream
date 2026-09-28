// 寫實蒙皮修正：驗收修訂 R7 的 S1、S3 判定（量尺方提供；只讀量測輸出、不重算量測）。
// 驗收：docs/kickoffs/real-skin-acceptance.md 修訂紀錄 R7（c075fb7）。
//
// 用法：node tools/real-skin-r7-judge.mjs --faces=20k|5k --s1=<候選 real-skin-measure json> --pen=<候選 real-skin-penetration-v2 json>
//        [--s1base=<現況 measure json>] [--penbase=<現況 penetration-v2 json>] [--txt=<path>]
//   現況檔預設讀 docs/experiments/real-skin-evidence/ruler-v2/R7/（量尺方在 8720597 產生並落檔），並核對其 sha256
//   （BASELINE_SHA256，寫死；檔案被換掉即停止）。
//
// S1（R7）：每幀（9 幀）滿足 (i) 或 (ii) 即過：
//   (i) >2× 數 ≤30 且 P99 ≤2.5；(ii) >2× 數 ≤ 現況 且 P99 ≤ 現況 且 P99 ≤6.0。
//   比較精度：點數整數；P99 以 real-skin-measure 的顯示精度（小數 2 位）四捨五入後比。
//   （驗收檔「比較精度」寫「拉伸倍率比 0.1」並註「以工具的顯示精度為準」；工具顯示到 0.01，取較嚴的 0.01。）
// S3（R7）：(e) 新量法（手臂穿入骨盆＋大腿），每臂：
//   K4a：點數 ≤ 現況 且 最深 ≤ 現況（深度比 0.1 cm）；K4b、K4c：≤10 點且 ≤1.0 cm（原門檻不變）。
//   S3 現況檔另核對：realPlayer.js 雜湊＝8720597（b1489d7878dc），且與候選的量尺／凍結檔／lib／glb 雜湊相同。
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const R7DIR = new URL('../docs/experiments/real-skin-evidence/ruler-v2/R7/', import.meta.url);
// 量尺方在 8720597 產生的現況檔（去 CR 後 sha256）；R7 驗收用這幾份，不採用實作者提供的檔
export const BASELINE_SHA256 = {
  's1-base-20k.json': '3405b03368bbde88b8f267ad4b7f14e1dbe290bec4bfef2d4f93c5a748aa4144', 's1-base-5k.json': '8de84cce5159575bcd47c2ab0faa63a9bf63254e3bb4448284f2b1d4973c0b7f',
};
export const REALPLAYER_8720597 = 'b1489d7878dc';
const KEYS = ['K1a', 'K1b', 'K2a', 'K2b', 'K3a', 'K3b', 'K4a', 'K4b', 'K4c'];

async function readJson(path, expectSha = null) {
  const buf = await readFile(path);
  if (expectSha) {
    const sha = createHash('sha256').update(Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')).digest('hex');
    if (sha !== expectSha) throw new Error(`現況檔 ${path} 的 sha256 ${sha} ≠ 量尺方落檔值 ${expectSha}（檔案被換過？）`);
  }
  return JSON.parse(buf.toString('utf8'));
}
const r2 = (x) => Math.round(x * 100) / 100;
const cm1 = (m) => Math.round(m * 1000) / 10;

export function judgeS1(cand, base) {
  const rows = [];
  for (const id of KEYS) {
    const c = cand.results.base.keys[id].a; const z = base.results.base.keys[id].a;
    const p = r2(c.p99); const zp = r2(z.p99);
    const i = c.over2 <= 30 && p <= 2.5;
    const ii = c.over2 <= z.over2 && p <= zp && p <= 6.0;
    rows.push({ id, over2: c.over2, p99: p, base: { over2: z.over2, p99: zp }, i, ii, ok: i || ii });
  }
  return { rows, pass: rows.every((r) => r.ok) };
}
export function judgeS3(cand, base) {
  const rows = [];
  for (const id of ['K4a', 'K4b', 'K4c']) {
    for (const s of ['r', 'l']) {
      const c = cand.rows[id].e.new[s]; const z = base.rows[id].e.new[s];
      const d = cm1(c.maxDepth); const zd = cm1(z.maxDepth);
      const ok = id === 'K4a' ? (c.inside <= z.inside && d <= zd) : (c.inside <= 10 && d <= 1.0);
      rows.push({ id, s, inside: c.inside, depth: d, base: { inside: z.inside, depth: zd }, rule: id === 'K4a' ? '≤現況' : '≤10 點且 ≤1.0 cm', ok });
    }
  }
  return { rows, pass: rows.every((r) => r.ok) };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? '1'] : [a, '1'];
  }));
  const faces = args.faces === '5k' ? '5k' : '20k';
  if (!args.s1 || !args.pen) throw new Error('需要 --s1=<候選 measure json> 與 --pen=<候選 penetration-v2 json>');
  const s1baseName = `s1-base-${faces}.json`;
  const s1base = await readJson(args.s1base ?? fileURLToPath(new URL(s1baseName, R7DIR)), BASELINE_SHA256[s1baseName]);
  const penbase = await readJson(args.penbase ?? fileURLToPath(new URL(`../R3/frozen-rerun/before-${faces}.json`, R7DIR)));
  const s1 = await readJson(args.s1); const pen = await readJson(args.pen);
  if (s1.faces !== faces || s1base.faces !== faces || pen.faces !== faces || penbase.faces !== faces) throw new Error('面數不一致');
  if (penbase.hashes?.['realPlayer.js'] !== REALPLAYER_8720597) throw new Error(`S3 現況檔的 realPlayer.js 雜湊 ${penbase.hashes?.['realPlayer.js']} ≠ 8720597 的 ${REALPLAYER_8720597}`);
  for (const k of new Set([...Object.keys(penbase.hashes ?? {}), ...Object.keys(pen.hashes ?? {})])) {
    if (k === 'realPlayer.js') continue;
    if (penbase.hashes?.[k] !== pen.hashes?.[k]) throw new Error(`S3 現況檔與候選的輸入雜湊 ${k} 不同（${penbase.hashes?.[k]} ≠ ${pen.hashes?.[k]}），不能比較`);
  }
  const a = judgeS1(s1, s1base); const b = judgeS3(pen, penbase);
  const out = [];
  out.push(`# R7 判定（faces=${faces}）`);
  out.push(`輸入：S1 候選 ${args.s1.replace(/\\/g, '/').split('/').pop()}、S3 候選 ${args.pen.replace(/\\/g, '/').split('/').pop()}（realPlayer.js ${pen.hashes?.['realPlayer.js']}）`);
  out.push('', '## S1（每幀 (i) 或 (ii)）', '| 幀 | >2× 數 | P99 | 現況 >2×／P99 | (i) ≤30 且 ≤2.5 | (ii) ≤現況 且 ≤現況 且 ≤6.0 | 判定 |', '|---|---|---|---|---|---|---|');
  for (const r of a.rows) out.push(`| ${r.id} | ${r.over2} | ${r.p99.toFixed(2)} | ${r.base.over2}／${r.base.p99.toFixed(2)} | ${r.i ? '是' : '否'} | ${r.ii ? '是' : '否'} | ${r.ok ? '過' : '不過'} |`);
  out.push(`- S1 判定：${a.pass ? '過（9 幀）' : `不過（${a.rows.filter((r) => !r.ok).map((r) => r.id).join('、')}）`}`);
  out.push('', '## S3 (e)（K4a ≤現況；K4b、K4c 原門檻）', '| 幀臂 | 點數 | 最深 cm | 現況 點數／最深 | 規則 | 判定 |', '|---|---|---|---|---|---|');
  for (const r of b.rows) out.push(`| ${r.id}${r.s === 'r' ? '右' : '左'} | ${r.inside} | ${r.depth.toFixed(1)} | ${r.base.inside}／${r.base.depth.toFixed(1)} | ${r.rule} | ${r.ok ? '過' : '不過'} |`);
  out.push(`- S3 判定：${b.pass ? '過' : `不過（${b.rows.filter((r) => !r.ok).map((r) => r.id + (r.s === 'r' ? '右' : '左')).join('、')}）`}`);
  const text = `${out.join('\n')}\n`;
  process.stdout.write(text);
  if (args.txt && args.txt !== '1') await writeFile(args.txt, text);
}
