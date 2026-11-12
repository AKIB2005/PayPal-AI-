import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolkitPayPal } from '../src/paypal/toolkit.js';
import { createPayPal } from '../src/paypal/index.js';
import { createApp } from '../src/app.js';
import { createMockPayPal } from '../src/paypal/mock.js';

// Fake PayPal Agent Toolkit client: run(method, args) returns JSON text, exactly like the real PayPalAPI.run().
function fakeToolkit(handlers) {
  const calls = [];
  const api = {
    async run(method, args) {
      calls.push({ method, args });
      const h = handlers[method];
      if (h === undefined) return JSON.stringify({ ok: false, code: 'NO_HANDLER', message: `no handler for ${method}` });
      const out = typeof h === 'function' ? h(args) : h;
      return JSON.stringify(out);
    }
  };
  return { api, calls };
}

function fakeRest({ token = 'tok-1', apiImpl } = {}) {
  const restCalls = [];
  let current = token;
  return {
    restCalls,
    setToken: (t) => { current = t; },
    token: async () => current,
    api: async (method, path, body) => {
      restCalls.push({ method, path, body });
      return apiImpl ? apiImpl(method, path, body) : {};
    },
    verifyWebhook: async () => true
  };
}

const mkInv = (id, status, due, total = '500.00', dueAmt = total) => ({
  id, status,
  detail: { invoice_number: id, payment_term: due ? { due_date: due } : {} },
  primary_recipients: [{ billing_info: { business_name: 'Acme', email_address: 'a@b.co' } }],
  amount: { currency_code: 'USD', value: total },
  due_amount: { currency_code: 'USD', value: dueAmt }
});

function build(handlers, restOpts, opts = {}) {
  const tk = fakeToolkit(handlers);
  const rest = fakeRest(restOpts);
  const created = [];
  const pp = createToolkitPayPal({ rest, apiFactory: async (token) => { created.push(token); return tk.api; }, ...opts });
  return { pp, rest, tk, created };
}

test('listInvoices uses the toolkit list_invoices tool and maps results', async () => {
  const { pp, tk } = build({ list_invoices: { total_pages: 1, items: [mkInv('A', 'SENT', '2026-11-01'), mkInv('B', 'DRAFT', '2026-11-01'), mkInv('C', 'SENT', null)] } });
  const list = await pp.listInvoices();
  assert.deepEqual(list.map((i) => i.id), ['A']);
  assert.deepEqual(tk.calls[0], { method: 'list_invoices', args: { page: 1, page_size: 100, total_required: true } });
  assert.equal(pp.engine, 'agent-toolkit');
});

test('sendReminder runs send_invoice_reminder with invoice_id, subject, note', async () => {
  const { pp, tk, rest } = build({ send_invoice_reminder: '' });
  await pp.sendReminder('INV2-X', { subject: 'S', note: 'N' });
  assert.deepEqual(tk.calls[0], { method: 'send_invoice_reminder', args: { invoice_id: 'INV2-X', subject: 'S', note: 'N' } });
  assert.equal(rest.restCalls.length, 0);
  assert.equal(pp.activity()[0].via, 'agent-toolkit');
  assert.equal(pp.activity()[0].ok, true);
});

test('toolkit error JSON becomes a thrown error and is logged as failed', async () => {
  const { pp } = build({ send_invoice_reminder: { ok: false, code: 'PAYPAL_API_HTTP_ERROR', status: 500, message: 'boom' } });
  await assert.rejects(() => pp.sendReminder('INV2-X', { subject: 'S', note: 'N' }), /send_invoice_reminder failed: boom/);
  assert.equal(pp.activity()[0].ok, false);
});

test('a 422 from the toolkit retries once over REST and says so in the activity log', async () => {
  const { pp, rest } = build({ send_invoice_reminder: { ok: false, code: 'PAYPAL_API_HTTP_ERROR', status: 422, message: 'bad shape' } });
  await pp.sendReminder('INV2-X', { subject: 'S', note: 'N' });
  assert.equal(rest.restCalls.length, 1);
  assert.equal(rest.restCalls[0].path, '/v2/invoicing/invoices/INV2-X/remind');
  assert.deepEqual(rest.restCalls[0].body, { subject: 'S', note: 'N', send_to_recipient: true, send_to_invoicer: false });
  const [fallback, failed] = pp.activity();
  assert.equal(fallback.via, 'rest');
  assert.match(fallback.tool, /REST fallback/);
  assert.equal(failed.via, 'agent-toolkit');
});

