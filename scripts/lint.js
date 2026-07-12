#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const files = [];

function collect(dir, ext) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      collect(full, ext);
    } else if (f.endsWith(ext)) {
      files.push(full);
    }
  }
}

files.push(path.join(ROOT, 'server.mjs'));
collect(path.join(ROOT, 'lib'), '.js');
collect(path.join(ROOT, 'api'), '.js');

let failed = 0;
for (const f of files) {
  try {
    execSync(`node --check "${f}"`, { stdio: 'pipe' });
  } catch {
    console.error(`FAIL: ${path.relative(ROOT, f)}`);
    failed++;
  }
}

if (failed) {
  console.error(`\n${failed} file(s) failed syntax check`);
  process.exit(1);
} else {
  console.log(`OK: ${files.length} file(s) passed`);
}
