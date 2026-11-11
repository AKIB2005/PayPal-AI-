import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Offline PayPal stand-in with the same interface as the sandbox adapter.
export function createMockPayPal(sample = JSON.parse(readFileSync(new URL('../data/sampleInvoices.json', import.meta.url)))) {
  const invoices = new Map(sample.invoices.map((i) => [i.id, { ...i, paidAmount: i.paidAmount || '0.00', partialPayment: null }]));
  const sent = [];
  const seedReminders = Object.fromEntries(sample.invoices.filter((i) => i.remindersSent?.length).map((i) => [i.id, i.remindersSent]));
  const strip = ({ remindersSent, ...rest }) => ({ ...rest });
  return {
    mode: 'mock',
    defaultAsOf: sample.asOf,
    sent, // inspectable by tests
    seedReminders, // earlier reminders from the sample data
    async listInvoices() { return [...invoices.values()].map(strip); },
    async sendReminder(id, { subject, note }) {
      if (!invoices.has(id)) throw new Error(`Unknown invoice ${id}`);
      sent.push({ id, subject, note });
      return { ok: true };
    },
    async ensurePartialPayment(id, minimumAmountDue, currency) {
      const inv = invoices.get(id);
      if (!inv) throw new Error(`Unknown invoice ${id}`);
      inv.partialPayment = { allow_partial_payment: true, minimum_amount_due: { currency_code: currency, value: minimumAmountDue } };
      return { applied: true, note: `Partial payments enabled (minimum ${currency} ${minimumAmountDue}).` };
    },
    async recordPayment(id, { amount } = {}) {
      const inv = invoices.get(id);
      if (!inv) throw new Error(`Unknown invoice ${id}`);
      const remaining = Number(inv.amount.value) - Number(inv.paidAmount);
      const pay = Math.min(amount ? Number(amount) : remaining, remaining);
      inv.paidAmount = (Number(inv.paidAmount) + pay).toFixed(2);
      inv.status = Number(inv.paidAmount) >= Number(inv.amount.value) ? 'PAID' : 'PARTIALLY_PAID';
      return { event: { id: `mock-${randomUUID()}`, event_type: inv.status === 'PAID' ? 'INVOICING.INVOICE.PAID' : 'INVOICING.INVOICE.UPDATED', resource: { id, status: inv.status } } };
    },
    async verifyWebhook() { return true; }
  };
}
