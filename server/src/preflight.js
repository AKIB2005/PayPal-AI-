import { readFileSync } from 'node:fs';
import { createSandboxPayPal } from './paypal/sandbox.js';
import { createToolkitPayPal } from './paypal/toolkit.js';
import { decide } from './agent/decide.js';

const SAMPLE = JSON.parse(readFileSync(new URL('./data/sampleInvoices.json', import.meta.url)));
const statusOf = (e) => { const m = String(e.message).match(/(?:->|\()\s*(\d{3})/); return m ? Number(m[1]) : null; };

// Checks that PayPal and the AI are configured correctly and says what to fix. Safe: only reads from PayPal.
export async function runPreflight({ env = process.env, fetchImpl = fetch, llm, base, apiFactory } = {}) {
  const checks = [];
  const add = (name, status, detail, fix = '') => checks.push({ name, status, detail, fix });
  const mode = env.PAYPAL_MODE || 'mock';
  const provider = env.LLM_PROVIDER || 'mock';
  add('Settings', 'pass', `PAYPAL_MODE=${mode}, LLM_PROVIDER=${provider}`);

  // ---- PayPal ----
  const unreachable = (e) => e?.name === 'TypeError' || /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|NO_RESPONSE/i.test(String(e?.message));
  if (mode !== 'sandbox' && mode !== 'sandbox-rest') {
    add('PayPal sandbox', 'skip', 'Running in mock mode.', 'Set PAYPAL_MODE=sandbox in server/.env to test the real API.');
  } else {
    const missing = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'].filter((k) => !env[k]);
    if (missing.length) {
      add('PayPal credentials', 'fail', `Missing ${missing.join(', ')}`, 'Copy the Sandbox Client ID and Secret from developer.paypal.com (Apps & Credentials) into server/.env.');
    } else {
      const rest = createSandboxPayPal({
        clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET, webhookId: env.PAYPAL_WEBHOOK_ID, fetchImpl, ...(base ? { base } : {})
      });
      let loggedIn = false;
      try {
        await rest.token();
        add('PayPal login', 'pass', 'Sandbox credentials accepted.');
        loggedIn = true;
      } catch (e) {
        if (unreachable(e)) add('PayPal login', 'fail', `Cannot reach PayPal: ${e.message.slice(0, 100)}`, 'Check your internet connection, VPN or firewall, then run again.');
        else add('PayPal login', 'fail', e.message.slice(0, 140), 'Wrong Client ID/Secret, or live keys used instead of Sandbox keys. Re-copy both from the Sandbox tab.');
      }
      if (loggedIn) {
        const engine = mode === 'sandbox' ? 'PayPal Agent Toolkit (list_invoices)' : 'REST';
        try {
          const usable = mode === 'sandbox' ? await createToolkitPayPal({ rest, apiFactory }).listInvoices() : await rest.listInvoices();
          if (usable.length > 0) add('PayPal invoices', 'pass', `${usable.length} usable invoice(s) via ${engine}.`);
          else add('PayPal invoices', 'warn', `Connected via ${engine}, but no usable invoices yet.`, 'Run: npm run seed:sandbox');
        } catch (e) {
          const st = e.status ?? statusOf(e);
          if (unreachable(e)) add('PayPal invoices', 'fail', `Cannot reach PayPal: ${e.message.slice(0, 100)}`, 'Check your internet connection, VPN or firewall, then run again.');
          else if (st === 403) add('PayPal invoices', 'fail', e.message.slice(0, 160), "Access denied. Check the REST app's features/permissions for Invoicing, and that it was created under the sandbox business account you expect.");
          else add('PayPal invoices', 'fail', e.message.slice(0, 160), 'Paste this exact message to get a quick fix. If it only fails in toolkit mode, PAYPAL_MODE=sandbox-rest is a working fallback.');
        }
      }
      if (!env.PAYPAL_TEST_PAYER_EMAIL) add('Seed payer email', 'warn', 'PAYPAL_TEST_PAYER_EMAIL is not set.', 'Set it to your sandbox personal account email before running seed:sandbox.');
      if (!env.PAYPAL_WEBHOOK_ID) {
        add('Webhook', 'warn', 'PAYPAL_WEBHOOK_ID not set. Real webhooks will be rejected (fails closed).', 'Register https://YOUR-HOST/api/webhooks/paypal in the dashboard and paste its webhook id. The demo "client pays" button works without it.');
      } else if (loggedIn) {
        try {
          const w = await rest.api('GET', '/v1/notifications/webhooks');
          const hit = (w.webhooks || []).find((x) => x.id === env.PAYPAL_WEBHOOK_ID);
          if (hit) add('Webhook', 'pass', `Registered for ${hit.url}`);
          else add('Webhook', 'warn', 'That webhook id was not found for this app.', 'Webhooks only fire for the app that created them. Check the id and the app.');
        } catch (e) {
          add('Webhook', 'warn', `Could not list webhooks: ${e.message.slice(0, 100)}`, 'Not blocking. Verify in the dashboard.');
        }
      }
    }
  }

  // ---- AI ----
  if (provider === 'mock') {
    add('AI model', 'skip', 'Using the offline mock AI.', 'Set LLM_PROVIDER=claude (or gemini) plus its key to test a real model.');
  } else {
    const keyVar = provider === 'claude' ? 'ANTHROPIC_API_KEY' : provider === 'gemini' ? 'GEMINI_API_KEY' : null;
    if (!keyVar) add('AI model', 'fail', `Unknown LLM_PROVIDER: ${provider}`, 'Use mock, claude or gemini.');
    else if (!env[keyVar]) add('AI model', 'fail', `${keyVar} is not set.`, `Add ${keyVar} to server/.env.`);
    else {
      for (const id of ['INV-2002', 'INV-2003']) {
        const invoice = SAMPLE.invoices.find((i) => i.id === id);
        try {
          const d = await decide({ invoice, history: {}, asOf: SAMPLE.asOf, provider, llm });
          if (d.source === 'llm') add(`AI decision ${id}`, 'pass', `Model chose "${d.stage}" (allowed: ${d.allowedStages.join(', ')}).`);
          else add(`AI decision ${id}`, 'warn', `Fell back to templates: ${d.fallbackReason}`, 'If this says HTTP 401/404, check the key and model name (ANTHROPIC_MODEL / GEMINI_MODEL). If it says money/placeholder, the model broke a drafting rule; re-run once.');
        } catch (e) {
          add(`AI decision ${id}`, 'fail', e.message.slice(0, 140));
        }
      }
    }
  }
  return { checks, ok: !checks.some((c) => c.status === 'fail') };
}

export function formatPreflight({ checks, ok }) {
  const tag = { pass: '[PASS]', warn: '[WARN]', fail: '[FAIL]', skip: '[SKIP]' };
  const lines = checks.map((c) => `${tag[c.status]} ${c.name}: ${c.detail}${c.fix && c.status !== 'pass' ? `\n       Fix: ${c.fix}` : ''}`);
  lines.push('', ok ? 'No blocking problems found.' : 'Blocking problems found. Fix the [FAIL] lines and run again.');
  return lines.join('\n');
}
