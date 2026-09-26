// 寫實球員卷：在治具外單獨跑 npm test 時用（加嚴紀錄・第五批 A7 證據來源）。
// 跑 `npm test`，把完整輸出寫到 <log>，另寫 <log>.json 記錄執行當下的 HEAD、工作區是否乾淨與耗時；
// tools/real-player-browser.mjs 以 A7_TEST_LOG=<log> 讀取時會一併檢查這份來源紀錄。
// 用法：node tools/npm-test-with-provenance.mjs <log 路徑>
import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const logPath = resolve(process.argv[2] || 'npm-test.log');
const git = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const head = git('git rev-parse HEAD');
const dirty = git('git status --porcelain').split('\n').filter(Boolean);
const startedAt = new Date();
const r = spawnSync('npm', ['test'], { encoding: 'utf8', shell: true, maxBuffer: 256 * 1024 * 1024 });
const finishedAt = new Date();
writeFileSync(logPath, `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
const provenance = {
  head, clean: dirty.length === 0, dirty, headAfter: git('git rev-parse HEAD'),
  startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(),
  seconds: Math.round((finishedAt - startedAt) / 1000), exitCode: r.status,
};
writeFileSync(`${logPath}.json`, JSON.stringify(provenance, null, 2));
console.log(JSON.stringify(provenance));
