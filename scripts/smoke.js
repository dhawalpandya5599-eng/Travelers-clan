#!/usr/bin/env node
'use strict';
/**
 * smoke.js — opens the dashboard and the website widget in a real headless browser and checks what a person sees:
 * the floating OYE greets, shows trip cards, holds a seat; the Inside-the-mind map draws nodes.
 *   npm run smoke          (needs Playwright + Chromium; skipped with a note when they are not installed)
 */
const { spawn, execSync } = require('child_process'); const path = require('path'); const os = require('os'); const fs = require('fs');
function findPlaywright() { for (const c of ['playwright', path.join(process.cwd(), 'node_modules', 'playwright')]) { try { return require(c); } catch { /* next */ } } try { return require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch { return null; } }
const pw = findPlaywright(); if (!pw) { console.log('smoke: Playwright not installed, skipped (npm i -g playwright, then: npx playwright install chromium).'); process.exit(0); }
const exe = process.env.PLAYWRIGHT_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
(async () => {
  const port = 3900 + Math.floor(Math.random() * 90); const data = fs.mkdtempSync(path.join(os.tmpdir(), 'oye-smoke-'));
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(port), ATLAS_NO_OLLAMA: '1', OYE_DATA: data }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const fails = []; const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) fails.push(what); };
  try {
    await fetch(`http://localhost:${port}/api/growth/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: 'Ahmedabad', phone: '919876543210', upi: 'tc@upi', trips: [{ name: 'Goa', date: '2099-12-12', days: 4, price: 14500, seats: 16, booked: 13 }, { name: 'Manali', date: '2099-12-20', days: 5, price: 12500, seats: 20, booked: 4 }] }) });
    const b = await pw.chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
    const pg = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await pg.goto(`http://localhost:${port}/site-demo.html`); await pg.waitForSelector('.oye .fab', { timeout: 10000 }); await pg.click('.oye .fab'); await pg.waitForTimeout(900);
    check((await pg.locator('.oye .m.a').first().textContent()).includes('OYE'), 'widget greets as OYE');
    check(await pg.locator('.oye .card').count() === 2, 'widget shows 2 trip cards');
    await pg.locator('.oye .card button').first().click(); await pg.waitForTimeout(1500);
    const replies = await pg.locator('.oye .m.a').allTextContents(); check(/tc@upi/.test(replies[replies.length - 1]) && /4,500/.test(replies[replies.length - 1]), 'hold from a card quotes advance and UPI');
    check(/wa\.me/.test(await pg.getAttribute('.oye .wa', 'href') || ''), 'WhatsApp handoff link is set');
    await pg.goto(`http://localhost:${port}/`); await pg.waitForTimeout(1500); await pg.click('[data-tab="mind"]'); await pg.waitForTimeout(5000);
    const mind = await pg.evaluate(() => { const h = document.getElementById('graph3d'); const c = h && h.querySelector('canvas'); return { canvas: !!c && c.width > 100, legend: document.getElementById('legend').textContent.trim().length > 0, fallback2d: !document.getElementById('graph').hidden }; });
    check(mind.canvas || mind.fallback2d, 'mind map draws (3D canvas or 2D fallback)'); check(mind.legend, 'mind map legend has clusters');
    await pg.click('[data-tab="setup"]'); await pg.waitForTimeout(800); check(await pg.locator('#rules input').count() >= 15, 'Set up shows the editable rules');
    check(errs.length === 0, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
    await b.close();
  } catch (e) { fails.push('smoke crashed: ' + e.message); console.log('✗ ' + e.message); }
  srv.kill(); console.log(fails.length ? `SMOKE FAILED (${fails.length})` : 'SMOKE PASSED'); process.exit(fails.length ? 2 : 0);
})();
