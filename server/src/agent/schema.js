// The contract between agent, API and UI. Validated in code so nothing can skip approval.
export const STAGES = ['wait', 'friendly', 'firm', 'final', 'split_offer'];

export function validateDecision(d) {
  const err = (m) => { throw new Error(`Invalid decision: ${m}`); };
  if (!d || typeof d !== 'object') err('not an object');
  if (d.requiresApproval !== true) err('requiresApproval must be true');
  if (!STAGES.includes(d.stage)) err(`unknown stage ${d.stage}`);
  if (!Array.isArray(d.allowedStages) || !d.allowedStages.includes(d.stage)) err('stage not in allowedStages');
  if (typeof d.reasoning !== 'string' || !d.reasoning.trim()) err('reasoning missing');
  if (d.stage === 'wait') {
    if (d.draft !== null) err('wait must have draft null');
  } else {
    if (!d.draft || !d.draft.subject || !d.draft.body) err('draft missing');
    if (/\{\{/.test(d.draft.body + d.draft.subject)) err('unfilled placeholder');
  }
  if (d.stage === 'split_offer' && !d.splitPlan) err('split_offer needs splitPlan');
  return d;
}

// Checks the raw LLM JSON before we trust it.
const MONEY = /[$€£₹]|\b(USD|EUR|GBP|INR|CAD|AUD)\b|\d+[.,]\d{2}\b/i;

export function checkLLMOutput(o, { allowed, placeholders }) {
  if (!o || typeof o !== 'object') throw new Error('LLM output not an object');
  if (!allowed.includes(o.stage) || o.stage === 'wait') throw new Error(`LLM chose disallowed stage: ${o.stage}`);
  for (const k of ['reasoning', 'subject', 'body']) {
    if (typeof o[k] !== 'string' || !o[k].trim()) throw new Error(`LLM output missing ${k}`);
  }
  if (MONEY.test(o.subject) || MONEY.test(o.body)) throw new Error('LLM wrote a money amount; amounts must be placeholders');
  const used = (o.subject + o.body).match(/\{\{(\w+)\}\}/g) || [];
  for (const u of used) {
    if (!placeholders.includes(u.slice(2, -2))) throw new Error(`Unknown placeholder ${u}`);
  }
  if (o.stage === 'split_offer' && !o.body.includes('{{splitPlan}}')) throw new Error('split_offer body missing {{splitPlan}}');
  return o;
}
