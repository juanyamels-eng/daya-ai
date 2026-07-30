#!/usr/bin/env python3
"""
Health audit of DAYA IA codebase.

Only READS and reports; does not modify anything. Usage:
    python scripts/audit.py

Gives a quick snapshot of: largest files (candidates for modularization),
lax typing ('any'), forgotten console.log, test coverage, possible
orphan code and line distribution by area. Run it from time to time
so that debt doesn't grow silently.
"""
import os
import re
import collections

# Root = parent folder of this script (repo root), no absolute paths.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIRS = [os.path.join(ROOT, "frontend", "src"), os.path.join(ROOT, "backend", "src")]
CODE_EXT = (".ts", ".tsx", ".js", ".jsx")
SKIP = {"node_modules", ".next", "dist", ".git", "build"}


def walk():
    for base in SRC_DIRS:
        if not os.path.isdir(base):
            continue
        for dp, dn, fn in os.walk(base):
            dn[:] = [d for d in dn if d not in SKIP]
            for f in fn:
                if f.endswith(CODE_EXT):
                    yield os.path.join(dp, f)


def rel(p):
    return os.path.relpath(p, ROOT).replace("\\", "/")


def main():
    files = list(walk())
    src = {p: open(p, encoding="utf-8", errors="ignore").read() for p in files}
    stats = []
    total = 0
    any_c = console_c = eslint_c = 0
    for p, txt in src.items():
        n = txt.count("\n") + 1
        total += n
        any_c += len(re.findall(r"[:<(]\s*any\b", txt))
        console_c += len(re.findall(r"\bconsole\.(log|debug)\b", txt))
        eslint_c += txt.count("eslint-disable")
        stats.append((n, rel(p)))
    stats.sort(reverse=True)

    line = "=" * 66
    print(line)
    print(f"  DAYA IA - code health  ({len(files)} files, {total:,} lines)")
    print(line)

    print("\n[ 12 largest files ]  (>1500 = modularize now)")
    for n, r in stats[:12]:
        flag = "  <== ENORME" if n > 1500 else ("  <- grande" if n > 800 else "")
        print(f"  {n:>5}  {r}{flag}")

    print("\n[ cleanup ]")
    print(f"  explicit 'any' (approx):   {any_c}")
    print(f"  console.log/debug:         {console_c}")
    print(f"  eslint-disable:            {eslint_c}")

    tests = [r for _, r in stats if ".test." in r or ".spec." in r or "/__tests__/" in r]
    print(f"\n[ tests ]  {len(tests)} test file(s) for {total:,} lines")
    ratio = total // max(1, len(tests))
    print(f"  ~{ratio:,} lines per test file (lower is better)")

    print("\n[ possible orphan code ]  (components never referenced by name)")
    orphans = []
    for p in files:
        name = os.path.splitext(os.path.basename(p))[0]
        if name in ("index", "page", "layout", "template", "route", "middleware"):
            continue
        if any(q != p and re.search(r"\b" + re.escape(name) + r"\b", t) for q, t in src.items()):
            continue
        orphans.append(rel(p))
    for o in orphans[:15]:
        print(f"  {o}")
    if not orphans:
        print("  (none)")

    print("\n[ lines by area ]")
    area = collections.Counter()
    for n, r in stats:
        parts = r.split("/")
        area["/".join(parts[:4]) if len(parts) >= 4 else "/".join(parts[:-1])] += n
    for k, v in area.most_common(10):
        print(f"  {v:>6}  {k}")


if __name__ == "__main__":
    main()