test('non-shape errors (500) never trigger the REST retry, so nothing can double-send', async () => {
  const { pp, rest } = build({ send_invoice_reminder: { ok: false, status: 500, message: 'server down' } });
  await assert.rejects(() => pp.sendReminder('INV2-X', { subject: 'S', note: 'N' }));
  assert.equal(rest.restCalls.length, 0);
});

test('REST fallback can be switched off (smoke test mode)', async () => {
  const { pp, rest } = build({ send_invoice_reminder: { ok: false, status: 422, message: 'bad shape' } }, {}, { restFallback: false });
  await assert.rejects(() => pp.sendReminder('INV2-X', { subject: 'S', note: 'N' }));
  assert.equal(rest.restCalls.length, 0);
});

test('ensurePartialPayment: already enabled -> no write at all', async () => {
  const inv = { id: 'INV2-X', configuration: { partial_payment: { allow_partial_payment: true } } };
  const { pp, rest, tk } = build({ get_invoice: inv });
  const r = await pp.ensurePartialPayment('INV2-X', '400.00', 'USD');
  assert.equal(r.applied, true);
  assert.equal(tk.calls[0].method, 'get_invoice');
  assert.equal(rest.restCalls.length, 0);
});

test('ensurePartialPayment: reads via toolkit, writes the full invoice via REST PUT', async () => {
  const { pp, rest } = build({ get_invoice: { id: 'INV2-X', configuration: {}, items: [{ name: 'Work' }] } });
  const r = await pp.ensurePartialPayment('INV2-X', '400.00', 'USD');
  assert.equal(r.applied, true);
  const put = rest.restCalls[0];
  assert.equal(put.method, 'PUT');
  assert.deepEqual(put.body.configuration.partial_payment, { allow_partial_payment: true, minimum_amount_due: { currency_code: 'USD', value: '400.00' } });
  assert.deepEqual(put.body.items, [{ name: 'Work' }]); // nothing dropped
});

test('ensurePartialPayment failure is non-fatal and reported', async () => {
  const { pp } = build({ get_invoice: { ok: false, status: 404, message: 'gone' } });
  const r = await pp.ensurePartialPayment('INV2-X', '400.00', 'USD');
  assert.equal(r.applied, false);
  assert.match(r.note, /Could not enable partial payments/);
});

