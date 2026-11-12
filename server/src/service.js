import { readFileSync } from 'node:fs';
import { decide } from './agent/decide.js';
import { evaluatePolicy } from './agent/policy.js';
import { HttpError } from './errors.js';

const HISTORY = JSON.parse(readFileSync(new URL('./data/clientHistory.json', import.meta.url)));
const SUBJECT_MAX = 200;
const BODY_MAX = 2000;

const REFRESH_MIN_MS = 10000; // "Re-run agent" can't be spammed (each run costs AI calls)

export function createService({ paypal, store, hub, provider = 'mock', llm, now = Date.now }) {
  let lastRefresh = -Infinity;
  const histFor = (inv) => HISTORY[(inv.clientName || '').toLowerCase()] || {};
  const remindersOf = (id) => store.reminders.get(id) || [];
  const withReminders = (inv) => ({ ...inv, remindersSent: remindersOf(inv.id) });
  const keyFor = (inv, asOf) => [inv.id, asOf, inv.status, inv.paidAmount || '0', remindersOf(inv.id).length, provider].join('|');
  const log = (entry) => { store.audit.unshift({ at: new Date().toISOString(), ...entry }); store.audit.length = Math.min(store.audit.length, 100); };
  const purge = (id) => { for (const k of store.decisions.keys()) if (k.startsWith(`${id}|`)) store.decisions.delete(k); };

  async function find(invoiceId) {
    const inv = (await paypal.listInvoices()).find((i) => i.id === invoiceId);
    if (!inv) throw new HttpError(404, `Invoice ${invoiceId} not found`);
    return withReminders(inv);
  }

  async function list({ asOf, refresh = false }) {
    const doRefresh = refresh && now() - lastRefresh >= REFRESH_MIN_MS;
    if (doRefresh) lastRefresh = now();
    const raw = await paypal.listInvoices();
    const rows = await Promise.all(raw.map(async (r) => {
      const invoice = withReminders(r);
      const decisionKey = keyFor(invoice, asOf);
      let decision = doRefresh ? null : store.decisions.get(decisionKey);
      if (!decision) {
        try {
          decision = await decide({ invoice, history: histFor(invoice), asOf, provider, llm });
          store.decisions.set(decisionKey, decision);
        } catch (e) {
          return { invoice, decision: null, error: e.message, rejected: false };
        }
      }
      const rejected = store.rejections.has(`${invoice.id}|${invoice.remindersSent.length}|${asOf}`);
      return { invoice, decision, rejected };
    }));
    return rows.sort((a, b) => (b.decision?.daysOverdue ?? -999) - (a.decision?.daysOverdue ?? -999));
  }

  async function approve({ invoiceId, asOf, subject, body }) {
    const invoice = await find(invoiceId);
    const decision = store.decisions.get(keyFor(invoice, asOf));
    if (!decision) throw new HttpError(409, 'This decision is out of date. Reload the dashboard and try again.');
    if (decision.stage === 'wait') throw new HttpError(409, 'The agent recommends waiting, so there is nothing to send.');

    // Re-check policy on the server: never trust the browser.
    const policy = evaluatePolicy({ invoice, history: histFor(invoice), asOf });
    if (!policy.allowedStages.includes(decision.stage)) throw new HttpError(409, 'Policy no longer allows this stage.');

    const subj = String(subject ?? decision.draft.subject).trim();
    const note = String(body ?? decision.draft.body).trim();
    if (!subj || !note) throw new HttpError(400, 'Subject and message cannot be empty.');
    if (subj.length > SUBJECT_MAX || note.length > BODY_MAX) throw new HttpError(400, 'Message is too long.');
    if (/\{\{|\}\}/.test(subj + note)) throw new HttpError(400, 'Message still contains an unfilled {{placeholder}}.');

    let partialPayment = null;
    if (decision.stage === 'split_offer') {
      partialPayment = await paypal.ensurePartialPayment(invoiceId, decision.splitPlan.minimumAmountDue, decision.currency);
    }
    await paypal.sendReminder(invoiceId, { subject: subj, note });
    const last = paypal.activity ? paypal.activity()[0] : null; // the call that just ran (toolkit tool, REST fallback, or mock)

    store.reminders.set(invoiceId, [...remindersOf(invoiceId), { sentAt: `${asOf}T12:00:00Z`, stage: decision.stage }]);
    purge(invoiceId);
    const edited = subj !== decision.draft.subject || note !== decision.draft.body;
    log({ action: 'approved', invoiceId, clientName: invoice.clientName, stage: decision.stage, edited, source: decision.source });
    hub.emit('invoice-updated', { invoiceId, reason: 'reminder-sent' });
    return { ok: true, stage: decision.stage, edited, partialPayment, paypal: last ? { via: last.via, tool: last.tool } : null };
  }

  async function reject({ invoiceId, asOf }) {
    const invoice = await find(invoiceId);
    const decision = store.decisions.get(keyFor(invoice, asOf));
    if (!decision) throw new HttpError(409, 'This decision is out of date. Reload the dashboard and try again.');
    store.rejections.set(`${invoiceId}|${invoice.remindersSent.length}|${asOf}`, { at: Date.now() });
    log({ action: 'rejected', invoiceId, clientName: invoice.clientName, stage: decision.stage });
    hub.emit('invoice-updated', { invoiceId, reason: 'rejected' });
    return { ok: true };
  }

  // PayPal (or the demo button) tells us an invoice changed.
  function handleWebhook(event, { local = false } = {}) {
    if (!event || !event.id || typeof event.event_type !== 'string') throw new HttpError(400, 'Not a PayPal event');
    if (store.seenEvents.has(event.id)) return { duplicate: true };
    store.seenEvents.add(event.id);
    if (!event.event_type.startsWith('INVOICING.INVOICE.')) return { ignored: true };
    const invoiceId = event.resource?.id ?? event.resource?.invoice?.id ?? null;
    if (invoiceId) purge(invoiceId);
    log({ action: 'webhook', invoiceId, detail: event.event_type + (local ? ' (local demo)' : '') });
    hub.emit('invoice-updated', { invoiceId, reason: 'webhook', eventType: event.event_type });
    return { ok: true };
  }

  async function simulatePayment({ invoiceId, amount }) {
    const { event } = await paypal.recordPayment(invoiceId, { amount });
    return handleWebhook(event, { local: true });
  }

  return { list, approve, reject, handleWebhook, simulatePayment };
}
