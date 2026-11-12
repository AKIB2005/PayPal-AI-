import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../src/agent/decide.js';

const invoice = { id: 'I1', number: '7', clientName: 'Acme', status: 'SENT', amount: { currency: 'USD', value: '1200.00' }, dueDate: '2026-10-20', remindersSent: [{ sentAt: '2026-10-30T09:00:00Z', stage: 'friendly' }] };
const asOf = '2026-11-10';
const llmReturning = (obj) => async () => (typeof obj === 'string' ? obj : JSON.stringify(obj));

test('mock provider produces an approved-gated decision', async () => {
  const d = await decide({ invoice, asOf, provider: 'mock' });
  assert.equal(d.requiresApproval, true);
  assert.equal(d.source, 'llm');
  assert.ok(d.draft.body.includes('USD 1200.00'));
  assert.ok(!/\{\{/.test(d.draft.body));
});

test('wait decisions never call the LLM', async () => {
  let called = false;
  const d = await decide({ invoice: { ...invoice, status: 'PAID' }, asOf, llm: async () => { called = true; return '{}'; } });
  assert.equal(d.stage, 'wait');
  assert.equal(called, false);
  assert.equal(d.draft, null);
});

test('LLM choosing a disallowed stage falls back', async () => {
  const d = await decide({ invoice: { ...invoice, dueDate: '2026-11-08', remindersSent: [] }, asOf, llm: llmReturning({ stage: 'final', reasoning: 'x', subject: 's', body: 'b' }) });
  assert.equal(d.source, 'fallback');
  assert.equal(d.stage, 'friendly');
  assert.match(d.fallbackReason, /disallowed stage/);
});

test('LLM writing money amounts is rejected', async () => {
  const d = await decide({ invoice, asOf, llm: llmReturning({ stage: 'firm', reasoning: 'r', subject: 's', body: 'Please pay $1200.00 now' }) });
  assert.equal(d.source, 'fallback');
  assert.match(d.fallbackReason, /money/);
});

test('invalid JSON falls back', async () => {
  const d = await decide({ invoice, asOf, llm: llmReturning('sorry I cannot') });
  assert.equal(d.source, 'fallback');
});

test('LLM throwing falls back', async () => {
  const d = await decide({ invoice, asOf, llm: async () => { throw new Error('network down'); } });
  assert.equal(d.source, 'fallback');
  assert.equal(d.requiresApproval, true);
});

test('split_offer fills the plan from code, not the LLM', async () => {
  const d = await decide({ invoice, asOf, llm: llmReturning('```json\n' + JSON.stringify({ stage: 'split_offer', reasoning: 'r', subject: 'Plan', body: 'Hi {{clientName}}\n{{splitPlan}}' }) + '\n```') });
  assert.equal(d.stage, 'split_offer');
  assert.equal(d.source, 'llm');
  assert.equal(d.splitPlan.installments.length, 3);
  assert.ok(d.draft.body.includes('USD 400.00 by 2026-11-17'));
});

test('split_offer without placeholder is rejected', async () => {
  const d = await decide({ invoice, asOf, llm: llmReturning({ stage: 'split_offer', reasoning: 'r', subject: 's', body: 'pay in parts' }) });
  assert.equal(d.source, 'fallback');
});
