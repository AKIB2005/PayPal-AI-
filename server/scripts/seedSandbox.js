// Creates and sends demo invoices in the PayPal SANDBOX.
// Creating uses PayPal REST because the toolkit's create_invoice has no due-date field, and Nudge needs staggered due dates.
// Sending uses the PayPal Agent Toolkit tool send_invoice.
// PayPal requires invoice/due dates to be today or later, so due dates are staggered into the future.
// Then set the app's demo date to today + 21 days to see ~2, 9, 19, 20 and 21 days overdue.
import { loadEnv } from '../src/env.js';
loadEnv();
const { createSandboxPayPal } = await import('../src/paypal/sandbox.js');
const { createToolkitPayPal } = await import('../src/paypal/toolkit.js');

const rest = createSandboxPayPal({ clientId: process.env.PAYPAL_CLIENT_ID, clientSecret: process.env.PAYPAL_CLIENT_SECRET });
const pp = createToolkitPayPal({ rest });
const email = process.env.PAYPAL_TEST_PAYER_EMAIL;
if (!email) throw new Error('Set PAYPAL_TEST_PAYER_EMAIL to a sandbox personal account email');

const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const today = addDays(0);
const seeds = [
  { client: 'NewCo',     amount: '450.00',  dueIn: 19 },
  { client: 'Riya',      amount: '800.00',  dueIn: 12 },
  { client: 'Acme Corp', amount: '1200.00', dueIn: 0 },
  { client: 'Acme Corp', amount: '1000.00', dueIn: 1 },
  { client: 'NewCo',     amount: '60.00',   dueIn: 2 }
];

for (const [i, s] of seeds.entries()) {
  const min = (Number(s.amount) / 3).toFixed(2);
  const created = await pp.api('POST', '/v2/invoicing/invoices', {
    detail: {
      invoice_number: `NUDGE-${Date.now().toString().slice(-6)}-${i + 1}`,
      invoice_date: today,
      currency_code: 'USD',
      payment_term: { term_type: 'DUE_ON_DATE_SPECIFIED', due_date: addDays(s.dueIn) }
    },
    invoicer: { name: { given_name: 'Nudge', surname: 'Demo' } },
    primary_recipients: [{ billing_info: { business_name: s.client, email_address: email } }],
    items: [{ name: 'Consulting work', quantity: '1', unit_amount: { currency_code: 'USD', value: s.amount } }],
    configuration: { partial_payment: { allow_partial_payment: true, minimum_amount_due: { currency_code: 'USD', value: min } } }
  });
  const id = String(created.href).split('/').pop(); // create returns a link, the id is the last segment
  let via = 'agent-toolkit send_invoice';
  try {
    await pp.tool('send_invoice', { invoice_id: id, send_to_recipient: true });
  } catch (e) {
    // If PayPal rejects the toolkit's request shape, fall back to the documented REST body so seeding still works.
    console.warn(`  toolkit send_invoice failed (${e.message.slice(0, 120)}), retrying with REST`);
    await pp.api('POST', `/v2/invoicing/invoices/${id}/send`, { send_to_recipient: true, send_to_invoicer: false });
    via = 'REST fallback';
  }
  console.log(`Created + sent ${id} | ${s.client} | USD ${s.amount} | due ${addDays(s.dueIn)} | ${via}`);
}
console.log(`\nDone. Set the dashboard demo date to ${addDays(21)} (today + 21 days).`);
