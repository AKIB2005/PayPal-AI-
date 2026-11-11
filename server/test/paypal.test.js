import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandboxPayPal } from '../src/paypal/sandbox.js';
import { mapInvoice } from '../src/paypal/mapping.js';

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', headers: opts.headers, body: opts.body ? (opts.body.startsWith('{') ? JSON.parse(opts.body) : opts.body) : undefined });
    const hit = routes.find(([m, p]) => m === (opts.method || 'GET') && url.includes(p));
    if (!hit) return { ok: false, status: 404, text: async () => 'no route', json: async () => ({}) };
    const [, , status, payload] = hit;
    return { ok: status < 400, status, text: async () => (payload === undefined ? '' : JSON.stringify(payload)), json: async () => payload };
  };
  return { impl, calls };
}
const TOKEN = ['POST', '/v1/oauth2/token', 200, { access_token: 'tok', expires_in: 3600 }];
const mk = (routes, extra = {}) => { const f = fakeFetch([TOKEN, ...routes]); return { pp: createSandboxPayPal({ clientId: 'id', clientSecret: 'sec', fetchImpl: f.impl, base: 'https://pp.test', ...extra }), calls: f.calls }; };

test('mapInvoice maps a PayPal invoice', () => {
  const m = mapInvoice({
    id: 'INV2-ABC', status: 'PARTIALLY_PAID',
    detail: { invoice_number: '0042', payment_term: { due_date: '2026-10-20' } },
    primary_recipients: [{ billing_info: { business_name: 'Acme Corp', email_address: 'a@b.co' } }],
    amount: { currency_code: 'USD', value: '1000.00' }, due_amount: { currency_code: 'USD', value: '750.00' }
  });
  assert.deepEqual(m, { id: 'INV2-ABC', number: '0042', clientId: 'a@b.co', clientName: 'Acme Corp', status: 'PARTIALLY_PAID', amount: { currency: 'USD', value: '1000.00' }, paidAmount: '250.00', dueDate: '2026-10-20', partialPayment: null });
});

test('auth uses client credentials and the token is cached', async () => {
  const { pp, calls } = mk([['GET', '/v2/invoicing/invoices?', 200, { total_pages: 1, items: [] }]]);
  await pp.listInvoices(); await pp.listInvoices();
  const auth = calls.filter((c) => c.url.endsWith('/v1/oauth2/token'));
  assert.equal(auth.length, 1);
  assert.equal(auth[0].body, 'grant_type=client_credentials');
  assert.match(auth[0].headers.Authorization, /^Basic /);
  assert.equal(calls.find((c) => c.url.includes('/v2/invoicing')).headers.Authorization, 'Bearer tok');
});

test('listInvoices drops drafts and invoices without a due date', async () => {
  const mkInv = (id, status, due) => ({ id, status, detail: { payment_term: due ? { due_date: due } : {} }, amount: { currency_code: 'USD', value: '10.00' } });
  const { pp } = mk([['GET', '/v2/invoicing/invoices?', 200, { total_pages: 1, items: [mkInv('A', 'SENT', '2026-11-01'), mkInv('B', 'DRAFT', '2026-11-01'), mkInv('C', 'SENT', null)] }]]);
  assert.deepEqual((await pp.listInvoices()).map((i) => i.id), ['A']);
});

test('sendReminder posts to /remind with subject, note, send_to_recipient', async () => {
  const { pp, calls } = mk([['POST', '/remind', 204, undefined]]);
  await pp.sendReminder('INV2-X', { subject: 'S', note: 'N' });
  const c = calls.find((x) => x.url.endsWith('/v2/invoicing/invoices/INV2-X/remind'));
  assert.deepEqual(c.body, { subject: 'S', note: 'N', send_to_recipient: true, send_to_invoicer: false });
});

test('ensurePartialPayment PUTs the invoice and reports failure without throwing', async () => {
  const inv = { id: 'INV2-X', configuration: {} };
  const ok = mk([['GET', '/INV2-X', 200, inv], ['PUT', '/INV2-X', 200, {}]]);
  const r = await ok.pp.ensurePartialPayment('INV2-X', '400.00', 'USD');
  assert.equal(r.applied, true);
  const put = ok.calls.find((c) => c.method === 'PUT');
  assert.deepEqual(put.body.configuration.partial_payment, { allow_partial_payment: true, minimum_amount_due: { currency_code: 'USD', value: '400.00' } });
  const bad = mk([['GET', '/INV2-X', 200, inv], ['PUT', '/INV2-X', 422, { name: 'UNPROCESSABLE' }]]);
  const r2 = await bad.pp.ensurePartialPayment('INV2-X', '400.00', 'USD');
  assert.equal(r2.applied, false);
});

test('verifyWebhook calls PayPal verify endpoint with the header values', async () => {
  const { pp, calls } = mk([['POST', '/v1/notifications/verify-webhook-signature', 200, { verification_status: 'SUCCESS' }]], { webhookId: 'WH-ID' });
  const headers = { 'paypal-auth-algo': 'A', 'paypal-cert-url': 'U', 'paypal-transmission-id': 'T', 'paypal-transmission-sig': 'S', 'paypal-transmission-time': 'TM' };
  assert.equal(await pp.verifyWebhook(headers, { id: 'E' }), true);
  const body = calls.find((c) => c.url.includes('verify-webhook-signature')).body;
  assert.equal(body.webhook_id, 'WH-ID');
  assert.deepEqual(body.webhook_event, { id: 'E' });
  assert.equal(body.transmission_sig, 'S');
});

test('without a webhook id, verification fails closed unless explicitly allowed', async () => {
  assert.equal(await mk([]).pp.verifyWebhook({}, {}), false);
  assert.equal(await mk([], { allowUnverified: true }).pp.verifyWebhook({}, {}), true);
});

test('sandbox mode requires credentials', () => {
  assert.throws(() => createSandboxPayPal({}), /required/);
});
