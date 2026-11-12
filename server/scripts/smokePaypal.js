// Run this FIRST against your real sandbox. It exercises each PayPal Agent Toolkit tool Nudge relies on, read-only
// by default, and prints a pass/fail line per step so you know exactly what works before the demo.
//   node scripts/smokePaypal.js                   -> auth, list_invoices, get_invoice
//   node scripts/smokePaypal.js --remind INV2-XXX -> also sends ONE real reminder email via send_invoice_reminder
import { loadEnv } from '../src/env.js';
loadEnv();
const { createSandboxPayPal } = await import('../src/paypal/sandbox.js');
const { createToolkitPayPal } = await import('../src/paypal/toolkit.js');

const rest = createSandboxPayPal({ clientId: process.env.PAYPAL_CLIENT_ID, clientSecret: process.env.PAYPAL_CLIENT_SECRET });
const pp = createToolkitPayPal({ rest, restFallback: false }); // no silent fallback: we want to see failures
const remindIdx = process.argv.indexOf('--remind');
const remindId = remindIdx > -1 ? process.argv[remindIdx + 1] : null;

let failed = 0;
async function step(name, fn) {
  try {
    const detail = await fn();
    console.log(`PASS  ${name}${detail ? ' | ' + detail : ''}`);
  } catch (e) {
    failed += 1;
    console.log(`FAIL  ${name} | ${e.message}`);
  }
}

let invoices = [];
await step('OAuth token (client credentials)', async () => { await rest.token(); });
await step('toolkit list_invoices', async () => { invoices = await pp.listInvoices(); return `${invoices.length} usable invoices`; });
if (invoices[0]) {
  await step(`toolkit get_invoice ${invoices[0].id}`, async () => { const r = await pp.tool('get_invoice', { invoice_id: invoices[0].id }); return `status ${r.status}, due ${r.detail?.payment_term?.due_date}`; });
} else {
  console.log('SKIP  get_invoice (no invoices yet: run npm run seed:sandbox)');
}
if (remindId) {
  await step(`toolkit send_invoice_reminder ${remindId}`, async () => { await pp.sendReminder(remindId, { subject: 'Nudge smoke test', note: 'Friendly test reminder from Nudge. Please ignore.' }); });
} else {
  console.log('SKIP  send_invoice_reminder (pass --remind <invoiceId> to send one real sandbox email)');
}
console.log('\nActivity log:');
for (const a of pp.activity().reverse()) console.log(`  ${a.ok ? 'ok ' : 'ERR'} ${a.via.padEnd(13)} ${a.tool}${a.error ? ' -> ' + a.error : ''}`);
process.exit(failed ? 1 : 0);
