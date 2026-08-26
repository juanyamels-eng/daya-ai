import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const TARGETS = ['backend/src', 'frontend/src'];
const EXTENSIONS = new Set(['.ts', '.tsx']);
const ANY_RE = /:\s*any\b|<any>|as any\b|any\[\]/g;
const TODO_RE = /\b(TODO|FIXME|HACK)\b/g;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry === 'coverage') continue;
      walk(full, files);
    } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      files.push(full);
    }
  }
  return files;
}

function bucketOf(relPath) {
  const parts = relPath.split(sep);
  const isFeature = parts[0] === 'backend' && parts[2] === 'features';
  const depth = isFeature ? 4 : parts[1] === 'src' ? 3 : 2;
  return parts.slice(0, depth).join('/');
}

const buckets = new Map();
let totals = { loc: 0, any: 0, todo: 0 };

for (const target of TARGETS) {
  for (const file of walk(target)) {
    const rel = relative('.', file);
    const src = readFileSync(file, 'utf8');
    const loc = src.split('\n').length;
    const anyCount = (src.match(ANY_RE) || []).length;
    const todoCount = (src.match(TODO_RE) || []).length;

    const key = bucketOf(rel);
    if (!buckets.has(key)) buckets.set(key, { loc: 0, any: 0, todo: 0 });
    const b = buckets.get(key);
    b.loc += loc; b.any += anyCount; b.todo += todoCount;
    totals.loc += loc; totals.any += anyCount; totals.todo += todoCount;
  }
}

const rows = [...buckets.entries()].sort(
  (a, b) => (b[1].any + b[1].todo * 2) - (a[1].any + a[1].todo * 2)
);

console.log('bucket'.padEnd(32), 'loc'.padStart(7), 'any'.padStart(6), 'todo'.padStart(6));
console.log('-'.repeat(53));
for (const [key, { loc, any, todo }] of rows) {
  console.log(key.padEnd(32), String(loc).padStart(7), String(any).padStart(6), String(todo).padStart(6));
}
console.log('-'.repeat(53));
console.log('TOTAL'.padEnd(32), String(totals.loc).padStart(7), String(totals.any).padStart(6), String(totals.todo).padStart(6));

const top = rows.filter(([, v]) => v.any > 0 || v.todo > 0).slice(0, 10);
console.log('\nTOP 10 OFFENDERS (ponderado: any=1, todo=2):');
top.forEach(([key, v], i) =>
  console.log(`${String(i + 1).padStart(2)}. ${key} — ${v.any} any, ${v.todo} todo`)
);
