import { createMockPayPal } from './mock.js';
import { createSandboxPayPal } from './sandbox.js';

export function createPayPal(mode = process.env.PAYPAL_MODE || 'mock') {
  if (mode === 'sandbox') {
    return createSandboxPayPal({
      clientId: process.env.PAYPAL_CLIENT_ID,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET,
      webhookId: process.env.PAYPAL_WEBHOOK_ID,
      allowUnverified: process.env.ALLOW_UNVERIFIED_WEBHOOKS === '1'
    });
  }
  if (mode === 'mock') return createMockPayPal();
  throw new Error(`Unknown PAYPAL_MODE: ${mode}`);
}
