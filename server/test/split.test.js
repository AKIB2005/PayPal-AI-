import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSplitPlan, toMinor } from '../src/agent/split.js';

const cfg = { installments: 3, firstDueInDays: 7, gapDays: 14 };

test('split sums exactly to total, remainder on first', () => {
  const p = buildSplitPlan({ amountDue: '100.00', currency: 'USD', asOf: '2026-11-10', config: cfg });
  assert.deepEqual(p.installments.map((i) => i.amount), ['33.34', '33.33', '33.33']);
  assert.equal(p.installments.reduce((s, i) => s + toMinor(i.amount), 0), 10000);
  assert.equal(p.minimumAmountDue, '33.34');
});
test('split dates are spaced', () => {
  const p = buildSplitPlan({ amountDue: '900.00', currency: 'USD', asOf: '2026-11-10', config: cfg });
  assert.deepEqual(p.installments.map((i) => i.dueDate), ['2026-11-17', '2026-12-01', '2026-12-15']);
});
