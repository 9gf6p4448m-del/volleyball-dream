// 寫實蒙皮修正：在程式內起 vite dev server、跑一個瀏覽器治具、結束即關（不留背景行程）。
// 用法：node tools/real-skin-with-vite.mjs --port=5191 -- <指令與參數…>
// 子行程會拿到 REAL_BASE_URL／REALMATCH_BASE_URL／BASE_URL＝http://127.0.0.1:<port>；本腳本的 exit code＝子行程的 exit code。
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
if (sep < 0 || sep === argv.length - 1) {
  console.error('用法：node tools/real-skin-with-vite.mjs --port=5191 -- <指令…>');
  process.exit(2);
}
const opts = Object.fromEntries(argv.slice(0, sep).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a, '1']; }));
const port = Number(opts.port || 5191);
const [cmd, ...cmdArgs] = argv.slice(sep + 1);
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true } });
await server.listen();
const base = `http://127.0.0.1:${port}`;
let code = 1;
try {
  code = await new Promise((resolveCode) => {
    // node 指令直接用目前的 node 執行檔（不經 shell）；其他指令在 Windows 經 shell 找 PATH
    const isNode = cmd === 'node';
    const child = spawn(isNode ? process.execPath : cmd, cmdArgs, {
      cwd: root, stdio: 'inherit', shell: !isNode && process.platform === 'win32',
      env: { ...process.env, REAL_BASE_URL: base, REALMATCH_BASE_URL: base, BASE_URL: base },
    });
    child.on('exit', (c) => resolveCode(c ?? 1));
    child.on('error', (e) => { console.error(e); resolveCode(1); });
  });
} finally {
  await server.close();
}
process.exit(code);
