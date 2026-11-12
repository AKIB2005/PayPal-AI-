import { loadEnv } from './env.js';
loadEnv();
const { createApp } = await import('./app.js');
const { createPayPal } = await import('./paypal/index.js');
const { callLLM } = await import('./agent/llm.js');
const { withBudget } = await import('./budget.js');

const paypal = createPayPal();
const provider = process.env.LLM_PROVIDER || 'mock';
// Real models cost money and a hosted demo URL is public: cap AI calls per hour (LLM_MAX_CALLS_PER_HOUR, default 120).
const llm = provider === 'mock' ? callLLM : withBudget(callLLM, { max: Number(process.env.LLM_MAX_CALLS_PER_HOUR) || 120 });
const { app, hub } = createApp({ paypal, provider, llm, demoTools: process.env.DEMO_TOOLS !== 'off' });
const port = Number(process.env.PORT) || 3001;
const server = app.listen(port, () => console.log(`Nudge server on :${port} | PayPal: ${paypal.mode} (${paypal.engine}) | AI: ${provider}`));

// Hosts like Render send SIGTERM on redeploy: close cleanly (SSE connections would otherwise keep us alive).
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { hub.closeAll(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
}
