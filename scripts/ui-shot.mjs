import { chromium } from 'playwright-core';
const [url, out, w = '1600', h = '900'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(url); await p.waitForTimeout(1500);
await p.click('text=Play'); await p.waitForTimeout(1200);
await p.screenshot({ path: out }); console.log('errors:', errs.length ? errs : 'none'); await b.close();
