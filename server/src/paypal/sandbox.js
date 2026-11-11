import { randomUUID } from 'node:crypto';
import { mapInvoice } from './mapping.js';

const BASE = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

// Real PayPal REST calls (sandbox). Uses Invoicing API v2 + the Webhooks verify endpoint.
export function createSandboxPayPal({ clientId, clientSecret, webhookId, fetchImpl = fetch, base = BASE, allowUnverified = false }) {
  if (!clientId || !clientSecret) throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required for sandbox mode');
  let cached = null;

  async function token() {
    if (cached && cached.exp > Date.now() + 60000) return cached.value;
    const res = await fetchImpl(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials'
    });
    if (!res.ok) throw new Error(`PayPal auth failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    cached = { value: j.access_token, exp: Date.now() + (j.expires_in || 300) * 1000 };
    return cached.value;
  }

  async function api(method, path, body) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': randomUUID() },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`PayPal ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }

  return {
    mode: 'sandbox',
    defaultAsOf: null,
    api, // exposed for the seed script

    async listInvoices() {
      const out = [];
      for (let page = 1; page <= 5; page++) {
        const r = await api('GET', `/v2/invoicing/invoices?page=${page}&page_size=100&total_required=true`);
        out.push(...(r.items || []));
        if (page >= (r.total_pages || 1)) break;
      }
      return out.map(mapInvoice).filter((i) => i.status !== 'DRAFT' && i.status !== 'SCHEDULED' && i.dueDate);
    },

    // Docs: POST /v2/invoicing/invoices/{id}/remind  (subject, note, send_to_recipient, ...). Max 2 per day.
    async sendReminder(id, { subject, note }) {
      await api('POST', `/v2/invoicing/invoices/${encodeURIComponent(id)}/remind`, { subject, note, send_to_recipient: true, send_to_invoicer: false });
      return { ok: true };
    },

    // Best effort: GET the invoice, set partial payment, PUT it back. Never blocks the reminder.
    async ensurePartialPayment(id, minimumAmountDue, currency) {
      try {
        const inv = await api('GET', `/v2/invoicing/invoices/${encodeURIComponent(id)}`);
        if (inv.configuration?.partial_payment?.allow_partial_payment) return { applied: true, note: 'Partial payments were already enabled on this invoice.' };
        inv.configuration = { ...(inv.configuration || {}), partial_payment: { allow_partial_payment: true, minimum_amount_due: { currency_code: currency, value: minimumAmountDue } } };
        await api('PUT', `/v2/invoicing/invoices/${encodeURIComponent(id)}`, inv);
        return { applied: true, note: `Partial payments enabled (minimum ${currency} ${minimumAmountDue}).` };
      } catch (e) {
        return { applied: false, note: `Could not enable partial payments on PayPal (${e.message.slice(0, 160)}). The message still lists the plan.` };
      }
    },

    // Demo helper: POST /v2/invoicing/invoices/{id}/payments (fires INVOICING.INVOICE.PAID when settled).
    async recordPayment(id, { amount, currency = 'USD' } = {}) {
      const inv = mapInvoice(await api('GET', `/v2/invoicing/invoices/${encodeURIComponent(id)}`));
      const remaining = Number(inv.amount.value) - Number(inv.paidAmount);
      const value = (amount ? Math.min(Number(amount), remaining) : remaining).toFixed(2);
      await api('POST', `/v2/invoicing/invoices/${encodeURIComponent(id)}/payments`, {
        method: 'CASH', payment_date: new Date().toISOString().slice(0, 10), amount: { currency_code: inv.amount.currency || currency, value }
      });
      return { event: { id: `local-${randomUUID()}`, event_type: 'INVOICING.INVOICE.PAID', resource: { id } } };
    },

    // Docs: POST /v1/notifications/verify-webhook-signature with the webhook id from the dashboard.
    async verifyWebhook(headers, event) {
      if (!webhookId) return allowUnverified;
      const h = (k) => headers[k] || headers[k.toLowerCase()];
      const r = await api('POST', '/v1/notifications/verify-webhook-signature', {
        auth_algo: h('paypal-auth-algo'), cert_url: h('paypal-cert-url'), transmission_id: h('paypal-transmission-id'),
        transmission_sig: h('paypal-transmission-sig'), transmission_time: h('paypal-transmission-time'),
        webhook_id: webhookId, webhook_event: event
      });
      return r.verification_status === 'SUCCESS';
    }
  };
}
