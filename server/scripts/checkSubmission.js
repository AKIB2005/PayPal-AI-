// Usage (from the repo root): npm run check:submission
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runSubmissionCheck, MANUAL_CHECKS } from '../src/checkSubmission.js';
import { formatPreflight } from '../src/preflight.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
let gitFiles = null;
try { gitFiles = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); } catch { /* no git */ }

const result = runSubmissionCheck({ root, gitFiles });
console.log(formatPreflight(result).replace('Blocking problems found. Fix the [FAIL] lines and run again.', 'Fix the [FAIL] lines before submitting, then run this again.').replace('No blocking problems found.', 'Automatic checks passed.'));
console.log('\nStill to check by hand (a script cannot):');
MANUAL_CHECKS.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
process.exit(result.ok ? 0 : 1);