test('recordPayment reads get_invoice then runs record_payment_for_invoice for the remaining amount', async () => {
  const { pp, tk } = build({ get_invoice: mkInv('INV2-X', 'PARTIALLY_PAID', '2026-11-01', '1000.00', '750.00'), record_payment_for_invoice: { success: true } });
  const { event } = await pp.recordPayment('INV2-X');
  assert.deepEqual(tk.calls.map((c) => c.method), ['get_invoice', 'record_payment_for_invoice']);
  const args = tk.calls[1].args;
  assert.equal(args.method, 'CASH');
  assert.equal(args.invoice_id, 'INV2-X');
  assert.deepEqual(args.amount, { currency_code: 'USD', value: '750.00' });
  assert.match(args.payment_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(event.event_type, 'INVOICING.INVOICE.PAID');
  assert.equal(event.resource.id, 'INV2-X');
});

test('recordPayment caps a requested amount at what is still owed', async () => {
  const { pp, tk } = build({ get_invoice: mkInv('INV2-X', 'SENT', '2026-11-01', '100.00'), record_payment_for_invoice: { success: true } });
  await pp.recordPayment('INV2-X', { amount: '999' });
  assert.equal(tk.calls[1].args.amount.value, '100.00');
});

test('the toolkit client is rebuilt when the OAuth token rotates', async () => {
  const { pp, rest, created } = build({ list_invoices: { total_pages: 1, items: [] } });
  await pp.listInvoices();
  await pp.listInvoices();
  assert.deepEqual(created, ['tok-1']); // reused
  rest.setToken('tok-2');
  await pp.listInvoices();
  assert.deepEqual(created, ['tok-1', 'tok-2']);
});

test('activity log never contains secrets or message bodies', async () => {
  const { pp } = build({ send_invoice_reminder: '' });
  await pp.sendReminder('INV2-X', { subject: 'Secret subject', note: 'Secret body text' });
  const dump = JSON.stringify(pp.activity());
  assert.ok(!dump.includes('Secret'));
  assert.ok(!dump.includes('tok-1'));
});

test('createToolkitPayPal needs the REST adapter', () => {
  assert.throws(() => createToolkitPayPal({}), /needs the sandbox REST adapter/);
});

test('PAYPAL_MODE picks the engine: sandbox -> toolkit, sandbox-rest -> REST, bad value throws', () => {
  const saved = { id: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_CLIENT_SECRET };
  process.env.PAYPAL_CLIENT_ID = 'id';
  process.env.PAYPAL_CLIENT_SECRET = 'secret';
  try {
    assert.equal(createPayPal('sandbox').engine, 'agent-toolkit');
    assert.equal(createPayPal('sandbox-rest').engine, 'rest');
    assert.equal(createPayPal('mock').engine, 'mock');
    assert.throws(() => createPayPal('banana'), /Unknown PAYPAL_MODE/);
  } finally {
    for (const [k, v] of [['PAYPAL_CLIENT_ID', saved.id], ['PAYPAL_CLIENT_SECRET', saved.secret]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('the real @paypal/agent-toolkit package loads and exposes PayPalAPI.run', async () => {
  const { PayPalAPI } = await import('@paypal/agent-toolkit/mcp');
  const api = new PayPalAPI('not-a-real-token', { sandbox: true });
  assert.equal(typeof api.run, 'function');
});

test('GET /api/paypal/activity and /api/config expose the engine and recent PayPal tool calls', async () => {
  const paypal = createMockPayPal();
  const { app } = createApp({ paypal, provider: 'mock', clientDist: '/nonexistent' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (p) => (await fetch(base + p)).json();
  assert.equal((await get('/api/config')).paypalEngine, 'mock');
  await paypal.sendReminder('INV-2001', { subject: 'S', note: 'N' });
  const act = await get('/api/paypal/activity');
  assert.equal(act.engine, 'mock');
  assert.equal(act.entries[0].tool, 'send_invoice_reminder');
  server.close();
});

test('end to end: dashboard -> approve -> PayPal Agent Toolkit send_invoice_reminder, then demo payment', async () => {
  const { pp, tk } = build({
    list_invoices: { total_pages: 1, items: [mkInv('INV2-A', 'SENT', '2026-11-08', '320.00'), mkInv('INV2-B', 'SENT', '2026-10-17', '900.00')] },
    send_invoice_reminder: '',
    get_invoice: mkInv('INV2-A', 'SENT', '2026-11-08', '320.00'),
    record_payment_for_invoice: { success: true }
  });
  const { app } = createApp({ paypal: pp, provider: 'mock', clientDist: '/nonexistent' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json() };
  };
  const AS_OF = '2026-11-10';

  const list = await call('GET', `/api/invoices?asOf=${AS_OF}`);
  assert.equal(list.status, 200);
  assert.equal(list.json.rows.length, 2);
  for (const r of list.json.rows) assert.equal(r.decision.requiresApproval, true);

  const ok = await call('POST', '/api/invoices/INV2-A/approve', { asOf: AS_OF });
  assert.equal(ok.status, 200);
  const sent = tk.calls.find((c) => c.method === 'send_invoice_reminder');
  assert.equal(sent.args.invoice_id, 'INV2-A');
  assert.ok(sent.args.note.length > 20 && !sent.args.note.includes('{{'));

  const paid = await call('POST', '/api/demo/pay/INV2-A', {});
  assert.equal(paid.status, 200);
  assert.ok(tk.calls.some((c) => c.method === 'record_payment_for_invoice'));

  const act = await call('GET', '/api/paypal/activity');
  assert.equal(act.json.engine, 'agent-toolkit');
  assert.ok(act.json.entries.every((e) => e.via === 'agent-toolkit' && e.ok));
  server.close();
});
