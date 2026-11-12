import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const SKIP_FILES = new Set(['package-lock.json', '.env']); // .env is local and gitignored; tracking is checked separately
const SECRET_PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, 'an Anthropic API key'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'a Google API key'],
  [/(PAYPAL_CLIENT_SECRET|ANTHROPIC_API_KEY|GEMINI_API_KEY)[ \t]*=[ \t]*[A-Za-z0-9_-]{8,}/, 'a key or secret assigned a value'] // [ \t] not \s: an empty KEY= line must not swallow the next line
];

function* walk(dir, root) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full, root);
    else if (!SKIP_FILES.has(name) && st.size < 1_000_000) yield relative(root, full).replace(/\\/g, '/');
  }
}

// Pre-submit safety net. `gitFiles` = output of `git ls-files` (array) or null when git is unavailable.
export function runSubmissionCheck({ root, gitFiles = null }) {
  const checks = [];
  const add = (name, status, detail, fix = '') => checks.push({ name, status, detail, fix });

  // 1. Placeholders left in the submission text or README
  for (const f of ['docs/DEVPOST_SUBMISSION.md', 'README.md']) {
    const p = join(root, f);
    if (!existsSync(p)) { add(`Text: ${f}`, f === 'README.md' ? 'fail' : 'warn', 'File is missing.', 'Restore it from the Phase 6 zip.'); continue; }
    const hits = [];
    readFileSync(p, 'utf8').split(/\r?\n/).forEach((line, i) => { if (line.includes('[[')) hits.push(i + 1); });
    if (hits.length) add(`Text: ${f}`, 'fail', `${hits.length} unfilled [[marker]] on line(s) ${hits.slice(0, 6).join(', ')}${hits.length > 6 ? '...' : ''}`, 'Fill in or delete every [[...]] marker. Search the file for "[[".');
    else add(`Text: ${f}`, 'pass', 'No unfilled markers.');
  }

  // 2. License (must be detectable in the repo About section)
  const lic = join(root, 'LICENSE');
  if (existsSync(lic) && /MIT License|Apache License|GNU General Public License|BSD/i.test(readFileSync(lic, 'utf8'))) add('Open-source license', 'pass', 'LICENSE file found.');
  else add('Open-source license', 'fail', 'No recognisable LICENSE file at the repo root.', 'Add the LICENSE file from the zip, push, then check the repo About box on GitHub shows the license.');

  // 3. Secrets in files that would be pushed
  const found = [];
  for (const f of walk(root, root)) {
    let text; try { text = readFileSync(join(root, f), 'utf8'); } catch { continue; }
    for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) found.push(`${f} (${label})`);
  }
  if (found.length) add('Secrets in files', 'fail', found.slice(0, 4).join('; '), 'Remove the value, revoke that key on its provider site (assume it leaked if it was ever pushed), and keep secrets only in server/.env.');
  else add('Secrets in files', 'pass', 'No API keys or secrets found in project files.');

  // 4. .env must not be tracked by git
  if (gitFiles === null) add('.env not committed', 'skip', 'Not a git repo here, or git is unavailable.', 'Before pushing run: git status. server/.env must not be listed.');
  else {
    const tracked = gitFiles.filter((f) => /(^|\/)\.env$/.test(f));
    if (tracked.length) add('.env not committed', 'fail', `Tracked by git: ${tracked.join(', ')}`, 'Run: git rm --cached server/.env  then commit. Then revoke and replace every key that was in it.');
    else add('.env not committed', 'pass', 'No .env file is tracked by git.');
  }
  return { checks, ok: !checks.some((c) => c.status === 'fail') };
}

export const MANUAL_CHECKS = [
  'GitHub repo is PUBLIC and the license shows in the About box (top right of the repo page).',
  'Open the repo in a private window and confirm the README renders and the run steps work.',
  'YouTube video is PUBLIC (not Unlisted), under 3:00, no music, plays in a private window.',
  'Devpost: video link, repo link and description pasted; your teammate is on the Devpost team; the form says Submitted, not Draft.',
  'Everything fits the rules in English; the project description matches what the video shows.'
];
