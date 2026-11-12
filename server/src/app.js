import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HttpError } from './errors.js';
import { addDays } from './agent/dates.js';
import { createService } from './service.js';
import { createHub } from './events.js';
import { createStore } from './store.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function createApp({ paypal, provider = 'mock', llm, now, store = createStore(), demoTools = true, clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url)) }) {
  for (const [id, r] of Object.entries(paypal.seedReminders || {})) if (!store.reminders.has(id)) store.reminders.set(id, r);
  const hub = createHub();
  const service = createService({ paypal, store, hub, provider, llm, now });
  const today = () => new Date().toISOString().slice(0, 10);
  const defaultAsOf = () => process.env.DEMO_DATE || paypal.defaultAsOf || today();
  const asOfOf = (v) => {
    const a = v || defaultAsOf();
    if (!DATE.test(a) || Number.isNaN(Date.parse(a))) throw new HttpError(400, 'asOf must be YYYY-MM-DD');
    return a;
  };
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // Sandbox invoices are seeded with due dates up to ~19 days ahead, so today + 21 days shows the full range.
  const suggestedDemoDate = () => (paypal.mode === 'sandbox' ? addDays(today(), 21) : defaultAsOf());
  app.get('/api/config', (req, res) => res.json({
    paypalMode: paypal.mode, paypalEngine: paypal.engine || paypal.mode, llmProvider: provider,
    defaultAsOf: defaultAsOf(), suggestedDemoDate: suggestedDemoDate(), today: today(), demoTools
  }));

  app.get('/api/invoices', wrap(async (req, res) => {
    const asOf = asOfOf(req.query.asOf);
    res.json({ asOf, rows: await service.list({ asOf, refresh: req.query.refresh === '1' }) });
  }));

  app.post('/api/invoices/:id/approve', wrap(async (req, res) => {
    const { subject, body, asOf } = req.body || {};
    res.json(await service.approve({ invoiceId: req.params.id, asOf: asOfOf(asOf), subject, body }));
  }));

  app.post('/api/invoices/:id/reject', wrap(async (req, res) => {
    res.json(await service.reject({ invoiceId: req.params.id, asOf: asOfOf(req.body?.asOf) }));
  }));

  // PayPal webhook receiver. Signature is verified with PayPal before we trust anything.
  app.post('/api/webhooks/paypal', wrap(async (req, res) => {
    const ok = await paypal.verifyWebhook(req.headers, req.body);
    if (!ok) throw new HttpError(401, 'Webhook signature could not be verified');
    res.json(service.handleWebhook(req.body));
  }));

  if (demoTools) {
    app.post('/api/demo/pay/:id', wrap(async (req, res) => {
      res.json(await service.simulatePayment({ invoiceId: req.params.id, amount: req.body?.amount }));
    }));
  }

  // Which PayPal tool ran, when, and whether it worked (Agent Toolkit calls vs plain REST).
  app.get('/api/paypal/activity', (req, res) => res.json({ engine: paypal.engine || paypal.mode, entries: paypal.activity ? paypal.activity() : [] }));

  app.get('/api/audit', (req, res) => res.json({ entries: store.audit }));

  app.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write('event: hello\ndata: {}\n\n');
    hub.add(res);
  });

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(`${clientDist}/index.html`));
  }

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? `Server error: ${err.message}` : err.message });
  });

  return { app, store, service, hub };
}
