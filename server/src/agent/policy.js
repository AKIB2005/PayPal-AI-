import { CONFIG } from '../config.js';
import { daysBetween } from './dates.js';
import { toMinor, fromMinor } from './split.js';

const INACTIVE = ['PAID', 'CANCELLED', 'REFUNDED', 'MARKED_AS_PAID', 'MARKED_AS_REFUNDED'];

export function validateInvoice(inv) {
  if (!inv || !inv.id || !inv.dueDate || !inv.amount) throw new Error('Invoice needs id, dueDate, amount');
  if (!Number.isFinite(Number(inv.amount.value))) throw new Error('Invoice amount.value must be numeric');
  if (!inv.amount.currency) throw new Error('Invoice amount.currency missing');
}

export function isReliableClient(history = {}, config = CONFIG) {
  const r = config.reliableClient;
  return (history.invoicesPaid ?? 0) >= r.minPaid &&
    (history.lateCount ?? 0) <= r.maxLate &&
    (history.avgDaysLate ?? 0) <= r.maxAvgDaysLate;
}

// Deterministic rules. Returns which stages the agent is ALLOWED to pick.
export function evaluatePolicy({ invoice, history = {}, asOf, config = CONFIG }) {
  validateInvoice(invoice);
  const notes = [];
  const reminders = [...(invoice.remindersSent || [])].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const last = reminders[reminders.length - 1] || null;
  const overdue = daysBetween(invoice.dueDate, asOf);
  const amountDueMinor = toMinor(invoice.amount.value) - toMinor(invoice.paidAmount || '0');
  const base = {
    daysOverdue: overdue,
    amountDue: fromMinor(Math.max(amountDueMinor, 0)),
    currency: invoice.amount.currency,
    priorReminders: reminders.length,
    lastReminderStage: last ? last.stage : null,
    daysSinceLastReminder: last ? daysBetween(last.sentAt.slice(0, 10), asOf) : null,
    reliableClient: isReliableClient(history, config)
  };

  const stop = (msg) => ({ ...base, eligible: false, allowedStages: ['wait'], notes: [...notes, msg] });

  if (INACTIVE.includes(invoice.status) || amountDueMinor <= 0) return stop(`Invoice is ${invoice.status || 'settled'}; nothing to chase.`);
  if (overdue < config.stageMinDays.friendly) return stop(overdue <= 0 ? 'Not overdue yet.' : 'Inside grace period.');
  if (reminders.length >= config.maxReminders) return stop(`Already sent ${reminders.length} reminders. Hand over to a human.`);
  if (base.daysSinceLastReminder !== null && base.daysSinceLastReminder < config.cooldownDays) {
    return stop(`Last reminder was ${base.daysSinceLastReminder} day(s) ago; cooldown is ${config.cooldownDays}.`);
  }

  const lastRank = last ? (config.ladder[last.stage] || 0) : 0;
  const allowed = [];
  const m = config.stageMinDays;
  const rank = config.ladder;

  if (overdue >= m.friendly && overdue <= config.friendlyMaxDays && rank.friendly >= lastRank) allowed.push('friendly');
  if (overdue >= m.firm && rank.firm >= lastRank) allowed.push('firm');
  if (overdue >= m.final) {
    if (reminders.length >= 1) allowed.push('final');
    else notes.push('Final notice blocked: no earlier reminder has been sent.');
  }
  const splitEligible = overdue >= m.split_offer && amountDueMinor >= toMinor(config.split.minAmount);
  if (splitEligible) allowed.push('split_offer');
  else if (overdue >= m.split_offer) notes.push('Split offer blocked: amount below minimum.');
  if (lastRank > 1) notes.push('Escalation ladder: cannot drop back to a softer tone.');
  if (base.reliableClient) notes.push('Client has a reliable payment history; prefer the gentler allowed stage.');

  if (allowed.length === 0) return stop('No stage is allowed by policy right now.');
  return { ...base, eligible: true, allowedStages: allowed, splitEligible, notes };
}

// Sensible default when no LLM is available (used by fallback and mock).
export function defaultStage(policy) {
  const a = policy.allowedStages;
  if (policy.reliableClient) return a.find((s) => s !== 'final' && s !== 'split_offer') || a[0];
  if (a.includes('split_offer') && policy.daysOverdue >= 21) return 'split_offer';
  const ladder = ['final', 'firm', 'friendly'];
  return ladder.find((s) => a.includes(s)) || a[0];
}
