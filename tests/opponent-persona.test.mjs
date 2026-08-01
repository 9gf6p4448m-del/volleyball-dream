// 難度重校卷 題 1b（Sawmah 2026-08-01）：`blockPersona` 入隊伍 DNA 欄位、與 level 脫鉤。
//
// 這支測試守三件事：
//   ① **首發分配結果照舊**——恰好一隊 commit，且是曜石體中（純結構重構的定義）
//   ② **與 level 脫鉤**——不存在任何 level 門檻能重現現行分配（有的話就是又綁回去了）
//   ③ **明文指定**——每一隊都自己寫了 blockPersona，沒有靠預設值或包裝層補
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { OPPONENTS } from '../src/career/opponents.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'career', 'opponents.js');

test('題1b ①：首發分配照舊——恰好一隊 commit，且是曜石體中', () => {
  const commits = OPPONENTS.filter((o) => o.ai?.blockPersona === 'commit');
  assert.equal(commits.length, 1, `commit 隊數 ${commits.length}（應為 1）：${commits.map((o) => o.id).join(',')}`);
  assert.equal(commits[0].id, 'obsidian');
});

test('題1b ②：與 level 脫鉤——不存在任何 level 門檻能重現現行分配', () => {
  // 舊制是「level < X ⇒ commit」。若現行分配還能被某個 X 重現，代表它其實仍綁在 level 上。
  const levels = [...new Set(OPPONENTS.map((o) => o.level))].sort((a, b) => a - b);
  const cuts = [levels[0] - 1, ...levels.map((v) => v + 0.5), levels[levels.length - 1] + 1];
  for (const cut of cuts) {
    const below = OPPONENTS.filter((o) => o.level < cut).map((o) => o.ai.blockPersona);
    const above = OPPONENTS.filter((o) => o.level >= cut).map((o) => o.ai.blockPersona);
    const reproduces = below.every((p) => p === 'commit') && above.every((p) => p === 'read');
    assert.ok(!reproduces, `level < ${cut} ⇒ commit 這條門檻能重現現行分配＝人格又被綁回 level 了`);
  }
  // 反向具體證據：曜石 level 60 是 commit，而比它更弱的青嵐 55／白浪 57 都是 read
  const by = Object.fromEntries(OPPONENTS.map((o) => [o.id, o]));
  assert.equal(by.obsidian.ai.blockPersona, 'commit');
  assert.ok(by['gale-shore'].level < by.obsidian.level && by['gale-shore'].ai.blockPersona === 'read');
  assert.ok(by['white-wave'].level < by.obsidian.level && by['white-wave'].ai.blockPersona === 'read');
});

test('題1b ③：每一隊都明文指定，且原始碼裡沒有殘留的總開關／白名單／包裝層', () => {
  for (const o of OPPONENTS) {
    assert.ok(['read', 'commit'].includes(o.ai?.blockPersona),
      `${o.id} 的 blockPersona 不是明文的 read／commit（拿到 ${o.ai?.blockPersona}）`);
  }
  const src = readFileSync(SRC, 'utf8');
  // 剝掉行註解再掃——歷史說明留在註解裡是刻意的，程式碼裡不得再有。
  // ⚠ 用 `[^\r\n]*` 不用 `.*$`：CRLF 行的 `.` 停在 `\r` 之前、`$` 又要求字串結尾
  // ⇒ 整條剝不掉，護欄會把註解裡的字誤判成殘留（block-persona.test.mjs 記過同一個坑）
  const code = src.replace(/\/\/[^\r\n]*/g, '');
  for (const banned of ['COMMIT_PERSONA_ENABLED', 'COMMIT_ALLOWLIST', 'persona(']) {
    assert.ok(!code.includes(banned), `opponents.js 程式碼裡仍有 ${banned}＝包裝層沒拆乾淨`);
  }
});
