#!/usr/bin/env node
/**
 * bumps the STAR build version and updates all ?v= query strings
 * usage: node scripts/bump-version.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SUPABASE_CLIENT = path.join(ROOT, 'supabaseClient.js');

const targetExts = new Set(['.html', '.js']);

const pad2 = (n) => n.toString().padStart(2, '0');

const todayBaseVersion = () => {
  const now = new Date();
  return `${now.getFullYear()}.${pad2(now.getMonth() + 1)}.${pad2(now.getDate())}`;
};

const extractCurrentVersion = async () => {
  const content = await fs.readFile(SUPABASE_CLIENT, 'utf8');
  const match = content.match(/const BUILD_VERSION = '([^']+)'/);
  if (!match) {
    throw new Error('Could not locate BUILD_VERSION in supabaseClient.js');
  }
  return { content, version: match[1] };
};

const incrementSuffix = (suffix) => {
  if (!suffix) return 'a';
  const chars = suffix.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    const code = chars[i].charCodeAt(0);
    if (code >= 97 && code < 122) {
      chars[i] = String.fromCharCode(code + 1);
      return chars.join('');
    }
    chars[i] = 'a';
    i -= 1;
  }
  chars.unshift('a');
  return chars.join('');
};

const computeNextVersion = (current) => {
  const base = todayBaseVersion();
  if (!current.startsWith(base)) {
    return `${base}a`;
  }
  const suffix = current.slice(base.length).replace(/^\./, '');
  const nextSuffix = incrementSuffix(suffix);
  return `${base}${nextSuffix}`;
};

const listFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.git')) continue;
    if (entry.isDirectory()) {
      // skip node_modules or other heavy dirs if present
      if (entry.name === 'node_modules') continue;
      files.push(...await listFiles(path.join(dir, entry.name)));
    } else {
      if (targetExts.has(path.extname(entry.name))) {
        files.push(path.join(dir, entry.name));
      }
    }
  }
  return files;
};

const updateFileVersion = async (filePath, current, next) => {
  const content = await fs.readFile(filePath, 'utf8');
  if (!content.includes(current)) return false;
  let updated = content.split(`?v=${current}`).join(`?v=${next}`);
  updated = updated.split(`|| '${current}'`).join(`|| '${next}'`);
  if (updated !== content) {
    await fs.writeFile(filePath, updated, 'utf8');
    return true;
  }
  return false;
};

const main = async () => {
  const { content, version: currentVersion } = await extractCurrentVersion();
  const nextVersion = computeNextVersion(currentVersion);
  if (nextVersion === currentVersion) {
    console.log(`Version already up to date (${currentVersion})`);
    return;
  }

  const updatedClient = content.replace(
    /const BUILD_VERSION = '([^']+)'/,
    `const BUILD_VERSION = '${nextVersion}'`
  );
  await fs.writeFile(SUPABASE_CLIENT, updatedClient, 'utf8');

  const files = await listFiles(ROOT);
  let touched = 0;
  await Promise.all(
    files.map(async (file) => {
      const ok = await updateFileVersion(file, `?v=${currentVersion}`, `?v=${nextVersion}`);
      if (ok) touched += 1;
    })
  );

  console.log(`Updated build version: ${currentVersion} → ${nextVersion} (${touched} files touched)`);
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
