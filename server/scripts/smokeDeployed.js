// Usage: npm run smoke:deployed -- https://your-app.onrender.com   (defaults to http://localhost:3001)
import { runDeployedSmoke } from '../src/smokeDeployed.js';
import { formatPreflight } from '../src/preflight.js';

const base = process.argv[2] || 'http://localhost:3001';
console.log(`Checking ${base} (a sleeping Render instance can take up to a minute)...\n`);
const result = await runDeployedSmoke(base);
console.log(formatPreflight(result));
process.exit(result.ok ? 0 : 1);
