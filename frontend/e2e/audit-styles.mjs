import { chromium } from '@playwright/test';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const OUT = 'C:/Users/hp/Desktop/daya-ia/test-results/audit';

const routes = [
  ['landing', '/'],
  ['login', '/auth/login'],
  ['register', '/auth/register'],
  ['community', '/community'],
  ['dayacode', '/code'],
];

// Extrae estilos computados de elementos clave de cada página
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = {};

for (const [name, path] of routes) {
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1200);
    report[name] = await page.evaluate(() => {
      const pick = (el) => {
        if (!el) return null;
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, color: s.color, font: s.fontFamily.split(',')[0], size: s.fontSize, weight: s.fontWeight, radius: s.borderRadius, border: s.borderColor };
      };
      const body = pick(document.body);
      const h1 = pick(document.querySelector('h1'));
      const h2 = pick(document.querySelector('h2'));
      const btns = [...document.querySelectorAll('button, a')].filter(b => {
        const s = getComputedStyle(b);
        return s.backgroundColor !== 'rgba(0, 0, 0, 0)' && b.offsetWidth > 40 && b.offsetHeight > 20;
      }).slice(0, 12).map(b => ({ tag: b.tagName, text: (b.textContent || '').trim().slice(0, 28), ...pick(b) }));
      const inputs = [...document.querySelectorAll('input:not([type=hidden])')].slice(0, 4).map(i => ({ type: i.type, placeholder: (i.placeholder||'').slice(0,24), ...pick(i) }));
      const rootVars = {};
      const cs = getComputedStyle(document.documentElement);
      for (const v of ['--bg-base','--bg-surface','--brand','--text-primary','--accent-500','--font-body']) rootVars[v] = cs.getPropertyValue(v).trim();
      // colores únicos usados inline en la página
      const inlineColors = new Set();
      document.querySelectorAll('*').forEach(el => {
        const st = el.getAttribute && el.getAttribute('style');
        if (st) (st.match(/#[0-9a-fA-F]{3,8}\b/g) || []).forEach(c => inlineColors.add(c.toLowerCase()));
      });
      return { url: location.pathname, body, h1, h2, vars: rootVars, buttons: btns, inputs, inlineColors: [...inlineColors].slice(0, 40), dark: document.documentElement.classList.contains('dark') };
    });
  } catch (e) {
    report[name] = { error: String(e).slice(0, 150) };
  }
}

fs.writeFileSync(`${OUT}/style-report.json`, JSON.stringify(report, null, 2));
console.log('Reporte escrito en test-results/audit/style-report.json');

// Resumen legible
for (const [name, r] of Object.entries(report)) {
  if (r.error) { console.log(`\n=== ${name}: ERROR ${r.error}`); continue; }
  console.log(`\n=== ${name} (${r.url}) dark=${r.dark}`);
  console.log(`  body: bg=${r.body?.bg} text=${r.body?.color} font=${r.body?.font} size=${r.body?.size}`);
  console.log(`  h1: color=${r.h1?.color} font=${r.h1?.font} weight=${r.h1?.weight} size=${r.h1?.size}`);
  console.log(`  vars: brand=${r.vars['--brand']} bg=${r.vars['--bg-base']}`);
  console.log(`  botones destacados:`);
  for (const b of r.buttons.slice(0, 8)) console.log(`    [${b.tag}] "${b.text}" bg=${b.bg} color=${b.color} radius=${b.radius}`);
  if (r.inputs.length) console.log(`  inputs: ` + r.inputs.map(i => `${i.type}(bg=${i.bg},border=${i.border})`).join(' | '));
  if (r.inlineColors.length) console.log(`  colores inline: ${r.inlineColors.join(', ')}`);
}
await browser.close();
