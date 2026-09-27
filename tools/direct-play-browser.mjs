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
const FEED_DELAY = 90; // direct-v7 A24a countdown, ticks
const VERSION = 'direct-v8.1';
// DIRECT_VIEWPORTS=desktop[,landscape,portrait] limits the viewports (round-4 old-code red run only; the evidence runs use all three).
const VIEWPORTS = [['desktop', 1280, 720], ['landscape', 844, 390], ['portrait', 390, 844]].filter(([name]) => (process.env.DIRECT_VIEWPORTS || 'desktop,landscape,portrait').split(',').includes(name));
// The practice assignment lives in the settings panel (direct-v8, R10).
async function assign(page, action) {
  await page.locator('.dp-settings > summary').click();
  await page.locator('[data-action]').selectOption(action);
  await page.locator('.dp-settings > summary').click();
}
try {
  if (passOnly) {
    // direct-v4 A8-A10 cues, direct-v8 R9 (slow motion) and R10 (contextual hit button).
    for (const [name, width, height] of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${base}/?mode=direct&seed=17&quality=high&dpr=1`);
      await page.waitForFunction(() => Boolean(window.__directPractice));
      await page.evaluate(() => window.__directPractice.pause());
      // Cues on the receive feed: timing ring, press-now, platform line, touch point and reach circle.
      const run = () => page.evaluate(() => {
        const practice = window.__directPractice, seen = { timing: false, now: false, platform: false, reach: false, touch: false };
        for (let tick = 0; tick < 29; tick++) {
          practice.command({ action: tick === 0 ? 'feed' : null, feedKind: 'receive' });
          practice.step(1);
          const a = practice.assistState();
          seen.timing ||= a.timingActive; seen.now ||= a.timingNow; seen.reach ||= a.reachVisible; seen.touch ||= a.touchVisible;
        }
        practice.command({ action: 'receive' });
        practice.step(1);
        for (let tick = 0; tick < 12; tick++) { practice.step(1); seen.platform ||= practice.assistState().platformVisible; }
        return seen;
      });
      await page.evaluate(value => { document.querySelector('[data-assist]').value = value; }, 'beginner');
      const beginner = await run();
      assert.equal(beginner.timing, true, 'Beginner shows the receive timing cue');
      assert.equal(beginner.platform, true, 'Beginner shows the platform facing line');
      assert.equal(beginner.now, true, 'Beginner shows the exact press-now cue before the receive');
      assert.equal(beginner.reach && beginner.touch, true, 'Beginner shows the reach circle and the touch point');
      await page.screenshot({ path: resolve(output, `${name}-pass-platform.png`) });
      const passed = await page.evaluate(() => { const p = window.__directPractice; let contact = null; for (let i = 0; i < 200 && !contact; i++) { p.step(1); contact = (p.snapshot().events || []).find(e => e.type === 'contact') ?? null; } return { contact, message: p.assistState().message }; });
      assert.ok(passed.contact?.tier, `The receive is judged with a tier (${JSON.stringify(passed.contact)})`);
      assert.ok(passed.message.includes('低手') || passed.message.includes('高手'), `Result text is shown to the player (${passed.message})`);
      assert.equal(await page.evaluate(() => window.__directPractice.verifyReplay()), true, 'Judged receive replays identically');
      await page.screenshot({ path: resolve(output, `${name}-pass-result.png`) });
      await page.evaluate(value => { document.querySelector('[data-assist]').value = value; }, 'standard');
      await page.evaluate(() => window.__directPractice.restart());
      await page.evaluate(() => window.__directPractice.pause());
      const standard = await run();
      assert.equal(standard.timing && standard.platform, true, 'Standard also shows platform line and timing cue');
      await page.evaluate(value => { document.querySelector('[data-assist]').value = value; }, 'advanced');
      await page.evaluate(() => window.__directPractice.restart());
      await page.evaluate(() => window.__directPractice.pause());
      const advanced = await run();
      assert.equal(advanced.timing, false, 'Advanced hides the timing cue');
      assert.equal(advanced.now, false, 'Advanced hides the press-now cue');
      assert.equal(advanced.platform, false, 'Advanced hides the platform facing line');
      assert.equal(advanced.reach || advanced.touch, false, 'Advanced hides the reach circle and the touch point');
      // R10: no action select on the main screen; the hit button names its action
      // and the simulation executes exactly that, for a receive and for a dive.
      assert.equal(await page.locator('.dp-actions select').count(), 0, 'No action select on the main screen');
      assert.equal(await page.locator('.dp-settings [data-action]').count(), 1, 'The practice assignment lives in the settings');
      assert.equal(await page.locator('[data-action]').inputValue(), 'auto', 'The assignment defaults to automatic');
      assert.equal(await page.locator('[data-face]').count(), 0, 'The receive auto-face trial setting is gone');
      const feedAt = (kind, x, z) => page.evaluate(([kind, x, z]) => {
        const p = window.__directPractice; p.restart(); p.pause();
        document.querySelector('[data-assist]').value = 'beginner';
        p.command({ action: 'feed', feedKind: kind }); p.step(1);
        // Walk the athlete to the stance with real move commands (the ball is already in the air).
        for (let i = 0; i < 40; i++) { const s = p.snapshot().player; const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz); if (d < 0.05) break; p.command({ move: { x: dx / Math.max(d, 0.3), z: dz / Math.max(d, 0.3) } }); p.step(1); }
        p.command({ move: { x: 0, z: 0 } }); p.step(1);
        return p.snapshot().tick;
      }, [kind, x, z]);
      const box = await page.locator('[data-hit]').boundingBox();
      const touch = { id: 23, x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const cdp = await context.newCDPSession(page);
      const contextual = {};
      for (const [label, kind, x, z, expected] of [['receive', 'receive', 0, 4.9, 'receive'], ['dive', 'receive', 1.4, 4.9, 'dive']]) {
        await feedAt(kind, x, z);
        // Step until the label says what we expect (the ball must be descending toward the stance).
        const rows = await page.evaluate(expected => {
          const p = window.__directPractice, rows = [];
          for (let i = 0; i < 60; i++) { rows.push({ tick: p.snapshot().tick, action: p.assistState().hitAction, label: p.assistState().hitLabel }); if (p.assistState().hitAction === expected && p.assistState().timingActive) break; p.step(1); }
          return rows;
        }, expected);
        const last = rows.at(-1);
        assert.equal(last.action, expected, `${label}: hit button resolves to ${expected} (${JSON.stringify(last)})`);
        assert.ok(last.label.includes(expected === 'dive' ? '魚躍' : '接球'), `${label}: label text names the action (${last.label})`);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
        await page.evaluate(() => window.__directPractice.step(1));
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const started = await page.evaluate(() => window.__directPractice.snapshot().player.action);
        assert.equal(started, expected, `${label}: the simulation started the labelled action (${started})`);
        contextual[label] = { label: last.label, started };
        await page.screenshot({ path: resolve(output, `${name}-context-${label}.png`) });
      }
      // R10, every tick (second round, C1): the same ball and scripted walk are
      // replayed from a fresh start up to each tick 1..70. On that tick the
      // button's data-does and text are read, then the button is pressed for
      // real (touch) and the action the sim starts must be the one the button
      // named on that tick. The walk crosses the dive band, so both occur.
      const walkTo = tick => page.evaluate(tick => {
        const p = window.__directPractice; p.restart(); p.pause();
        document.querySelector('[data-assist]').value = 'beginner';
        p.command({ action: 'feed', feedKind: 'receive' }); p.step(1);
        for (let i = 1; i < tick; i++) { p.command({ move: { x: i < 20 ? 0 : 0.7, z: 0 } }); p.step(1); }
        const s = p.snapshot(), a = p.assistState();
        return { tick: s.tick, does: a.hitAction, label: a.hitLabel, live: s.ball.active && !s.player.action };
      }, tick);
      const perTick = { checked: 0, pressed: 0, mismatched: 0, dives: 0, receives: 0, rows: [] };
      for (let t = 1; t <= 70; t++) {
        const before = await walkTo(t);
        if (!before.live) break;
        perTick.checked++;
        if (before.does === 'dive') perTick.dives++; else if (before.does === 'receive') perTick.receives++;
        const named = before.label.includes(before.does === 'dive' ? '魚躍' : before.does === 'receive' ? '接球' : '∅');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
        await page.evaluate(() => window.__directPractice.step(1));
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const started = await page.evaluate(() => window.__directPractice.snapshot().player.action);
        perTick.pressed++;
        if (started !== before.does || !named) {
          perTick.mismatched++;
          if (perTick.rows.length < 8) perTick.rows.push({ tick: before.tick, does: before.does, label: before.label, started });
        }
      }
      assert.ok(perTick.checked >= 20, `per-tick label check ran (${perTick.checked})`);
      assert.ok(perTick.dives > 0 && perTick.receives > 0, `both receive and dive occur on the walk (${JSON.stringify(perTick)})`);
      assert.equal(perTick.mismatched, 0, `hit button (data-does/text) vs the action the sim started on a real press, per tick: ${perTick.mismatched}/${perTick.pressed} differ ${JSON.stringify(perTick.rows)}`);
      // Tap resting on the glass (A21b): press at every gold tick and lift after 0/3/6/9 ticks; the pass must come up.
      const feedReceive = () => page.evaluate(() => {
        const p = window.__directPractice; p.restart(); p.pause();
        document.querySelector('[data-assist]').value = 'beginner';
        p.command({ action: 'feed', feedKind: 'receive' }); p.step(1);
      });
      await feedReceive();
      const golds = await page.evaluate(() => { const p = window.__directPractice, g = []; for (let i = 0; i < 150; i++) { p.step(1); if (p.assistState().timingNow) g.push(p.snapshot().tick); } return g; });
      assert.ok(golds.length >= 5, `Gold cue shows for a receive feed (${golds.length} ticks)`);
      const tapResults = {};
      // Track the judged touch and the pass apex while the finger rests and after
      // it lifts: `already` says a touch was seen in an earlier segment, so the
      // apex keeps accumulating after the lift (the ball is still in the air).
      const track = (n, already) => page.evaluate(([n, already]) => {
        const p = window.__directPractice; let top = 0, contact = null;
        for (let i = 0; i < n; i++) { p.step(1); const s = p.snapshot(); contact ??= (s.events || []).find(e => e.type === 'contact') ?? null; if (contact || already) top = Math.max(top, s.ball.y); if (!s.ball.active) break; }
        return { tier: contact?.tier ?? null, touched: Boolean(contact), top };
      }, [n, already]);
      for (const rest of [0, 3, 6, 9]) {
        let up = 0;
        for (const g of golds) {
          await feedReceive();
          await page.evaluate(n => window.__directPractice.step(n), g - 1);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
          const held = rest ? await track(rest, false) : { tier: null, touched: false, top: 0 };
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          const lifted = await track(150, held.touched);
          // The first touch of this ball decides: a judged pass (tier) either while held or after the lift.
          const tier = held.touched ? held.tier : lifted.tier;
          if (tier && Math.max(held.top, lifted.top) > 2) up++;
        }
        tapResults[rest] = `${up}/${golds.length}`;
        assert.ok(up / golds.length >= 10 / 11, `Tap resting ${rest} ticks at gold: pass comes up ${up}/${golds.length}`);
      }
      await cdp.detach();
      // R9 (second round, H3): one scripted tape (hard serve at tick 0, a
      // 20-tick walk to the back line where the serve's dive-height point is
      // 0.7 m ahead of the platform, dive at tick 45) is run twice through the
      // real frame() loop with a synthetic 60 Hz clock, slow motion on and off,
      // up to the same tick. The sim event log and the final state must be
      // identical bit for bit. On, the picture runs at 0.5x before the
      // judgement (12 frames advance about 6 ticks; off, about 12).
      const slowRun = async enabled => page.evaluate(enabled => {
        const p = window.__directPractice; p.restart(); p.pause();
        document.querySelector('[data-slowmo]').checked = enabled;
        p.command({ at: 0, action: 'feed', feedKind: 'serve' });
        for (let t = 1; t <= 20; t++) p.command({ at: t, move: { x: 0, z: 1 } });
        p.command({ at: 21, move: { x: 0, z: 0 } });
        p.command({ at: 45, action: 'dive' });
        let armed = null, scale = null, ticks = null, frames = 0, slowFrames = 0;
        while (p.snapshot().tick < 160 && frames < 1000) {
          const s = p.snapshot();
          if (armed === null && Math.hypot(s.ball.vx, s.ball.vy, s.ball.vz) >= 13 && s.ball.y < 2.4 && s.ball.z > 3) {
            armed = s.tick; scale = p.assistState().slowMotion; ticks = p.frames(12, 60); frames += 12; continue;
          }
          if (p.assistState().slowMotion < 1) slowFrames++;
          p.frames(1, 60); frames++;
        }
        const s = p.snapshot();
        return { armed, scale, ticks, frames, slowFrames, tick: s.tick, playerZ: s.player.z, slowMotionTicks: p.metrics().slowMotionTicks, events: JSON.stringify(p.events()), state: JSON.stringify(s) };
      }, enabled);
      const slowOn = await slowRun(true), slowOff = await slowRun(false);
      assert.ok(slowOn.armed !== null && slowOn.armed === slowOff.armed, `The serve reaches the passer as a hard ball at the same tick (${slowOn.armed} / ${slowOff.armed})`);
      assert.equal(slowOn.tick, 160, `slow-motion run reached tick 160 (${slowOn.tick})`);
      assert.equal(slowOff.tick, 160, `full-speed run reached tick 160 (${slowOff.tick})`);
      assert.equal(slowOn.events, slowOff.events, 'Slow motion on/off: the sim event log differs');
      assert.equal(slowOn.state, slowOff.state, 'Slow motion on/off: the final sim state differs');
      const slowEvents = JSON.parse(slowOn.events);
      assert.ok(slowEvents.some(e => e.type === 'contact' && e.technique === 'dive' && e.tier), `The tape contains a judged dive (${slowOn.events})`);
      assert.equal(slowOn.scale, 0.5, `Slow motion scale 0.5 on a hard serve in range (${JSON.stringify({ ...slowOn, events: undefined, state: undefined })})`);
      assert.ok(slowOn.ticks >= 5 && slowOn.ticks <= 7, `12 frames at 60 Hz advance about 6 ticks in slow motion (${slowOn.ticks})`);
      assert.ok(slowOn.slowMotionTicks > 0 && slowOn.slowFrames > 0, `Slow-motion ticks were counted (${slowOn.slowMotionTicks} ticks, ${slowOn.slowFrames} frames)`);
      assert.equal(slowOff.scale, 1, 'Slow motion off: scale 1');
      assert.ok(slowOff.ticks >= 11 && slowOff.ticks <= 13, `12 frames at 60 Hz advance about 12 ticks at full speed (${slowOff.ticks})`);
      assert.equal(slowOff.slowMotionTicks, 0, 'Slow motion off: no slow-motion ticks');
      const slowSummary = run => ({ ...run, events: undefined, state: undefined, eventCount: JSON.parse(run.events).length, contacts: JSON.parse(run.events).filter(e => e.type === 'contact').map(e => `${e.tick}:${e.technique}/${e.tier}`) });
      await page.screenshot({ path: resolve(output, `${name}-slowmo.png`) });
      // U3 / V5 (round 4): on the judgement tick the sim moves the ball onto the
      // body (R6). The drawn ball must not jump: on that frame it stays where
      // free flight would have put it, then closes on the sim ball by at most
      // 0.12 m per frame, monotonically, within 10 frames. Measured through the
      // real frame() loop at a synthetic 60 Hz on the receive feed, 21 stances
      // in the underhand circle x three classes (timed receive, early receive =
      // spray, no press), smoothing on; then the same tape with smoothing off:
      // the sim event log and final state must be identical, and the drawn ball
      // then equals the sim ball on every frame.
      const snapRun = enabled => page.evaluate(enabled => {
        const p = window.__directPractice;
        const stances = []; for (const x of [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3]) for (const z of [4.8, 4.95, 5.1]) stances.push([x, z]);
        // One or more ticks of free flight at the sim's substep scheme (where the ball goes when nothing touches it).
        const free = (b, ticks) => { const dt = (1 / 60) / 16; let { x, y, z, vx, vy, vz } = b; for (let n = 0; n < ticks; n++) for (let i = 0; i < 16; i++) { vy -= 9.81 * dt; x += vx * dt; y += vy * dt; z += vz * dt; } return { x, y, z }; };
        const picture = () => { const s = p.snapshot(); return p.picture ? p.picture() : { shown: { x: s.ball.x, y: s.ball.y, z: s.ball.z }, sim: { x: s.ball.x, y: s.ball.y, z: s.ball.z }, tick: s.tick, offset: 0 }; };
        const setup = (x, z) => {
          p.restart(); p.pause();
          const smooth = document.querySelector('[data-smooth]'); if (smooth) smooth.checked = enabled;
          document.querySelector('[data-assist]').value = 'beginner';
          p.command({ action: 'feed', feedKind: 'receive' }); p.step(1);
          for (let i = 0; i < 40; i++) { const s = p.snapshot().player; const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz); if (d < 0.05) break; p.command({ move: { x: dx / Math.max(d, 0.3), z: dz / Math.max(d, 0.3) } }); p.step(1); }
          p.command({ move: { x: 0, z: 0 } }); p.step(1);
        };
        // The judgement tick of each stance, from an unpressed run stepped tick by tick.
        const cases = [];
        for (const [x, z] of stances) {
          setup(x, z);
          let tj = null;
          for (let i = 0; i < 260 && tj === null; i++) { p.step(1); const c = p.events().find(e => e.type === 'contact'); if (c) tj = c.tick; if (!p.snapshot().ball.active) break; }
          if (tj === null) continue;
          // 'dive' (round 5, W2): 魚躍 pressed at a ball in the underhand circle = a pressed spray (U2).
          for (const [cls, pressAt, action] of [['none', null, null], ['pass', tj - 12, 'receive'], ['spray', tj - 20, 'receive'], ['dive', tj - 12, 'dive']]) cases.push({ x, z, cls, tj, pressAt, action });
        }
        const results = [];
        for (const c of cases) {
          setup(c.x, c.z);
          if (c.pressAt != null) p.command({ at: c.pressAt, action: c.action });
          while (p.snapshot().tick < c.tj - 15) p.step(1);
          const frames = []; let contactFrame = null, contact = null, seen = p.events().length;
          for (let f = 0; f < 40; f++) {
            const ballBefore = { ...p.snapshot().ball };
            const advanced = p.frames(1, 60);
            const pic = picture(), log = p.events();
            const fresh = log.slice(seen); seen = log.length;
            const ev = fresh.find(e => e.type === 'contact');
            const row = { f, tick: pic.tick, advanced, e: Math.hypot(pic.shown.x - pic.sim.x, pic.shown.y - pic.sim.y, pic.shown.z - pic.sim.z),
              reachLag: pic.reach ? Math.hypot(pic.reach.shown.side - pic.reach.sim.side, pic.reach.shown.ahead - pic.reach.sim.ahead) : 0 };
            if (ev && contactFrame === null) {
              contactFrame = f;
              contact = { tick: ev.tick, tier: ev.tier ?? null, spray: !!ev.spray, timing: ev.timing ?? null, technique: ev.technique ?? null, part: ev.part, snap: ev.snapFrom ? Math.hypot(ev.snapFrom.x - ev.position.x, ev.snapFrom.y - ev.position.y, ev.snapFrom.z - ev.position.z) : null };
              const expect = free(ballBefore, advanced);
              row.jump = Math.hypot(pic.shown.x - expect.x, pic.shown.y - expect.y, pic.shown.z - expect.z);
            }
            frames.push(row);
            if (contactFrame !== null && f >= contactFrame + 12) break;
          }
          results.push({ ...c, contactFrame, contact, frames, events: JSON.stringify(p.events()), state: JSON.stringify(p.snapshot()) });
        }
        return results;
      }, enabled);
      // The frame-by-frame measurement renders ~20k frames; it runs on the
      // desktop viewport only (the picture offset is viewport-independent).
      const snapSummary = name !== 'desktop' ? 'measured on desktop only' : await (async () => {
      const snapOn = await snapRun(true), snapOff = await snapRun(false);
      const snapStats = { classes: {}, maxJump: 0, maxDrop: 0, maxSettle: 0, snap: [] };
      for (const c of snapOn) {
        const tag = `stance (${c.x}, ${c.z}) ${c.cls}`;
        assert.ok(c.contactFrame !== null && c.contact, `${tag}: no judged touch in the framed window`);
        const kind = c.contact.tier ? 'pass' : c.contact.spray ? (c.contact.timing === 'none' ? 'none' : c.contact.timing === 'dive' ? 'dive' : 'spray') : 'body';
        assert.equal(kind, c.cls, `${tag}: expected a ${c.cls}, got ${JSON.stringify(c.contact)}`);
        const at = c.frames[c.contactFrame];
        for (const row of c.frames.slice(0, c.contactFrame)) assert.ok(row.e <= 0.01, `${tag}: drawn ball off the sim ball before the judgement (frame ${row.f}, ${row.e.toFixed(3)} m)`);
        if (at.advanced === 1) {
          assert.ok(at.jump <= 0.01, `${tag}: the drawn ball jumped ${at.jump.toFixed(3)} m on the judgement frame (sim snap ${c.contact.snap?.toFixed(3) ?? '?'} m)`);
          snapStats.maxJump = Math.max(snapStats.maxJump, at.jump);
        }
        let settle = null;
        for (let f = c.contactFrame + 1; f < c.frames.length; f++) {
          const prev = c.frames[f - 1].e, cur = c.frames[f].e;
          assert.ok(cur <= prev + 1e-9, `${tag}: offset grew after the judgement (frame ${f - c.contactFrame}: ${prev.toFixed(3)} → ${cur.toFixed(3)} m)`);
          assert.ok(prev - cur <= 0.12 + 1e-6, `${tag}: offset closed ${(prev - cur).toFixed(3)} m in one frame (> 0.12)`);
          snapStats.maxDrop = Math.max(snapStats.maxDrop, prev - cur);
          if (settle === null && cur <= 0.01) settle = f - c.contactFrame;
        }
        if (at.e <= 0.01) settle = 0;
        assert.ok(settle !== null && settle <= 10, `${tag}: drawn ball not back on the sim ball within 10 frames (e ${c.frames.slice(c.contactFrame).map(r => r.e.toFixed(2)).join(' ')})`);
        snapStats.maxSettle = Math.max(snapStats.maxSettle, settle);
        const cls = snapStats.classes[c.cls] ??= { n: 0, e0: [] };
        cls.n++; cls.e0.push(at.e);
        snapStats.snap.push(at.e);
      }
      for (const cls of ['pass', 'spray', 'none', 'dive']) assert.ok((snapStats.classes[cls]?.n ?? 0) >= 20, `${cls}: ${snapStats.classes[cls]?.n ?? 0} cases (need 20)`);
      assert.ok(snapOn.filter(c => c.frames[c.contactFrame]?.advanced === 1).length >= 60, 'the judgement frame advanced exactly one tick in at least 60 cases');
      assert.equal(snapOff.length, snapOn.length, 'smoothing off ran the same cases');
      for (let i = 0; i < snapOn.length; i++) {
        assert.equal(snapOff[i].events, snapOn[i].events, `smoothing on/off: the sim event log differs (${snapOn[i].cls} at (${snapOn[i].x}, ${snapOn[i].z}))`);
        assert.equal(snapOff[i].state, snapOn[i].state, `smoothing on/off: the final sim state differs (${snapOn[i].cls} at (${snapOn[i].x}, ${snapOn[i].z}))`);
        for (const row of snapOff[i].frames) assert.ok(row.e <= 0.01, `smoothing off: drawn ball off the sim ball (frame ${row.f}, ${row.e.toFixed(3)} m)`);
      }
      const q = (arr, k) => { const a = [...arr].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(k * (a.length - 1)))] : NaN; };
      const reachLag = Math.max(0, ...snapOn.flatMap(c => c.frames.map(r => r.reachLag ?? 0)));
      return { cases: snapOn.length, maxDrawnReachLag: reachLag, byClass: Object.fromEntries(Object.entries(snapStats.classes).map(([k, v]) => [k, { n: v.n, e0: { min: Math.min(...v.e0), median: q(v.e0, 0.5), p95: q(v.e0, 0.95), max: Math.max(...v.e0) } }])), maxJumpOnJudgementFrame: snapStats.maxJump, maxClosePerFrame: snapStats.maxDrop, maxFramesToSettle: snapStats.maxSettle, identicalOnOff: true };
      })();
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
      const half = await faceAfterWalk('receive');
      assert.ok(half.ballActive && half.x > 1, `Walked off-centre with a live ball (x ${half.x.toFixed(2)})`);
      assert.ok(half.off < 10, `Receive turns toward the setter zone within 45° (${half.off.toFixed(1)}° off)`);
      assert.ok(Math.abs(half.aim.x) > 0.1, `The heading actually turned (aim.x ${half.aim.x.toFixed(2)})`);
      const spike = await faceAfterWalk('spike');
      assert.deepEqual(spike.aim, { x: 0, z: -1 }, 'Auto-face only applies while the hit button would receive');
      await page.evaluate(() => { document.querySelector('[data-action]').value = 'auto'; });
      assert.deepEqual(errors, [], 'No browser errors during the pass drill');
      report.scenes.push({ name, width, height, beginner, standard, advanced, contextual, perTick, tapResults, slowMotion: { on: slowSummary(slowOn), off: slowSummary(slowOff), identical: slowOn.events === slowOff.events && slowOn.state === slowOff.state }, snapSmoothing: snapSummary, errors });
      await context.close();
    }
  }
  if (assistOnly) {
    const aim = { x: Math.sin(35 * Math.PI / 180), z: -Math.cos(35 * Math.PI / 180) };
    for (const [name, width, height] of VIEWPORTS) {
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
        for (let tick = 38; tick < 43; tick++) { // the judgement lands on tick 42 (platform height)
          practice.command({ aim: direction });
          practice.step(1);
        }
      }, aim);
      const received = await page.evaluate(() => window.__directPractice.snapshot());
      assert.equal(received.stats.contacts, 1, 'A 35-degree offset receive is judged at the platform height');
      assert.equal(await page.evaluate(() => window.__directPractice.verifyReplay()), true, 'Receive assist replays identically');
      assert.deepEqual(errors, [], 'No browser errors during assisted receive');
      await page.screenshot({ path: resolve(output, `${name}-receive-assist-contact.png`) });
      report.scenes.push({ name, width, height, incomingTurn: incoming.player.receiveTurn,
        contact: received.stats.contacts, replay: true, errors });
      await context.close();
    }
  }
  if (motionOnly) {
    for (const [name, width, height] of VIEWPORTS) {
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
        await assign(page, action);
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
        await assign(page, 'spike');
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
    assert.ok(build.startsWith(VERSION), `Public build string is ${VERSION} (${build})`);
    const downloaded = page.waitForEvent('download');
    await page.locator('[data-export]').click();
    const file = await downloaded;
    const exported = JSON.parse(await readFile(await file.path(), 'utf8'));
    assert.equal(exported.simulationVersion, VERSION);
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
  for (const [name, width, height] of (deliveryOnly || motionOnly || assistOnly || passOnly ? [] : VIEWPORTS)) {
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
    // direct-v7 A24a: a button feed launches after the countdown (FEED_DELAY ticks).
    await page.evaluate(n => window.__directPractice.step(n), 1 + FEED_DELAY);
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
      await page.evaluate(n => window.__directPractice.step(n), 29 + FEED_DELAY);
      await page.locator('[data-hit]').click();
      await page.evaluate(() => window.__directPractice.step(14)); // the judgement lands on tick 42 after the feed
      received = await page.evaluate(() => window.__directPractice.snapshot());
      assert.equal(received.stats.contacts, 1, 'Fixed receive feed is judged as a touch');
      assert.ok(received.ball.vy > 0 && received.ball.vz < 0, `Timed receive sends the ball forward and up: ${JSON.stringify({ name, attempt, tick: received.tick, player: received.player, ball: received.ball })}`);
    }
    await page.screenshot({ path: resolve(output, `${name}-receive.png`) });
    assert.equal(await page.evaluate(() => window.__directPractice.verifyReplay()), true);
    await page.evaluate(() => { window.__directPractice.restart(); window.__directPractice.pause(); });
    await page.locator('.dp-settings > summary').click();
    await page.locator('[data-feed-kind]').selectOption('spike');
    await page.locator('[data-action]').selectOption('spike');
    await page.locator('.dp-settings > summary').click();
    await page.locator('[data-feed]').click();
    await page.evaluate(n => window.__directPractice.step(n), 6 + FEED_DELAY);
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
  console.log(deliveryOnly ? `PASS delivery: menu navigation, direct practice, export metadata; ${report.delivery.build}` : motionOnly ? `PASS motion: ${report.scenes.length} viewports with run, jump, land, set, block, dive captures` : assistOnly ? `PASS assist: ${report.scenes.length} viewports with visible receive turn, contact, replay` : passOnly ? `PASS pass: ${report.scenes.length} viewports with cues, contextual hit button (receive/dive), slow motion 0.5x/1x, judgement snap smoothed in the picture only, tap resting, replay; advanced hides hints` : `PASS ${report.scenes.length} viewports: real input, jump, cancel, replay, layout, disposal`);
} finally {
  await writeFile(resolve(output, deliveryOnly ? 'delivery-browser.json' : motionOnly ? 'motion-browser.json' : assistOnly ? 'assist-browser.json' : passOnly ? 'pass-browser.json' : 'browser-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
