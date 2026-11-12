import test from 'node:test';
import assert from 'node:assert/strict';
import { callLLM } from '../src/agent/llm.js';
import { withBudget } from '../src/budget.js';
import { createService } from '../src/service.js';
import { createStore } from '../src/store.js';
import { createApp } from '../src/app.js';
import { createMockPayPal } from '../src/paypal/mock.js';
import { createPayPal } from '../src/paypal/index.js';
import { runDeployedSmoke } from '../src/smokeDeployed.js';

const GOOD = JSON.stringify({ stage: 'firm', reasoning: 'r', subject: 's', body: 'Hi {{clientName}}' });
const AS_OF = '2026-11-10';

test('a hung AI request times out instead of freezing the dashboard', async () => {
  const realFetch = globalThis.fetch;
  const prevKey = process.env.ANTHROPIC_API_KEY, prevMs = process.env.LLM_TIMEOUT_MS;
  process.env.ANTHROPIC_API_KEY = 'k'; process.env.LLM_TIMEOUT_MS = '40';
  globalThis.fetch = (url, opts) => new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(opts.signal.reason)));
  const keepAlive = setTimeout(() => {}, 2000); // AbortSignal.timeout's own timer is unref'd; a real socket would keep Node alive
  try {
    await assert.rejects(callLLM('claude', { system: 's', user: 'u' }), /timed out/);
  } finally {
    clearTimeout(keepAlive);
    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prevKey;
    if (prevMs === undefined) delete process.env.LLM_TIMEOUT_MS; else process.env.LLM_TIMEOUT_MS = prevMs;
  }
});

test('budget cap blocks calls past the limit and recovers after the window', async () => {
  let t = 0, calls = 0;
  const f = withBudget(async () => { calls += 1; return 'ok'; }, { max: 2, windowMs: 1000, now: () => t });
  assert.equal(await f(), 'ok'); assert.equal(await f(), 'ok');
  await assert.rejects(f(), /budget reached/);
  assert.equal(calls, 2);
  t = 1500;
  assert.equal(await f(), 'ok');
});

test('when the budget is spent, drafts fall back to templates and the app keeps working', async () => {
  const goodForAny = async (provider, { policy }) => JSON.stringify({ stage: policy.allowedStages[0], reasoning: 'r', subject: 's', body: 'Hi {{clientName}}' });
  const budgeted = withBudget(goodForAny, { max: 1 });
  const { app } = createApp({ paypal: createMockPayPal(), provider: 'x', llm: budgeted, clientDist: '/nonexistent' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/invoices?asOf=${AS_OF}`);
  const { rows } = await res.json();
  server.close();
  assert.equal(res.status, 200);
  const sources = rows.map((r) => r.decision.source);
  assert.ok(sources.includes('llm') && sources.includes('fallback'));
  assert.match(rows.find((r) => r.decision.source === 'fallback').decision.fallbackReason, /budget reached/);
  for (const r of rows) assert.equal(r.decision.requiresApproval, true);
});

test('"Re-run agent" is throttled so it cannot burn AI calls', async () => {
  let calls = 0, t = 1_000_000;
  const llm = async () => { calls += 1; return GOOD; };
  const svc = createService({ paypal: createMockPayPal(), store: createStore(), hub: { emit() {} }, provider: 'x', llm, now: () => t });
  await svc.list({ asOf: AS_OF });
  const base = calls;
  assert.ok(base > 0);
  await svc.list({ asOf: AS_OF, refresh: true });
  assert.equal(calls, base * 2);            // first refresh re-runs the agent
  await svc.list({ asOf: AS_OF, refresh: true });
  assert.equal(calls, base * 2);            // second one within 10s is served from cache
  t += 11000;
  await svc.list({ asOf: AS_OF, refresh: true });
  assert.equal(calls, base * 3);            // allowed again after the window
});

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FAKE_DIST = mkdtempSync(join(tmpdir(), 'nudge-dist-'));
writeFileSync(join(FAKE_DIST, 'index.html'), '<div id="root"></div>');

async function boot(opts = {}) {
  const { app } = createApp({ paypal: createMockPayPal(), provider: 'mock', clientDist: FAKE_DIST, ...opts });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
const by = (r, n) => r.checks.find((c) => c.name === n);

test('deployed smoke check passes against a healthy mock server and warns about mock modes', async () => {
  const s = await boot();
  const r = await runDeployedSmoke(s.base);
  s.close();
  assert.equal(r.ok, true);
  assert.equal(by(r, 'Health check').status, 'pass');
  assert.equal(by(r, 'Dashboard page').status, 'pass');
  assert.equal(by(r, 'Invoices + agent').status, 'pass');
  assert.equal(by(r, 'PayPal mode').status, 'warn');
  assert.equal(by(r, 'AI mode').status, 'warn');
});

test('deployed smoke check fails clearly when the server is unreachable', async () => {
  const r = await runDeployedSmoke('http://127.0.0.1:1');
  assert.equal(r.ok, false);
  assert.match(by(r, 'Health check').detail, /Cannot reach/);
});

test('in sandbox mode an unsigned webhook is rejected (401) and the smoke check confirms it', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => '{"access_token":"t","expires_in":3600}', json: async () => ({ access_token: 't', expires_in: 3600 }) });
  const apiFactory = async () => ({ run: async (tool) => JSON.stringify(tool === 'list_invoices' ? { total_pages: 1, items: [] } : {}) });
  const paypal = createPayPal('sandbox', { rest: { clientId: 'id', clientSecret: 's', fetchImpl, base: 'https://pp.test' }, apiFactory });
  const s = await boot({ paypal });
  const r = await runDeployedSmoke(s.base);
  s.close();
  assert.equal(by(r, 'Webhook safety').status, 'pass');
  assert.match(by(r, 'Config').detail, /agent-toolkit/);
});

test('responses do not advertise the framework', async () => {
  const s = await boot();
  const res = await fetch(`${s.base}/healthz`);
  s.close();
  assert.equal(res.headers.get('x-powered-by'), null);
});
