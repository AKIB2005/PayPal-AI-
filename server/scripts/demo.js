import { readFileSync } from 'node:fs';
import { decide } from '../src/agent/decide.js';

const data = JSON.parse(readFileSync(new URL('../src/data/sampleInvoices.json', import.meta.url)));
const provider = process.env.LLM_PROVIDER || 'mock';
const asOf = process.env.DEMO_DATE || data.asOf;
console.log(`Provider: ${provider} | As of: ${asOf}\n`);

for (const invoice of data.invoices) {
  const d = await decide({ invoice, history: data.histories[invoice.clientId], asOf, provider });
  console.log(`=== ${d.invoiceId} ${d.clientName} | ${d.daysOverdue}d overdue | ${d.currency} ${d.amountDue}`);
  console.log(`Stage: ${d.stage.toUpperCase()} (allowed: ${d.allowedStages.join(', ')}) [source: ${d.source}${d.fallbackReason ? ' - ' + d.fallbackReason : ''}]`);
  console.log(`Why: ${d.reasoning}`);
  if (d.draft) console.log(`Subject: ${d.draft.subject}\n${d.draft.body}`);
  console.log();
}
