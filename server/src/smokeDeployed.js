// Read-only checks against a RUNNING Nudge server (local or on Render). Never approves or sends anything.
export async function runDeployedSmoke(baseUrl, fetchImpl = fetch) {
  const url = (p) => baseUrl.replace(/\/+$/, '') + p;
  const checks = [];
  const add = (name, status, detail, fix = '') => checks.push({ name, status, detail, fix });
  const get = async (p, opts) => {
    const res = await fetchImpl(url(p), { signal: AbortSignal.timeout(60000), ...opts });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* html or empty */ }
    return { status: res.status, text, json };
  };

  let config = null;
  try {
    const h = await get('/healthz');
    if (h.status === 200 && h.json?.ok) add('Health check', 'pass', '/healthz is ok');
    else add('Health check', 'fail', `/healthz returned ${h.status}`, 'The server is not running or the URL is wrong. On Render the first request after idle can take about a minute: wait and retry.');
  } catch (e) {
    add('Health check', 'fail', `Cannot reach ${baseUrl}: ${e.message.slice(0, 100)}`, 'Check the URL. A sleeping free Render instance can take about a minute to wake: retry once.');
    return { checks, ok: false };
  }

  try {
    const page = await get('/');
    if (page.status === 200 && page.text.includes('id="root"')) add('Dashboard page', 'pass', 'The React app is being served.');
    else add('Dashboard page', 'fail', `GET / returned ${page.status} without the app`, 'The client was not built. The Render build command must run: npm --prefix client run build.');
  } catch (e) { add('Dashboard page', 'fail', e.message.slice(0, 100)); }

  try {
    const c = await get('/api/config');
    config = c.json;
    add('Config', 'pass', `PayPal ${config.paypalMode}${config.paypalEngine ? ` (${config.paypalEngine})` : ''}, AI ${config.llmProvider}, demo tools ${config.demoTools ? 'on' : 'off'}`);
    if (config.paypalMode === 'mock') add('PayPal mode', 'warn', 'The server is still in mock mode.', 'In the Render dashboard set PAYPAL_MODE=sandbox (and your keys), then redeploy.');
    if (config.llmProvider === 'mock') add('AI mode', 'warn', 'The server is using the offline mock AI.', 'Set LLM_PROVIDER=claude (or gemini) plus its key.');
  } catch (e) { add('Config', 'fail', e.message.slice(0, 100)); }

  try {
    const inv = await get(`/api/invoices${config?.suggestedDemoDate ? `?asOf=${config.suggestedDemoDate}` : ''}`);
    if (inv.status !== 200) {
      add('Invoices + agent', 'fail', `GET /api/invoices returned ${inv.status}: ${String(inv.json?.error || inv.text).slice(0, 160)}`, 'Run npm run preflight locally with the same environment variables to find the cause.');
    } else {
      const rows = inv.json.rows || [];
      const ungated = rows.filter((r) => r.decision && r.decision.requiresApproval !== true);
      const fallbacks = rows.filter((r) => r.decision?.source === 'fallback');
      if (rows.length === 0) add('Invoices + agent', 'warn', 'The server works but returned no invoices.', 'In sandbox mode run: npm run seed:sandbox');
      else if (ungated.length) add('Invoices + agent', 'fail', 'A decision did not require approval.', 'This should never happen. Do not demo; investigate.');
      else add('Invoices + agent', 'pass', `${rows.length} invoice(s); every decision requires approval.`);
      if (fallbacks.length) add('AI drafts', 'warn', `${fallbacks.length} draft(s) used the template fallback: ${fallbacks[0].decision.fallbackReason}`, 'Check the AI key, model name and LLM_MAX_CALLS_PER_HOUR.');
    }
  } catch (e) { add('Invoices + agent', 'fail', e.message.slice(0, 120)); }

  try {
    const w = await get('/api/webhooks/paypal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'smoke', event_type: 'SMOKE.TEST' }) });
    if (config?.paypalMode === 'sandbox') {
      if (w.status === 401) add('Webhook safety', 'pass', 'An unsigned webhook is rejected (401).');
      else add('Webhook safety', 'fail', `An unsigned webhook returned ${w.status}, expected 401.`, 'Do not leave ALLOW_UNVERIFIED_WEBHOOKS on in a hosted deployment.');
    } else {
      add('Webhook safety', 'skip', 'Mock mode accepts local events by design.');
    }
  } catch (e) { add('Webhook safety', 'warn', e.message.slice(0, 100)); }

  try {
    const a = await get('/api/paypal/activity');
    const n = a.json?.entries?.length ?? 0;
    add('PayPal activity log', n > 0 ? 'pass' : 'warn', n > 0 ? `${n} PayPal call(s) recorded (latest: ${a.json.entries[0].tool}).` : 'No PayPal calls recorded yet.', n > 0 ? '' : 'Expected after loading invoices; check the invoices step above.');
  } catch (e) { add('PayPal activity log', 'warn', e.message.slice(0, 100)); }

  return { checks, ok: !checks.some((c) => c.status === 'fail') };
}
