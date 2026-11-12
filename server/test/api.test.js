import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createMockPayPal } from '../src/paypal/mock.js';

async function boot() {
  const paypal = createMockPayPal();
  const { app, store } = createApp({ paypal, provider: 'mock', clientDist: '/nonexistent' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json() };
  };
  return { paypal, store, call, close: () => server.close() };
}
const AS_OF = '2026-11-10';
const row = (rows, id) => rows.find((r) => r.invoice.id === id);

test('GET /api/invoices returns gated decisions for every invoice', async () => {
  const { call, close } = await boot();
  const { status, json } = await call('GET', `/api/invoices?asOf=${AS_OF}`);
  assert.equal(status, 200);
  assert.equal(json.rows.length, 6);
  for (const r of json.rows) assert.equal(r.decision.requiresApproval, true);
  assert.equal(row(json.rows, 'INV-2005').decision.stage, 'wait');   // paid
  assert.equal(row(json.rows, 'INV-2003').decision.daysOverdue, 21);
  close();
});

test('bad asOf is rejected', async () => {
  const { call, close } = await boot();
  assert.equal((await call('GET', '/api/invoices?asOf=nope')).status, 400);
  close();
});

test('approve sends via PayPal, logs reminder, then cooldown blocks a repeat', async () => {
  const { call, paypal, close } = await boot();
  await call('GET', `/api/invoices?asOf=${AS_OF}`);
  const ok = await call('POST', '/api/invoices/INV-2001/approve', { asOf: AS_OF });
  assert.equal(ok.status, 200);
  assert.equal(paypal.sent.length, 1);
  assert.equal(paypal.sent[0].id, 'INV-2001');
  assert.ok(!paypal.sent[0].note.includes('{{'));
  const after = await call('GET', `/api/invoices?asOf=${AS_OF}`);
  assert.equal(row(after.json.rows, 'INV-2001').decision.stage, 'wait');
  const again = await call('POST', '/api/invoices/INV-2001/approve', { asOf: AS_OF });
  assert.equal(again.status, 409);
  assert.equal(paypal.sent.length, 1); // never double-sent
  close();
});

test('edited text is sent and flagged as edited; placeholders are refused', async () => {
  const { call, paypal, close } = await boot();
  await call('GET', `/api/invoices?asOf=${AS_OF}`);
  const bad = await call('POST', '/api/invoices/INV-2001/approve', { asOf: AS_OF, subject: 'Hi', body: 'Pay {{amountDue}} now' });
  assert.equal(bad.status, 400);
  const ok = await call('POST', '/api/invoices/INV-2001/approve', { asOf: AS_OF, subject: 'Hello', body: 'My own words.' });
  assert.equal(ok.json.edited, true);
  assert.equal(paypal.sent[0].note, 'My own words.');
  close();
});

test('cannot approve a wait decision or an unknown/out-of-date one', async () => {
  const { call, paypal, close } = await boot();
  await call('GET', `/api/invoices?asOf=${AS_OF}`);
  assert.equal((await call('POST', '/api/invoices/INV-2005/approve', { asOf: AS_OF })).status, 409); // paid
  assert.equal((await call('POST', '/api/invoices/NOPE/approve', { asOf: AS_OF })).status, 404);
  assert.equal((await call('POST', '/api/invoices/INV-2001/approve', { asOf: '2026-12-31' })).status, 409); // never loaded for that date
  assert.equal(paypal.sent.length, 0);
  close();
});

test('split offer enables partial payment then sends', async () => {
  const { call, paypal, close } = await boot();
  const { json } = await call('GET', `/api/invoices?asOf=${AS_OF}`);
  assert.equal(row(json.rows, 'INV-2003').decision.stage, 'split_offer');
  const ok = await call('POST', '/api/invoices/INV-2003/approve', { asOf: AS_OF });
  assert.equal(ok.json.partialPayment.applied, true);
  assert.equal(paypal.sent.length, 1);
  close();
});

test('reject records and sends nothing', async () => {
  const { call, paypal, close } = await boot();
  await call('GET', `/api/invoices?asOf=${AS_OF}`);
  assert.equal((await call('POST', '/api/invoices/INV-2002/reject', { asOf: AS_OF })).status, 200);
  const after = await call('GET', `/api/invoices?asOf=${AS_OF}`);
  assert.equal(row(after.json.rows, 'INV-2002').rejected, true);
  assert.equal(paypal.sent.length, 0);
  const audit = await call('GET', '/api/audit');
  assert.equal(audit.json.entries[0].action, 'rejected');
  close();
});

test('webhook marks invoice paid, de-duplicates, ignores other events', async () => {
  const { call, paypal, close } = await boot();
  await call('GET', `/api/invoices?asOf=${AS_OF}`);
  await paypal.recordPayment('INV-2001'); // PayPal-side change
  const ev = { id: 'WH-1', event_type: 'INVOICING.INVOICE.PAID', resource: { id: 'INV-2001' } };
  assert.equal((await call('POST', '/api/webhooks/paypal', ev)).json.ok, true);
  assert.equal((await call('POST', '/api/webhooks/paypal', ev)).json.duplicate, true);
  assert.equal((await call('POST', '/api/webhooks/paypal', { id: 'WH-2', event_type: 'PAYMENT.SALE.COMPLETED', resource: {} })).json.ignored, true);
  const after = await call('GET', `/api/invoices?asOf=${AS_OF}`);
  assert.equal(row(after.json.rows, 'INV-2001').invoice.status, 'PAID');
  assert.equal(row(after.json.rows, 'INV-2001').decision.stage, 'wait');
  assert.equal((await call('POST', '/api/webhooks/paypal', { nope: 1 })).status, 400);
  close();
});

test('demo pay button goes through the same webhook path', async () => {
  const { call, close } = await boot();
  await call('GET', `/api/invoices?asOf=${AS_OF}`);
  const r = await call('POST', '/api/demo/pay/INV-2002');
  assert.equal(r.json.ok, true);
  const after = await call('GET', `/api/invoices?asOf=${AS_OF}`);
  assert.equal(row(after.json.rows, 'INV-2002').invoice.status, 'PAID');
  close();
});

test('healthz and config expose what the deploy and UI need', async () => {
  const { call, close } = await boot();
  assert.deepEqual((await call('GET', '/healthz')).json, { ok: true });
  const c = (await call('GET', '/api/config')).json;
  assert.equal(c.paypalMode, 'mock');
  assert.equal(c.suggestedDemoDate, c.defaultAsOf); // mock mode: nothing to jump to
  close();
});

test('approve reports which PayPal tool ran, and the activity log records it', async () => {
  const { call, close } = await boot();
  await call('GET', `/api/invoices?asOf=${AS_OF}`);
  const ok = await call('POST', '/api/invoices/INV-2001/approve', { asOf: AS_OF });
  assert.deepEqual(ok.json.paypal, { via: 'mock', tool: 'send_invoice_reminder' });
  const act = await call('GET', '/api/paypal/activity');
  assert.equal(act.json.entries[0].tool, 'send_invoice_reminder');
  close();
});
