import { addDays } from './dates.js';

// Money is handled in integer minor units. The LLM never computes amounts.
export const toMinor = (s) => Math.round(Number(s) * 100);
export const fromMinor = (n) => (n / 100).toFixed(2);

export function buildSplitPlan({ amountDue, currency, asOf, config }) {
  const total = toMinor(amountDue);
  const n = config.installments;
  const base = Math.floor(total / n);
  const remainder = total - base * n; // pennies go on the first installment
  const installments = Array.from({ length: n }, (_, i) => ({
    number: i + 1,
    amount: fromMinor(base + (i === 0 ? remainder : 0)),
    dueDate: addDays(asOf, config.firstDueInDays + i * config.gapDays)
  }));
  return {
    currency,
    total: fromMinor(total),
    installments,
    // Maps to PayPal partial payment "minimum_amount_due" (verify in docs).
    minimumAmountDue: installments[0].amount
  };
}

export function formatSplitPlan(plan) {
  return plan.installments
    .map((i) => `  ${i.number}. ${plan.currency} ${i.amount} by ${i.dueDate}`)
    .join('\n');
}
