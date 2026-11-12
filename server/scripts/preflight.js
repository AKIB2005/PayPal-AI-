// Usage: npm run preflight   (reads server/.env)
import { loadEnv } from '../src/env.js';
loadEnv();
const { runPreflight, formatPreflight } = await import('../src/preflight.js');
const result = await runPreflight();
console.log(formatPreflight(result));
process.exit(result.ok ? 0 : 1);
