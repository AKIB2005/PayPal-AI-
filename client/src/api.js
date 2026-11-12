async function request(method, path, body) {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export const api = {
  config: () => request('GET', '/api/config'),
  invoices: (asOf, refresh = false) => request('GET', `/api/invoices?asOf=${asOf}${refresh ? '&refresh=1' : ''}`),
  approve: (id, payload) => request('POST', `/api/invoices/${encodeURIComponent(id)}/approve`, payload),
  reject: (id, asOf) => request('POST', `/api/invoices/${encodeURIComponent(id)}/reject`, { asOf }),
  pay: (id) => request('POST', `/api/demo/pay/${encodeURIComponent(id)}`),
  audit: () => request('GET', '/api/audit'),
  paypalActivity: () => request('GET', '/api/paypal/activity')
};
