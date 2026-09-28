// 新尺的突變矩陣（鑑別力證據，02 §6.1）：把 tools/real-skin-penetration-v2.mjs 換成「壞掉的版本」，
// 重跑量尺 CLI 與 V0–V3、V6，看每種壞法是否至少讓一項變紅。對照組 M0＝不改。
// **只准在拋棄式工作樹執行**（git worktree add --detach …）：本腳本會暫時覆寫該工作樹裡的量尺檔，
// 每個突變跑完用「改壞前的備份副本」還原（不用反向替換），全部結束再比 sha256 確認還原。
//
// 用法（在拋棄式工作樹根目錄）：node tools/real-skin-penetration-v2-mutants.mjs --faces=5k|20k --out=<目錄> --oldref=<舊證據目錄> [--only=M1,M2]
import { readFile, writeFile, copyFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? '1'] : [a, '1'];
}));
const faces = args.faces === '5k' ? '5k' : '20k';
const out = args.out; const oldref = args.oldref;
if (!out || out === '1' || !oldref || oldref === '1') throw new Error('需要 --out=<目錄> 與 --oldref=<舊證據目錄>');
const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(TOOLS);
// 安全閘：必須是 detached HEAD 的工作樹（拋棄式），否則拒跑
const head = execFileSync('git', ['-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== 'HEAD') throw new Error(`拒跑：${ROOT} 在分支 ${head} 上；突變矩陣只能在 detached 的拋棄式工作樹執行`);
const RULER = join(TOOLS, 'real-skin-penetration-v2.mjs');
const BACKUP = `${RULER}.mutants-backup`;
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// 突變：[名稱, 說明, [[原字串, 替換字串], …], 附加到檔尾的程式碼]
const APPEND_PLANE = `
function __mutNearestCentroidIdx(T, p) { let b = Infinity; let bk = 0; for (let k = 0; k < T.length / 9; k += 1) { const o = k * 9; const cx = (T[o] + T[o + 3] + T[o + 6]) / 3 - p[0]; const cy = (T[o + 1] + T[o + 4] + T[o + 7]) / 3 - p[1]; const cz = (T[o + 2] + T[o + 5] + T[o + 8]) / 3 - p[2]; const d = cx * cx + cy * cy + cz * cz; if (d < b) { b = d; bk = k; } } return bk; }
function __mutPlane(T, p) { const k = __mutNearestCentroidIdx(T, p); const o = k * 9; const u = [T[o + 3] - T[o], T[o + 4] - T[o + 1], T[o + 5] - T[o + 2]]; const v = [T[o + 6] - T[o], T[o + 7] - T[o + 1], T[o + 8] - T[o + 2]]; const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; const d = Math.abs(((p[0] - T[o]) * n[0] + (p[1] - T[o + 1]) * n[1] + (p[2] - T[o + 2]) * n[2]) / l); return { d, k, w: [1 / 3, 1 / 3, 1 / 3], q: [(T[o] + T[o + 3] + T[o + 6]) / 3, (T[o + 1] + T[o + 4] + T[o + 7]) / 3, (T[o + 2] + T[o + 5] + T[o + 8]) / 3] }; }
function __mutVertex(T, p) { let b = Infinity; let bk = 0; let bj = 0; for (let k = 0; k < T.length / 9; k += 1) for (let j = 0; j < 3; j += 1) { const o = k * 9 + j * 3; const d = Math.hypot(T[o] - p[0], T[o + 1] - p[1], T[o + 2] - p[2]); if (d < b) { b = d; bk = k; bj = j; } } const w = [0, 0, 0]; w[bj] = 1; return { d: b, k: bk, w, q: [T[bk * 9 + bj * 3], T[bk * 9 + bj * 3 + 1], T[bk * 9 + bj * 3 + 2]] }; }
`;
const NEAREST_HEAD = 'export function nearestOnSurface(T, bb, p) {';
const MUTANTS = [
  ['M0', '對照：不改', [], ''],
  ['M1', '深度＝到最近三角形「質心」的距離', [['    const q = [0, 1, 2].map((d) => w[0] * A[d] + w[1] * B[d] + w[2] * C[d]);\n    const d2 =', '    const q = [0, 1, 2].map((d) => (A[d] + B[d] + C[d]) / 3);\n    const d2 =']], ''],
  ['M2', '深度＝質心最近的那個三角形的平面距離', [[NEAREST_HEAD, `${NEAREST_HEAD}\n  if (globalThis.__mut !== 0) return __mutPlane(T, p);`]], APPEND_PLANE],
  ['M3', '深度＝到最近頂點的距離', [[NEAREST_HEAD, `${NEAREST_HEAD}\n  if (globalThis.__mut !== 0) return __mutVertex(T, p);`]], APPEND_PLANE],
  ['M4', '內外換回舊法：最近點內插頂點法線定號（量尺本體 penetrationV2）', [
    ['  const T = surfaceArrays(P1, R.index, S.tris);\n  const bb = triBoxes(T);\n  const out = {};', '  const T = surfaceArrays(P1, R.index, S.tris);\n  const bb = triBoxes(T);\n  const out = {};\n  const __N1 = lib.vertexNormals(P1, R.index);'],
    ['      if (!(w > W_IN)) continue;\n      const nr = nearestOnSurface(T, bb, p);', '      const nr = nearestOnSurface(T, bb, p);\n      { const t0 = S.tris[nr.k]; const v0 = [R.index[t0 * 3], R.index[t0 * 3 + 1], R.index[t0 * 3 + 2]]; let sd = 0; for (let d = 0; d < 3; d += 1) sd += (p[d] - nr.q[d]) * (nr.w[0] * __N1[v0[0] * 3 + d] + nr.w[1] * __N1[v0[1] * 3 + d] + nr.w[2] * __N1[v0[2] * 3 + d]); if (!(sd < 0)) continue; }'],
  ], ''],
  ['M5', '門檻 0.5→0.6', [['export const W_IN = 0.5;', 'export const W_IN = 0.6;']], ''],
  ['M6', 'GWN 正負號反了', [['  return s / (4 * Math.PI);\n}', '  return -s / (4 * Math.PI);\n}']], ''],
  ['M7', 'CLI 誤用綁定姿勢頂點（R.P）當姿勢', [['      const nv = penetrationV2(R, S, P1);', '      const nv = penetrationV2(R, S, R.P);']], ''],
  ['M8', '分區界線 1.15→1.10', [["const ZONE = (y) => (y >= 1.15 ? '胸'", "const ZONE = (y) => (y >= 1.10 ? '胸'"]], ''],
  ['M9', 'S_e 漏掉 lHip', [["export const HIP_BONES = ['pelvis', 'rHip', 'lHip'];", "export const HIP_BONES = ['pelvis', 'rHip'];"]], ''],
  ['M10', '深度乘 1.1', [['  return { d: Math.sqrt(best2), k: bk, w: bw, q: bq };', '  return { d: 1.1 * Math.sqrt(best2), k: bk, w: bw, q: bq };']], ''],
  ['M11', '手臂頂點漏掉「手」', [['    for (const i of R.armVerts[s]) {\n      const p = [P1[i * 3], P1[i * 3 + 1], P1[i * 3 + 2]];\n      const w = windingNumber(T, p);', '    for (const i of R.armVerts[s].filter((x) => R.armPart[x] !== 2)) {\n      const p = [P1[i * 3], P1[i * 3 + 1], P1[i * 3 + 2]];\n      const w = windingNumber(T, p);']], ''],
];
const want = args.only && args.only !== '1' ? new Set(args.only.split(',')) : null;

await mkdir(out, { recursive: true });
const orig = await readFile(RULER);
const origSha = sha(orig);
await copyFile(RULER, BACKUP);
const results = [];
try {
  for (const [name, desc, reps, append] of MUTANTS) {
    if (want && !want.has(name)) continue;
    let text = orig.toString('utf8');
    for (const [a, b] of reps) {
      const n = text.split(a).length - 1;
      if (n !== 1) throw new Error(`${name}：替換目標命中 ${n} 處（須恰 1 處）：${a.slice(0, 60)}`);
      text = text.replace(a, () => b);
    }
    text += append;
    await writeFile(RULER, text);
    const dir = join(out, `mut-${name}`);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const cliJson = join(dir, `cli-${faces}.json`);
    const row = { name, desc, cli: '成功', summary: null, k: null };
    try {
      execFileSync(process.execPath, [join(TOOLS, 'real-skin-penetration-v2.mjs'), `--faces=${faces}`, `--json=${cliJson}`], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
      execFileSync(process.execPath, [join(TOOLS, 'real-skin-penetration-v2-verify.mjs'), `--faces=${faces}`, `--out=${dir}`, '--only=V0,V1,V2,V3,V6', `--cli=${cliJson}`, `--oldref=${oldref}`, '--oldprefix=before', `--tag=${name}`, `--label=${name}`], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
      const rep = JSON.parse(await readFile(join(dir, `verify-V0V1V2V3V6-${name}-${faces}.json`), 'utf8'));
      row.summary = rep.summary;
      const cj = JSON.parse(await readFile(cliJson, 'utf8'));
      const cmv = (x) => `${x.inside}/${(x.maxDepth * 100).toFixed(1)}`;
      row.k = { K3b: `${cmv(cj.rows.K3b.b.new.r)}、${cmv(cj.rows.K3b.b.new.l)}`, K4b: `${cmv(cj.rows.K4b.b.new.r)}、${cmv(cj.rows.K4b.b.new.l)}`, K4aE: `${cmv(cj.rows.K4a.e.new.r)}、${cmv(cj.rows.K4a.e.new.l)}` };
    } catch (e) {
      row.cli = `失敗：${String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? e.message}`;
    }
    results.push(row);
    await copyFile(BACKUP, RULER); // 每個突變後都用備份副本還原
    process.stderr.write(`  ${name} 完成\n`);
  }
} finally {
  await copyFile(BACKUP, RULER);
  await rm(BACKUP, { force: true });
}
const restored = sha(await readFile(RULER));
if (restored !== origSha) throw new Error('還原失敗：量尺檔 sha256 與突變前不同');

const red = (s) => s && Object.values(s).some((v) => v && v !== '過' && v !== '(a)過(b)過' && v !== '(a)待說明(b)過');
const lines = [];
lines.push(`# 新尺突變矩陣（faces=${faces}；src＝本拋棄式工作樹的 HEAD）`);
lines.push('');
lines.push('每列＝把量尺換成一種壞掉的版本後，重跑量尺 CLI 與 V0–V3、V6。「抓到」＝至少一項不是「過」（V2 的「待說明」照未突變時的狀態視為基準）。');
lines.push(`量尺檔突變前後 sha256：${origSha.slice(0, 16)} → 還原後 ${restored.slice(0, 16)}（相同）。`);
lines.push('');
lines.push('| 突變 | 說明 | CLI | V0 | V1 | V2 | V3 | V6 | 抓到 | (b) K3b 右、左 | (b) K4b 右、左 | (e) K4a 右、左 |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of results) {
  const s = r.summary ?? {};
  const caught = r.name === 'M0' ? '（對照）' : r.cli !== '成功' ? '是（CLI 失敗）' : red(s) ? '是' : '**否**';
  lines.push(`| ${r.name} | ${r.desc} | ${r.cli} | ${s.V0 ?? '—'} | ${s.V1 ?? '—'} | ${s.V2 ?? '—'} | ${s.V3 ?? '—'} | ${s.V6 ?? '—'} | ${caught} | ${r.k?.K3b ?? '—'} | ${r.k?.K4b ?? '—'} | ${r.k?.K4aE ?? '—'} |`);
}
const md = `${lines.join('\n')}\n`;
await writeFile(join(out, `mutants-${faces}.md`), md);
process.stdout.write(md);
