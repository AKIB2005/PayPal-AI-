import test from 'node:test';
import assert from 'node:assert/strict';
import { runPreflight, formatPreflight } from '../src/preflight.js';

function fakeFetch(routes) {
  return async (url, opts = {}) => {
    const hit = routes.find(([m, p]) => m === (opts.method || 'GET') && url.includes(p));
    if (!hit) return { ok: false, status: 404, text: async () => 'no route', json: async () => ({}) };
    const [, , status, payload] = hit;
    return { ok: status < 400, status, text: async () => JSON.stringify(payload), json: async () => payload };
  };
}
const TOKEN = ['POST', '/v1/oauth2/token', 200, { access_token: 't', expires_in: 3600 }];
const inv = (i) => ({ id: `INV2-${i}`, status: 'SENT', detail: { payment_term: { due_date: '2026-11-01' } }, amount: { currency_code: 'USD', value: '10.00' } });
const LIST = (n) => ['GET', '/v2/invoicing/invoices?', 200, { total_pages: 1, total_items: n, items: Array.from({ length: n }, (_, i) => inv(i)) }];
const SB = { PAYPAL_MODE: 'sandbox-rest', PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 's', PAYPAL_TEST_PAYER_EMAIL: 'p@x.co' };
const by = (r, name) => r.checks.find((c) => c.name === name);
const goodLLM = async () => JSON.stringify({ stage: 'firm', reasoning: 'r', subject: 's', body: 'Hi {{clientName}}' });

test('mock mode skips everything and passes', async () => {
  const r = await runPreflight({ env: {} });
  assert.equal(r.ok, true);
  assert.equal(by(r, 'PayPal sandbox').status, 'skip');
  assert.equal(by(r, 'AI model').status, 'skip');
});

test('sandbox without credentials fails with a fix', async () => {
  const r = await runPreflight({ env: { PAYPAL_MODE: 'sandbox' } }); // toolkit mode needs the same credentials
  assert.equal(r.ok, false);
  assert.match(by(r, 'PayPal credentials').detail, /PAYPAL_CLIENT_ID/);
});

test('good sandbox setup passes, warns on missing webhook id', async () => {
  const r = await runPreflight({ env: SB, fetchImpl: fakeFetch([TOKEN, LIST(5)]), base: 'https://pp.test' });
  assert.equal(r.ok, true);
  assert.equal(by(r, 'PayPal login').status, 'pass');
  assert.match(by(r, 'PayPal invoices').detail, /5 usable invoice/);
  assert.equal(by(r, 'Webhook').status, 'warn');
});

test('zero invoices warns and points at the seed script', async () => {
  const r = await runPreflight({ env: SB, fetchImpl: fakeFetch([TOKEN, LIST(0)]), base: 'https://pp.test' });
  assert.equal(by(r, 'PayPal invoices').status, 'warn');
  assert.match(by(r, 'PayPal invoices').fix, /seed:sandbox/);
});

test('bad credentials fail at login', async () => {
  const r = await runPreflight({ env: SB, fetchImpl: fakeFetch([['POST', '/v1/oauth2/token', 401, { error: 'invalid_client' }]]), base: 'https://pp.test' });
  assert.equal(r.ok, false);
  assert.equal(by(r, 'PayPal login').status, 'fail');
  assert.match(by(r, 'PayPal login').fix, /Sandbox/);
});

test('403 on invoices is reported separately from login', async () => {
  const r = await runPreflight({ env: SB, fetchImpl: fakeFetch([TOKEN, ['GET', '/v2/invoicing/invoices?', 403, { name: 'NOT_AUTHORIZED' }]]), base: 'https://pp.test' });
  assert.equal(by(r, 'PayPal invoices').status, 'fail');
  assert.equal(by(r, 'PayPal login').status, 'pass'); // login worked; only the invoice call was denied
});

