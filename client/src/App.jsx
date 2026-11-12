import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import InvoiceCard from './InvoiceCard.jsx';
import { engineLabel, viaLabel } from './labels.js';

const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const CLOSED = ['PAID', 'MARKED_AS_PAID', 'CANCELLED', 'REFUNDED', 'MARKED_AS_REFUNDED'];

export default function App() {
  const [config, setConfig] = useState(null);
  const [asOf, setAsOf] = useState('');
  const [rows, setRows] = useState([]);
  const [audit, setAudit] = useState([]);
  const [pp, setPp] = useState({ engine: '', entries: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [notice, setNotice] = useState('');
  const asOfRef = useRef('');
  asOfRef.current = asOf;

  const load = useCallback(async (date, refresh = false) => {
    if (!date) return;
    setLoading(true);
    setError('');
    try {
      const [inv, au, act] = await Promise.all([api.invoices(date, refresh), api.audit(), api.paypalActivity().catch(() => ({ engine: '', entries: [] }))]);
      setRows(inv.rows);
      setAudit(au.entries);
      setPp(act);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.config().then((c) => { setConfig(c); setAsOf(c.defaultAsOf); }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(asOf); }, [asOf, load]);

  // Live updates: a PayPal webhook (or the demo button) pushes changes here.
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('invoice-updated', (e) => {
      const d = JSON.parse(e.data);
      if (d.reason === 'webhook') setToast(`PayPal event received: ${d.eventType || 'invoice updated'}`);
      load(asOfRef.current);
    });
    return () => es.close();
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const isClosed = (r) => CLOSED.includes(r.invoice.status);
  const needs = rows.filter((r) => !isClosed(r) && r.decision && r.decision.stage !== 'wait' && !r.rejected);
  const waiting = rows.filter((r) => !isClosed(r) && (!r.decision || r.decision.stage === 'wait' || r.rejected));
  const closed = rows.filter(isClosed);

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>Nudge</h1>
          <p className="sub">An AI agent drafts the reminder. You approve it. PayPal sends it.</p>
        </div>
        {config && (
          <div className="chips">
            <span className="chip strong">PayPal: {engineLabel(config.paypalEngine, config.paypalMode)}</span>
            <span className="chip">AI: {config.llmProvider}</span>
          </div>
        )}
      </header>

      <section className="demo-date" aria-label="Demo date">
        <label>
          Demo date (pretend today is)
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
        <div className="row">
          <button className="ghost" onClick={() => asOf && setAsOf(addDays(asOf, 3))}>+3 days</button>
          <button className="ghost" onClick={() => asOf && setAsOf(addDays(asOf, 7))}>+7 days</button>
          <button className="ghost" onClick={() => asOf && setAsOf(addDays(asOf, 14))}>+14 days</button>
          {config && config.suggestedDemoDate !== config.defaultAsOf && (
            <button className="ghost" onClick={() => setAsOf(config.suggestedDemoDate)}>Demo day (+21)</button>
          )}
          {config && <button className="ghost" onClick={() => setAsOf(config.defaultAsOf)}>Reset</button>}
          <button className="ghost" onClick={() => load(asOf, true)} disabled={loading}>Re-run agent</button>
        </div>
        <p className="note">Sandbox invoices can't be created in the past, so this date is simulated for the demo.</p>
      </section>

      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button className="link" onClick={() => setNotice('')} aria-label="Dismiss">Dismiss</button>
        </div>
      )}
      {error && <div className="error" role="alert">{error}</div>}
      {loading && rows.length === 0 && <p className="muted">Asking the agent…</p>}
      {!loading && !error && rows.length === 0 && config?.paypalMode === 'sandbox' && (
        <p className="muted">No invoices found in your PayPal sandbox yet. In the server folder run <code>npm run seed:sandbox</code>, then reload.</p>
      )}

      <Section title="Needs your decision" count={needs.length} empty="Nothing needs a nudge on this date.">
        {needs.map((r) => <InvoiceCard key={r.invoice.id} row={r} asOf={asOf} config={config} onChange={() => load(asOf)} onNotice={setNotice} />)}
      </Section>

      <Section title="Waiting" count={waiting.length} empty="No invoices waiting.">
        {waiting.map((r) => <InvoiceCard key={r.invoice.id} row={r} asOf={asOf} config={config} onChange={() => load(asOf)} onNotice={setNotice} />)}
      </Section>

      <Section title="Closed" count={closed.length} empty="No paid invoices yet.">
        {closed.map((r) => <InvoiceCard key={r.invoice.id} row={r} asOf={asOf} config={config} onChange={() => load(asOf)} onNotice={setNotice} />)}
      </Section>

      <section className="activity">
        <h2>Activity</h2>
        {audit.length === 0 ? <p className="muted">Nothing yet.</p> : (
          <ul>
            {audit.slice(0, 8).map((a, i) => (
              <li key={i}>
                <time>{new Date(a.at).toLocaleTimeString()}</time>{' '}
                {a.action === 'approved' && <>Approved a <b>{a.stage.replace('_', ' ')}</b> for {a.clientName}{a.edited ? ' (edited by you)' : ''}</>}
                {a.action === 'rejected' && <>Rejected the <b>{a.stage.replace('_', ' ')}</b> for {a.clientName}</>}
                {a.action === 'webhook' && <>PayPal event <code>{a.detail}</code></>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="activity paypal">
        <h2>PayPal tool calls <span className="count">{engineLabel(pp.engine, config?.paypalMode)}</span></h2>
        {pp.entries.length === 0 ? <p className="muted">No PayPal calls yet. Approve a draft or load invoices.</p> : (
          <ul>
            {pp.entries.slice(0, 8).map((e, i) => (
              <li key={i}>
                <time>{new Date(e.at).toLocaleTimeString()}</time>{' '}
                <span className={`via ${e.via}`}>{viaLabel(e.via)}</span>{' '}
                <code>{e.tool}</code>{' '}
                <span className={e.ok ? 'ok' : 'bad'}>{e.ok ? 'ok' : 'failed'}</span>{' '}
                <span className="muted small">{e.ms} ms{e.error ? ` · ${e.error}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Section({ title, count, empty, children }) {
  return (
    <section className="section">
      <h2>{title} <span className="count">{count}</span></h2>
      {count === 0 ? <p className="muted">{empty}</p> : <div className="cards">{children}</div>}
    </section>
  );
}
