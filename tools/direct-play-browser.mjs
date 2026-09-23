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
try {
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
    assert.equal(exported.simulationVersion, 'direct-v2');
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
  for (const [name, width, height] of (deliveryOnly || motionOnly ? [] : [['desktop', 1280, 720], ['landscape', 844, 390], ['portrait', 390, 844]])) {
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
      await page.evaluate(() => window.__directPractice.step(12));
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
  console.log(deliveryOnly ? `PASS delivery: menu navigation, direct practice, export metadata; ${report.delivery.build}` : motionOnly ? `PASS motion: ${report.scenes.length} viewports with run, jump, land, set, block, dive captures` : `PASS ${report.scenes.length} viewports: real input, jump, cancel, replay, layout, disposal`);
} finally {
  await writeFile(resolve(output, deliveryOnly ? 'delivery-browser.json' : motionOnly ? 'motion-browser.json' : 'browser-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