test('registered webhook id is recognised', async () => {
  const r = await runPreflight({ env: { ...SB, PAYPAL_WEBHOOK_ID: 'WH1' }, fetchImpl: fakeFetch([TOKEN, LIST(1), ['GET', '/v1/notifications/webhooks', 200, { webhooks: [{ id: 'WH1', url: 'https://h/api/webhooks/paypal' }] }]]), base: 'https://pp.test' });
  assert.equal(by(r, 'Webhook').status, 'pass');
});

test('real AI provider: missing key fails, working model passes, broken model warns', async () => {
  assert.equal(by(await runPreflight({ env: { LLM_PROVIDER: 'claude' } }), 'AI model').status, 'fail');
  const ok = await runPreflight({ env: { LLM_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' }, llm: goodLLM });
  assert.equal(by(ok, 'AI decision INV-2002').status, 'pass');
  assert.equal(by(ok, 'AI decision INV-2003').status, 'pass');
  const bad = await runPreflight({ env: { LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' }, llm: async () => { throw new Error('LLM HTTP 404: model not found'); } });
  assert.equal(by(bad, 'AI decision INV-2002').status, 'warn');
  assert.match(by(bad, 'AI decision INV-2002').detail, /404/);
  assert.equal(bad.ok, true); // fallbacks are warnings, not blockers
});

test('formatPreflight prints fixes only for non-passing checks', () => {
  const out = formatPreflight({ ok: false, checks: [{ name: 'A', status: 'pass', detail: 'fine', fix: 'x' }, { name: 'B', status: 'fail', detail: 'broken', fix: 'do this' }] });
  assert.ok(!out.includes('Fix: x'));
  assert.ok(out.includes('Fix: do this'));
});

// ---- toolkit path (PAYPAL_MODE=sandbox): the same engine the app uses ----
const TK = { ...SB, PAYPAL_MODE: 'sandbox' };
const toolkit = (reply) => async () => ({ run: async () => JSON.stringify(reply) });

test('toolkit mode lists invoices through the PayPal Agent Toolkit', async () => {
  const r = await runPreflight({ env: TK, fetchImpl: fakeFetch([TOKEN]), base: 'https://pp.test', apiFactory: toolkit({ total_pages: 1, items: [inv(1), inv(2)] }) });
  assert.equal(r.ok, true);
  assert.equal(by(r, 'PayPal invoices').status, 'pass');
  assert.match(by(r, 'PayPal invoices').detail, /2 usable invoice\(s\) via PayPal Agent Toolkit/);
});

test('toolkit 403 is reported as an access problem', async () => {
  const r = await runPreflight({ env: TK, fetchImpl: fakeFetch([TOKEN]), base: 'https://pp.test', apiFactory: toolkit({ ok: false, status: 403, code: 'PAYPAL_API_HTTP_ERROR', message: 'NOT_AUTHORIZED' }) });
  assert.equal(by(r, 'PayPal invoices').status, 'fail');
  assert.match(by(r, 'PayPal invoices').fix, /permissions/);
});

test('toolkit failure of an unknown kind points at the sandbox-rest fallback', async () => {
  const r = await runPreflight({ env: TK, fetchImpl: fakeFetch([TOKEN]), base: 'https://pp.test', apiFactory: toolkit({ ok: false, status: 500, code: 'PAYPAL_API_HTTP_ERROR', message: 'boom' }) });
  assert.match(by(r, 'PayPal invoices').fix, /sandbox-rest/);
});

test('an unreachable network says so instead of "fetch failed"', async () => {
  const down = async () => { throw new TypeError('fetch failed'); };
  const r = await runPreflight({ env: TK, fetchImpl: down, base: 'https://pp.test' });
  assert.equal(by(r, 'PayPal login').status, 'fail');
  assert.match(by(r, 'PayPal login').detail, /Cannot reach PayPal/);
  assert.match(by(r, 'PayPal login').fix, /firewall/);
});
