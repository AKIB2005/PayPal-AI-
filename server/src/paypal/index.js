import { createMockPayPal } from './mock.js';
import { createSandboxPayPal } from './sandbox.js';
import { createToolkitPayPal } from './toolkit.js';

// PAYPAL_MODE:
//   mock          offline stand-in, no keys
//   sandbox       real PayPal sandbox, driven by the official PayPal Agent Toolkit (default for real runs)
//   sandbox-rest  real PayPal sandbox over plain REST only (escape hatch if the toolkit misbehaves)
export function createPayPal(mode = process.env.PAYPAL_MODE || 'mock', overrides = {}) {
  if (mode === 'mock') return createMockPayPal();
  if (mode === 'sandbox' || mode === 'sandbox-rest') {
    const rest = createSandboxPayPal({
      clientId: process.env.PAYPAL_CLIENT_ID,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET,
      webhookId: process.env.PAYPAL_WEBHOOK_ID,
      allowUnverified: process.env.ALLOW_UNVERIFIED_WEBHOOKS === '1',
      ...overrides.rest
    });
    if (mode === 'sandbox-rest') return rest;
    return createToolkitPayPal({ rest, apiFactory: overrides.apiFactory });
  }
  throw new Error(`Unknown PAYPAL_MODE: ${mode} (use mock, sandbox or sandbox-rest)`);
}
