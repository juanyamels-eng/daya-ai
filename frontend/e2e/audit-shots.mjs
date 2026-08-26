import { chromium } from '@playwright/test';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const OUT = 'C:/Users/hp/Desktop/daya-ia/test-results/audit';
fs.mkdirSync(OUT, { recursive: true });

const routes = [
  ['landing', '/'],
  ['login', '/auth/login'],
  ['register', '/auth/register'],
  ['planes', '/planes'],
  ['community', '/community'],
  ['dayacode', '/code'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const [name, path] of routes) {
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log(`OK ${name} -> ${page.url()}`);
  } catch (e) {
    console.log(`FAIL ${name}: ${String(e).slice(0, 120)} (url final: ${page.url()})`);
    await page.screenshot({ path: `${OUT}/${name}-fail.png` }).catch(() => {});
  }
}

await browser.close();
