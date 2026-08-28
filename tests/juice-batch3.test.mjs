// 大作感卷 批3「光的化妝」——驗收 A1–A5 的機械斷言
// 凍結檔：docs/kickoffs/acceptance-juice-batch3-20260828.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getQuality, describeQuality } from '../src/render/quality.js';
import { createPostFx } from '../src/render/postFx.js';
import { createFloorReflection, patchReflectorAlpha, REFLECT } from '../src/render/floorReflection.js';
import { sparkSpawnCount } from '../src/render/ballView.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

// quality=low 避開 preset high 的 window.devicePixelRatio 路徑（node 無 window）
const q = (s) => getQuality(s);

test('A1 ?fx 閘：缺席/非法值＝off，唯一合法升規值＝high', () => {
  assert.equal(q('?quality=low').fx, 'off');
  assert.equal(q('?quality=low&fx=high').fx, 'high');
  assert.equal(q('?quality=low&fx=ultra').fx, 'off'); // 亂寫不得靜默升規
  assert.equal(q('?quality=low&fx=1').fx, 'off');
});

test('A1 describeQuality 顯示 fx 檔位（真機 HUD 角標可核對）', () => {
  assert.match(describeQuality(q('?quality=low&fx=high')), / · fx high$/);
  assert.match(describeQuality(q('?quality=low')), / · fx off$/);
});

test('A2 預設檔零成本：fx=off 不建 composer、render 走直渲', () => {
  let factoryCalls = 0;
  let plainCalls = 0;
  const renderer = { render() { plainCalls += 1; } };
  const scene = {}; const camera = {};
  const fx = createPostFx(renderer, scene, camera, { fx: 'off' }, () => { factoryCalls += 1; return {}; });
  fx.render(scene, camera);
  assert.equal(factoryCalls, 0);
  assert.equal(plainCalls, 1);
  assert.equal(fx.enabled, false);
});

test('A2 預設檔零成本：fx=off 不建地板反光', () => {
  const scene = { add() { throw new Error('off 檔不得往場景加反光'); } };
  assert.equal(createFloorReflection(scene, { fx: 'off' }), null);
});

test('fx=high：render 走 composer 而非直渲', () => {
  let composerCalls = 0;
  let plainCalls = 0;
  const renderer = { render() { plainCalls += 1; } };
  const scene = {}; const camera = {};
  const fx = createPostFx(renderer, scene, camera, { fx: 'high' },
    () => ({ render() { composerCalls += 1; }, setSize() {} }));
  fx.render(scene, camera);
  assert.equal(fx.enabled, true);
  assert.equal(composerCalls, 1);
  assert.equal(plainCalls, 0);
});

test('fx=high：非主場景（獨立小舞台防呆）走直渲不進 composer', () => {
  let composerCalls = 0;
  let plainCalls = 0;
  const renderer = { render() { plainCalls += 1; } };
  const scene = {}; const camera = {};
  const fx = createPostFx(renderer, scene, camera, { fx: 'high' },
    () => ({ render() { composerCalls += 1; }, setSize() {} }));
  fx.render({}, {});
  assert.equal(composerCalls, 0);
  assert.equal(plainCalls, 1);
});

test('A4 光效永不致死：composer 建構丟例外→退回直渲', () => {
  let plainCalls = 0;
  const renderer = { render() { plainCalls += 1; } };
  const scene = {}; const camera = {};
  const fx = createPostFx(renderer, scene, camera, { fx: 'high' },
    () => { throw new Error('WebGL 悲劇'); });
  fx.render(scene, camera); // 不得丟例外
  assert.equal(fx.enabled, false);
  assert.equal(plainCalls, 1);
});

test('A4 Reflector shader 補丁：真 Reflector 打得上、alpha uniform 生效', () => {
  const scene = { added: 0, add() { this.added += 1; } };
  const reflector = createFloorReflection(scene, { fx: 'high' });
  assert.ok(reflector, '批3 當下的 three 版本必須打得上補丁（打不上＝A4 邊界但不是本版預期）');
  assert.equal(scene.added, 1);
  assert.match(reflector.material.fragmentShader, /uOpacity/);
  assert.equal(reflector.material.uniforms.uOpacity.value, REFLECT.opacity);
  assert.equal(reflector.material.transparent, true);
});

test('A4 Reflector shader 形狀不符（three 升版）→回 false 不亂改', () => {
  const mat = { fragmentShader: 'void main(){ gl_FragColor = vec4(1.0); }', uniforms: {} };
  assert.equal(patchReflectorAlpha(mat, 0.3), false);
  assert.equal(mat.uniforms.uOpacity, undefined);
  assert.ok(!('transparent' in mat) || mat.transparent !== true);
});

test('A5 sparkSpawnCount：低速 0、超門檻線性升、封頂 3', () => {
  assert.equal(sparkSpawnCount(0), 0);
  assert.equal(sparkSpawnCount(9), 0);   // 門檻本身不生成（> 才算高速，同細線拖尾）
  assert.equal(sparkSpawnCount(10), 1);
  assert.equal(sparkSpawnCount(16), 2);
  assert.equal(sparkSpawnCount(40), 3);  // 封頂
});

test('A3 渲染單一出口：matchLoop 零直渲、三個渲染點全走 postFx', () => {
  const s = src('src/app/matchLoop.js');
  assert.equal((s.match(/ctx\.renderer\.render\(/g) ?? []).length, 0);
  assert.ok((s.match(/ctx\.postFx\.render\(/g) ?? []).length >= 3);
});

test('A3 main.js：postFx 建立並進 ctx；bench 也走光效出口', () => {
  const s = src('src/main.js');
  assert.match(s, /createPostFx\(renderer, scene, camera, quality\)/);
  assert.match(s, /createFloorReflection\(scene, quality\)/);
  assert.match(s, /postFx\.render\(scene, camera\)/); // bench
  assert.ok(!/\brenderer\.render\(scene, camera\)/.test(s));
});

test('A5 色值單一來源：ballView 金色 import 自 theme.js COLORS', () => {
  const s = src('src/render/ballView.js');
  assert.match(s, /from '\.\.\/ui\/theme\.js'/);
  assert.ok((s.match(/COLORS\.goldLight/g) ?? []).length >= 2); // 細線＋火花
  assert.ok(!s.includes('0xfff3b0'), '舊金色字面量應改吃 theme');
});

test('A5 塵土擴充：池上限與死球爆塵已加量', () => {
  const s = src('src/render/matchView.js');
  assert.match(s, /const N = 144;/);
  assert.match(s, /dust\.burst\(e\.at\.x, e\.at\.z, 16, 1\.05\)/);
});
