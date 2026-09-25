// Run against npm run dev -- --host 127.0.0.1 --port 5175 --strictPort.
// PLAYWRIGHT_MODULE may name an existing Playwright installation; no new runtime dependency.
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.DIRECT_BASE_URL || 'http://127.0.0.1:5175';
const output = resolve('docs/experiments/direct-play-evidence');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const report = { createdAt: new Date().toISOString(), base, device: 'Desktop Chromium, emulated viewports; NOT a physical phone', scenes: [] };
const deliveryOnly = process.argv.includes('--delivery');
const motionOnly = process.argv.includes('--motion');
const assistOnly = process.argv.includes('--assist');
const passOnly = process.argv.includes('--pass');
try {
  if (passOnly) {
    // direct-v4 acceptance A8-A10: platform line, timing cue, pass-direction drill.
    for (const [name, width, height] of [['desktop', 1280, 720], ['landscape', 844, 390], ['portrait', 390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${base}/?mode=direct&seed=17&quality=high&dpr=1`);
      await page.waitForFunction(() => Boolean(window.__directPractice));
      await page.evaluate(() => window.__directPractice.pause());
      const run = passType => page.evaluate(type => {
        const practice = window.__directPractice, seen = { timing: false, now: false, platform: false };
        for (let tick = 0; tick < 29; tick++) {
          practice.command({ action: tick === 0 ? 'feed' : null, feedKind: 'pass-drill' });
          practice.step(1);
          seen.timing ||= practice.assistState().timingActive;
          seen.now ||= practice.assistState().timingNow;
        }
        practice.command({ action: 'receive', passType: type });
        practice.step(1);
        for (let tick = 0; tick < 12; tick++) { practice.command({ passType: type }); practice.step(1); seen.platform ||= practice.assistState().platformVisible; }
        return seen;
      }, passType);
      await page.evaluate(value => { document.querySelector('[data-assist]').value = value; }, 'beginner');
      const beginner = await run('NEUTRAL');
      assert.equal(beginner.timing, true, 'Beginner shows the receive timing cue');
      assert.equal(beginner.platform, true, 'Beginner shows the platform facing line');
      assert.equal(beginner.now, true, 'Beginner shows the exact press-now cue before the receive');
      const during = await page.evaluate(() => window.__directPractice.assistState());
      assert.equal(during.targetVisible, true, 'Drill target is visible');
      await page.screenshot({ path: resolve(output, `${name}-pass-platform.png`) });
      await page.evaluate(() => { const p = window.__directPractice; for (let i = 0; i < 200 && !p.assistState().drill?.result; i++) { p.command({}); p.step(1); } });
      const result = await page.evaluate(() => window.__directPractice.assistState());
      assert.ok(result.drill?.result, 'Drill reports a result after the ball ends');
      assert.equal(result.drill.touched, true, 'The drill receive physically touched the ball');
      assert.equal(result.message, result.drill.result.text, 'Result text is shown to the player');
      assert.equal(await page.evaluate(() => window.__directPractice.verifyReplay()), true, 'Drill with platform choice replays identically');
      await page.screenshot({ path: resolve(output, `${name}-pass-result.png`) });
      await page.evaluate(value => { document.querySelector('[data-assist]').value = value; }, 'standard');
      await page.evaluate(() => window.__directPractice.restart());
      await page.evaluate(() => window.__directPractice.pause());
      const standard = await run('LEFT');
      assert.equal(standard.timing && standard.platform, true, 'Standard also shows platform line and timing cue');
      await page.evaluate(value => { document.querySelector('[data-assist]').value = value; }, 'advanced');
      await page.evaluate(() => window.__directPractice.restart());
      await page.evaluate(() => window.__directPractice.pause());
      const advanced = await run('RIGHT');
      assert.equal(advanced.timing, false, 'Advanced hides the timing cue');
      assert.equal(advanced.now, false, 'Advanced hides the press-now cue');
      assert.equal(advanced.platform, false, 'Advanced hides the platform facing line');
      // A21: press to pass; the swipe during the windup picks the platform.
      const feedReceive = () => page.evaluate(() => {
        const p = window.__directPractice; p.restart(); p.pause();
        document.querySelector('[data-assist]').value = 'beginner';
        document.querySelector('[data-action]').value = 'receive';
        p.command({ action: 'feed', feedKind: 'receive' }); p.step(1);
      });
      const box = await page.locator('[data-hit]').boundingBox();
      const touch = { id: 23, x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const cdp = await context.newCDPSession(page);
      const read = () => page.evaluate(() => ({ player: window.__directPractice.snapshot().player, choice: document.querySelector('[data-hit]').dataset.passChoice ?? null }));
      await feedReceive();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
      await page.evaluate(() => window.__directPractice.step(1));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...touch, x: touch.x - 30, y: touch.y + 3 }] });
      await page.evaluate(() => window.__directPractice.step(2));
      const holding = await read();
      assert.equal(holding.player.action, 'receive', 'Pressing starts the receive (A21a)');
      assert.equal(holding.player.passType, 'LEFT', 'The swipe during the windup picks the platform');
      assert.equal(holding.choice, 'LEFT', 'The held swipe shows the chosen platform on the button (A21c)');
      // Review r2 H1: the choice label and the timing ring must not share a pseudo-element.
      const layers = await page.evaluate(() => {
        const hit = document.querySelector('[data-hit]');
        hit.classList.add('dp-timing');
        const ring = getComputedStyle(hit, '::after'), label = getComputedStyle(hit, '::before');
        const out = { ringBorder: ring.borderTopWidth, label: label.content, labelHeight: label.height };
        hit.classList.remove('dp-timing');
        return out;
      });
      assert.equal(layers.ringBorder, '3px', 'Timing ring stays drawn while the hit button is held');
      assert.ok(layers.label.includes('偏左') && !layers.label.includes('放開'), `Held choice label is shown without "release" (${layers.label})`);
      assert.ok(parseFloat(layers.labelHeight) > 10, `Held choice label has height (${layers.labelHeight})`);
      await page.screenshot({ path: resolve(output, `${name}-pass-hold.png`) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal((await read()).choice, null, 'The choice label clears on release');
      // A21b: a human tap rests on the glass. Press at every gold tick and lift
      // after 0/3/6/9 ticks; the pass must still come up.
      await feedReceive();
      const golds = await page.evaluate(() => { const p = window.__directPractice, g = []; for (let i = 0; i < 150; i++) { p.step(1); if (p.assistState().timingNow) g.push(p.snapshot().tick); } return g; });
      assert.ok(golds.length >= 5, `Gold cue shows for a receive feed (${golds.length} ticks)`);
      const tapResults = {};
      for (const rest of [0, 3, 6, 9]) {
        let up = 0;
        for (const g of golds) {
          await feedReceive();
          await page.evaluate(n => window.__directPractice.step(n), g - 1);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
          if (rest) await page.evaluate(n => window.__directPractice.step(n), rest);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          const r = await page.evaluate(() => {
            const p = window.__directPractice; let top = 0, contact = null;
            for (let i = 0; i < 150; i++) { p.step(1); const s = p.snapshot(); contact ??= (s.events || []).find(e => e.type === 'contact') ?? null; if (contact) top = Math.max(top, s.ball.y); if (!s.ball.active) break; }
            return Boolean(contact?.active && ['forearm', 'hand'].includes(contact.part) && top > 2);
          });
          if (r) up++;
        }
        tapResults[rest] = `${up}/${golds.length}`;
        assert.ok(up / golds.length >= 10 / 11, `Tap resting ${rest} ticks at gold: pass comes up ${up}/${golds.length}`);
      }
      await cdp.detach();
      // A20e: receive auto-face fixed to half (user choice). Walk off-centre with a
      // live ball and compare the heading with the direction to the setter zone.
      const faceAfterWalk = action => page.evaluate(action => {
        const practice = window.__directPractice;
        practice.restart(); practice.pause();
        document.querySelector('[data-action]').value = action;
        practice.command({ action: 'feed', feedKind: 'receive' }); practice.step(1);
        for (let i = 0; i < 30; i++) { practice.command({ move: { x: 1, z: 0 } }); practice.step(1); }
        const { player, ball } = practice.snapshot();
        const toward = Math.atan2(0 - player.x, -(1.6 - player.z));
        const want = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, toward)), got = Math.atan2(player.aim.x, -player.aim.z);
        return { x: player.x, ballActive: ball.active, off: Math.abs(Math.atan2(Math.sin(got - want), Math.cos(got - want))) * 180 / Math.PI, aim: player.aim };
      }, action);
      assert.equal(await page.locator('[data-face]').count(), 0, 'The receive auto-face trial setting is gone');
      const half = await faceAfterWalk('receive');
      assert.ok(half.ballActive && half.x > 1, `Walked off-centre with a live ball (x ${half.x.toFixed(2)})`);
      assert.ok(half.off < 10, `Receive turns toward the setter zone within 45° (${half.off.toFixed(1)}° off)`);
      assert.ok(Math.abs(half.aim.x) > 0.1, `The heading actually turned (aim.x ${half.aim.x.toFixed(2)})`);
      const spike = await faceAfterWalk('spike');
      assert.deepEqual(spike.aim, { x: 0, z: -1 }, 'Auto-face only applies while receive is selected');
      await page.evaluate(() => { document.querySelector('[data-action]').value = 'receive'; });
      assert.deepEqual(errors, [], 'No browser errors during the pass drill');
      report.scenes.push({ name, width, height, beginner, standard, advanced, pressReceive: { choice: holding.choice, passType: holding.player.passType, tapResults }, result: result.drill.result, errors });
      await context.close();
    }
  }
  if (assistOnly) {
    const aim = { x: Math.sin(35 * Math.PI / 180), z: -Math.cos(35 * Math.PI / 180) };
    for (const [name, width, height] of [['desktop', 1280, 720], ['landscape', 844, 390], ['portrait', 390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(`${base}/?mode=direct&seed=17&quality=high&dpr=1`);
      await page.waitForFunction(() => Boolean(window.__directPractice));
      await page.evaluate(() => window.__directPractice.pause());
      await page.evaluate(direction => {
        const practice = window.__directPractice;
        for (let tick = 0; tick < 29; tick++) {
          practice.command({ aim: direction, action: tick === 0 ? 'feed' : null, feedKind: 'receive' });
          practice.step(1);
        }
        practice.command({ aim: direction, action: 'receive' });
        practice.step(1);
        for (let tick = 30; tick < 38; tick++) {
          practice.command({ aim: direction });
          practice.step(1);
        }
      }, aim);
      const incoming = await page.evaluate(() => window.__directPractice.snapshot());
      assert.equal(incoming.stats.contacts, 0, 'Incoming ball has not contacted before the visible receive');
      assert.ok(Math.abs(incoming.player.receiveTurn) > 0.3, 'The receive visibly turns toward the incoming ball');
      await page.screenshot({ path: resolve(output, `${name}-receive-assist-approach.png`) });
      await page.evaluate(direction => {
        const practice = window.__directPractice;
        for (let tick = 38; tick < 43; tick++) { // direct-v4 contact lands on tick 42 (user-approved)
          practice.command({ aim: direction });
          practice.step(1);
        }
      }, aim);
      const received = await page.evaluate(() => window.__directPractice.snapshot());
      assert.equal(received.stats.contacts, 1, 'A 35-degree offset receive reaches the visible athlete');
      assert.equal(await page.evaluate(() => window.__directPractice.verifyReplay()), true, 'Receive assist replays identically');
      assert.deepEqual(errors, [], 'No browser errors during assisted receive');
      await page.screenshot({ path: resolve(output, `${name}-receive-assist-contact.png`) });
      report.scenes.push({ name, width, height, incomingTurn: incoming.player.receiveTurn,
        contact: received.stats.contacts, replay: true, errors });
      await context.close();
    }
  }
  if (motionOnly) {
    for (const [name, width, height] of [['desktop', 1280, 720], ['landscape', 844, 390], ['portrait', 390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(`${base}/?mode=direct&seed=17&quality=high&dpr=1`);
      await page.waitForFunction(() => Boolean(window.__directPractice));
      await page.evaluate(() => window.__directPractice.pause());
      await page.locator('canvas').first().click({ position: { x: 5, y: height / 2 } });
      await page.keyboard.down('d');
      for (const tick of [12, 18, 24, 30]) {
        await page.evaluate(steps => window.__directPractice.step(steps), tick === 12 ? 12 : 6);
        await page.screenshot({ path: resolve(output, `${name}-motion-run-${tick}.png`) });
      }
      await page.keyboard.up('d');
      await page.evaluate(() => { window.__directPractice.restart(); window.__directPractice.pause(); });
      await page.locator('[data-jump]').click();
      await page.evaluate(() => window.__directPractice.step(8));
      await page.screenshot({ path: resolve(output, `${name}-motion-jump.png`) });
      await page.evaluate(() => {
        for (let i = 0; i < 90 && !window.__directPractice.snapshot().player.grounded; i++) window.__directPractice.step(1);
        window.__directPractice.step(5);
      });
      assert.equal((await page.evaluate(() => window.__directPractice.snapshot())).player.grounded, true);
      await page.screenshot({ path: resolve(output, `${name}-motion-land.png`) });
      for (const action of ['set', 'block', 'dive']) {
        await page.evaluate(() => { window.__directPractice.restart(); window.__directPractice.pause(); });
        await page.locator('.dp-settings > summary').click();
        await page.locator('[data-action]').selectOption(action);
        await page.locator('.dp-settings > summary').click();
        await page.locator('[data-hit]').click();
        await page.evaluate(() => window.__directPractice.step(10));
        await page.screenshot({ path: resolve(output, `${name}-motion-${action}.png`) });
        assert.equal((await page.evaluate(() => window.__directPractice.snapshot())).player.action, action);
      }
      const gestures = [
        ['tip', 0, -40, 'TIP'],
        ['cross-left', -30, 25, 'CROSS_LEFT'],
        ['cross-right', 30, 25, 'CROSS_RIGHT'],
      ];
      const cdp = await context.newCDPSession(page);
      for (const [gesture, dx, dy, shotType] of gestures) {
        await page.evaluate(() => { window.__directPractice.restart(); window.__directPractice.pause(); });
        await page.locator('.dp-settings > summary').click();
        await page.locator('[data-action]').selectOption('spike');
        await page.locator('.dp-settings > summary').click();
        const hit = await page.locator('[data-hit]').boundingBox();
        const start = { id: 19, x: hit.x + hit.width / 2, y: hit.y + hit.height / 2 };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        await page.evaluate(() => window.__directPractice.step(1));
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...start, x: start.x + dx, y: start.y + dy }] });
        await page.evaluate(() => window.__directPractice.step(14));
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const selected = await page.evaluate(() => window.__directPractice.snapshot().player.shotType);
        assert.equal(selected, shotType, `${gesture} selects shot type through a native touch gesture`);
        await page.screenshot({ path: resolve(output, `${name}-motion-${gesture}.png`) });
      }
      await cdp.detach();
      assert.deepEqual(errors, [], 'No browser errors during motion capture');
      report.scenes.push({ name, width, height, actions: ['run', 'jump', 'land', 'set', 'block', 'dive', ...gestures.map(item => item[0])], metrics: await page.evaluate(() => window.__directPractice.metrics()), errors });
      await context.close();
    }
  }
  if (deliveryOnly) {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`${base}/?dpr=1`);
    const entry = page.getByRole('button', { name: '直接操作訓練 · 一人一球', exact: true });
    await entry.waitFor();
    await entry.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, 'menu-entry.png') });
    await entry.click();
    await page.waitForFunction(() => Boolean(window.__directPractice));
    await page.evaluate(() => window.__directPractice.pause());
    await page.locator('.dp-settings > summary').click();
    const build = await page.locator('[data-build]').textContent();
    const downloaded = page.waitForEvent('download');
    await page.locator('[data-export]').click();
    const file = await downloaded;
    const exported = JSON.parse(await readFile(await file.path(), 'utf8'));
    assert.equal(exported.simulationVersion, 'direct-v6');
    assert.ok(exported.environment.userAgent && exported.environment.quality && exported.environment.build);
    assert.equal(typeof exported.environment.standalone, 'boolean');
    assert.ok(exported.performance.sampleWindow.includes('not a full 10-minute match'));
    assert.equal(await page.locator('[data-export]').evaluate(el => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.right - 8, r.y + r.height / 2));
    }), true, 'Settings panel stays above game action controls');
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('#fatal-error').count(), 0);
    await page.screenshot({ path: resolve(output, 'delivery-settings.png') });
    report.delivery = { url: page.url(), build, exportMetadata: true, menuNavigation: true, errors };
    await context.close();
  }
  for (const [name, width, height] of (deliveryOnly || motionOnly || assistOnly || passOnly ? [] : [['desktop', 1280, 720], ['landscape', 844, 390], ['portrait', 390, 844]])) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`${base}/?mode=direct&seed=17&quality=high&dpr=1`);
    await page.waitForFunction(() => Boolean(window.__directPractice));
    await page.waitForTimeout(3500);
    const initialPerformance = await page.evaluate(() => window.__directPractice.metrics());
    assert.equal(await page.locator('#fatal-error').count(), 0, 'No fatal overlay');
    await page.evaluate(() => window.__directPractice.pause());
    const start = await page.evaluate(() => window.__directPractice.snapshot());
    await page.screenshot({ path: resolve(output, `${name}-ready.png`) });
    const layout = await page.locator('.dp-root button:visible,.dp-root select:visible,.dp-move,.dp-aim').evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect();
      return { label: el.getAttribute('aria-label') || el.textContent.trim(), x: r.x, y: r.y, width: r.width, height: r.height };
    }));
    for (const box of layout) {
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, `control within viewport: ${box.label}`);
    }
    // Real keyboard event path -> input adapter -> simulation -> recorded replay.
    await page.locator('[data-feed]').click();
    await page.evaluate(() => window.__directPractice.step(1));
    assert.equal((await page.evaluate(() => window.__directPractice.snapshot())).stats.feeds, 1);
    await page.locator('canvas').first().click({ position: { x: 5, y: height / 2 } });
    await page.keyboard.down('d');
    // sample while paused (step does not fabricate input values).
    await page.evaluate(() => window.__directPractice.step(30));
    await page.keyboard.up('d');
    const moved = await page.evaluate(() => window.__directPractice.snapshot());
    assert.ok(moved.player.x > start.player.x, 'Keyboard moves the physical player');
    await page.locator('[data-jump]').click();
    await page.evaluate(() => window.__directPractice.step(8));
    const jumped = await page.evaluate(() => window.__directPractice.snapshot());
    assert.ok(jumped.player.y > 0, 'Independent jump has physical height');
    await page.screenshot({ path: resolve(output, `${name}-jump.png`) });
    await page.evaluate(() => window.__directPractice.step(70));
    assert.equal(await page.evaluate(() => window.__directPractice.verifyReplay()), true, 'Actual input tape reproduces all state');
    // Two touch pointers move and aim together; cancel both without leaving held movement.
    const move = await page.locator('[data-move]').boundingBox();
    const aim = await page.locator('[data-aim]').boundingBox();
    const beforeTouch = await page.evaluate(() => window.__directPractice.snapshot());
    const cdp = await context.newCDPSession(page);
    const left = { id: 11, x: move.x + move.width / 2, y: move.y + move.height / 2 };
    const right = { id: 12, x: aim.x + 10, y: aim.y + 10 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...left, x: left.x + 40 }, { ...right, x: right.x + 60 }] });
    await page.evaluate(() => window.__directPractice.step(12));
    const duringTouch = await page.evaluate(() => window.__directPractice.snapshot());
    assert.ok(duringTouch.player.x > beforeTouch.player.x, 'Native touch pointer moves the player');
    assert.ok(duringTouch.player.aim.x > beforeTouch.player.aim.x, 'Second simultaneous native touch changes aim');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.evaluate(() => window.__directPractice.step(30));
    await cdp.detach();
    const cancelled = await page.evaluate(() => window.__directPractice.snapshot());
    assert.ok(Math.abs(cancelled.player.vx) < 0.01 && Math.abs(cancelled.player.vz) < 0.01, 'Cancelled input stops movement after braking');
    assert.equal(await page.evaluate(() => window.__directPractice.verifyReplay()), true);
    // Restart creates a fresh input timeline. Then exercise real, repeatable feeds
    // and timed UI actions, rather than setting the ball into a convenient fixture.
    let received;
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.evaluate(() => { window.__directPractice.restart(); window.__directPractice.pause(); });
      await page.locator('[data-feed]').click();
      await page.evaluate(() => window.__directPractice.step(29));
      await page.locator('[data-hit]').click();
      await page.evaluate(() => window.__directPractice.step(14)); // direct-v4 platform contact lands two ticks later (user-approved)
      received = await page.evaluate(() => window.__directPractice.snapshot());
      assert.equal(received.stats.contacts, 1, 'Fixed receive feed reaches a real body contact');
      assert.ok(received.ball.vy > 0 && received.ball.vz < 0, `Timed receive sends the ball forward and up: ${JSON.stringify({ name, attempt, tick: received.tick, player: received.player, ball: received.ball })}`);
    }
    await page.screenshot({ path: resolve(output, `${name}-receive.png`) });
    assert.equal(await page.evaluate(() => window.__directPractice.verifyReplay()), true);
    await page.evaluate(() => { window.__directPractice.restart(); window.__directPractice.pause(); });
    await page.locator('.dp-settings > summary').click();
    await page.locator('[data-feed-kind]').selectOption('spike');
    await page.locator('.dp-settings > summary').click();
    await page.locator('[data-action]').selectOption('spike');
    await page.locator('[data-feed]').click();
    await page.evaluate(() => window.__directPractice.step(6));
    await page.locator('[data-jump]').click();
    await page.evaluate(() => window.__directPractice.step(2));
    await page.locator('[data-hit]').click();
    await page.evaluate(() => window.__directPractice.step(18));
    const spiked = await page.evaluate(() => window.__directPractice.snapshot());
    assert.equal(spiked.stats.contacts, 1, 'Run the actual high feed through jump and swing');
    assert.ok(spiked.ball.vy < 0 && spiked.ball.vz < 0, 'A real airborne contact spikes forward and down');
    await page.screenshot({ path: resolve(output, `${name}-spike.png`) });
    assert.equal(await page.evaluate(() => window.__directPractice.verifyReplay()), true);
    await page.locator('.dp-settings > summary').click();
    for (const fps of [30, 60, 120]) {
      await page.locator('[data-replay]').click();
      assert.equal(await page.evaluate(fps => window.__directPractice.verifyPlaybackAtRate(fps), fps), true, `Actual app loop replays identically at ${fps} Hz`);
      await page.locator('[data-replay]').click();
      await page.evaluate(() => window.__directPractice.pause());
    }
    const metrics = await page.evaluate(() => window.__directPractice.metrics());
    assert.deepEqual(errors, [], 'No browser errors');
    report.scenes.push({ name, width, height, layout, initialPerformance, syntheticPlaybackMetrics: metrics, feed: moved.stats.feeds, jumpHeight: jumped.player.y, receiveRepeats: 5, receiveVelocity: { y: received.ball.vy, z: received.ball.vz }, spikeVelocity: { y: spiked.ball.vy, z: spiked.ball.vz }, replayRates: [30, 60, 120], replay: true, errors });
    await page.evaluate(() => window.__directPractice.dispose());
    assert.equal(await page.locator('.dp-root').count(), 0, 'Disposal removes UI');
    await context.close();
  }
  console.log(deliveryOnly ? `PASS delivery: menu navigation, direct practice, export metadata; ${report.delivery.build}` : motionOnly ? `PASS motion: ${report.scenes.length} viewports with run, jump, land, set, block, dive captures` : assistOnly ? `PASS assist: ${report.scenes.length} viewports with visible receive turn, contact, replay` : passOnly ? `PASS pass: ${report.scenes.length} viewports with platform line, timing cue, drill result, replay; advanced hides hints` : `PASS ${report.scenes.length} viewports: real input, jump, cancel, replay, layout, disposal`);
} finally {
  await writeFile(resolve(output, deliveryOnly ? 'delivery-browser.json' : motionOnly ? 'motion-browser.json' : assistOnly ? 'assist-browser.json' : passOnly ? 'pass-browser.json' : 'browser-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
