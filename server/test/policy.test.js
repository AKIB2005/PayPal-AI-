import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePolicy, defaultStage } from '../src/agent/policy.js';

const inv = (o = {}) => ({ id: 'I1', status: 'SENT', amount: { currency: 'USD', value: '500.00' }, dueDate: '2026-11-08', remindersSent: [], ...o });
const run = (o, h, asOf = '2026-11-10') => evaluatePolicy({ invoice: inv(o), history: h, asOf });

test('not overdue -> wait', () => {
  assert.deepEqual(run({ dueDate: '2026-11-20' }).allowedStages, ['wait']);
});
test('2 days overdue -> friendly only', () => {
  assert.deepEqual(run({}).allowedStages, ['friendly']);
});
test('paid invoice -> wait', () => {
  assert.deepEqual(run({ status: 'PAID' }).allowedStages, ['wait']);
});
test('final notice blocked with no earlier reminder', () => {
  const p = run({ dueDate: '2026-10-20' }); // 21 days
  assert.ok(!p.allowedStages.includes('final'));
  assert.ok(p.allowedStages.includes('split_offer'));
});
test('final allowed after a reminder, cannot go softer than firm', () => {
  const p = run({ dueDate: '2026-10-20', remindersSent: [{ sentAt: '2026-10-30T09:00:00Z', stage: 'firm' }] });
  assert.ok(p.allowedStages.includes('final'));
  assert.ok(!p.allowedStages.includes('friendly'));
});
test('cooldown blocks a reminder sent yesterday', () => {
  const p = run({ dueDate: '2026-10-20', remindersSent: [{ sentAt: '2026-11-09T09:00:00Z', stage: 'friendly' }] });
  assert.deepEqual(p.allowedStages, ['wait']);
});
test('split blocked below minimum amount', () => {
  const p = run({ dueDate: '2026-10-20', amount: { currency: 'USD', value: '60.00' } });
  assert.ok(!p.allowedStages.includes('split_offer'));
});
test('partial payment reduces amount due', () => {
  assert.equal(run({ paidAmount: '200.00' }).amountDue, '300.00');
});
test('max reminders hands over to human', () => {
  const r = Array.from({ length: 5 }, (_, i) => ({ sentAt: `2026-10-0${i + 1}T09:00:00Z`, stage: 'firm' }));
  assert.deepEqual(run({ dueDate: '2026-09-01', remindersSent: r }).allowedStages, ['wait']);
});
test('reliable client defaults to gentlest stage', () => {
  const p = run({ dueDate: '2026-11-01' }, { invoicesPaid: 6, lateCount: 1, avgDaysLate: 4 });
  assert.equal(defaultStage(p), 'friendly');
});
test('bad invoice throws', () => {
  assert.throws(() => evaluatePolicy({ invoice: { id: 'x' }, asOf: '2026-11-10' }));
});
