import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import InvoiceCard from './InvoiceCard.jsx';
import { engineLabel, viaLabel } from './labels.js';
import { Count, Icon, Logo, Money, Pipeline, Skeleton } from './Ui.jsx';

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

  const outstanding = rows.filter((r) => !isClosed(r) && r.decision).reduce((s, r) => s + (parseFloat(r.decision.amountDue) || 0), 0);
  const overdueCount = rows.filter((r) => !isClosed(r) && r.decision?.daysOverdue > 0).length;
  const currency = rows.find((r) => r.decision)?.decision.currency || 'USD';
  const cardProps = { asOf, config, onChange: () => load(asOf), onNotice: setNotice };
  const firstLoad = rows.length === 0 && !error && (loading || !config);

  return (
    <>
      {loading && <div className="loading-bar" role="progressbar" aria-label="Agent is working" />}

      <div className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <Logo />
            <div>
              <h1>Nudge</h1>
              <small>Invoice reminders, human approved</small>
            </div>
          </div>
          {config && (
            <div className="chips">
              <span className="chip"><span className="live-dot" />Live</span>
              <span className="chip strong">PayPal: {engineLabel(config.paypalEngine, config.paypalMode)}</span>
              <span className="chip"><Icon.Sparkle width={13} height={13} />AI: {config.llmProvider}</span>
            </div>
          )}
        </div>
      </div>

      <div className="page" aria-busy={loading}>
        <section className="hero" aria-label="Summary">
          <span className="hero-eyebrow"><Icon.Bolt width={15} height={15} /> Agentic invoice collections</span>
          <h2>Get paid faster without the <em>awkward</em> follow-ups.</h2>
          <p>An AI agent drafts the reminder. You approve it. PayPal sends it. Nothing goes out without you.</p>
          <div className="stats">
            <div className="stat"><span>Outstanding</span><b><Money value={outstanding} currency={currency} /></b></div>
            <div className="stat"><span>Overdue invoices</span><b><Count value={overdueCount} /></b></div>
            <div className="stat"><span>Awaiting your decision</span><b><Count value={needs.length} /></b></div>
          </div>
        </section>

        <Pipeline loading={loading} pending={needs.length} />

        <section className="demo-date" aria-label="Demo date">
          <div className="demo-head">
            <h3><Icon.Calendar width={17} height={17} /> Time travel (demo date)</h3>
            <label className="date-input">
              <span className="small">Pretend today is</span>
              <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </label>
          </div>
          <div className="row">
            <button className="seg" onClick={() => asOf && setAsOf(addDays(asOf, 3))}>+3 days</button>
            <button className="seg" onClick={() => asOf && setAsOf(addDays(asOf, 7))}>+7 days</button>
            <button className="seg" onClick={() => asOf && setAsOf(addDays(asOf, 14))}>+14 days</button>
            {config && config.suggestedDemoDate !== config.defaultAsOf && (
              <button className="seg demo" onClick={() => setAsOf(config.suggestedDemoDate)}>Demo day (+21)</button>
            )}
            {config && <button className="seg" onClick={() => setAsOf(config.defaultAsOf)}>Reset</button>}
            <button className="seg rerun" onClick={() => load(asOf, true)} disabled={loading}>
              <Icon.Refresh width={15} height={15} className={loading ? 'spin' : ''} />{loading ? 'Agent is thinking…' : 'Re-run agent'}
            </button>
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
        {!loading && !error && rows.length === 0 && config?.paypalMode === 'sandbox' && (
          <p className="muted">No invoices found in your PayPal sandbox yet. In the server folder run <code>npm run seed:sandbox</code>, then reload.</p>
        )}

        <Section loading={loading} firstLoad={firstLoad} title="Needs your decision" count={needs.length} empty="Nothing needs a nudge on this date.">
          {needs.map((r, i) => <InvoiceCard key={r.invoice.id} row={r} index={i} {...cardProps} />)}
        </Section>

        <Section loading={loading} title="Waiting" count={waiting.length} empty="No invoices waiting.">
          {waiting.map((r, i) => <InvoiceCard key={r.invoice.id} row={r} index={i} {...cardProps} />)}
        </Section>

        <Section loading={loading} title="Closed" count={closed.length} empty="No paid invoices yet.">
          {closed.map((r, i) => <InvoiceCard key={r.invoice.id} row={r} index={i} {...cardProps} />)}
        </Section>

        <div className="two-col">
          <section className="panel">
            <h2><Icon.Clock width={16} height={16} /> Activity</h2>
            {audit.length === 0 ? <p className="muted small">Nothing yet.</p> : (
              <ul>
                {audit.slice(0, 8).map((a, i) => (
                  <li key={i} style={{ '--i': i }}>
                    <span className={`dot ${a.action}`} />
                    <span>
                      <time>{new Date(a.at).toLocaleTimeString()}</time>{' '}
                      {a.action === 'approved' && <>Approved a <b>{a.stage.replace('_', ' ')}</b> for {a.clientName}{a.edited ? ' (edited by you)' : ''}</>}
                      {a.action === 'rejected' && <>Rejected the <b>{a.stage.replace('_', ' ')}</b> for {a.clientName}</>}
                      {a.action === 'webhook' && <>PayPal event <code>{a.detail}</code></>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel paypal-panel">
            <h2><Icon.Bolt width={16} height={16} /> PayPal tool calls <span className="count">{engineLabel(pp.engine, config?.paypalMode)}</span></h2>
            {pp.entries.length === 0 ? <p className="muted small">No PayPal calls yet. Approve a draft or load invoices.</p> : (
              <ul>
                {pp.entries.slice(0, 8).map((e, i) => (
                  <li key={i} style={{ '--i': i }}>
                    <span className={`dot ${e.ok ? 'ok' : 'bad'}`} />
                    <span>
                      <time>{new Date(e.at).toLocaleTimeString()}</time>{' '}
                      <span className={`via ${e.via}`}>{viaLabel(e.via)}</span>{' '}
                      <code>{e.tool}</code>{' '}
                      <span className={e.ok ? 'ok' : 'bad'}>{e.ok ? 'ok' : 'failed'}</span>{' '}
                      <span className="muted small">{e.ms} ms{e.error ? ` · ${e.error}` : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <p className="foot"><b>Rules</b> decide what is allowed · <b>AI</b> chooses and explains · <b>You</b> approve · <b>PayPal</b> sends</p>

        {toast && <div className="toast" role="status" key={toast}>{toast}</div>}
      </div>
    </>
  );
}

function Section({ title, count, empty, loading, firstLoad, children }) {
  return (
    <section className="section">
      <h2>{title} <span className="count"><Count value={count} /></span></h2>
      {firstLoad ? <div className="cards"><Skeleton /><Skeleton /></div>
        : count === 0 ? <p className="empty">{empty}</p>
        : <div className={`cards${loading ? ' stale' : ''}`}>{children}</div>}
    </section>
  );
}
