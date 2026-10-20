// Static production validation: this site has no compilation/package build.
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const htmlFiles = ['dashboard.html', 'caregiver-checkin.html', 'caregiver-report.html'];
const jsFiles = ['dashboard-clock.js', 'caregiver-answer-quality.js', 'caregiver-provider-letter.js',
  'caregiver-dates.js', 'caregiver-calendar-data.js', 'caregiver-submission.js',
  'caregiver-submission-ui.js', 'caregiver-parent-letter.js', 'caregiver-report-shared.js',
  'caregiver-report-supabase.js', 'restClient.js', 'ui-shell.js'];
let scripts = 0, references = 0;
async function check(code, filename, module = true) {
  const args = ['--check'];
  if (module) args.push('--input-type=module');
  const result = spawnSync(process.execPath, args, { input: code, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${filename}: ${result.stderr}`);
  scripts++;
  for (const match of code.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.\/[^'"]+)['"]/g)) {
    await access(resolve(dirname(resolve(root, filename)), match[1].split('?')[0]));
    references++;
  }
}
for (const filename of jsFiles) await check(await readFile(resolve(root, filename), 'utf8'), filename);
for (const filename of htmlFiles) {
  const html = await readFile(resolve(root, filename), 'utf8');
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc=/.test(match[1])) continue;
    if (/application\/(?:json|ld\+json)/.test(match[1])) { JSON.parse(match[2]); continue; }
    await check(match[2], filename, /type=["']module/.test(match[1]));
  }
  for (const match of html.matchAll(/(?:src|href)=["'](\.\/[^"'?#]+\.(?:js|css))(?:\?[^"']*)?["']/g)) {
    await access(resolve(root, match[1])); references++;
  }
}
console.log(`Static production validation: ${scripts} scripts/modules parse; ${references} local references resolve.`);
