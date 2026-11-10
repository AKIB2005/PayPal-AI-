import { CONFIG } from '../config.js';
import { evaluatePolicy, defaultStage } from './policy.js';
import { buildSplitPlan, formatSplitPlan } from './split.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';
import { callLLM, parseLLMJson } from './llm.js';
import { template, reasoningFor, PLACEHOLDERS } from './templates.js';
import { checkLLMOutput, validateDecision } from './schema.js';

function render(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : `{{${k}}}`));
}

/**
 * Main entry. Returns a validated decision object (see AGENTS.md for the contract).
 * Never throws for LLM problems: falls back to templates and records why.
 */
export async function decide({ invoice, history = {}, asOf, provider = process.env.LLM_PROVIDER || 'mock', llm = callLLM, config = CONFIG }) {
  const policy = evaluatePolicy({ invoice, history, asOf, config });
  const base = {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number || invoice.id,
    clientName: invoice.clientName || 'there',
    asOf,
    daysOverdue: policy.daysOverdue,
    amountDue: policy.amountDue,
    currency: policy.currency,
    allowedStages: policy.allowedStages,
    policyNotes: policy.notes,
    requiresApproval: true
  };

  if (policy.allowedStages.length === 1 && policy.allowedStages[0] === 'wait') {
    return validateDecision({ ...base, stage: 'wait', reasoning: policy.notes.join(' ') || 'No action needed.', draft: null, splitPlan: null, source: 'policy', provider: null, fallbackReason: null });
  }

  const splitPlan = policy.allowedStages.includes('split_offer')
    ? buildSplitPlan({ amountDue: policy.amountDue, currency: policy.currency, asOf, config: config.split })
    : null;

  const facts = {
    invoiceNumber: base.invoiceNumber,
    daysOverdue: policy.daysOverdue,
    priorReminders: policy.priorReminders,
    lastReminderStage: policy.lastReminderStage,
    daysSinceLastReminder: policy.daysSinceLastReminder,
    allowedStages: policy.allowedStages,
    clientHistory: { invoicesPaid: history.invoicesPaid ?? 0, lateCount: history.lateCount ?? 0, avgDaysLate: history.avgDaysLate ?? 0, reliable: policy.reliableClient },
    splitPlanAvailable: Boolean(splitPlan),
    policyNotes: policy.notes
  };

  let out, source = 'llm', fallbackReason = null;
  try {
    const raw = await llm(provider, { system: SYSTEM_PROMPT, user: buildUserPrompt(facts), policy });
    out = checkLLMOutput(parseLLMJson(raw), { allowed: policy.allowedStages, placeholders: PLACEHOLDERS });
  } catch (e) {
    source = 'fallback';
    fallbackReason = e.message;
    const stage = defaultStage(policy);
    out = { stage, reasoning: reasoningFor(policy, stage), ...template(stage) };
  }

  const vars = {
    clientName: base.clientName,
    invoiceNumber: base.invoiceNumber,
    amountDue: `${policy.currency} ${policy.amountDue}`,
    dueDate: invoice.dueDate,
    daysOverdue: String(policy.daysOverdue),
    splitPlan: splitPlan ? formatSplitPlan(splitPlan) : '',
    senderName: config.senderName
  };

  return validateDecision({
    ...base,
    stage: out.stage,
    reasoning: out.reasoning.trim(),
    draft: { subject: render(out.subject, vars), body: render(out.body, vars) },
    splitPlan: out.stage === 'split_offer' ? splitPlan : null,
    source,
    provider: source === 'llm' ? provider : null,
    fallbackReason
  });
}
