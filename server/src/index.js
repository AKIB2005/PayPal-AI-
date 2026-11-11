import { loadEnv } from './env.js';
loadEnv();
const { createApp } = await import('./app.js');
const { createPayPal } = await import('./paypal/index.js');

const paypal = createPayPal();
const provider = process.env.LLM_PROVIDER || 'mock';
const { app } = createApp({ paypal, provider, demoTools: process.env.DEMO_TOOLS !== 'off' });
const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`Nudge server on :${port} | PayPal: ${paypal.mode} | AI: ${provider}`));
