// 多人連線卷 批3 —— headless 驗收（A3-2 傳輸隔離＋建隊決定論＋codec 拒絕面）
// 凍結檔＝docs/kickoffs/acceptance-multiplayer-20260828.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildNetSetup } from '../src/app/matchConfig.js';
import { createGame } from '../src/sim/game.js';
import { decodeMsg, helloMsg, helloProblem, NET_VERSION } from '../src/net/codec.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('A3-2 傳輸隔離：src/net/ 只有 transport.js 准碰瀏覽器 API（靜態掃描）', () => {
  const banned = /RTCPeerConnection|navigator\.|document\.|window\.|CompressionStream|btoa\(|atob\(/;
  const offenders = [];
  for (const name of readdirSync(join(ROOT, 'src', 'net'))) {
    if (!name.endsWith('.js') || name === 'transport.js') continue;
    const text = readFileSync(join(ROOT, 'src', 'net', name), 'utf8');
    const m = text.match(banned);
    if (m) offenders.push(`${name}: ${m[0]}`);
  }
  assert.deepEqual(offenders, []);
});

test('批3 建隊決定論：同 roles 兩次 buildNetSetup 逐值相同、兩端 createGame 逐值相同', () => {
  for (const roles of [['outside', 'outside'], ['setter', 'libero'], ['middle', 'opposite']]) {
    const a = buildNetSetup(roles[0], roles[1]);
    const b = buildNetSetup(roles[0], roles[1]);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)),
      `roles=${roles} 兩次建隊不同`);
    // 兩端各自 createGame（同 seed 同 teams）＝逐值同一場
    const g1 = createGame({ seed: 42, setTarget: 25, teams: a.teams });
    const g2 = createGame({ seed: 42, setTarget: 25, teams: b.teams });
    assert.deepEqual(JSON.parse(JSON.stringify(g1)), JSON.parse(JSON.stringify(g2)));
  }
});

test('批3 建隊角色落位：主機 setter 在 A 隊 0 槽、客機 libero 有 liberoB、pids 恆 A2/B2', () => {
  const su = buildNetSetup('setter', 'libero');
  assert.equal(su.pids.A, 'A2');
  assert.equal(su.pids.B, 'B2');
  assert.equal(su.teams.A[0].id, 'A2'); // setter 槽互換（buildQuickSetup 同款邏輯）
  assert.equal(su.teams.A[0].currentRole, 'setter');
  assert.ok(su.liberoB, '客機選 L 必有 liberoB');
  assert.equal(su.liberoB.id, 'B2');
  assert.equal(su.liberoA, null);
  // B 隊被鏡像動過：B8 替補頂上先發
  assert.equal(su.teams.B[1].id, 'B8');
});

test('批3 codec 拒絕面：版本不符明確拒絕、垃圾訊息回 null 不炸', () => {
  const ok = helloMsg({ seed: 1, delay: 3, roles: { A: 'outside', B: 'outside' } });
  assert.equal(helloProblem(ok), null);
  assert.match(helloProblem({ ...ok, v: NET_VERSION + 1 }) ?? '', /版本不符/);
  assert.match(helloProblem({ ...ok, seed: 'x' }) ?? '', /seed/);
  assert.match(helloProblem({ ...ok, delay: -1 }) ?? '', /delay/);
  assert.equal(decodeMsg('not json'), null);
  assert.equal(decodeMsg('{"noY":1}'), null);
  assert.equal(decodeMsg('null'), null);
});

test('A4-3 前哨：連線對戰路徑零生涯寫入——netLobby 與 net/ 不 import careerStore', () => {
  const files = [
    join(ROOT, 'src', 'ui', 'netLobby.js'),
    ...readdirSync(join(ROOT, 'src', 'net')).map((n) => join(ROOT, 'src', 'net', n)),
  ];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!/careerStore|localStorage|vd-career/.test(text), `${f} 碰了生涯存檔`);
  }
});
