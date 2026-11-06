import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const cache = path.join(os.homedir(), 'AppData/Local/ms-playwright');
const version = fs.readdirSync(cache).filter(n => /^chromium-/.test(n)).sort().at(-1);
const browser = await chromium.launch({ executablePath: path.join(cache, version, 'chrome-win64/chrome.exe') });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => localStorage.setItem('clyra-experience', 'off'));
await page.goto('http://127.0.0.1:5176');
await page.getByLabel('Username', { exact: true }).waitFor();
await page.evaluate(() => document.fonts.ready);
const reading = await page.screenshot();
const baseline = 'artifacts/cinema-refresh/reading-before-refresh.png';
if (process.argv.includes('--baseline')) {
  fs.mkdirSync(path.dirname(baseline), { recursive: true });
  fs.writeFileSync(baseline, reading);
} else {
  // Optional pre-change baseline survives Playwright's test-results cleanup.
  if (fs.existsSync(baseline)) assert.deepEqual(reading, fs.readFileSync(baseline), 'Easy reading must stay pixel-identical');
  await page.getByRole('switch').click();
  await page.waitForTimeout(1100);
  await page.screenshot({ path: 'test-results/refresh-hero-desktop.png' });
  const initial = await page.locator('.flow-hero-art').evaluate(el => getComputedStyle(el).transform);
  for (const p of [0.5, 1, 0]) {
    await page.locator('.cinema-opening').evaluate((el, p) => scrollTo(0, el.offsetTop - 64 + (el.offsetHeight - innerHeight + 64) * p), p);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `test-results/refresh-opening-${p}.png` });
    const pose = await page.locator('.flow-hero-art').evaluate(el => getComputedStyle(el).transform);
    if (p === 0.5) assert.notEqual(pose, initial, 'Opening ribbon must travel with scroll');
    if (p === 0) assert.equal(pose, initial, 'Reversing scroll must restore the opening');
  }
  for (const p of [0.08, 0.58, 0.96]) {
    await page.locator('.cinema-orbit').evaluate((el, p) => scrollTo(0, el.offsetTop - 64 + (el.offsetHeight - innerHeight + 64) * p), p);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `test-results/refresh-trace-${p}.png` });
  }
  await page.getByRole('switch').click();
  await page.evaluate(() => scrollTo(0, 0));
  assert.deepEqual(await page.screenshot(), reading, 'Cinematic mode must leave no visual changes after returning to easy reading');
  await page.getByRole('switch').click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(300);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile overflow');
    assert.equal(await page.locator('.orbit-world').evaluate(el => getComputedStyle(el).opacity), '1', 'Evidence remains visible after responsive resize');
    await page.screenshot({ path: `test-results/refresh-mobile-${width}.png`, fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.cinema-landing').count(), 0);
  assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
  assert.deepEqual(errors, []);
}
await browser.close();
console.log(process.argv.includes('--baseline') ? 'Captured easy reading baseline' : 'Easy reading round-trip pixel comparison, scroll scenes, mobile, reduced motion and console passed');
