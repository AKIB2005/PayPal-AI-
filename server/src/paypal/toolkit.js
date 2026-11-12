import { randomUUID } from 'node:crypto';
import { mapInvoice } from './mapping.js';

// PayPal adapter built on the official PayPal Agent Toolkit (@paypal/agent-toolkit).
//
// Every invoice action goes through the toolkit's tool layer, the same tool definitions PayPal ships for
// its MCP server and agent frameworks:
//   list_invoices, get_invoice, send_invoice_reminder, record_payment_for_invoice (+ send_invoice in the seed script)
// Only two things use plain REST, because the toolkit has no tool for them:
//   - enabling partial payments on an invoice that is already sent (full-invoice PUT)
//   - webhook signature verification (/v1/notifications/verify-webhook-signature)
// Every call is recorded in an activity log (GET /api/paypal/activity) so the demo can show which PayPal tool ran.

async function defaultApiFactory(accessToken) {
  const { PayPalAPI } = await import('@paypal/agent-toolkit/mcp');
  return new PayPalAPI(accessToken, { sandbox: true });
}

const clip = (v, n = 160) => String(v ?? '').slice(0, n);

export function createToolkitPayPal({ rest, apiFactory = defaultApiFactory, restFallback = true, maxActivity = 60 }) {
  if (!rest || typeof rest.token !== 'function' || typeof rest.api !== 'function') {
    throw new Error('createToolkitPayPal needs the sandbox REST adapter (for OAuth and the few calls the toolkit lacks)');
  }

  let cache = { token: null, api: null };
  const log = [];
  const record = (entry) => {
    log.unshift({ at: new Date().toISOString(), ...entry });
    log.length = Math.min(log.length, maxActivity);
  };

  // The toolkit takes an access token; rebuild its client whenever the token rotates.
  async function getApi() {
    const token = await rest.token();
    if (cache.token !== token) cache = { token, api: await apiFactory(token) };
    return cache.api;
  }

  // Run one PayPal Agent Toolkit tool. The toolkit never throws: it returns JSON text, errors included.
  async function tool(method, args, meta = {}) {
    const started = Date.now();
    try {
      const api = await getApi();
      const raw = await api.run(method, args);
      const out = raw ? JSON.parse(raw) : {};
      if (out && typeof out === 'object' && (out.ok === false || out.error)) {
        const err = new Error(out.message || out.error?.message || `${method} failed`);
        err.status = out.status;
        err.code = out.code;
        throw err;
      }
      record({ via: 'agent-toolkit', tool: method, ok: true, ms: Date.now() - started, ...meta });
      return out;
    } catch (e) {
      record({ via: 'agent-toolkit', tool: method, ok: false, ms: Date.now() - started, error: clip(e.message), ...meta });
      const wrapped = new Error(`PayPal tool ${method} failed: ${clip(e.message, 240)}`);
      wrapped.status = e.status;
      throw wrapped;
    }
  }

  // Plain REST, only for what the toolkit has no tool for. Logged separately so it is never mistaken for a tool call.
  async function restCall(method, path, body, label, meta = {}) {
    const started = Date.now();
    try {
      const out = await rest.api(method, path, body);
      record({ via: 'rest', tool: label, ok: true, ms: Date.now() - started, ...meta });
      return out;
    } catch (e) {
      record({ via: 'rest', tool: label, ok: false, ms: Date.now() - started, error: clip(e.message), ...meta });
      throw e;
    }
  }

  return {
    mode: 'sandbox',
    engine: 'agent-toolkit',
    defaultAsOf: null,
    api: rest.api, // raw REST (used by the seed script to set due dates, which the toolkit's create_invoice cannot)
    tool, // run any toolkit tool by name (used by the seed and smoke scripts)
    activity: () => [...log],

    async listInvoices() {
      const out = [];
      for (let page = 1; page <= 5; page += 1) {
        const r = await tool('list_invoices', { page, page_size: 100, total_required: true });
        out.push(...(r.items || []));
        if (page >= (r.total_pages || 1)) break;
      }
      return out.map(mapInvoice).filter((i) => i.status !== 'DRAFT' && i.status !== 'SCHEDULED' && i.dueDate);
    },

    // Toolkit tool: send_invoice_reminder { invoice_id, subject, note }. PayPal allows 2 reminders/day per API caller.
    async sendReminder(id, { subject, note }) {
      try {
        await tool('send_invoice_reminder', { invoice_id: id, subject, note }, { invoiceId: id });
      } catch (e) {
        // Safety net for demo day: if PayPal rejects the toolkit's request shape (400/422), retry once with the
        // documented REST body. It shows up as "rest" in the activity log, and never retries on other errors.
        if (!restFallback || ![400, 422].includes(e.status)) throw e;
        await restCall(
          'POST',
          `/v2/invoicing/invoices/${encodeURIComponent(id)}/remind`,
          { subject, note, send_to_recipient: true, send_to_invoicer: false },
          'send_invoice_reminder (REST fallback)',
          { invoiceId: id }
        );
      }
      return { ok: true };
    },

    // Reads through the toolkit (get_invoice). The write is a plain REST PUT: the toolkit's update tool is a
    // flat full-replacement and would drop fields. Failure is non-fatal: the message still lists the plan.
    async ensurePartialPayment(id, minimumAmountDue, currency) {
      try {
        const inv = await tool('get_invoice', { invoice_id: id }, { invoiceId: id });
        if (inv.configuration?.partial_payment?.allow_partial_payment) {
          return { applied: true, note: 'Partial payments were already enabled on this invoice.' };
        }
        inv.configuration = {
          ...(inv.configuration || {}),
          partial_payment: { allow_partial_payment: true, minimum_amount_due: { currency_code: currency, value: minimumAmountDue } }
        };
        await restCall('PUT', `/v2/invoicing/invoices/${encodeURIComponent(id)}`, inv, 'update_invoice (REST PUT)', { invoiceId: id });
        return { applied: true, note: `Partial payments enabled (minimum ${currency} ${minimumAmountDue}).` };
      } catch (e) {
        return { applied: false, note: `Could not enable partial payments on PayPal (${clip(e.message)}). The message still lists the plan.` };
      }
    },

    // Demo helper using toolkit tools get_invoice + record_payment_for_invoice (fires INVOICING.INVOICE.PAID when settled).
    async recordPayment(id, { amount, currency = 'USD' } = {}) {
      const inv = mapInvoice(await tool('get_invoice', { invoice_id: id }, { invoiceId: id }));
      const remaining = Number(inv.amount.value) - Number(inv.paidAmount);
      if (!(remaining > 0)) throw new Error('Nothing left to pay on this invoice.');
      const value = (amount ? Math.min(Number(amount), remaining) : remaining).toFixed(2);
      await tool(
        'record_payment_for_invoice',
        {
          invoice_id: id,
          method: 'CASH',
          payment_date: new Date().toISOString().slice(0, 10),
          amount: { currency_code: inv.amount.currency || currency, value }
        },
        { invoiceId: id }
      );
      return { event: { id: `local-${randomUUID()}`, event_type: 'INVOICING.INVOICE.PAID', resource: { id } } };
    },

    // No toolkit tool for webhooks: delegate to the REST adapter and log it.
    async verifyWebhook(headers, event) {
      const started = Date.now();
      try {
        const ok = await rest.verifyWebhook(headers, event);
        record({ via: 'rest', tool: 'verify-webhook-signature', ok, ms: Date.now() - started, eventType: event?.event_type });
        return ok;
      } catch (e) {
        record({ via: 'rest', tool: 'verify-webhook-signature', ok: false, ms: Date.now() - started, error: clip(e.message) });
        throw e;
      }
    }
  };
}
